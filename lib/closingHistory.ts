import { buildSummaryData, type DailySummaryData } from "@/lib/summaryData";
import { loadPersonalRecord, createPersonalRecord, listPersonalRecords } from "@/lib/personalRecords";
import { taipeiNow } from "@/lib/market-hours";
import { taipeiDateRange } from "@/lib/personalDates";
import { countAlertEvents } from "@/lib/alertHistory";
export interface ClosingSnapshot { v: 1; savedAt: string; summary: DailySummaryData }
const PREFIX = "personal:closing:";

function validateSnapshot(snapshot: ClosingSnapshot, date: string): ClosingSnapshot {
  if (!taipeiDateRange(date) || snapshot?.v !== 1 || snapshot.summary?.date !== date
    || typeof snapshot.savedAt !== "string" || !Number.isFinite(new Date(snapshot.savedAt).getTime())) {
    throw new Error("收盤紀錄格式不正確");
  }
  return snapshot;
}

export async function loadClosingSummary(date: string): Promise<ClosingSnapshot | null> {
  if (!taipeiDateRange(date)) throw new Error("日期格式不正確");
  const record = await loadPersonalRecord<ClosingSnapshot>(`${PREFIX}${date}`);
  return record ? validateSnapshot(record.data, date) : null;
}
/** 最新指快照的交易日期，不以較晚寫入的舊紀錄取代；此查詢不建立或更新資料。 */
export async function loadLatestClosingSummary(): Promise<ClosingSnapshot | null> {
  const { items } = await listPersonalRecords<ClosingSnapshot>(PREFIX, { limit: 1, orderBy: "key" });
  const record = items[0];
  if (!record) return null;
  if (!record.key.startsWith(PREFIX)) throw new Error("收盤紀錄格式不正確");
  return validateSnapshot(record.data, record.key.slice(PREFIX.length));
}
/** 僅由已通過交易日檢查的收盤排程呼叫；保存當時資料與來源，不補造過去行情。 */
export async function captureClosingSummary(now = new Date()): Promise<ClosingSnapshot | null> {
  const t = taipeiNow(now);
  if (t.minutes < 13 * 60 + 35) return null;
  const existing = await loadClosingSummary(t.isoDate);
  if (existing) return existing;
  const summary = await buildSummaryData(now, { fresh: true });
  if (!summary || summary.date !== t.isoDate) return null;
  const snapshot: ClosingSnapshot = { v: 1, savedAt: now.toISOString(), summary: {
    ...summary, alertHits: await countAlertEvents(t.isoDate),
  } };
  await createPersonalRecord(`${PREFIX}${t.isoDate}`, snapshot, now);
  return loadClosingSummary(t.isoDate);
}
