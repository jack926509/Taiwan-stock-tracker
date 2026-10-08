import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const path = resolve(process.cwd(), `${specifier.slice(2)}.ts`);
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { fetchYahooQuotes } = await import("../lib/providers/quoteProvider.ts");

test("Yahoo 批次備援正確映射台股，並排除過期指數", async () => {
  const current = Math.floor(Date.now() / 1000);
  const old = current - 365 * 24 * 60 * 60;
  const fetchImpl = async (url) => {
    const symbols = new URL(url).searchParams.get("symbols");
    assert.equal(symbols, "^TWII,IX0043.TWO,2330.TW,6488.TWO");
    return new Response(JSON.stringify({
      spark: {
        result: [
          yahooRow("^TWII", current, 44953.16, 45224.29, 100),
          yahooRow("IX0043.TWO", old, 269.45, 267.72, 100),
          yahooRow("2330.TW", current, 2390, 2410, 200),
          yahooRow("6488.TWO", current, 1015, 941, 300),
        ],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await fetchYahooQuotes([
    { stockId: "t00", market: "tse" },
    { stockId: "o00", market: "otc" },
    { stockId: "2330", market: "tse", name: "台積電" },
    { stockId: "6488", market: "otc", name: "環球晶" },
  ], fetchImpl);

  assert.equal(result.complete, false);
  assert.deepEqual(result.quotes.map((quote) => quote.stockId), ["t00", "2330", "6488"]);
  assert.equal(result.quotes[1].name, "台積電");
  assert.equal(result.quotes[1].price, 2390);
  assert.equal(result.quotes[1].change, -20);
  assert.equal(result.quotes[2].market, "otc");
  assert.equal(result.quotes[2].volume, null);
  assert.equal(result.quotes[2].asOf, new Date(current * 1000).toISOString());
});

test("Yahoo 非有限的即時價格退回有效收盤值，日期跟隨該筆收盤值", async () => {
  const current = Math.floor(Date.now() / 1000);
  const row = yahooRow("2330.TW", current, 95, 90, 100);
  row.response[0].meta.regularMarketPrice = Infinity;
  row.response[0].meta.chartPreviousClose = Infinity;
  row.response[0].indicators.quote[0].close = [94, null];
  const result = await fetchYahooQuotes([{ stockId: "2330", market: "tse" }], async () => ({
    ok: true,
    json: async () => ({ spark: { result: [row] } }),
  }));
  assert.equal(result.quotes[0].price, 94);
  assert.equal(result.quotes[0].prevClose, null);
  assert.equal(result.quotes[0].change, null);
  assert.equal(result.quotes[0].asOf, new Date((current - 60) * 1000).toISOString());
  assert.equal(result.asOf, result.quotes[0].asOf);
});

test("Yahoo 重複、非請求及未來行情不會冒充完整批次", async () => {
  const current = Math.floor(Date.now() / 1000);
  const result = await fetchYahooQuotes([
    { stockId: "2330", market: "tse" },
    { stockId: "6488", market: "otc" },
  ], async () => ({
    ok: true,
    json: async () => ({ spark: { result: [
      yahooRow("2330.TW", current, 95, 90, 100),
      yahooRow("2330.TW", current, 95, 90, 100),
      yahooRow("9999.TW", current, 95, 90, 100),
      yahooRow("6488.TWO", current + 3600, 95, 90, 100),
    ] } }),
  }));
  assert.equal(result.complete, false);
  assert.deepEqual(result.quotes.map((quote) => quote.stockId), ["2330"]);
});

test("Yahoo 漲跌百分比計算溢位時回未知，避免輸出 Infinity", async () => {
  const current = Math.floor(Date.now() / 1000);
  const result = await fetchYahooQuotes([{ stockId: "2330", market: "tse" }], async () => ({
    ok: true,
    json: async () => ({ spark: { result: [yahooRow("2330.TW", current, 1e308, 1e-308, 100)] } }),
  }));
  assert.equal(result.quotes[0].changePct, null);
  for (const value of Object.values(result.quotes[0])) {
    if (typeof value === "number") assert.equal(Number.isFinite(value), true);
  }
});

test("Yahoo 使用官方可用的 IX0043.TWO 櫃買指數完成雙指數備援", async () => {
  const current = Math.floor(Date.now() / 1000);
  const result = await fetchYahooQuotes([
    { stockId: "t00", market: "tse" }, { stockId: "o00", market: "otc" },
  ], async () => ({
    ok: true,
    json: async () => ({ spark: { result: [
      yahooRow("^TWII", current, 28000, 27900, 0),
      yahooRow("IX0043.TWO", current, 426.71, 430.46, 0),
    ] } }),
  }));
  assert.equal(result.complete, true);
  assert.deepEqual(result.quotes.map((quote) => [quote.stockId, quote.name, quote.market]), [
    ["t00", "加權指數", "tse"], ["o00", "櫃買指數", "otc"],
  ]);
  assert.equal(result.quotes[1].price, 426.71);
});

test("Yahoo 備援超過二十檔時分批查詢，合併後仍涵蓋全部要求標的", async () => {
  const current = Math.floor(Date.now() / 1000);
  const targets = Array.from({ length: 32 }, (_, index) => ({ stockId: String(4000 + index), market: "tse" }));
  const result = await fetchYahooQuotes(targets, async (url) => {
    const symbols = new URL(url).searchParams.get("symbols").split(",");
    if (symbols.length > 20) return new Response("symbols must be <=20", { status: 400 });
    return { ok: true, json: async () => ({ spark: { result: symbols.map((symbol) => yahooRow(symbol, current, 95, 90, 100)) } }) };
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.quotes.map((quote) => quote.stockId), targets.map((target) => target.stockId));
});

test("Yahoo 部分批次失敗或缺漏時保留其餘可讀行情，仍明確標示不完整", async () => {
  const current = Math.floor(Date.now() / 1000);
  const targets = Array.from({ length: 32 }, (_, index) => ({ stockId: String(4000 + index), market: "tse" }));
  for (const failure of ["http", "missing"]) {
    const result = await fetchYahooQuotes(targets, async (url) => {
      let symbols = new URL(url).searchParams.get("symbols").split(",");
      if (symbols.includes("4020.TW")) {
        if (failure === "http") return new Response("unavailable", { status: 503 });
        symbols = symbols.slice(0, -1);
      }
      return { ok: true, json: async () => ({ spark: { result: symbols.map((symbol) => yahooRow(symbol, current, 95, 90, 100)) } }) };
    });
    assert.equal(result.complete, false);
    assert.equal(result.quotes.length, failure === "http" ? 20 : 31);
    assert.deepEqual(result.quotes.slice(0, 20).map((quote) => quote.stockId), targets.slice(0, 20).map((target) => target.stockId));
    assert.equal(result.asOf, new Date(current * 1000).toISOString());
  }
});

test("Yahoo 真實 close-only 格式以股票總量辨認成交，指數依有效行情辨認", async () => {
  const current = Math.floor(Date.now() / 1000);
  const result = await fetchYahooQuotes([
    { stockId: "t00", market: "tse" }, { stockId: "o00", market: "otc" },
    { stockId: "2330", market: "tse" }, { stockId: "2308", market: "tse" },
    { stockId: "2317", market: "tse" },
  ], async () => ({
    ok: true,
    json: async () => ({ spark: { result: [
      closeOnlyRow("^TWII", current, 0), closeOnlyRow("IX0043.TWO", current),
      closeOnlyRow("2330.TW", current, 22484073), closeOnlyRow("2308.TW", current, 0),
      closeOnlyRow("2317.TW", current),
    ] } }),
  }));
  assert.equal(result.complete, true);
  assert.deepEqual(result.quotes.map((quote) => quote.traded), [true, true, true, false, false]);
  for (const quote of result.quotes) {
    assert.equal(quote.open, null);
    assert.equal(quote.high, null);
    assert.equal(quote.low, null);
    assert.equal(quote.volume, null);
  }
});

function closeOnlyRow(symbol, timestamp, regularMarketVolume) {
  return {
    symbol,
    response: [{
      meta: { regularMarketPrice: 95, chartPreviousClose: 90, regularMarketTime: timestamp, regularMarketVolume },
      timestamp: [timestamp],
      indicators: { quote: [{ close: [95] }] },
    }],
  };
}

function yahooRow(symbol, timestamp, price, previousClose, volume) {
  return {
    symbol,
    response: [{
      meta: {
        regularMarketPrice: price,
        chartPreviousClose: previousClose,
        regularMarketTime: timestamp,
      },
      timestamp: [timestamp - 60, timestamp],
      indicators: {
        quote: [{
          open: [price - 5, price],
          high: [price + 5, price],
          low: [price - 10, price - 2],
          close: [price - 1, price],
          volume: [volume, 0],
        }],
      },
    }],
  };
}
