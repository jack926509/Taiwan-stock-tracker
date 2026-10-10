// 「已觸及」的畫面判斷（只用於畫面顯示，不參與 LINE 通知／排程）。
// 與盤中 LINE 的守門條件對齊：只有「MIS 來源、已成交（traded）、行情台北日期＝今天」的價格，
// 越過提醒價才算「已觸及」；價格雖越過但不是今日成交價（休市、昨收、未成交、Yahoo 備援、
// 舊快照）只標「過去已越過」，畫面用中性灰字，不給紅色「已觸及」，也不算距觸價。
// 只用相對匯入，方便 node --test 直接載入。
import { isSameTaipeiDay } from "./market-hours.ts";

export interface TouchableAlert {
  alert_high: number | null;
  alert_low: number | null;
}

export interface TouchQuote {
  price: number | null | undefined;
  traded?: boolean;
  asOf?: string | null;
}

// "hit"＝今日成交價已越過；"past"＝價格越過但非今日成交價；"none"＝未越過或無價。
export type TouchState = "hit" | "past" | "none";

export function isHighTouched(price: number | null | undefined, high: number | null | undefined): boolean {
  return price != null && Number.isFinite(price) && high != null && price >= high;
}

export function isLowTouched(price: number | null | undefined, low: number | null | undefined): boolean {
  return price != null && Number.isFinite(price) && low != null && price <= low;
}

// 行情是否為「今天的 MIS 成交價」。source 為整批來源（mis／yahoo／stale）。
export function isLiveTodayQuote(
  quote: TouchQuote | null | undefined,
  source: string | null | undefined,
  now: Date
): boolean {
  if (!quote || source !== "mis" || quote.traded !== true) return false;
  const at = typeof quote.asOf === "string" ? Date.parse(quote.asOf) : NaN;
  if (!Number.isFinite(at)) return false;
  return isSameTaipeiDay(new Date(at), now);
}

function stateOf(crossed: boolean, live: boolean): TouchState {
  return !crossed ? "none" : live ? "hit" : "past";
}

export function highTouchState(
  high: number | null | undefined,
  quote: TouchQuote | null | undefined,
  source: string | null | undefined,
  now: Date
): TouchState {
  return stateOf(isHighTouched(quote?.price, high), isLiveTodayQuote(quote, source, now));
}

export function lowTouchState(
  low: number | null | undefined,
  quote: TouchQuote | null | undefined,
  source: string | null | undefined,
  now: Date
): TouchState {
  return stateOf(isLowTouched(quote?.price, low), isLiveTodayQuote(quote, source, now));
}
