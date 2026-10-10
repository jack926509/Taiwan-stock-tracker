"use client";

import type { Quote } from "@/lib/types";
import { fmt, fmtPct, trendOf, arrowOf, textColor } from "@/lib/format";

// 左欄「大盤指數」卡：直式卡片（名稱／代碼列＋大字現價＋漲跌），
// 全斷點皆同一種直式版型；600–999px 兩顆併排兩欄，其餘斷點單欄堆疊（見外層 IndexCards 的 grid）。
function IndexBlock({ q }: { q: Quote }) {
  const t = trendOf(q.change);
  const color = textColor[t];
  const label =
    q.stockId === "t00" ? "加權指數" : q.stockId === "o00" ? "櫃買指數" : q.name;
  const mkt = q.stockId === "t00" ? "TAIEX" : q.stockId === "o00" ? "TPEX" : q.market.toUpperCase();
  const pctTint = t === "up" ? "bg-up-tint" : t === "down" ? "bg-down-tint" : "bg-surface-2";

  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card max-[599px]:px-3 max-[599px]:py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold text-ink">{label}</span>
        <span className="shrink-0 font-mono text-[10px] tracking-wide text-faint">{mkt}</span>
      </div>
      <div className={`mt-2 whitespace-nowrap font-mono text-2xl font-bold tabular max-[599px]:mt-1 max-[599px]:text-xl ${color}`}>
        {fmt(q.price)}
      </div>
      <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-sm tabular max-[599px]:text-xs ${color}`}>
        <span className="whitespace-nowrap">
          {arrowOf(t)}
          {q.change !== null && (
            <span className="ml-1">
              {q.change > 0 ? "+" : ""}
              {fmt(q.change)}
            </span>
          )}
        </span>
        <span className={`whitespace-nowrap rounded-pill px-2 py-0.5 text-xs font-bold ${pctTint}`}>
          {fmtPct(q.changePct)}
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
      className="grid min-w-0 grid-cols-2 gap-3 max-[599px]:gap-2 min-[1360px]:grid-cols-1"
    >
      {indices.map((q) => (
        <div key={q.stockId} role="listitem" className="min-w-0">
          <IndexBlock q={q} />
        </div>
      ))}
    </div>
  );
}
