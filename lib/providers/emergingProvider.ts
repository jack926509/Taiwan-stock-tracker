// 櫃買中心興櫃名冊與參考行情。Time 為全表製表時間，不是逐筆成交時間。
import type { Market, Quote } from "../types.ts";
import type { QuoteResult, QuoteTarget } from "./quoteProvider.ts";

const BASE = "https://www.tpex.org.tw/openapi/v1";
const COMPANY_URL = `${BASE}/mopsfin_t187ap03_R`;
const QUOTE_URL = `${BASE}/tpex_esb_latest_statistics`;
const TIMEOUT_MS = 4000;
const LIST_TTL_MS = 24 * 60 * 60_000;
const QUOTE_TTL_MS = 60_000;
const RETRY_MS = 60_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const ID_RE = /^[0-9A-Z]{4,6}$/;
type SourceRow = Record<string, unknown>;

export interface EmergingStockEntry {
  stockId: string;
  name: string;
  market: "emerging";
  aliases?: string[];
}

async function fetchRows(url: string): Promise<SourceRow[]> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("興櫃來源暫時無法取得");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length === 0 ||
    payload.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("興櫃來源格式不正確");
  }
  return payload as SourceRow[];
}

let listCache: { at: number; list: EmergingStockEntry[] } | null = null;
let listPending: Promise<EmergingStockEntry[]> | null = null;
let listRetryAt = 0;

/** 快取僅能證明曾屬於興櫃；查無代號不代表不是興櫃，尤其名冊過期時。 */
export function getCachedEmergingStock(stockId: string): EmergingStockEntry | undefined {
  return listCache?.list.find(row => row.stockId === stockId);
}

/** 僅供保留曾由官方確認的興櫃；不得用缺席代號推斷其他市場。 */
export function getCachedEmergingStockList(): EmergingStockEntry[] {
  return listCache?.list ?? [];
}

export async function getEmergingStockList(): Promise<EmergingStockEntry[]> {
  const now = Date.now();
  if (listCache && now >= listCache.at && now - listCache.at < LIST_TTL_MS) return listCache.list;
  if (listPending) return listPending;
  // 過期名冊不可作為「不屬於興櫃」的證據。
  if (now < listRetryAt) throw new Error("興櫃名冊等待重試");
  listPending = (async () => {
    try {
      const rows = await fetchRows(COMPANY_URL);
      const byId = new Map<string, EmergingStockEntry>();
      for (const row of rows) {
        const stockId = row.SecuritiesCompanyCode;
        const name = row.CompanyAbbreviation;
        if (typeof stockId !== "string" || !ID_RE.test(stockId) || typeof name !== "string" || !name.trim()) continue;
        const alias = typeof row.Symbol === "string" ? row.Symbol.trim() : "";
        byId.set(stockId, { stockId, name: name.trim(), market: "emerging", ...(alias ? { aliases: [alias] } : {}) });
      }
      if (byId.size === 0) throw new Error("興櫃名冊沒有有效資料");
      const list = [...byId.values()];
      listCache = { at: Date.now(), list };
      listRetryAt = 0;
      return list;
    } catch (error) {
      listRetryAt = Date.now() + RETRY_MS;
      throw error;
    } finally { listPending = null; }
  })();
  return listPending;
}

/** 僅更正讀取結果，不寫回資料庫，也不改動使用者名稱、提醒或排序。 */
export async function normalizeEmergingMarkets<T extends { stock_id: string; market: Market; name: string }>(items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  let list: EmergingStockEntry[];
  try {
    list = await getEmergingStockList();
  } catch {
    // 更新失敗時保留正面確認過的分類，避免重新採用資料庫內已知錯誤的上櫃標籤。
    list = listCache?.list ?? [];
  }
  const ids = new Set(list.map(row => row.stockId));
  return items.map(row => ids.has(row.stock_id) && row.market !== "emerging" ? { ...row, market: "emerging" } : row);
}

function numeric(value: unknown, positive = true): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && (positive ? number > 0 : number >= 0) ? number : null;
}

