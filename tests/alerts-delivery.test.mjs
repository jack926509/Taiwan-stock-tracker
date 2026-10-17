import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerHooks } from "node:module";

const NOW = new Date("2026-10-08T02:30:00.000Z"); // 台北 10:30
const originalDateNow = Date.now;
const calls = { push: [], hit: [], kline: [], capture: [], monitor: [], targets: [] };
let configured;
let captureFails;
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
      "@/lib/alertEvents": "export const captureAlertEvent = (...args) => globalThis.__alertDelivery.capture(...args);",
      "@/lib/alertDelivery": "export const deliverAlertEvents = () => globalThis.__alertDelivery.deliver();",
      "@/lib/alertMonitorStore": "export const saveAlertMonitor = (...args) => globalThis.__alertDelivery.monitor(...args);",
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
  monitor:async(...args)=>calls.monitor.push(...args),
  list: async () => items,
  fetch: async (targets) => { calls.targets.push(targets); return result; },
  hit: async (...args) => calls.hit.push(args),
  push: async (messages) => { calls.push.push(messages); return pushOk; },
  capture: async (row, decision, quote, at) => {
    if(row.stock_id===captureFails)throw new Error("測試保存失敗");
    calls.capture.push({ row, decision, quote });
    calls.hit.push([row.stock_id, decision.kind, at.toISOString()]);
    return {};
  },
  deliver: async () => {
    if (!configured) return 0;
    for (const event of calls.capture) calls.push.push([event]);
    return pushOk ? calls.capture.length : 0;
  },
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
  calls.capture.length = 0;
  calls.monitor.length = 0;
  calls.targets.length = 0;
  configured = true;
  captureFails = null;
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

test("LINE 回傳失敗仍保留觸發紀錄，由通知佇列負責重試", async () => {
  fixture();
  pushOk = false;
  assert.equal(await checkAlerts(NOW), 0);
  assert.equal(calls.push.length, 1);
  assert.deepEqual(calls.hit, [["2330", "high", NOW.toISOString()]]);
  assert.equal(calls.capture.length, 1);
});

test("沒有設定 LINE 仍執行條件檢查並保存觸發紀錄", async () => {
  fixture(); configured = false;
  assert.equal(await checkAlerts(NOW), 0);
  assert.equal(calls.capture.length, 1);
  assert.deepEqual(calls.push, []);
});

test("一檔事件儲存失敗仍檢查其他股票及通知，最後回報部分失敗",async()=>{
  fixture(); captureFails="2330";
  items.push({...items[0],stock_id:"2317",name:"鴻海"});
  result.quotes.push({...result.quotes[0],stockId:"2317",name:"鴻海"});
  await assert.rejects(checkAlerts(NOW),/部分提醒/);
  assert.deepEqual(calls.hit,[["2317","high",NOW.toISOString()]]);
  assert.equal(calls.push.length,1);
});

test("後端保存本次實際檢查來源、觸發數與各股略過原因",async()=>{
  fixture();await checkAlerts(NOW);
  assert.equal(calls.monitor[0].source,"mis");
  assert.equal(calls.monitor[0].rows["2330"].status,"triggered");
  assert.equal(calls.monitor[0].rows["2330"].captured,1);
  fixture({source:"yahoo"});await checkAlerts(NOW);
  assert.equal(calls.monitor[0].rows["2330"].status,"reference-only");
  fixture();result.quotes[0].asOf=new Date(NOW.getTime()-120_001).toISOString();await checkAlerts(NOW);
  assert.equal(calls.monitor[0].rows["2330"].status,"quote-expired");
});
test("部分事件保存失敗仍留下實際失敗狀態，不能記成檢查成功",async()=>{
  fixture();captureFails="2330";
  await assert.rejects(checkAlerts(NOW));
  assert.equal(calls.monitor[0].outcome,"failed");
  assert.equal(calls.monitor[0].rows["2330"].status,"storage-error");
});

test("既有興櫃提醒僅列參考，不送入 MIS 批次，也不阻擋正常上市提醒", async () => {
  fixture();
  items.push({ ...items[0], stock_id: "7930", market: "emerging", name: "威世波", alert_high: 200 });
  assert.equal(await checkAlerts(NOW), 1);
  assert.deepEqual(calls.targets, [[{ stockId: "2330", market: "tse" }]]);
  assert.deepEqual(calls.capture.map(event => event.row.stock_id), ["2330"]);
  assert.equal(calls.monitor.at(-1).rows["7930"].status, "reference-only");
  assert.equal(items[1].alert_high, 200);
});

test("全部是興櫃提醒時保留設定，不抓 MIS 或建立觸發事件", async () => {
  fixture();
  items = [{ ...items[0], stock_id: "7930", market: "emerging", name: "威世波" }];
  assert.equal(await checkAlerts(NOW), 0);
  assert.equal(calls.targets.length, 0);
  assert.equal(calls.capture.length, 0);
  assert.equal(calls.monitor.at(-1).rows["7930"].status, "reference-only");
});

test("錯標完整 MIS 批次中的參考來源單檔不能觸發提醒", async () => {
  fixture();
  result.quotes[0].source = "tpex";
  assert.equal(await checkAlerts(NOW), 0);
  assert.equal(calls.capture.length, 0);
});
