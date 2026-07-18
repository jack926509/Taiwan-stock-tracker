"use client";

// 自選股主表：桌面 ≥600px 顯示表格（thead + row，7 欄格線照抄視覺規範），
// 手機 <600px 用 CSS 斷點把「同一列 DOM」切成卡片（grid-template-areas）。
// 排序／篩選狀態與資料抓取留在 app/page.tsx（資料層），本元件只負責渲染＋刪除／拖曳排序回呼。
import Link from "next/link";
import type { Quote, WatchlistItem } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import Sparkline from "@/components/Sparkline";
import SwipeToDelete from "@/components/SwipeToDelete";
import EmptyState from "@/components/EmptyState";
import SortableQuoteRows, { SortableRow } from "@/components/home/SortableQuoteRows";
import { fmt, fmtVol, fmtPct, trendOf, limitOf } from "@/lib/format";

export const SORTS = [
  { key: "default", label: "預設" },
  { key: "gain", label: "漲幅" },
  { key: "loss", label: "跌幅" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export const FILTERS = [
  { key: "all", label: "全部" },
  { key: "alert", label: "已設提醒" },
  { key: "up", label: "僅看漲" },
  { key: "down", label: "僅看跌" },
] as const;
export type FilterKey = (typeof FILTERS)[number]["key"];

// 桌面 7 欄格線，照抄視覺規範 2026-07-18-visual-spec-final.html（.thead, .row）
const GRID_COLS =
  "grid-cols-[minmax(150px,1.1fr)_90px_120px_minmax(196px,1.5fr)_86px_104px_92px]";
// 手機把同一組欄位改用具名區域堆成卡片，照抄規範 .row（max-width:599px）
const MOBILE_AREAS =
  "max-[599px]:grid-cols-[1fr_auto] max-[599px]:[grid-template-areas:'sym_price'_'pill_change'_'sig_sig'_'trend_trend'_'foot_foot']";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    </svg>
  );
}

function signalToneClass(tone: Signal["tone"]): string {
  if (tone === "up") return "bg-up-tint text-up";
  if (tone === "down") return "bg-down-tint text-down";
  return "bg-line/35 text-muted";
}

