import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runScheduledCron } from "../lib/scheduledJobs.ts";

const NOW = new Date("2026-08-17T05:35:00.000Z");

function deps(overrides = {}) {
  return {
    isMarketOpenNow: async () => true,
    isTradingDay: async () => true,
    claim: async () => true,
    finish: async () => {},
    checkAlerts: async () => 0,
    dailySummary: async () => false,
    backfillWatchlist: async () => ({ ok: 0, fail: 0 }),
    keepAlive: async () => {},
    ...overrides,
  };
}

test("盤外 alerts cron 不取得鎖也不抓報價", async () => {
  const calls = [];
  const result = await runScheduledCron(
    "* * * * 1-5",
    NOW,
    deps({
      isMarketOpenNow: async () => false,
      claim: async () => {
        calls.push("claim");
        return true;
      },
      checkAlerts: async () => {
        calls.push("alerts");
        return 1;
      },
    })
  );

  assert.deepEqual(result, {
    job: "alerts",
    status: "skipped",
    reason: "market-closed",
  });
  assert.deepEqual(calls, []);
});

test("重複 cron 取不到租約時跳過", async () => {
  const result = await runScheduledCron(
    "35 5 * * 1-5",
    NOW,
    deps({
      isTradingDay: async () => true,
      claim: async () => false,
    })
  );

  assert.deepEqual(result, {
    job: "daily-summary",
    status: "skipped",
    reason: "locked",
  });
});

test("四個 UTC cron 對應正確工作、租約時間與成功 detail", async () => {
  const cases = [
    {
      cron: "* * * * 1-5",
      job: "alerts",
      leaseSeconds: 55,
      override: { checkAlerts: async () => 3 },
      detail: { sent: 3 },
    },
    {
      cron: "35 5 * * 1-5",
      job: "daily-summary",
      leaseSeconds: 300,
      override: { dailySummary: async () => true },
      detail: { sent: true },
    },
    {
      cron: "0 9 * * 1-5",
      job: "backfill",
      leaseSeconds: 840,
      override: { backfillWatchlist: async () => ({ ok: 4, fail: 1 }) },
      detail: { ok: 4, fail: 1 },
    },
    {
      cron: "30 4 * * 0,6",
      job: "keep-alive",
      leaseSeconds: 60,
      override: { keepAlive: async () => {} },
      detail: { pinged: true },
    },
  ];

  for (const item of cases) {
    const claims = [];
    const finishes = [];
    const result = await runScheduledCron(
      item.cron,
      NOW,
      deps({
        ...item.override,
        claim: async (...args) => {
          claims.push(args);
          return true;
        },
        finish: async (...args) => {
          finishes.push(args);
        },
      })
    );

    assert.deepEqual(result, {
      job: item.job,
      status: "ok",
      detail: item.detail,
    });
    assert.equal(claims.length, 1);
    assert.equal(claims[0][0], item.job);
    assert.match(claims[0][1], /^[0-9a-f-]{36}$/i);
    assert.equal(claims[0][2], item.leaseSeconds);
    assert.deepEqual(finishes, [
      [item.job, claims[0][1], { status: "ok", detail: item.detail }],
    ]);
  }
});

test("收盤總覽以 UTC 時間轉換的台北日期判斷交易日", async () => {
  const tradingDayInputs = [];
  const calls = [];
  const result = await runScheduledCron(
    "35 5 * * 1-5",
    NOW,
    deps({
      isTradingDay: async (taipeiTime) => {
        tradingDayInputs.push(taipeiTime);
        return false;
      },
      claim: async () => {
        calls.push("claim");
        return true;
      },
      dailySummary: async () => {
        calls.push("summary");
        return true;
      },
    })
  );

  assert.deepEqual(tradingDayInputs, [
    { isoDate: "2026-08-17", minutes: 13 * 60 + 35, dayOfWeek: 1 },
  ]);
  assert.deepEqual(result, {
    job: "daily-summary",
    status: "skipped",
    reason: "non-trading-day",
  });
  assert.deepEqual(calls, []);
});

test("業務函式失敗後記錄精簡錯誤並重新拋出原錯誤", async () => {
  const failure = new Error(`測試錯誤${"x".repeat(400)}`);
  const finishes = [];

  await assert.rejects(
    runScheduledCron(
      "0 9 * * 1-5",
      NOW,
      deps({
        backfillWatchlist: async () => {
          throw failure;
        },
        finish: async (...args) => {
          finishes.push(args);
        },
      })
    ),
    (error) => error === failure
  );

  assert.equal(finishes.length, 1);
  assert.equal(finishes[0][0], "backfill");
  assert.match(finishes[0][1], /^[0-9a-f-]{36}$/i);
  assert.deepEqual(finishes[0][2], {
    status: "error",
    detail: { error: failure.message.slice(0, 300) },
  });
});

test("業務與完成記錄同時失敗時仍拋出原業務錯誤", async () => {
  const businessFailure = new Error("原始業務錯誤");
  const finishSecret = "finish-service-role-secret";
  const logCalls = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logCalls.push(args);
  };

  try {
    await assert.rejects(
      runScheduledCron(
        "0 9 * * 1-5",
        NOW,
        deps({
          backfillWatchlist: async () => {
            throw businessFailure;
          },
          finish: async () => {
            throw new Error(`完成記錄失敗 ${finishSecret}`);
          },
        })
      ),
      (error) => error === businessFailure
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(logCalls.length, 1);
  assert.doesNotMatch(JSON.stringify(logCalls), new RegExp(finishSecret));
});

test("非 Error 型別的失敗不寫入原始內容", async () => {
  const finishes = [];

  await assert.rejects(
    runScheduledCron(
      "30 4 * * 0,6",
      NOW,
      deps({
        keepAlive: async () => {
          throw "不可曝光的原始內容";
        },
        finish: async (...args) => {
          finishes.push(args);
        },
      })
    ),
    (error) => error === "不可曝光的原始內容"
  );

  assert.deepEqual(finishes[0][2], {
    status: "error",
    detail: { error: "unknown" },
  });
});

test("租約取得失敗時不執行外部通知業務", async () => {
  const failure = new Error("未設定 Supabase，無法取得排程鎖定");
  const calls = [];

  await assert.rejects(
    runScheduledCron(
      "* * * * 1-5",
      NOW,
      deps({
        claim: async () => {
          calls.push("claim");
          throw failure;
        },
        checkAlerts: async () => {
          calls.push("alerts");
          return 1;
        },
      })
    ),
    (error) => error === failure
  );

  assert.deepEqual(calls, ["claim"]);
});

test("未知 cron 安全跳過且不執行任何依賴", async () => {
  const calls = [];
  const result = await runScheduledCron(
    "1 2 3 4 5",
    NOW,
    deps({
      claim: async () => {
        calls.push("claim");
        return true;
      },
      keepAlive: async () => {
        calls.push("keep-alive");
      },
    })
  );

  assert.deepEqual(result, {
    job: "unknown",
    status: "skipped",
    reason: "unknown-cron",
  });
  assert.deepEqual(calls, []);
});

test("Next.js 啟動鉤子不再載入常駐排程", async () => {
  const source = await readFile(
    new URL("../instrumentation.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /export async function register\(\) \{\}/);
  assert.doesNotMatch(source, /instrumentation-node|node-cron|setInterval|setTimeout/);
});
