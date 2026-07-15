"use client";

import { useEffect, useRef, useState } from "react";

const ID_RE = /^[0-9A-Z]{4,6}$/;

type Preview =
  | { state: "looking" }
  | { state: "found"; name: string; market: "tse" | "otc" }
  | { state: "notfound" };

export default function AddStockForm({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null
  );
  const [preview, setPreview] = useState<Preview | null>(null);

  // 輸入代號後即時查名（防抖 400ms，避免每打一字就打 MIS）
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
        /* 中斷或連線失敗：保持原狀，不擾使用者 */
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ text: json.error ?? "新增失敗", ok: false });
      } else {
        setMessage({ text: `已加入 ${json.item.name}`, ok: true });
        setCode("");
        setPreview(null);
        onAdded();
      }
    } catch {
      setMessage({ text: "連線失敗，請再試一次", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            🔍
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="輸入代號，如 2330"
            inputMode="numeric"
            className="w-44 rounded-pill border border-line bg-surface py-2 pl-9 pr-3 font-mono text-sm shadow-card outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-app"
        >
          {busy ? "查詢中…" : "加入自選"}
        </button>
      </form>
      {/* 即時查名預覽（優先於送出後訊息顯示） */}
      {preview?.state === "found" ? (
        <span className="text-xs text-ink">
          <span className="text-primary">✓</span> {preview.name}
          <span className="ml-1 text-muted">
            {preview.market === "tse" ? "上市" : "上櫃"}
          </span>
        </span>
      ) : preview?.state === "looking" ? (
        <span className="text-xs text-muted">查詢中…</span>
      ) : preview?.state === "notfound" ? (
        <span className="text-xs text-warn">查無此代號</span>
      ) : (
        message && (
          <span className={`text-xs ${message.ok ? "text-primary" : "text-warn"}`}>
            {message.text}
          </span>
        )
      )}
    </div>
  );
}
