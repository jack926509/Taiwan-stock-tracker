"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ALERT_KIND_LABEL, NOTIFICATION_LABEL, type PublicAlertEvent } from "@/lib/alertEventTypes";
import { taipeiNow } from "@/lib/market-hours";
import { fmt, fmtVol } from "@/lib/format";

interface HistoryResponse { date: string; total: number; offset: number; nextOffset: number | null; events: PublicAlertEvent[] }
async function fetcher(url: string): Promise<HistoryResponse> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("讀取提醒歷史失敗");
  return response.json();
}
const buttonClass = "min-h-11 rounded-pill border border-line px-4 text-xs disabled:opacity-40";
function timeLabel(at: string) {
  return new Date(at).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
}
function reasonLabel(reason: string | null | undefined): string | null {
  if (reason === "network") return "連線未確認，保留原識別重試";
  if (reason === "retry-expired") return "重試次數或等待時間已達上限";
  if (reason === "usage-unavailable") return "用量紀錄暫時無法確認";
  if (reason?.match(/^http-[45]\d{2}$/)) return `LINE 回應 ${reason.slice(5)}`;
  return null;
}

export default function AlertHistory() {
  const [date,setDate] = useState("");
  const [offset,setOffset] = useState(0);
  useEffect(()=>setDate(taipeiNow().isoDate),[]);
  const {data,error,isLoading,mutate} = useSWR<HistoryResponse>(date ? `/api/alert-history?date=${date}&offset=${offset}` : null,fetcher,{refreshInterval:60_000});
  return <section aria-labelledby="alert-history-title" className="mt-6 space-y-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="alert-history-title" className="font-serif text-base font-semibold">提醒歷史</h2>
      <label className="flex items-center gap-2 text-xs text-muted">日期
        <input type="date" value={date} onChange={event=>{setDate(event.target.value);setOffset(0);}}
          className="min-h-11 min-w-0 rounded-lg border border-line bg-app px-2 text-ink" />
      </label>
    </div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-warn">
      暫時無法讀取提醒歷史<button type="button" className={buttonClass} onClick={()=>void mutate()}>重試</button>
    </div> : !date ? <p className="text-sm text-muted">請選擇查詢日期</p>
      : isLoading ? <p className="text-sm text-muted">載入提醒歷史…</p>
      : data?.events.length === 0 ? <p className="text-sm text-muted">這一天沒有已記錄的提醒事件</p>
      : <div className="divide-y divide-line">{data?.events.map(event=><article key={event.id} className="space-y-1.5 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/stock/${event.stockId}`} className="font-semibold text-ink">{event.stockId} {event.name}</Link>
          <time dateTime={event.triggeredAt} className="font-mono text-xs text-muted">{timeLabel(event.triggeredAt)}</time>
        </div>
        <p className="text-xs text-muted">{ALERT_KIND_LABEL[event.kind]} {event.kind === "volume" ? `${fmtVol(event.threshold)} 張均量 × 2`
          : event.kind === "change" ? `${event.threshold}%` : fmt(event.threshold)}・觸發價 {fmt(event.price)}</p>
        <p className={`text-xs ${event.notification.state === "accepted" ? "text-muted" : "text-warn"}`}>
          {NOTIFICATION_LABEL[event.notification.state]}{event.notification.attempts > 0 ? `・已嘗試 ${event.notification.attempts} 次` : ""}
        </p>
        {reasonLabel(event.notification.reason) && <p className="text-xs text-muted">{reasonLabel(event.notification.reason)}</p>}
      </article>)}</div>}
    {data && data.total > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>共 {data.total} 筆</span><div className="flex gap-2">
        <button type="button" className={buttonClass} disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>上一頁</button>
        <button type="button" className={buttonClass} disabled={data.nextOffset===null} onClick={()=>{if(data.nextOffset!==null)setOffset(data.nextOffset);}}>下一頁</button>
      </div>
    </div>}
    <p className="text-xs leading-relaxed text-muted">記錄從啟用歷史功能後開始保留。LINE 已接受代表服務接受請求，無法確認是否送達或已讀。</p>
  </section>;
}
