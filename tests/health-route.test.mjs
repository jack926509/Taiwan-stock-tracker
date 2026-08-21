import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

globalThis.__healthRouteTestDeps = {
  isAuthorizedHealthDetail: async () => false,
  getStatus: async () => ({ storage: "local" }),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/status") {
      const source = `
        export async function getStatus(...args) {
          return globalThis.__healthRouteTestDeps.getStatus(...args);
        }
      `;
      return {
        url: `data:text/javascript,${encodeURIComponent(source)}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/healthAuth") {
      const source = `
        export async function isAuthorizedHealthDetail(...args) {
          return globalThis.__healthRouteTestDeps.isAuthorizedHealthDetail(...args);
        }
      `;
      return {
        url: `data:text/javascript,${encodeURIComponent(source)}`,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(
        new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        context
      );
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    return nextResolve(specifier, context);
  },
});

const { GET } = await import("../app/api/health/route.ts");

test("detailed health returns sanitized 503 when scheduled state is unavailable", async () => {
  const rawError =
    "relation scheduled_job_state does not exist SECRET-service-role-key";
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  try {
    globalThis.__healthRouteTestDeps = {
      isAuthorizedHealthDetail: async () => true,
      getStatus: async () => {
        throw new Error(rawError);
      },
    };
    const response = await GET({
      nextUrl: new URL("https://example.test/api/health?detail=1"),
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.error, "health status unavailable");
    assert.doesNotMatch(JSON.stringify(body), /does not exist|SECRET-service-role-key/);
    assert.doesNotMatch(logs.join("\n"), /does not exist|SECRET-service-role-key/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("lightweight health stays 200 without querying detailed status", async () => {
  let authCalls = 0;
  let statusCalls = 0;
  globalThis.__healthRouteTestDeps = {
    isAuthorizedHealthDetail: async () => {
      authCalls += 1;
      return true;
    },
    getStatus: async () => {
      statusCalls += 1;
      return { storage: "supabase" };
    },
  };
  const response = await GET({
    nextUrl: new URL("https://example.test/api/health"),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(authCalls, 0);
  assert.equal(statusCalls, 0);
});
