import test from "node:test";
import assert from "node:assert/strict";
import { buildWatchlistQuotes } from "../lib/watchlistQuotes.ts";

const items = [
  { stock_id: "2330", market: "tse", name: "台積電" },
  { stock_id: "2317", market: "tse", name: "鴻海" },
];
const quote = { stockId: "2330", market: "tse", name: "TAIWAN SEMICONDUCTOR", price: 100, changePct: 1, traded: true };

test("缺報價仍保留全部自選股與中文名稱，不捏造價格、成交或來源時間", () => {
  const list = buildWatchlistQuotes(items, [quote]);
  assert.deepEqual(list.map(q => q.stockId), ["2330", "2317"]);
  assert.equal(list[0].name, "台積電");
  assert.equal(list[0].price, 100);
  assert.equal(list[0].missing, false);
  assert.equal(list[1].name, "鴻海");
  assert.equal(list[1].missing, true);
  for (const key of ["price", "prevClose", "change", "changePct", "open", "high", "low", "volume"]) {
    assert.equal(list[1][key], null, key);
  }
  assert.equal(list[1].traded, false);
  assert.equal(list[1].asOf, undefined);
  assert.equal(list[1].time, "");
});

test("全部報價失敗仍保留清單，移除的股票不因舊報價重新出現", () => {
  assert.equal(buildWatchlistQuotes(items, []).length, 2);
  assert.deepEqual(buildWatchlistQuotes([], [quote]), []);
  assert.deepEqual(buildWatchlistQuotes([items[1]], [quote]).map(q => q.stockId), ["2317"]);
});

test("自選清單尚未載入時可顯示已取得的報價", () => {
  assert.equal(buildWatchlistQuotes(undefined, [quote])[0].price, 100);
});
