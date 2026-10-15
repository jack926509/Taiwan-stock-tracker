import type { AlertKind } from "./alertLogic.ts";
import type { QuoteSource } from "./types.ts";
export type AlertCheckStatus="not-set"|"inactive"|"pending"|"checked"|"triggered"|"reference-only"|"incomplete"|"source-error"|"not-traded"|"invalid-quote"|"quote-expired"|"partial"|"storage-error"|"changed";
export interface AlertCheckRow {status:AlertCheckStatus;captured:number;versions:Partial<Record<AlertKind,string>>;unavailable?:AlertKind[]}
export interface AlertMonitorSnapshot {
  v:1;startedAt:string;finishedAt:string;outcome:"completed"|"failed";source:QuoteSource|null;complete:boolean|null;
  rows:Record<string,AlertCheckRow>;
}
const LABELS:Record<AlertCheckStatus,string>={
  "not-set":"尚未設定條件",inactive:"條件已觸發，等待重新啟用或隔日檢查",pending:"本次尚未完成檢查",
  checked:"已檢查，尚未觸發",triggered:"已記錄觸發", "reference-only":"本輪為參考來源，未判定新觸發",
  incomplete:"本輪報價不完整，略過新觸發","source-error":"行情來源無法取得","not-traded":"尚未實際成交",
  "invalid-quote":"價格或市場資料無效","quote-expired":"行情時間未知、過舊或不屬當日",
  partial:"部分條件資料不足，其餘已檢查","storage-error":"部分事件保存失敗",changed:"設定或觸發狀態已變更，待下次檢查",
};
export function alertMonitorLabel(row:AlertCheckRow|undefined,current:Partial<Record<AlertKind,string>>={}):string {
  if(!row)return "尚無這檔股票的後端檢查紀錄";
  if((["high","low","change","volume"] as AlertKind[]).some(kind=>(current[kind]??"initial")!==(row.versions[kind]??"initial")))return "設定已更新，等待下次檢查";
  return `${row.captured>0&&row.status!=="triggered"?`已記錄 ${row.captured} 項；`:""}${LABELS[row.status]}`;
}
