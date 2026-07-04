// 報價牆技術狀態徽章：薄封裝 lib/indicators.ts，只標「目前技術面事實」，不含買賣建議字眼。
// 供 QuoteCard 顯示小 pill；tone 對應既有紅漲綠跌色系（neutral 用灰）。
import type { Candle } from "@/lib/providers/klineProvider";
import { kd, rsi } from "./indicators.ts";

export type SignalKind =
  | "ma20-above"
  | "ma20-below"
  | "kd-golden-cross"
  | "kd-death-cross"
  | "rsi-overbought"
  | "rsi-oversold";

export interface Signal {
  kind: SignalKind;
  label: string;
  tone: "neutral" | "up" | "down";
}

const MA_PERIOD = 20;
const RSI_OVERBOUGHT = 80;
const RSI_OVERSOLD = 20;

function sma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) sum += candles[i].close;
  return sum / period;
}

/**
 * 依日 K 序列計算目前技術狀態（僅標事實，不含買賣建議）。
 * 需要至少 ~35 根日 K 才能算出 KD/RSI/MA20（暖身期不足者該項目略過，不報錯）。
 */
export function computeSignals(candles: Candle[]): Signal[] {
  const signals: Signal[] = [];
  if (candles.length === 0) return signals;
  const last = candles[candles.length - 1];

  // 站上／跌破 MA20：僅比對最新一根收盤價
  const ma20 = sma(candles, MA_PERIOD);
  if (ma20 !== null) {
    if (last.close > ma20) {
      signals.push({ kind: "ma20-above", label: "站上 MA20", tone: "neutral" });
    } else if (last.close < ma20) {
      signals.push({ kind: "ma20-below", label: "跌破 MA20", tone: "neutral" });
    }
  }

  // KD 黃金／死亡交叉：僅「最近一根」發生才算（上一根與最新一根比較 K、D 相對位置）
  const kdPoints = kd(candles);
  if (kdPoints.length >= 2) {
    const prev = kdPoints[kdPoints.length - 2];
    const curr = kdPoints[kdPoints.length - 1];
    if (prev.k <= prev.d && curr.k > curr.d) {
      signals.push({ kind: "kd-golden-cross", label: "KD 黃金交叉", tone: "up" });
    } else if (prev.k >= prev.d && curr.k < curr.d) {
      signals.push({ kind: "kd-death-cross", label: "KD 死亡交叉", tone: "down" });
    }
  }

  // RSI 超買／超賣：>80 超買、<20 超賣
  const rsiPoints = rsi(candles);
  if (rsiPoints.length > 0) {
    const currRsi = rsiPoints[rsiPoints.length - 1].value;
    if (currRsi > RSI_OVERBOUGHT) {
      signals.push({ kind: "rsi-overbought", label: "RSI 超買", tone: "down" });
    } else if (currRsi < RSI_OVERSOLD) {
      signals.push({ kind: "rsi-oversold", label: "RSI 超賣", tone: "up" });
    }
  }

  return signals;
}
