import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

let row, updates;
const stamp = "2026-10-15T02:30:00.000Z";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") return {
    url: "data:text/javascript,export const getSupabase = () => globalThis.__alertSettingsDB;", shortCircuit: true,
  };
  return nextResolve(specifier, context);
}});
globalThis.__alertSettingsDB = { from(table) {
  assert.equal(table, "watchlist");
  return {
    select() { return { eq() { return { maybeSingle: async () => ({ data: { ...row }, error: null }) }; } }; },
    update(patch) { return { eq: () => {
      updates.push(patch); if(row)Object.assign(row,patch);
      const result=Promise.resolve({error:null});
      result.select=()=>({maybeSingle:async()=>({data:row?{stock_id:row.stock_id}:null,error:null})});
      return result;
    } }; },
  };
}};
const { setAlert, setWatchGroup } = await import("../lib/store.ts");
function fixture() {
  updates = [];
  row = { stock_id: "2330", alert_high: 100, alert_low: 90, alert_change_pct: 5, alert_volume_on: false,
    alert_high_hit_at: stamp, alert_low_hit_at: stamp, alert_change_hit_at: stamp, alert_volume_hit_at: stamp };
}

test("只改爆量不清除已觸發的到價與漲跌幅", async () => {
  fixture();
  await setAlert("2330", 100, 90, 5, true);
  assert.equal(row.alert_high_hit_at, stamp);
  assert.equal(row.alert_low_hit_at, stamp);
  assert.equal(row.alert_change_hit_at, stamp);
  assert.equal(row.alert_volume_hit_at, null);
  assert.equal(row.alert_volume_on, true);
});

test("只改高價只重新啟用高價，儲存相同設定不重新啟用", async () => {
  fixture();
  await setAlert("2330", 105, 90, 5, false);
  assert.equal(row.alert_high_hit_at, null);
  assert.equal(row.alert_low_hit_at, stamp);
  assert.equal(row.alert_change_hit_at, stamp);
  fixture();
  await setAlert("2330", 100, 90, 5, false);
  assert.equal(row.alert_high_hit_at, stamp);
  assert.equal(row.alert_low_hit_at, stamp);
  assert.deepEqual(updates, []);
});

test("可明確重新啟用同一個高價條件，其他條件仍保留觸發紀錄", async () => {
  fixture();
  await setAlert("2330", 100, 90, 5, false, ["high"]);
  assert.equal(row.alert_high_hit_at, null);
  assert.equal(row.alert_low_hit_at, stamp);
  assert.equal(row.alert_change_hit_at, stamp);
  assert.equal(row.alert_volume_hit_at, stamp);
});

test("省略的提醒欄位保留設定與已觸發時間", async () => {
  fixture();
  await setAlert("2330", undefined, undefined, undefined, true);
  assert.equal(row.alert_high, 100);
  assert.equal(row.alert_low, 90);
  assert.equal(row.alert_change_pct, 5);
  assert.equal(row.alert_high_hit_at, stamp);
});
test("只改分組不清除提醒門檻或觸發時間",async()=>{
  fixture();
  await setWatchGroup("2330","持有");
  assert.equal(row.group_name,"持有");
  assert.equal(row.alert_high,100);
  assert.equal(row.alert_high_hit_at,stamp);
  assert.equal(row.alert_low_hit_at,stamp);
});
