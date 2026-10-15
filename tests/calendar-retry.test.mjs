import test from "node:test";
import assert from "node:assert/strict";

test("行事曆故障共用一次請求，短暫等待後可恢復；不逐檔或逐日重試", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse("2026-10-11T08:00:00Z"), requests = 0, failed = true;
  Date.now = () => now;
  globalThis.fetch = async () => {
    requests++;
    if (failed) throw new Error("測試逾時");
    return new Response(JSON.stringify([{ Name: "測試休市", Date: "1151009", Description: "休市" }]));
  };
  try {
    const { isTradingDay } = await import("../lib/market-hours.ts?retry-test");
    const friday = { isoDate: "2026-10-09", minutes: 720, dayOfWeek: 5 };
    const results = await Promise.all(Array.from({ length: 30 }, () => isTradingDay(friday)));
    assert.ok(results.every(Boolean)); // 故障時沿用既有週間判斷
    assert.equal(requests, 1);
    for (let i = 0; i < 30; i++) await isTradingDay(friday);
    assert.equal(requests, 1);
    failed = false;
    now += 60_001;
    assert.equal(await isTradingDay(friday), false);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
