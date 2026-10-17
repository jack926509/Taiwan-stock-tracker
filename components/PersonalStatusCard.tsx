"use client";
import { useState } from "react";
import useSWR from "swr";
import type { PersonalStatus } from "@/lib/personalStatus";
import { formatQuoteAsOf, quoteSourceLabel } from "@/lib/quoteStatus";

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
  const finishedAt = formatQuoteAsOf(monitor?.finishedAt);
  return <section className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line" aria-label={monitorRows ? "後端提醒檢查" : "系統狀態與備份"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-balance font-serif text-base font-semibold text-ink">{monitorRows ? "後端提醒檢查" : "系統狀態與備份"}</h2>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" aria-label="重新整理系統狀態" disabled={isValidating} onClick={() => void mutate()} className="min-h-11 rounded-lg px-2 text-xs text-primary hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{isValidating ? "讀取中…" : "重新整理"}</button>
        <button type="button" aria-label="匯出備份：自選股與提醒設定" disabled={exporting} onClick={() => void exportBackup()} className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium text-primary hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{exporting ? "匯出中…" : "匯出備份"}</button>
      </div>
    </div>
    {exportError && <p role="alert" className="mt-2 text-pretty text-xs text-warn">{exportError}</p>}
    {error && <p role="alert" className="mt-2 text-pretty text-xs text-warn">狀態讀取失敗{data ? "，以下保留上次資料" : "，請稍後重試"}</p>}
    {!data && !error && <p role="status" className="mt-2 text-pretty text-xs text-muted">讀取狀態中…</p>}
    {data && <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-pretty">上次提醒檢查</p>
          <p className="mt-0.5 text-pretty text-sm font-medium tabular-nums text-ink">{monitor ? finishedAt ?? "時間未知" : "尚無檢查紀錄"}{finishedAt && <span className="ml-1 text-xs font-normal text-muted">（台北）</span>}</p>
        </div>
        {monitor?.outcome === "completed" && <span className="rounded-pill bg-surface-2 px-2 py-1 text-ink">上次已完成</span>}
        {monitor?.outcome === "failed" && <span role="status" className="rounded-pill bg-warn-tint px-2 py-1 text-warn">部分處理失敗</span>}
      </div>
      <p className="text-pretty">僅代表上次執行結果；休市期間不執行盤中檢查。</p>
      {monitor?.complete === false && <p role="status" className="text-pretty text-warn">上次行情批次不完整，部分提醒可能略過。</p>}
      {data.backfill && data.backfill.fail > 0 && <p role="status" className="text-pretty tabular-nums text-warn">最近 K 線補齊失敗 {data.backfill.fail} 檔。</p>}
      {data.backfill && data.backfill.pending !== null && data.backfill.pending > 0 && <p role="status" className="text-pretty tabular-nums">最近 K 線仍有 {data.backfill.pending} 檔待更新。</p>}
      {data.issues.map(issue => <p key={issue} role="status" className="text-pretty text-warn">{issue}</p>)}
      {monitorRows && monitor && <ul aria-label="各股上次提醒檢查結果" className="divide-y divide-line border-t border-line">
        {monitor.rows.map(row => <li key={row.stockId} className="py-2"><span className="font-medium text-ink">{row.name} <span className="tabular-nums">{row.stockId}</span></span><span className="mt-1 block text-pretty">{row.status}</span></li>)}
      </ul>}
    </div>}
    <div className="mt-3 border-t border-line">
      <details>
        <summary className="min-h-11 cursor-pointer rounded py-3 text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary">檢查明細與備份說明</summary>
        <div className="space-y-3 pb-1 text-xs leading-relaxed text-muted">
          {data && <>
            <p className="text-pretty"><span className="font-medium text-ink">上次行情</span>　{monitor ? `${monitor.source ? quoteSourceLabel(monitor.source) : "未取行情"}・${monitor.complete === null ? "完整性未確認" : monitor.complete ? "批次完整" : "批次不完整"}` : "尚無紀錄"}</p>
            <div>
              <p className="text-pretty"><span className="font-medium text-ink">LINE 通知</span>　{data.line.configured ? "已設定憑證" : "尚未設定憑證"}；設定完成不代表已送達。</p>
              <p className="mt-1 text-pretty tabular-nums">{data.line.usage ? `今日 ${data.line.usage.dayCount} / ${data.line.usage.dailyCap} 則，本月累計 ${data.line.usage.count} 則；含已保留但未確認的請求。` : "通知用量未知或尚未連接雲端儲存。"}</p>
            </div>
            <p className="text-pretty tabular-nums"><span className="font-medium text-ink">K 線補齊</span>　{data.backfill ? `${formatQuoteAsOf(data.backfill.ranAt) ?? "時間未知"}（台北）；資料已齊 ${data.backfill.ok} 檔、失敗 ${data.backfill.fail} 檔${data.backfill.pending === null ? "（舊版紀錄，未區分待更新）" : `、待更新 ${data.backfill.pending} 檔`}` : "尚無紀錄"}</p>
          </>}
          <p className="text-pretty"><span className="font-medium text-ink">匯出備份</span>　下載 JSON，包含自選股、分組、順序、提醒門檻及觸發時間。請自行妥善保存。</p>
        </div>
      </details>
    </div>
  </section>;
}
