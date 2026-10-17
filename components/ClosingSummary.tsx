"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { taipeiNow } from "@/lib/market-hours";
import type { DailySummaryData } from "@/lib/summaryData";
import type { Signal } from "@/lib/signals";
import { fmt, fmtPct, trendOf, arrowOf, textColor } from "@/lib/format";
import { formatQuoteAsOf, quoteSourceLabel } from "@/lib/quoteStatus";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const signalToneClass: Record<Signal["tone"], string> = {
  neutral: "bg-line/35 text-muted",
  up: "bg-up-tint text-up-strong",
  down: "bg-down-tint text-down",
};

// 保存的每日快照按日期查詢；今日尚未保存時，明確區分即時暫覽。
export default function ClosingSummary() {
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    const current = taipeiNow().isoDate; setDate(current); setToday(current);
    const timer = setInterval(() => setToday(taipeiNow().isoDate), 60_000);
    return () => clearInterval(timer);
  }, []);
  const saved = useSWR<{ summary: DailySummaryData | null; savedAt: string | null }>(
    date ? `/api/summary?date=${date}` : null, fetcher, { refreshInterval: date === today ? 60_000 : 0, shouldRetryOnError: false }
  );
  const preview = useSWR<{ summary: DailySummaryData | null }>(
    date && date === today && saved.data && !saved.data.summary && !saved.error ? "/api/summary" : null, fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );
  const summary = saved.data?.summary ?? (date === today ? preview.data?.summary : null);
  return <section aria-label="收盤回顧" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-serif text-base font-semibold text-ink">收盤回顧</h2>
      <label className="flex min-w-0 items-center gap-2 text-xs text-muted">查詢日期
        <input type="date" aria-label="收盤回顧日期" max={today || undefined} value={date} onChange={event => setDate(event.target.value)} className="min-h-11 min-w-0 rounded-lg border border-line bg-app px-2 text-ink" />
      </label>
    </div>
    {saved.error || preview.error ? <p role="alert" className="mt-2 text-xs text-warn">收盤紀錄暫時無法讀取<button type="button" onClick={() => { void saved.mutate(); void preview.mutate(); }} className="ml-2 min-h-11 px-2 text-primary">重試</button></p>
      : !date ? <p className="mt-2 text-xs text-muted">請選擇查詢日期</p>
      : saved.isLoading || preview.isLoading ? <p className="mt-2 text-xs text-muted">讀取收盤紀錄中…</p>
      : saved.data?.savedAt ? <p className="mt-2 text-xs leading-relaxed text-muted">保存於 {formatQuoteAsOf(saved.data.savedAt)}（台北）。內容維持當時自選清單與行情。</p>
      : <p className="mt-2 text-xs leading-relaxed text-muted">這一天尚無保存的收盤紀錄。{summary ? "以下為今日暫覽，尚未保存。" : "紀錄從功能啟用後的收盤排程開始保留，不回填過往行情。"}</p>}
    {summary && !saved.error && !preview.error && <SummaryDetails s={summary} />}
  </section>;
}
function SummaryDetails({ s }: { s: DailySummaryData }) {
  const signalRows = s.rows.filter((r) => r.newSignals.length > 0);
  const dateLabel = `${s.date.slice(5, 7)}/${s.date.slice(8, 10)}`;
  const quoteDateLabel = formatQuoteAsOf(s.asOf);
  const sourceLabel = quoteSourceLabel(s.source);
  const quoteTimeLabel = s.source === "tpex" ? "製表時間" : s.source === "mixed" ? "資料時間" : "行情時間";

  return (
    <div className="mt-4" aria-label="收盤總覽內容">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-base font-semibold text-ink">
          當日漲跌概況
          <span className="ml-2 font-mono text-xs font-normal text-muted tabular">
            {dateLabel}
          </span>
        </h3>
        <span className="font-mono text-xs text-muted tabular">
          漲 {s.counts.up}・跌 {s.counts.down}・平 {s.counts.flat}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        來源：{sourceLabel}・{quoteDateLabel ? `${quoteTimeLabel}：${quoteDateLabel}（台北）` : "行情日期時間未知"}
      </p>
      {s.complete !== true && (
        <p role="status" className="mt-2 rounded bg-warn-tint px-2 py-1.5 text-xs leading-relaxed text-warn">
          部分股票或指數缺少當日有效行情；漲跌、排名及訊號僅依已取得資料計算。
        </p>
      )}

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
                <span className="ml-1.5 font-mono text-xs text-muted tabular">
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
                  <span className="ml-1 font-mono text-xs text-muted tabular">
                    {r.stockId}
                  </span>
                </span>
                {r.newSignals.map((sig) => (
                  <span
                    key={sig.kind}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${signalToneClass[sig.tone]}`}
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
        <span>當日已記錄提醒 {s.alertHits} 則</span>
      </div>

      {/* 收尾細線：卡片 ring 很淡，內容結束處補一條細線明確收版（2026-07-19 使用者要求） */}
      <div aria-hidden="true" className="mt-3.5 h-px bg-line" />
    </div>
  );
}
