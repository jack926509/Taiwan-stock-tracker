"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import useSWR from "swr";
import type { QuoteResponse } from "@/lib/types";
import type { Candle } from "@/lib/providers/klineProvider";
import type { Fundamental } from "@/lib/providers/fundamentalProvider";
import FundamentalSection from "@/components/FundamentalSection";
import MobileNetworkBanner from "@/components/MobileNetworkBanner";
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
  WEEK_RANGE_KEYS,
  klineRangeStats,
  type KlineRangeKey,
} from "@/lib/klineRange";
import { aggregateCandles } from "@/lib/aggregateKline";
import { stockIdForRender } from "@/lib/stockPath";
import { hasAnyAlert } from "@/lib/alertBadge";
import useDialogFocus from "@/hooks/useDialogFocus";
import { usePollGuard } from "@/hooks/usePollGuard";
import { IconArrowLeft } from "@/components/icons";

type KlinePeriod = "day" | "week" | "month";

const PERIOD_OPTIONS: { key: KlinePeriod; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "週" },
  { key: "month", label: "月" },
];

// lightweight-charts 屬重量套件，動態載入避免拖慢個股頁首次 JS
const KlineChart = dynamic(() => import("@/components/KlineChart"), {
  ssr: false,
  loading: () => <div className="h-[460px] animate-pulse rounded-card bg-app" />,
});

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
  alert_change_pct: number | null;
  alert_volume_on: boolean;
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const [hydrated, setHydrated] = useState(false);
  const [pathname, setPathname] = useState("");
  useEffect(() => {
    setPathname(window.location.pathname);
    setHydrated(true);
  }, []);
  const id = stockIdForRender(hydrated, params.id, pathname);
  const [range, setRange] = useState<KlineRangeKey>("6m");
  const [period, setPeriod] = useState<KlinePeriod>("day");
  const [alertOpen, setAlertOpen] = useState(false);
  const { autoPaused, onQuoteSuccess, refreshInterval } = usePollGuard();
  const alertRef = useRef<HTMLDivElement>(null);
  const alertPanelRef = useRef<HTMLDivElement>(null);

  // 鈴鐺浮層以對話框語意呈現：聚焦、Tab 循環、關閉還焦（Esc/點外關閉見下方 effect）
  useDialogFocus(alertOpen, alertPanelRef);

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
      refreshInterval,
      refreshWhenHidden: false,
      onSuccess: onQuoteSuccess,
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
  const hasAlert = !!currentWatch && hasAnyAlert(currentWatch);
  const prevWatch = watchIndex > 0 ? watchItems[watchIndex - 1] : null;
  const nextWatch =
    watchIndex >= 0 && watchIndex < watchItems.length - 1
      ? watchItems[watchIndex + 1]
      : null;

  const q = quote.data?.quotes[0];
  const t = trendOf(q?.change ?? null);

  // 週 K 模式的區間鈕只開放 6月/1年/3年；切到週 K 時若目前區間不在其中，改用 1 年
  useEffect(() => {
    if (period === "week" && !WEEK_RANGE_KEYS.includes(range)) {
      setRange("1y");
    }
  }, [period, range]);

  const dayVisible = useMemo(() => {
    const all = kline.data?.candles ?? [];
    return filterCandlesByRange(all, range);
  }, [kline.data, range]);

  // 週 K：先按區間濾出日 K 再聚合；月 K：固定用全部 3 年快取資料聚合（不受區間鈕影響）
  const visible = useMemo(() => {
    if (period === "week") return aggregateCandles(dayVisible, "week");
    if (period === "month") {
      return aggregateCandles(kline.data?.candles ?? [], "month");
    }
    return dayVisible;
  }, [period, dayVisible, kline.data]);

  const rangeStats = useMemo(() => klineRangeStats(visible), [visible]);
  const rangeTrend = trendOf(rangeStats.change);
  const periodLabel =
    period === "day" ? "日" : period === "week" ? "週" : "月";
  const visibleRangeOptions =
    period === "week"
      ? KLINE_RANGES.filter((r) => WEEK_RANGE_KEYS.includes(r.key))
      : KLINE_RANGES;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-app/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={`/#stock-${id}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-surface text-muted ring-1 ring-line transition-colors hover:text-ink"
                aria-label="返回首頁"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-serif font-semibold">
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
          {/* 頂部價格摘要（sticky，毛玻璃樣式沿用 header bg-app/95）：滾動時仍能看到即時股價 */}
          {q && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-[3.25rem]">
              <span className={`font-mono text-xl font-bold tabular ${textColor[t]}`}>
                {fmt(q.price)}
              </span>
              <span className={`font-mono text-xs font-semibold tabular ${textColor[t]}`}>
                {q.change === null
                  ? ""
                  : `${q.change > 0 ? "+" : ""}${fmt(q.change)}`}
              </span>
              <span
                className={`rounded-pill px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular ${chipColor[t]}`}
              >
                {arrowOf(t)} {fmtPct(q.changePct)}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        <MobileNetworkBanner
          stale={Boolean(kline.data?.stale)}
          error={quote.error ?? kline.error ?? fundamental.error}
        />

        {/* 即時報價列 */}
        {q ? (
          <div className="rise-in relative z-20 rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`font-mono text-4xl font-bold tracking-tight tabular ${textColor[t]}`}>
                    {fmt(q.price)}
                  </span>
                  <span className={`font-mono text-sm font-semibold tabular ${textColor[t]}`}>
                    {q.change === null
                      ? ""
                      : `${q.change > 0 ? "+" : ""}${fmt(q.change)}`}
                  </span>
                  <span
                    className={`rounded-pill px-2 py-1 font-mono text-xs font-semibold tabular ${chipColor[t]}`}
                  >
                    {arrowOf(t)} {fmtPct(q.changePct)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted tabular">
                  <span className="whitespace-nowrap">開 {fmt(q.open)}</span>
                  <span className="whitespace-nowrap">高 {fmt(q.high)}</span>
                  <span className="whitespace-nowrap">低 {fmt(q.low)}</span>
                  <span className="whitespace-nowrap">昨收 {fmt(q.prevClose)}</span>
                  <span className="whitespace-nowrap">量 {fmtVol(q.volume)}</span>
                </div>
                {hasAlert && (
                  <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs tabular">
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
                  className={`relative flex h-11 w-11 items-center justify-center rounded-card ring-1 transition-colors ${
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
                  <div
                    ref={alertPanelRef}
                    role="dialog"
                    tabIndex={-1}
                    aria-label="到價提醒設定"
                    className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-card bg-surface p-4 shadow-lg ring-1 ring-line"
                  >
                    <PriceAlertCard
                      stockId={id}
                      name={q.name ?? id}
                      currentPrice={q.price ?? null}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-card bg-surface shadow-card" />
        )}

        {/* K 線圖 */}
        <div
          className="rise-in rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5"
          style={{ animationDelay: "80ms" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="font-serif text-sm font-semibold text-ink">
              {periodLabel} K
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap rounded-pill bg-app p-0.5">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    aria-pressed={period === p.key}
                    className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3 ${
                      period === p.key
                        ? "bg-surface text-ink shadow-card"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period !== "month" && (
                <div className="flex flex-wrap rounded-pill bg-app p-0.5">
                  {visibleRangeOptions.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      aria-pressed={range === r.key}
                      className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3 ${
                        range === r.key
                          ? "bg-surface text-ink shadow-card"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {visible.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted tabular">
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
            <div className="grid h-[460px] place-items-center text-sm text-warn">
              {kline.error.message}
            </div>
          ) : visible.length > 0 ? (
            <KlineChart
              candles={visible}
              alertHigh={currentWatch?.alert_high ?? null}
              alertLow={currentWatch?.alert_low ?? null}
            />
          ) : (
            <div className="h-[460px] animate-pulse rounded-lg bg-app" />
          )}
        </div>

        {/* 基本面：估值＋法人買賣超＋月營收＋EPS（ETF 等無資料的區塊自動隱藏） */}
        {fundamental.data ? (
          <FundamentalSection
            fund={fundamental.data}
            price={q?.price ?? null}
            asOf={fundamental.data.asOf}
          />
        ) : !fundamental.error ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-card bg-surface shadow-card" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="h-48 animate-pulse rounded-card bg-surface shadow-card" />
              <div className="h-48 animate-pulse rounded-card bg-surface shadow-card" />
            </div>
          </div>
        ) : null}

        {/* 自選清單前後檔切換：僅在目前個股在自選清單內時顯示（非自選、直接搜尋進來則隱藏） */}
        {(prevWatch || nextWatch) && (
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-4 text-xs">
            {prevWatch ? (
              <a
                href={`/stock/${prevWatch.stock_id}`}
                className="rounded-card bg-surface px-3 py-2 text-muted shadow-card ring-1 ring-line transition-colors hover:text-ink"
              >
                <span className="block text-[11px]">上一檔</span>
                <span className="mt-0.5 block truncate font-serif font-semibold text-ink">
                  ← {prevWatch.name}
                  <span className="ml-1 font-mono text-[11px] font-normal text-muted">
                    {prevWatch.stock_id}
                  </span>
                </span>
              </a>
            ) : (
              <span />
            )}
            {nextWatch ? (
              <a
                href={`/stock/${nextWatch.stock_id}`}
                className="rounded-card bg-surface px-3 py-2 text-right text-muted shadow-card ring-1 ring-line transition-colors hover:text-ink"
              >
                <span className="block text-[11px]">下一檔</span>
                <span className="mt-0.5 block truncate font-serif font-semibold text-ink">
                  <span className="mr-1 font-mono text-[11px] font-normal text-muted">
                    {nextWatch.stock_id}
                  </span>
                  {nextWatch.name} →
                </span>
              </a>
            ) : (
              <span />
            )}
          </div>
        )}

        <footer className="pb-4 pt-1 text-center text-[11px] text-muted">
          日 K 與基本面資料來源：FinMind（未還原價）・即時報價：MIS・僅供個人參考，非投資建議
        </footer>
      </main>
    </div>
  );
}
