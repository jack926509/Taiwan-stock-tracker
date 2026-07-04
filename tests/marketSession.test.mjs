import assert from "node:assert/strict";
import { test } from "node:test";
import { getMarketSessionLabel, getMarketSessionDetail } from "../lib/marketSession.ts";

// 2026-01-05 為週一（平日）；2026-01-10 為週六。時間一律以台北時間（UTC+8）換算為 UTC 建構 Date。
function taipeiDate(isoDate, hour, minute) {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Taipei = UTC+8，換算成對應的 UTC 時刻
  return new Date(Date.UTC(y, m - 1, d, hour - 8, minute));
}

test("平日 08:00 → 盤前", () => {
  const d = taipeiDate("2026-01-05", 8, 0);
  assert.equal(getMarketSessionLabel(d), "盤前");
});

test("平日 09:30 → 盤中", () => {
  const d = taipeiDate("2026-01-05", 9, 30);
  assert.equal(getMarketSessionLabel(d), "盤中");
});

test("平日 13:31 → 已收盤", () => {
  const d = taipeiDate("2026-01-05", 13, 31);
  assert.equal(getMarketSessionLabel(d), "已收盤");
});

test("週六任意時間 → 休市", () => {
  const d = taipeiDate("2026-01-10", 10, 0);
  assert.equal(getMarketSessionLabel(d), "休市");
});

test("getMarketSessionDetail：平日 09:00 開盤瞬間 → 盤中・距收盤 270 分", () => {
  const d = taipeiDate("2026-01-05", 9, 0);
  assert.equal(getMarketSessionDetail(d), "盤中・距收盤 270 分");
});

test("getMarketSessionDetail：平日 13:00 → 盤中・距收盤 30 分", () => {
  const d = taipeiDate("2026-01-05", 13, 0);
  assert.equal(getMarketSessionDetail(d), "盤中・距收盤 30 分");
});

test("getMarketSessionDetail：平日 13:29 → 盤中・距收盤 1 分", () => {
  const d = taipeiDate("2026-01-05", 13, 29);
  assert.equal(getMarketSessionDetail(d), "盤中・距收盤 1 分");
});

test("getMarketSessionDetail：平日 08:30 → 盤前・09:00 開盤", () => {
  const d = taipeiDate("2026-01-05", 8, 30);
  assert.equal(getMarketSessionDetail(d), "盤前・09:00 開盤");
});

test("getMarketSessionDetail：平日 13:31 → 已收盤", () => {
  const d = taipeiDate("2026-01-05", 13, 31);
  assert.equal(getMarketSessionDetail(d), "已收盤");
});
