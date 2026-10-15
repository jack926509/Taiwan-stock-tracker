// 到價／漲跌幅／爆量提醒檢查器：盤中由常駐排程每分鐘呼叫一次。
// 到價提醒：穿越門檻時交易保存事件與觸發時間，通知由佇列另行發送及重試。
// 漲跌幅／爆量提醒：語意不同——每日一次性，只要 hit_at 不是「今天」就視為可再觸發，跨日自動重新武裝，不需使用者手動重設。
import { listWatchlist, type WatchItem } from "@/lib/store";
import { fetchQuotes } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { captureAlertEvent } from "@/lib/alertEvents";
import { deliverAlertEvents } from "@/lib/alertDelivery";
import { isArmed, decideAlerts, hitToday, type AlertKind } from "@/lib/alertLogic";
import { isSameTaipeiDay } from "@/lib/market-hours";
import { logApiError } from "@/lib/apiErrors";
import { saveAlertMonitor } from "@/lib/alertMonitorStore";
import type { AlertMonitorSnapshot } from "@/lib/alertMonitor";
import { hasAnyAlert } from "@/lib/alertBadge";

const MAX_ALERT_QUOTE_AGE_MS = 120_000;

// 取得報價成功不代表行情仍新鮮；使用來源提供的行情時間，缺漏、跨台北日期、過舊或未來時間都不通知。
function isFreshQuoteTime(asOf: string | null | undefined, checkedAt: number): boolean {
  const timestamp = typeof asOf === "string" ? Date.parse(asOf) : NaN;
  return Number.isFinite(timestamp) && timestamp <= checkedAt &&
    checkedAt - timestamp <= MAX_ALERT_QUOTE_AGE_MS &&
    isSameTaipeiDay(new Date(timestamp), new Date(checkedAt));
}

// 近 5 日均量（張）；日 K 快取缺料或不足 5 根回 null（不誤報）
async function avgVolume5d(stockId: string): Promise<number | null> {
  const candles = await loadKline(stockId);
  if (candles.length < 5) return null;
  const last5 = candles.slice(-5);
  const sum = last5.reduce((s, c) => s + c.volume, 0);
  return sum / 5;
}

// 回傳本次推播筆數
export async function checkAlerts(now: Date = new Date()): Promise<number> {
  const at=new Date(Date.now()).toISOString();
  const snapshot:AlertMonitorSnapshot={v:1,startedAt:at,finishedAt:at,outcome:"completed",source:null,complete:null,rows:{}};
  try {return await runAlertCheck(now,snapshot);}
  catch(error){snapshot.outcome="failed";throw error;}
  finally {snapshot.finishedAt=new Date(Date.now()).toISOString();await saveAlertMonitor(snapshot);}
}

async function runAlertCheck(now:Date,snapshot:AlertMonitorSnapshot):Promise<number> {
  const items = await listWatchlist();
  for(const row of items)snapshot.rows[row.stock_id]={status:hasAnyAlert(row)?"inactive":"not-set",captured:0,versions:{...row.alert_versions}};
  const armed = items.filter((i: WatchItem) => isArmed(i, now));
  for(const row of armed)snapshot.rows[row.stock_id].status="pending";
  if (armed.length === 0) return deliverAlertEvents(new Date(Date.now()));

  let result;
  try {
    result = await fetchQuotes(armed.map((i) => ({ stockId: i.stock_id, market: i.market })));
  } catch(error) {
    for(const row of armed)snapshot.rows[row.stock_id].status="source-error";
    logApiError("alerts quote",error);
    try { await deliverAlertEvents(new Date(Date.now())); }
    finally { throw new Error("取得提醒行情失敗"); }
  }
  const checkedAt = Date.now();
  snapshot.source=["mis","yahoo","stale"].includes(result.source)?result.source:null;
  snapshot.complete=result.complete===true;
  // 批次日期是最舊行情或 null；每筆股票獨立判斷新鮮度，避免一檔過舊阻擋全部提醒。
  if (result.source !== "mis" || result.complete !== true) {
    for(const row of armed)snapshot.rows[row.stock_id].status=result.source!=="mis"?"reference-only":"incomplete";
    return deliverAlertEvents(new Date(Date.now()));
  }
  const quoteOf = new Map(result.quotes.map((q) => [q.stockId, q]));
  // 不相信錯誤標示的 complete；缺任一武裝股票時整批略過。
  if (armed.some((row) => !quoteOf.has(row.stock_id))) {
    snapshot.complete=false;
    for(const row of armed)snapshot.rows[row.stock_id].status="incomplete";
    return deliverAlertEvents(new Date(Date.now()));
  }
  let failures = 0;

  for (const row of armed) {
    const check=snapshot.rows[row.stock_id];
    const q = quoteOf.get(row.stock_id);
    if(!q||q.market!==row.market||q.price===null||!Number.isFinite(q.price)||q.price<=0){check.status="invalid-quote";continue;}
    if(q.traded!==true){check.status="not-traded";continue;}
    if(!isFreshQuoteTime(q.asOf,checkedAt)){check.status="quote-expired";continue;}
    check.status="checked";

    // 無效數值只略過對應提醒，不將 Infinity 等異常資料視為已達門檻。
    const safeQuote = {
      ...q,
      changePct: q.changePct !== null && Number.isFinite(q.changePct) ? q.changePct : null,
      volume: q.volume !== null && Number.isFinite(q.volume) && q.volume >= 0 ? q.volume : null,
    };

    // 爆量判斷需要均量，且讀日 K 快取有成本，只在可能觸發爆量時才抓（不誤報、也不白白讀取）
    const needsVolumeCheck =
      row.alert_volume_on &&
      !hitToday(row.alert_volume_hit_at, now) &&
      safeQuote.volume !== null;
    let avg = null;
    if(needsVolumeCheck) {
      try { avg=await avgVolume5d(row.stock_id); }
      catch(error) { failures++; logApiError("alerts volume",error); }
    }
    const unavailable:AlertKind[]=[];
    if(row.alert_change_pct!==null&&safeQuote.changePct===null)unavailable.push("change" as const);
    if(row.alert_volume_on&&!hitToday(row.alert_volume_hit_at,now)&&(safeQuote.volume===null||avg===null||avg<=0))unavailable.push("volume" as const);
    if(unavailable.length>0){check.status="partial";check.unavailable=unavailable;}

    const decisions = decideAlerts(row, safeQuote, avg, now);

    for (const decision of decisions) {
      // 讀均量或處理前面的股票可能耗時，送出前再次確認行情仍在兩分鐘內。
      if (!isFreshQuoteTime(q.asOf, Date.now())) {check.status="quote-expired";break;}
      try {
        const event=await captureAlertEvent(row, decision, safeQuote, new Date(Date.now()));
        if(event){check.captured++;if(check.status==="checked"||check.status==="triggered")check.status="triggered";}
        else check.status="changed";
      } catch(error) {check.status="storage-error";failures++;logApiError("alerts capture",error);}
    }
  }

  const accepted=await deliverAlertEvents(new Date(Date.now()));
  if(failures>0)throw new Error("部分提醒處理失敗");
  return accepted;
}
