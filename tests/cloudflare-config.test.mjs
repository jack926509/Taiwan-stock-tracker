import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Cloudflare 僅以 Function 處理 API 與個股深連結", () => {
  const routes = JSON.parse(readFileSync("frontend/public/_routes.json", "utf8"));

  assert.deepEqual(routes, {
    version: 1,
    include: ["/api/*", "/stock/*"],
    exclude: [],
  });
});

test("靜態資產具有適當的快取規則", () => {
  const headers = readFileSync("frontend/public/_headers", "utf8");

  assert.match(headers, /\/_next\/static\/\*/);
  assert.match(headers, /max-age=31536000, immutable/);
  assert.match(headers, /\n\/\n\s+Cache-Control: no-cache/);
});
