// 台股平日盤中時段標籤（純時間判斷，不打任何 API，不依賴瀏覽器物件）。
// 規則：
//   週六、週日 → 休市
//   平日 00:00–08:59 → 盤前
//   平日 09:00–13:30 → 盤中
//   平日 13:30 之後 → 已收盤
import { taipeiNow } from "./market-hours.ts";

export type MarketSessionLabel = "盤前" | "盤中" | "已收盤" | "休市";

// 注意：與 market-hours.ts 的 OPEN_MIN/CLOSE_MIN（08:45/13:35，MIS 可打窗）語意不同，勿合併
const OPEN_MIN = 9 * 60; // 09:00
const CLOSE_MIN = 13 * 60 + 30; // 13:30

/**
 * 依台灣時間（Asia/Taipei）與台股平日盤中規則，回傳當下所屬時段標籤。
 */
export function getMarketSessionLabel(date: Date = new Date()): MarketSessionLabel {
  const t = taipeiNow(date);
  if (t.dayOfWeek === 0 || t.dayOfWeek === 6) return "休市";
  if (t.minutes < OPEN_MIN) return "盤前";
  if (t.minutes <= CLOSE_MIN) return "盤中";
  return "已收盤";
}

/**
 * 同上，但盤前／盤中附細節文字（「09:00 開盤」「距收盤 N 分」），供 masthead 顯示。
 */
export function getMarketSessionDetail(date: Date = new Date()): string {
  const label = getMarketSessionLabel(date);
  if (label === "盤前") return "盤前・09:00 開盤";
  if (label === "盤中") return `盤中・距收盤 ${CLOSE_MIN - taipeiNow(date).minutes} 分`;
  return label;
}
