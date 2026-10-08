import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase") {
      return {
        url: "data:text/javascript,export function getSupabase() { return null; }",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const BASE_TIME = Date.parse("2026-10-09T02:00:00.000Z");
const TARGETS = [{ stockId: "2330", market: "tse", name: "台積電" }];
let moduleId = 0;

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function misRow(stockId = "2330", market = "tse", price = "100") {
  return { c: stockId, ex: market, n: "台積電", z: price, y: "90", v: "10", d: "20261009", t: "10:00:00" };
}

function yahooRow(symbol = "2330.TW", at = BASE_TIME - 60 * 60 * 1000, price = 95) {
  return {
    symbol,
    response: [{
      meta: { regularMarketPrice: price, chartPreviousClose: 90, regularMarketTime: at / 1000 },
      timestamp: [at / 1000],
      indicators: { quote: [{ open: [92], high: [96], low: [91], close: [price], volume: [1000] }] },
    }],
  };
}

async function withProvider(run) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = {
    now: BASE_TIME,
    session: () => jsonResponse({}, 200, { "Set-Cookie": "SESSION=test; Path=/" }),
    mis: () => jsonResponse({ rtcode: "0000", msgArray: [misRow()] }),
    yahoo: () => jsonResponse({ spark: { result: [yahooRow()] } }),
  };
  Date.now = () => state.now;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "mis.twse.com.tw") {
      if (url.pathname.endsWith("getStock.jsp")) {
        return state.session(url);
      }
      return state.mis(url);
    }
    if (url.hostname === "query1.finance.yahoo.com") return state.yahoo(url);
    throw new Error(`測試禁止外部連線：${url.hostname}`);
  };
  try {
    const provider = await import(`../lib/providers/quoteProvider.ts?case=${++moduleId}`);
    await run(provider, state);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test("持續輪詢備援時，在原先固定期限到期恢復證交所報價", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => state.now < BASE_TIME + 300_000
      ? jsonResponse({}, 503)
      : jsonResponse({ rtcode: "0000", msgArray: [misRow("2330", "tse", "101")] });
    assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    for (state.now = BASE_TIME + 6000; state.now < BASE_TIME + 300_000; state.now += 6000) {
      assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    }
    const recovered = await fetchQuotes(TARGETS);
    assert.equal(recovered.source, "mis");
    assert.equal(recovered.quotes[0].price, 101);
  });
});

test("固定恢復期限到期時，剛抓取的 Yahoo 快取也不延後 MIS 重試", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => state.now < BASE_TIME + 300_000
      ? jsonResponse({}, 503)
      : jsonResponse({ rtcode: "0000", msgArray: [misRow()] });
    await fetchQuotes(TARGETS);
    state.now = BASE_TIME + 299_000;
    assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    state.now = BASE_TIME + 300_000;
    assert.equal((await fetchQuotes(TARGETS)).source, "mis");
  });
});

test("Yahoo 行情時間較早時，仍依抓取時間保留五秒快取並保留資料日期", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({}, 503);
    const first = await fetchQuotes(TARGETS);
    state.now += 2000;
    state.yahoo = () => { throw new Error("來源已中斷"); };
    const cached = await fetchQuotes(TARGETS);
    assert.equal(cached.source, "yahoo");
    assert.equal(cached.asOf, "2026-10-09T01:00:00.000Z");
    assert.deepEqual(cached, first);
    state.now += 4000;
    const stale = await fetchQuotes(TARGETS);
    assert.equal(stale.source, "stale");
    assert.equal(stale.asOf, first.asOf);
  });
});

test("兩個來源失敗後的舊快照也保留五秒，避免每秒重新要求備援", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({}, 503);
    await fetchQuotes(TARGETS);
    state.now += 6000;
    state.yahoo = () => jsonResponse({}, 503);
    assert.equal((await fetchQuotes(TARGETS)).source, "stale");
    state.now += 1000;
    state.yahoo = () => jsonResponse({ spark: { result: [yahooRow("2330.TW", state.now, 105)] } });
    const cached = await fetchQuotes(TARGETS);
    assert.equal(cached.source, "stale");
    assert.equal(cached.quotes[0].price, 95);
    state.now += 5000;
    const refreshed = await fetchQuotes(TARGETS);
    assert.equal(refreshed.source, "yahoo");
    assert.equal(refreshed.quotes[0].price, 105);
  });
});