function Row({
  quote,
  hasAlert,
  spark,
  signals,
  onDelete,
  reorderable,
}: {
  quote: Quote;
  hasAlert: boolean;
  spark?: number[];
  signals?: Signal[];
  onDelete: (stockId: string, name: string) => void;
  reorderable: boolean;
}) {
  const t = trendOf(quote.change);
  const limit = limitOf(quote.changePct);
  const upDown = limit ?? (t === "flat" ? null : t);

  const badges: { key: string; label: string; cls: string }[] = [];
  if (limit === "up") badges.push({ key: "limit", label: "漲停", cls: "bg-up text-white dark:text-app" });
  else if (limit === "down") badges.push({ key: "limit", label: "跌停", cls: "bg-down text-white dark:text-app" });
  for (const s of signals ?? []) {
    badges.push({ key: s.kind, label: s.label, cls: signalToneClass(s.tone) });
  }

  return (
    <SwipeToDelete onDelete={() => onDelete(quote.stockId, quote.name)}>
      <div
        id={`stock-${quote.stockId}`}
        className={`group relative scroll-mt-24 grid items-center gap-3.5 border-b border-line bg-surface px-4 py-3 last:border-b-0 hover:bg-surface-2 rise-in max-[599px]:gap-y-2.5 max-[599px]:rounded-card max-[599px]:border max-[599px]:border-line max-[599px]:bg-surface max-[599px]:px-4 max-[599px]:py-3.5 max-[599px]:shadow-card ${GRID_COLS} ${MOBILE_AREAS} ${reorderable ? "max-[599px]:pl-8" : ""}`}
      >
        {/* 左緣 3px 漲跌色條 */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] max-[599px]:rounded-l-card ${
            upDown === "up" ? "bg-up" : upDown === "down" ? "bg-down" : "bg-transparent"
          }`}
        />

        <Link
          href={`/stock/${quote.stockId}`}
          className="flex min-w-0 items-center gap-2.5 max-[599px]:[grid-area:sym] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-muted">
            {quote.stockId}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <span className="truncate">{quote.name}</span>
              {hasAlert && <BellIcon className="h-3 w-3 shrink-0 text-primary" />}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] text-faint">
              {quote.market === "tse" ? "上市" : "上櫃"}
            </span>
          </span>
        </Link>

        <div className="text-right font-mono text-base font-bold tabular text-ink max-[599px]:[grid-area:price]">
          {fmt(quote.price)}
        </div>

        {/* 手機專用狀態 pill，桌面隱藏（不佔欄位） */}
        <span
          className={`hidden max-[599px]:inline-flex max-[599px]:[grid-area:pill] items-center rounded-pill px-2.5 py-1 text-[11px] font-bold ${
            limit
              ? limit === "up"
                ? "bg-up text-white dark:text-app"
                : "bg-down text-white dark:text-app"
              : t === "up"
                ? "bg-up-tint text-up"
                : t === "down"
                  ? "bg-down-tint text-down"
                  : "bg-surface-2 text-muted"
          }`}
        >
          {limit ? (limit === "up" ? "漲停" : "跌停") : t === "up" ? "▲ 上漲" : t === "down" ? "▼ 下跌" : "持平"}
        </span>

        <div className="flex flex-col items-end gap-1 text-right max-[599px]:[grid-area:change] max-[599px]:flex-row max-[599px]:items-center max-[599px]:gap-2">
          <span className={`font-mono text-[13px] font-bold tabular ${t === "up" ? "text-up" : t === "down" ? "text-down" : "text-flat"}`}>
            {quote.change !== null && quote.change > 0 ? "+" : ""}
            {fmt(quote.change)}
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 font-mono text-xs font-bold tabular ${
              t === "up" ? "bg-up-tint text-up" : t === "down" ? "bg-down-tint text-down" : "bg-surface-2 text-flat"
            }`}
          >
            {quote.changePct !== null && quote.changePct > 0 ? "+" : ""}
            {fmtPct(quote.changePct)}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 max-[599px]:[grid-area:sig]">
          {badges.length > 0 ? (
            badges
              .slice(0, 3)
              .map((b) => (
                <span key={b.key} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-semibold ${b.cls}`}>
                  {b.label}
                </span>
              ))
          ) : (
            <span className="text-xs text-faint">—</span>
          )}
        </div>

        <div className="text-right font-mono text-xs tabular text-ink [grid-area:vol] max-[599px]:hidden">
          {fmtVol(quote.volume)}
        </div>

        <div className="flex justify-center max-[599px]:[grid-area:trend]">
          {spark && spark.length > 1 ? <Sparkline points={spark} /> : <span className="text-xs text-faint">—</span>}
        </div>

        <div className="flex flex-col items-end gap-1 text-right max-[599px]:[grid-area:foot] max-[599px]:mt-0.5 max-[599px]:w-full max-[599px]:flex-row max-[599px]:items-center max-[599px]:justify-start max-[599px]:gap-3 max-[599px]:border-t max-[599px]:border-line max-[599px]:pt-2.5">
          <span className="whitespace-nowrap font-mono text-[11px] text-muted tabular">
            報價 {quote.time || "—"}
            {!quote.traded && <strong className="ml-1 font-semibold text-warn">未成交</strong>}
          </span>
          <span className="hidden font-mono text-xs text-muted tabular max-[599px]:inline">
            量 {fmtVol(quote.volume)}
          </span>
          {hasAlert ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-primary">
              <BellIcon className="h-2.5 w-2.5" />已設
            </span>
          ) : (
            <span className="text-[11px] text-faint">—</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(quote.stockId, quote.name)}
          aria-label={`刪除 ${quote.name}`}
          className="absolute right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-surface text-xs text-muted opacity-0 shadow-card transition-[transform,color,opacity] hover:scale-105 hover:bg-up-tint hover:text-up focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 active:scale-[0.97] md:flex max-[599px]:hidden"
        >
          ✕
        </button>
      </div>
    </SwipeToDelete>
  );
}

export default function QuoteBoard({
  quotes,
  items,
  onDelete,
  sparkData,
  reorderable = false,
  onReorder,
}: {
  quotes: Quote[];
  items: WatchlistItem[];
  onDelete: (stockId: string, name: string) => void;
  // 額外資料（超出 task-7-brief 最小契約，皆為可選＋向下相容，見 task-7-report.md）：
  // 既有訊號／20 日走勢資料（來自 /api/sparklines，本元件不重新打 API）
  sparkData?: Record<string, { spark: number[]; signals: Signal[] }>;
  // 拖曳排序：僅「預設排序＋無篩選＋≥2 檔」時 shell 會傳入，保留舊版可拖曳排序功能
  reorderable?: boolean;
  onReorder?: (next: string[]) => void;
}) {
  const alertedIds = new Set(
    items.filter((i) => i.alert_high != null || i.alert_low != null).map((i) => i.stock_id)
  );

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📈"
        description="還沒有自選股，輸入代號加入第一檔吧（例如 2330 台積電）"
      />
    );
  }

  if (quotes.length === 0) {
    return <EmptyState description="此篩選條件下沒有自選股" />;
  }

  const canDrag = reorderable && !!onReorder && quotes.length > 1;
  const ids = quotes.map((q) => q.stockId);

  const rows = quotes.map((q, i) => {
    const node = (
      <div className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
        <Row
          quote={q}
          hasAlert={alertedIds.has(q.stockId)}
          spark={sparkData?.[q.stockId]?.spark}
          signals={sparkData?.[q.stockId]?.signals}
          onDelete={onDelete}
          reorderable={canDrag}
        />
      </div>
    );
    return canDrag ? (
      <SortableRow key={q.stockId} id={q.stockId}>
        {node}
      </SortableRow>
    ) : (
      <div key={q.stockId}>{node}</div>
    );
  });

  return (
    // 600–999px（平板窄寬）時 7 欄表格的最小內容寬（約 922px）可能超過可用欄寬；
    // 外層 overflow-x-auto 讓「表格自己」局部橫向捲動，不把整個頁面撐寬（見 task-7-report.md）。
    <div className="max-[599px]:overflow-visible overflow-x-auto">
      <div className="rounded-card border border-line bg-surface shadow-card max-[599px]:border-0 max-[599px]:bg-transparent max-[599px]:shadow-none">
        <div
          className={`grid items-center gap-3.5 border-b border-line bg-surface-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-muted max-[599px]:hidden ${GRID_COLS}`}
        >
          <span>商品</span>
          <span className="text-right">現價</span>
          <span className="text-right">漲跌 / 幅度</span>
          <span>訊號</span>
          <span className="text-right">量</span>
          <span className="text-center">日內走勢</span>
          <span className="text-right">報價 / 提醒</span>
        </div>
        <div className="max-[599px]:grid max-[599px]:gap-3">
          {canDrag && onReorder ? (
            <SortableQuoteRows ids={ids} onReorder={onReorder}>
              {rows}
            </SortableQuoteRows>
          ) : (
            rows
          )}
        </div>
      </div>
    </div>
  );
}
