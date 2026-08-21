import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { authorizeWorkerRequest } from "../lib/workerAuth.ts";
import { config, middleware } from "../middleware.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("Worker runtime password blocks an unauthenticated protected API", async () => {
  const request = new Request("https://twstock.example/api/watchlist");

  const response = await authorizeWorkerRequest(request, "test-password");

  assert.equal(response?.status, 401);
  assert.deepEqual(await response?.json(), { error: "unauthorized" });
});

test("Worker runtime password redirects an unauthenticated page to login", async () => {
  const request = new Request("https://twstock.example/alerts?from=home");

  const response = await authorizeWorkerRequest(request, "test-password");

  assert.equal(response?.status, 307);
  assert.equal(response?.headers.get("location"), "https://twstock.example/login");
});

test("Worker runtime password allows public paths and a valid auth cookie", async () => {
  const login = await authorizeWorkerRequest(
    new Request("https://twstock.example/login"),
    "test-password",
  );
  const health = await authorizeWorkerRequest(
    new Request("https://twstock.example/api/health?detail=1"),
    "test-password",
  );
  const pwaIcon = await authorizeWorkerRequest(
    new Request("https://twstock.example/icons/192"),
    "test-password",
  );
  const authenticated = await authorizeWorkerRequest(
    new Request("https://twstock.example/api/watchlist", {
      headers: {
        Cookie:
          "app_auth=c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265",
      },
    }),
    "test-password",
  );

  assert.equal(login, null);
  assert.equal(health, null);
  assert.equal(pwaIcon, null);
  assert.equal(authenticated, null);
});

test("Worker remains unprotected when no runtime password is configured", async () => {
  const response = await authorizeWorkerRequest(
    new Request("https://twstock.example/api/watchlist"),
    undefined,
  );

  assert.equal(response, null);
});

test("Next middleware keeps the PWA manifest public when password protection is enabled", async () => {
  process.env.APP_ACCESS_PASSWORD = "test-password";
  const response = await middleware(
    new NextRequest("https://twstock.example/manifest.webmanifest"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("Next middleware matcher only bypasses Next internal assets", () => {
  assert.deepEqual(config.matcher, ["/((?!_next/static|_next/image).*)"]);
});
