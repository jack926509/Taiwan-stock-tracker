// 取日 K 的共用核心：先讀快取，最新一根還沒到且超過重試間隔才向 FinMind 增量補抓。
// /api/kline（個股頁）與 /api/sparklines（首頁迷你走勢）共用，避免兩處行為分歧。
import { fetchDailyKline, type Candle } from "@/lib/providers/klineProvider";
import { loadKline, saveKline } from "@/lib/klineStore";

const RETRY_MS = 30 * 60 * 1000; // 最新日 K 還沒出來時，最多每 30 分鐘向 FinMind 試一次
const lastAttempt = new Map<string, number>();

function yearAgo(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
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
  let candles = await loadKline(stockId);
  const last = candles[candles.length - 1];
  const attempted = lastAttempt.get(stockId) ?? 0;
  const needFetch =
    candles.length === 0 ||
    (last.date < today && Date.now() - attempted > RETRY_MS);

  if (needFetch) {
    lastAttempt.set(stockId, Date.now());
    try {
      const start = candles.length === 0 ? yearAgo(today) : last.date;
      const incoming = await fetchDailyKline(stockId, start);
      if (incoming.length > 0) {
        candles = await saveKline(stockId, candles, incoming);
      }
    } catch {
      /* 抓不到新資料就用現有快取 */
    }
  }
  return candles;
}
