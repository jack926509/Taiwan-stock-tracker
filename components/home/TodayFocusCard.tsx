"use client";
import Link from "next/link";
import type { WatchlistItem, Quote, QuoteSource } from "@/lib/types";
import { buildTodayFocus } from "@/lib/todayFocus";
export default function TodayFocusCard({ items, quotes, source, date, events, countError }: {
  items: WatchlistItem[]; quotes: Quote[]; source?: QuoteSource; date: string | null; events: number | null; countError: boolean;
}) {
  const focus = buildTodayFocus(items, quotes, date);
  return <section aria-label="今日重點" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line">
    <div className="flex items-baseline justify-between gap-2"><h2 className="font-serif text-base font-semibold text-ink">今日重點</h2><span className="font-mono text-xs text-muted">{date ?? "台北時間"}</span></div>
    <p className="mt-2 text-sm text-ink">已記錄提醒 {events ?? "—"} 則 <Link href="/alerts" className="ml-2 text-xs text-primary underline">查看觸發與通知結果</Link></p>
    {countError && <p role="status" className="mt-1 text-xs text-warn">今日提醒數讀取失敗，請稍後重試</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div><h3 className="text-xs font-semibold text-muted">最接近的未觸發到價條件</h3>
        <ul className="mt-1 space-y-1 text-xs">{focus.near.map(row => <li key={row.stockId}><Link href={`/stock/${row.stockId}`} className="text-ink">{row.name} {row.stockId}</Link><span className="ml-2 text-muted">{row.distance === 0 ? "參考價已越過，仍以後端事件為準" : `距門檻 ${(row.distance * 100).toFixed(2)}%`}</span></li>)}</ul>
        {!focus.near.length && <p className="mt-1 text-xs text-muted">尚無可計算的到價條件</p>}
        <p className="mt-1 text-xs leading-relaxed text-muted">依畫面報價估算{source === "yahoo" ? "，目前為 Yahoo 備援" : source === "stale" ? "，目前為舊快照" : ""}，不代表提醒已觸發。</p>
      </div>
      <div><h3 className="text-xs font-semibold text-muted">資料待確認 {focus.anomalies.length} 檔</h3>
        <ul className="mt-1 space-y-1 text-xs text-warn">{focus.anomalies.map(row => <li key={row.stockId}>{row.name} {row.stockId}・{row.reason}</li>)}</ul>
        {!focus.anomalies.length && <p className="mt-1 text-xs text-muted">目前未發現缺價或日期異常</p>}
      </div>
    </div>
  </section>;
}
