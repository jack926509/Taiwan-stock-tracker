// 後端可觀測性：記錄每日 backfill 結果、彙整後端健康狀態。
// 因 Zeabur CLI 無法拉 stdout，改把關鍵狀態寫進 news_cache 供 /api/health?detail=1 查詢。
import { getSupabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLineUsage, getLineLastFailure, type LineUsage } from "@/lib/notify";
import type {
  ScheduledJobName,
  ScheduledJobResult,
} from "./scheduledJobLock.ts";

export interface BackfillRecord {
  ranAt: string; // ISO
  ok: number;
  fail: number;
}

const BACKFILL_KEY = "meta:backfill";
// 遠未來，避免被 purge-expired-news-cache 排程清掉
const NEVER_EXPIRE = "2099-12-31T00:00:00.000Z";

// backfill 跑完寫一筆紀錄（僅雲端模式）
export async function recordBackfill(
  ok: number,
  fail: number,
  now: Date
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const rec: BackfillRecord = { ranAt: now.toISOString(), ok, fail };
  await db.from("news_cache").upsert({
    cache_key: BACKFILL_KEY,
    payload: rec,
    fetched_at: rec.ranAt,
    expires_at: NEVER_EXPIRE,
  });
}

// 週末輕量 ping：保險用，避免 Supabase 免費專案 7 天無活動被暫停
// （工作日 backfill 已天然 keep-alive，此為伺服器重啟/排程失效時的備援）
export async function keepAlive(): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("watchlist").select("stock_id").limit(1);
}

export interface BackendStatus {
  storage: "supabase" | "local";
  tables?: Record<string, number>;
  lastBackfill?: BackfillRecord | null;
  misSessionAgeMin?: number | null; // MIS session cookie 距今幾分鐘
  lineUsage?: (LineUsage & { dailyCap: number }) | null; // 本月/本日 LINE 推播用量
  lineLastFailure?: { at: string; reason: string; minutesAgo: number } | null; // 最近一次推播失敗
  scheduledJobs?: Record<ScheduledJobName, ScheduledJobStatus>;
}

export interface ScheduledJobStatus {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  status: "running" | ScheduledJobResult["status"] | null;
  detail: ScheduledJobResult["detail"];
}

interface ScheduledJobStatusRow {
  job_name: unknown;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: unknown;
  last_detail: unknown;
}

const SCHEDULED_JOB_NAMES: ScheduledJobName[] = [
  "alerts",
  "daily-summary",
  "backfill",
  "keep-alive",
];

function isScheduledJobName(value: unknown): value is ScheduledJobName {
  return (
    typeof value === "string" &&
    SCHEDULED_JOB_NAMES.includes(value as ScheduledJobName)
  );
}

function safeScheduledJobStatus(
  value: unknown
): ScheduledJobStatus["status"] {
  return value === "running" || value === "ok" || value === "error"
    ? value
    : null;
}

function isDetailRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function sanitizeScheduledJobDetail(
  jobName: ScheduledJobName,
  status: ScheduledJobStatus["status"],
  detail: unknown
): ScheduledJobStatus["detail"] {
  if (status === "error") return { error: "排程執行失敗" };
  if (status !== "ok" || !isDetailRecord(detail)) return {};

  switch (jobName) {
    case "alerts": {
      const sent = safeCount(detail.sent);
      return sent === undefined ? {} : { sent };
    }
    case "daily-summary":
      return typeof detail.sent === "boolean" ? { sent: detail.sent } : {};
    case "backfill": {
      const safeDetail: ScheduledJobStatus["detail"] = {};
      const ok = safeCount(detail.ok);
      const fail = safeCount(detail.fail);
      if (ok !== undefined) safeDetail.ok = ok;
      if (fail !== undefined) safeDetail.fail = fail;
      return safeDetail;
    }
    case "keep-alive":
      return typeof detail.pinged === "boolean"
        ? { pinged: detail.pinged }
        : {};
  }
}

export function toScheduledJobStatus(
  row: ScheduledJobStatusRow
): [ScheduledJobName, ScheduledJobStatus] {
  if (!isScheduledJobName(row.job_name)) {
    throw new Error("scheduled job status unavailable");
  }
  const status = safeScheduledJobStatus(row.last_status);
  return [
    row.job_name,
    {
      lastStartedAt: row.last_started_at,
      lastFinishedAt: row.last_finished_at,
      status,
      detail: sanitizeScheduledJobDetail(row.job_name, status, row.last_detail),
    },
  ];
}

export async function getScheduledJobStatuses(
  db: SupabaseClient
): Promise<Record<ScheduledJobName, ScheduledJobStatus>> {
  const { data, error } = await db
    .from("scheduled_job_state")
    .select(
      "job_name,last_started_at,last_finished_at,last_status,last_detail"
    );
  if (error) {
    throw new Error("scheduled job status unavailable");
  }
  return Object.fromEntries(
    ((data ?? []) as ScheduledJobStatusRow[]).map(toScheduledJobStatus)
  ) as Record<ScheduledJobName, ScheduledJobStatus>;
}

async function rowCount(db: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

export async function getStatus(now: Date): Promise<BackendStatus> {
  const db = getSupabase();
  if (!db) return { storage: "local" };

  const [
    assistantConversations,
    assistantMessages,
    dailyKline,
    misSession,
    newsArticles,
    newsCache,
    watchlist,
    backfill,
    sess,
    scheduledJobs,
  ] =
    await Promise.all([
      rowCount(db, "assistant_conversations"),
      rowCount(db, "assistant_messages"),
      rowCount(db, "daily_kline"),
      rowCount(db, "mis_session"),
      rowCount(db, "news_articles"),
      rowCount(db, "news_cache"),
      rowCount(db, "watchlist"),
      db
        .from("news_cache")
        .select("payload")
        .eq("cache_key", BACKFILL_KEY)
        .maybeSingle(),
      db
        .from("mis_session")
        .select("fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getScheduledJobStatuses(db),
    ]);

  if (backfill.error) throw new Error(`news_cache meta: ${backfill.error.message}`);
  if (sess.error) throw new Error(`mis_session: ${sess.error.message}`);

  const [lineUsage, lineFailure] = await Promise.all([
    getLineUsage(now),
    getLineLastFailure(),
  ]);

  const sessAt = sess.data?.fetched_at as string | undefined;
  return {
    storage: "supabase",
    tables: {
      assistant_conversations: assistantConversations,
      assistant_messages: assistantMessages,
      daily_kline: dailyKline,
      mis_session: misSession,
      news_articles: newsArticles,
      news_cache: newsCache,
      watchlist,
    },
    lastBackfill: (backfill.data?.payload as BackfillRecord) ?? null,
    misSessionAgeMin: sessAt
      ? Math.round((now.getTime() - Date.parse(sessAt)) / 60000)
      : null,
    lineUsage,
    scheduledJobs,
    lineLastFailure: lineFailure
      ? {
          ...lineFailure,
          minutesAgo: Math.round((now.getTime() - Date.parse(lineFailure.at)) / 60000),
        }
      : null,
  };
}
