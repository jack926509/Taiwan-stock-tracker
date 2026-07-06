// 收盤總覽「今日新訊號」差集邏輯測試：newSignalsToday 只應回傳「今天才出現」的訊號，
// 昨天就已存在的訊號（例如連續多天站上 MA20）不應每天重複列出。
import assert from "node:assert/strict";
import { test } from "node:test";
import { newSignalsToday } from "../lib/summarySignals.ts";

function candle(date, close, high, low) {
  return { date, open: close, high: high ?? close + 1, low: low ?? close - 1, close, volume: 1000 };
}

// 19 根平盤（尚不足 20 根，MA20 算不出來）
function flat19() {
  const out = [];
  for (let i = 0; i < 19; i++) {
    out.push(candle(`2026-01-${String(i + 1).padStart(2, "0")}`, 100));
  }
  return out;
}

test("原本無訊號、今日新出現站上 MA20 → 回報為新訊號", () => {
  const existing = flat19();
  const today = candle("2026-01-20", 110);
  const signals = newSignalsToday(existing, today);
  assert.ok(signals.some((s) => s.kind === "ma20-above"));
});

test("昨天就已站上 MA20、今日續站上 → 不算新訊號", () => {
  // existing 湊滿 20 根且已站上 MA20（最後一根急拉，本身就會被 computeSignals(existing) 判定為站上）
  const existing = [...flat19(), candle("2026-01-20", 110)];
  const today = candle("2026-01-21", 111); // 續漲，仍站上 MA20，但不是「今天新出現」
  const signals = newSignalsToday(existing, today);
  assert.ok(!signals.some((s) => s.kind === "ma20-above"));
});

test("existing 為空陣列時，today 觸發的訊號視為全部新訊號", () => {
  const today = candle("2026-01-01", 100);
  const signals = newSignalsToday([], today);
  // 單根資料算不出 MA20/KD/RSI，預期為空陣列而非拋錯
  assert.deepEqual(signals, []);
});

test("KD 黃金交叉：existing 已完成交叉、today 只是延續 → 不重複回報", () => {
  const existing = [];
  let price = 130;
  for (let i = 0; i < 12; i++) {
    price -= 3;
    existing.push(candle(`2026-02-${String(i + 1).padStart(2, "0")}`, price, price + 2, price - 1));
  }
  const last = existing[existing.length - 1];
  existing.push(candle("2026-02-13", last.close + 14, last.close + 15, last.close));
  // existing 本身已經是「黃金交叉剛發生」那一天
  const today = candle("2026-02-14", last.close + 16, last.close + 17, last.close + 15);
  const signals = newSignalsToday(existing, today);
  assert.ok(!signals.some((s) => s.kind === "kd-golden-cross"));
});
