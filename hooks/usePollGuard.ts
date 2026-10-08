"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuoteResponse } from "@/lib/types";
import { POLL_MS } from "@/lib/pollConfig";
import { nextQuotePollingState, type QuotePollingState } from "@/lib/quotePollingState";

// 颱風／臨時停盤保險（原本複製在首頁、提醒頁、個股頁三處的同一段邏輯）：
// 盤中卻連續抓到相同報價時間 STALE_STOP_THRESHOLD 次，視為異常暫停輪詢；
// 使用者切回分頁時解除暫停、重新輪詢。
export function usePollGuard() {
  const [autoPaused, setAutoPaused] = useState(false);
  const pollingState = useRef<QuotePollingState>({ key: "", repeats: 0, autoPaused: false });

  const resumePolling = useCallback(() => {
    pollingState.current = { key: "", repeats: 0, autoPaused: false };
    setAutoPaused(false);
  }, []);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible") {
        resumePolling();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [resumePolling]);

  const onQuoteSuccess = useCallback((data: QuoteResponse) => {
    pollingState.current = nextQuotePollingState(pollingState.current, data);
    setAutoPaused(pollingState.current.autoPaused);
  }, []);

  const refreshInterval = useCallback(
    (latest?: QuoteResponse) =>
      autoPaused || (latest && !latest.marketOpen) ? 0 : POLL_MS,
    [autoPaused]
  );

  return { autoPaused, onQuoteSuccess, refreshInterval, resumePolling };
}
