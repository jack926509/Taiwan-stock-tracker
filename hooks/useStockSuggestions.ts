"use client";

import { useEffect, useState } from "react";

// /api/search 的建議項目（與 lib/providers/stockList.ts 的 StockListEntry 同形）
export interface StockSuggestion {
  stockId: string;
  name: string;
  market: "tse" | "otc";
}

export type SuggestState = "idle" | "loading" | "done" | "error";

// 代號／名稱搜尋建議：防抖 300ms 打 /api/search，輸入變更即中止前一次請求。
// StockSearch 與 AddStockForm 共用，避免各自複製同一段防抖邏輯。
export function useStockSuggestions(query: string): {
  results: StockSuggestion[];
  state: SuggestState;
} {
  const [results, setResults] = useState<StockSuggestion[]>([]);
  const [state, setState] = useState<SuggestState>("idle");

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setState("idle");
      return;
    }
    setState("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { results?: StockSuggestion[] };
        setResults(json.results ?? []);
        setState("done");
      } catch {
        if (ctrl.signal.aborted) return; // 輸入又變了：交給下一輪
        setResults([]);
        setState("error");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  return { results, state };
}
