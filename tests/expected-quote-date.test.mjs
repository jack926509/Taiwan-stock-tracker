import test from "node:test";
import assert from "node:assert/strict";

let scenario = 0;

async function withCalendar(rows, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    if (rows instanceof Error) throw rows;
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const calendar = await import(`../lib/market-hours.ts?expected-quote=${++scenario}`);
    await run(calendar);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("週六與週日仍以週五收盤行情為預期日期", async () => {
  await withCalendar([], async ({ getExpectedQuoteDate }) => {
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-17T13:52:29+08:00")), "2026-10-16");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-18T08:00:00+08:00")), "2026-10-16");
  });
});

test("連假回溯跳過官方休市日，不把假期前有效行情當缺漏", async () => {
  await withCalendar([
    { Date: "1151009", Name: "測試休市", Description: "休市" },
    { Date: "1151012", Name: "測試休市", Description: "休市" },
  ], async ({ getExpectedQuoteDate }) => {
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-12T10:00:00+08:00")), "2026-10-08");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-13T08:59:59+08:00")), "2026-10-08");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-13T09:00:00+08:00")), "2026-10-13");
  });
});

test("官方補行交易的週六在開盤後使用當日，週日沿用該週六", async () => {
  await withCalendar([
    { Date: "1151017", Name: "測試補行交易", Description: "補行交易" },
  ], async ({ getExpectedQuoteDate }) => {
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-17T08:59:59+08:00")), "2026-10-16");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-17T09:00:00+08:00")), "2026-10-17");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-18T12:00:00+08:00")), "2026-10-17");
  });
});

test("盤前以最近交易日為準，08:45 的輪詢視窗不提前要求當日成交", async () => {
  await withCalendar([], async ({ getExpectedQuoteDate, isMarketOpenNow }) => {
    for (const time of ["00:00:00", "08:44:59", "08:45:00", "08:59:59"]) {
      assert.equal(await getExpectedQuoteDate(new Date(`2026-10-19T${time}+08:00`)), "2026-10-16");
    }
    assert.equal(await isMarketOpenNow(new Date("2026-10-19T08:45:00+08:00")), true);
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-19T09:00:00+08:00")), "2026-10-19");
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-19T23:59:59+08:00")), "2026-10-19");
  });
});

test("行事曆暫時失敗沿用既有週間判斷，跨年盤前仍能回溯", async () => {
  await withCalendar(new Error("測試行事曆離線"), async ({ getExpectedQuoteDate }) => {
    assert.equal(await getExpectedQuoteDate(new Date("2026-10-17T10:00:00+08:00")), "2026-10-16");
    assert.equal(await getExpectedQuoteDate(new Date("2027-01-01T08:00:00+08:00")), "2026-12-31");
  });
});
