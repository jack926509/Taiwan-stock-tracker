import assert from "node:assert/strict";
import test from "node:test";
import { stockIdFromPath } from "../lib/stockPath.ts";

test("從個股深連結擷取並正規化代號", () => {
  assert.equal(stockIdFromPath("/stock/2330"), "2330");
  assert.equal(stockIdFromPath("/stock/tsx"), "TSX");
});

test("非個股深連結不提供代號", () => {
  assert.equal(stockIdFromPath("/stock"), "");
  assert.equal(stockIdFromPath("/stock/2330/extra"), "");
});
