// 取日 K 的共用核心：先讀快取，最新一根還沒到且超過重試間隔才向 FinMind 增量補抓。
// /api/kline（個股頁）與 /api/sparklines（首頁迷你走勢）共用，避免兩處行為分歧。
import { fetchDailyKline, type Candle } from "@/lib/providers/klineProvider";
import { loadKline, saveKline } from "@/lib/klineStore";

const RETRY_MS = 30 * 60 * 1000; // 最新日 K 還沒出來時，最多每 30 分鐘向 FinMind 試一次
const HISTORY_YEARS = 3; // 週 K／月 K 需要較長歷史，快取起點抓到 3 年前
const lastAttempt = new Map<string, number>();

export interface KlineResult {
  candles: Candle[];
  latestDate: string | null;
  stale: boolean;
}

function yearsAgo(isoDate: string, years: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 取某檔日 K。快取讀取失敗會拋錯（由呼叫端處理）；
 * FinMind 抓取失敗則靜默退回現有快取（best-effort）。
 */
export async function ensureKline(
  stockId: string,
  today: string
): Promise<Candle[]> {
  return (await ensureKlineWithStatus(stockId, today)).candles;
}

export async function ensureKlineWithStatus(
  stockId: string,
  today: string
): Promise<KlineResult> {
  let candles = await loadKline(stockId);
  const last = candles[candles.length - 1];
  const attempted = lastAttempt.get(stockId) ?? 0;
  const canAttempt = Date.now() - attempted > RETRY_MS;

  // 舊快取（早期只抓 1 年）最舊日期晚於「3 年前 + 30 天」，代表歷史深度不足以支援
  // 週 K／月 K 的長區間顯示，觸發一次全量重抓補齊前面缺的歷史（增量邏輯不受影響）。
  const backfillCutoff = addDays(yearsAgo(today, HISTORY_YEARS), 30);
  const needBackfill = candles.length > 0 && candles[0].date > backfillCutoff;

  const needFetch =
    candles.length === 0 ||
    (needBackfill && canAttempt) ||
    (last.date < today && canAttempt);
  let stale = false;

  if (needFetch) {
    lastAttempt.set(stockId, Date.now());
    try {
      const start =
        candles.length === 0 || needBackfill
          ? yearsAgo(today, HISTORY_YEARS)
          : last.date;
      const incoming = await fetchDailyKline(stockId, start);
      if (incoming.length > 0) {
        candles = await saveKline(stockId, candles, incoming);
      }
    } catch {
      stale = candles.length > 0;
    }
  }
  return {
    candles,
    latestDate: candles.at(-1)?.date ?? null,
    stale,
  };
}
