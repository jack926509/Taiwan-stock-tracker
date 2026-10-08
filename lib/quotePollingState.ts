import type { QuoteResponse } from "./types.ts";
import { STALE_STOP_THRESHOLD } from "./pollConfig.ts";

export interface QuotePollingState {
  key: string;
  repeats: number;
  autoPaused: boolean;
}

export function nextQuotePollingState(
  previous: QuotePollingState,
  data: QuoteResponse
): QuotePollingState {
  // 備援、缺漏或未知日期代表來源仍待恢復，應持續依原間隔重試。
  if (data.source !== "mis" || data.complete !== true || !data.marketOpen ||
      typeof data.asOf !== "string" || !Number.isFinite(Date.parse(data.asOf))) {
    return { key: "", repeats: 0, autoPaused: false };
  }
  const key = [...data.indices, ...data.quotes].map((q) => q.asOf ?? q.time).join("|");
  const repeats = key && key === previous.key ? previous.repeats + 1 : 0;
  return { key, repeats, autoPaused: repeats >= STALE_STOP_THRESHOLD };
}
