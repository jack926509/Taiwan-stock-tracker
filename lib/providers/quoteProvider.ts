// 報價來源抽象（計劃書 §2.3 對策一、A.4 契約）
// 亦為 §2.4 部署位置抽換點：Vercel 無狀態（cookie 快取進 Supabase）↔ Zeabur 常駐（cookie 常駐記憶體）
// 換報價來源或部署形態，只改這支檔案。

import { getSupabase } from "@/lib/supabase";

const MIS_BASE = "https://mis.twse.com.tw/stock/api";
const MIS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://mis.twse.com.tw/stock/",
  Accept: "application/json",
};
const FETCH_TIMEOUT_MS = 8000;
// MIS 硬規則：5 秒 ≤ 3 次。同一執行個體 5 秒內重複請求一律回快取
const MIN_FETCH_INTERVAL_MS = 5000;

export type Market = "tse" | "otc";

export interface QuoteTarget {
  stockId: string;
  market: Market;
}

export interface Quote {
  stockId: string;
  name: string;
  market: Market;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null; // 累積成交量（張）；指數無此值
  traded: boolean; // false = 當盤無成交，price 為最佳買價或昨收
  time: string; // MIS 資料時間 HH:mm:ss
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
  t?: string;
}

interface MisResponse {
  msgArray?: MisMsg[];
  rtcode?: string;
  rtmessage?: string;
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
  if (s === undefined || s === "" || s === "-") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toQuote(m: MisMsg): Quote {
  const z = num(m.z);
  const bestBid = num((m.b ?? "").split("_")[0]);
  const prevClose = num(m.y);
  // z 為 '-'（當盤無成交）時依序 fallback：最佳買價 → 昨收
  const price = z ?? bestBid ?? prevClose;
  const change =
    price !== null && prevClose !== null ? price - prevClose : null;
  return {
    stockId: m.c ?? "",
    name: m.n ?? "",
    market: m.ex === "otc" ? "otc" : "tse",
    price,
    prevClose,
    change,
    changePct:
      change !== null && prevClose ? change / prevClose : null,
    open: num(m.o),
    high: num(m.h),
    low: num(m.l),
    volume: num(m.v),
    traded: z !== null,
    time: m.t ?? "",
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
  at: number;
  key: string;
  quotes: Quote[];
}

let lastSnapshot: Snapshot | null = null;

export interface QuoteResult {
  quotes: Quote[];
  source: "mis" | "stale";
  asOf: string;
}

/**
 * 單次合併請求抓全部標的（禁止一檔一請求）。
 * MIS 失敗時自動回上次成功快照（source: 'stale'），快照也沒有才拋錯。
 */
export async function fetchQuotes(targets: QuoteTarget[]): Promise<QuoteResult> {
  if (targets.length === 0) return { quotes: [], source: "mis", asOf: new Date().toISOString() };
  const exCh = targets
    .map((t) => `${t.market}_${t.stockId}.tw`)
    .join("|");

  // 同 key 且 5 秒內 → 直接回快取，守住「5 秒 ≤ 3 次」
  if (
    lastSnapshot &&
    lastSnapshot.key === exCh &&
    Date.now() - lastSnapshot.at < MIN_FETCH_INTERVAL_MS
  ) {
    return {
      quotes: lastSnapshot.quotes,
      source: "mis",
      asOf: new Date(lastSnapshot.at).toISOString(),
    };
  }

  try {
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
    const quotes = msgs.map(toQuote);
    lastSnapshot = { at: Date.now(), key: exCh, quotes };
    return { quotes, source: "mis", asOf: new Date().toISOString() };
  } catch (err) {
    if (lastSnapshot && lastSnapshot.key === exCh) {
      return {
        quotes: lastSnapshot.quotes,
        source: "stale",
        asOf: new Date(lastSnapshot.at).toISOString(),
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
  const res = await fetch(
    `${MIS_BASE}/getStock.jsp?ch=${code}.tw&json=1&_=${Date.now()}`,
    { headers: MIS_HEADERS, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as MisResponse;
  const m = json.msgArray?.[0];
  if (!m?.c || !m.n || (m.ex !== "tse" && m.ex !== "otc")) return null;
  return { stockId: m.c, market: m.ex, name: m.n };
}
