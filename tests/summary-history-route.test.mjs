import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let reads=[],builds=0,latestReads=0,latestError=false;
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/summaryData':'export const buildSummaryData=()=>globalThis.__summaryRoute.build();',
 '@/lib/closingHistory':'export const loadClosingSummary=d=>globalThis.__summaryRoute.load(d);export const loadLatestClosingSummary=()=>globalThis.__summaryRoute.latest();',
 '@/lib/alertHistory':'export const countAlertEvents=async()=>3;',
 };if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);if(s==='next/server')return next('next/server.js',c);return next(s,c);}});
globalThis.__summaryRoute={build:async()=>{builds++;return {date:'2026-10-15',alertHits:0};},load:async d=>{reads.push(d);return d==='2026-10-14'?{savedAt:'2026-10-14T05:35:00Z',summary:{date:d,alertHits:5}}:null;},latest:async()=>{latestReads++;if(latestError)throw new Error('查詢失敗');return {savedAt:'2026-10-14T05:35:00Z',summary:{date:'2026-10-14',alertHits:5}};}};
const {GET}=await import('../app/api/summary/route.ts');const request=query=>({nextUrl:new URL(`http://example.test/api/summary${query}`)});
test('歷史日期只讀保存內容；無紀錄不抓今天行情充數',async()=>{
 const body=await (await GET(request('?date=2026-10-14'))).json();assert.equal(body.summary.alertHits,5);assert.equal(builds,0);
 assert.equal((await (await GET(request('?date=2026-10-13'))).json()).summary,null);assert.equal(builds,0);
 assert.equal((await GET(request('?date=2026-02-30'))).status,400);assert.equal(reads.length,2);
});
test('今日暫覽覆蓋舊 hit 欄位計數，採用保存的實際事件數',async()=>{
 const res=await GET(request(''));const body=await res.json();assert.equal(body.summary.alertHits,3);assert.match(res.headers.get('cache-control'),/no-store/);
});
test('最近一筆 API 僅回傳實際保存快照，不重算行情或當日提醒數',async()=>{
 builds=0;latestReads=0;const res=await GET(request('?latest=1'));const body=await res.json();
 assert.equal(body.summary.date,'2026-10-14');assert.equal(body.summary.alertHits,5);assert.equal(body.savedAt,'2026-10-14T05:35:00Z');
 assert.equal(latestReads,1);assert.equal(builds,0);assert.match(res.headers.get('cache-control'),/no-store/);
});
test('最近一筆與日期參數不可混用，且只接受 latest=1',async()=>{
 const before=latestReads;
 for(const query of ['?latest=0','?latest=','?latest=true','?latest=1&date=2026-10-14'])assert.equal((await GET(request(query))).status,400);
 assert.equal(latestReads,before);
});
test('最近一筆讀取錯誤回 503，而非空快照或即時暫覽',async()=>{
 builds=0;latestError=true;const res=await GET(request('?latest=1'));latestError=false;
 assert.equal(res.status,503);assert.equal(builds,0);assert.equal((await res.json()).summary,undefined);
});
