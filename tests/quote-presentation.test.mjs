import assert from "node:assert/strict";
import { test } from "node:test";
import { formatQuoteAsOf, quoteWarnings, quoteRefreshFeedback } from "../lib/quoteStatus.ts";
import { nextQuotePollingState } from "../lib/quotePollingState.ts";
import { saveWatchlistOrder } from "../lib/watchlistOrder.ts";
import { hasAnyAlert } from "../lib/alertBadge.ts";

const NOW = Date.parse("2026-10-08T02:30:00.000Z");
const quote = (overrides = {}) => ({
  asOf: new Date(NOW).toISOString(), source: "mis", complete: true, marketOpen: true,
  indices: [], quotes: [{ stockId: "2330", price: 950, volume: 100, time: "10:30:00", asOf: new Date(NOW).toISOString() }],
  ...overrides,
});

test("行情時間包含台北日期，不因無效或未知日期拋出 RangeError", () => {
  assert.match(formatQuoteAsOf("2026-10-07T18:30:00.000Z"), /2026\/10\/08.*02:30:00/);
  for (const unknown of [undefined, null, "", "invalid"]) {
    assert.equal(formatQuoteAsOf(unknown), null);
  }
});

test("Yahoo 與舊快照文案顯示日期及暫停提醒，缺漏文案不稱完整", () => {
  const yahoo = quoteWarnings(quote({ source: "yahoo", complete: false })).join(" ");
  assert.match(yahoo, /Yahoo.*可能延遲.*2026\/10\/08.*暫停即時提醒/);
  assert.match(yahoo, /部分股票報價缺漏/);
  const stale = quoteWarnings(quote({ source: "stale" })).join(" ");
  assert.match(stale, /舊報價快照.*2026\/10\/08.*不觸發即時提醒/);
  assert.match(quoteWarnings(quote({ asOf: null })).join(" "), /日期時間未知/);
  assert.deepEqual(quoteWarnings(quote()), []);
});

test("手動更新讀到相同快取、備援或未知日期不回報成功更新", () => {
  const previous = quote();
  for (const data of [
    quote(), quote({ source: "stale" }), quote({ source: "yahoo" }),
    quote({ complete: false }), quote({ asOf: null }), quote({ asOf: "invalid" }),
    quote({ asOf: new Date(NOW + 1).toISOString() }),
    quote({ asOf: new Date(NOW - 120_001).toISOString() }), undefined,
  ]) {
    const feedback = quoteRefreshFeedback(data, previous, NOW);
    assert.equal(feedback.tone, "info");
    assert.notEqual(feedback.message, "報價已更新");
  }
});

test("手動更新取得新鮮且有變動的 MIS 才回報報價已更新", () => {
  const previous = quote({ quotes: [{ stockId: "2330", price: 949, time: "10:29:50" }] });
  assert.deepEqual(quoteRefreshFeedback(quote(), previous, NOW), {
    message: "報價已更新", tone: "success",
  });
});

test("持續備援、缺漏或未知日期不觸發輪詢暫停，恢復 MIS 後重新計數", () => {
  for (const overrides of [{ source: "yahoo" }, { source: "stale" }, { complete: false }, { asOf: null }]) {
    let state = { key: "old", repeats: 10, autoPaused: true };
    for (let i = 0; i < 40; i++) state = nextQuotePollingState(state, quote(overrides));
    assert.deepEqual(state, { key: "", repeats: 0, autoPaused: false });
    const recovered = nextQuotePollingState(state, quote());
    assert.equal(recovered.repeats, 0);
    assert.equal(recovered.autoPaused, false);
  }
});

test("完整 MIS 連續相同行情仍保留異常暫停，新的行情解除計數", () => {
  let state = { key: "", repeats: 0, autoPaused: false };
  for (let i = 0; i < 7; i++) state = nextQuotePollingState(state, quote());
  assert.equal(state.autoPaused, true);
  state = nextQuotePollingState(state, quote({
    quotes: [{ stockId: "2330", asOf: new Date(NOW + 10_000).toISOString() }],
  }));
  assert.equal(state.repeats, 0);
  assert.equal(state.autoPaused, false);
});

test("排序儲存保留原順序資料，HTTP 500 或斷線必須傳回失敗", async () => {
  const order = ["2317", "2330"];
  const requests = [];
  await saveWatchlistOrder(order, async (url, options) => {
    requests.push({ url, options });
    return new Response("{}", { status: 200 });
  });
  assert.equal(requests[0].url, "/api/watchlist");
  assert.equal(requests[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[0].options.body), { order });
  await assert.rejects(saveWatchlistOrder(order, async () => new Response("{}", { status: 500 })), /HTTP 500/);
  await assert.rejects(saveWatchlistOrder(order, async () => { throw new Error("離線"); }), /離線/);
});

test("已設提醒的篩選判斷包含漲跌幅及爆量", () => {
  const empty = { alert_high: null, alert_low: null, alert_change_pct: null, alert_volume_on: false };
  assert.equal(hasAnyAlert(empty), false);
  assert.equal(hasAnyAlert({ ...empty, alert_change_pct: 5 }), true);
  assert.equal(hasAnyAlert({ ...empty, alert_volume_on: true }), true);
});

test("quoteDelayLabel：只在落後時回傳延遲字串", async () => {
  const { quoteDelayLabel } = await import("../lib/quoteStatus.ts");
  const latest = "2026-10-08T05:30:00.000Z"; // 台北 13:30
  assert.equal(quoteDelayLabel("2026-10-08T05:30:00.000Z", latest), null);
  assert.equal(quoteDelayLabel("2026-10-08T05:25:00.000Z", latest), null); // 5 分鐘內不算
  assert.equal(quoteDelayLabel("2026-10-08T05:10:00.000Z", latest), "延遲 13:10");
  assert.equal(quoteDelayLabel("2026-10-07T05:30:00.000Z", latest), "延遲 10/07 13:30");
  assert.equal(quoteDelayLabel(undefined, latest), null);
  assert.equal(quoteDelayLabel(latest, null), null);
});
