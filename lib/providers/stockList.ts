// 名稱搜尋合併 FinMind 與櫃買中心興櫃官方名冊，同代號以官方興櫃分類為準。
// 完整清單快取 24 小時；部分來源失敗只快取 1 分鐘，抓取中共用同一個 promise。
// searchStockList 為純函式（無 I/O），供 node --test 直接單元測試。

// 相對匯入含副檔名：node --test 的 --experimental-transform-types 不解析 "@/" 別名與省略副檔名
import { finmindRows } from "./finmind.ts";
import { getCachedEmergingStockList, getEmergingStockList } from "./emergingProvider.ts";
import type { Market } from "../types.ts";

export interface StockListEntry {
  stockId: string;
  name: string;
  market: Market;
  aliases?: string[];
}

interface StockInfoRow {
  stock_id: string;
  stock_name: string;
  type: string; // "twse" | "tpex" | 其他（權證等一律略過）
}

const ID_RE = /^[0-9A-Z]{4,6}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { expiresAt: number; list: StockListEntry[] } | null = null;
let inflight: Promise<StockListEntry[]> | null = null;

export async function getStockList(): Promise<StockListEntry[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.list;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      // data_id 留空＝整份市場清單；同一代號會因產業別出現多列，取第一列即可
      const [standard, emerging] = await Promise.allSettled([
        finmindRows<StockInfoRow>("TaiwanStockInfo", "", today),
        getEmergingStockList(),
      ]);
      const rows = standard.status === "fulfilled" ? standard.value : [];
      const seen = new Map<string, StockListEntry>();
      for (const r of rows) {
        if (!ID_RE.test(r.stock_id) || seen.has(r.stock_id)) continue;
        const market =
          r.type === "twse" ? "tse" : r.type === "tpex" ? "otc" : null;
        if (!market || !r.stock_name) continue;
        // FinMind 的 tpex 可能包含興櫃；官方名冊不可用時不將未知代號猜成上櫃。
        if (market === "otc" && emerging.status !== "fulfilled") continue;
        seen.set(r.stock_id, {
          stockId: r.stock_id,
          name: r.stock_name,
          market,
        });
      }
      const confirmedEmerging = emerging.status === "fulfilled" ? emerging.value : getCachedEmergingStockList();
      for (const entry of confirmedEmerging) seen.set(entry.stockId, entry);
      const list = [...seen.values()];
      if (list.length === 0) throw new Error("股票名冊暫時無法取得");
      const complete = standard.status === "fulfilled" && rows.length > 0 && emerging.status === "fulfilled";
      cache = { expiresAt: Date.now() + (complete ? TTL_MS : 60_000), list };
      return list;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// 模糊搜尋排名：代號完全相符 > 代號前綴 > 名稱開頭 > 名稱包含；同分再依代號排序
export function searchStockList(
  list: StockListEntry[],
  rawQuery: string,
  limit = 10
): StockListEntry[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const upper = q.toUpperCase();
  const scored: { entry: StockListEntry; score: number }[] = [];
  for (const entry of list) {
    let score: number;
    if (entry.stockId === upper) score = 0;
    else if (entry.stockId.startsWith(upper)) score = 1;
    else if ([entry.name, ...(entry.aliases ?? [])].some(name => name.toUpperCase().startsWith(upper))) score = 2;
    else if ([entry.name, ...(entry.aliases ?? [])].some(name => name.toUpperCase().includes(upper))) score = 3;
    else continue;
    scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score || a.entry.stockId.localeCompare(b.entry.stockId)
  );
  return scored.slice(0, limit).map((s) => s.entry);
}
