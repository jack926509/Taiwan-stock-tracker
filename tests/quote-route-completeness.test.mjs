import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const modules = {
      "@/lib/providers/quoteProvider": `
        export const INDEX_TARGETS = [{stockId:'t00',market:'tse'},{stockId:'o00',market:'otc'}];
        export const fetchQuotes = (...args) => globalThis.__quoteRoute.fetchQuotes(...args);
        export const resolveStock = (...args) => globalThis.__quoteRoute.resolveStock(...args);
        export const Quote = undefined, QuoteTarget = undefined, Market = undefined;
      `,
      "@/lib/store": "export const listWatchlist = (...args) => globalThis.__quoteRoute.listWatchlist(...args);",
      "@/lib/market-hours": "export const isMarketOpenNow = async () => false;",
    };
    if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});

let moduleId = 0;

async function getQuotes(ids, overrides = {}) {
  globalThis.__quoteRoute = {
    resolveStock: async (stockId) => ({ stockId, market: "tse", name: stockId }),
    fetchQuotes: async (targets) => ({
      source: "mis",
      asOf: "2026-10-09T02:00:00.000Z",
      complete: true,
      quotes: targets.map((target) => ({ ...target, price: 100 })),
    }),
    listWatchlist: async () => { throw new Error("ids 查詢不應讀取正式自選股"); },
    ...overrides,
  };
  const { GET } = await import(`../app/api/quote/route.ts?case=${++moduleId}`);
  const response = await GET({ nextUrl: new URL(`https://example.test/api/quote?ids=${encodeURIComponent(ids)}`) });
  assert.equal(response.status, 200);
  return response.json();
}

test("要求的股票解析失敗時，完整指數不能掩蓋報價缺漏", async () => {
  const body = await getQuotes("2330", { resolveStock: async () => null });
  assert.equal(body.complete, false);
  assert.equal(body.indices.length, 2);
  assert.deepEqual(body.quotes, []);
  assert.equal(body.source, "mis");
});

test("要求代號先去重，重複代號不造成重複報價或錯誤完整性", async () => {
  const body = await getQuotes("2330, 2330,0050,0050");
  assert.equal(body.complete, true);
  assert.deepEqual(body.quotes.map((quote) => quote.stockId), ["2330", "0050"]);
  const partial = await getQuotes("2330,2330,0050,0050", {
    resolveStock: async (stockId) => stockId === "2330" ? { stockId, market: "tse", name: "台積電" } : null,
  });
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.quotes.map((quote) => quote.stockId), ["2330"]);
});
