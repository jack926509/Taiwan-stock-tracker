"use client";

import { useEffect, useRef, useState } from "react";
import { useStockSuggestions } from "@/hooks/useStockSuggestions";

const ID_RE = /^[0-9A-Z]{4,6}$/;

// 全市場個股搜尋：輸入代號或公司名稱即時列出建議（/api/search，防抖 300ms），
// 點選或以 ↑↓＋Enter 直接看 K 線/基本面，不必先加入自選股。
export default function StockSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { results, state } = useStockSuggestions(query);
  const rootRef = useRef<HTMLFormElement>(null);

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
        placeholder="輸入代號或名稱，如 2330 或 台積電"
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
        <ul
          id="stock-search-listbox"
          role="listbox"
          aria-label="搜尋建議"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-card bg-surface shadow-lift ring-1 ring-line"
        >
          {results.map((r, i) => (
            <li key={r.stockId} role="presentation">
              <button
                type="button"
                id={`stock-search-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => goTo(r.stockId)}
                className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
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
      )}
    </form>
  );
}
