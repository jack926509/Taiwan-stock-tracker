import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isAuthorizedHealthDetail } from "../lib/healthAuth.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("detail health is private by default", async () => {
  delete process.env.HEALTH_DETAIL_TOKEN;
  delete process.env.APP_ACCESS_PASSWORD;

  const req = new Request("https://example.test/api/health?detail=1");

  assert.equal(await isAuthorizedHealthDetail(req), false);
});

test("detail health accepts a bearer token", async () => {
  process.env.HEALTH_DETAIL_TOKEN = "health-secret";
  delete process.env.APP_ACCESS_PASSWORD;

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Authorization: "Bearer health-secret" },
  });

  assert.equal(await isAuthorizedHealthDetail(req), true);
});

test("detail health rejects the wrong bearer token", async () => {
  process.env.HEALTH_DETAIL_TOKEN = "health-secret";
  delete process.env.APP_ACCESS_PASSWORD;

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Authorization: "Bearer wrong" },
  });

  assert.equal(await isAuthorizedHealthDetail(req), false);
});

test("detail health accepts the existing app auth cookie", async () => {
  delete process.env.HEALTH_DETAIL_TOKEN;
  process.env.APP_ACCESS_PASSWORD = "app-password";
  const hash = await sha256Hex("app-password");

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Cookie: `app_auth=${hash}` },
  });

  assert.equal(await isAuthorizedHealthDetail(req), true);
});

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
