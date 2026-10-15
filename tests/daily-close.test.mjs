import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
const calls=[];let storageFail=false,configured=false;
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/closingHistory':'export const captureClosingSummary=async()=>{globalThis.__dailyClose.calls.push("save");if(globalThis.__dailyClose.fail())throw new Error("SECRET");};',
 '@/lib/daily-summary':'export const dailySummary=async()=>{globalThis.__dailyClose.calls.push("line");return globalThis.__dailyClose.configured();};',
 };if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};return next(s,c);}});
globalThis.__dailyClose={calls,fail:()=>storageFail,configured:()=>configured};
const {runDailyClose}=await import('../lib/dailyClose.ts');
test('未設定 LINE 仍保存摘要；保存失敗不假報排程成功',async()=>{
 calls.length=0;assert.equal(await runDailyClose(),false);assert.deepEqual(calls,['save','line']);
 storageFail=true;configured=true;calls.length=0;await assert.rejects(runDailyClose(),{message:'收盤摘要保存失敗'});assert.deepEqual(calls,['save','line']);storageFail=false;
});
