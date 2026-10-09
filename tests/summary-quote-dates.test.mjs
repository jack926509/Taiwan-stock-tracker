import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerHooks } from "node:module";

const NOW = new Date("2026-10-09T05:35:00.000Z"); // 台北收盤總覽排程 13:35
const CLOSED_AT = "2026-10-09T05:30:00.000Z";
const originalDateNow = Date.now;
const originalConsoleWarn = console.warn;
let items;
let result;
let history;
const sent = [];
const loaded = [];
const warnings = [];
let fetchCount = 0;
let importSequence = 0;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/store": "export const listWatchlist = () => globalThis.__summaryDates.list();",
      "@/lib/providers/quoteProvider": "export const INDEX_TARGETS = [{stockId:'t00',market:'tse'},{stockId:'o00',market:'otc'}]; export const fetchQuotes = (...args) => globalThis.__summaryDates.fetch(...args);",
      "@/lib/klineStore": "export const loadKline = (...args) => globalThis.__summaryDates.kline(...args);",
      "@/lib/notify": "export const lineConfigured = () => true; export const pushLineMessages = (...args) => globalThis.__summaryDates.push(...args);",
      "@/lib/supabase": "export function getSupabase() { throw new Error('摘要測試不得操作資料庫'); }",
    };
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__summaryDates = {
  list: async () => items,
  fetch: async () => { fetchCount++; return result; },
  kline: async (id) => { loaded.push(id); return history; },
  push: async (messages) => { sent.push(messages); return true; },
};

const { dailySummary, todayCandleFromQuote } = await import("../lib/daily-summary.ts");

function quote(stockId, overrides = {}) {
  return {
    stockId, market: stockId === "o00" ? "otc" : "tse", name: stockId,
    price: 110, prevClose: 100, change: 10, changePct: 0.1,
    open: 101, high: 112, low: 100, volume: 500, traded: true,
    time: "13:30:00", asOf: CLOSED_AT, ...overrides,
  };
}

function fixture(overrides = {}) {
  Date.now = () => NOW.getTime();
  sent.length = 0;
  loaded.length = 0;
  warnings.length = 0;
  fetchCount = 0;
  history = [];
  console.warn = (...args) => warnings.push(args);
  items = [{
    stock_id: "2330", market: "tse", name: "台積電", group_name: "預設",
    alert_high: null, alert_low: null, alert_high_hit_at: null, alert_low_hit_at: null,
    alert_change_pct: null, alert_change_hit_at: null, alert_volume_on: false,
    alert_volume_hit_at: null, sort_order: 0,
  }];
  result = {
    source: "mis", complete: true, asOf: CLOSED_AT,
    quotes: [
      quote("2330"),
      quote("t00", { name: "加權指數", price: 28793.16, volume: null }),
      quote("o00", { name: "櫃買指數", price: 237.45, volume: null }),
    ], ...overrides,
  };
}

async function summaryData() {
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  return buildSummaryData(NOW);
}

test("摘要快取區分市場，自選名稱與今日提醒變更後立即更新", async () => {
  fixture();
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  const first = await buildSummaryData(NOW);
  assert.equal(first.complete, true);
  items[0].market = "otc";
  result.quotes[0].market = "otc";
  await buildSummaryData(NOW);
  assert.equal(fetchCount, 2, "市場變更應重新查詢行情");
  items[0].name = "更新的台積電名稱";
  items[0].alert_high_hit_at = "2026-10-09T05:34:00.000Z";
  const updated = await buildSummaryData(NOW);
  assert.equal(updated.rows[0].name, "更新的台積電名稱");
  assert.equal(updated.alertHits, 1);
  assert.equal(fetchCount, 2, "名稱與提醒變更可沿用行情快取");
});

afterEach(() => { Date.now = originalDateNow; console.warn = originalConsoleWarn; });

test("當日實際收盤 MIS 在 13:35 仍保留完整 LINE 摘要", async () => {
  fixture();
  assert.equal(await dailySummary(NOW), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0][0].altText, /收盤總覽 10\/09/);
  assert.match(sent[0][0].altText, /漲 1 跌 0 平 0/);
  assert.match(JSON.stringify(sent[0]), /2330/);
  assert.deepEqual(warnings, []);
});

for (const source of ["yahoo", "stale"]) {
  test(`${source} 備援不發送每日 LINE 摘要`, async () => {
    fixture({ source });
    assert.equal(await dailySummary(NOW), false);
    assert.deepEqual(sent, []);
    assert.deepEqual(loaded, []);
  });
}

