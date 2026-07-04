"use client";

import type { Quote } from "@/lib/types";
import { fmt, fmtPct, trendOf, arrowOf, textColor } from "@/lib/format";

// 大盤指數：手機兩顆各佔半寬、一次全部顯示（不需橫向滑動）；
// 桌面版改為佔滿整條版面寬度的橫條帶，每檔各佔半條、中間以分隔線區隔。
function IndexBlock({ q }: { q: Quote }) {
  const t = trendOf(q.change);
  const color = textColor[t];
  const label =
    q.stockId === "t00" ? "加權指數" : q.stockId === "o00" ? "櫃買指數" : q.name;

  return (
    <div className="flex w-full flex-col gap-1 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card sm:flex-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-none sm:border-0 sm:border-r sm:border-line sm:bg-transparent sm:px-6 sm:py-3 sm:shadow-none sm:last:border-r-0">
      <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className={`font-mono text-base font-bold tabular sm:text-xl ${color}`}>
          {fmt(q.price)}
        </span>
        <span
          className={`flex items-center gap-0.5 whitespace-nowrap font-mono text-xs font-semibold tabular sm:text-sm ${color}`}
        >
          {arrowOf(t)}
          {q.change !== null && (
            <span className="ml-0.5">
              {q.change > 0 ? "+" : ""}
              {fmt(q.change)}
            </span>
          )}
          <span className="ml-0.5">{fmtPct(q.changePct)}</span>
        </span>
      </div>
    </div>
  );
}

export default function IndexCards({ indices }: { indices: Quote[] }) {
  if (indices.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="大盤指數"
      className="flex gap-2 sm:gap-0 sm:rounded-card sm:border sm:border-line sm:bg-surface sm:shadow-card"
    >
      {indices.map((q) => (
        <div key={q.stockId} role="listitem" className="flex flex-1">
          <IndexBlock q={q} />
        </div>
      ))}
    </div>
  );
}
