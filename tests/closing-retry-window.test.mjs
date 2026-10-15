import test from 'node:test';
import assert from 'node:assert/strict';
import {runScheduledCron} from '../lib/scheduledJobs.ts';
import {isMarketOpenNow} from '../lib/market-hours.ts';
function dependencies(calls,trading=true){return {
 isMarketOpenNow,isTradingDay:async()=>trading,claim:async()=>{calls.push('claim');return true;},finish:async()=>{},
 checkAlerts:async()=>{calls.push('capture');return 0;},deliverAlertEvents:async()=>{calls.push('delivery');return 1;},
 dailySummary:async()=>false,backfillWatchlist:async()=>({ok:0,fail:0}),keepAlive:async()=>{},
};}
test('13:37 仍派送有效既有事件，但絕不重新抓行情或捕捉新提醒',async()=>{
 const calls=[];const result=await runScheduledCron('* * * * MON-FRI',new Date('2026-10-15T05:37:00Z'),dependencies(calls));
 assert.equal(result.status,'ok');assert.equal(result.detail.sent,1);assert.equal(result.detail.deliveryOnly,true);assert.deepEqual(calls,['claim','delivery']);
});
test('收盤後派送最多延續到 13:50，13:51 或非交易日不取鎖',async()=>{
 for(const [at,trading,active] of [['2026-10-15T05:50:59Z',true,true],['2026-10-15T05:51:00Z',true,false],['2026-10-15T00:00:00Z',true,false],['2026-10-15T05:37:00Z',false,false]]){
  const calls=[];const result=await runScheduledCron('* * * * MON-FRI',new Date(at),dependencies(calls,trading));
  assert.equal(result.status,active?'ok':'skipped');assert.deepEqual(calls,active?['claim','delivery']:[]);
 }
});
