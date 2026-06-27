// 後端可觀測性：記錄每日 backfill 結果、彙整後端健康狀態。
// 因 Zeabur CLI 無法拉 stdout，改把關鍵狀態寫進 news_cache 供 /api/health?detail=1 查詢。
import { getSupabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    ]);

  if (backfill.error) throw new Error(`news_cache meta: ${backfill.error.message}`);
  if (sess.error) throw new Error(`mis_session: ${sess.error.message}`);

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
  };
}
