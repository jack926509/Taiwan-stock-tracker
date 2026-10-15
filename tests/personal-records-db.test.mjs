import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createClient } from "@supabase/supabase-js";
registerHooks({resolve(specifier,context,nextResolve) {
  if(specifier==="@/lib/supabase")return {url:"data:text/javascript,export const getSupabase=()=>globalThis.__personalRecordsDB;",shortCircuit:true};
  return nextResolve(specifier,context);
}});
const {listPersonalRecords}=await import("../lib/personalRecords.ts");

test("透過真實 Supabase JS client 建立日期、前綴與分頁查詢並讀取確切總數",async()=>{
  let request;
  globalThis.__personalRecordsDB=createClient("https://isolated-test.invalid","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
    request={url:new URL(url),options};
    return new Response(JSON.stringify([{cache_key:"alert:event:test",payload:{id:"event"},fetched_at:"2026-10-15T02:30:00Z"}]),
      {headers:{"Content-Type":"application/json","Content-Range":"0-0/3"}});
  }}});
  const result=await listPersonalRecords("alert:event:",{from:"2026-10-14T16:00:00Z",to:"2026-10-15T16:00:00Z",limit:50});
  assert.equal(result.total,3);
  assert.equal(result.items[0].data.id,"event");
  assert.equal(request.url.searchParams.get("cache_key"),"like.alert:event:%");
  assert.deepEqual(request.url.searchParams.getAll("fetched_at"),["gte.2026-10-14T16:00:00Z","lt.2026-10-15T16:00:00Z"]);
  assert.equal(request.url.searchParams.get("limit"),"50");
});
test("沒有總數的回應不能假報為零筆歷史",async()=>{
  globalThis.__personalRecordsDB=createClient("https://isolated-test.invalid","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response("[]",{headers:{"Content-Type":"application/json"}})}});
  await assert.rejects(listPersonalRecords("alert:event:"),/讀取個人紀錄列表失敗/);
});
test("一次性摘要以忽略衝突寫入，不能覆寫已保存的歷史", async()=>{
  let request;
  globalThis.__personalRecordsDB=createClient("https://isolated-test.invalid","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
    request={url:new URL(url),options};return new Response(null,{status:201});
  }}});
  const {createPersonalRecord}=await import("../lib/personalRecords.ts");
  await createPersonalRecord("personal:closing:2026-10-15",{v:1},new Date("2026-10-15T05:35:00Z"));
  assert.equal(request.url.searchParams.get("on_conflict"),"cache_key");
  assert.match(new Headers(request.options.headers).get("prefer"),/resolution=ignore-duplicates/);
});
