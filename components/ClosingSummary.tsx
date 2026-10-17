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

interface SummaryResponse { summary: DailySummaryData | null; savedAt: string | null }

// null 表示追蹤最近保存紀錄；手動選定的日期不受背景輪詢影響。
export default function ClosingSummary() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(taipeiNow().isoDate);
    const timer = setInterval(() => setToday(taipeiNow().isoDate), 60_000);
    return () => clearInterval(timer);
  }, []);
  const latest = useSWR<SummaryResponse>("/api/summary?latest=1", fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false });
  const date = selectedDate ?? latest.data?.summary?.date ?? today;
  const saved = useSWR<SummaryResponse>(
    selectedDate ? `/api/summary?date=${selectedDate}` : null, fetcher,
    { refreshInterval: selectedDate === today ? 60_000 : 0, shouldRetryOnError: false }
  );
  const activeSaved = selectedDate === null ? latest : saved;
  const canPreview = Boolean(date && date === today && activeSaved.data?.summary === null && !activeSaved.error);
  const preview = useSWR<{ summary: DailySummaryData | null }>(
    canPreview ? "/api/summary" : null, fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );
  const summary = activeSaved.data?.summary ?? (canPreview ? preview.data?.summary : null);
  const wrongDate = (activeSaved.data?.summary && activeSaved.data.summary.date !== date)
    || (canPreview && preview.data?.summary && preview.data.summary.date !== today);
  const hasError = activeSaved.error || (canPreview && preview.error) || wrongDate;
  const isLoading = activeSaved.isLoading || (!activeSaved.data && selectedDate !== "")
    || (canPreview && !preview.data && !preview.error) || (!today && !summary);
  const noHistory = latest.data?.summary === null;
  const isPreview = Boolean(summary && !activeSaved.data?.savedAt);
  const reload = () => {
    void activeSaved.mutate();
    if (canPreview) void preview.mutate();
  };
  const dateButtonClass = "min-h-11 rounded-lg px-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return <section aria-label="收盤回顧" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 className="font-serif text-base font-semibold text-ink text-balance">收盤回顧</h2>
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg bg-app ring-1 ring-line">
          <button type="button" aria-pressed={selectedDate === null} onClick={() => setSelectedDate(null)} className={`${dateButtonClass} ${selectedDate === null ? "bg-surface text-primary shadow-sm" : "text-muted"}`}>最近一筆</button>
          <button type="button" aria-pressed={selectedDate === today} disabled={!today} onClick={() => setSelectedDate(today)} className={`${dateButtonClass} ${selectedDate === today ? "bg-surface text-primary shadow-sm" : "text-muted"} disabled:opacity-50`}>今天</button>
        </div>
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted"><span className="sr-only">查詢日期</span>
          <input type="date" aria-label="收盤回顧日期" max={today || undefined} value={date} onChange={event => setSelectedDate(event.target.value)} className="min-h-11 w-[9.5rem] min-w-0 max-w-full rounded-lg border border-line bg-app px-2 text-xs text-ink tabular-nums" />
        </label>
      </div>
    </div>
    {hasError ? <p role="alert" className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-warn">收盤紀錄暫時無法讀取<button type="button" onClick={reload} className="min-h-11 px-2 text-primary">重試</button></p>
      : selectedDate === "" ? <p className="mt-3 text-xs text-muted">請選擇查詢日期</p>
      : isLoading ? <p role="status" className="mt-3 text-xs text-muted">讀取收盤紀錄中…</p>
      : activeSaved.data?.savedAt ? <p className="mt-3 text-xs leading-relaxed text-muted tabular-nums">保存於 {formatQuoteAsOf(activeSaved.data.savedAt)}（台北）</p>
      : isPreview ? <p className="mt-3 text-xs leading-relaxed text-warn">今日暫覽，尚未保存。</p>
      : <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="text-xs leading-relaxed text-muted text-pretty">
          <p className="font-medium text-ink">{noHistory ? "尚無收盤紀錄" : "這一天沒有保存紀錄"}</p>
          <p>{noHistory ? "第一筆收盤紀錄保存後，會自動顯示於此。" : "可切換至最近一筆，或選擇其他日期。"}</p>
        </div>
        {noHistory && <button type="button" onClick={reload} className="min-h-11 px-2 text-xs font-medium text-primary">重新讀取</button>}
      </div>}
    {summary && !hasError && !isLoading && selectedDate !== "" && <SummaryDetails s={summary} />}
    <details className="mt-2 text-xs text-muted">
      <summary className="min-h-11 cursor-pointer content-center select-none">紀錄說明</summary>
      <p className="pb-1 leading-relaxed text-pretty">從功能啟用後的收盤排程開始保存，不回填過往行情。已保存的紀錄保留當時自選清單與行情；今日暫覽會更新，尚未存入歷史。</p>
    </details>
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
