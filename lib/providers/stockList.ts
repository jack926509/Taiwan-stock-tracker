// 全市場代號／名稱清單（FinMind TaiwanStockInfo）：供「輸入名稱找股票」搜尋使用。
// 清單極少變動，模組層快取 24 小時；抓取中共用同一個 promise，避免同時多發。
// searchStockList 為純函式（無 I/O），供 node --test 直接單元測試。

// 相對匯入含副檔名：node --test 的 --experimental-transform-types 不解析 "@/" 別名與省略副檔名
import { finmindRows } from "./finmind.ts";

export interface StockListEntry {
  stockId: string;
  name: string;
  market: "tse" | "otc";
}

interface StockInfoRow {
  stock_id: string;
  stock_name: string;
  type: string; // "twse" | "tpex" | 其他（權證等一律略過）
}

const ID_RE = /^[0-9A-Z]{4,6}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { at: number; list: StockListEntry[] } | null = null;
let inflight: Promise<StockListEntry[]> | null = null;

export async function getStockList(): Promise<StockListEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      // data_id 留空＝整份市場清單；同一代號會因產業別出現多列，取第一列即可
      const rows = await finmindRows<StockInfoRow>("TaiwanStockInfo", "", today);
      const seen = new Map<string, StockListEntry>();
      for (const r of rows) {
        if (!ID_RE.test(r.stock_id) || seen.has(r.stock_id)) continue;
        const market =
          r.type === "twse" ? "tse" : r.type === "tpex" ? "otc" : null;
        if (!market || !r.stock_name) continue;
        seen.set(r.stock_id, {
          stockId: r.stock_id,
          name: r.stock_name,
          market,
        });
      }
      const list = [...seen.values()];
      if (list.length === 0) throw new Error("TaiwanStockInfo 回傳空清單");
      cache = { at: Date.now(), list };
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
    else if (entry.name.startsWith(q)) score = 2;
    else if (entry.name.includes(q)) score = 3;
    else continue;
    scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score || a.entry.stockId.localeCompare(b.entry.stockId)
  );
  return scored.slice(0, limit).map((s) => s.entry);
}
