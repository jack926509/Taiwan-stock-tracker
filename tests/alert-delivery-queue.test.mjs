import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const NOW = Date.parse("2026-10-15T02:30:00Z"), originalNow = Date.now;
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs = {
    "@/lib/alertEvents": `export const readyAlertEvents = async () => globalThis.__queue.events;
      export const claimAlertDelivery = async key => globalThis.__queue.claimed === null ? null : globalThis.__queue.events.find(e=>e.key===key);
      export const finishAlertDelivery = async (...args) => { globalThis.__queue.finished.push(args); if(args[0].key===globalThis.__queue.failFinishKey)throw new Error('測試儲存失敗'); };`,
    "@/lib/notify": `export const sendLineMessages = async (...args) => {
      globalThis.__queue.sent.push(args); return globalThis.__queue.result;
    };`,
  };
  if (stubs[specifier]) return {url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`,shortCircuit:true};
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`,import.meta.url).href,context);
  return nextResolve(specifier,context);
}});
const { deliverAlertEvents } = await import("../lib/alertDelivery.ts");
afterEach(() => { Date.now = originalNow; });
function fixture(state = "accepted") {
  Date.now = () => NOW;
  const event = { v:1,id:"test-event",key:"alert:event:test",stockId:"2330",market:"tse",name:"觸發當時名稱",kind:"high",
    threshold:100,price:110,changePct:0.1,volume:1000,open:100,high:111,low:99,
    triggeredAt:new Date(NOW).toISOString(),quoteAsOf:new Date(NOW).toISOString(),
    notification:{state:"sending",attempts:1,retryKey:"fixed-retry-key",claimId:"test-claim"} };
  return globalThis.__queue = {events:[event],claimed:event,sent:[],finished:[],result:{state,reason:null,retryable:false}};
}

test("通知依觸發快照建立 Flex，保留行情細節並沿用固定重試識別", async () => {
  const queue = fixture();
  assert.equal(await deliverAlertEvents(new Date(NOW)), 1);
  const [messages,key] = queue.sent[0];
  assert.equal(messages[0].type,"flex");
  assert.match(JSON.stringify(messages),/觸發當時名稱/);
  assert.match(JSON.stringify(messages),/111/);
  assert.equal(key,"fixed-retry-key");
  assert.equal(queue.finished[0][1].state,"accepted");
});

test("未取得通知認領時不送出；通知失敗仍保存結果，不能回報已接受", async () => {
  let queue = fixture(); queue.claimed = null;
  assert.equal(await deliverAlertEvents(new Date(NOW)),0);
  assert.deepEqual(queue.sent,[]);
  queue = fixture("failed"); queue.result = {state:"failed",reason:"network",retryable:true};
  assert.equal(await deliverAlertEvents(new Date(NOW)),0);
  assert.equal(queue.finished[0][1].reason,"network");
});

test("一筆結果儲存失敗仍處理後續通知，最後回報部分失敗",async()=>{
  const queue=fixture();
  queue.failFinishKey=queue.events[0].key;
  queue.events.push({...queue.events[0],key:"alert:event:second",id:"second"});
  await assert.rejects(deliverAlertEvents(new Date(NOW)),/部分通知/);
  assert.equal(queue.sent.length,2);
  assert.equal(queue.finished.length,2);
});
