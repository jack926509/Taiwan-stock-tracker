import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
let calls = [];
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs = {
    "@/lib/providers/stockList": "export const getStockList=async()=>[]; export const searchStockList=()=>[];",
    "@/lib/providers/quoteProvider": "export const resolveStock=(...args)=>globalThis.__marketSearchResolve(...args);",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
}});
globalThis.__marketSearchResolve = async code => { calls.push(code); return { stockId: code, name: "台積電", market: "tse" }; };
const { GET } = await import("../app/api/search/route.ts");
test("市場清單部分成功時，合法代號仍可透過精確來源查詢", async () => {
  const response = await GET({ nextUrl: new URL("https://local.test/api/search?q=2330") });
  assert.deepEqual((await response.json()).results, [{ stockId: "2330", name: "台積電", market: "tse" }]);
  assert.deepEqual(calls, ["2330"]);
});
test("名稱查詢不誤送代號解析", async () => {
  calls = [];
  await GET({ nextUrl: new URL("https://local.test/api/search?q=台積電") });
  assert.deepEqual(calls, []);
});
