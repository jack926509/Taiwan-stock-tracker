import { loadPersonalRecord, savePersonalRecord, serialPersonalWrite } from "@/lib/personalRecords";
import type { AlertMonitorSnapshot } from "@/lib/alertMonitor";
const KEY="personal:alert-monitor";
export async function saveAlertMonitor(snapshot:AlertMonitorSnapshot):Promise<void> {
  await serialPersonalWrite(()=>savePersonalRecord(KEY,snapshot,new Date(snapshot.finishedAt)));
}
export async function loadAlertMonitor():Promise<AlertMonitorSnapshot|null> {
  const record=await loadPersonalRecord<AlertMonitorSnapshot>(KEY);
  if(record&&record.data.v!==1)throw new Error("後端檢查紀錄格式不相容");
  return record?.data??null;
}
