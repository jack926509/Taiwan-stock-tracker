import { buildSummaryData, type DailySummaryData } from "@/lib/summaryData";
import { loadPersonalRecord, createPersonalRecord } from "@/lib/personalRecords";
import { taipeiNow } from "@/lib/market-hours";
import { taipeiDateRange } from "@/lib/personalDates";
import { countAlertEvents } from "@/lib/alertHistory";
export interface ClosingSnapshot { v: 1; savedAt: string; summary: DailySummaryData }
const PREFIX = "personal:closing:";

export async function loadClosingSummary(date: string): Promise<ClosingSnapshot | null> {
  if (!taipeiDateRange(date)) throw new Error("日期格式不正確");
  const record = await loadPersonalRecord<ClosingSnapshot>(`${PREFIX}${date}`);
  if (record && (record.data.v !== 1 || record.data.summary.date !== date)) throw new Error("收盤紀錄格式不正確");
  return record?.data ?? null;
}
/** 僅由已通過交易日檢查的收盤排程呼叫；保存當時資料與來源，不補造過去行情。 */
export async function captureClosingSummary(now = new Date()): Promise<ClosingSnapshot | null> {
  const t = taipeiNow(now);
  if (t.minutes < 13 * 60 + 35) return null;
  const existing = await loadClosingSummary(t.isoDate);
  if (existing) return existing;
  const summary = await buildSummaryData(now);
  if (!summary || summary.date !== t.isoDate) return null;
  const snapshot: ClosingSnapshot = { v: 1, savedAt: now.toISOString(), summary: {
    ...summary, alertHits: await countAlertEvents(t.isoDate),
  } };
  await createPersonalRecord(`${PREFIX}${t.isoDate}`, snapshot, now);
  return loadClosingSummary(t.isoDate);
}
