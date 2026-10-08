// 報價來源抽象（計劃書 §2.3 對策一、A.4 契約）
// 正式環境為 OpenNext Cloudflare Worker，session cookie 保存在 Supabase 並於執行個體快取。
// 換報價來源或部署形態，只改這支檔案。

import { getSupabase } from "@/lib/supabase";
import type { Quote, QuoteSource } from "@/lib/types";
export type { Quote };

const MIS_BASE = "https://mis.twse.com.tw/stock/api";
const MIS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://mis.twse.com.tw/stock/",
  Accept: "application/json",
};
const FETCH_TIMEOUT_MS = 4000;
const YAHOO_BASE = "https://query1.finance.yahoo.com";
const YAHOO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const YAHOO_MAX_SYMBOLS_PER_BATCH = 20;
const MIS_CIRCUIT_BREAKER_MS = 5 * 60 * 1000;
// MIS 硬規則：5 秒 ≤ 3 次。同一執行個體 5 秒內重複請求一律回快取
const MIN_FETCH_INTERVAL_MS = 5000;

export type Market = "tse" | "otc";

export interface QuoteTarget {
  stockId: string;
  market: Market;
  name?: string;
}

interface MisMsg {
  c?: string;
  n?: string;
  ex?: string;
  z?: string;
  v?: string;
  o?: string;
  h?: string;
  l?: string;
  y?: string;
  b?: string;
  d?: string;
  t?: string;
}

interface MisResponse {
  msgArray?: MisMsg[];
  rtcode?: string;
  rtmessage?: string;
}