function sourceTime(date: unknown, time: unknown): { asOf: string; time: string } | null {
  if (typeof date !== "string" || !/^\d{7}$/.test(date) || typeof time !== "string" || !/^\d{6}$/.test(time)) return null;
  const year = Number(date.slice(0, 3)) + 1911;
  const day = `${year}-${date.slice(3, 5)}-${date.slice(5, 7)}`;
  const clock = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  if (Number(time.slice(0, 2)) > 23 || Number(time.slice(2, 4)) > 59 || Number(time.slice(4, 6)) > 59) return null;
  const at = Date.parse(`${day}T${clock}+08:00`);
  if (!Number.isFinite(at) || at > Date.now() || Date.now() - at > MAX_AGE_MS) return null;
  // Date.parse 會將不存在的 2 月 30 日正規化，必須回頭比對原始日期。
  if (new Date(at + 8 * 60 * 60_000).toISOString().slice(0, 19) !== `${day}T${clock}`) return null;
  return { asOf: new Date(at).toISOString(), time: clock };
}

function quoteFromRow(row: SourceRow, source: "tpex" | "stale"): Quote | null {
  const stockId = row.SecuritiesCompanyCode;
  const price = numeric(row.LatestPrice);
  const timestamp = sourceTime(row.Date, row.Time);
  if (typeof stockId !== "string" || !ID_RE.test(stockId) || price === null || !timestamp) return null;
  const shares = numeric(row.TransactionVolume, false);
  return {
    stockId, name: typeof row.CompanyName === "string" ? row.CompanyName : stockId,
    market: "emerging", source, price,
    // 官方 PreviousAveragePrice 是前日均價，不能放入前收或漲跌基準；來源也沒有開盤價。
    prevClose: null, change: null, changePct: null, open: null,
    high: numeric(row.Highest), low: numeric(row.Lowest),
    // 官方網頁 /www/zh-tw/emerging/latest 的總成交數量單位為股，與逐檔加總相符。
    volume: shares === null ? null : shares / 1000,
    traded: shares !== null && shares > 0,
    ...timestamp,
  };
}

let quoteCache: { at: number; rows: SourceRow[] } | null = null;
let quotePending: Promise<{ rows: SourceRow[]; source: "tpex" | "stale" }> | null = null;
let quoteRetryAt = 0;

async function quoteRows(): Promise<{ rows: SourceRow[]; source: "tpex" | "stale" }> {
  const now = Date.now();
  if (quoteCache && now >= quoteCache.at && now - quoteCache.at < QUOTE_TTL_MS) return { rows: quoteCache.rows, source: "tpex" };
  if (quotePending) return quotePending;
  const stale = () => ({ rows: quoteCache?.rows ?? [], source: "stale" as const });
  if (now < quoteRetryAt) return stale();
  quotePending = (async () => {
    try {
      const rows = await fetchRows(QUOTE_URL);
      quoteCache = { at: Date.now(), rows };
      quoteRetryAt = 0;
      return { rows, source: "tpex" as const };
    } catch {
      quoteRetryAt = Date.now() + RETRY_MS;
      return stale();
    } finally { quotePending = null; }
  })();
  return quotePending;
}

export async function fetchEmergingQuotes(targets: QuoteTarget[]): Promise<QuoteResult> {
  const requested = new Set(targets.filter(target => target.market === "emerging").map(target => target.stockId));
  if (requested.size === 0) return { quotes: [], source: "tpex", asOf: null, complete: targets.length === 0 };
  const result = await quoteRows();
  const byId = new Map<string, Quote>();
  for (const row of result.rows) {
    if (typeof row.SecuritiesCompanyCode !== "string" || !requested.has(row.SecuritiesCompanyCode) || byId.has(row.SecuritiesCompanyCode)) continue;
    const quote = quoteFromRow(row, result.source);
    if (quote) byId.set(quote.stockId, quote);
  }
  const quotes = [...requested].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  return {
    quotes, source: result.source,
    asOf: quotes.length ? new Date(Math.min(...quotes.map(quote => Date.parse(quote.asOf!)))).toISOString() : null,
    complete: quotes.length === requested.size && targets.every(target => target.market === "emerging"),
  };
}
