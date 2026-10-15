import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let records=new Map(),summary,builds=0,events=0;
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/summaryData':'export const buildSummaryData=()=>globalThis.__closing.build();',

 '@/lib/personalRecords':'export const loadPersonalRecord=k=>globalThis.__closing.load(k);export const createPersonalRecord=(...args)=>globalThis.__closing.create(...args);export const listPersonalRecords=()=>globalThis.__closing.list();',
 };
 if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);return next(s,c);}});
globalThis.__closing={build:async()=>{builds++;return structuredClone(summary);},load:async k=>records.get(k)??null,create:async(k,data,at)=>{if(!records.has(k))records.set(k,{key:k,data:structuredClone(data),fetchedAt:at.toISOString()});},list:async()=>({total:events,items:[]})};
const {captureClosingSummary,loadClosingSummary}=await import('../lib/closingHistory.ts');
const now=new Date('2026-10-15T05:35:00Z');
test('收盤前與非當日摘要不保存；不合成歷史行情',async()=>{
 records.clear();builds=0;summary={date:'2026-10-14'};
 assert.equal(await captureClosingSummary(new Date('2026-10-15T04:00:00Z')),null);assert.equal(builds,0);
 assert.equal(await captureClosingSummary(now),null);assert.equal(records.size,0);
 assert.equal(await loadClosingSummary('2026-10-13'),null);assert.equal(builds,1);
});
test('保存當時名稱、行情及實際事件總數，重跑不覆寫原快照',async()=>{
 records.clear();events=3;summary={date:'2026-10-15',source:'yahoo',complete:false,asOf:'2026-10-15T05:30:00Z',rows:[{name:'原本名稱',price:100}],alertHits:0};
 const first=await captureClosingSummary(now);assert.equal(first.summary.alertHits,3);assert.equal(first.summary.source,'yahoo');
 summary.rows[0].price=200;summary.rows[0].name='新名稱';events=0;
 const again=await captureClosingSummary(now);assert.deepEqual(again,first);assert.equal((await loadClosingSummary('2026-10-15')).summary.rows[0].name,'原本名稱');
});
