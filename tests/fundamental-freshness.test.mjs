import test from "node:test";
import assert from "node:assert/strict";
import { mergeFundamental, FUNDAMENTAL_KEYS } from "../lib/fundamentalFreshness.ts";

const empty = () => ({ institutional: [], revenue: [], valuation: null, eps: [], dividend: [] });
const oldAt = "2026-10-14T08:00:00.000Z";
const now = new Date("2026-10-15T08:00:00.000Z");
const oldData = () => ({ ...empty(), valuation: { date: "2026-10-14", per: 20 }, revenue: [{ year: 2026, month: 9, revenue: 100 }] });

test("部分失敗保留該項舊資料與成功時間，其他資料照常更新", () => {
  const fresh = { ...empty(), revenue: [{ year: 2026, month: 10, revenue: 200 }] };
  const result = mergeFundamental(fresh, ["valuation"], { data: oldData(), fetchedAt: oldAt }, now);
  assert.equal(result.valuation.per, 20);
  assert.deepEqual(result.freshness.valuation, { state: "stale", lastSuccessAt: oldAt });
  assert.equal(result.revenue[0].revenue, 200);
  assert.deepEqual(result.freshness.revenue, { state: "ok", lastSuccessAt: now.toISOString() });
});

test("連續失敗不更新上次成功時間，恢復後解除舊資料狀態", () => {
  const first = mergeFundamental(empty(), ["valuation"], { data: oldData(), fetchedAt: oldAt }, now);
  const later = new Date("2026-10-16T08:00:00.000Z");
  const again = mergeFundamental(empty(), ["valuation"], { data: first, fetchedAt: now.toISOString() }, later);
  assert.equal(again.freshness.valuation.lastSuccessAt, oldAt);
  const recovered = mergeFundamental(oldData(), [], { data: again, fetchedAt: now.toISOString() }, later);
  assert.equal(recovered.freshness.valuation.state, "ok");
  assert.equal(recovered.freshness.valuation.lastSuccessAt, later.toISOString());
});

test("成功但無資料與抓取失敗不同；成功空回應可取代舊資料", () => {
  const result = mergeFundamental(empty(), ["eps"], { data: oldData(), fetchedAt: oldAt }, now);
  assert.equal(result.valuation, null);
  assert.equal(result.freshness.valuation.state, "empty");
  assert.deepEqual(result.freshness.eps, { state: "unavailable", lastSuccessAt: null });
});

test("完全無快取且所有資料失敗時，五項均明確標示無法取得", () => {
  const result = mergeFundamental(empty(), FUNDAMENTAL_KEYS, null, now);
  assert.ok(FUNDAMENTAL_KEYS.every(key => result.freshness[key].state === "unavailable"));
});
