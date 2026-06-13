"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

interface WatchRow {
  stock_id: string;
  alert_high: number | null;
  alert_low: number | null;
  alert_high_hit_at: string | null;
  alert_low_hit_at: string | null;
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function mmdd(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// 到價提醒卡片：僅限自選股；穿越門檻時由後端常駐排程推 LINE（一次性，重設門檻可再武裝）。
export default function PriceAlertCard({
  stockId,
  name,
}: {
  stockId: string;
  name: string;
}) {
  const { data, mutate } = useSWR<{ items: WatchRow[] }>(
    "/api/watchlist",
    fetcher
  );
  const row = data?.items.find((i) => i.stock_id === stockId) ?? null;
  const inWatch = row !== null;

  const [high, setHigh] = useState("");
  const [low, setLow] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 自選股資料載入後，把門檻帶進輸入框（僅在代號／數值變動時同步）
  useEffect(() => {
    setHigh(row?.alert_high != null ? String(row.alert_high) : "");
    setLow(row?.alert_low != null ? String(row.alert_low) : "");
  }, [row?.stock_id, row?.alert_high, row?.alert_low]);

  async function addToWatch() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId }),
      });
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId,
          high: high.trim() || null,
          low: low.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error ?? "儲存失敗");
        return;
      }
      await mutate();
      setMsg("已儲存，盤中穿越門檻會推 LINE 通知");
    } finally {
      setBusy(false);
    }
  }

  // 外框／標題／鈴鐺由個股頁報價列提供，本元件只負責內容與邏輯
  if (!inWatch) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          加入自選股後即可設定到價提醒，{name} 穿越門檻時推 LINE。
        </p>
        <button
          onClick={addToWatch}
          disabled={busy}
          className="shrink-0 rounded-pill bg-primary px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          加入自選股
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {/* 漲到（紅） */}
        <label className="block">
          <span className="text-[11px] font-medium text-up">漲到 ▲</span>
          <input
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            inputMode="decimal"
            placeholder="未設定"
            className="mt-1 w-full rounded-lg border border-line bg-app px-3 py-2 text-sm tabular outline-none transition-colors focus:border-up"
          />
          <span className="mt-1 block text-[10px] text-muted">
            {row?.alert_high == null
              ? "—"
              : row.alert_high_hit_at
                ? `已於 ${mmdd(row.alert_high_hit_at)} 觸發`
                : "監控中"}
          </span>
        </label>
        {/* 跌到（綠） */}
        <label className="block">
          <span className="text-[11px] font-medium text-down">跌到 ▼</span>
          <input
            value={low}
            onChange={(e) => setLow(e.target.value)}
            inputMode="decimal"
            placeholder="未設定"
            className="mt-1 w-full rounded-lg border border-line bg-app px-3 py-2 text-sm tabular outline-none transition-colors focus:border-down"
          />
          <span className="mt-1 block text-[10px] text-muted">
            {row?.alert_low == null
              ? "—"
              : row.alert_low_hit_at
                ? `已於 ${mmdd(row.alert_low_hit_at)} 觸發`
                : "監控中"}
          </span>
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted">
          {msg ?? "留空＝取消該側；重設門檻會重新啟用提醒"}
        </span>
        <button
          onClick={save}
          disabled={busy}
          className="shrink-0 rounded-pill bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </>
  );
}
