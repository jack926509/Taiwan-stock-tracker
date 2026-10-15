import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let record;
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/store':'export const listWatchlist=async()=>[{stock_id:"ok"},{stock_id:"pending"},{stock_id:"fail"}];',
 '@/lib/klineService':'export const ensureKlineWithStatus=async(id)=>{if(id==="fail")throw new Error();return {stale:id==="pending"};};',
 '@/lib/status':'export const recordBackfill=(...args)=>{globalThis.__backfillRecord=args;};',
 };if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);return next(s,c);}});
const {backfillWatchlist}=await import('../lib/backfill.ts');
test('保留舊 K 線但仍未更新不得計為已補齊，與讀取失敗分開',async()=>{
 assert.deepEqual(await backfillWatchlist(),{ok:1,fail:1,pending:1});
 assert.equal(globalThis.__backfillRecord[0],1);assert.equal(globalThis.__backfillRecord[1],1);assert.equal(globalThis.__backfillRecord[3],1);
});
