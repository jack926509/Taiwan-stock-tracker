import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

registerHooks({resolve(specifier,context,nextResolve) {
  if (specifier === "@/lib/supabase") return {url:"data:text/javascript,export const getSupabase=()=>null;",shortCircuit:true};
  return nextResolve(specifier,context);
}});
const previousDirectory = process.cwd();
const isolatedDirectory = await mkdtemp(path.join(tmpdir(),"twstock-closing-order-"));
process.chdir(isolatedDirectory);
const { savePersonalRecord, listPersonalRecords } = await import("../lib/personalRecords.ts");
process.chdir(previousDirectory);

test("本機紀錄與資料庫使用一致排序：key 取最新日期，預設仍依保存時間",async()=>{
  await savePersonalRecord("personal:closing:2026-10-15",{date:"2026-10-15"},new Date("2026-10-17T00:00:00Z"));
  await savePersonalRecord("personal:closing:2026-10-16",{date:"2026-10-16"},new Date("2026-10-16T05:35:00Z"));
  const latest = await listPersonalRecords("personal:closing:",{orderBy:"key",limit:1});
  assert.equal(latest.items[0].data.date,"2026-10-16");assert.equal(latest.total,2);
  const latestWrite = await listPersonalRecords("personal:closing:",{limit:1});
  assert.equal(latestWrite.items[0].data.date,"2026-10-15");
});
