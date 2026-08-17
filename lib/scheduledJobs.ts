import { isMarketOpenNow, isTradingDay, taipeiNow } from "./market-hours.ts";
import {
  claimScheduledJob,
  finishScheduledJob,
  type ScheduledJobName,
  type ScheduledJobResult,
} from "./scheduledJobLock.ts";

export type ScheduledJobExecution =
  | {
      job: ScheduledJobName;
      status: "ok";
      detail: Record<string, string | number | boolean | null>;
    }
  | {
      job: ScheduledJobName;
      status: "skipped";
      reason: "market-closed" | "non-trading-day" | "locked";
    }
  | { job: "unknown"; status: "skipped"; reason: "unknown-cron" };

export interface ScheduledJobDependencies {
  isMarketOpenNow: typeof isMarketOpenNow;
  isTradingDay: typeof isTradingDay;
  claim: typeof claimScheduledJob;
  finish: typeof finishScheduledJob;
  checkAlerts: (now?: Date) => Promise<number>;
  dailySummary: (now?: Date) => Promise<boolean>;
  backfillWatchlist: () => Promise<{ ok: number; fail: number }>;
  keepAlive: () => Promise<void>;
}

const CRON_JOB = {
  "* * * * MON-FRI": "alerts",
  "35 5 * * MON-FRI": "daily-summary",
  "0 9 * * MON-FRI": "backfill",
  "30 4 * * SAT,SUN": "keep-alive",
} as const satisfies Record<string, ScheduledJobName>;

const LEASE_SECONDS: Record<ScheduledJobName, number> = {
  alerts: 55,
  "daily-summary": 300,
  backfill: 840,
  "keep-alive": 60,
};

const defaultDependencies: ScheduledJobDependencies = {
  isMarketOpenNow,
  isTradingDay,
  claim: claimScheduledJob,
  finish: finishScheduledJob,
  checkAlerts: async (now) => {
    const alerts = await import("./alerts.ts");
    return alerts.checkAlerts(now);
  },
  dailySummary: async (now) => {
    const summary = await import("./daily-summary.ts");
    return summary.dailySummary(now);
  },
  backfillWatchlist: async () => {
    const backfill = await import("./backfill.ts");
    return backfill.backfillWatchlist();
  },
  keepAlive: async () => {
    const status = await import("./status.ts");
    return status.keepAlive();
  },
};

async function runJob(
  job: ScheduledJobName,
  now: Date,
  deps: ScheduledJobDependencies
): Promise<Record<string, string | number | boolean | null>> {
  switch (job) {
    case "alerts":
      return { sent: await deps.checkAlerts(now) };
    case "daily-summary":
      return { sent: await deps.dailySummary(now) };
    case "backfill":
      return deps.backfillWatchlist();
    case "keep-alive":
      await deps.keepAlive();
      return { pinged: true };
  }
}

export async function runScheduledCron(
  cron: string,
  now: Date = new Date(),
  deps: ScheduledJobDependencies = defaultDependencies
): Promise<ScheduledJobExecution> {
  const job = CRON_JOB[cron as keyof typeof CRON_JOB];
  if (!job) {
    return { job: "unknown", status: "skipped", reason: "unknown-cron" };
  }

  if (job === "alerts" && !(await deps.isMarketOpenNow(now))) {
    return { job, status: "skipped", reason: "market-closed" };
  }
  if (job === "daily-summary" && !(await deps.isTradingDay(taipeiNow(now)))) {
    return { job, status: "skipped", reason: "non-trading-day" };
  }

  const runId = crypto.randomUUID();
  if (!(await deps.claim(job, runId, LEASE_SECONDS[job]))) {
    return { job, status: "skipped", reason: "locked" };
  }

  let detail: Record<string, string | number | boolean | null>;
  try {
    detail = await runJob(job, now, deps);
  } catch (error) {
    const result: ScheduledJobResult = {
      status: "error",
      detail: {
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      },
    };
    try {
      await deps.finish(job, runId, result);
    } catch {
      // 不輸出 finish 錯誤內容，避免將資料庫密鑰寫入日誌。
      console.error(`[scheduled:${job}] 無法記錄業務失敗狀態`);
    }
    throw error;
  }

  await deps.finish(job, runId, { status: "ok", detail });
  return { job, status: "ok", detail };
}
