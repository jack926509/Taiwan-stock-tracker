// 收盤總覽「今日新訊號」差集邏輯：獨立小模組（只用相對匯入），
// 讓 node --test 可直接載入測試（@/ 別名 node 測試環境解析不了）。
import type { Candle } from "@/lib/providers/klineProvider";
import { computeSignals, type Signal } from "./signals.ts";

// 比對「不含今日 candle」與「含今日 candle」兩次 computeSignals 結果，
// 只回傳今天新出現的訊號（依 kind 判斷是否為新，避免同一訊號連續多天重複播報）
export function newSignalsToday(existing: Candle[], todayCandle: Candle): Signal[] {
  const before = new Set(computeSignals(existing).map((s) => s.kind));
  return computeSignals([...existing, todayCandle]).filter((s) => !before.has(s.kind));
}
