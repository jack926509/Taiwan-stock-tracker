"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/types";
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
} from "@/lib/format";

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
}: {
  quote: Quote;
  onDelete?: (stockId: string) => void;
  spark?: number[];
}) {
  const t = trendOf(quote.change);
  const limit = limitOf(quote.changePct);
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
      <Link
        href={`/stock/${quote.stockId}`}
        className={`block rounded-card bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          limit === "up"
            ? "ring-2 ring-up"
            : limit === "down"
              ? "ring-2 ring-down"
              : "ring-1 ring-line"
        } ${flash}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{quote.name}</div>
            <div className="mt-0.5 text-xs text-muted">
              {quote.stockId}
              <span className="mx-1 text-line">·</span>
              {quote.market === "tse" ? "上市" : "上櫃"}
              {!quote.traded && <span className="ml-1.5 text-warn">未成交</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {limit && (
              <span
                className={`rounded-pill px-1.5 py-1 text-[11px] font-bold text-white ${
                  limit === "up" ? "bg-up" : "bg-down"
                }`}
              >
                {limit === "up" ? "漲停" : "跌停"}
              </span>
            )}
            <span
              className={`rounded-pill px-2 py-1 text-xs font-semibold tabular ${chipColor[t]}`}
            >
              {arrowOf(t)} {fmtPct(quote.changePct)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tracking-tight tabular ${textColor[t]}`}
            >
              {fmt(quote.price)}
            </span>
            <span className={`text-sm font-medium tabular ${textColor[t]}`}>
              {quote.change === null
                ? ""
                : `${quote.change > 0 ? "+" : ""}${fmt(quote.change)}`}
            </span>
          </div>
          {spark && <Sparkline points={spark} />}
        </div>

        <DayRangeBar q={quote} />

        <div className="mt-3 flex justify-between border-t border-line pt-3 text-xs text-muted tabular">
          <span>開 {fmt(quote.open)}</span>
          <span>昨收 {fmt(quote.prevClose)}</span>
          <span>量 {fmtVol(quote.volume)}</span>
        </div>
      </Link>

      {onDelete && (
        <button
          onClick={() => onDelete(quote.stockId)}
          aria-label={`刪除 ${quote.name}`}
          className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted opacity-0 shadow-card transition-all hover:scale-110 hover:text-up focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
