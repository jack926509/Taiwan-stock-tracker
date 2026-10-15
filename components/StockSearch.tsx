"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useStockSuggestions } from "@/hooks/useStockSuggestions";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import type { WatchlistItem } from "@/lib/types";

const ID_RE = /^[0-9A-Z]{4,6}$/;

async function fetchWatchlist(url: string): Promise<{ items: WatchlistItem[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 全市場個股搜尋（也是加入自選的唯一入口）：輸入代號或公司名稱即時列出建議（/api/search，防抖 300ms），
// 點列或以 ↑↓＋Enter 看 K 線/基本面；列右側「＋ 自選」直接加入自選，已在自選的顯示「已在自選」。
export default function StockSearch({ onAdded }: { onAdded?: () => void | Promise<unknown> }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { results, state } = useStockSuggestions(query);
  const rootRef = useRef<HTMLFormElement>(null);
  // 與首頁共用同一個 SWR 快取鍵，不會多打 API
  const watchlist = useSWR("/api/watchlist", fetchWatchlist);
  // 清單讀取中或失敗時不開放加入，避免已在自選的股票被當成未加入
  const watchlistReady = Boolean(watchlist.data) && !watchlist.error;
  const inWatchlist = new Set((watchlist.data?.items ?? []).map((row) => row.stock_id));
  const { add, busyId } = useAddToWatchlist(onAdded);

  // 點擊元件外部關閉建議清單
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  // 結果變動時，把鍵盤游標拉回未選取
  useEffect(() => {
    setActive(-1);
  }, [results]);

  function goTo(stockId: string) {
    window.location.assign(`/stock/${stockId}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const picked =
      active >= 0 && active < results.length ? results[active] : results[0];
    if (picked) {
      goTo(picked.stockId);
      return;
    }
    const trimmed = query.trim().toUpperCase();
    if (ID_RE.test(trimmed)) goTo(trimmed);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  }

  const showList = open && query.trim() !== "";

  return (
    <form ref={rootRef} onSubmit={submit} className="relative">
      <span
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="搜尋代號或名稱，如 2330 或 台積電"
        aria-label="搜尋個股（代號或名稱）"
        role="combobox"
        aria-expanded={showList && results.length > 0}
        aria-controls="stock-search-listbox"
        aria-activedescendant={
          active >= 0 ? `stock-search-option-${active}` : undefined
        }
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-pill border border-line bg-surface py-3 pl-11 pr-24 text-sm shadow-card outline-none transition-colors focus:border-primary"
      />
      {/* 右側即時狀態 */}
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs">
        {state === "loading" ? (
          <span className="text-muted">查詢中…</span>
        ) : state === "done" && results.length === 0 && query.trim() ? (
          <span className="text-warn">查無符合的個股</span>
        ) : state === "error" ? (
          <span className="text-warn">搜尋暫時無法使用</span>
        ) : null}
      </div>

      {/* 建議清單 */}
      {showList && results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-card bg-surface shadow-lift ring-1 ring-line">
          {/* listbox 只放 option；「＋ 自選」按鈕放在右側獨立清單，列高固定 h-11 讓兩邊對齊 */}
          <ul id="stock-search-listbox" role="listbox" aria-label="搜尋建議">
            {results.map((r, i) => (
              <li key={r.stockId} role="presentation">
                <button
                  type="button"
                  id={`stock-search-option-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goTo(r.stockId)}
                  className={`flex h-11 w-full items-center gap-3 py-2 pl-4 pr-28 text-left text-sm transition-colors ${
                    i === active ? "bg-primary-tint" : "hover:bg-primary-tint"
                  }`}
                >
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-primary tabular">
                    {r.stockId}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-serif text-ink">
                    {r.name}
                  </span>
                  <span className="shrink-0 rounded-pill bg-app px-2 py-0.5 text-xs text-muted ring-1 ring-line">
                    {r.market === "tse" ? "上市" : "上櫃"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="加入自選" className="absolute right-3 top-0">
            {results.map((r) => (
              <li key={r.stockId} className="flex h-11 items-center">
                {inWatchlist.has(r.stockId) ? (
                  <button
                    type="button"
                    disabled
                    aria-label={`${r.name} ${r.stockId} 已在自選`}
                    className="h-9 px-2 text-xs text-muted"
                  >
                    已在自選
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null || !watchlistReady}
                    aria-label={`加入 ${r.name} ${r.stockId} 到自選`}
                    onClick={() => void add(r.stockId)}
                    className="h-9 rounded-pill bg-primary px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 dark:text-app"
                  >
                    {busyId === r.stockId ? "加入中…" : "＋ 自選"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
