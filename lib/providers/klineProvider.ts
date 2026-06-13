// 歷史日 K 來源：FinMind TaiwanStockPrice（免費、上市上櫃皆有）
// 計劃書附錄 A.6/A.7：取「未還原」價格，與 MIS 盤中一致
import { finmindRows } from "@/lib/providers/finmind";

export interface Candle {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 張（FinMind 回傳為股數，這裡已 /1000，與 MIS 的「量」同單位）
}

interface FinMindRow {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  open: number;
  max: number;
  min: number;
  close: number;
}

export async function fetchDailyKline(
  stockId: string,
  startDate: string
): Promise<Candle[]> {
  const rows = await finmindRows<FinMindRow>(
    "TaiwanStockPrice",
    stockId,
    startDate
  );
  return rows
    .filter((r) => r.open > 0 && r.close > 0) // 偶有全 0 的無效列（停牌）
    .map((r) => ({
      date: r.date,
      open: r.open,
      high: r.max,
      low: r.min,
      close: r.close,
      volume: Math.round(r.Trading_Volume / 1000),
    }));
}
