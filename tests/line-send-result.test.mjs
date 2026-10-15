import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") return { url: "data:text/javascript,export const getSupabase = () => globalThis.__lineResultDB;", shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return nextResolve(specifier, context);
}});
const { sendLineMessages } = await import("../lib/notify.ts");
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });
function fixture(response, allowed = true) {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "local-test-only";
  process.env.LINE_TARGET_USER_ID = "local-test-only";
  const calls = { rpc: [], fetch: [] };
  globalThis.__lineResultDB = {
    rpc: async (...args) => { calls.rpc.push(args); return { data: allowed, error: null }; },
    from: () => ({ upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }),
  };
  globalThis.fetch = async (url, options) => { calls.fetch.push({url,options}); return typeof response === "function" ? response() : response; };
  return calls;
}
const retryKey = "1deabeba-990d-4aab-b826-8f972dbfe4d3";

test("初次請求即帶重試識別，HTTP 200 只記為 LINE 已接受", async () => {
  const calls = fixture(new Response("{}"));
  const result = await sendLineMessages([{type:"text",text:"隔離測試"}], retryKey);
  assert.equal(result.state, "accepted");
  assert.equal(calls.fetch[0].options.headers["X-Line-Retry-Key"], retryKey);
  assert.equal(calls.rpc[0][0], "reserve_line_quota");
  assert.equal(calls.rpc[0][1].p_retry_key, retryKey);
});

test("LINE 409 需有接受識別才當作先前已接受，同一識別不重發新請求", async () => {
  fixture(new Response("{}", {status:409,headers:{"x-line-accepted-request-id":"accepted-before"}}));
  assert.equal((await sendLineMessages([], retryKey)).state, "accepted");
  fixture(new Response("{}", {status:409}));
  const rejected = await sendLineMessages([], retryKey);
  assert.equal(rejected.state, "failed");
  assert.equal(rejected.retryable, false);
});

test("未設定與已達配額回傳原因，不能假報送出或呼叫 LINE", async () => {
  const calls = fixture(new Response("{}"), false);
  assert.equal((await sendLineMessages([], retryKey)).state, "limited");
  assert.equal(calls.fetch.length, 0);
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  assert.equal((await sendLineMessages([], retryKey)).state, "unconfigured");
});

test("429、伺服器故障與網路錯誤可有限重試，認證錯誤不重試", async () => {
  for (const status of [429,500,401]) {
    fixture(new Response("SECRET private response", {status}));
    const result = await sendLineMessages([], retryKey);
    assert.equal(result.state, "failed");
    assert.equal(result.reason, `http-${status}`);
    assert.equal(result.retryable, status !== 401);
    assert.doesNotMatch(JSON.stringify(result), /SECRET|private/);
  }
  fixture(() => { throw new Error("SECRET"); });
  assert.equal((await sendLineMessages([], retryKey)).reason, "network");
});

test("配額儲存故障時先停止送出，接受後的紀錄故障不能改標送出失敗", async () => {
  const calls = fixture(new Response("{}"));
  globalThis.__lineResultDB.rpc = async () => ({ data:null,error:{message:"SECRET"} });
  assert.equal((await sendLineMessages([], retryKey)).reason, "usage-unavailable");
  assert.equal(calls.fetch.length, 0);
  fixture(new Response("{}"));
  globalThis.__lineResultDB.from = () => ({delete: () => ({eq: async () => { throw new Error("SECRET"); }})});
  assert.equal((await sendLineMessages([], retryKey)).state, "accepted");
});
