// checkAlerts 核心判斷邏輯（lib/alerts.ts:101-181 抽出的純函式）測試：
// 到價漲破/跌破觸發與已觸發不重複、漲跌幅每日一次性重武裝、爆量觸發與均量缺料跳過不誤報。
import assert from "node:assert/strict";
import { test } from "node:test";
import { isArmed, decideAlerts, hitToday } from "../lib/alertLogic.ts";

const NOW = new Date("2026-07-06T02:30:00.000Z"); // 台北 10:30

function watchItem(overrides = {}) {
  return {
    stock_id: "2330",
    market: "tse",
    name: "台積電",
    group_name: "預設",
    alert_high: null,
    alert_low: null,
    alert_high_hit_at: null,
    alert_low_hit_at: null,
    alert_change_pct: null,
    alert_change_hit_at: null,
    alert_volume_on: false,
    alert_volume_hit_at: null,
    sort_order: 0,
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    stockId: "2330",
    name: "台積電",
    price: 1000,
    change: 0,
    changePct: 0,
    open: 990,
    high: 1010,
    low: 985,
    volume: 10000,
    time: "10:30",
    ...overrides,
  };
}

// ---------- 到價：漲破 ----------

test("到價漲破：門檻已武裝、現價穿越門檻 → 觸發 high", () => {
  const row = watchItem({ alert_high: 900 });
  const decisions = decideAlerts(row, quote({ price: 950 }), null, NOW);
  assert.deepEqual(decisions, [{ kind: "high", threshold: 900 }]);
});

test("到價漲破：現價未達門檻 → 不觸發", () => {
  const row = watchItem({ alert_high: 900 });
  const decisions = decideAlerts(row, quote({ price: 850 }), null, NOW);
  assert.equal(decisions.length, 0);
});

test("到價漲破：已觸發過（hit_at 非 null）→ 即使現價仍高於門檻也不重複觸發", () => {
  const row = watchItem({
    alert_high: 900,
    alert_high_hit_at: "2026-07-05T05:00:00.000Z",
  });
  const decisions = decideAlerts(row, quote({ price: 950 }), null, NOW);
  assert.equal(decisions.length, 0);
});

// ---------- 到價：跌破 ----------

test("到價跌破：門檻已武裝、現價穿越門檻 → 觸發 low", () => {
  const row = watchItem({ alert_low: 900 });
  const decisions = decideAlerts(row, quote({ price: 850 }), null, NOW);
  assert.deepEqual(decisions, [{ kind: "low", threshold: 900 }]);
});

test("到價跌破：已觸發過 → 不重複觸發", () => {
  const row = watchItem({
    alert_low: 900,
    alert_low_hit_at: "2026-07-05T05:00:00.000Z",
  });
  const decisions = decideAlerts(row, quote({ price: 850 }), null, NOW);
  assert.equal(decisions.length, 0);
});

// ---------- 漲跌幅：每日一次性 ----------

test("漲跌幅：達門檻且今天未觸發過 → 觸發 change", () => {
  const row = watchItem({ alert_change_pct: 5 });
  const decisions = decideAlerts(row, quote({ changePct: 0.06 }), null, NOW);
  assert.deepEqual(decisions, [{ kind: "change", threshold: 5 }]);
});

test("漲跌幅：跌幅（負值）達門檻絕對值 → 也觸發", () => {
  const row = watchItem({ alert_change_pct: 5 });
  const decisions = decideAlerts(row, quote({ changePct: -0.08 }), null, NOW);
  assert.deepEqual(decisions, [{ kind: "change", threshold: 5 }]);
});

test("漲跌幅：今天已觸發過（hit_at 為今天）→ 不重複觸發", () => {
  const row = watchItem({
    alert_change_pct: 5,
    alert_change_hit_at: "2026-07-06T01:00:00.000Z", // 同一台北日
  });
  const decisions = decideAlerts(row, quote({ changePct: 0.06 }), null, NOW);
  assert.equal(decisions.length, 0);
});

