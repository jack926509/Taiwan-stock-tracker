import type { Candle } from "@/lib/providers/klineProvider";

export const KLINE_RANGES = [
  { key: "5d", label: "5日", tradingDays: 5 },
  { key: "20d", label: "20日", tradingDays: 20 },
  { key: "3m", label: "3月", months: 3 },
  { key: "6m", label: "6月", months: 6 },
  { key: "1y", label: "1年", months: 12 },
  { key: "3y", label: "3年", months: 36 },
] as const;

// 週 K 模式下區間鈕只顯示這幾個（歷史夠長才有聚合意義）
export const WEEK_RANGE_KEYS: KlineRangeKey[] = ["6m", "1y", "3y"];

export type KlineRangeKey = (typeof KLINE_RANGES)[number]["key"];

export interface KlineRangeStats {
  change: number | null;
  changePct: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

function cutoffDate(last: string, months: number): string {
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function filterCandlesByRange(
  candles: Candle[],
  key: KlineRangeKey
): Candle[] {
  if (candles.length === 0) return candles;
  const range = KLINE_RANGES.find((r) => r.key === key) ?? KLINE_RANGES[3];
  if ("tradingDays" in range) {
    return candles.slice(-range.tradingDays);
  }
  const cutoff = cutoffDate(candles[candles.length - 1].date, range.months);
  return candles.filter((c) => c.date >= cutoff);
}

export function klineRangeStats(candles: Candle[]): KlineRangeStats {
  if (candles.length === 0) {
    return { change: null, changePct: null, firstDate: null, lastDate: null };
  }
  const first = candles[0];
  const last = candles[candles.length - 1];
  const change = last.close - first.close;
  return {
    change,
    changePct: first.close > 0 ? change / first.close : null,
    firstDate: first.date,
    lastDate: last.date,
  };
}
