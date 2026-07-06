// 基本面快取：整包 JSON 存一份（法人/營收/估值更新頻率低，12 小時 TTL 即可）
// 本地走 .data/fundamental/、雲端走 news_cache 表（cache_key + payload jsonb）
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";
import type { Fundamental } from "@/lib/providers/fundamentalProvider";

export interface FundamentalCache {
  fetchedAt: string; // ISO
  expiresAt: string; // ISO
  data: Fundamental;
}

// 快取結構版本：改變 Fundamental 形狀（如新增 eps）時 +1，
// 讀取到舊版本一律視為未命中自動重抓，免再手動清資料庫。
// v1=估值/法人/營收；v2=加入 eps；v3=加入 dividend（股利政策）；
// v4=dividend 改以 date 西元年份分組（v3 誤用期別字串當鍵，未真正按年加總）。
export const CACHE_VERSION = 4;

const DIR = path.join(process.cwd(), ".data", "fundamental");
export const TTL_MS = 12 * 60 * 60 * 1000; // 完整資料：12 小時
export const RETRY_TTL_MS = 30 * 60 * 1000; // 半套（抓失敗）：30 分鐘後自動重抓

function fileOf(stockId: string): string {
  // stockId 已由 API 路由驗證為英數字，無路徑穿越疑慮
  return path.join(DIR, `${stockId}.json`);
}

function keyOf(stockId: string): string {
  return `fundamental:${stockId}`;
}

// 雲端 payload 外殼：{ v: 版本, data: 基本面 }。
// 舊資料（直接存 Fundamental，無 v 欄位）讀到時版本不符 → 視為未命中。
interface CloudPayload {
  v?: number;
  data?: Fundamental;
}

export async function loadFundamental(
  stockId: string
): Promise<FundamentalCache | null> {
  const db = getSupabase();
  if (!db) {
    try {
      const raw = await fs.readFile(fileOf(stockId), "utf8");
      const cache = JSON.parse(raw) as FundamentalCache & { version?: number };
      if (cache.version !== CACHE_VERSION) return null; // 舊版本→重抓
      return cache;
    } catch {
      return null;
    }
  }
  const { data, error } = await db
    .from("news_cache")
    .select("payload, fetched_at, expires_at")
    .eq("cache_key", keyOf(stockId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const payload = data.payload as CloudPayload;
  if (payload?.v !== CACHE_VERSION || !payload.data) return null; // 舊版本→重抓
  return {
    fetchedAt: data.fetched_at as string,
    expiresAt: data.expires_at as string,
    data: payload.data,
  };
}

export async function saveFundamental(
  stockId: string,
  data: Fundamental,
  now: Date,
  ttlMs: number = TTL_MS
): Promise<FundamentalCache> {
  const cache: FundamentalCache = {
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    data,
  };
  const db = getSupabase();
  if (!db) {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(
      fileOf(stockId),
      JSON.stringify({ version: CACHE_VERSION, ...cache }),
      "utf8"
    );
    return cache;
  }
  const { error } = await db.from("news_cache").upsert({
    cache_key: keyOf(stockId),
    payload: { v: CACHE_VERSION, data } satisfies CloudPayload,
    fetched_at: cache.fetchedAt,
    expires_at: cache.expiresAt,
  });
  if (error) throw new Error(error.message);
  return cache;
}
