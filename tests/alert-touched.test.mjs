import test from "node:test";
import assert from "node:assert/strict";
import { isHighTouched, isLowTouched, countTouchedAlerts } from "../lib/alertTouched.ts";

test("漲到提醒：現價 ≥ 提醒價才算已觸及（含剛好等於）", () => {
  assert.equal(isHighTouched(101, 100), true);
  assert.equal(isHighTouched(100, 100), true);
  assert.equal(isHighTouched(99.99, 100), false);
});

test("跌到提醒：現價 ≤ 提醒價才算已觸及（含剛好等於）", () => {
  assert.equal(isLowTouched(99, 100), true);
  assert.equal(isLowTouched(100, 100), true);
  assert.equal(isLowTouched(100.01, 100), false);
});

test("無現價或未設提醒價一律未觸及", () => {
  assert.equal(isHighTouched(null, 100), false);
  assert.equal(isHighTouched(undefined, 100), false);
  assert.equal(isHighTouched(NaN, 100), false);
  assert.equal(isHighTouched(100, null), false);
  assert.equal(isLowTouched(null, 100), false);
  assert.equal(isLowTouched(100, null), false);
});

test("countTouchedAlerts：只數已越過的高低價提醒，同檔兩邊都越過算兩則", () => {
  const items = [
    { stock_id: "2330", alert_high: 900, alert_low: null },   // 現價 910 -> 觸及
    { stock_id: "2317", alert_high: 200, alert_low: 150 },    // 現價 180 -> 皆未
    { stock_id: "2454", alert_high: 5000, alert_low: 1000 },   // 現價 1500 -> 高未、低未
    { stock_id: "0050", alert_high: 10, alert_low: 500 },     // 現價 100 -> 高觸及、低觸及
    { stock_id: "9999", alert_high: 1, alert_low: null },     // 無報價 -> 未
  ];
  const prices = { "2330": 910, "2317": 180, "2454": 1500, "0050": 100 };
  assert.equal(countTouchedAlerts(items, (id) => prices[id]), 3);
  assert.equal(countTouchedAlerts([], () => 1), 0);
});
