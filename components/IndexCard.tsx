"use client";

import type { Quote } from "@/lib/types";
import { fmt, fmtPct, trendOf, arrowOf, textColor } from "@/lib/format";

function IndexCard({ q }: { q: Quote }) {
  const t = trendOf(q.change);
  const color = textColor[t];
  const label =
    q.stockId === "t00" ? "加權指數" : q.stockId === "o00" ? "櫃買指數" : q.name;
  // 方向色細頂條 + 極淡同色暈染，淺色現代風的低調強調
  const accent = t === "up" ? "bg-up" : t === "down" ? "bg-down" : "bg-flat";
  const wash =
    t === "up"
      ? "from-up-tint/70"
      : t === "down"
        ? "from-down-tint/70"
        : "from-app/70";
  // 振幅 =（高 − 低）／昨收
  const amp =
    q.high !== null && q.low !== null && q.prevClose !== null && q.prevClose > 0
      ? ((q.high - q.low) / q.prevClose) * 100
      : null;

  return (
    <div className="relative overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${wash} to-transparent`}
      />
      <div className="relative p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">{label}</span>
          <span className="rounded-pill bg-surface/80 px-2 py-0.5 text-[11px] text-muted ring-1 ring-line">
            {q.market === "tse" ? "上市" : "上櫃"}
          </span>
        </div>
        <div className={`mt-2 text-4xl font-bold tracking-tight tabular ${color}`}>
          {fmt(q.price)}
        </div>
        <div className={`mt-1.5 flex items-center gap-2 text-sm font-semibold tabular ${color}`}>
          <span>
            {arrowOf(t)} {q.change === null ? "—" : `${q.change > 0 ? "+" : ""}${fmt(q.change)}`}
          </span>
          <span>{fmtPct(q.changePct)}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted tabular">
          <span className="whitespace-nowrap">開 {fmt(q.open)}</span>
          <span className="whitespace-nowrap">高 {fmt(q.high)}</span>
          <span className="whitespace-nowrap">低 {fmt(q.low)}</span>
          {amp !== null && (
            <span className="whitespace-nowrap sm:ml-auto">
              振幅 {amp.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IndexCards({ indices }: { indices: Quote[] }) {
  if (indices.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {indices.map((q, i) => (
        <div
          key={q.stockId}
          className="rise-in"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <IndexCard q={q} />
        </div>
      ))}
    </div>
  );
}
