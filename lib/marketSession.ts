// 台股平日盤中時段標籤（純時間判斷，不打任何 API，不依賴瀏覽器物件）。
// 規則：
//   週六、週日 → 休市
//   平日 00:00–08:59 → 盤前
//   平日 09:00–13:30 → 盤中
//   平日 13:30 之後 → 已收盤

export type MarketSessionLabel = "盤前" | "盤中" | "已收盤" | "休市";

const OPEN_MIN = 9 * 60; // 09:00
const CLOSE_MIN = 13 * 60 + 30; // 13:30

/**
 * 依台灣時間（Asia/Taipei）與台股平日盤中規則，回傳當下所屬時段標籤。
 * @param date 要判斷的時間點，預設為現在。
 * @returns "盤前" | "盤中" | "已收盤" | "休市"
 */
export function getMarketSessionLabel(date: Date = new Date()): MarketSessionLabel {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dowMap[get("weekday")];

  if (dayOfWeek === 0 || dayOfWeek === 6) return "休市";

  // Intl 的 hour12:false 在午夜可能回 '24'，正規化為 0
  const hour = parseInt(get("hour"), 10) % 24;
  const minutes = hour * 60 + parseInt(get("minute"), 10);

  if (minutes < OPEN_MIN) return "盤前";
  if (minutes <= CLOSE_MIN) return "盤中";
  return "已收盤";
}

/**
 * 與 getMarketSessionLabel 相同的時段判斷，但盤中／盤前會附上「距收盤還有幾分」
 * 「幾點開盤」等細節文字，供 masthead 顯示。已收盤／休市沿用原標籤文字。
 * @param date 要判斷的時間點，預設為現在。
 */
export function getMarketSessionDetail(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dowMap[get("weekday")];

  if (dayOfWeek === 0 || dayOfWeek === 6) return "休市";

  const hour = parseInt(get("hour"), 10) % 24;
  const minutes = hour * 60 + parseInt(get("minute"), 10);

  if (minutes < OPEN_MIN) return "盤前・09:00 開盤";
  if (minutes <= CLOSE_MIN) return `盤中・距收盤 ${CLOSE_MIN - minutes} 分`;
  return "已收盤";
}
