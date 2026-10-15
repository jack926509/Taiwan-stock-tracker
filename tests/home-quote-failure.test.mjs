import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let source;
    if (specifier === "@/lib/useHomeDashboard") source = "export const useHomeDashboard = () => globalThis.__homeState;";
    else if (specifier === "@/components/home/QuoteBoard") source = `
      import { createElement } from 'react';
      export default ({quotes}) => createElement('section', null, quotes.map(q =>
        createElement('p', {key:q.stockId}, q.name + (q.missing ? ' 報價暫缺' : ''))));`;
    else if (specifier === "@/components/home/WatchlistToolbar") source = `
      import { createElement } from 'react';
      export default ({showChips}) => createElement('div', null, showChips ? '可篩選' : '無篩選');`;
    else if (specifier.startsWith("@/components/")) source = "export default () => null;";
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    // data URL 中的 React 匯入必須由專案位置解析。
    if (specifier === "react" && context.parentURL?.startsWith("data:")) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/app/page.tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { default: Dashboard } = await import("../app/page.tsx");
test("行情全部失敗但自選清單已載入時，首頁仍顯示缺報價列與篩選入口", () => {
  globalThis.__homeState = {
    data: undefined, items: [{ stock_id: "2330" }, { stock_id: "2317" }],
    filteredQuotes: [{ stockId: "2330", name: "台積電", missing: true }, { stockId: "2317", name: "鴻海", missing: true }],
    quote: { error: new Error("測試來源失敗") }, watchlist: {}, sparks: {},
    watchStats: {}, alertItems: [], todayFocus: {}, todayDate: null,
  };
  const html = renderToStaticMarkup(createElement(Dashboard));
  assert.match(html, /台積電 報價暫缺/);
  assert.match(html, /鴻海 報價暫缺/);
  assert.match(html, /可篩選/);
  assert.doesNotMatch(html, /MIS 即時行情|報價約延遲 10 秒/);
});
