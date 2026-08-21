import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isAuthorizedHealthDetail } from "../lib/healthAuth.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("detail health is private by default", async () => {
  delete process.env.HEALTH_DETAIL_TOKEN;

  const req = new Request("https://example.test/api/health?detail=1");

  assert.equal(await isAuthorizedHealthDetail(req), false);
});

test("detail health accepts a bearer token", async () => {
  process.env.HEALTH_DETAIL_TOKEN = "health-secret";

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Authorization: "Bearer health-secret" },
  });

  assert.equal(await isAuthorizedHealthDetail(req), true);
});

test("detail health rejects the wrong bearer token", async () => {
  process.env.HEALTH_DETAIL_TOKEN = "health-secret";

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Authorization: "Bearer wrong" },
  });

  assert.equal(await isAuthorizedHealthDetail(req), false);
});

test("detail health stays private even when an old app auth cookie is sent", async () => {
  delete process.env.HEALTH_DETAIL_TOKEN;

  const req = new Request("https://example.test/api/health?detail=1", {
    headers: { Cookie: "app_auth=legacy-cookie" },
  });

  assert.equal(await isAuthorizedHealthDetail(req), false);
});
