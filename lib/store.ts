// 自選股儲存層：有設 Supabase 走雲端、否則退回本地 JSON 檔（.data/watchlist.json）。
// 讓「先本地測試、之後再上 Supabase」兩種模式共用同一組 API，前端與路由無感切換。
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/lib/supabase";
import type { Market } from "@/lib/providers/quoteProvider";

export interface WatchItem {
  stock_id: string;
  market: Market;
  name: string;
  group_name: string;
  alert_high: number | null;
  alert_low: number | null;
  sort_order: number;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "watchlist.json");

// 本地測試預設帶幾檔，開頁就有東西看（價格仍由 MIS 即時抓）
const SEED: WatchItem[] = [
  mk("2330", "tse", "台積電", 0),
  mk("2317", "tse", "鴻海", 1),
  mk("0050", "tse", "元大台灣50", 2),
  mk("6488", "otc", "環球晶", 3),
];

function mk(
  stock_id: string,
  market: Market,
  name: string,
  sort_order: number
): WatchItem {
  return {
    stock_id,
    market,
    name,
    group_name: "預設",
    alert_high: null,
    alert_low: null,
    sort_order,
  };
}

export function usingSupabase(): boolean {
  return getSupabase() !== null;
}

// ── 本地 JSON 檔後端 ───────────────────────────────────────────────────
async function fileRead(): Promise<WatchItem[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as WatchItem[];
  } catch {
    await fileWrite(SEED); // 第一次執行：寫入種子
    return SEED;
  }
}

async function fileWrite(items: WatchItem[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(items, null, 2), "utf8");
}

// ── 對外統一 API ───────────────────────────────────────────────────────
export async function listWatchlist(): Promise<WatchItem[]> {
  const db = getSupabase();
  if (!db) return fileRead();
  const { data, error } = await db
    .from("watchlist")
    .select("*")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as WatchItem[];
}

export async function addWatch(item: {
  stockId: string;
  market: Market;
  name: string;
}): Promise<void> {
  const db = getSupabase();
  if (!db) {
    const items = await fileRead();
    if (items.some((i) => i.stock_id === item.stockId)) return;
    const sort_order = items.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1;
    items.push(mk(item.stockId, item.market, item.name, sort_order));
    await fileWrite(items);
    return;
  }
  const { error } = await db.from("watchlist").upsert({
    stock_id: item.stockId,
    market: item.market,
    name: item.name,
  });
  if (error) throw new Error(error.message);
}

export async function removeWatch(stockId: string): Promise<void> {
  const db = getSupabase();
  if (!db) {
    const items = await fileRead();
    await fileWrite(items.filter((i) => i.stock_id !== stockId));
    return;
  }
  const { error } = await db.from("watchlist").delete().eq("stock_id", stockId);
  if (error) throw new Error(error.message);
}
