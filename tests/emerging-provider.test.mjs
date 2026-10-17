import test from "node:test";
import assert from "node:assert/strict";

const NOW = Date.parse("2026-10-17T06:00:00Z");
const TARGET = { stockId: "7930", market: "emerging", name: "WST" };
const ROW = {
  Date: "1151016", Time: "163005", SecuritiesCompanyCode: "7930", CompanyName: "威世波",
  PreviousAveragePrice: "227.8", LatestPrice: "234", Highest: "240", Lowest: "228", TransactionVolume: "147697",
};
let moduleId = 0;
async function withProvider(run) {
  const fetchBefore = globalThis.fetch;
  const nowBefore = Date.now;
  const state = { now: NOW, calls: 0, rows: [ROW], fail: false,
    companies: [{ SecuritiesCompanyCode: "7930", CompanyAbbreviation: "威世波", Symbol: "WST" }] };
  Date.now = () => state.now;
  globalThis.fetch = async input => {
    state.calls++;
    const url = new URL(input);
    assert.equal(url.hostname, "www.tpex.org.tw");
    if (state.fail) throw new Error("來源暫時失敗");
    return new Response(JSON.stringify(url.pathname.endsWith("mopsfin_t187ap03_R") ? state.companies : state.rows));
  };
  try {
    const provider = await import(`../lib/providers/emergingProvider.ts?case=${++moduleId}`);
    await run(provider, state);
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
}

test("官方興櫃行情保留製表時間與股數單位，不把前日均價當昨收或補開盤價", async () => {
  await withProvider(async ({ fetchEmergingQuotes }) => {
    const result = await fetchEmergingQuotes([TARGET]);
    assert.equal(result.source, "tpex");
    assert.equal(result.complete, true);
    assert.equal(result.asOf, "2026-10-16T08:30:05.000Z");
    assert.deepEqual(result.quotes[0], {
      stockId: "7930", name: "威世波", market: "emerging", source: "tpex", price: 234,
      prevClose: null, change: null, changePct: null, open: null, high: 240, low: 228,
      volume: 147.697, traded: true, time: "16:30:05", asOf: "2026-10-16T08:30:05.000Z",
    });
  });
});

test("只保留要求且有有效成交價的興櫃，不以重複或其他股票填滿批次", async () => {
  await withProvider(async ({ fetchEmergingQuotes }, state) => {
    state.rows = [ROW, ROW, { ...ROW, SecuritiesCompanyCode: "9999" }, { ...ROW, SecuritiesCompanyCode: "1260", LatestPrice: "0" }];
    const result = await fetchEmergingQuotes([TARGET, { stockId: "1260", market: "emerging" }, TARGET]);
    assert.equal(result.complete, false);
    assert.deepEqual(result.quotes.map(q => q.stockId), ["7930"]);
  });
});

test("拒絕未來、超過七日、不存在日期與無效時間，不改用目前時間", async () => {
  for (const fields of [{ Date: "1151018" }, { Date: "1151009" }, { Date: "1150230" }, { Date: "" }, { Time: "246000" }, { Time: "16:30:05" }]) {
    await withProvider(async ({ fetchEmergingQuotes }, state) => {
      state.rows = [{ ...ROW, ...fields }];
      const result = await fetchEmergingQuotes([TARGET]);
      assert.equal(result.complete, false);
      assert.deepEqual(result.quotes, []);
      assert.equal(result.asOf, null);
    });
  }
});

test("無效數值留空，不用報買價、均價或零補成已成交價格", async () => {
  for (const price of ["0", "-", "234元", "Infinity", ""]) {
    await withProvider(async ({ fetchEmergingQuotes }, state) => {
      state.rows = [{ ...ROW, LatestPrice: price, BuyingPrice: "228", Average: "234.28" }];
      assert.equal((await fetchEmergingQuotes([TARGET])).quotes.length, 0);
    });
  }
  await withProvider(async ({ fetchEmergingQuotes }, state) => {
    state.rows = [{ ...ROW, TransactionVolume: "147697股", Highest: "Infinity", Lowest: "-1" }];
    const quote = (await fetchEmergingQuotes([TARGET])).quotes[0];
    assert.equal(quote.volume, null);
    assert.equal(quote.traded, false);
    assert.equal(quote.high, null);
    assert.equal(quote.low, null);
  });
});

test("興櫃快取共用請求，來源失敗有固定冷卻且舊資料明確標記", async () => {
  await withProvider(async ({ fetchEmergingQuotes }, state) => {
    await Promise.all([fetchEmergingQuotes([TARGET]), fetchEmergingQuotes([TARGET])]);
    assert.equal(state.calls, 1);
    state.now += 60_001; state.fail = true;
    const stale = await fetchEmergingQuotes([TARGET]);
    assert.equal(stale.source, "stale");
    assert.equal(stale.quotes[0].source, "stale");
    assert.equal(stale.asOf, "2026-10-16T08:30:05.000Z");
    state.now += 30_000;
    await fetchEmergingQuotes([TARGET]);
    assert.equal(state.calls, 2);
    state.now += 30_001; state.fail = false;
    assert.equal((await fetchEmergingQuotes([TARGET])).source, "tpex");
    assert.equal(state.calls, 3);
    state.now += 8 * 24 * 60 * 60_000; state.fail = true;
    assert.equal((await fetchEmergingQuotes([TARGET])).complete, false);
  });
});

test("名冊更正既有誤標市場但保留名稱與個人設定，且不改動傳入物件", async () => {
  await withProvider(async ({ getEmergingStockList, normalizeEmergingMarkets }, state) => {
    const list = await getEmergingStockList();
    assert.deepEqual(list, [{ stockId: "7930", market: "emerging", name: "威世波", aliases: ["WST"] }]);
    const original = [{ stock_id: "7930", market: "otc", name: "WST", alert_high: 250 }, { stock_id: "2330", market: "tse", name: "台積電" }];
    const result = await normalizeEmergingMarkets(original);
    assert.equal(result[0].market, "emerging");
    assert.equal(result[0].name, "WST");
    assert.equal(result[0].alert_high, 250);
    assert.equal(original[0].market, "otc");
    assert.equal(result[1], original[1]);
    assert.equal(state.calls, 1);
  });
});

test("名冊失敗保留既有自選股，冷卻內不重打且到期恢復", async () => {
  await withProvider(async ({ normalizeEmergingMarkets }, state) => {
    const original = [{ stock_id: "7930", market: "otc", name: "WST" }];
    state.fail = true;
    assert.deepEqual(await normalizeEmergingMarkets(original), original);
    assert.deepEqual(await normalizeEmergingMarkets(original), original);
    assert.equal(state.calls, 1);
    state.now += 60_001; state.fail = false;
    assert.equal((await normalizeEmergingMarkets(original))[0].market, "emerging");
    assert.equal(state.calls, 2);
  });
});

test("名冊過期且更新失敗時保留曾確認的興櫃分類，不倒退成原始錯標市場", async () => {
  await withProvider(async ({ normalizeEmergingMarkets, getEmergingStockList }, state) => {
    const original = [{ stock_id: "7930", market: "otc", name: "WST", alert_high: 250 }];
    assert.equal((await normalizeEmergingMarkets(original))[0].market, "emerging");
    state.now += 24 * 60 * 60_000 + 1; state.fail = true;
    const cached = await normalizeEmergingMarkets(original);
    assert.equal(cached[0].market, "emerging");
    assert.equal(cached[0].alert_high, 250);
    assert.equal(cached[0].name, "WST");
    assert.equal(original[0].market, "otc");
    await assert.rejects(getEmergingStockList(), /等待重試/);
    assert.equal(state.calls, 2);
    state.now += 60_001; state.fail = false;
    state.companies = [{ SecuritiesCompanyCode: "1260", CompanyAbbreviation: "富味鄉" }];
    assert.equal((await normalizeEmergingMarkets(original))[0].market, "otc");
  });
});
