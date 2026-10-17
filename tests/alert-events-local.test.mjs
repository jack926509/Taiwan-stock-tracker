import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/providers/emergingProvider") return {url:"data:text/javascript,export const normalizeEmergingMarkets=async items=>items;",shortCircuit:true};
  if (specifier === "@/lib/supabase") return {url:"data:text/javascript,export const getSupabase = () => null;",shortCircuit:true};
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  return nextResolve(specifier,context);
}});
const previousDirectory = process.cwd();
const isolatedDirectory = await mkdtemp(path.join(tmpdir(),"twstock-personal-events-"));
process.chdir(isolatedDirectory);
const { listWatchlist, setAlert, markAlertHit } = await import("../lib/store.ts");
const { captureAlertEvent, claimAlertDelivery, finishAlertDelivery } = await import("../lib/alertEvents.ts");
const { listPersonalRecords, serialPersonalWrite, savePersonalRecord } = await import("../lib/personalRecords.ts");
process.chdir(previousDirectory);
const at = new Date("2026-10-15T02:30:00Z");

test("本機事件保存、單項重新啟用及通知結果串接，不操作正式資料", async () => {
  await setAlert("2330",100,null,null,false);
  const row = (await listWatchlist()).find(item=>item.stock_id==="2330");
  const quote = {stockId:"2330",market:"tse",name:"來源名稱",price:110,changePct:0.1,volume:100,open:100,high:111,low:99,asOf:at.toISOString()};
  const decision = {kind:"high",threshold:100};
  const event = await captureAlertEvent(row,decision,quote,at);
  assert.equal(event.name,"台積電");
  assert.equal(event.high,111);
  assert.equal(await captureAlertEvent(row,decision,quote,at),null);
  assert.equal((await listPersonalRecords("alert:event:")).total,1);
  await setAlert("2330",undefined,undefined,undefined,undefined,["high"]);
  await markAlertHit("2330","high",at.toISOString(),row.alert_versions.high);
  const rearmed = (await listWatchlist()).find(item=>item.stock_id==="2330");
  assert.equal(rearmed.alert_high_hit_at,null);
  assert.equal(await captureAlertEvent(row,decision,quote,at),null);
  const next = await captureAlertEvent(rearmed,decision,quote,at);
  assert.notEqual(next.id,event.id);
  assert.equal((await listPersonalRecords("alert:event:")).total,2);
  const claimed = await claimAlertDelivery(event.key,"local-claim",at);
  assert.equal(claimed.notification.attempts,1);
  await finishAlertDelivery(claimed,{state:"failed",reason:"network",retryable:true},at);
  const afterFailure = await listPersonalRecords("alert:event:");
  assert.equal(afterFailure.items.find(item=>item.key===event.key).data.notification.state,"retry");
  assert.equal(afterFailure.items.find(item=>item.key===next.key).data.notification.state,"pending");
});

test("本機紀錄同步保存不遺失其他項目，列表可分頁且回傳總數", async () => {
  await Promise.all(Array.from({length:12},(_,i)=>serialPersonalWrite(()=>savePersonalRecord(`personal:test:${i}`,{i},at))));
  const page = await listPersonalRecords("personal:test:",{limit:5,offset:5});
  assert.equal(page.total,12);
  assert.equal(page.items.length,5);
});
