import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const originalFetch = globalThis.fetch;
const calls = [];
const toasts = [];
const snapshot = {
  asOf: new Date().toISOString(), source: "mis", complete: true, marketOpen: true,
  indices: [], quotes: [],
};
const watchSnapshot = { items: [], storage: "local" };
let quoteData;
let watchData;
let responseOf;

globalThis.__manualRefresh = {
  hooks: {
    useState: (initial) => [initial, () => {}], useRef: (initial) => ({ current: initial }),
    useEffect: () => {}, useMemo: (callback) => callback(), useCallback: (callback) => callback,
  },
  useToast: () => ({ show: (message, options) => toasts.push({ message, tone: options?.tone }) }),
  usePollGuard: () => ({ autoPaused: false, onQuoteSuccess() {}, refreshInterval() {}, resumePolling() {} }),
  useSWR: (key) => {
    const isQuote = key === "/api/quote";
    const isWatch = key === "/api/watchlist";
    if (!isQuote && !isWatch) return { data: undefined, mutate: async () => undefined };
    const current = isQuote ? quoteData : watchData;
    return {
      data: current,
      mutate: async (...args) => {
        // SWR 的空參數 revalidation 失敗時會回舊資料；顯式 promise mutation 須拋出錯誤。
        if (args.length === 0) {
          try {
            const response = await fetch(key);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
          } catch { return current; }
        }
        const data = await args[0];
        assert.equal(args[1]?.revalidate, false, "避免顯式抓取後再次請求");
        assert.equal(args[1]?.throwOnError, true, "手動更新失敗必須傳回呼叫端");
        return data;
      },
    };
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      react: "export const { useState, useRef, useEffect, useMemo, useCallback } = globalThis.__manualRefresh.hooks;",
      "react/jsx-runtime": "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = 'fragment';",
      swr: "export default globalThis.__manualRefresh.useSWR;",
      "@/components/Toast": "export const useToast = globalThis.__manualRefresh.useToast;",
      "@/hooks/usePollGuard": "export const usePollGuard = globalThis.__manualRefresh.usePollGuard;",
      "@/hooks/useDialogFocus": "export default () => {};",
      "next/link": "export default () => null;",
      "next/navigation": "export const useRouter = () => ({ back() {}, push() {} });",
    };
    let source = stubs[specifier];
    if (specifier === "@/components/icons") {
      source = "export const IconArrowLeft = () => null; export const IconChevronDown = () => null; export const IconX = () => null; export const IconChartBar = () => null;";
    } else if (!source && specifier.startsWith("@/components/")) {
      source = "export default () => null;";
    }
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/app/alerts/page.tsx") || url.endsWith("/app/page.tsx")) {
      const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { default: Dashboard } = await import("../app/page.tsx");
const { default: AlertsPage } = await import("../app/alerts/page.tsx");
const { useHomeDashboard } = await import("../lib/useHomeDashboard.ts");

afterEach(() => { globalThis.fetch = originalFetch; });

function fixture(overrides = {}) {
  calls.length = 0;
  toasts.length = 0;
  quoteData = structuredClone(snapshot);
  watchData = structuredClone(watchSnapshot);
  responseOf = { "/api/quote": { status: 200, body: quoteData }, "/api/watchlist": { status: 200, body: watchData }, ...overrides };
  globalThis.fetch = async (url) => {
    calls.push(url);
    const response = responseOf[url];
    return new Response(JSON.stringify(response.body), { status: response.status });
  };
}

function refreshCallbacks(node) {
  if (!node || typeof node !== "object") return [];
  const callbacks = node.props?.onRefresh ? [node.props.onRefresh] : [];
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    callbacks.push(...refreshCallbacks(child));
  }
  return callbacks;
}

test("自選概況不把未知或非有限的漲跌幅算成平盤", () => {
  fixture();
  quoteData.quotes = [null, NaN, Infinity, -Infinity, 0, 0.01, -0.01].map((changePct, index) => ({
    stockId: String(2330 + index), changePct,
  }));
  assert.deepEqual(useHomeDashboard().watchStats, { up: 1, down: 1, flat: 1, todayHits: 0 });
});

for (const [page, refresh] of [
  ["首頁下拉", () => refreshCallbacks(Dashboard())[0]],
  ["首頁按鈕", () => refreshCallbacks(Dashboard())[1]],
  ["提醒頁下拉", () => refreshCallbacks(AlertsPage())[0]],
]) {
  for (const failedApi of ["/api/quote", "/api/watchlist"]) {
    test(`${page} 手動更新 ${failedApi} HTTP 502 顯示失敗，保持先前資料`, async () => {
      fixture({ [failedApi]: { status: 502, body: { error: "測試來源暫時無法使用" } } });
      await refresh()();
      assert.deepEqual([...toasts], [{ message: "更新失敗，請檢查網路後再試一次", tone: "error" }]);
      assert.deepEqual(calls.sort(), ["/api/quote", "/api/watchlist"]);
      assert.deepEqual(quoteData, snapshot);
      assert.deepEqual(watchData, watchSnapshot);
    });
  }

  test(`${page} 手動更新取得備援仍顯示延遲提示，兩個 API 各請求一次`, async () => {
    fixture({ "/api/quote": { status: 200, body: { ...snapshot, source: "yahoo" } } });
    await refresh()();
    assert.deepEqual(toasts, [{ message: "已讀取 Yahoo 備援報價，資料可能延遲", tone: "info" }]);
    assert.deepEqual(calls.sort(), ["/api/quote", "/api/watchlist"]);
  });

  test(`${page} 成功讀取相同行情不宣稱報價已更新`, async () => {
    fixture();
    await refresh()();
    assert.deepEqual(toasts, [{ message: "已重新讀取報價，行情時間未更新", tone: "info" }]);
    assert.deepEqual(calls.sort(), ["/api/quote", "/api/watchlist"]);
  });
}
