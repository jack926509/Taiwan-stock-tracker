import assert from "node:assert/strict";
import test from "node:test";
import { stockIdForRender, stockIdFromPath } from "../lib/stockPath.ts";

test("從個股深連結擷取並正規化代號", () => {
  assert.equal(stockIdFromPath("/stock/2330"), "2330");
  assert.equal(stockIdFromPath("/stock/0050/"), "0050");
  assert.equal(stockIdFromPath("/stock/tsx"), "TSX");
});

test("非個股深連結不提供代號", () => {
  assert.equal(stockIdFromPath("/stock"), "");
  assert.equal(stockIdFromPath("/stock/2330/extra"), "");
});

test("hydration 完成前不輸出個股代號，避免靜態殼首屏不一致", () => {
  assert.equal(stockIdForRender(false, "2330", "/stock/2330"), "");
  assert.equal(stockIdForRender(true, "2330", "/stock/2330"), "2330");
  assert.equal(stockIdForRender(true, undefined, "/stock/0050/"), "0050");
});
