import test from "node:test";
import assert from "node:assert/strict";
import { isHighTouched, isLowTouched, isLiveTodayQuote, highTouchState, lowTouchState } from "../lib/alertTouched.ts";
import { countTodayHitStamps } from "../lib/alertHitCount.ts";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-10-08T05:40:00.000Z"); // 台北 2026-10-08 13:40
const live = { price: 100, traded: true, asOf: "2026-10-08T05:30:00.000Z" };

test("價格越過判斷含等於邊界；無價或未設提醒價一律未越過", () => {
  assert.equal(isHighTouched(100, 100), true);
  assert.equal(isHighTouched(99.99, 100), false);
  assert.equal(isLowTouched(100, 100), true);
  assert.equal(isLowTouched(100.01, 100), false);
  for (const p of [null, undefined, NaN]) {
    assert.equal(isHighTouched(p, 100), false);
    assert.equal(isLowTouched(p, 100), false);
  }
  assert.equal(isHighTouched(100, null), false);
});

test("今日 MIS 已成交價越過提醒價才是 hit；剛好等於提醒價也算", () => {
  assert.equal(highTouchState(100, live, "mis", NOW), "hit");
  assert.equal(highTouchState(99, live, "mis", NOW), "hit");
  assert.equal(highTouchState(101, live, "mis", NOW), "none");
  assert.equal(lowTouchState(100, live, "mis", NOW), "hit");
  assert.equal(lowTouchState(99, live, "mis", NOW), "none");
});

test("未成交、昨日行情、Yahoo 備援、舊快照、缺時間：價格越過也只算 past", () => {
  assert.equal(highTouchState(99, { ...live, traded: false }, "mis", NOW), "past");
  assert.equal(highTouchState(99, { ...live, asOf: "2026-10-07T05:30:00.000Z" }, "mis", NOW), "past");
  assert.equal(highTouchState(99, live, "yahoo", NOW), "past");
  assert.equal(highTouchState(99, live, "stale", NOW), "past");
  assert.equal(highTouchState(99, { ...live, asOf: undefined }, "mis", NOW), "past");
  assert.equal(lowTouchState(101, { ...live, traded: false }, "mis", NOW), "past");
  // 休市日隔天看：10/08 的成交價在 10/10 不是今日
  assert.equal(highTouchState(99, live, "mis", new Date("2026-10-10T02:00:00.000Z")), "past");
});

test("沒有報價或未越過一律 none", () => {
  assert.equal(highTouchState(99, null, "mis", NOW), "none");
  assert.equal(highTouchState(null, live, "mis", NOW), "none");
  assert.equal(isLiveTodayQuote(null, "mis", NOW), false);
});

test("站內今日觸發則數與收盤總覽 countTodayHits 同結果", () => {
  const stamp = (h, l, c, v) => ({ alert_high_hit_at: h, alert_low_hit_at: l, alert_change_hit_at: c, alert_volume_hit_at: v });
  const items = [
    stamp("2026-10-08T01:00:00.000Z", null, null, "2026-10-08T02:00:00.000Z"),
    stamp("2026-10-07T01:00:00.000Z", "2026-10-08T03:00:00.000Z", "2026-10-08T03:00:00.000Z", null),
    stamp(null, null, null, null),
  ];
  assert.equal(countTodayHitStamps(items, NOW), 4);
  // daily-summary.ts 載入伺服端模組，測試不直接匯入；改為確認它的 countTodayHits 仍是同樣四種 hit_at 判斷
  const ref = readFileSync(new URL("../lib/daily-summary.ts", import.meta.url), "utf8");
  const body = ref.slice(ref.indexOf("export function countTodayHits"));
  for (const k of ["high", "low", "change", "volume"]) {
    assert.match(body.slice(0, 600), new RegExp(`hitToday\\(i\\.alert_${k}_hit_at, now\\)`));
  }
  assert.equal(countTodayHitStamps(items, new Date("2026-10-10T02:00:00.000Z")), 0);
});
