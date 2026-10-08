import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerHooks } from "node:module";

const NOW = new Date("2026-10-08T02:30:00.000Z"); // 台北 10:30
const originalDateNow = Date.now;
const calls = { push: [], hit: [], kline: [] };
let items;
let result;
let pushOk;
let klineDelay;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/store": "export const listWatchlist = () => globalThis.__alertDelivery.list(); export const markAlertHit = (...args) => globalThis.__alertDelivery.hit(...args);",
      "@/lib/providers/quoteProvider": "export const fetchQuotes = (...args) => globalThis.__alertDelivery.fetch(...args);",
      "@/lib/klineStore": "export const loadKline = (...args) => globalThis.__alertDelivery.kline(...args);",
      "@/lib/notify": "export const lineConfigured = () => true; export const pushLineMessages = (...args) => globalThis.__alertDelivery.push(...args);",
    };
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__alertDelivery = {
  list: async () => items,
  fetch: async () => result,
  hit: async (...args) => calls.hit.push(args),
  push: async (messages) => { calls.push.push(messages); return pushOk; },
  kline: async (id) => {
    calls.kline.push(id);
    Date.now = () => NOW.getTime() + klineDelay;
    return Array.from({ length: 5 }, () => ({ volume: 100 }));
  },
};

const { checkAlerts } = await import("../lib/alerts.ts");

function fixture(overrides = {}) {
  calls.push.length = 0;
  calls.hit.length = 0;
  calls.kline.length = 0;
  pushOk = true;
  klineDelay = 0;
  Date.now = () => NOW.getTime();
  items = [{
    stock_id: "2330", market: "tse", name: "台積電", group_name: "預設",
    alert_high: 900, alert_low: null, alert_high_hit_at: null, alert_low_hit_at: null,
    alert_change_pct: null, alert_change_hit_at: null, alert_volume_on: false,
    alert_volume_hit_at: null, sort_order: 0,
  }];
  result = {
    source: "mis", complete: true, asOf: NOW.toISOString(),
    quotes: [{
      stockId: "2330", market: "tse", name: "台積電", price: 950,
      prevClose: 900, change: 50, changePct: 50 / 900,
      open: 910, high: 955, low: 905, volume: 300, traded: true, time: "10:30:00", asOf: NOW.toISOString(),
    }],
    ...overrides,
  };
}

afterEach(() => { Date.now = originalDateNow; });

test("新鮮完整 MIS 到價仍推播且成功後標記 hit", async () => {
  fixture();
  assert.equal(await checkAlerts(NOW), 1);
  assert.equal(calls.push.length, 1);
  assert.deepEqual(calls.hit, [["2330", "high", NOW.toISOString()]]);
});

for (const source of ["yahoo", "stale", undefined]) {
  test(`${source ?? "缺少來源"} 報價即使穿越門檻也不推播、不標記`, async () => {
    fixture({ source });
    assert.equal(await checkAlerts(NOW), 0);
    assert.deepEqual(calls.push, []);
    assert.deepEqual(calls.hit, []);
  });
}

for (const [label, overrides] of [
  ["不完整", { complete: false }],
  ["缺少完整性", { complete: undefined }],
]) {
  test(`MIS ${label} 時安全略過通知`, async () => {
    fixture(overrides);
    assert.equal(await checkAlerts(NOW), 0);
    assert.deepEqual(calls.push, []);
    assert.deepEqual(calls.hit, []);
  });
}

for (const [label, batchAsOf, otherAsOf] of [
  ["過舊", new Date(NOW.getTime() - 600_000).toISOString(), new Date(NOW.getTime() - 600_000).toISOString()],
  ["缺少日期", null, undefined],
]) {
  test(`一檔 MIS ${label} 不阻擋另一檔可信新鮮行情提醒`, async () => {
    fixture({ asOf: batchAsOf });
    items.push({ ...items[0], stock_id: "2317", name: "鴻海" });
    result.quotes.push({ ...result.quotes[0], stockId: "2317", name: "鴻海", asOf: otherAsOf });
    assert.equal(await checkAlerts(NOW), 1);
    assert.equal(calls.push.length, 1);
    assert.deepEqual(calls.hit, [["2330", "high", NOW.toISOString()]]);
  });
}

test("MIS 即使標示完整，缺少任一武裝股票仍不推播", async () => {
  fixture();
  items.push({ ...items[0], stock_id: "2317", name: "鴻海" });
  assert.equal(await checkAlerts(NOW), 0);
  assert.deepEqual(calls.push, []);
});

for (const [label, overrides] of [
  ["未成交參考價", { traded: false }],
  ["無效價格", { price: Infinity }],
  ["空價格", { price: null }],
  ["非正價格", { price: 0 }],
  ["舊交易時間", { asOf: new Date(NOW.getTime() - 120_001).toISOString() }],
  ["未來交易時間", { asOf: new Date(NOW.getTime() + 1).toISOString() }],
  ["缺少交易時間", { asOf: undefined }],
  ["無效交易時間", { asOf: "invalid" }],
  ["錯誤市場", { market: "otc" }],
]) {
  test(`MIS 個別股票 ${label} 不觸發通知`, async () => {
    fixture();
    Object.assign(result.quotes[0], overrides);
    assert.equal(await checkAlerts(NOW), 0);
    assert.deepEqual(calls.push, []);
  });
}

test("可信 MIS 可同輪觸發到價、漲跌幅及爆量", async () => {
  fixture();
  Object.assign(items[0], { alert_change_pct: 5, alert_volume_on: true });
  assert.equal(await checkAlerts(NOW), 3);
  assert.deepEqual(calls.kline, ["2330"]);
  assert.deepEqual(calls.hit.map((args) => args[1]), ["high", "change", "volume"]);
});

test("無效漲跌幅及成交量不觸發對應提醒，仍保留有效到價提醒", async () => {
  fixture();
  Object.assign(items[0], { alert_change_pct: 5, alert_volume_on: true });
  Object.assign(result.quotes[0], { changePct: Infinity, volume: Infinity });
  assert.equal(await checkAlerts(NOW), 1);
  assert.deepEqual(calls.kline, []);
  assert.deepEqual(calls.hit.map((args) => args[1]), ["high"]);
});

test("讀取均量期間報價過期，送出前再次驗證並略過通知", async () => {
  fixture();
  items[0].alert_volume_on = true;
  klineDelay = 120_001;
  assert.equal(await checkAlerts(NOW), 0);
  assert.deepEqual(calls.push, []);
  assert.deepEqual(calls.hit, []);
});

test("跨台北午夜的昨日行情，即使僅一分鐘前也不推播", async () => {
  fixture();
  const midnight = new Date("2026-10-09T16:00:30.000Z"); // 台北 10/10 00:00:30
  const yesterday = "2026-10-09T15:59:30.000Z"; // 台北 10/09 23:59:30
  Date.now = () => midnight.getTime();
  result.asOf = yesterday;
  result.quotes[0].asOf = yesterday;
  assert.equal(await checkAlerts(midnight), 0);
  assert.deepEqual(calls.push, []);
  assert.deepEqual(calls.hit, []);
});

test("LINE 回傳失敗時不標記 hit，保留下一次提醒機會", async () => {
  fixture();
  pushOk = false;
  assert.equal(await checkAlerts(NOW), 0);
  assert.equal(calls.push.length, 1);
  assert.deepEqual(calls.hit, []);
});