for (const [label, overrides, reason] of [
  ["前一交易日", { asOf: "2026-10-08T05:30:00.000Z" }, "來源日期不是當日"],
  ["缺少時間", { asOf: undefined }, "缺少來源時間"],
  ["無效時間", { asOf: "invalid" }, "來源時間無效"],
  ["未來時間", { asOf: "2026-10-09T05:36:00.000Z" }, "來源時間在未來"],
  ["未實際成交", { traded: false }, "未實際成交"],
  ["無效價格", { price: Infinity }, "價格無效"],
  ["市場不符", { market: "otc" }, "市場不符"],
]) {
  test(`個別 ${label} 報價不冒充今日 LINE 摘要`, async () => {
    fixture();
    Object.assign(result.quotes[0], overrides);
    assert.equal(await dailySummary(NOW), false);
    assert.deepEqual(sent, []);
    assert.deepEqual(loaded, []);
    assert.deepEqual(warnings[0][1].stocks, [{ stockId: "2330", reason }]);
  });
}

test("缺漏批次或冒稱完整但缺少指數，不發送完整 LINE 摘要", async () => {
  fixture({ complete: false });
  assert.equal(await dailySummary(NOW), false);
  fixture();
  result.quotes.pop();
  assert.equal(await dailySummary(NOW), false);
  assert.deepEqual(sent, []);
});

test("舊日與日期未知報價不能合成今日 K 線，當日有效行情保留", () => {
  fixture();
  for (const asOf of ["2026-10-08T05:30:00.000Z", undefined, "invalid"]) {
    assert.equal(todayCandleFromQuote(quote("2330", { asOf }), "2026-10-09"), null);
  }
  assert.deepEqual(todayCandleFromQuote(quote("2330"), "2026-10-09"), {
    date: "2026-10-09", open: 101, high: 112, low: 100, close: 110, volume: 500,
  });
});

test("來源 UTC 前一天但仍屬台北當日，合成日期依台北判斷", () => {
  fixture();
  const candle = todayCandleFromQuote(quote("2330", { asOf: "2026-10-08T16:30:00.000Z" }), "2026-10-09");
  assert.equal(candle.date, "2026-10-09");
});

test("站內摘要排除舊股票及舊指數，當日資料仍參與漲跌與排名", async () => {
  fixture();
  items.push({ ...items[0], stock_id: "2317", name: "鴻海" });
  result.quotes.push(quote("2317", { asOf: "2026-10-08T05:30:00.000Z", changePct: 0.9 }));
  result.quotes[2].asOf = "2026-10-08T05:30:00.000Z";
  const data = await summaryData();
  assert.deepEqual(data.rows.map((row) => row.stockId), ["2330"]);
  assert.deepEqual(data.indices.map((row) => row.name), ["加權"]);
  assert.deepEqual(data.counts, { up: 1, down: 0, flat: 0 });
  assert.equal(data.best.name, "台積電");
  assert.equal(data.complete, false);
  assert.equal(data.source, "mis");
  assert.equal(data.asOf, CLOSED_AT);
  assert.ok(!loaded.includes("2317"));
});

test("當日 Yahoo 與快照僅供站內摘要查看，回傳來源與行情時間", async () => {
  for (const source of ["yahoo", "stale"]) {
    fixture({ source });
    const data = await summaryData();
    assert.equal(data.source, source);
    assert.equal(data.asOf, CLOSED_AT);
    assert.equal(data.complete, true);
    assert.deepEqual(data.counts, { up: 1, down: 0, flat: 0 });
    assert.deepEqual(sent, []);
  }
});

test("部分摘要不快取十分鐘，來源恢復後下一次可取得完整摘要", async () => {
  fixture();
  result.quotes[2].asOf = "2026-10-08T05:30:00.000Z";
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  const partial = await buildSummaryData(NOW);
  assert.equal(partial.complete, false);
  result.quotes[2].asOf = CLOSED_AT;
  const complete = await buildSummaryData(NOW);
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.indices.map((row) => row.name), ["加權", "櫃買"]);
});

test("全為舊日或日期未知時，站內摘要不回傳冒充今日的資料", async () => {
  fixture();
  for (const q of result.quotes) q.asOf = "2026-10-08T05:30:00.000Z";
  assert.equal(await summaryData(), null);
  fixture();
  for (const q of result.quotes) delete q.asOf;
  assert.equal(await summaryData(), null);
});

