import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { taipeiDateRange } from "../lib/personalDates.ts";
import { publicAlertEvent } from "../lib/alertEventTypes.ts";
let request, fail = false;
registerHooks({resolve(specifier,context,nextResolve) {
  if (specifier === "@/lib/personalRecords") return {url:"data:text/javascript,export const listPersonalRecords = (...args) => globalThis.__historyRoute.list(...args);",shortCircuit:true};
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  if (specifier === "next/server") return nextResolve("next/server.js",context);
  return nextResolve(specifier,context);
}});
globalThis.__historyRoute = {list: async (...args)=>{
  request = args;
  if (fail) throw new Error("SECRET internal database");
  return {total:51,items:[{data:{v:1,id:"event",key:"private-key",stockId:"2330",name:"台積電",notification:{state:"accepted",attempts:1,retryKey:"private-retry-key",claimId:"private-claim"}}}]};
}};
const {GET} = await import("../app/api/alert-history/route.ts");
async function get(query) { request = null; return GET({nextUrl:new URL(`http://example.test/api/alert-history?${query}`)}); }

test("歷史 API 以台北日界分頁，只回傳畫面必要資料",async()=>{
  const response = await get("date=2026-10-15&offset=0");
  const body = await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(request[1],{from:"2026-10-14T16:00:00.000Z",to:"2026-10-15T16:00:00.000Z",offset:0,limit:50});
  assert.equal(body.total,51);
  assert.equal(body.nextOffset,50);
  assert.equal(body.events[0].notification.state,"accepted");
  assert.doesNotMatch(JSON.stringify(body),/private-key|private-retry-key|private-claim/);
  const last = await (await get("date=2026-10-15&offset=50")).json();
  assert.equal(last.nextOffset,null);
});
for(const query of ["date=2026-02-30","date=bad","date=2026-10-15&offset=-1","date=2026-10-15&offset=100001"]) {
  test(`歷史 API 拒絕無效日期及分頁 ${query}`,async()=>{
    assert.equal((await get(query)).status,400); assert.equal(request,null);
  });
}
test("歷史儲存錯誤不回傳內部訊息",async()=>{
  fail = true;
  try {
    const response = await get("date=2026-10-15");
    assert.equal(response.status,500);
    assert.doesNotMatch(JSON.stringify(await response.json()),/SECRET|database/);
  } finally {fail=false;}
});
test("日期工具拒絕日曆上不存在的日期，正確處理月底",()=>{
  assert.equal(taipeiDateRange("2026-02-29"),null);
  assert.equal(taipeiDateRange("2026-13-01"),null);
  assert.equal(taipeiDateRange("2026-10-31").to,"2026-10-31T16:00:00.000Z");
});
test("讀取歷史時將超過重試期限的未完成紀錄呈現為逾時，不改寫原事件",()=>{
  const event={v:1,id:"expired",key:"private",triggeredAt:"2026-10-15T05:20:00Z",notification:{state:"retry",attempts:2,retryKey:"private"}};
  const result=publicAlertEvent(event,new Date("2026-10-15T06:00:00Z"));
  assert.equal(result.notification.state,"failed");
  assert.equal(result.notification.reason,"retry-expired");
  assert.equal(event.notification.state,"retry");
});
