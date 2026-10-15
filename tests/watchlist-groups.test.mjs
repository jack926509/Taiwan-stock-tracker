import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGroupName, watchlistGroups, filterByGroup } from "../lib/watchlistGroups.ts";
const items=[{stock_id:"2330",group_name:"持有"},{stock_id:"2317",group_name:"觀察"},{stock_id:"0050",group_name:"ETF"}];
test("分組名稱去除空白，保留個人名稱並拒絕過長或控制字元",()=>{
  assert.equal(normalizeGroupName(" 持有 "),"持有");
  assert.equal(normalizeGroupName(""),"預設");
  assert.equal(normalizeGroupName("個人觀察"),"個人觀察");
  assert.equal(normalizeGroupName("a".repeat(21)),null);
  assert.equal(normalizeGroupName("持\n有"),null);
});
test("清單分組去重並包含預設，缺報價列仍可依自選分組篩選",()=>{
  assert.deepEqual(watchlistGroups([...items,{stock_id:"2308",group_name:"持有"}]),["預設","持有","觀察","ETF"]);
  const quotes=[{stockId:"2330",missing:false},{stockId:"2317",missing:true}];
  assert.deepEqual(filterByGroup(quotes,items,"觀察"),[quotes[1]]);
  assert.deepEqual(filterByGroup(quotes,items,null),quotes);
  assert.deepEqual(filterByGroup(quotes,[{stock_id:"2330",group_name:"all"}],"all"),[quotes[0]]);
});
