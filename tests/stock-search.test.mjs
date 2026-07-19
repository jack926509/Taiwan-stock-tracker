import assert from "node:assert/strict";
import { test } from "node:test";

import { searchStockList } from "../lib/providers/stockList.ts";

const LIST = [
  { stockId: "2330", name: "台積電", market: "tse" },
  { stockId: "2317", name: "鴻海", market: "tse" },
  { stockId: "2331", name: "精英", market: "tse" },
  { stockId: "3231", name: "緯創", market: "tse" },
  { stockId: "6488", name: "環球晶", market: "otc" },
  { stockId: "8069", name: "元太", market: "otc" },
  { stockId: "00878", name: "國泰永續高股息", market: "tse" },
  { stockId: "2884", name: "玉山金", market: "tse" },
  { stockId: "2885", name: "元大金", market: "tse" },
];

test("代號完全相符排第一，其後為代號前綴", () => {
  const results = searchStockList(LIST, "2330");
  assert.equal(results[0].stockId, "2330");

  const prefix = searchStockList(LIST, "233");
  assert.deepEqual(
    prefix.map((r) => r.stockId),
    ["2330", "2331"]
  );
});

test("名稱開頭優先於名稱包含", () => {
  const results = searchStockList(LIST, "元");
  // 「元太」「元大金」名稱開頭；「國泰永續高股息」不含「元」不入列
  assert.deepEqual(
    results.map((r) => r.name),
    ["元大金", "元太"]
  );

  const contains = searchStockList(LIST, "金");
  // 「玉山金」「元大金」皆為名稱包含
  assert.deepEqual(
    contains.map((r) => r.name).sort(),
    ["元大金", "玉山金"].sort()
  );
});

test("名稱完整查詢命中單一個股", () => {
  const results = searchStockList(LIST, "台積電");
  assert.equal(results.length, 1);
  assert.equal(results[0].stockId, "2330");
});

test("空白查詢回空陣列、limit 生效", () => {
  assert.deepEqual(searchStockList(LIST, "   "), []);
  assert.equal(searchStockList(LIST, "2", 3).length, 3);
});

test("英數代號查詢不分大小寫", () => {
  const list = [{ stockId: "00632R", name: "元大台灣50反1", market: "tse" }];
  assert.equal(searchStockList(list, "00632r").length, 1);
});
