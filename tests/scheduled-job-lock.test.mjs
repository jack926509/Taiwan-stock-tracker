import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  claimScheduledJob,
  finishScheduledJob,
} from "../lib/scheduledJobLock.ts";

const ORIGINAL_ENV = { ...process.env };
const RUN_ID = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("claimScheduledJob uses the atomic Supabase RPC", async () => {
  const calls = [];
  const fakeDb = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };

  assert.equal(await claimScheduledJob("alerts", RUN_ID, 55, fakeDb), true);
  assert.deepEqual(calls[0], {
    name: "claim_scheduled_job",
    args: {
      p_job_name: "alerts",
      p_run_id: RUN_ID,
      p_lease_seconds: 55,
    },
  });
});

test("claimScheduledJob returns false when another run owns the lease", async () => {
  const fakeDb = {
    async rpc() {
      return { data: false, error: null };
    },
  };

  assert.equal(await claimScheduledJob("backfill", RUN_ID, 300, fakeDb), false);
});

test("claimScheduledJob hides the Supabase key from errors", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
  const fakeDb = {
    async rpc() {
      return {
        data: null,
        error: { message: "RPC rejected test-service-role-secret" },
      };
    },
  };

  await assert.rejects(
    claimScheduledJob("daily-summary", RUN_ID, 120, fakeDb),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.match(error.message, /^排程鎖定失敗：/);
      assert.doesNotMatch(error.message, /test-service-role-secret/);
      return true;
    }
  );
});

test("finishScheduledJob only sends the current run result", async () => {
  const calls = [];
  const fakeDb = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: null, error: null };
    },
  };
  const result = {
    status: "ok",
    detail: { sent: 3, marketOpen: true, note: null },
  };

  await finishScheduledJob("alerts", RUN_ID, result, fakeDb);

  assert.deepEqual(calls[0], {
    name: "finish_scheduled_job",
    args: {
      p_job_name: "alerts",
      p_run_id: RUN_ID,
      p_status: "ok",
      p_detail: result.detail,
    },
  });
});

test("finishScheduledJob hides the Supabase key from errors", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
  const fakeDb = {
    async rpc() {
      return {
        data: null,
        error: { message: "RPC rejected test-service-role-secret" },
      };
    },
  };

  await assert.rejects(
    finishScheduledJob(
      "alerts",
      RUN_ID,
      { status: "error", detail: { reason: "upstream" } },
      fakeDb
    ),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.match(error.message, /^排程完成記錄失敗：/);
      assert.doesNotMatch(error.message, /test-service-role-secret/);
      return true;
    }
  );
});

test("schedule locks require Supabase and never use a local fallback", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  await assert.rejects(
    claimScheduledJob("keep-alive", RUN_ID, 55),
    new Error("未設定 Supabase，無法取得排程鎖定")
  );
});
