"use client";

import { useEffect, useState } from "react";

const ID_RE = /^[0-9A-Z]{4,6}$/;

type Preview =
  | { state: "looking" }
  | { state: "found"; name: string; market: "tse" | "otc" }
  | { state: "notfound" };

// 全市場個股搜尋：輸入代號即時查名，按 Enter 或點結果直接看 K 線/基本面，
// 不必先加入自選股。複用 /api/resolve（防抖 400ms）。
export default function StockSearch() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const trimmed = code.trim().toUpperCase();
    if (!ID_RE.test(trimmed)) {
      setPreview(null);
      return;
    }
    setPreview({ state: "looking" });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/resolve?id=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          const info = await res.json();
          setPreview({ state: "found", name: info.name, market: info.market });
        } else {
          setPreview({ state: "notfound" });
        }
      } catch {
        /* 中斷或連線失敗：保持原狀 */
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [code]);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (ID_RE.test(trimmed)) window.location.assign(`/stock/${trimmed}`);
  }

  return (
    <form onSubmit={go} className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        🔍
      </span>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="搜尋任意個股看 K 線與基本面，輸入代號如 2330"
        inputMode="numeric"
        aria-label="搜尋個股"
        className="w-full rounded-pill border border-line bg-surface py-3 pl-11 pr-28 font-mono text-sm shadow-card outline-none transition-colors focus:border-primary"
      />
      {/* 右側即時狀態／前往按鈕 */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        {preview?.state === "found" ? (
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-pill bg-primary px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:text-app"
          >
            <span className="max-w-[7rem] truncate">{preview.name}</span>
            <span aria-hidden>→</span>
          </button>
        ) : preview?.state === "looking" ? (
          <span className="px-3 text-xs text-muted">查詢中…</span>
        ) : preview?.state === "notfound" ? (
          <span className="px-3 text-xs text-warn">查無此代號</span>
        ) : null}
      </div>
    </form>
  );
}
