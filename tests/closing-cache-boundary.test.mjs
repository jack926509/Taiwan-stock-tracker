import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const records=new Map();let clock=Date.parse('2026-10-15T05:28:00Z'),price=100,fetches=0;
globalThis.astra={
 list:()=>[{stock_id:'2330',market:'tse',name:'台積電'}],
 fetch:()=>{fetches++;return {source:'mis',complete:true,quotes:['2330','t00','o00'].map(stockId=>({stockId,market:stockId==='o00'?'otc':'tse',name:stockId,price,changePct:.01,traded:true,asOf:new Date(clock).toISOString(),open:null,high:null,low:null,volume:null}))}},
 load:k=>records.get(k)??null,create:(k,data,at)=>{if(!records.has(k))records.set(k,{data:structuredClone(data),fetchedAt:at.toISOString()});}
};
registerHooks({resolve(s,c,next){const stubs={
 '@/lib/store':'export const listWatchlist=async()=>globalThis.astra.list();',
 '@/lib/providers/quoteProvider':"export const INDEX_TARGETS=[{stockId:'t00',market:'tse'},{stockId:'o00',market:'otc'}];export const fetchQuotes=async()=>globalThis.astra.fetch();",
 '@/lib/klineStore':'export const loadKline=async()=>[];',
 '@/lib/notify':'export const lineConfigured=()=>false;export const pushLineMessages=async()=>false;',
 '@/lib/supabase':"export const getSupabase=()=>{throw Error('禁止資料庫連線')};",
 '@/lib/personalRecords':'export const loadPersonalRecord=async k=>globalThis.astra.load(k);export const createPersonalRecord=async(...args)=>globalThis.astra.create(...args);',
 '@/lib/alertHistory':'export const countAlertEvents=async()=>0;'
};if(stubs[s])return {url:'data:text/javascript,'+encodeURIComponent(stubs[s]),shortCircuit:true};if(s.startsWith('@/'))return next(pathToFileURL(root+s.slice(2)+'.ts').href,c);return next(s,c);}});
const {buildSummaryData}=await import(pathToFileURL(root+'lib/summaryData.ts'));
const {captureClosingSummary}=await import(pathToFileURL(root+'lib/closingHistory.ts'));
test('收盤保存必須略過盤中十分鐘摘要快取，仍保留來源時間與不覆寫規則',async()=>{
 const originalNow=Date.now;
 Date.now=()=>clock;
 try {
  await buildSummaryData(new Date(clock));
  clock=Date.parse('2026-10-15T05:35:00Z');price=110;
  const saved=await captureClosingSummary(new Date(clock));
  assert.equal(fetches,2);
  assert.equal(saved.summary.rows[0].price,110);
  assert.equal(saved.summary.asOf,new Date(clock).toISOString());
  price=120;clock+=60_000;
  assert.deepEqual(await captureClosingSummary(new Date(clock)),saved);
  assert.equal(fetches,2);
 }finally{Date.now=originalNow;}
});
