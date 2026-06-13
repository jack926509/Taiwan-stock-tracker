// 交易時段／交易日判斷（計劃書附錄 A.4 v5.1 契約）
// 主判：TWSE OpenAPI 休市行事曆（每日快取一次，抓不到則退回「週一～五」判斷）
// 保險：前端另有「連續抓不到新報價自動停輪詢」機制，涵蓋颱風臨時停盤

const HOLIDAY_URL =
  "https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule";

interface HolidayRow {
  Name: string;
  Date: string; // 民國年 YYYMMDD，如 '1150101'
  Weekday: string;
  Description: string;
}

interface HolidayCache {
  fetchedAt: number;
  holidays: Set<string>; // 'YYYY-MM-DD'
  makeupTradingDays: Set<string>; // 補行交易日（週六開盤）
}

let cache: HolidayCache | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function rocToIso(roc: string): string | null {
  if (!/^\d{7}$/.test(roc)) return null;
  const year = parseInt(roc.slice(0, 3), 10) + 1911;
  return `${year}-${roc.slice(3, 5)}-${roc.slice(5, 7)}`;
}

async function getHolidayCalendar(): Promise<HolidayCache | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  try {
    const res = await fetch(HOLIDAY_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cache;
    const rows = (await res.json()) as HolidayRow[];
    const holidays = new Set<string>();
    const makeupTradingDays = new Set<string>();
    for (const row of rows) {
      const iso = rocToIso(row.Date);
      if (!iso) continue;
      const text = `${row.Name}${row.Description}`;
      // 行事曆混有「開始交易日」「最後交易日」等非休市項目，僅下列字樣視為休市
      if (text.includes("補行交易")) {
        makeupTradingDays.add(iso);
      } else if (
        text.includes("放假") ||
        text.includes("休市") ||
        text.includes("無交易")
      ) {
        holidays.add(iso);
      }
    }
    cache = { fetchedAt: Date.now(), holidays, makeupTradingDays };
    return cache;
  } catch {
    return cache; // 行事曆抓不到時沿用舊快取或 null（退回週間判斷）
  }
}

export interface TaipeiTime {
  isoDate: string; // 'YYYY-MM-DD'
  minutes: number; // 當日經過分鐘數
  dayOfWeek: number; // 0=日 … 6=六
}

export function taipeiNow(now: Date = new Date()): TaipeiTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  // Intl 的 hour12:false 在午夜可能回 '24'，正規化為 0
  const hour = parseInt(get("hour"), 10) % 24;
  return {
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + parseInt(get("minute"), 10),
    dayOfWeek: dowMap[get("weekday")] ?? new Date().getDay(),
  };
}

export async function isTradingDay(t: TaipeiTime): Promise<boolean> {
  const cal = await getHolidayCalendar();
  if (cal) {
    if (cal.makeupTradingDays.has(t.isoDate)) return true;
    if (cal.holidays.has(t.isoDate)) return false;
  }
  return t.dayOfWeek >= 1 && t.dayOfWeek <= 5;
}

// 盤中視窗 08:45–13:35（含開盤試撮與收盤後資料落定的緩衝）
const OPEN_MIN = 8 * 60 + 45;
const CLOSE_MIN = 13 * 60 + 35;

export async function isMarketOpenNow(now: Date = new Date()): Promise<boolean> {
  const t = taipeiNow(now);
  if (t.minutes < OPEN_MIN || t.minutes > CLOSE_MIN) return false;
  return isTradingDay(t);
}
