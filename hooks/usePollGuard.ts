"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuoteResponse } from "@/lib/types";
import { POLL_MS, STALE_STOP_THRESHOLD } from "@/lib/pollConfig";

// 颱風／臨時停盤保險（原本複製在首頁、提醒頁、個股頁三處的同一段邏輯）：
// 盤中卻連續抓到相同報價時間 STALE_STOP_THRESHOLD 次，視為異常暫停輪詢；
// 使用者切回分頁時解除暫停、重新輪詢。
export function usePollGuard() {
  const [autoPaused, setAutoPaused] = useState(false);
  const staleCount = useRef(0);
  const lastTimeKey = useRef("");

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible") {
        staleCount.current = 0;
        setAutoPaused(false);
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, []);

  const onQuoteSuccess = useCallback((data: QuoteResponse) => {
    const key = [...(data.indices ?? []), ...data.quotes]
      .map((q) => q.time)
      .join("|");
    if (data.marketOpen && key && key === lastTimeKey.current) {
      staleCount.current += 1;
      if (staleCount.current >= STALE_STOP_THRESHOLD) setAutoPaused(true);
    } else {
      staleCount.current = 0;
    }
    lastTimeKey.current = key;
  }, []);

  const refreshInterval = useCallback(
    (latest?: QuoteResponse) =>
      autoPaused || (latest && !latest.marketOpen) ? 0 : POLL_MS,
    [autoPaused]
  );

  return { autoPaused, onQuoteSuccess, refreshInterval };
}
