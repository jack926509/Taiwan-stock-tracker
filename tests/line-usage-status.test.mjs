import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
let response;
registerHooks({resolve(s,c,next){if(s==='@/lib/supabase')return {url:'data:text/javascript,export const getSupabase=()=>globalThis.__usageDb;',shortCircuit:true};if(s.startsWith('@/'))return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);return next(s,c);}});
globalThis.__usageDb={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>response})})})};
const {getLineUsage}=await import('../lib/notify.ts');
const now=new Date('2026-10-15T02:00:00Z');
test('用量查詢錯誤及損毀資料不能當作零用量',async()=>{
 response={data:null,error:{message:'SECRET'}};await assert.rejects(getLineUsage(now),{message:'讀取通知用量失敗'});
 for(const payload of [{},{month:'2026-10',day:'2026-10-15',count:-1,dayCount:0},null]){response={data:{payload}};await assert.rejects(getLineUsage(now),/格式錯誤/);}
});
test('只在沒有紀錄或跨日期時歸零，保留本月已使用額度',async()=>{
 response={data:null};assert.equal((await getLineUsage(now)).dayCount,0);
 response={data:{payload:{month:'2026-10',day:'2026-10-14',count:5,dayCount:3}}};const usage=await getLineUsage(now);assert.equal(usage.count,5);assert.equal(usage.dayCount,0);
});
