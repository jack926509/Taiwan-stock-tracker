import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
const directory = new URL("../supabase/migrations/", import.meta.url);
const migration = "20261015040817_personal_alert_events.sql";
const at = "2026-10-15T02:30:00Z";
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const file of ["20260612140245_init_taiwan_stock_tracker.sql", "20260613123937_add_alert_hit_timestamps.sql", "20260706134143_add_change_and_volume_alerts.sql", migration]) {
    const sql = (await readFile(new URL(file, directory), "utf8")).replace("create extension if not exists pgcrypto with schema extensions;", "");
    await db.exec(sql);
  }
});
after(async () => { await db?.close(); });

async function seed(id) {
  await db.query("insert into watchlist(stock_id,market,name,alert_high,alert_change_pct) values($1,'tse','測試股票',100,5)", [id]);
  return (await db.query("select alert_versions from watchlist where stock_id=$1", [id])).rows[0].alert_versions;
}
async function capture(id, kind, version, time = at) {
  return (await db.query("select capture_alert_event($1,$2,$3,$4::timestamptz,$4::timestamptz,110,$5,0.1,1000) as event", [id, kind, version, time, kind === "change" ? 5 : 100])).rows[0].event;
}

test("觸發事件與 hit 在同一交易保存，重複檢查不能重建同一事件", async () => {
  const versions = await seed("2330");
  const event = await capture("2330", "high", versions.high);
  assert.equal(event.stockId, "2330");
  assert.equal(event.price, 110);
  assert.equal(event.notification.state, "pending");
  const row = (await db.query("select alert_high_hit_at from watchlist where stock_id='2330'")).rows[0];
  assert.ok(row.alert_high_hit_at);
  assert.equal(await capture("2330", "high", versions.high), null);
  assert.equal((await db.query("select count(*)::int as n from news_cache where cache_key like 'alert:event:%'")).rows[0].n, 1);
});

test("舊設定的候選事件不能覆蓋新設定，單項重新啟用不改其他版本", async () => {
  const versions = await seed("2317");
  await db.query("update watchlist set alert_high=105 where stock_id='2317'");
  assert.equal(await capture("2317", "high", versions.high), null);
  const current = (await db.query("select alert_versions from watchlist where stock_id='2317'")).rows[0].alert_versions;
  assert.notEqual(current.high, versions.high);
  assert.equal(current.change, versions.change);
  await db.query("update watchlist set alert_versions=$1 where stock_id='2317'", [{ high: "manual-rearm" }]);
  const rearmed = (await db.query("select alert_versions from watchlist where stock_id='2317'")).rows[0].alert_versions;
  assert.equal(rearmed.high, "manual-rearm");
  assert.equal(rearmed.change, versions.change);
});

test("漲跌幅每天最多一次，跨台北日期產生新事件並保留歷史", async () => {
  const versions = await seed("0050");
  assert.ok(await capture("0050", "change", versions.change));
  assert.equal(await capture("0050", "change", versions.change), null);
  assert.ok(await capture("0050", "change", versions.change, "2026-10-16T02:30:00Z"));
  assert.equal((await db.query("select count(*)::int as n from news_cache where cache_key like 'alert:event:0050:%'")).rows[0].n, 2);
});

test("外層交易失敗時事件與 hit 一起回復", async () => {
  const versions = await seed("2308");
  await db.exec("begin");
  assert.ok(await capture("2308", "high", versions.high));
  await db.exec("rollback");
  assert.equal((await db.query("select alert_high_hit_at from watchlist where stock_id='2308'")).rows[0].alert_high_hit_at, null);
  assert.equal((await db.query("select count(*)::int as n from news_cache where cache_key like 'alert:event:2308:%'")).rows[0].n, 0);
});

test("事件函式不可由匿名角色呼叫", async () => {
  await db.exec("set role anon");
  try { await assert.rejects(capture("2330", "high", "initial"), /permission denied/); }
  finally { await db.exec("reset role"); }
});

async function claim(key, id, time) {
  return (await db.query("select claim_alert_delivery($1,$2,$3) as event", [key, id, time])).rows[0].event;
}
async function finish(key, id, state, time, retryable = false) {
  return (await db.query("select finish_alert_delivery($1,$2,$3,'network',$4,$5) as ok", [key, id, state, retryable, time])).rows[0].ok;
}
const later = seconds => new Date(Date.parse(at) + seconds * 1000).toISOString();

