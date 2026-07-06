// 日 K → 週 K／月 K 聚合（純函式，client 端用 useMemo 呼叫）
// 輸入假設已按日期升冪排序。週以 ISO 週（週一起算，跨年以 ISO 週歸屬年份為準）分組；
// 月以 YYYY-MM 分組。每組：open=首日、close=末日、high/low=組內極值、volume=加總、
// date=組內最後一天（讓聚合後的 K 棒仍以「這根涵蓋到哪天」的日期顯示在圖上）。
import type { Candle } from "@/lib/providers/klineProvider";

export type AggregatePeriod = "week" | "month";

// ISO 8601 週鍵：取該日所屬 ISO 週的週四所在年份 + 週次，跨年不會分裂同一週
function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // 週一=0 ... 週日=6
  d.setUTCDate(d.getUTCDate() - weekday + 3); // 移到本週週四
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayWeekday + 3);
  const weekNum =
    1 +
    Math.round(
      (d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function aggregateCandles(
  candles: Candle[],
  period: AggregatePeriod
): Candle[] {
  if (candles.length === 0) return [];
  const keyFn = period === "week" ? isoWeekKey : monthKey;

  // Map 依插入順序保留鍵——輸入已按日期升冪，故各組內與各組間皆維持時間順序
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const key = keyFn(c.date);
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }

  const out: Candle[] = [];
  for (const arr of groups.values()) {
    const first = arr[0];
    const last = arr[arr.length - 1];
    out.push({
      date: last.date,
      open: first.open,
      close: last.close,
      high: Math.max(...arr.map((c) => c.high)),
      low: Math.min(...arr.map((c) => c.low)),
      volume: arr.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return out;
}
