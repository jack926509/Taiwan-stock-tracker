import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSignals } from "../lib/signals.ts";

function candle(date, close, high, low) {
  return { date, open: close, high: high ?? close + 1, low: low ?? close - 1, close, volume: 1000 };
}

// 20 根平盤，最後一根急拉：MA20 站上、不驗證 KD/RSI 是否也觸發
function flatThenSpikeUp() {
  const out = [];
  for (let i = 0; i < 19; i++) {
    out.push(candle(`2026-01-${String(i + 1).padStart(2, "0")}`, 100));
  }
  out.push(candle("2026-01-20", 110));
  return out;
}

function flatThenSpikeDown() {
  const out = [];
  for (let i = 0; i < 19; i++) {
    out.push(candle(`2026-01-${String(i + 1).padStart(2, "0")}`, 100));
  }
  out.push(candle("2026-01-20", 90));
  return out;
}

// 連續下跌 12 根後最後一根急拉：KD 黃金交叉
function downThenReboundForKd() {
  const out = [];
  let price = 130;
  for (let i = 0; i < 12; i++) {
    price -= 3;
    out.push(candle(`2026-02-${String(i + 1).padStart(2, "0")}`, price, price + 2, price - 1));
  }
  const last = out[out.length - 1];
  out.push(candle("2026-02-13", last.close + 14, last.close + 15, last.close));
  return out;
}

// 連續上漲 12 根後最後一根重挫：KD 死亡交叉
function upThenDropForKd() {
  const out = [];
  let price = 100;
  for (let i = 0; i < 12; i++) {
    price += 3;
    out.push(candle(`2026-03-${String(i + 1).padStart(2, "0")}`, price, price + 1, price - 2));
  }
  const last = out[out.length - 1];
  out.push(candle("2026-03-13", last.close - 14, last.close, last.close - 15));
  return out;
}

// 連續 20 根上漲：RSI 超買
function allUp(n = 20) {
  const out = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += 2;
    out.push(candle(`2026-04-${String(i + 1).padStart(2, "0")}`, price, price + 1, price - 2));
  }
  return out;
}

// 連續 20 根下跌：RSI 超賣
function allDown(n = 20) {
  const out = [];
  let price = 200;
  for (let i = 0; i < n; i++) {
    price -= 2;
    out.push(candle(`2026-05-${String(i + 1).padStart(2, "0")}`, price, price + 2, price - 1));
  }
  return out;
}

test("空資料回傳空陣列", () => {
  assert.deepEqual(computeSignals([]), []);
});

test("最新收盤高於 MA20 標記站上 MA20", () => {
  const signals = computeSignals(flatThenSpikeUp());
  assert.ok(signals.some((s) => s.kind === "ma20-above" && s.tone === "neutral"));
  assert.ok(!signals.some((s) => s.kind === "ma20-below"));
});

test("最新收盤低於 MA20 標記跌破 MA20", () => {
  const signals = computeSignals(flatThenSpikeDown());
  assert.ok(signals.some((s) => s.kind === "ma20-below" && s.tone === "neutral"));
  assert.ok(!signals.some((s) => s.kind === "ma20-above"));
});

test("K 由下往上穿越 D 標記 KD 黃金交叉（僅最近一根發生才算）", () => {
  const signals = computeSignals(downThenReboundForKd());
  assert.ok(signals.some((s) => s.kind === "kd-golden-cross" && s.tone === "up"));
  assert.ok(!signals.some((s) => s.kind === "kd-death-cross"));
});

test("K 由上往下穿越 D 標記 KD 死亡交叉（僅最近一根發生才算）", () => {
  const signals = computeSignals(upThenDropForKd());
  assert.ok(signals.some((s) => s.kind === "kd-death-cross" && s.tone === "down"));
  assert.ok(!signals.some((s) => s.kind === "kd-golden-cross"));
});

test("RSI 高於 80 標記超買", () => {
  const signals = computeSignals(allUp());
  assert.ok(signals.some((s) => s.kind === "rsi-overbought" && s.tone === "down"));
});

test("RSI 低於 20 標記超賣", () => {
  const signals = computeSignals(allDown());
  assert.ok(signals.some((s) => s.kind === "rsi-oversold" && s.tone === "up"));
});

test("溫和小幅波動時不誤報交叉或極端 RSI", () => {
  const mild = [];
  let price = 100;
  for (let i = 0; i < 30; i++) {
    price += Math.sin(i * 0.9) * 0.5;
    mild.push(candle(`2026-06-${String(i + 1).padStart(2, "0")}`, price));
  }
  const signals = computeSignals(mild);
  assert.ok(!signals.some((s) => s.kind === "kd-golden-cross" || s.kind === "kd-death-cross"));
  assert.ok(!signals.some((s) => s.kind === "rsi-overbought" || s.kind === "rsi-oversold"));
});
