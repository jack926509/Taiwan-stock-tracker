import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const fixture = { state: [], cursor: 0, responses: new Map(), requests: [], retries: [] };
globalThis.__closingNavigationUi = {
  useState(initial) {
    const index = fixture.cursor++;
    if (!(index in fixture.state)) fixture.state[index] = initial;
    return [fixture.state[index], value => { fixture.state[index] = value; }];
  },
  useSWR(key) {
    fixture.requests.push(key);
    return { ...(key ? fixture.responses.get(key) ?? { isLoading: true } : {}), mutate: () => { fixture.retries.push(key); } };
  },
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      react: "export const useState = globalThis.__closingNavigationUi.useState; export const useEffect = () => {};",
      swr: "export default globalThis.__closingNavigationUi.useSWR;",
    };
    if (context.parentURL?.endsWith("/components/ClosingSummary.tsx") && stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/components/ClosingSummary.tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText,
    };
    return nextLoad(url, context);
  },
});
const { default: ClosingSummary } = await import("../components/ClosingSummary.tsx");
const response = date => ({ summary: date ? {
  date, source: "mis", asOf: `${date}T05:30:00Z`, complete: true, counts: { up: 1, down: 0, flat: 0 },
  indices: [], rows: [{ stockId: "2330", name: "測試股票", price: 100, changePct: 0.01, weekPct: null, newSignals: [] }],
  alertHits: 0, best: null, worst: null,
} : null, savedAt: date ? `${date}T05:35:00Z` : null });
function reset({ selected = null, latest = "2026-10-16" } = {}) {
  fixture.state = [selected, "2026-10-17"]; fixture.responses = new Map(); fixture.retries = [];
  fixture.responses.set("/api/summary?latest=1", { data: response(latest) });
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function render() {
  fixture.cursor = 0; fixture.requests = [];
  const tree = ClosingSummary(); const all = nodes(tree);
  return { html: renderToStaticMarkup(tree), input: all.find(n => n.type === "input"),
    button: label => all.find(n => n.type === "button" && n.props.children === label) };
}

test("週末預設顯示最近實際保存日期，不先查不存在的今天或重抓行情", () => {
  reset(); const view = render();
  assert.equal(view.input.props.value, "2026-10-16"); assert.match(view.html, /保存於/); assert.match(view.html, /測試股票/);
  assert.ok(fixture.requests.includes("/api/summary?latest=1"));
  assert.ok(!fixture.requests.includes("/api/summary?date=2026-10-17")); assert.ok(!fixture.requests.includes("/api/summary"));
});
test("手動選日期不被最新紀錄輪詢覆蓋，最近一筆按鈕可恢復預設", () => {
  reset(); let view = render(); view.input.props.onChange({ target: { value: "2026-10-15" } });
  fixture.responses.set("/api/summary?date=2026-10-15", { data: response("2026-10-15") });
  fixture.responses.set("/api/summary?latest=1", { data: response("2026-10-17") });
  view = render(); assert.equal(view.input.props.value, "2026-10-15"); assert.match(view.html, /10\/15/);
  view.button("最近一筆").props.onClick(); view = render(); assert.equal(view.input.props.value, "2026-10-17");
});
test("今天操作查當日保存紀錄，無紀錄時只呈現當日暫覽並明示未保存", () => {
  reset(); let view = render(); view.button("今天").props.onClick();
  fixture.responses.set("/api/summary?date=2026-10-17", { data: response(null) });
  fixture.responses.set("/api/summary", { data: { summary: response("2026-10-17").summary } });
  view = render(); assert.equal(view.input.props.value, "2026-10-17"); assert.match(view.html, /今日暫覽，尚未保存/);
  assert.doesNotMatch(view.html, /保存於/); assert.match(view.html, /測試股票/);
});
test("尚無任何保存紀錄時仍可顯示今日暫覽；兩者皆空時給清楚空狀態與重新讀取", () => {
  reset({ latest: null }); fixture.responses.set("/api/summary", { data: { summary: response("2026-10-17").summary } });
  assert.match(render().html, /今日暫覽，尚未保存/);
  fixture.responses.set("/api/summary", { data: { summary: null } }); const view = render();
  assert.match(view.html, /尚無收盤紀錄/); assert.doesNotMatch(view.html, /測試股票/);
  view.button("重新讀取").props.onClick(); assert.ok(fixture.retries.includes("/api/summary?latest=1"));
});
test("指定無紀錄日期不拿最近快照或當日行情充數，清空日期也不顯示舊資料", () => {
  reset({ selected: "2026-10-13" }); fixture.responses.set("/api/summary?date=2026-10-13", { data: response(null) });
  let view = render(); assert.match(view.html, /這一天沒有保存紀錄/); assert.doesNotMatch(view.html, /測試股票/);
  assert.ok(view.button("最近一筆")); assert.ok(!fixture.requests.includes("/api/summary"));
  view.input.props.onChange({ target: { value: "" } }); view = render(); assert.match(view.html, /請選擇查詢日期/); assert.doesNotMatch(view.html, /測試股票/);
});
test("最新、指定日與暫覽讀取錯誤均顯示錯誤，不能冒充空紀錄或成功快照", () => {
  for (const mode of ["latest", "date", "preview"]) {
    reset({ selected: mode === "latest" ? null : "2026-10-17" });
    const key = mode === "latest" ? "/api/summary?latest=1" : mode === "date" ? "/api/summary?date=2026-10-17" : "/api/summary";
    fixture.responses.set("/api/summary?date=2026-10-17", { data: response(null) });
    fixture.responses.set(key, { error: new Error("測試讀取錯誤"), data: response("2026-10-17") });
    const view = render(); assert.match(view.html, /收盤紀錄暫時無法讀取/); assert.match(view.html, /role="alert"/);
    assert.doesNotMatch(view.html, /尚無收盤紀錄|這一天沒有保存紀錄|測試股票|保存於/);
    view.button("重試").props.onClick(); assert.ok(fixture.retries.includes(key));
  }
});
test("回應日期與使用者選擇或今日不符時拒絕顯示，避免異步切換帶入錯日資料", () => {
  reset({ selected: "2026-10-15" }); fixture.responses.set("/api/summary?date=2026-10-15", { data: response("2026-10-16") });
  assert.match(render().html, /收盤紀錄暫時無法讀取/); assert.doesNotMatch(render().html, /測試股票/);
  reset({ selected: "2026-10-17" }); fixture.responses.set("/api/summary?date=2026-10-17", { data: response(null) });
  fixture.responses.set("/api/summary", { data: { summary: response("2026-10-16").summary } });
  assert.match(render().html, /收盤紀錄暫時無法讀取/); assert.doesNotMatch(render().html, /測試股票/);
});
test("最新讀取中不提前顯示沒有紀錄，也不發送當日暫覽請求", () => {
  reset(); fixture.responses.set("/api/summary?latest=1", { isLoading: true });
  const view = render(); assert.match(view.html, /讀取收盤紀錄中/); assert.doesNotMatch(view.html, /尚無收盤紀錄/);
  assert.ok(!fixture.requests.includes("/api/summary"));
});