test("通知工作不可同時被重複認領；重試沿用識別且舊工作不能覆寫新結果", async () => {
  const versions = await seed("2331");
  const event = await capture("2331", "high", versions.high);
  const first = await claim(event.key, "worker-1", at);
  assert.equal(first.notification.attempts, 1);
  assert.equal(await claim(event.key, "worker-2", at), null);
  assert.equal(await finish(event.key, "worker-1", "failed", at, true), true);
  assert.equal(await claim(event.key, "worker-2", later(30)), null);
  const second = await claim(event.key, "worker-2", later(61));
  assert.equal(second.notification.retryKey, first.notification.retryKey);
  assert.equal(second.notification.attempts, 2);
  assert.equal(await finish(event.key, "worker-1", "accepted", later(62)), false);
  assert.equal(await finish(event.key, "worker-2", "accepted", later(62)), true);
  assert.equal(await claim(event.key, "worker-3", later(123)), null);
});

test("通知重試最多三次，超過十五分鐘的待處理事件也會停止", async () => {
  const versions = await seed("2332");
  const event = await capture("2332", "high", versions.high);
  for (const [i, seconds] of [0, 61, 362].entries()) {
    const item = await claim(event.key, `attempt-${i}`, later(seconds));
    assert.equal(item.notification.attempts, i + 1);
    await finish(event.key, `attempt-${i}`, "failed", later(seconds), true);
  }
  assert.equal(await claim(event.key, "attempt-4", later(700)), null);
  const expiredVersions = await seed("2333");
  const expired = await capture("2333", "high", expiredVersions.high);
  assert.equal(await claim(expired.key, "too-late", later(901)), null);
  const result = (await db.query("select payload from news_cache where cache_key=$1", [expired.key])).rows[0].payload;
  assert.equal(result.notification.state, "failed");
  assert.equal(result.notification.reason, "retry-expired");
});

test("LINE 用量以交易保留，同一重試識別不重算且不超過每日上限", async () => {
  const reserve = async key => (await db.query("select reserve_line_quota($1,$2,2) as allowed", [key, at])).rows[0].allowed;
  const key = crypto.randomUUID();
  assert.equal(await reserve(key), true);
  assert.equal(await reserve(key), true);
  assert.equal(await reserve(crypto.randomUUID()), true);
  assert.equal(await reserve(crypto.randomUUID()), false);
  const usage = (await db.query("select payload from news_cache where cache_key='meta:line-usage'")).rows[0].payload;
  assert.equal(usage.dayCount, 2);
  assert.equal(usage.count, 2);
});

test("等待重試的舊事件不會擋住後面的新事件，收盤後過期事件也可歸檔", async () => {
  const keys = [];
  for(let i=0;i<6;i++) {
    const id=String(2400+i), versions=await seed(id);
    const event=await capture(id,"high",versions.high);
    keys.push(event.key);
    if(i<5) { await claim(event.key,`hold-${i}`,at); await finish(event.key,`hold-${i}`,"failed",at,true); }
  }
  const ready=(await db.query("select list_ready_alert_events($1,5) as events",[later(30)])).rows[0].events;
  assert.ok(ready.some(event=>event.key===keys[5]));
  assert.ok(!ready.some(event=>keys.slice(0,5).includes(event.key)));
  await db.query("select list_ready_alert_events($1,5)",[later(901)]);
  const expired=(await db.query("select payload from news_cache where cache_key=$1",[keys[0]])).rows[0].payload;
  assert.equal(expired.notification.state,"failed");
});

test("服務角色可執行事件流程，重跑待套用 migration 不清除事件與設定",async()=>{
  const versions=await seed("2500");
  await db.exec("set role service_role");
  try { assert.ok(await capture("2500","high",versions.high)); }
  finally { await db.exec("reset role"); }
  const before=(await db.query("select count(*)::int as n from news_cache where cache_key like 'alert:event:%'")).rows[0].n;
  await db.exec(await readFile(new URL(migration,directory),"utf8"));
  const after=(await db.query("select count(*)::int as n from news_cache where cache_key like 'alert:event:%'")).rows[0].n;
  assert.equal(after,before);
  assert.equal((await db.query("select alert_high from watchlist where stock_id='2500'")).rows[0].alert_high,"100");
});
