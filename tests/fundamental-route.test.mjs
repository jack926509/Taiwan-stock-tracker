import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/providers/finmind": `export const finmindRows = async (dataset) => {
        const state = globalThis.__fundamental;
        state.requests.push(dataset);
        if (state.failed.includes(dataset)) throw new Error('測試來源失敗');
        return [];
      };`,
      "@/lib/fundamentalStore": `
        export const TTL_MS = 43200000, RETRY_TTL_MS = 1800000;
        export const loadFundamental = async () => globalThis.__fundamental.cached;
        export const saveFundamental = async (id, data, now, ttl) => {
          if (globalThis.__fundamental.saveFails) throw new Error('測試儲存失敗');
          globalThis.__fundamental.saved = { data, ttl };
          return { data, fetchedAt: now.toISOString() };
        };`,
    };
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});

const { GET } = await import("../app/api/fundamental/route.ts");
const empty = { institutional: [], revenue: [], valuation: null, eps: [], dividend: [] };
const cached = () => ({ fetchedAt: "2026-10-14T08:00:00.000Z", expiresAt: "2026-10-14T09:00:00.000Z", data: { ...empty, valuation: { date: "2026-10-14", per: 20 } } });
async function request(overrides = {}) {
  globalThis.__fundamental = { cached: null, failed: [], requests: [], ...overrides };
  const response = await GET({ nextUrl: new URL("http://example.test/api/fundamental?id=2330") });
  assert.equal(response.status, 200);
  return response.json();
}

test("基本面 API 局部失敗仍保留有效估值，並以短快取重試", async () => {
  const body = await request({ cached: cached(), failed: ["TaiwanStockPER"] });
  assert.equal(body.valuation?.per, 20);
  assert.equal(body.freshness.valuation.state, "stale");
  assert.equal(body.freshness.valuation.lastSuccessAt, cached().fetchedAt);
  assert.equal(globalThis.__fundamental.saved.ttl, 1800000);
});

test("來源成功但回空時明確表示無資料並使用正常快取", async () => {
  const body = await request({ cached: cached() });
  assert.equal(body.valuation, null);
  assert.equal(body.freshness.valuation.state, "empty");
  assert.equal(globalThis.__fundamental.saved.ttl, 43200000);
});

test("全部來源失敗且沒有快取仍回傳可呈現的錯誤狀態", async () => {
  const body = await request({ failed: ["TaiwanStockInstitutionalInvestorsBuySell", "TaiwanStockMonthRevenue", "TaiwanStockPER", "TaiwanStockFinancialStatements", "TaiwanStockDividend"] });
  assert.ok(Object.values(body.freshness).every(v => v.state === "unavailable"));
});

test("重試等待內讀到部分失敗快取仍保留原狀態與成功時間", async () => {
  const data = { ...cached().data, freshness: { valuation: { state: "stale", lastSuccessAt: cached().fetchedAt } } };
  const body = await request({ cached: { ...cached(), expiresAt: "2099-01-01T00:00:00.000Z", data } });
  assert.equal(body.freshness.valuation.state, "stale");
  assert.equal(body.freshness.valuation.lastSuccessAt, cached().fetchedAt);
  assert.deepEqual(globalThis.__fundamental.requests, []);
});

test("存新快取失敗時退回舊資料，不能顯示為本次更新成功", async () => {
  const body = await request({ cached: cached(), saveFails: true });
  assert.equal(body.valuation.per, 20);
  assert.equal(body.freshness.valuation.state, "stale");
});
