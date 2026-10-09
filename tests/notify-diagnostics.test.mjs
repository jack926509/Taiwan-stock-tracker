import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, test } from "node:test";
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalError = console.error;
const logs = [];
const writes = [];
let failure;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") return { url: "data:text/javascript,export const getSupabase = () => globalThis.__notifyDb;", shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
globalThis.__notifyDb = { from() { return {
  select() { return { eq(key, value) { return { maybeSingle: async () => ({ data: value === "meta:line-last-failure" ? { payload: failure } : null }) }; } }; },
  upsert: async (row) => { writes.push(row); return { error: null }; },
}; } };
const { pushLineMessages, getLineLastFailure } = await import("../lib/notify.ts");
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; console.error = originalError; });
function setup(fetchImpl) {
  logs.length = 0; writes.length = 0;
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "fake-local-line-token";
  process.env.LINE_TARGET_USER_ID = "fake-local-line-user";
  globalThis.fetch = fetchImpl;
  console.error = (...args) => logs.push(args);
}
test("LINE HTTP 失敗只儲存狀態碼，不記原始回應與私人內容", async () => {
  setup(async () => new Response("SECRET 私人訊息", { status: 429 }));
  assert.equal(await pushLineMessages([{ type: "text", text: "隔離驗收" }]), false);
  assert.equal(writes[0].payload.reason, "HTTP 429");
  assert.doesNotMatch(JSON.stringify({ logs, writes }), /SECRET|私人/);
});
test("LINE 網路例外只記固定原因", async () => {
  setup(async () => { throw new Error("SECRET HTTP headers"); });
  assert.equal(await pushLineMessages([{ type: "text", text: "隔離驗收" }]), false);
  assert.equal(writes[0].payload.reason, "推播處理失敗");
  assert.doesNotMatch(JSON.stringify({ logs, writes }), /SECRET|headers/);
});
test("歷史失敗紀錄經白名單分類，未知文字不回傳健康檢查", async () => {
  failure = { at: "2026-10-09T05:30:00.000Z", reason: "HTTP 401：SECRET payload" };
  assert.deepEqual(await getLineLastFailure(), { at: failure.at, reason: "HTTP 401" });
  failure.reason = "SECRET arbitrary error";
  assert.equal((await getLineLastFailure()).reason, "推播處理失敗");
});
