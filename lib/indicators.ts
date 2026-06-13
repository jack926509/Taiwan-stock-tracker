// 技術指標：純函式、零相依，依日 K 計算（台股常用參數）。
// 各函式回傳以 date 對齊的點陣列，暖身期不足者略過。
import type { Candle } from "@/lib/providers/klineProvider";

export interface BandPoint {
  date: string;
  upper: number;
  middle: number;
  lower: number;
}

export interface OscPoint {
  date: string;
  value: number;
}

export interface KDPoint {
  date: string;
  k: number;
  d: number;
}

export interface MacdPoint {
  date: string;
  dif: number;
  dea: number;
  hist: number;
}

// 布林通道：中軌=SMA(period)，上/下軌=中軌 ± mult×母體標準差
export function bollinger(candles: Candle[], period = 20, mult = 2): BandPoint[] {
  const out: BandPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let varsum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varsum += (candles[j].close - mean) ** 2;
    }
    const sd = Math.sqrt(varsum / period);
    out.push({
      date: candles[i].date,
      middle: mean,
      upper: mean + mult * sd,
      lower: mean - mult * sd,
    });
  }
  return out;
}

// RSI：Wilder 平滑法
export function rsi(candles: Candle[], period = 14): OscPoint[] {
  const out: OscPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const push = (i: number) => {
    const v = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    out.push({ date: candles[i].date, value: v });
  };
  push(period);
  for (let i = period + 1; i < candles.length; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    avgG = (avgG * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgL = (avgL * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    push(i);
  }
  return out;
}

// KD：9 日隨機指標，K、D 各以 1/3 平滑（初值 50）
export function kd(candles: Candle[], period = 9): KDPoint[] {
  const out: KDPoint[] = [];
  let k = 50;
  let d = 50;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const rsv = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    out.push({ date: candles[i].date, k, d });
  }
  return out;
}

// 指數移動平均（種子取首值）
function ema(values: number[], period: number): number[] {
  const a = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * a + prev * (1 - a);
    out.push(prev);
  }
  return out;
}

// MACD：DIF=EMA(fast)-EMA(slow)，DEA=EMA(DIF,signal)，柱=DIF-DEA
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9
): MacdPoint[] {
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const dea = ema(dif, signal);
  const out: MacdPoint[] = [];
  for (let i = slow - 1; i < candles.length; i++) {
    out.push({ date: candles[i].date, dif: dif[i], dea: dea[i], hist: dif[i] - dea[i] });
  }
  return out;
}
