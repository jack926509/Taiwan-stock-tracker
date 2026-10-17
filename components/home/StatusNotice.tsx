"use client";

import { buildTodayFocus } from "@/lib/todayFocus";
import { quoteWarnings } from "@/lib/quoteStatus";
import type { QuoteResponse, WatchlistItem } from "@/lib/types";

// 首頁頂部提示：所有警告收成「一行摘要」，點開 <details> 才看完整說明。
// 沒有任何警告時整塊不渲染。
export default function StatusNotice({
  data, items, todayDate, autoPaused, localStorageMode, fetchError, countError,
}: {
  data: QuoteResponse | undefined;
  items: WatchlistItem[];
  todayDate: string | null;
  autoPaused: boolean;
  localStorageMode: boolean;
  fetchError: boolean;
  countError: boolean;
}) {
  const warnings = data ? quoteWarnings(data) : [];
  // 沒有行情時不算異常清單，避免載入中把整份自選都列成缺漏
  const anomalies = data ? buildTodayFocus(items, data.quotes, data.expectedQuoteDate ?? todayDate).anomalies : [];
  const missingPrices = anomalies.filter(row => row.kind === "missing-price");
  const uncertainQuotes = anomalies.filter(row => row.kind !== "missing-price");
  const incomplete = Boolean(data) && data!.complete !== true;

  const labels: string[] = [];
  if (data?.source === "yahoo") labels.push("Yahoo 備援報價");
  else if (data?.source === "stale") labels.push("舊報價快照");
  else if (data?.source === "tpex") labels.push("興櫃參考行情");
  else if (data?.source === "mixed") labels.push("混合來源（含參考行情）");
  if (missingPrices.length > 0) {
    const names = missingPrices.slice(0, 2).map((row) => `${row.name} ${row.stockId}`).join("、");
    labels.push(`報價缺漏 ${missingPrices.length} 檔：${names}${missingPrices.length > 2 ? " 等" : ""}`);
  } else if (incomplete) {
    // complete 同時涵蓋指數，不能因自選股都有價格就隱藏批次缺漏。
    labels.push("批次報價缺漏");
  }
  if (uncertainQuotes.length > 0) {
    const names = uncertainQuotes.slice(0, 2).map((row) => `${row.name} ${row.stockId}`).join("、");
    labels.push(`資料待確認 ${uncertainQuotes.length} 檔：${names}${uncertainQuotes.length > 2 ? " 等" : ""}`);
  }
  if (warnings.length > 0 && !labels.length) {
    labels.push("行情時間未知");
  }
  if (autoPaused) labels.push("已暫停輪詢");
  if (localStorageMode) labels.push("本地測試模式");
  if (fetchError) labels.push("資料更新失敗");
  if (countError) labels.push("提醒數讀取失敗");
  if (labels.length === 0) return null;

  return (
    <details className="group pt-4 text-xs">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-card bg-warn-tint px-3 text-warn focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">⚠</span>
        <span className="min-w-0 flex-1 truncate">{labels.join(" ・ ")}</span>
        <span className="shrink-0 underline group-open:hidden">詳情</span>
        <span className="hidden shrink-0 underline group-open:inline">收合</span>
      </summary>
      <ul role="status" className="mt-1 space-y-1 rounded-card bg-warn-tint px-3 py-2 leading-relaxed text-warn">
        {warnings.map((text) => <li key={text}>{text}</li>)}
        {anomalies.map((row) => <li key={row.stockId}>{row.name} {row.stockId}・{row.reason}</li>)}
        {autoPaused && <li>報價久未更新，已暫停輪詢（切回分頁自動恢復）。</li>}
        {localStorageMode && <li>本地測試模式（自選股存於本機，未連 Supabase）。</li>}
        {fetchError && (
          <li>{data ? "資料更新失敗，畫面保留先前資料，稍後會自動重試。" : "行情或自選清單暫時無法載入，稍後會自動重試，也可按立即更新。"}</li>
        )}
        {countError && <li>今日提醒數讀取失敗，請稍後重試。</li>}
      </ul>
    </details>
  );
}