test("Yahoo 缺漏的批次在快取及舊快照中仍標示不完整", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    const targets = [...TARGETS, { stockId: "6488", market: "otc", name: "環球晶" }];
    state.mis = () => jsonResponse({}, 503);
    const first = await fetchQuotes(targets);
    assert.equal(first.complete, false);
    state.now += 1000;
    assert.equal((await fetchQuotes(targets)).complete, false);
    state.now += 5000;
    state.yahoo = () => jsonResponse({}, 503);
    const stale = await fetchQuotes(targets);
    assert.equal(stale.source, "stale");
    assert.equal(stale.complete, false);
    assert.equal(stale.asOf, "2026-10-09T01:00:00.000Z");
    assert.deepEqual(stale.quotes.map((quote) => quote.stockId), ["2330"]);
  });
});

test("MIS 缺漏、重複及非請求標的不會冒充完整批次", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    const targets = [...TARGETS, { stockId: "6488", market: "otc", name: "環球晶" }];
    state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [
      misRow(), misRow(), misRow("9999"), misRow("6488", "unexpected"),
    ] });
    const result = await fetchQuotes(targets);
    assert.equal(result.source, "mis");
    assert.equal(result.complete, false);
    assert.deepEqual(result.quotes.map((quote) => quote.stockId), ["2330"]);
    state.now += 1000;
    assert.equal((await fetchQuotes(targets)).complete, false);
  });
});

test("MIS 每筆保留台北行情日期，批次顯示最舊日期且缺日期時回未知", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    const targets = [...TARGETS, { stockId: "6488", market: "otc" }];
    state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [
      misRow(), { ...misRow("6488", "otc"), d: "20261008", t: "13:30" },
    ] });
    const dated = await fetchQuotes(targets);
    assert.equal(dated.quotes[0].asOf, "2026-10-09T02:00:00.000Z");
    assert.equal(dated.quotes[1].asOf, "2026-10-08T05:30:00.000Z");
    assert.equal(dated.asOf, "2026-10-08T05:30:00.000Z");
    state.now += 6000;
    state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [
      misRow(), { ...misRow("6488", "otc"), d: undefined },
    ] });
    const unknown = await fetchQuotes(targets);
    assert.equal(unknown.quotes[1].asOf, undefined);
    assert.equal(unknown.asOf, null);
  });
});

test("兩個來源失敗時，不再把超過七天的舊行情交給使用者", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({}, 503);
    assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    state.now += 8 * 24 * 60 * 60 * 1000;
    state.yahoo = () => jsonResponse({}, 503);
    await assert.rejects(fetchQuotes(TARGETS), /MIS/);
  });
});

test("五秒快取期間也會拒絕剛超過七天保存期限的行情", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({}, 503);
    state.yahoo = () => jsonResponse({ spark: { result: [yahooRow("2330.TW", BASE_TIME - 7 * 24 * 60 * 60 * 1000 + 1000)] } });
    assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    state.now += 2000;
    await assert.rejects(fetchQuotes(TARGETS), /MIS/);
  });
});

test("同時要求相同批次時共用一次報價，避免來源限流造成結果分歧", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    let available = true;
    state.mis = async () => {
      if (!available) return jsonResponse({}, 429);
      available = false;
      await new Promise((resolve) => setImmediate(resolve));
      return jsonResponse({ rtcode: "0000", msgArray: [misRow()] });
    };
    const results = await Promise.all([fetchQuotes(TARGETS), fetchQuotes(TARGETS), fetchQuotes(TARGETS)]);
    for (const result of results) {
      assert.equal(result.source, "mis");
      assert.equal(result.quotes[0].price, 100);
    }
  });
});

test("MIS 不接受夾雜文字的數字，也不猜測不存在或未來的行情日期", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    for (const date of ["20260230", "20261010", undefined]) {
      state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [{
        ...misRow(), z: "100元", v: "10張", o: "Infinity", d: date,
      }] });
      const result = await fetchQuotes(TARGETS);
      assert.equal(result.quotes[0].price, 90);
      assert.equal(result.quotes[0].traded, false);
      assert.equal(result.quotes[0].volume, null);
      assert.equal(result.quotes[0].open, null);
      assert.equal(result.quotes[0].asOf, undefined);
      assert.equal(result.asOf, null);
      state.now += 6000;
    }
  });
});

test("MIS 只有過期行情時改用 Yahoo，不把過期價格當成即時來源", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [{ ...misRow(), d: "20261001" }] });
    const result = await fetchQuotes(TARGETS);
    assert.equal(result.source, "yahoo");
    assert.equal(result.quotes[0].price, 95);
  });
});

