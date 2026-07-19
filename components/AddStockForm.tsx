"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { IconCheck } from "@/components/icons";
import {
  useStockSuggestions,
  type StockSuggestion,
} from "@/hooks/useStockSuggestions";

const ID_RE = /^[0-9A-Z]{4,6}$/;

// 加入自選：輸入代號或公司名稱，從建議清單點選（或直接送出第一筆建議）。
// 建議清單與 StockSearch 共用 useStockSuggestions（/api/search，防抖 300ms）。
export default function AddStockForm({ onAdded }: { onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StockSuggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { results, state } = useStockSuggestions(picked ? "" : query);
  const rootRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

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

  function choose(s: StockSuggestion) {
    setPicked(s);
    setQuery(`${s.stockId} ${s.name}`);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = query.trim().toUpperCase();
    // 送出目標：已點選的建議 > 輸入本身就是代號 > 第一筆建議
    const stockId =
      picked?.stockId ??
      (ID_RE.test(trimmed) ? trimmed : results[0]?.stockId ?? null);
    if (!stockId) {
      setError("請輸入代號，或從建議清單點選一檔個股");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "新增失敗");
      } else {
        toast.show(`已加入 ${json.item.name}`, { tone: "success" });
        setQuery("");
        setPicked(null);
        setOpen(false);
        onAdded();
      }
    } catch {
      setError("連線失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  const showList = open && !picked && query.trim() !== "" && results.length > 0;

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-2">
      <form onSubmit={submit} className="flex flex-1 items-center gap-2 sm:flex-none">
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
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
              setPicked(null);
              setError(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="代號或名稱，如 2330"
            aria-label="加入自選：輸入代號或名稱"
            autoComplete="off"
            className="w-full rounded-pill border border-line bg-surface py-2 pl-9 pr-3 text-sm shadow-card outline-none transition-colors focus:border-primary sm:w-48"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-app"
        >
          {busy ? "加入中…" : "加入自選"}
        </button>
      </form>

      {/* 建議清單 */}
      {showList && (
        <ul
          role="listbox"
          aria-label="加入自選建議"
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-card bg-surface shadow-lift ring-1 ring-line sm:right-auto sm:w-72"
        >
          {results.map((r) => (
            <li key={r.stockId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(r)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-primary-tint"
              >
                <span className="w-14 shrink-0 font-mono text-xs font-semibold text-primary tabular">
                  {r.stockId}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-ink">
                  {r.name}
                </span>
                <span className="shrink-0 rounded-pill bg-app px-2 py-0.5 text-[10px] text-muted ring-1 ring-line">
                  {r.market === "tse" ? "上市" : "上櫃"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 狀態列：已選建議 / 查詢中 / 查無 / 錯誤 */}
      {picked ? (
        <span className="flex items-center gap-1 text-xs text-ink">
          <IconCheck className="h-3 w-3 text-primary" /> {picked.name}
          <span className="ml-1 text-muted">
            {picked.market === "tse" ? "上市" : "上櫃"}
          </span>
        </span>
      ) : error ? (
        <span className="text-xs text-warn">{error}</span>
      ) : state === "loading" ? (
        <span className="text-xs text-muted">查詢中…</span>
      ) : state === "done" && results.length === 0 && query.trim() ? (
        <span className="text-xs text-warn">查無符合的個股</span>
      ) : null}
    </div>
  );
}
