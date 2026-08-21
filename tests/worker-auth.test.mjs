import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { config, middleware } from "../middleware.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("Next middleware no longer requires an application password", async () => {
  const response = await middleware(
    new NextRequest("https://twstock.example/api/watchlist"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("Next middleware matcher only bypasses Next internal assets", () => {
  assert.deepEqual(config.matcher, ["/((?!_next/static|_next/image).*)"]);
});
