import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let reads=[],builds=0;
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/summaryData':'export const buildSummaryData=()=>globalThis.__summaryRoute.build();',
 '@/lib/closingHistory':'export const loadClosingSummary=d=>globalThis.__summaryRoute.load(d);',
 '@/lib/alertHistory':'export const countAlertEvents=async()=>3;',
 };if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);if(s==='next/server')return next('next/server.js',c);return next(s,c);}});
globalThis.__summaryRoute={build:async()=>{builds++;return {date:'2026-10-15',alertHits:0};},load:async d=>{reads.push(d);return d==='2026-10-14'?{savedAt:'2026-10-14T05:35:00Z',summary:{date:d,alertHits:5}}:null;}};
const {GET}=await import('../app/api/summary/route.ts');const request=query=>({nextUrl:new URL(`http://example.test/api/summary${query}`)});
test('歷史日期只讀保存內容；無紀錄不抓今天行情充數',async()=>{
 const body=await (await GET(request('?date=2026-10-14'))).json();assert.equal(body.summary.alertHits,5);assert.equal(builds,0);
 assert.equal((await (await GET(request('?date=2026-10-13'))).json()).summary,null);assert.equal(builds,0);
 assert.equal((await GET(request('?date=2026-02-30'))).status,400);assert.equal(reads.length,2);
});
test('今日暫覽覆蓋舊 hit 欄位計數，採用保存的實際事件數',async()=>{
 const res=await GET(request(''));const body=await res.json();assert.equal(body.summary.alertHits,3);assert.match(res.headers.get('cache-control'),/no-store/);
});