interface YahooChart {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    regularMarketTime?: number;
    regularMarketVolume?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

interface YahooSparkResponse {
  spark?: {
    result?: Array<{ symbol?: string; response?: YahooChart[] }>;
  };
}

// ── Session cookie 持久化（v5.1 核心：只在失效時重建，避免撞限流）──────────

let memCookie: string | null = null;

async function loadCookie(): Promise<string | null> {
  if (memCookie) return memCookie;
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("mis_session")
    .select("cookie")
    .eq("id", 1)
    .maybeSingle();
  memCookie = data?.cookie ?? null;
  return memCookie;
}

async function saveCookie(cookie: string): Promise<void> {
  memCookie = cookie;
  const db = getSupabase();
  if (!db) return;
  await db
    .from("mis_session")
    .upsert({ id: 1, cookie, fetched_at: new Date().toISOString() });
}

async function createSession(): Promise<string> {
  const res = await fetch(
    `${MIS_BASE}/getStock.jsp?ch=2330.tw&json=1&_=${Date.now()}`,
    { headers: MIS_HEADERS, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("MIS session: no cookie returned");
  await saveCookie(cookie);
  return cookie;
}

// ── MIS 請求與解析 ──────────────────────────────────────────────────────

function num(s: string | undefined): number | null {
  if (typeof s !== "string" || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s.trim())) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function misAsOf(message: MisMsg): string | undefined {
  if (!message.d || !/^\d{8}$/.test(message.d) || !message.t || !/^\d{2}:\d{2}(:\d{2})?$/.test(message.t)) {
    return undefined;
  }
  const date = `${message.d.slice(0, 4)}-${message.d.slice(4, 6)}-${message.d.slice(6, 8)}`;
  const time = message.t.length === 5 ? `${message.t}:00` : message.t;
  const at = Date.parse(`${date}T${time}+08:00`);
  if (!Number.isFinite(at) || at > Date.now()) return undefined;
  // Date.parse 可能把不存在的月底日期進位，必須再核對台北日期與時間。
  if (new Date(at + 8 * 60 * 60 * 1000).toISOString().slice(0, 19) !== `${date}T${time}`) {
    return undefined;
  }
  return new Date(at).toISOString();
}

function quotesAsOf(quotes: Quote[]): number | null {
  const dates = quotes.map((quote) => quote.asOf ? Date.parse(quote.asOf) : NaN);
  return dates.length > 0 && dates.every(Number.isFinite) ? Math.min(...dates) : null;
}

function isoAsOf(asOf: number | null): string | null {
  return asOf === null ? null : new Date(asOf).toISOString();
}

function toQuote(m: MisMsg): Quote {
  const z = positiveNumber(num(m.z));
  const bestBid = positiveNumber(num((m.b ?? "").split("_")[0]));
  const prevClose = positiveNumber(num(m.y));
  // z 為 '-'（當盤無成交）時依序 fallback：最佳買價 → 昨收
  const price = z ?? bestBid ?? prevClose;
  const change =
    price !== null && prevClose !== null ? finiteOrNull(price - prevClose) : null;
  return {
    stockId: m.c ?? "",
    name: m.n ?? "",
    market: m.ex === "otc" ? "otc" : "tse",
    price,
    prevClose,
    change,
    changePct:
      change !== null && prevClose ? finiteOrNull(change / prevClose) : null,
    open: num(m.o),
    high: num(m.h),
    low: num(m.l),
    volume: num(m.v),
    traded: z !== null,
    time: m.t ?? "",
    asOf: misAsOf(m),
  };
}

async function misGetStockInfo(
  exCh: string,
  cookie: string
): Promise<MisMsg[]> {
  const url = `${MIS_BASE}/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now()}`;
  const res = await fetch(url, {
    headers: { ...MIS_HEADERS, Cookie: cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MIS HTTP ${res.status}`);
  const json = (await res.json()) as MisResponse;
  if (json.rtcode !== "0000" || !Array.isArray(json.msgArray) || json.msgArray.length === 0) {
    throw new Error(`MIS bad response: rtcode=${json.rtcode} size=${json.msgArray?.length ?? 0}`);
  }
  return json.msgArray;
}

// ── 對外介面 ────────────────────────────────────────────────────────────

export const INDEX_TARGETS: QuoteTarget[] = [
  { stockId: "t00", market: "tse" }, // 加權指數
  { stockId: "o00", market: "otc" }, // 櫃買指數
];

interface Snapshot {
  fetchedAt: number;
  asOf: number | null;
  key: string;
  quotes: Quote[];
  source: QuoteSource;
  complete: boolean;
}

let lastSnapshot: Snapshot | null = null;
let misUnavailableUntil = 0;

// 單檔粒度的 stale 快取：批次請求的組合（自選股增減）常變動，若仍以整批 key
// 比對，只要組合跟上次不完全一樣就會找不到快照、直接對外回 502。改成每檔各自
// 記錄最後一次成功的報價，MIS 失敗時逐檔查詢，有查到的先頂著用。
interface StockSnapshot {
  fetchedAt: number;
  quote: Quote;
  source?: "mis" | "yahoo";
}

const perStockCache = new Map<string, StockSnapshot>();

function isUsableSnapshot(entry: StockSnapshot): boolean {
  const fetchedAge = Date.now() - entry.fetchedAt;
  if (fetchedAge < 0 || fetchedAge > YAHOO_MAX_AGE_MS) return false;
  if (!entry.quote.asOf) return true;
  const at = Date.parse(entry.quote.asOf);
  return Number.isFinite(at) && at <= Date.now() && Date.now() - at <= YAHOO_MAX_AGE_MS;
}

function rememberQuote(quote: Quote, fetchedAt: number, source: "mis" | "yahoo"): void {
  const key = stockCacheKey(quote);
  const previous = perStockCache.get(key);
  if (previous && isUsableSnapshot(previous)) {
    const previousAt = previous.quote.asOf ? Date.parse(previous.quote.asOf) : -Infinity;
    const incomingAt = quote.asOf ? Date.parse(quote.asOf) : -Infinity;
    // 沒有成交證據的備援值不能抹掉已有日期及成交證據的 MIS 備份。
    if (previous.source === "mis" && previous.quote.traded && Number.isFinite(previousAt) && !quote.traded) return;
    // 優先保留最新且日期已知的行情；同時刻保留 MIS 的完整欄位。
    if (previousAt > incomingAt || (previousAt === incomingAt && previous.source === "mis" && source === "yahoo")) return;
  }
  perStockCache.set(key, { fetchedAt, quote, source });
}

function stockCacheKey(t: { stockId: string; market: Market }): string {
  return `${t.market}_${t.stockId}`;
}

function yahooSymbol(target: QuoteTarget): string {
  if (target.stockId === "t00") return "^TWII";
  // 櫃買官方指數代碼 IX0043；Yahoo spark 的可用符號為 IX0043.TWO。
  if (target.stockId === "o00") return "IX0043.TWO";
  return `${target.stockId}.${target.market === "otc" ? "TWO" : "TW"}`;
}

function yahooQuoteName(target: QuoteTarget): string {
  if (target.stockId === "t00") return "加權指數";
  if (target.stockId === "o00") return "櫃買指數";
  return target.name ?? target.stockId;
}

function finiteValues(values: Array<number | null> | undefined): number[] {
  return (values ?? []).filter((value): value is number => Number.isFinite(value));
}

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function validYahooTimestamp(epoch: number | undefined): epoch is number {
  return typeof epoch === "number" && Number.isFinite(epoch) && epoch > 0 &&
    epoch * 1000 <= Date.now() && Date.now() - epoch * 1000 <= YAHOO_MAX_AGE_MS;
}

function taipeiTime(epochSeconds: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(epochSeconds * 1000));
}

export async function fetchYahooQuotes(
  targets: QuoteTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ quotes: Quote[]; asOf: string; complete: boolean }> {
  const uniqueTargets = [...new Map(targets.map((target) => [stockCacheKey(target), target])).values()];
  const batches: QuoteTarget[][] = [];
  for (let offset = 0; offset < uniqueTargets.length; offset += YAHOO_MAX_SYMBOLS_PER_BATCH) {
    batches.push(uniqueTargets.slice(offset, offset + YAHOO_MAX_SYMBOLS_PER_BATCH));
  }
  // 單一批次失敗時仍保留其他批可讀行情，並以 complete:false 揭露缺漏。
  const results = await Promise.allSettled(batches.map((batch) => fetchYahooQuoteBatch(batch, fetchImpl)));
  const quotesByKey = new Map<string, Quote>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const quote of result.value.quotes) quotesByKey.set(stockCacheKey(quote), quote);
  }
  const quotes = uniqueTargets
    .map((target) => quotesByKey.get(stockCacheKey(target)))
    .filter((quote): quote is Quote => quote !== undefined);
  const asOf = quotesAsOf(quotes);
  if (quotes.length === 0 || asOf === null) throw new Error("Yahoo response contained no current quotes");
  return { quotes, asOf: new Date(asOf).toISOString(), complete: quotes.length === uniqueTargets.length };
}

async function fetchYahooQuoteBatch(
  targets: QuoteTarget[],
  fetchImpl: typeof fetch,
): Promise<{ quotes: Quote[]; asOf: string; complete: boolean }> {
  const targetBySymbol = new Map(targets.map((target) => [yahooSymbol(target), target]));
  const url = new URL("/v7/finance/spark", YAHOO_BASE);
  url.searchParams.set("symbols", [...targetBySymbol.keys()].join(","));
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");

  const response = await fetchImpl(url, {
    headers: { "User-Agent": MIS_HEADERS["User-Agent"], Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

  const payload = (await response.json()) as YahooSparkResponse;
  const quotes: Quote[] = [];
  const timestamps: number[] = [];
  const returnedSymbols = new Set<string>();
  for (const row of payload.spark?.result ?? []) {
    const target = row.symbol ? targetBySymbol.get(row.symbol) : undefined;
    const chart = row.response?.[0];
    if (!target || !chart || returnedSymbols.has(row.symbol!)) continue;

    const series = chart.indicators?.quote?.[0];
    let price = positiveNumber(chart.meta?.regularMarketPrice);
    let latestEpoch = chart.meta?.regularMarketTime;
    if (price === null || !validYahooTimestamp(latestEpoch)) {
      price = null;
      latestEpoch = undefined;
      // 收盤值與時間使用相同索引，避免尾端 null 造成日期比價格新。
      for (let index = (series?.close?.length ?? 0) - 1; index >= 0; index--) {
        const close = positiveNumber(series?.close?.[index]);
        const epoch = chart.timestamp?.[index];
        if (close !== null && validYahooTimestamp(epoch)) {
          price = close;
          latestEpoch = epoch;
          break;
        }
      }
    }
    const prevClose = positiveNumber(chart.meta?.chartPreviousClose);
    if (price === null || latestEpoch === undefined) continue;
    const highs = finiteValues(series?.high);
    const lows = finiteValues(series?.low);
    const opens = finiteValues(series?.open);
    const change = prevClose === null ? null : price - prevClose;
    timestamps.push(latestEpoch);
    returnedSymbols.add(row.symbol!);
    quotes.push({
      stockId: target.stockId,
      name: yahooQuoteName(target),
      market: target.market,
      price,
      prevClose,
      change,
      changePct: change !== null && prevClose ? finiteOrNull(change / prevClose) : null,
      open: opens[0] ?? null,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      // Yahoo raw volume 的單位未獲官方文件確認，不換算成介面採用的「張」。
      volume: null,
      // Spark 分鐘序列通常只有 close；股票用官方 meta 總量判定是否成交。
      // 指數有已驗證的價格及行情時間即可使用，不要求股票成交量欄位。
      traded: target.stockId === "t00" || target.stockId === "o00" ||
        positiveNumber(chart.meta?.regularMarketVolume) !== null,
      time: taipeiTime(latestEpoch),
      asOf: new Date(latestEpoch * 1000).toISOString(),
    });
  }
  if (quotes.length === 0) throw new Error("Yahoo response contained no current quotes");
  const asOf = Math.min(...timestamps) * 1000;
  return {
    quotes,
    asOf: new Date(asOf).toISOString(),
    complete: quotes.length === targetBySymbol.size,
  };
}

export interface QuoteResult {
  quotes: Quote[];
  source: QuoteSource;
  asOf: string | null;
  complete: boolean;
}

/**
 * 單次合併請求抓全部標的（禁止一檔一請求）。
 * 相同批次的併發要求共用請求，MIS 失敗時依序嘗試 Yahoo 與舊快照。
 */
const pendingBatches = new Map<string, Promise<QuoteResult>>();

export async function fetchQuotes(targets: QuoteTarget[]): Promise<QuoteResult> {
  const uniqueTargets = [...new Map(targets.map((target) => [stockCacheKey(target), target])).values()];
  const key = uniqueTargets.map(stockCacheKey).join("|");
  const pending = pendingBatches.get(key);
  if (pending) return pending;
  const request = fetchQuoteBatch(uniqueTargets);
  pendingBatches.set(key, request);
  try {
    return await request;
  } finally {
    if (pendingBatches.get(key) === request) pendingBatches.delete(key);
  }
}

async function fetchQuoteBatch(targets: QuoteTarget[]): Promise<QuoteResult> {
  if (targets.length === 0) return {
    quotes: [],
    source: "mis",
    asOf: null,
    complete: true,
  };
  const exCh = targets
    .map((t) => `${t.market}_${t.stockId}.tw`)
    .join("|");
  const requiredKeys = targets.map((t) => ({ stockId: t.stockId, market: t.market }));
  const canAttemptMis = Date.now() >= misUnavailableUntil;

  // 同 key 且 5 秒內回快取，降低輪詢對來源的請求次數；恢復期限到期優先重試 MIS。
  if (
    lastSnapshot &&
    lastSnapshot.key === exCh &&
    (lastSnapshot.source === "mis" || !canAttemptMis) &&
    lastSnapshot.quotes.every((quote) => {
      const entry = perStockCache.get(stockCacheKey(quote));
      return entry !== undefined && isUsableSnapshot({ ...entry, quote });
    }) &&
    Date.now() - lastSnapshot.fetchedAt < MIN_FETCH_INTERVAL_MS
  ) {
    return {
      quotes: lastSnapshot.quotes,
      source: lastSnapshot.source,
      asOf: isoAsOf(lastSnapshot.asOf),
      complete: lastSnapshot.complete,
    };
  }

  try {
    if (!canAttemptMis) {
      throw new Error("MIS circuit breaker active");
    }
    let cookie = await loadCookie();
    let msgs: MisMsg[];
    if (!cookie) {
      cookie = await createSession();
      msgs = await misGetStockInfo(exCh, cookie);
    } else {
      try {
        msgs = await misGetStockInfo(exCh, cookie);
      } catch {
        // 舊 cookie 失效才重建 session，重試一次
        cookie = await createSession();
        msgs = await misGetStockInfo(exCh, cookie);
      }
    }
    const requestedKeys = new Set(requiredKeys.map(stockCacheKey));
    const quotesByKey = new Map<string, Quote>();
    for (const message of msgs) {
      if (!message.c || (message.ex !== "tse" && message.ex !== "otc")) continue;
      const key = stockCacheKey({ stockId: message.c, market: message.ex });
      if (!requestedKeys.has(key) || quotesByKey.has(key)) continue;
      const quote = toQuote(message);
      if (quote.price === null || !isUsableSnapshot({ fetchedAt: Date.now(), quote })) continue;
      quotesByKey.set(key, quote);
    }
    const quotes = [...requestedKeys]
      .map((key) => quotesByKey.get(key))
      .filter((quote): quote is Quote => quote !== undefined);
    if (quotes.length === 0) throw new Error("MIS response contained no requested quotes");
    const complete = quotes.length === requestedKeys.size;
    const fetchedAt = Date.now();
    const asOf = quotesAsOf(quotes);
    misUnavailableUntil = 0;
    lastSnapshot = { fetchedAt, asOf, key: exCh, quotes, source: "mis", complete };
    for (const q of quotes) {
      rememberQuote(q, fetchedAt, "mis");
    }
    return { quotes, source: "mis", asOf: isoAsOf(asOf), complete };
  } catch (err) {
    // 熔斷期間的輪詢不延長期限，讓來源能在固定時間後恢復嘗試。
    if (canAttemptMis) misUnavailableUntil = Date.now() + MIS_CIRCUIT_BREAKER_MS;
    try {
      const yahoo = await fetchYahooQuotes(targets);
      const asOf = Date.parse(yahoo.asOf);
      lastSnapshot = {
        fetchedAt: Date.now(),
        asOf,
        key: exCh,
        quotes: yahoo.quotes,
        source: "yahoo",
        complete: yahoo.complete,
      };
      for (const q of yahoo.quotes) {
        rememberQuote(q, Date.now(), "yahoo");
      }
      return { ...yahoo, source: "yahoo" };
    } catch {
      // Yahoo 也不可用時才退回最近一次成功快照。
    }
    // 每檔核對保存期限，組合變動時也能保留可用資料及各自的行情日期。
    const staleEntries = requiredKeys
      .map((t) => perStockCache.get(stockCacheKey(t)))
      .filter((entry): entry is StockSnapshot => entry !== undefined && isUsableSnapshot(entry));
    const complete = staleEntries.length === requiredKeys.length;
    if (staleEntries.length > 0) {
      const staleByKey = new Map<string, StockSnapshot>();
      for (const entry of staleEntries) {
        staleByKey.set(stockCacheKey(entry.quote), entry);
      }
      const oldestAt = quotesAsOf(staleEntries.map((entry) => entry.quote));
      const quotes = requiredKeys
        .map((key) => staleByKey.get(stockCacheKey(key))?.quote)
        .filter((q): q is Quote => q !== undefined);
      lastSnapshot = {
        fetchedAt: Date.now(),
        asOf: oldestAt,
        key: exCh,
        quotes,
        source: "stale",
        complete,
      };
      return {
        quotes,
        source: "stale",
        asOf: isoAsOf(oldestAt),
        complete,
      };
    }
    throw err;
  }
}

/**
 * 新增自選股時解析代號：自動判斷上市/上櫃與名稱（A.4 契約）。
 * 查無此代號回 null。
 */
export async function resolveStock(
  code: string
): Promise<{ stockId: string; market: Market; name: string } | null> {
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return null;
  try {
    const res = await fetch(
      `${MIS_BASE}/getStock.jsp?ch=${code}.tw&json=1&_=${Date.now()}`,
      { headers: MIS_HEADERS, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (res.ok) {
      const json = (await res.json()) as MisResponse;
      const m = json.rtcode === "0000" && Array.isArray(json.msgArray)
        ? json.msgArray.find((item) => item.c === code && item.n && (item.ex === "tse" || item.ex === "otc"))
        : undefined;
      if (m?.c === code && m.n && (m.ex === "tse" || m.ex === "otc")) {
        return { stockId: m.c, market: m.ex, name: m.n };
      }
    }
  } catch {
    // Cloudflare 到 MIS 逾時時改由 Yahoo 搜尋辨識市場。
  }

  try {
    const url = new URL("/v1/finance/search", YAHOO_BASE);
    url.searchParams.set("q", code);
    url.searchParams.set("quotesCount", "10");
    url.searchParams.set("newsCount", "0");
    const res = await fetch(url, {
      headers: { "User-Agent": MIS_HEADERS["User-Agent"], Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
    };
    const match = Array.isArray(json.quotes) ? json.quotes.find((item) =>
      (item.quoteType === "EQUITY" || item.quoteType === "ETF") &&
      (item.symbol === `${code}.TW` || item.symbol === `${code}.TWO`)
    ) : undefined;
    if (!match?.symbol) return null;
    return {
      stockId: code,
      market: match.symbol.endsWith(".TWO") ? "otc" : "tse",
      name: match.shortname ?? match.longname ?? code,
    };
  } catch {
    return null;
  }
}
