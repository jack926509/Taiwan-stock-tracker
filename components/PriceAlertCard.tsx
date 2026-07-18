"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Trend } from "@/lib/format";

interface WatchRow {
  stock_id: string;
  alert_high: number | null;
  alert_low: number | null;
  alert_high_hit_at: string | null;
  alert_low_hit_at: string | null;
  alert_change_pct: number | null;
  alert_change_hit_at: string | null;
  alert_volume_on: boolean;
  alert_volume_hit_at: string | null;
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
  currentPrice = null,
  trend = "flat",
}: {
  stockId: string;
  name: string;
  /** 現價，供「現價 ±5%」快速填價按鈕使用；未提供時按鈕停用 */
  currentPrice?: number | null;
  /** 個股當下漲跌方向，僅供左緣色條使用（視覺沿用首頁 QuoteBoard 語彙），未提供時不上色 */
  trend?: Trend;
}) {
  const { data, mutate } = useSWR<{ items: WatchRow[] }>(
    "/api/watchlist",
    fetcher
  );
  const row = data?.items.find((i) => i.stock_id === stockId) ?? null;
  const inWatch = row !== null;

  const [high, setHigh] = useState("");
  const [low, setLow] = useState("");
  const [changePct, setChangePct] = useState("");
  const [volumeOn, setVolumeOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 自選股資料載入後，把門檻帶進輸入框（僅在代號／數值變動時同步）
  useEffect(() => {
    setHigh(row?.alert_high != null ? String(row.alert_high) : "");
    setLow(row?.alert_low != null ? String(row.alert_low) : "");
    setChangePct(row?.alert_change_pct != null ? String(row.alert_change_pct) : "");
    setVolumeOn(row?.alert_volume_on ?? false);
  }, [row?.stock_id, row?.alert_high, row?.alert_low, row?.alert_change_pct, row?.alert_volume_on]);

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

  // 現價 ±5% 快速填價：四捨五入到小數 2 位，填入後使用者仍可手動修改
  function quickFill(target: "high" | "low", pct: number) {
    if (currentPrice == null) return;
    const value = Math.round(currentPrice * (1 + pct) * 100) / 100;
    if (target === "high") setHigh(String(value));
    else setLow(String(value));
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
          changePct: changePct.trim() || null,
          volumeOn,
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

  // 外框由個股頁的常駐細列提供；本元件 = 鈴鐺標題＋門檻設定（單列）
  const bellIcon = (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );

  const title = (
    <span className="flex items-center gap-1.5 font-serif text-sm font-semibold">
      {bellIcon}
      到價提醒
    </span>
  );

  // 左緣漲跌色條：視覺沿用首頁 QuoteBoard 語彙，僅裝飾用途，不影響任何邏輯
  const barColor =
    trend === "up" ? "bg-up" : trend === "down" ? "bg-down" : "bg-line";

  if (!inWatch) {
    return (
      <div className="relative pl-3">
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[3px] rounded-full ${barColor}`}
        />
        <div className="flex flex-col gap-3">
          {title}
          <p className="text-xs leading-relaxed text-muted">
            加入自選股後即可設定到價提醒，{name} 穿越門檻時推 LINE。
          </p>
          <button
            onClick={addToWatch}
            disabled={busy}
            className="w-full rounded-pill bg-primary px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "處理中…" : "加入自選股"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pl-3">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] rounded-full ${barColor}`}
      />
      <div className="flex flex-col gap-3">
        {title}
        {/* 漲到（紅） */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] font-medium text-up">漲到 ▲</span>
            <input
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              inputMode="decimal"
              placeholder="未設定"
              className="min-w-0 flex-1 rounded-card border border-line bg-app px-2.5 py-1.5 font-mono text-sm tabular outline-none transition-colors focus:border-up"
            />
            <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular text-muted">
              {row?.alert_high == null
                ? "—"
                : row.alert_high_hit_at
                  ? `已於 ${mmdd(row.alert_high_hit_at)} 觸發`
                  : "監控中"}
            </span>
          </label>
          <button
            type="button"
            onClick={() => quickFill("high", 0.05)}
            disabled={currentPrice == null}
            className="ml-14 w-fit rounded-pill bg-up-tint px-2.5 py-1 text-[11px] font-medium text-up transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            現價 +5%
          </button>
        </div>
        {/* 跌到（綠） */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] font-medium text-down">跌到 ▼</span>
            <input
              value={low}
              onChange={(e) => setLow(e.target.value)}
              inputMode="decimal"
              placeholder="未設定"
              className="min-w-0 flex-1 rounded-card border border-line bg-app px-2.5 py-1.5 font-mono text-sm tabular outline-none transition-colors focus:border-down"
            />
            <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular text-muted">
              {row?.alert_low == null
                ? "—"
                : row.alert_low_hit_at
                  ? `已於 ${mmdd(row.alert_low_hit_at)} 觸發`
                  : "監控中"}
            </span>
          </label>
          <button
            type="button"
            onClick={() => quickFill("low", -0.05)}
            disabled={currentPrice == null}
            className="ml-14 w-fit rounded-pill bg-down-tint px-2.5 py-1 text-[11px] font-medium text-down transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            現價 −5%
          </button>
        </div>
        <div className="border-t border-dotted border-line pt-3" />
        {/* 漲跌幅提醒（每日一次性，隔日自動重新啟用，不需手動重設） */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] font-medium text-ink">漲跌幅</span>
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-card border border-line bg-app px-2.5 py-1.5 focus-within:border-primary">
              <span className="shrink-0 font-mono text-sm text-muted">±</span>
              <input
                value={changePct}
                onChange={(e) => setChangePct(e.target.value)}
                inputMode="decimal"
                placeholder="未設定"
                className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular outline-none"
              />
              <span className="shrink-0 font-mono text-sm text-muted">%</span>
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular text-muted">
              {row?.alert_change_pct == null
                ? "—"
                : row.alert_change_hit_at
                  ? `${mmdd(row.alert_change_hit_at)} 已觸發`
                  : "監控中"}
            </span>
          </label>
        </div>
        {/* 爆量提醒：現量達近 5 日均量 2 倍即推播；同樣每日一次性 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] leading-relaxed text-ink">
            爆量提醒
            <span className="ml-1 text-muted">（現量達近 5 日均量 2 倍）</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={volumeOn}
            onClick={() => setVolumeOn((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-pill transition-colors ${
              volumeOn ? "bg-primary" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                volumeOn ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-pill bg-primary px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        <p className="text-[10px] leading-relaxed text-muted">
          {msg ??
            "到價／漲跌幅：留空＝取消；漲跌幅與爆量觸發後隔日自動重新啟用，到價需重設門檻"}
        </p>
      </div>
    </div>
  );
}
