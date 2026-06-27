"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import type { QuoteResponse } from "@/lib/types";
import type { Candle } from "@/lib/providers/klineProvider";
import type { Fundamental } from "@/lib/providers/fundamentalProvider";
import KlineChart, { MA_COLORS } from "@/components/KlineChart";
import FundamentalSection from "@/components/FundamentalSection";
import PriceAlertCard from "@/components/PriceAlertCard";
import {
  fmt,
  fmtVol,
  fmtPct,
  trendOf,
  arrowOf,
  textColor,
  chipColor,
} from "@/lib/format";
import {
  filterCandlesByRange,
  KLINE_RANGES,
  klineRangeStats,
  type KlineRangeKey,
} from "@/lib/klineRange";

interface KlineResponse {
  stockId: string;
  candles: Candle[];
  latestDate: string | null;
  stale: boolean;
}

interface StockWatchRow {
  stock_id: string;
  name: string;
  alert_high: number | null;
  alert_low: number | null;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const id = (params.id ?? "").toUpperCase();
  const [range, setRange] = useState<KlineRangeKey>("6m");
  const [alertOpen, setAlertOpen] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  // 點擊浮層外（或按 Esc）關閉到價提醒
  useEffect(() => {
    if (!alertOpen) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setAlertOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAlertOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [alertOpen]);

  const quote = useSWR<QuoteResponse>(
    id ? `/api/quote?ids=${encodeURIComponent(id)}` : null,
    fetcher,
    {
      refreshInterval: (latest) => (latest && !latest.marketOpen ? 0 : 10_000),
    }
  );
  const kline = useSWR<KlineResponse>(
    id ? `/api/kline?id=${encodeURIComponent(id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const fundamental = useSWR<Fundamental & { stockId: string; asOf: string }>(
    id ? `/api/fundamental?id=${encodeURIComponent(id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  // 共用 /api/watchlist 快取（與彈出面板同 key，不會多打一次）：判斷鈴鐺是否已亮
  const watch = useSWR<{
    items: StockWatchRow[];
  }>("/api/watchlist", fetcher);
  const watchItems = watch.data?.items ?? [];
  const watchIndex = watchItems.findIndex((i) => i.stock_id === id);
  const currentWatch = watchItems[watchIndex] ?? null;
  const hasAlert =
    !!currentWatch &&
    (currentWatch.alert_high != null || currentWatch.alert_low != null);
  const prevWatch = watchIndex > 0 ? watchItems[watchIndex - 1] : null;
  const nextWatch =
    watchIndex >= 0 && watchIndex < watchItems.length - 1
      ? watchItems[watchIndex + 1]
      : null;

  const q = quote.data?.quotes[0];
  const t = trendOf(q?.change ?? null);

  const visible = useMemo(() => {
    const all = kline.data?.candles ?? [];
    return filterCandlesByRange(all, range);
  }, [kline.data, range]);
  const rangeStats = useMemo(() => klineRangeStats(visible), [visible]);
  const rangeTrend = trendOf(rangeStats.change);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-app/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/#stock-${id}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink"
              aria-label="返回首頁"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">
                  {q?.name ?? id}
                </span>
                <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] text-muted ring-1 ring-line">
                  {id}
                  {q && `・${q.market === "tse" ? "上市" : "上櫃"}`}
                </span>
              </div>
            </div>
          </div>
          {quote.data && (
            <span
              className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium ${
                quote.data.marketOpen ? "bg-up-tint text-up" : "bg-app text-muted"
              }`}
            >
              {quote.data.marketOpen ? (
                <>
                  <span className="pulse-dot">●</span> 盤中
                </>
              ) : (
                "○ 已收盤"
              )}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        {/* 即時報價列 */}
        {q ? (
          <div className="rise-in relative z-20 rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`text-4xl font-bold tracking-tight tabular ${textColor[t]}`}>
                    {fmt(q.price)}
                  </span>
                  <span className={`text-sm font-semibold tabular ${textColor[t]}`}>
                    {q.change === null
                      ? ""
                      : `${q.change > 0 ? "+" : ""}${fmt(q.change)}`}
                  </span>
                  <span
                    className={`rounded-pill px-2 py-1 text-xs font-semibold tabular ${chipColor[t]}`}
                  >
                    {arrowOf(t)} {fmtPct(q.changePct)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted tabular">
                  <span className="whitespace-nowrap">開 {fmt(q.open)}</span>
                  <span className="whitespace-nowrap">高 {fmt(q.high)}</span>
                  <span className="whitespace-nowrap">低 {fmt(q.low)}</span>
                  <span className="whitespace-nowrap">昨收 {fmt(q.prevClose)}</span>
                  <span className="whitespace-nowrap">量 {fmtVol(q.volume)}</span>
                </div>
                {hasAlert && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs tabular">
                    {currentWatch?.alert_high != null && (
                      <span className="rounded-pill bg-up-tint px-2.5 py-1 font-medium text-up">
                        提醒 ▲ {fmt(currentWatch.alert_high)}
                      </span>
                    )}
                    {currentWatch?.alert_low != null && (
                      <span className="rounded-pill bg-down-tint px-2.5 py-1 font-medium text-down">
                        提醒 ▼ {fmt(currentWatch.alert_low)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 右上角鈴鐺：點擊彈出到價提醒（已設提醒時亮起＋紅點） */}
              <div className="relative shrink-0" ref={alertRef}>
                <button
                  onClick={() => setAlertOpen((v) => !v)}
                  aria-label="到價提醒"
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full ring-1 transition-colors ${
                    alertOpen || hasAlert
                      ? "bg-primary-tint text-primary ring-primary/30"
                      : "bg-app text-muted ring-line hover:text-ink"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {hasAlert && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-up ring-2 ring-surface" />
                  )}
                </button>

                {alertOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-card bg-surface p-4 shadow-lg ring-1 ring-line">
                    <PriceAlertCard stockId={id} name={q.name ?? id} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-card bg-surface shadow-card" />
        )}

        {(prevWatch || nextWatch) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {prevWatch ? (
              <Link
                href={`/stock/${prevWatch.stock_id}`}
                className="rounded-card bg-surface px-3 py-2 text-muted shadow-card ring-1 ring-line transition-colors hover:text-ink"
              >
                <span className="block text-[11px]">上一檔</span>
                <span className="mt-0.5 block truncate font-semibold text-ink">
                  ← {prevWatch.name}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {nextWatch ? (
              <Link
                href={`/stock/${nextWatch.stock_id}`}
                className="rounded-card bg-surface px-3 py-2 text-right text-muted shadow-card ring-1 ring-line transition-colors hover:text-ink"
              >
                <span className="block text-[11px]">下一檔</span>
                <span className="mt-0.5 block truncate font-semibold text-ink">
                  {nextWatch.name} →
                </span>
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}

        {/* K 線圖 */}
        <div
          className="rise-in rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5"
          style={{ animationDelay: "80ms" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="text-sm font-semibold text-ink">日 K</span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma5 }} />
                MA5
              </span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma20 }} />
                MA20
              </span>
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 rounded" style={{ background: MA_COLORS.ma60 }} />
                MA60
              </span>
            </div>
            <div className="flex flex-wrap rounded-pill bg-app p-0.5">
              {KLINE_RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 ${
                    range === r.key
                      ? "bg-surface text-ink shadow-card"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted tabular">
              <span>
                區間
                <span className={`ml-1 font-semibold ${textColor[rangeTrend]}`}>
                  {rangeStats.change == null
                    ? "—"
                    : `${rangeStats.change > 0 ? "+" : ""}${fmt(rangeStats.change)} (${fmtPct(rangeStats.changePct)})`}
                </span>
              </span>
              <span>最新 {kline.data?.latestDate ?? rangeStats.lastDate ?? "—"}</span>
              {kline.data?.stale && (
                <span className="rounded-pill bg-warn-tint px-2 py-0.5 text-warn">
                  顯示快取資料
                </span>
              )}
            </div>
          )}

          {kline.error ? (
            <div className="grid h-[420px] place-items-center text-sm text-warn">
              {kline.error.message}
            </div>
          ) : visible.length > 0 ? (
            <KlineChart candles={visible} />
          ) : (
            <div className="h-[420px] animate-pulse rounded-lg bg-app" />
          )}
        </div>

        {/* 基本面：估值＋法人買賣超＋月營收＋EPS（ETF 等無資料的區塊自動隱藏） */}
        {fundamental.data && (
          <FundamentalSection fund={fundamental.data} price={q?.price ?? null} />
        )}

        <footer className="pb-4 pt-1 text-center text-[11px] text-muted">
          日 K 與基本面資料來源：FinMind（未還原價）・即時報價：MIS・僅供個人參考，非投資建議
        </footer>
      </main>
    </div>
  );
}
