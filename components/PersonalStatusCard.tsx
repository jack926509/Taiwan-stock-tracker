"use client";
import { useState } from "react";
import useSWR from "swr";
import type { PersonalStatus } from "@/lib/personalStatus";
import { formatQuoteAsOf } from "@/lib/quoteStatus";

async function fetcher(url: string): Promise<PersonalStatus> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("系統狀態讀取失敗");
  return response.json();
}
export default function PersonalStatusCard({ monitorRows = false }: { monitorRows?: boolean }) {
  const { data, error, mutate, isValidating } = useSWR("/api/personal-status", fetcher, { refreshInterval: 60_000, revalidateOnFocus: true });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportBackup() {
    setExporting(true); setExportError("");
    try {
      const response = await fetch("/api/personal-backup", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "twstock-personal-backup.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError("匯出失敗，請稍後再試"); }
    finally { setExporting(false); }
  }
  const monitor = data?.monitor;
  return <section className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line" aria-label={monitorRows ? "後端提醒檢查" : "系統狀態與備份"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-serif text-base font-semibold text-ink">{monitorRows ? "後端提醒檢查" : "系統狀態與備份"}</h2>
      <button type="button" disabled={isValidating} onClick={() => void mutate()} className="min-h-11 rounded px-3 text-xs text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">重新讀取狀態</button>
    </div>
    {error && <p role="alert" className="text-xs text-warn">狀態讀取失敗{data ? "，以下保留上次資料" : "，請稍後重試"}</p>}
    {!data && !error && <p className="text-xs text-muted">讀取狀態中…</p>}
    {data && <div className="space-y-2 text-xs leading-relaxed text-muted">
      <p>最近完成提醒檢查：{monitor ? `${formatQuoteAsOf(monitor.finishedAt) ?? "時間未知"}（台北）・${monitor.outcome === "completed" ? "本輪完成" : "部分處理失敗"}` : "尚無紀錄"}</p>
      {monitor && <p>本輪行情：{monitor.source === "mis" ? "MIS" : monitor.source === "yahoo" ? "Yahoo 參考來源" : monitor.source === "stale" ? "舊快照" : "未取行情"}{monitor.complete === null ? "" : monitor.complete ? "・批次完整" : "・批次不完整"}</p>}
      <p>這是上次執行的紀錄，不代表目前持續檢查。休市期間不執行盤中檢查。</p>
      {monitorRows && monitor && <ul className="divide-y divide-line border-t border-line">
        {monitor.rows.map(row => <li key={row.stockId} className="py-2"><span className="font-medium text-ink">{row.name} {row.stockId}</span><span className="mt-1 block">{row.status}</span></li>)}
      </ul>}
      <details>
        <summary className="cursor-pointer py-2 text-ink">LINE 用量與 K 線補齊</summary>
        <p>LINE：{data.line.configured ? "已設定憑證" : "尚未設定憑證"}（設定完成不代表已送達）</p>
        <p>{data.line.usage ? `今日 ${data.line.usage.dayCount} / ${data.line.usage.dailyCap} 則，本月累計 ${data.line.usage.count} 則；含已保留但未確認的請求。` : "通知用量未知或尚未連接雲端儲存。"}</p>
        <p className="mt-1">最近 K 線補齊：{data.backfill ? `${formatQuoteAsOf(data.backfill.ranAt)}（台北）；資料已齊 ${data.backfill.ok} 檔、失敗 ${data.backfill.fail} 檔${data.backfill.pending === null ? "（舊版紀錄，未區分待更新）" : `、待更新 ${data.backfill.pending} 檔`}` : "尚無紀錄"}</p>
      </details>
      {data.issues.map(issue => <p key={issue} role="status" className="text-warn">{issue}</p>)}
    </div>}
    <div className="mt-3 border-t border-line pt-3">
      <button type="button" disabled={exporting} onClick={() => void exportBackup()} className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{exporting ? "匯出中…" : "匯出自選股與提醒設定"}</button>
      <p className="mt-1 text-xs leading-relaxed text-muted">下載 JSON 備份，包含分組、順序、提醒門檻及觸發時間。請自行妥善保存。</p>
      {exportError && <p role="alert" className="mt-1 text-xs text-warn">{exportError}</p>}
    </div>
  </section>;
}
