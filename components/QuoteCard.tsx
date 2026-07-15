"use client";

import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/types";
import type { Signal } from "@/lib/signals";
import Sparkline from "@/components/Sparkline";
import { IconX } from "@/components/icons";
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
  // 最多顯示 2 個，其餘以「+N」聚合（完整訊號見個股頁 K 線；後端最多產生 6 個）
  const shown = signals.slice(0, 2);
  const extra = signals.length - shown.length;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {shown.map((s) => (
        <span
          key={s.kind}
          className={`truncate rounded px-2 py-1 text-xs font-medium ${signalToneClass[s.tone]}`}
        >
          {s.label}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="shrink-0 rounded bg-line/35 px-1.5 py-1 text-xs font-medium text-muted"
          aria-label={`還有 ${extra} 個技術訊號`}
        >
          +{extra}
        </span>
      )}
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
    <div className="group relative h-full">
      <a
        href={`/stock/${quote.stockId}`}
        className={`flex h-full flex-col rounded-card bg-surface py-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          reorderable ? "pl-14" : "pl-4"
        } ${onDelete ? "pr-4 md:pr-12" : "pr-4"} ${
          limit === "up"
            ? "ring-2 ring-up"
            : limit === "down"
              ? "ring-2 ring-down"
              : "ring-1 ring-line"
        } ${flash}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
          <div className="min-w-0">
            <div className="min-h-10 break-words text-pretty font-serif text-base font-semibold leading-tight text-ink">
              {quote.name}
            </div>
            <div className="mt-1 font-mono text-xs text-muted tabular">
              {quote.stockId}・{quote.market === "tse" ? "上市" : "上櫃"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={`whitespace-nowrap font-mono text-3xl tracking-tight tabular ${
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

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-4">
          <span
            className={`w-fit shrink-0 whitespace-nowrap rounded-pill px-2.5 py-1 font-mono text-xs font-semibold ${
              limit
                ? `text-white dark:text-app ${limit === "up" ? "bg-up" : "bg-down"}`
                : chipColor[t]
            }`}
          >
            {limit
              ? limit === "up"
                ? "漲停"
                : "跌停"
              : t === "up"
                ? "上漲"
                : t === "down"
                  ? "下跌"
                  : "持平"}
          </span>
          {spark ? <Sparkline points={spark} /> : null}
        </div>

        {signals && signals.length > 0 && (
          <div className="mt-3 min-w-0 border-t border-line/70 pt-2.5">
            <SignalBadges signals={signals} />
          </div>
        )}

        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line pt-3 text-xs text-muted tabular">
          <span className="min-w-0 whitespace-nowrap">
            報價 {quote.time || "—"}
            {!quote.traded && <strong className="ml-2 font-semibold text-warn">未成交</strong>}
          </span>
          <span className="whitespace-nowrap">量 {fmtVol(quote.volume)}</span>
        </div>
      </a>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(quote.stockId)}
          aria-label={`刪除 ${quote.name}`}
          className="absolute right-2 top-2 z-10 hidden md:flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-xs text-muted opacity-0 shadow-card transition-[transform,color,opacity] hover:scale-105 hover:bg-danger-tint hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 active:scale-[0.97]"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
