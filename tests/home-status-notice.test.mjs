import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/components/home/StatusNotice.tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { default: StatusNotice } = await import("../components/home/StatusNotice.tsx");
const NOW = Date.parse("2026-10-17T13:52:29+08:00");
const ids = ["2330", "0050", "00685L", "009816", "006208", "5210", "2515", "3707", "2646"];
const items = ids.map(stock_id => ({ stock_id, name: stock_id, market: "tse" }));
const quotes = ids.map(stockId => ({ stockId, price: 100, asOf: "2026-10-16T13:30:00+08:00" }));
const data = { source: "mis", complete: true, marketOpen: false, asOf: quotes[0].asOf, expectedQuoteDate: "2026-10-16", quotes, indices: [] };

function render(overrides = {}) {
  const originalNow = Date.now;
  Date.now = () => NOW;
  try {
    return renderToStaticMarkup(createElement(StatusNotice, {
      data, items, todayDate: "2026-10-17", autoPaused: false,
      localStorageMode: false, fetchError: false, countError: false, ...overrides,
    }));
  } finally {
    Date.now = originalNow;
  }
}

test("休市日九檔完整的最近收盤行情不顯示警告", () => {
  assert.equal(render(), "");
});

test("週五有效行情加一檔缺價，只計一檔報價缺漏", () => {
  const html = render({ items: [...items, { stock_id: "7930", name: "WST", market: "otc" }], data: { ...data, complete: false } });
  assert.match(html, /報價缺漏 1 檔：WST 7930/);
  assert.match(html, /WST 7930・缺少有效價格/);
  assert.doesNotMatch(html, /報價缺漏 10 檔|非當日行情|資料待確認 9 檔/);
});

test("缺價與過舊、未來、未知時間分別計數，不將日期異常併入缺價", () => {
  const stockItems = ["missing", "old", "future", "unknown"].map(stock_id => ({ stock_id, name: stock_id }));
  const html = render({
    items: stockItems,
    data: { ...data, complete: false, quotes: [
      { stockId: "old", price: 100, asOf: "2026-10-08T13:30:00+08:00" },
      { stockId: "future", price: 100, asOf: "2026-10-17T14:00:00+08:00" },
      { stockId: "unknown", price: 100 },
    ] },
  });
  assert.match(html, /報價缺漏 1 檔：missing missing/);
  assert.match(html, /資料待確認 3 檔/);
  assert.match(html, /行情日期不符預期交易日/);
  assert.match(html, /行情時間晚於目前時間/);
  assert.match(html, /行情時間未知/);
  assert.doesNotMatch(html, /報價缺漏 4 檔/);
});

test("批次因指數等原因不完整時，即使自選股完整仍顯示批次缺漏", () => {
  const response = { ...data, complete: false };
  const html = render({ data: response });
  assert.match(html, /批次報價缺漏/);
  assert.doesNotMatch(html, /報價缺漏 \d+ 檔/);
  assert.equal(response.complete, false);
});

test("批次缺漏與時間異常可以同時呈現，不把有價格的股票計為缺價", () => {
  const html = render({ data: { ...data, complete: false, quotes: quotes.map(quote => ({ ...quote, asOf: undefined })) } });
  assert.match(html, /批次報價缺漏/);
  assert.match(html, /資料待確認 9 檔/);
  assert.doesNotMatch(html, /報價缺漏 9 檔/);
});

test("錯誤標為完整的批次不能遮蔽單檔無效價格", () => {
  const html = render({ data: { ...data, quotes: quotes.map((quote, index) => index === 0 ? { ...quote, price: null } : quote) } });
  assert.match(html, /報價缺漏 1 檔：2330 2330/);
  assert.match(html, /2330 2330・缺少有效價格/);
});

test("舊 API 未提供預期行情日期時仍依傳入日期檢查，日期異常獨立呈現", () => {
  const html = render({ data: { ...data, expectedQuoteDate: undefined }, todayDate: "2026-10-17" });
  assert.match(html, /資料待確認 9 檔/);
  assert.doesNotMatch(html, /報價缺漏/);
});

test("當日有效行情正常顯示，未取得 API 回應時不製造缺價清單", () => {
  assert.equal(render({ todayDate: "2026-10-16", data: { ...data, expectedQuoteDate: undefined } }), "");
  assert.equal(render({ data: undefined }), "");
});

for (const [source, label] of [["tpex", "興櫃參考行情"], ["mixed", "混合來源（含參考行情）"]]) {
  test(`${source} 完整參考資料以來源摘要呈現，不誤稱時間未知`, () => {
    const html = render({data:{...data,source,quotes:quotes.map(quote=>({...quote,source:"tpex"}))}});
    assert.ok(html.includes(label));
    assert.doesNotMatch(html,/行情時間未知/);
  });
}
