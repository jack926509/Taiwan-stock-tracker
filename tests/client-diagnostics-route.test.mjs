import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
const { POST } = await import("../app/api/client-diagnostics/route.ts");
const originalError = console.error;
const originalNow = Date.now;
const logs = [];
afterEach(() => { console.error = originalError; Date.now = originalNow; });
function request(body, headers = {}) {
  return new Request("https://example.test/api/client-diagnostics", {
    method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const payload = { schema: 1, kind: "hydration", route: "stock", entryRoute: "search", code: "418", digest: null, online: true, mobile: false, serviceWorker: true };

test("同源診斷寫入固定欄位並回 204，原始輸入不出現在日誌", async () => {
  logs.length = 0;
  console.error = (...args) => logs.push(args);
  const response = await POST(request({ ...payload, error: "SECRET", stack: "SECRET", token: "SECRET" }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(logs[0][0], "[client:diagnostic]");
  assert.equal(logs[0][1].code, "418");
  assert.doesNotMatch(JSON.stringify(logs), /SECRET|stack|token/);
});

test("拒絕跨站、無來源、無效或過大內容，不輸出診斷", async () => {
  logs.length = 0;
  console.error = (...args) => logs.push(args);
  assert.equal((await POST(request(payload, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await POST(new Request("https://example.test/api/client-diagnostics", { method: "POST", body: JSON.stringify(payload) }))).status, 403);
  assert.equal((await POST(request(payload, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request({ ...payload, route: "SECRET" }))).status, 400);
  assert.equal((await POST(request("x".repeat(1025)))).status, 413);
  assert.deepEqual(logs, []);
});

test("單一執行個體每分鐘最多三十筆，下一分鐘恢復", async () => {
  console.error = () => {};
  Date.now = () => 1_800_000_000_000;
  for (let i = 0; i < 30; i++) assert.equal((await POST(request(payload))).status, 204);
  const rejected = await POST(request(payload));
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("retry-after"), "60");
  Date.now = () => 1_800_000_060_000;
  assert.equal((await POST(request(payload))).status, 204);
});
