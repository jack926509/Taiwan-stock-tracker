"use client";

import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import Sparkline from "@/components/Sparkline";
import {
  fmt,
  fmtVol,
  fmtPct,
  trendOf,
  arrowOf,
  textColor,
  chipColor,
  limitOf,
  type Trend,
} from "@/lib/format";

// |漲跌幅| ≥3% 視為劇烈變動：字加粗、色彩加深一階，方便快速掃讀
const STRONG_MOVE_THRESHOLD = 0.03;

function strongMoveOf(changePct: number | null): boolean {
  return changePct !== null && Math.abs(changePct) >= STRONG_MOVE_THRESHOLD;
}

// 加深一階文字色（僅 up/down 有對應 strong 色階，flat 沿用原色）
const strongTextColor: Record<Trend, string> = {
  up: "text-up-strong",
  down: "text-down-strong",
  flat: "text-flat",
};

// 訊號徽章色階：中性（站上/跌破 MA20）用暖灰，偏多/偏空沿用既有紅綠系
// 扁平雜誌感：小圓角（非膠囊），呼應卡片整體 rounded-card 的方正調性
const signalToneClass: Record<Signal["tone"], string> = {
  neutral: "bg-line/35 text-muted",
  up: "bg-up-tint text-up",
  down: "bg-down-tint text-down",
};

function SignalBadges({ signals }: { signals?: Signal[] }) {
  if (!signals || signals.length === 0) return null;
  const shown = signals.slice(0, 2);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <span
          key={s.kind}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${signalToneClass[s.tone]}`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

// 當日區間條：現價落在當日 低～高 的位置（真實資料的現代化視覺）
function DayRangeBar({ q }: { q: Quote }) {
  const { low, high, price } = q;
  if (low === null || high === null || price === null || high <= low) {
    return null;
  }
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  const t = trendOf(q.change);
  const fill = t === "up" ? "bg-up" : t === "down" ? "bg-down" : "bg-flat";
  const grad =
    t === "up"
      ? "from-up/10 to-up/50"
      : t === "down"
        ? "from-down/10 to-down/50"
        : "from-flat/10 to-flat/40";
  return (
    <div className="mt-3">
      <div className="relative h-1.5 rounded-pill bg-app">
        <div
          className={`absolute inset-y-0 left-0 rounded-pill bg-gradient-to-r ${grad}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fill} shadow-[0_1px_4px_rgba(16,24,40,0.3)] ring-2 ring-surface`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular">
        <span>低 {fmt(low)}</span>
        <span>高 {fmt(high)}</span>
      </div>
    </div>
  );
}

export default function QuoteCard({
  quote,
  onDelete,
  spark,
  signals,
  reorderable = false,
}: {
  quote: Quote;
  onDelete?: (stockId: string) => void;
  spark?: number[];
  signals?: Signal[];
  reorderable?: boolean;
}) {
  const t = trendOf(quote.change);
  const limit = limitOf(quote.changePct);
  const strongMove = strongMoveOf(quote.changePct);
  const prevPrice = useRef<number | null>(quote.price);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const prev = prevPrice.current;
    if (quote.price !== null && prev !== null && quote.price !== prev) {
      setFlash(quote.price > prev ? "flash-up" : "flash-down");
      const id = setTimeout(() => setFlash(""), 750);
      prevPrice.current = quote.price;
      return () => clearTimeout(id);
    }
    prevPrice.current = quote.price;
  }, [quote.price]);

  return (
    <div className="group relative">
      <a
        href={`/stock/${quote.stockId}`}
        className={`block rounded-card bg-surface py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          reorderable ? "pl-14" : "pl-4"
        } ${onDelete ? "pr-4 md:pr-12" : "pr-4"} ${
          limit === "up"
            ? "ring-2 ring-up"
            : limit === "down"
              ? "ring-2 ring-down"
              : "ring-1 ring-line"
        } ${flash}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-serif text-base font-semibold leading-tight text-ink">
              {quote.name}
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted tabular">
              {quote.stockId}・{quote.market === "tse" ? "上市" : "上櫃"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={`font-mono text-3xl tracking-tight tabular ${
                strongMove ? "font-extrabold" : "font-bold"
              } ${strongMove ? strongTextColor[t] : textColor[t]}`}
            >
              {fmt(quote.price)}
            </div>
            <div
              className={`mt-1 font-mono text-xs tabular ${
                strongMove ? "font-extrabold" : "font-semibold"
              } ${textColor[t]}`}
            >
              {arrowOf(t)} {fmtPct(quote.changePct)}
              {quote.change !== null && (
                <span className="ml-1 opacity-80">
                  {quote.change > 0 ? "+" : ""}
                  {fmt(quote.change)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`shrink-0 rounded-pill px-2 py-1 font-mono text-[11px] font-semibold ${chipColor[t]}`}>
              {t === "up" ? "上漲" : t === "down" ? "下跌" : "持平"}
            </span>
            {limit && (
              <span className={`rounded-pill px-1.5 py-1 text-[11px] font-bold text-white ${limit === "up" ? "bg-up" : "bg-down"}`}>
                {limit === "up" ? "漲停" : "跌停"}
              </span>
            )}
            {!quote.traded && <span className="text-[11px] text-warn">未成交</span>}
          </div>
          {spark ? <Sparkline points={spark} /> : null}
        </div>

        <div className="hidden sm:block">
          {/* 桌面版保留技術訊號與日內區間；手機優先顯示核心行情。 */}
          {signals && signals.length > 0 && (
            <div className="mt-3 border-t border-dotted border-line pt-2.5">
              <SignalBadges signals={signals} />
            </div>
          )}

          <DayRangeBar q={quote} />
        </div>

        <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-muted tabular">
          <span>報價 {quote.time || "—"}</span>
          <span>成交量 {fmtVol(quote.volume)}</span>
          <span className="hidden sm:inline">開 {fmt(quote.open)}・昨收 {fmt(quote.prevClose)}</span>
        </div>
      </a>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(quote.stockId)}
          aria-label={`刪除 ${quote.name}`}
          className="absolute right-2 top-2 z-10 hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-sm text-muted opacity-0 transition-all hover:bg-up-tint hover:text-up focus-visible:bg-surface focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 active:scale-[0.97]"
        >
          ✕
        </button>
      )}
    </div>
  );
}