test("略過收盤 LINE 會記錄所有股票及固定原因，不記錄原始資料", async () => {
  fixture();
  items.push({ ...items[0], stock_id: "2317", name: "SECRET-name" });
  result.quotes[0].traded = false;
  result.quotes.push(quote("2317", { name: "SECRET-name", asOf: "SECRET-invalid-date" }));
  assert.equal(await dailySummary(NOW), false);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0][1].stocks, [
    { stockId: "2330", reason: "未實際成交" },
    { stockId: "2317", reason: "來源時間無效" },
  ]);
  assert.equal(warnings[0][1].date, "2026-10-09");
  assert.doesNotMatch(JSON.stringify(warnings), /SECRET-name|SECRET-invalid-date/);
  assert.deepEqual(sent, []);
});

test("不可信來源的略過紀錄不包含來源原文", async () => {
  fixture({ source: "SECRET-unknown-source" });
  assert.equal(await dailySummary(NOW), false);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].reason, "報價來源不是 MIS");
  assert.doesNotMatch(JSON.stringify(warnings), /SECRET-unknown-source/);
});

for (const source of ["yahoo", "stale"]) {
  test(`完整 ${source} 摘要只短快取 30 秒，不擋住 MIS 恢復十分鐘`, async () => {
    fixture({ source });
    importSequence++;
    const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
    assert.equal((await buildSummaryData(NOW)).source, source);
    result = { ...result, source: "mis" };
    Date.now = () => NOW.getTime() + 29_999;
    assert.equal((await buildSummaryData(NOW)).source, source);
    assert.equal(fetchCount, 1);
    Date.now = () => NOW.getTime() + 30_000;
    assert.equal((await buildSummaryData(NOW)).source, "mis");
    assert.equal(fetchCount, 2);
  });
}

test("無當日資料仍回 null，但以 30 秒短快取節流並可恢復", async () => {
  fixture();
  const currentQuotes = result.quotes;
  result = { ...result, quotes: currentQuotes.map((q) => ({ ...q, asOf: "2026-10-08T05:30:00.000Z" })) };
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  assert.equal(await buildSummaryData(NOW), null);
  result = { ...result, quotes: currentQuotes };
  Date.now = () => NOW.getTime() + 29_999;
  assert.equal(await buildSummaryData(NOW), null);
  assert.equal(fetchCount, 1);
  Date.now = () => NOW.getTime() + 30_000;
  assert.equal((await buildSummaryData(NOW)).source, "mis");
  assert.equal(fetchCount, 2);
});

test("完整 MIS 摘要維持十分鐘快取，來源時間不改成抓取時間", async () => {
  fixture();
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  const original = await buildSummaryData(NOW);
  Date.now = () => NOW.getTime() + 599_999;
  assert.deepEqual(await buildSummaryData(NOW), original);
  assert.equal(fetchCount, 1);
  Date.now = () => NOW.getTime() + 600_000;
  assert.equal((await buildSummaryData(NOW)).asOf, CLOSED_AT);
  assert.equal(fetchCount, 2);
});

test("null 短快取不跨台北日期沿用", async () => {
  fixture();
  const currentQuotes = result.quotes;
  result = { ...result, quotes: [] };
  importSequence++;
  const { buildSummaryData } = await import(`../lib/summaryData.ts?summary-date-test=${importSequence}`);
  assert.equal(await buildSummaryData(NOW), null);
  result = { ...result, quotes: currentQuotes.map((q) => ({ ...q, asOf: "2026-10-10T05:30:00.000Z" })) };
  assert.equal((await buildSummaryData(new Date("2026-10-10T05:35:00.000Z"))).date, "2026-10-10");
  assert.equal(fetchCount, 2);
});

for (const [label, changePct] of [["null", null], ["正無限", Infinity], ["負無限", -Infinity], ["NaN", NaN]]) {
  test(`${label} 漲跌幅不冒充平盤，也不成為摘要最佳或最差`, async () => {
    fixture();
    result.quotes[0].changePct = changePct;
    const data = await summaryData();
    assert.deepEqual(data.counts, { up: 0, down: 0, flat: 0 });
    assert.equal(data.best, null);
    assert.equal(data.worst, null);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].changePct, null);
    assert.equal(await dailySummary(NOW), true);
    assert.match(sent[0][0].altText, /漲 0 跌 0 平 0/);
    assert.doesNotMatch(JSON.stringify(sent[0]), /最強|最弱|▪ 2330/);
  });
}