test("漲跌幅：跨日自動重新武裝（hit_at 是昨天）→ 今天可再觸發", () => {
  const row = watchItem({
    alert_change_pct: 5,
    alert_change_hit_at: "2026-07-05T01:00:00.000Z", // 前一台北日
  });
  const decisions = decideAlerts(row, quote({ changePct: 0.06 }), null, NOW);
  assert.deepEqual(decisions, [{ kind: "change", threshold: 5 }]);
});

test("hitToday：同一台北日回 true，不同台北日回 false", () => {
  assert.equal(hitToday("2026-07-06T01:00:00.000Z", NOW), true);
  assert.equal(hitToday("2026-07-05T10:00:00.000Z", NOW), false);
  assert.equal(hitToday(null, NOW), false);
});

// ---------- 爆量 ----------

test("爆量：現量達近 5 日均量 2 倍以上 → 觸發 volume", () => {
  const row = watchItem({ alert_volume_on: true });
  const decisions = decideAlerts(row, quote({ volume: 20000 }), 10000, NOW);
  assert.deepEqual(decisions, [{ kind: "volume", threshold: 10000 }]);
});

test("爆量：現量未達 2 倍 → 不觸發", () => {
  const row = watchItem({ alert_volume_on: true });
  const decisions = decideAlerts(row, quote({ volume: 15000 }), 10000, NOW);
  assert.equal(decisions.length, 0);
});

test("爆量：均量缺料（null，日 K 快取不足 5 根）→ 跳過不誤報", () => {
  const row = watchItem({ alert_volume_on: true });
  const decisions = decideAlerts(row, quote({ volume: 999999 }), null, NOW);
  assert.equal(decisions.length, 0);
});

test("爆量：今天已觸發過 → 不重複觸發", () => {
  const row = watchItem({
    alert_volume_on: true,
    alert_volume_hit_at: "2026-07-06T01:00:00.000Z",
  });
  const decisions = decideAlerts(row, quote({ volume: 20000 }), 10000, NOW);
  assert.equal(decisions.length, 0);
});

// ---------- 綜合：同一輪可能同時觸發多種提醒 ----------

test("同一檔股票同一輪可同時觸發到價與漲跌幅", () => {
  const row = watchItem({ alert_high: 900, alert_change_pct: 5 });
  const decisions = decideAlerts(
    row,
    quote({ price: 950, changePct: 0.06 }),
    null,
    NOW
  );
  const kinds = decisions.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["change", "high"]);
});

test("報價缺價（price 為 null）→ 不觸發任何提醒", () => {
  const row = watchItem({ alert_high: 900, alert_low: 100, alert_change_pct: 1 });
  const decisions = decideAlerts(row, quote({ price: null }), null, NOW);
  assert.equal(decisions.length, 0);
});

test("查無報價（quote 為 undefined）→ 不觸發任何提醒", () => {
  const row = watchItem({ alert_high: 900 });
  const decisions = decideAlerts(row, undefined, null, NOW);
  assert.equal(decisions.length, 0);
});

// ---------- isArmed：過濾要抓報價的清單 ----------

test("isArmed：無任何提醒設定 → 不武裝", () => {
  assert.equal(isArmed(watchItem(), NOW), false);
});

test("isArmed：到價門檻已設定且未觸發 → 武裝", () => {
  assert.equal(isArmed(watchItem({ alert_high: 900 }), NOW), true);
});

test("isArmed：到價門檻已觸發（hit_at 非 null）→ 不武裝", () => {
  assert.equal(
    isArmed(
      watchItem({ alert_high: 900, alert_high_hit_at: "2026-07-05T05:00:00.000Z" }),
      NOW
    ),
    false
  );
});

test("isArmed：漲跌幅門檻今天已觸發 → 不武裝；跨日則重新武裝", () => {
  const hitToday_ = watchItem({
    alert_change_pct: 5,
    alert_change_hit_at: "2026-07-06T01:00:00.000Z",
  });
  const hitYesterday = watchItem({
    alert_change_pct: 5,
    alert_change_hit_at: "2026-07-05T01:00:00.000Z",
  });
  assert.equal(isArmed(hitToday_, NOW), false);
  assert.equal(isArmed(hitYesterday, NOW), true);
});
