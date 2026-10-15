import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/providers/klineProvider": `export const fetchDailyKline = async () => {
        const state = globalThis.__kline; state.requests++;
        if (state.fail) throw new Error('測試來源失敗');
        return state.incoming;
      };`,
      "@/lib/klineStore": `
        export const loadKline = async () => globalThis.__kline.candles;
        export const saveKline = async (id, old, incoming) => globalThis.__kline.candles = [...old, ...incoming];`,
    };
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier === "@/lib/market-hours") return nextResolve(new URL(`../lib/market-hours.ts?case=${moduleId}`, import.meta.url).href, context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});

const candle = date => ({ date, open: 100, high: 101, low: 99, close: 100, volume: 10 });
let moduleId = 0;
async function withKline(at, run, overrides = {}) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.__kline = { candles: [candle("2023-01-01"), candle("2026-10-14")], incoming: [], requests: 0, fail: false, ...overrides };
  Date.now = () => Date.parse(at);
  globalThis.fetch = async () => new Response(JSON.stringify([
    { Name: "測試休市", Date: "1151009", Description: "休市" },
  ]));
  try {
    const service = await import(`../lib/klineService.ts?case=${++moduleId}`);
    await run(service, new Date(at));
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test("抓取失敗與重試等待都維持待更新，不把舊 K 線重新標為最新", async () => {
  await withKline("2026-10-15T08:00:00Z", async (service, now) => {
    for (let i = 0; i < 2; i++) {
      const result = await service.ensureKlineWithStatus("2330", "2026-10-15", now);
      assert.equal(result.stale, true);
      assert.equal(result.latestDate, "2026-10-14");
      assert.equal(result.expectedDate, "2026-10-15");
    }
    assert.equal(globalThis.__kline.requests, 1);
  }, { fail: true });
});

test("來源成功但仍無最新 K 線時也必須呈現待更新", async () => {
  await withKline("2026-10-15T08:00:00Z", async (service, now) => {
    const result = await service.ensureKlineWithStatus("2330", "2026-10-15", now);
    assert.equal(result.stale, true);
  });
});

test("盤前與盤中尚未完成當日 K 線，前一交易日資料已足夠", async () => {
  for (const at of ["2026-10-15T00:00:00Z", "2026-10-15T04:00:00Z"]) {
    await withKline(at, async (service, now) => {
      const result = await service.ensureKlineWithStatus("2330", "2026-10-15", now);
      assert.equal(result.stale, false);
      assert.equal(result.expectedDate, "2026-10-14");
      assert.equal(globalThis.__kline.requests, 0);
    });
  }
});

test("週末及連假以最近交易日為準，不為日曆日期差反覆抓取", async () => {
  await withKline("2026-10-11T08:00:00Z", async (service, now) => {
    const result = await service.ensureKlineWithStatus("2330", "2026-10-11", now);
    assert.equal(result.expectedDate, "2026-10-08");
    assert.equal(result.stale, false);
    assert.equal(globalThis.__kline.requests, 0);
  }, { candles: [candle("2023-01-01"), candle("2026-10-08")] });
});

test("補抓取得預期交易日後解除待更新，歷史補齊失敗不誤報最新日過期", async () => {
  await withKline("2026-10-15T08:00:00Z", async (service, now) => {
    const result = await service.ensureKlineWithStatus("2330", "2026-10-15", now);
    assert.equal(result.stale, false);
    assert.equal(result.latestDate, "2026-10-15");
  }, { incoming: [candle("2026-10-15")] });
  await withKline("2026-10-15T08:00:00Z", async (service, now) => {
    assert.equal((await service.ensureKlineWithStatus("2330", "2026-10-15", now)).stale, false);
  }, { candles: [candle("2026-10-15")], fail: true });
});

test("沒有歷史快取時，首次失敗後下一次開啟仍可重新抓取", async () => {
  await withKline("2026-10-15T08:00:00Z", async (service, now) => {
    assert.deepEqual((await service.ensureKlineWithStatus("2330", "2026-10-15", now)).candles, []);
    globalThis.__kline.fail = false;
    globalThis.__kline.incoming = [candle("2026-10-15")];
    const result = await service.ensureKlineWithStatus("2330", "2026-10-15", now);
    assert.equal(result.latestDate, "2026-10-15");
    assert.equal(globalThis.__kline.requests, 2);
  }, { candles: [], fail: true });
});
