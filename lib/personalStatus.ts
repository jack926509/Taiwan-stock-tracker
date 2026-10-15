import { listWatchlist } from "@/lib/store";
import { loadAlertMonitor } from "@/lib/alertMonitorStore";
import { alertMonitorLabel } from "@/lib/alertMonitor";
import { getLineUsage, lineConfigured } from "@/lib/notify";
import { loadPersonalRecord } from "@/lib/personalRecords";
import type { BackfillRecord } from "@/lib/status";

export async function buildPersonalStatus() {
  const [watch, monitor, usage, backfill] = await Promise.allSettled([
    listWatchlist(), loadAlertMonitor(), getLineUsage(), loadPersonalRecord<BackfillRecord>("meta:backfill"),
  ]);
  const issues: string[] = [];
  if (watch.status === "rejected") issues.push("自選清單讀取失敗");
  if (monitor.status === "rejected") issues.push("後端檢查紀錄讀取失敗");
  if (usage.status === "rejected") issues.push("LINE 用量讀取失敗");
  if (backfill.status === "rejected") issues.push("K 線補齊紀錄讀取失敗");
  const m = monitor.status === "fulfilled" ? monitor.value : null;
  const u = usage.status === "fulfilled" ? usage.value : null;
  const b = backfill.status === "fulfilled" ? backfill.value?.data : null;
  return {
    checkedAt: new Date().toISOString(),
    monitor: m ? {
      finishedAt: m.finishedAt, outcome: m.outcome, source: m.source, complete: m.complete,
      rows: (watch.status === "fulfilled" ? watch.value : []).map(row => ({
        stockId: row.stock_id, name: row.name, status: alertMonitorLabel(m.rows[row.stock_id], row.alert_versions),
      })),
    } : null,
    line: { configured: lineConfigured(), usage: u ? {
      day: u.day, month: u.month, count: u.count, dayCount: u.dayCount, dailyCap: u.dailyCap,
    } : null },
    backfill: b ? { ranAt: b.ranAt, ok: b.ok, fail: b.fail, pending: b.pending ?? null } : null,
    issues,
  };
}
export type PersonalStatus = Awaited<ReturnType<typeof buildPersonalStatus>>;

export async function buildPersonalBackup(now = new Date()) {
  const items = await listWatchlist();
  return { v: 1, exportedAt: now.toISOString(), timezone: "Asia/Taipei", items: items.map(row => ({
    stock_id: row.stock_id, market: row.market, name: row.name, group_name: row.group_name, sort_order: row.sort_order,
    alert_high: row.alert_high, alert_low: row.alert_low, alert_change_pct: row.alert_change_pct, alert_volume_on: row.alert_volume_on,
    alert_high_hit_at: row.alert_high_hit_at, alert_low_hit_at: row.alert_low_hit_at,
    alert_change_hit_at: row.alert_change_hit_at, alert_volume_hit_at: row.alert_volume_hit_at,
  })) };
}
