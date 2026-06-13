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

export async function loadFundamental(
  stockId: string
): Promise<FundamentalCache | null> {
  const db = getSupabase();
  if (!db) {
    try {
      const raw = await fs.readFile(fileOf(stockId), "utf8");
      return JSON.parse(raw) as FundamentalCache;
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
  return {
    fetchedAt: data.fetched_at as string,
    expiresAt: data.expires_at as string,
    data: data.payload as Fundamental,
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
    await fs.writeFile(fileOf(stockId), JSON.stringify(cache), "utf8");
    return cache;
  }
  const { error } = await db.from("news_cache").upsert({
    cache_key: keyOf(stockId),
    payload: data,
    fetched_at: cache.fetchedAt,
    expires_at: cache.expiresAt,
  });
  if (error) throw new Error(error.message);
  return cache;
}
