import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PERSONAL_PREFERENCES, readPersonalPreferences, persistPersonalPreferences, PERSONAL_PREFERENCES_KEY } from "../lib/personalPreferences.ts";
function memoryStorage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
test("重新讀取能保留排序、篩選、分組與跨個股共用的 K 線選擇",()=>{
  const storage=memoryStorage();
  let current={...DEFAULT_PERSONAL_PREFERENCES};
  current=persistPersonalPreferences(storage,current,{sort:"gain",filter:"alert",group:"持有"});
  current=persistPersonalPreferences(storage,current,{klinePeriod:"week",klineRange:"1y"});
  assert.deepEqual(readPersonalPreferences(storage),current);
  assert.equal(current.group,"持有");
  assert.equal(current.sort,"gain");
  current=persistPersonalPreferences(storage,current,{sort:"near"});
  assert.equal(readPersonalPreferences(storage).sort,"near");
});
test("另一頁更新的欄位不被舊畫面覆蓋",()=>{
  const storage=memoryStorage(),old={...DEFAULT_PERSONAL_PREFERENCES};
  persistPersonalPreferences(storage,old,{group:"ETF"});
  const updated=persistPersonalPreferences(storage,old,{sort:"loss"});
  assert.equal(updated.group,"ETF");
  assert.equal(updated.sort,"loss");
});
test("損壞或無效偏好退回可用值，不儲存無效週 K 區間",()=>{
  const storage=memoryStorage();
  storage.setItem(PERSONAL_PREFERENCES_KEY,"bad json");
  assert.deepEqual(readPersonalPreferences(storage),DEFAULT_PERSONAL_PREFERENCES);
  storage.setItem(PERSONAL_PREFERENCES_KEY,JSON.stringify({v:1,sort:"bad",filter:"bad",group:"a".repeat(21),klinePeriod:"week",klineRange:"5d"}));
  const value=readPersonalPreferences(storage);
  assert.equal(value.sort,"default");assert.equal(value.filter,"all");assert.equal(value.group,null);
  assert.equal(value.klinePeriod,"week");assert.equal(value.klineRange,"1y");
  storage.setItem(PERSONAL_PREFERENCES_KEY,JSON.stringify({v:1,klinePeriod:"month",klineRange:"5d",group:""}));
  assert.equal(readPersonalPreferences(storage).klineRange,"5d");
  assert.equal(readPersonalPreferences(storage).group,null);
});
test("儲存被瀏覽器阻擋時操作仍可繼續，保留當下其他選擇",()=>{
  const storage={getItem:()=>{throw new Error("blocked");},setItem:()=>{throw new Error("blocked");}};
  const current={...DEFAULT_PERSONAL_PREFERENCES,sort:"gain",group:"觀察"};
  const value=persistPersonalPreferences(storage,current,{filter:"down"});
  assert.equal(value.sort,"gain");assert.equal(value.group,"觀察");assert.equal(value.filter,"down");
});