test("MIS 沒有可用價格時改用 Yahoo，不把空價格計為完整報價", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    state.mis = () => jsonResponse({ rtcode: "0000", msgArray: [{ ...misRow(), z: "-", y: "-", b: "-_" }] });
    const result = await fetchQuotes(TARGETS);
    assert.equal(result.source, "yahoo");
    assert.equal(result.quotes[0].price, 95);
  });
});

test("解析自選股只接受要求的代號，錯誤 MIS 結果改用精確 Yahoo 符號", async () => {
  await withProvider(async ({ resolveStock }, state) => {
    state.session = () => jsonResponse({ rtcode: "0000", msgArray: [misRow("9999")] });
    state.yahoo = () => jsonResponse({ quotes: [
      { symbol: "2330A.TW", shortname: "其他股票", quoteType: "EQUITY" },
      { symbol: "2330.TW", shortname: "台積電", quoteType: "EQUITY" },
    ] });
    assert.deepEqual(await resolveStock("2330"), { stockId: "2330", market: "tse", name: "台積電" });
  });
});

test("解析自選股的兩個來源都逾時時回 null，讓呼叫端正常處理查無資料", async () => {
  await withProvider(async ({ resolveStock }, state) => {
    state.session = () => { throw new Error("MIS timeout"); };
    state.yahoo = () => { throw new Error("Yahoo timeout"); };
    assert.equal(await resolveStock("2330"), null);
  });
});

test("Yahoo 解析接受精確台股股票及 ETF，仍拒絕其他商品與相似代號", async () => {
  await withProvider(async ({ resolveStock }, state) => {
    state.session = () => jsonResponse({}, 503);
    for (const quoteType of ["ETF", "EQUITY"]) {
      state.yahoo = () => jsonResponse({ quotes: [{ symbol: "0050.TW", shortname: "元大台灣 50", quoteType }] });
      assert.deepEqual(await resolveStock("0050"), { stockId: "0050", market: "tse", name: "元大台灣 50" });
    }
    for (const quote of [
      { symbol: "0050.TW", shortname: "其他商品", quoteType: "MUTUALFUND" },
      { symbol: "0050A.TW", shortname: "相似代號", quoteType: "ETF" },
      { symbol: "0050", shortname: "其他市場", quoteType: "EQUITY" },
    ]) {
      state.yahoo = () => jsonResponse({ quotes: [quote] });
      assert.equal(await resolveStock("0050"), null);
    }
  });
});

test("較舊 Yahoo 行情不覆蓋較新 MIS 備份，雙來源失敗時回最新舊快照", async () => {
  await withProvider(async ({ fetchQuotes }, state) => {
    const mis = await fetchQuotes(TARGETS);
    assert.equal(mis.source, "mis");
    state.now += 6000;
    state.mis = () => jsonResponse({}, 503);
    assert.equal((await fetchQuotes(TARGETS)).source, "yahoo");
    state.now += 6000;
    state.yahoo = () => jsonResponse({}, 503);
    const stale = await fetchQuotes(TARGETS);
    assert.equal(stale.source, "stale");
    assert.equal(stale.quotes[0].price, 100);
    assert.equal(stale.quotes[0].volume, 10);
    assert.equal(stale.asOf, "2026-10-09T02:00:00.000Z");
    assert.equal(stale.complete, true);
  });
});

test("Yahoo 無成交證據的較新價格不覆蓋已知 MIS 成交備份", async () => {
  for (const regularMarketVolume of [0, undefined]) {
    await withProvider(async ({ fetchQuotes }, state) => {
      await fetchQuotes(TARGETS);
      state.now += 6000;
      state.mis = () => jsonResponse({}, 503);
      state.yahoo = () => jsonResponse({ spark: { result: [{
        symbol: "2330.TW",
        response: [{
          meta: { regularMarketPrice: 105, chartPreviousClose: 90, regularMarketTime: state.now / 1000, regularMarketVolume },
          timestamp: [state.now / 1000],
          indicators: { quote: [{ close: [105] }] },
        }],
      }] } });
      const yahoo = await fetchQuotes(TARGETS);
      assert.equal(yahoo.source, "yahoo");
      assert.equal(yahoo.quotes[0].traded, false);
      state.now += 6000;
      state.yahoo = () => jsonResponse({}, 503);
      const stale = await fetchQuotes(TARGETS);
      assert.equal(stale.source, "stale");
      assert.equal(stale.quotes[0].price, 100);
      assert.equal(stale.quotes[0].traded, true);
      assert.equal(stale.asOf, "2026-10-09T02:00:00.000Z");
    });
  }
});
