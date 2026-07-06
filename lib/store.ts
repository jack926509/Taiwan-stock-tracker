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
  alert_high_hit_at: string | null; // 已觸發時間戳；null = 待觸發（一次性去重用）
  alert_low_hit_at: string | null;
  alert_change_pct: number | null; // 漲跌幅提醒門檻（百分比數字，例如 5 代表 5%）
  alert_change_hit_at: string | null; // 最近一次觸發時間戳；每日一次性（跨日自動重新武裝，非「觸發後靜音直到重設」）
  alert_volume_on: boolean; // 爆量提醒開關
  alert_volume_hit_at: string | null; // 最近一次觸發時間戳；每日一次性
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
    alert_high_hit_at: null,
    alert_low_hit_at: null,
    alert_change_pct: null,
    alert_change_hit_at: null,
    alert_volume_on: false,
    alert_volume_hit_at: null,
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
  // 已存在則不動（與本地模式一致，避免重新加入時打亂排序）
  const { data: existing } = await db
    .from("watchlist")
    .select("stock_id")
    .eq("stock_id", item.stockId)
    .maybeSingle();
  if (existing) return;
  // 接到清單最後：取目前最大 sort_order + 1
  const { data: maxRow } = await db
    .from("watchlist")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;
  const { error } = await db.from("watchlist").insert({
    stock_id: item.stockId,
    market: item.market,
    name: item.name,
    sort_order,
  });
  if (error) throw new Error(error.message);
}

// 依傳入的代號順序重寫 sort_order（拖曳排序用）；清單外的代號忽略
export async function reorderWatch(orderedIds: string[]): Promise<void> {
  const db = getSupabase();
  if (!db) {
    const items = await fileRead();
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    items.sort(
      (a, b) =>
        (pos.get(a.stock_id) ?? Number.MAX_SAFE_INTEGER) -
        (pos.get(b.stock_id) ?? Number.MAX_SAFE_INTEGER)
    );
    items.forEach((it, i) => {
      it.sort_order = i;
    });
    await fileWrite(items);
    return;
  }
  // Supabase：逐筆更新（自選股數量有限，N 次寫入可接受）
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from("watchlist")
      .update({ sort_order: i })
      .eq("stock_id", orderedIds[i]);
    if (error) throw new Error(error.message);
  }
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

// 設定各項提醒門檻：任何一次儲存都會重新武裝全部四種（清掉對應 *_hit_at），
// 到價（high/low）達成後需使用者重設才會再次推播；漲跌幅／爆量另外每日跨日也會自動重新武裝（見 markAlertHit 呼叫端）。
export async function setAlert(
  stockId: string,
  high: number | null,
  low: number | null,
  changePct: number | null = null,
  volumeOn = false
): Promise<void> {
  const patch = {
    alert_high: high,
    alert_low: low,
    alert_high_hit_at: null,
    alert_low_hit_at: null,
    alert_change_pct: changePct,
    alert_change_hit_at: null,
    alert_volume_on: volumeOn,
    alert_volume_hit_at: null,
  };
  const db = getSupabase();
  if (!db) {
    const items = await fileRead();
    const row = items.find((i) => i.stock_id === stockId);
    if (!row) return;
    Object.assign(row, patch);
    await fileWrite(items);
    return;
  }
  const { error } = await db.from("watchlist").update(patch).eq("stock_id", stockId);
  if (error) throw new Error(error.message);
}

type AlertSide = "high" | "low" | "change" | "volume";

const HIT_COL: Record<AlertSide, keyof WatchItem> = {
  high: "alert_high_hit_at",
  low: "alert_low_hit_at",
  change: "alert_change_hit_at",
  volume: "alert_volume_hit_at",
};

// 標記某側已觸發（寫入時間戳）。到價（high/low）為「觸發後靜音直到使用者重設」；
// 漲跌幅／爆量（change/volume）為「每日一次性」，呼叫端（lib/alerts.ts）自行判斷 hit_at 是否為今天。
export async function markAlertHit(
  stockId: string,
  side: AlertSide,
  at: string
): Promise<void> {
  const col = HIT_COL[side];
  const db = getSupabase();
  if (!db) {
    const items = await fileRead();
    const row = items.find((i) => i.stock_id === stockId);
    if (!row) return;
    (row as unknown as Record<string, string>)[col] = at;
    await fileWrite(items);
    return;
  }
  const { error } = await db
    .from("watchlist")
    .update({ [col]: at })
    .eq("stock_id", stockId);
  if (error) throw new Error(error.message);
}
