import assert from "node:assert/strict";
import { test } from "node:test";
import { filterCandlesByRange, klineRangeStats } from "../lib/klineRange.ts";

const candles = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return {
    date: `2026-06-${day}`,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1000 + index,
  };
});

test("5d range returns the latest five trading candles", () => {
  const visible = filterCandlesByRange(candles, "5d");

  assert.equal(visible.length, 5);
  assert.equal(visible[0].date, "2026-06-26");
  assert.equal(visible[4].date, "2026-06-30");
});

test("20d range returns the latest twenty trading candles", () => {
  const visible = filterCandlesByRange(candles, "20d");

  assert.equal(visible.length, 20);
  assert.equal(visible[0].date, "2026-06-11");
});

test("range stats use first and last close", () => {
  const stats = klineRangeStats(candles.slice(0, 5));

  assert.equal(stats.change, 4);
  assert.equal(stats.changePct, 0.04);
  assert.equal(stats.firstDate, "2026-06-01");
  assert.equal(stats.lastDate, "2026-06-05");
});
