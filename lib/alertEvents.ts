import { getSupabase } from "@/lib/supabase";
import { listWatchlist, markAlertHit, type WatchItem } from "@/lib/store";
import { decideAlerts, type AlertDecision } from "@/lib/alertLogic";
import { taipeiNow } from "@/lib/market-hours";
import { loadPersonalRecord, listPersonalRecords, savePersonalRecord, serialPersonalWrite } from "@/lib/personalRecords";
import type { Quote } from "@/lib/providers/quoteProvider";
import type { AlertEvent } from "@/lib/alertEventTypes";
import type { LineSendResult } from "@/lib/notify";

export async function readyAlertEvents(now: Date, limit = 5): Promise<AlertEvent[]> {
  const db = getSupabase();
  if (db) {
    const {data,error} = await db.rpc("list_ready_alert_events",{p_now:now.toISOString(),p_limit:limit});
    if(error)throw new Error("讀取待處理通知失敗");
    return data as AlertEvent[];
  }
  return serialPersonalWrite(async()=>{
    const records=await listPersonalRecords<AlertEvent>("alert:event:",{states:["pending","retry","sending"],limit:100000,ascending:true});
    const ready:AlertEvent[]=[];
    for(const record of records.items) {
      const event=record.data,n=event.notification,at=now.getTime();
      if(n.state==="sending"&&Date.parse(n.leaseUntil??"")>at)continue;
      if(at-Date.parse(event.triggeredAt)>15*60_000) {
        event.notification={...n,state:"failed",reason:"retry-expired"};
        await savePersonalRecord(record.key,event,new Date(record.fetchedAt));
      } else if(!(Date.parse(n.nextAttemptAt??"")>at)&&ready.length<limit) ready.push(event);
    }
    return ready;
  });
}

export async function captureAlertEvent(row: WatchItem, decision: AlertDecision, quote: Quote, at: Date): Promise<AlertEvent | null> {
  const version = row.alert_versions?.[decision.kind] ?? "initial";
  const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null;
  const details = { open: finite(quote.open), high: finite(quote.high), low: finite(quote.low) };
  const db = getSupabase();
  if (db) {
    const { data, error } = await db.rpc("capture_alert_event", {
      p_stock_id: row.stock_id, p_kind: decision.kind, p_version: version,
      p_triggered_at: at.toISOString(), p_quote_as_of: quote.asOf,
      p_price: quote.price, p_threshold: decision.threshold, p_change_pct: quote.changePct, p_volume: quote.volume,
      p_details: details,
    });
    if (error) throw new Error("保存提醒事件失敗");
    return data as AlertEvent | null;
  }
  return serialPersonalWrite(async () => {
    const current = (await listWatchlist()).find(item => item.stock_id === row.stock_id);
    if (!current || (current.alert_versions?.[decision.kind] ?? "initial") !== version ||
      !decideAlerts(current, quote, decision.kind === "volume" ? decision.threshold : null, at).some(item => item.kind === decision.kind)) return null;
    const slot = decision.kind === "high" || decision.kind === "low" ? "once" : taipeiNow(at).isoDate;
    const key = `alert:event:${row.stock_id}:${decision.kind}:${version}:${slot}`;
    const previous = await loadPersonalRecord<AlertEvent>(key);
    if (previous) {
      // 本機若在寫事件後中斷，恢復原觸發標記，不重建或抹掉事件。
      await markAlertHit(row.stock_id, decision.kind, previous.data.triggeredAt, version);
      return null;
    }
    const id = crypto.randomUUID();
    const event: AlertEvent = { v: 1, id, key, stockId: row.stock_id, market: row.market, name: row.name,
      kind: decision.kind, threshold: decision.threshold, price: quote.price!, changePct: quote.changePct,
      volume: quote.volume, ...details, triggeredAt: at.toISOString(), quoteAsOf: quote.asOf!,
      notification: { state: "pending", attempts: 0, retryKey: id } };
    await savePersonalRecord(key, event, at);
    await markAlertHit(row.stock_id, decision.kind, event.triggeredAt, version);
    return event;
  });
}

export async function claimAlertDelivery(key: string, claimId: string, now: Date): Promise<AlertEvent | null> {
  const db = getSupabase();
  if (db) {
    const { data, error } = await db.rpc("claim_alert_delivery", { p_key: key, p_claim_id: claimId, p_now: now.toISOString() });
    if (error) throw new Error("認領提醒通知失敗");
    return data as AlertEvent | null;
  }
  return serialPersonalWrite(async () => {
    const record = await loadPersonalRecord<AlertEvent>(key);
    if (!record) return null;
    const event = record.data, n = event.notification, at = now.getTime();
    if (!["pending", "retry", "sending"].includes(n.state) ||
      (n.state === "sending" && Date.parse(n.leaseUntil ?? "") > at) || Date.parse(n.nextAttemptAt ?? "") > at) return null;
    if (at - Date.parse(event.triggeredAt) > 15 * 60_000 || n.attempts >= 3) {
      event.notification = { ...n, state: "failed", reason: "retry-expired" };
      await savePersonalRecord(key, event, new Date(record.fetchedAt));
      return null;
    }
    event.notification = { ...n, state: "sending", attempts: n.attempts + 1, claimId,
      attemptedAt: now.toISOString(), leaseUntil: new Date(at + 60_000).toISOString() };
    await savePersonalRecord(key, event, new Date(record.fetchedAt));
    return event;
  });
}

export async function finishAlertDelivery(event: AlertEvent, result: LineSendResult, now: Date): Promise<void> {
  const db = getSupabase();
  if (db) {
    const { data, error } = await db.rpc("finish_alert_delivery", { p_key: event.key, p_claim_id: event.notification.claimId,
      p_state: result.state, p_reason: result.reason, p_retryable: result.retryable, p_now: now.toISOString() });
    if (error || data !== true) throw new Error("記錄通知結果失敗");
    return;
  }
  await serialPersonalWrite(async () => {
    const current = await loadPersonalRecord<AlertEvent>(event.key);
    if (!current || current.data.notification.claimId !== event.notification.claimId || current.data.notification.state !== "sending") return;
    const n = current.data.notification;
    current.data.notification = { ...n, state: result.state === "failed" && result.retryable && n.attempts < 3 ? "retry" : result.state,
      reason: result.reason, finishedAt: now.toISOString(), nextAttemptAt: new Date(now.getTime() + (n.attempts === 1 ? 60_000 : 300_000)).toISOString() };
    await savePersonalRecord(event.key, current.data, new Date(current.fetchedAt));
  });
}
