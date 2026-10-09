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

function logFailure(job: ScheduledJobName, stage: "calendar" | "claim" | "business" | "finish", now: Date) {
  // 只記固定分類，不儲存第三方例外、股票名稱或密鑰。
  console.error("[scheduled:failure]", { job, stage, scheduledAt: now.toISOString() });
}

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

  try {
    if (job === "alerts" && !(await deps.isMarketOpenNow(now))) {
      return { job, status: "skipped", reason: "market-closed" };
    }
    if (job === "daily-summary" && !(await deps.isTradingDay(taipeiNow(now)))) {
      return { job, status: "skipped", reason: "non-trading-day" };
    }
  } catch (error) {
    logFailure(job, "calendar", now);
    throw error;
  }

  const runId = crypto.randomUUID();
  try {
    if (!(await deps.claim(job, runId, LEASE_SECONDS[job]))) {
      return { job, status: "skipped", reason: "locked" };
    }
  } catch (error) {
    logFailure(job, "claim", now);
    throw error;
  }

  let detail: Record<string, string | number | boolean | null>;
  try {
    detail = await runJob(job, now, deps);
  } catch (error) {
    logFailure(job, "business", now);
    const result: ScheduledJobResult = {
      status: "error",
      detail: {
        error: "排程執行失敗",
        stage: "business",
      },
    };
    try {
      await deps.finish(job, runId, result);
    } catch {
      logFailure(job, "finish", now);
    }
    throw error;
  }

  try {
    await deps.finish(job, runId, { status: "ok", detail });
  } catch (error) {
    logFailure(job, "finish", now);
    throw error;
  }
  return { job, status: "ok", detail };
}
