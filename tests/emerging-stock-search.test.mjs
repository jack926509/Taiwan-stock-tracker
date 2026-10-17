import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./finmind.ts") return { url: "data:text/javascript,export const finmindRows = () => globalThis.__stockSearchFixture.finmind();", shortCircuit: true };
    if (specifier === "./emergingProvider.ts" && context.parentURL?.includes("stockList.ts?case=")) {
      const url = new URL(specifier, context.parentURL);
      url.search = new URL(context.parentURL).search;
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});

let moduleId = 0;
async function withList(run) {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const state = { now: Date.parse("2026-10-17T06:00:00Z"), finmindCalls: 0, tpexCalls: 0, finmindFail: false, tpexFail: false };
  globalThis.__stockSearchFixture = { finmind: async () => {
    state.finmindCalls++;
    if (state.finmindFail) throw new Error("FinMind 暫時不可用");
    return [{ stock_id: "2330", stock_name: "台積電", type: "twse" }, { stock_id: "7930", stock_name: "WST", type: "tpex" }];
  } };
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, "www.tpex.org.tw");
    state.tpexCalls++;
    if (state.tpexFail) throw new Error("名冊暫時不可用");
    return new Response(JSON.stringify([{ SecuritiesCompanyCode: "7930", CompanyAbbreviation: "威世波", Symbol: "WST" }]));
  };
  Date.now = () => state.now;
  try { await run(await import(`../lib/providers/stockList.ts?case=${++moduleId}`), state); }
  finally { globalThis.fetch = originalFetch; Date.now = originalNow; delete globalThis.__stockSearchFixture; }
}

test("搜尋合併官方興櫃名冊，覆蓋同代號錯標且中文與英文簡稱皆可查到", async () => {
  await withList(async ({ getStockList, searchStockList }, state) => {
    const list = await getStockList();
    assert.equal(list.length, 2);
    for (const query of ["7930", "威世波", "wst"]) {
      assert.deepEqual(searchStockList(list, query), [{ stockId: "7930", name: "威世波", market: "emerging", aliases: ["WST"] }]);
    }
    await getStockList();
    assert.equal(state.tpexCalls, 1);
    assert.equal(state.finmindCalls, 1);
  });
});

test("FinMind 暫時失敗仍可找興櫃，部分清單於一分鐘後重試", async () => {
  await withList(async ({ getStockList }, state) => {
    state.finmindFail = true;
    assert.deepEqual((await getStockList()).map(row => row.stockId), ["7930"]);
    state.finmindFail = false;
    state.now += 30_000;
    assert.equal((await getStockList()).length, 1);
    state.now += 30_001;
    assert.equal((await getStockList()).length, 2);
    assert.equal(state.finmindCalls, 2);
  });
});

test("興櫃名冊暫時失敗不阻斷既有名稱搜尋，恢復後更正市場", async () => {
  await withList(async ({ getStockList, searchStockList }, state) => {
    state.tpexFail = true;
    const partial = await getStockList();
    assert.equal(searchStockList(partial, "台積電")[0].market, "tse");
    assert.deepEqual(searchStockList(partial, "7930"), []);
    state.tpexFail = false; state.now += 60_001;
    assert.equal(searchStockList(await getStockList(), "7930")[0].market, "emerging");
  });
});

test("名冊更新失敗仍保留已確認興櫃及英文簡稱，不退回 FinMind 的錯標", async () => {
  await withList(async ({ getStockList, searchStockList }, state) => {
    await getStockList();
    state.now += 24 * 60 * 60_000 + 1; state.tpexFail = true;
    const partial = await getStockList();
    assert.equal(searchStockList(partial, "7930")[0].market, "emerging");
    assert.equal(searchStockList(partial, "wst")[0].name, "威世波");
    assert.equal(searchStockList(partial, "台積電")[0].market, "tse");
  });
});
