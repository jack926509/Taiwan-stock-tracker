// LINE 推播：複用 Hermes 既有的 LINE 官方帳號憑證，直接打 Messaging API push 端點。
// 不經 Hermes 行程（那是本機常駐、靠 cloudflared 通道），由 Zeabur 雲端直送最穩。
// 憑證只放環境變數（.env.local 與 Zeabur），切勿寫進程式碼或 git。
//
// 用量防護：LINE 官方帳號免費方案每月推播則數有上限，理論最大日推量（自選股數 × 4 型 + 總覽）
// 可能撞頂，故加每日上限；用量與失敗紀錄皆借用既有 news_cache key-value 快取（不需新表）。
import { getSupabase } from "@/lib/supabase";
import { taipeiNow } from "@/lib/market-hours";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

// 遠未來，避免被 purge-expired-news-cache 排程清掉（比照 lib/status.ts 的 recordBackfill 作法）
const NEVER_EXPIRE = "2099-12-31T00:00:00.000Z";
const LINE_USAGE_KEY = "meta:line-usage";
const LINE_FAILURE_KEY = "meta:line-last-failure";

// 每日推播上限（先設 15，依實際用量調整）；超過就不送，只記 log
export const LINE_DAILY_CAP = 15;

export interface LineUsage {
  month: string; // "2026-07"
  count: number; // 本月累積推播則數
  day: string; // "2026-07-06"
  dayCount: number; // 本日累積推播則數
}

export interface LineFailure {
  at: string; // ISO
  reason: string;
}

export function lineConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TARGET_USER_ID
  );
}

// 讀取當下用量（依 now 自動處理跨月/跨日歸零，不落地寫入——純讀）
async function readUsage(
  db: ReturnType<typeof getSupabase>,
  now: Date
): Promise<LineUsage> {
  const isoDate = taipeiNow(now).isoDate;
  const month = isoDate.slice(0, 7);
  const { data } = await db!
    .from("news_cache")
    .select("payload")
    .eq("cache_key", LINE_USAGE_KEY)
    .maybeSingle();
  const rec = data?.payload as LineUsage | undefined;
  if (!rec || rec.month !== month) {
    return { month, count: 0, day: isoDate, dayCount: 0 };
  }
  if (rec.day !== isoDate) {
    return { month, count: rec.count, day: isoDate, dayCount: 0 };
  }
  return rec;
}

async function saveUsage(
  db: ReturnType<typeof getSupabase>,
  usage: LineUsage
): Promise<void> {
  await db!.from("news_cache").upsert({
    cache_key: LINE_USAGE_KEY,
    payload: usage,
    fetched_at: new Date().toISOString(),
    expires_at: NEVER_EXPIRE,
  });
}

async function recordFailure(
  db: ReturnType<typeof getSupabase>,
  now: Date,
  reason: string
): Promise<void> {
  const rec: LineFailure = { at: now.toISOString(), reason };
  await db!.from("news_cache").upsert({
    cache_key: LINE_FAILURE_KEY,
    payload: rec,
    fetched_at: rec.at,
    expires_at: NEVER_EXPIRE,
  });
}

async function clearFailure(db: ReturnType<typeof getSupabase>): Promise<void> {
  await db!.from("news_cache").delete().eq("cache_key", LINE_FAILURE_KEY);
}

// 供 /api/health?detail=1 顯示：本月/本日 LINE 推播用量（無 Supabase 時回 null）
export async function getLineUsage(now: Date = new Date()): Promise<
  (LineUsage & { dailyCap: number }) | null
> {
  const db = getSupabase();
  if (!db) return null;
  const usage = await readUsage(db, now);
  return { ...usage, dailyCap: LINE_DAILY_CAP };
}

// 供 /api/health?detail=1 顯示：最近一次推播失敗紀錄（無失敗或無 Supabase 時回 null）
export async function getLineLastFailure(): Promise<LineFailure | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("news_cache")
    .select("payload")
    .eq("cache_key", LINE_FAILURE_KEY)
    .maybeSingle();
  const record = data?.payload as LineFailure | undefined;
  if (!record || typeof record.at !== "string" || !Number.isFinite(Date.parse(record.at))) return null;
  const http = typeof record.reason === "string" ? record.reason.match(/^HTTP ([45]\d{2})(?:$|：)/) : null;
  return { at: new Date(record.at).toISOString(), reason: http ? `HTTP ${http[1]}` : "推播處理失敗" };
}

// 任意一則 LINE message 物件（text／flex 皆可，型別由呼叫端負責組對）
export type LineMessage = Record<string, unknown>;

// 底層送出：承載每日上限與用量/失敗記錄，訊息型別不拘（text 或 flex 都走這條路，行為完全一致）
// 成功回 true，未設定、超過每日上限或失敗回 false
// （不丟例外，避免中斷檢查迴圈；語意對呼叫端相容——呼叫端本來就把 false 當失敗處理）
export async function pushLineMessages(messages: LineMessage[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TARGET_USER_ID;
  if (!token || !to) return false;

  const now = new Date();
  const db = getSupabase();
  let usage: LineUsage | null = null;
  if (db) {
    usage = await readUsage(db, now);
    if (usage.dayCount >= LINE_DAILY_CAP) {
      console.log(`[line] 已達每日推播上限 ${LINE_DAILY_CAP} 則，本則跳過`);
      return false;
    }
  }

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const reason = `HTTP ${res.status}`;
      console.error(`[line] push 失敗 ${reason}`);
      if (db) await recordFailure(db, now, reason);
      return false;
    }
    if (db && usage) {
      usage.count += 1;
      usage.dayCount += 1;
      await saveUsage(db, usage);
      await clearFailure(db);
    }
    return true;
  } catch {
    console.error("[line] 推播處理失敗");
    if (db) await recordFailure(db, now, "推播處理失敗");
    return false;
  }
}

// 推一則純文字訊息給設定的 userId；薄封裝 pushLineMessages，維持既有呼叫端相容
export async function pushLine(text: string): Promise<boolean> {
  return pushLineMessages([{ type: "text", text }]);
}
