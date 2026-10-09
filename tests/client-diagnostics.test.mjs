import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createClientReporter, diagnosticRoute, parseClientDiagnostic, installClientDiagnostics, reportClientError } from "../lib/clientDiagnostics.ts";

const context = { route: "stock", entryRoute: "search", online: true, mobile: true, serviceWorker: true };

test("React 418 診斷不傳原始錯誤、堆疊、股票代號或網址", () => {
  const sent = [];
  const report = createClientReporter(() => context, (value) => sent.push(value));
  report("runtime", new Error("Minified React error #418; https://react.dev/errors/418?args[]=SECRET 私人文字"));
  assert.deepEqual(sent, [{ schema: 1, ...context, kind: "hydration", code: "418", digest: null }]);
  assert.doesNotMatch(JSON.stringify(sent), /SECRET|私人|https|stack/);
  assert.equal(diagnosticRoute("/stock/2330?token=SECRET"), "stock");
  assert.equal(diagnosticRoute("/private/SECRET"), "other");
});

test("跨視窗原生 Error 仍辨認 React 418，敏感原文不回報", () => {
  const sent = [];
  const report = createClientReporter(() => context, (value) => sent.push(value));
  const foreignError = runInNewContext("new Error('Minified React error #418; SECRET')");
  assert.equal(foreignError instanceof Error, false);
  report("runtime", foreignError);
  assert.equal(sent[0].kind, "hydration");
  assert.equal(sent[0].code, "418");
  assert.doesNotMatch(JSON.stringify(sent), /SECRET/);
});

test("同種診斷去重，單頁最多五種，網路與非 Error 例外不影響頁面", () => {
  let count = 0;
  const report = createClientReporter(() => context, () => { count++; throw new Error("離線"); });
  assert.doesNotThrow(() => {
    report("runtime", "SECRET");
    report("runtime", "SECRET");
    report("promise", new Error("API SECRET"));
    report("render", Object.assign(new Error("伺服器 SECRET"), { digest: "123456" }));
    for (let i = 0; i < 20; i++) report("render", Object.assign(new Error("SECRET"), { digest: String(i) }));
  });
  assert.equal(count, 5);
});

test("診斷契約只接受固定欄位分類，未知內容不寫入日誌", () => {
  const payload = { schema: 1, ...context, kind: "render", code: null, digest: "12345" };
  assert.deepEqual(parseClientDiagnostic({ ...payload, message: "SECRET", stack: "SECRET" }), payload);
  for (const patch of [{ kind: "SECRET" }, { route: "/?token=SECRET" }, { digest: "SECRET" }, { code: "SECRET" }, { online: "true" }, { entryRoute: "SECRET" }]) {
    assert.equal(parseClientDiagnostic({ ...payload, ...patch }), null);
  }
  assert.equal(parseClientDiagnostic(null), null);
});

test("瀏覽器正常載入不回報，原生錯誤與錯誤頁經同一安全介面送出", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldFetch = globalThis.fetch;
  const handlers = new Map();
  const requests = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { pathname: "/search" }, innerWidth: 390,
    addEventListener: (kind, listener) => handlers.set(kind, listener),
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true, serviceWorker: { controller: null } } });
  globalThis.fetch = async (url, init) => { requests.push([url, JSON.parse(init.body)]); return new Response(null, { status: 204 }); };
  try {
    installClientDiagnostics();
    assert.deepEqual(requests, []);
    window.location.pathname = "/stock/2330";
    handlers.get("error")({ error: new Error("Minified React error #418; SECRET") });
    handlers.get("unhandledrejection")({ reason: new Error("SECRET") });
    reportClientError("render", Object.assign(new Error("SECRET"), { digest: "1234" }));
    await Promise.resolve();
    assert.equal(requests.length, 3);
    assert.ok(requests.every(([url]) => url === "/api/client-diagnostics"));
    assert.deepEqual(requests.map(([, data]) => data.kind), ["hydration", "promise", "render"]);
    assert.equal(requests[0][1].entryRoute, "search");
    assert.equal(requests[0][1].route, "stock");
    assert.doesNotMatch(JSON.stringify(requests), /SECRET|2330/);
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete globalThis.window;
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else delete globalThis.navigator;
    globalThis.fetch = oldFetch;
  }
});
