import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
let monitor=null, usage=null, fail=new Set();
const items=[{stock_id:'2330',name:'台積電',market:'tse',group_name:'持有',sort_order:0,alert_high:105,alert_low:null,alert_high_hit_at:null,alert_low_hit_at:null,alert_change_pct:5,alert_volume_on:false,alert_versions:{high:'new'},secret:'SECRET'}];
registerHooks({resolve(s,c,next){
 const stubs={
 '@/lib/store':'export const listWatchlist=async()=>globalThis.__personalStatus.items;',
 '@/lib/alertMonitorStore':'export const loadAlertMonitor=()=>globalThis.__personalStatus.read("monitor");',
 '@/lib/notify':'export const lineConfigured=()=>true;export const getLineUsage=()=>globalThis.__personalStatus.read("usage");',
 '@/lib/personalRecords':'export const loadPersonalRecord=()=>globalThis.__personalStatus.read("backfill");',
 };
 if(stubs[s])return {url:`data:text/javascript,${encodeURIComponent(stubs[s])}`,shortCircuit:true};
 if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);
 if(s==='next/server')return next('next/server.js',c);
 return next(s,c);
}});
globalThis.__personalStatus={items,read:async key=>{if(fail.has(key))throw new Error('SECRET');return key==='monitor'?monitor:key==='usage'?usage:null;}};
const {buildPersonalStatus,buildPersonalBackup}=await import('../lib/personalStatus.ts');
test('後端狀態沿用實際紀錄；設定已變更時不假稱正在監控',async()=>{
 monitor={v:1,finishedAt:'2026-10-15T02:30:00Z',outcome:'completed',source:'yahoo',complete:false,rows:{2330:{status:'checked',captured:0,versions:{high:'old'}}},secret:'SECRET'};
 usage={day:'2026-10-15',month:'2026-10',count:5,dayCount:2,dailyCap:15,secret:'SECRET'};
 const body=await buildPersonalStatus();
 assert.match(body.monitor.rows[0].status,/設定已更新/);
 assert.equal(body.monitor.source,'yahoo');assert.equal(body.line.usage.dayCount,2);
 assert.doesNotMatch(JSON.stringify(body),/SECRET|versions/);
});
test('讀取失敗與未有紀錄分開，不能假報零用量或更新成功',async()=>{
 fail=new Set(['monitor','usage','backfill']);
 try{const body=await buildPersonalStatus();assert.equal(body.monitor,null);assert.equal(body.line.usage,null);assert.equal(body.issues.length,3);assert.doesNotMatch(JSON.stringify(body),/SECRET/);}finally{fail.clear();}
});
test('備份只含清單分組、順序、提醒設定及觸發時間，不包含憑證或內部版本',async()=>{
 const backup=await buildPersonalBackup(new Date('2026-10-15T02:30:00Z'));
 assert.equal(backup.v,1);assert.equal(backup.items[0].group_name,'持有');assert.equal(backup.items[0].alert_high,105);
 assert.doesNotMatch(JSON.stringify(backup),/SECRET|alert_versions/);
});
test('備份 API 提供下載檔名與禁止快取標頭',async()=>{
 const {GET}=await import('../app/api/personal-backup/route.ts');const res=await GET();
 assert.equal(res.status,200);assert.match(res.headers.get('content-disposition'),/attachment; filename="twstock-backup-\d{4}-\d{2}-\d{2}\.json"/);assert.match(res.headers.get('cache-control'),/private, no-store/);assert.doesNotMatch(JSON.stringify(await res.json()),/SECRET/);
});