test("已知零幅仍是平盤，未知百分比不影響有效股票的分類與排名", async () => {
  fixture();
  const stockIds = ["2330", "2317", "2454", "2308", "2882", "1301", "6505"];
  const percentages = [null, Infinity, -Infinity, NaN, 0, 0.05, -0.03];
  items = stockIds.map((stock_id) => ({ ...items[0], stock_id, name: stock_id }));
  result.quotes = [
    ...stockIds.map((id, index) => quote(id, { changePct: percentages[index] })),
    ...result.quotes.slice(1),
  ];
  const data = await summaryData();
  assert.deepEqual(data.counts, { up: 1, down: 1, flat: 1 });
  assert.equal(data.best.name, "1301");
  assert.equal(data.worst.name, "6505");
  assert.equal(data.rows.find((row) => row.stockId === "2882").changePct, 0);
  assert.equal(await dailySummary(NOW), true);
  assert.match(sent[0][0].altText, /漲 1 跌 1 平 1/);
  const message = JSON.stringify(sent[0]);
  assert.match(message, /▪ 2882/);
  assert.doesNotMatch(message, /2330|2317|2454|2308/);
});

test("缺少或無效成交欄位不合成日 K，不能以價格或零補資料", () => {
  fixture();
  const invalid = [
    { open: null }, { high: null }, { low: null }, { volume: null },
    { open: 0 }, { high: -1 }, { low: Infinity }, { open: NaN },
    { volume: -1 }, { volume: Infinity }, { volume: NaN },
    { high: 109 }, { low: 102 }, { open: 120 }, { high: 99, low: 100 },
  ];
  for (const overrides of invalid) {
    assert.equal(todayCandleFromQuote(quote("2330", overrides), "2026-10-09"), null);
  }
  assert.equal(todayCandleFromQuote(quote("2330", { volume: 0 }), "2026-10-09").volume, 0);
});

test("完整 MIS 成交資料仍可產生當日技術訊號並保留收盤 LINE", async () => {
  fixture();
  history = Array.from({ length: 19 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    open: 100, high: 101, low: 99, close: 100, volume: 1000,
  }));
  const data = await summaryData();
  assert.ok(data.rows[0].newSignals.some((signal) => signal.kind === "ma20-above"));
  assert.equal(await dailySummary(NOW), true);
  assert.match(JSON.stringify(sent[0]), /站上 MA20/);
});

test("close-only Yahoo Spark 經 provider 可顯示摘要，但不合成假日 K 或訊號", async () => {
  fixture();
  history = Array.from({ length: 19 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    open: 100, high: 101, low: 99, close: 100, volume: 1000,
  }));
  const { fetchYahooQuotes } = await import("../lib/providers/quoteProvider.ts");
  const timestamp = Date.parse(CLOSED_AT) / 1000;
  const response = {
    spark: {
      result: ["2330.TW", "^TWII", "IX0043.TWO"].map((symbol) => ({
        symbol,
        response: [{
          meta: {
            regularMarketPrice: 110, chartPreviousClose: 100,
            regularMarketTime: timestamp,
            regularMarketVolume: symbol === "2330.TW" ? 22484073 : 0,
          },
          timestamp: [timestamp - 60, timestamp],
          indicators: { quote: [{ close: [109, 110] }] },
        }],
      })),
    },
  };
  const yahoo = await fetchYahooQuotes([
    { stockId: "2330", market: "tse", name: "台積電" },
    { stockId: "t00", market: "tse" },
    { stockId: "o00", market: "otc" },
  ], async () => new Response(JSON.stringify(response), { status: 200 }));
  result = { ...yahoo, source: "yahoo" };
  assert.equal(result.quotes[0].traded, true);
  assert.equal(result.quotes[0].open, null);
  assert.equal(result.quotes[0].high, null);
  assert.equal(result.quotes[0].low, null);
  assert.equal(result.quotes[0].volume, null);
  const data = await summaryData();
  assert.equal(data.source, "yahoo");
  assert.equal(data.complete, true);
  assert.equal(data.rows[0].price, 110);
  assert.equal(data.best.name, "台積電");
  assert.deepEqual(data.counts, { up: 1, down: 0, flat: 0 });
  assert.deepEqual(data.rows[0].newSignals, []);
  assert.equal(todayCandleFromQuote(result.quotes[0], "2026-10-09"), null);
  assert.deepEqual(sent, []);
});
