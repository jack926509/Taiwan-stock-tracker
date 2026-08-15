import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, test } from "node:test";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(
        new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        context
      );
    }
    return nextResolve(specifier, context);
  },
});

const { getScheduledJobStatuses, toScheduledJobStatus } = await import(
  "../lib/status.ts"
);

test("toScheduledJobStatus only exposes the safe scheduled-job fields", () => {
  assert.deepEqual(
    toScheduledJobStatus({
      job_name: "alerts",
      run_id: "00000000-0000-4000-8000-000000000001",
      lease_until: "2026-08-15T01:01:00.000Z",
      last_started_at: "2026-08-15T01:00:00.000Z",
      last_finished_at: "2026-08-15T01:00:03.000Z",
      last_status: "ok",
      last_detail: { sent: 1 },
    }),
    [
      "alerts",
      {
        lastStartedAt: "2026-08-15T01:00:00.000Z",
        lastFinishedAt: "2026-08-15T01:00:03.000Z",
        status: "ok",
        detail: { sent: 1 },
      },
    ]
  );
});

test("error job detail uses a fixed message and drops raw errors and secrets", () => {
  const status = toScheduledJobStatus({
    job_name: "alerts",
    last_started_at: "2026-08-15T01:00:00.000Z",
    last_finished_at: "2026-08-15T01:00:03.000Z",
    last_status: "error",
    last_detail: {
      error: "upstream failed SECRET-alert-token",
      nested: {
        run_id: "00000000-0000-4000-8000-000000000001",
        lease_until: "2026-08-15T01:01:00.000Z",
      },
    },
  });

  assert.deepEqual(status[1].detail, { error: "排程執行失敗" });
  assert.doesNotMatch(
    JSON.stringify(status),
    /SECRET-alert-token|run_id|lease_until|upstream failed/
  );
});

test("successful job detail keeps only known scalar fields for that job", () => {
  const status = toScheduledJobStatus({
    job_name: "backfill",
    last_started_at: "2026-08-15T09:00:00.000Z",
    last_finished_at: "2026-08-15T09:05:00.000Z",
    last_status: "ok",
    last_detail: {
      ok: 4,
      fail: 1,
      sent: 999,
      secret: "SECRET-backfill-token",
      nested: {
        run_id: "00000000-0000-4000-8000-000000000001",
        lease_until: "2026-08-15T09:10:00.000Z",
      },
    },
  });

  assert.deepEqual(status[1].detail, { ok: 4, fail: 1 });
  assert.doesNotMatch(
    JSON.stringify(status),
    /SECRET-backfill-token|run_id|lease_until|sent|nested/
  );
});

test("getScheduledJobStatuses queries only safe columns", async () => {
  const calls = [];
  const fakeDb = {
    from(table) {
      calls.push(["from", table]);
      return {
        async select(columns) {
          calls.push(["select", columns]);
          return {
            data: [
              {
                job_name: "backfill",
                last_started_at: "2026-08-15T09:00:00.000Z",
                last_finished_at: null,
                last_status: "running",
                last_detail: {},
              },
            ],
            error: null,
          };
        },
      };
    },
  };

  assert.deepEqual(await getScheduledJobStatuses(fakeDb), {
    backfill: {
      lastStartedAt: "2026-08-15T09:00:00.000Z",
      lastFinishedAt: null,
      status: "running",
      detail: {},
    },
  });
  assert.deepEqual(calls, [
    ["from", "scheduled_job_state"],
    [
      "select",
      "job_name,last_started_at,last_finished_at,last_status,last_detail",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /run_id|lease_until/);
});

test("a missing scheduled-job migration fails closed without raw DB errors", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
  const fakeDb = {
    from() {
      return {
        async select() {
          return {
            data: null,
            error: {
              message:
                "relation scheduled_job_state does not exist test-service-role-secret",
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    getScheduledJobStatuses(fakeDb),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.message, "scheduled job status unavailable");
      assert.doesNotMatch(error.message, /does not exist|test-service-role-secret/);
      return true;
    }
  );
});
