import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createClient } from "@supabase/supabase-js";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") return { url: "data:text/javascript,export const getSupabase=()=>globalThis.__emergingWatchDB;", shortCircuit: true };
  if (specifier === "@/lib/providers/emergingProvider") return { url: "data:text/javascript,export const normalizeEmergingMarkets=async items=>items.map(row=>row.stock_id==='7930'?{...row,market:'emerging'}:row);", shortCircuit: true };
  return nextResolve(specifier, context);
}});
const { listWatchlist } = await import("../lib/store.ts");

test("既有錯標興櫃於讀取時校正，保留名稱、條件與排序，不寫入資料庫", async () => {
  const stored = [{ stock_id: "7930", market: "otc", name: "WST", group_name: "觀察", alert_high: 250, sort_order: 9 }];
  const requests = [];
  globalThis.__emergingWatchDB = createClient("https://isolated.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: new URL(url), method: init.method });
      return new Response(JSON.stringify(stored), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const items = await listWatchlist();
  assert.deepEqual(items, [{ ...stored[0], market: "emerging" }]);
  assert.equal(stored[0].market, "otc");
  assert.deepEqual(requests.map(request => request.method), ["GET"]);
});
