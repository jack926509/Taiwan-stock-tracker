import test from "node:test";
import assert from "node:assert/strict";
import { nearestAlertDistance, sortByAlertDistance } from "../lib/alertProximity.ts";
const pending=(id,high,low=null)=>({stock_id:id,alert_high:high,alert_low:low,alert_high_hit_at:null,alert_low_hit_at:null});
test("距到價取尚未觸發條件的最近距離，已越過的參考價距離為零",()=>{
  assert.equal(nearestAlertDistance(pending("2330",105,90),{price:100}),0.05);
  assert.equal(nearestAlertDistance(pending("2330",95),{price:100}),0);
  assert.equal(nearestAlertDistance(pending("2330",null,105),{price:100}),0);
});
test("已觸發的到價條件、未知或無效價格不提供距離",()=>{
  assert.equal(nearestAlertDistance({...pending("2330",105),alert_high_hit_at:"2026-10-15T02:30:00Z"},{price:100}),null);
  for(const price of [null,0,Infinity,NaN])assert.equal(nearestAlertDistance(pending("2330",105),{price}),null);
});
test("距到價排序將可計算者排前面，缺價或未設到價條件者排最後並保留順序",()=>{
  const items=[pending("2330",110),pending("2317",105),pending("0050",120)];
  const quotes=[{stockId:"2330",price:100},{stockId:"0050",price:null},{stockId:"2317",price:100},{stockId:"2308",price:200}];
  assert.deepEqual(sortByAlertDistance(quotes,items).map(item=>item.stockId),["2317","2330","0050","2308"]);
  assert.equal(quotes[0].stockId,"2330");
});
