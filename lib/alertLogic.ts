// 到價／漲跌幅／爆量提醒的純判斷邏輯：抽離出 I/O（Supabase 讀寫、LINE 推播），供測試直接呼叫。
// 只用相對匯入或 type-only 匯入（node --test 用 --experimental-transform-types，無法解析 "@/" 別名；
// type-only 匯入會在轉譯時整段被抹除，不需要在執行期解析，故仍可安全使用別名）。
import { isSameTaipeiDay } from "./market-hours.ts";
import type { WatchItem } from "@/lib/store";
import type { Quote } from "@/lib/providers/quoteProvider";

// 每日一次性提醒（漲跌幅／爆量）：hit_at 的台北日期＝今天才算「今天已觸發」，跨日自動重新武裝
export function hitToday(hitAt: string | null, now: Date): boolean {
  if (!hitAt) return false;
  return isSameTaipeiDay(new Date(hitAt), now);
}

// 判斷某自選股本輪是否「已武裝」（有可能觸發某一種提醒），用來過濾要抓報價的清單
export function isArmed(item: WatchItem, now: Date): boolean {
  return (
    (item.alert_high !== null && item.alert_high_hit_at === null) ||
    (item.alert_low !== null && item.alert_low_hit_at === null) ||
    (item.alert_change_pct !== null && !hitToday(item.alert_change_hit_at, now)) ||
    (item.alert_volume_on && !hitToday(item.alert_volume_hit_at, now))
  );
}

export type AlertKind = "high" | "low" | "change" | "volume";

export interface AlertDecision {
  kind: AlertKind;
  // high/low：門檻價；change：門檻百分比數字；volume：近 5 日均量（張）
  threshold: number;
}

type QuoteLike = Pick<Quote, "price" | "changePct" | "volume">;

// 單一自選股在本輪該觸發哪些提醒（純函式，不含 I/O：不推播、不寫回資料庫、不讀均量快取）。
// avgVolume：近 5 日均量（張），null 表示日 K 快取缺料或不足 5 根，跳過爆量判斷以避免誤報。
export function decideAlerts(
  row: WatchItem,
  quote: QuoteLike | undefined,
  avgVolume: number | null,
  now: Date
): AlertDecision[] {
  const decisions: AlertDecision[] = [];
  const price = quote?.price;
  if (!quote || price === null || price === undefined) return decisions;

  // 漲破（到價，觸發後靜音直到使用者重設門檻）
  if (
    row.alert_high !== null &&
    row.alert_high_hit_at === null &&
    price >= row.alert_high
  ) {
    decisions.push({ kind: "high", threshold: row.alert_high });
  }

  // 跌破（到價，觸發後靜音直到使用者重設門檻）
  if (
    row.alert_low !== null &&
    row.alert_low_hit_at === null &&
    price <= row.alert_low
  ) {
    decisions.push({ kind: "low", threshold: row.alert_low });
  }

  // 漲跌幅（每日一次性，跨日自動重新武裝）
  if (
    row.alert_change_pct !== null &&
    !hitToday(row.alert_change_hit_at, now) &&
    quote.changePct !== null &&
    Math.abs(quote.changePct * 100) >= row.alert_change_pct
  ) {
    decisions.push({ kind: "change", threshold: row.alert_change_pct });
  }

  // 爆量（每日一次性，跨日自動重新武裝）：均量缺料或非正值就跳過，不誤報
  if (
    row.alert_volume_on &&
    !hitToday(row.alert_volume_hit_at, now) &&
    quote.volume !== null &&
    avgVolume !== null &&
    avgVolume > 0 &&
    quote.volume >= 2 * avgVolume
  ) {
    decisions.push({ kind: "volume", threshold: avgVolume });
  }

  return decisions;
}

// 「今日觸發提醒」則數：伺服端記錄的 *_hit_at 落在今天台北日期（到價高／低、漲跌幅、爆量四種）。
// 收盤總覽（lib/daily-summary.ts）與站內畫面共用這一個函式，避免兩份規則日後分歧。
export interface HitStampItem {
  alert_high_hit_at: string | null;
  alert_low_hit_at: string | null;
  alert_change_hit_at: string | null;
  alert_volume_hit_at: string | null;
}

export function countTodayHitStamps(items: readonly HitStampItem[], now: Date): number {
  let n = 0;
  for (const i of items) {
    if (hitToday(i.alert_high_hit_at, now)) n++;
    if (hitToday(i.alert_low_hit_at, now)) n++;
    if (hitToday(i.alert_change_hit_at, now)) n++;
    if (hitToday(i.alert_volume_hit_at, now)) n++;
  }
  return n;
}
