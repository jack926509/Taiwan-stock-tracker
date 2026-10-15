import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

let calls, found;
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs = {
    "@/lib/store": `export const setAlert = (...args) => globalThis.__alertSettingsRoute.set(...args);
      export const listWatchlist = async () => [], addWatch = async () => {}, removeWatch = async () => {}, reorderWatch = async () => {}, usingSupabase = () => false;`,
    "@/lib/providers/quoteProvider": "export const resolveStock = async () => null;",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
}});
globalThis.__alertSettingsRoute = { set: async (...args) => { calls.push(args); return found; } };
const { PATCH } = await import("../app/api/watchlist/route.ts");
async function patch(body) {
  calls = []; found = body?.stockId !== "9999";
  return PATCH({ json: async () => body });
}

test("PATCH 省略到價條件時不傳成取消，單項重新啟用不改其他設定", async () => {
  assert.equal((await patch({ stockId: "2330", volumeOn: true })).status, 200);
  assert.deepEqual(calls, [["2330", undefined, undefined, undefined, true, []]]);
  assert.equal((await patch({ stockId: "2330", rearm: ["high"] })).status, 200);
  assert.deepEqual(calls, [["2330", undefined, undefined, undefined, undefined, ["high"]]]);
});

for (const body of [null, [], { stockId: "2330", rearm: ["unknown"] }, { stockId: "2330", rearm: "high" }, { stockId: "2330", high: true }, { stockId: "2330", volumeOn: "true" }, { stockId: "../x" }]) {
  test(`提醒 API 拒絕不合法輸入 ${JSON.stringify(body)}`, async () => {
    assert.equal((await patch(body)).status, 400);
    assert.deepEqual(calls, []);
  });
}
test("不存在的股票不能假報提醒設定成功", async () => {
  assert.equal((await patch({ stockId: "9999", high: 100 })).status, 404);
});
