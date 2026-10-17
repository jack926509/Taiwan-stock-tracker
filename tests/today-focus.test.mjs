import test from 'node:test';import assert from 'node:assert/strict';import {buildTodayFocus} from '../lib/todayFocus.ts';
test('重點涵蓋全清單的未觸發門檻與缺價異常，使用自選中文名',()=>{
 const items=[{stock_id:'2330',name:'台積電',alert_high:105,alert_high_hit_at:null},{stock_id:'2317',name:'鴻海',alert_high:210},{stock_id:'0050',name:'元大台灣 50',alert_high:110,alert_high_hit_at:'hit'}];
 const quotes=[{stockId:'2330',name:'英文',price:100,asOf:'2026-10-15T05:30:00Z'},{stockId:'0050',price:105,asOf:'2026-10-14T05:30:00Z'}];
 const focus=buildTodayFocus(items,quotes,'2026-10-15',Date.parse('2026-10-15T05:35:00Z'));assert.deepEqual(focus.near,[{stockId:'2330',name:'台積電',distance:0.05}]);
 assert.deepEqual(focus.anomalies.map(row=>row.reason),['缺少有效價格','行情日期不符預期交易日']);
 assert.deepEqual(focus.anomalies.map(row=>row.kind),['missing-price','unexpected-date']);
});

test('未來時間必須列為待確認，不能因同一天就視為正常',()=>{
 const focus=buildTodayFocus([{stock_id:'2330',name:'台積電'}],[{stockId:'2330',price:100,asOf:'2026-10-15T05:30:00Z'}],'2026-10-15',Date.parse('2026-10-15T05:00:00Z'));
 assert.equal(focus.anomalies[0].reason,'行情時間晚於目前時間');
});
