"use client";

import useSWR from "swr";
import type { DailySummaryData } from "@/lib/summaryData";
import type { Signal } from "@/lib/signals";
import { fmt, fmtPct, trendOf, arrowOf, textColor } from "@/lib/format";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const signalToneClass: Record<Signal["tone"], string> = {
  neutral: "bg-line/35 text-muted",
  up: "bg-up-tint text-up",
  down: "bg-down-tint text-down",
};

// 站內收盤總覽：休市時段顯示於首頁，內容與每日 LINE 總結同源
// （漲跌家數、各股當日/本週累計、今日新技術訊號、最強最弱、提醒觸發數）。
// 取不到資料時整段隱藏——總覽是加分資訊，不該擋住主畫面。
export default function ClosingSummary() {
  const { data, error } = useSWR<{ summary: DailySummaryData | null }>(
    "/api/summary",
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const s = data?.summary;
  if (error || !s) return null;

  const signalRows = s.rows.filter((r) => r.newSignals.length > 0);
  const dateLabel = `${s.date.slice(5, 7)}/${s.date.slice(8, 10)}`;

  return (
    <section
      aria-label="收盤總覽"
      className="rise-in rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-base font-semibold text-ink">
          收盤總覽
          <span className="ml-2 font-mono text-xs font-normal text-muted tabular">
            {dateLabel}
          </span>
        </h2>
        <span className="font-mono text-xs text-muted tabular">
          漲 {s.counts.up}・跌 {s.counts.down}・平 {s.counts.flat}
        </span>
      </div>

      {/* 指數列 */}
      {s.indices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular">
          {s.indices.map((idx) => {
            const t = trendOf(idx.changePct);
            return (
              <span key={idx.name} className="whitespace-nowrap">
                <span className="text-muted">{idx.name}</span>{" "}
                <span className={`font-semibold ${textColor[t]}`}>
                  {fmt(idx.price)} {arrowOf(t)} {fmtPct(idx.changePct)}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* 各股：當日幅｜本週累計（依當日漲跌幅排序） */}
      <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
        {s.rows.map((r) => {
          const t = trendOf(r.changePct);
          const w = trendOf(r.weekPct);
          return (
            <li
              key={r.stockId}
              className="flex items-baseline justify-between gap-3 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="font-serif font-medium text-ink">{r.name}</span>
                <span className="ml-1.5 font-mono text-[11px] text-muted tabular">
                  {r.stockId}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono tabular">
                <span className="text-ink">{fmt(r.price)}</span>
                <span className={`ml-2 font-semibold ${textColor[t]}`}>
                  {arrowOf(t)} {fmtPct(r.changePct)}
                </span>
                <span className={`ml-2 ${textColor[w]}`}>
                  週 {fmtPct(r.weekPct)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* 今日新出現的技術訊號 */}
      {signalRows.length > 0 && (
        <div className="mt-3 border-t border-dotted border-line pt-3">
          <h3 className="text-xs font-semibold text-ink">今日技術訊號</h3>
          <ul className="mt-1.5 space-y-1.5">
            {signalRows.map((r) => (
              <li key={r.stockId} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-serif text-ink">
                  {r.name}
                  <span className="ml-1 font-mono text-[11px] text-muted tabular">
                    {r.stockId}
                  </span>
                </span>
                {r.newSignals.map((sig) => (
                  <span
                    key={sig.kind}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${signalToneClass[sig.tone]}`}
                  >
                    {sig.label}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 最強最弱＋今日提醒 */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-dotted border-line pt-3 text-xs text-muted">
        {s.best && (
          <span>
            最強{" "}
            <span className="font-medium text-ink">{s.best.name}</span>{" "}
            <span className={`font-mono tabular ${textColor[trendOf(s.best.changePct)]}`}>
              {fmtPct(s.best.changePct)}
            </span>
          </span>
        )}
        {s.worst && (
          <span>
            最弱{" "}
            <span className="font-medium text-ink">{s.worst.name}</span>{" "}
            <span className={`font-mono tabular ${textColor[trendOf(s.worst.changePct)]}`}>
              {fmtPct(s.worst.changePct)}
            </span>
          </span>
        )}
        <span>今日觸發提醒 {s.alertHits} 則</span>
      </div>

      {/* 收尾細線：卡片 ring 很淡，內容結束處補一條細線明確收版（2026-07-19 使用者要求） */}
      <div aria-hidden="true" className="mt-3.5 h-px bg-line" />
    </section>
  );
}
