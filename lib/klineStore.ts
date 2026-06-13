// 日 K 快取層：與自選股同邏輯——沒設 Supabase 走本地 JSON 檔，設了走 daily_kline 表
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";
import type { Candle } from "@/lib/providers/klineProvider";

const DIR = path.join(process.cwd(), ".data", "kline");

function fileOf(stockId: string): string {
  // stockId 已由 API 路由驗證為英數字，無路徑穿越疑慮
  return path.join(DIR, `${stockId}.json`);
}

export async function loadKline(stockId: string): Promise<Candle[]> {
  const db = getSupabase();
  if (!db) {
    try {
      const raw = await fs.readFile(fileOf(stockId), "utf8");
      return JSON.parse(raw) as Candle[];
    } catch {
      return [];
    }
  }
  const { data, error } = await db
    .from("daily_kline")
    .select("date, open, high, low, close, volume")
    .eq("stock_id", stockId)
    .order("date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    date: r.date as string,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

// 以日期為鍵合併寫入（新資料覆蓋同日舊資料）
export async function saveKline(
  stockId: string,
  existing: Candle[],
  incoming: Candle[]
): Promise<Candle[]> {
  const byDate = new Map(existing.map((c) => [c.date, c]));
  for (const c of incoming) byDate.set(c.date, c);
  const merged = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const db = getSupabase();
  if (!db) {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(fileOf(stockId), JSON.stringify(merged), "utf8");
    return merged;
  }
  const { error } = await db.from("daily_kline").upsert(
    incoming.map((c) => ({
      stock_id: stockId,
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  );
  if (error) throw new Error(error.message);
  return merged;
}
