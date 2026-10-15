import { listPersonalRecords } from "@/lib/personalRecords";
import { taipeiDateRange } from "@/lib/personalDates";
export async function countAlertEvents(date: string): Promise<number> {
  const range = taipeiDateRange(date);
  if (!range) throw new Error("日期格式不正確");
  return (await listPersonalRecords("alert:event:", { ...range, offset: 0, limit: 1 })).total;
}
