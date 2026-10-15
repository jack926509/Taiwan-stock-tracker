import { captureClosingSummary } from "@/lib/closingHistory";
import { dailySummary } from "@/lib/daily-summary";
/** 保存摘要與通知互相獨立；LINE 未設定也會留下當日紀錄。 */
export async function runDailyClose(now = new Date()): Promise<boolean> {
  let storageFailed = false;
  try { await captureClosingSummary(now); } catch { storageFailed = true; }
  const sent = await dailySummary(now);
  if (storageFailed) throw new Error("收盤摘要保存失敗");
  return sent;
}
