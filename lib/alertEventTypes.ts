import type { AlertKind } from "./alertLogic.ts";
export type NotificationState = "pending" | "sending" | "retry" | "accepted" | "unconfigured" | "limited" | "failed";
export interface AlertEvent {
  v: 1; id: string; key: string; stockId: string; market: "tse" | "otc"; name: string;
  kind: AlertKind; threshold: number; price: number; changePct: number | null; volume: number | null;
  open: number | null; high: number | null; low: number | null;
  triggeredAt: string; quoteAsOf: string;
  notification: { state: NotificationState; attempts: number; retryKey: string; claimId?: string;
    reason?: string | null; attemptedAt?: string; leaseUntil?: string; nextAttemptAt?: string; finishedAt?: string };
}
export const ALERT_KIND_LABEL = { high: "漲到", low: "跌到", change: "漲跌幅", volume: "爆量" } as const;
export const NOTIFICATION_LABEL: Record<NotificationState, string> = {
  pending: "等待通知", sending: "送出中", retry: "等待重試", accepted: "LINE 已接受",
  unconfigured: "LINE 尚未設定", limited: "已達本日額度", failed: "通知未完成",
};
export type PublicAlertEvent = Omit<AlertEvent, "key" | "notification"> & {
  notification: Pick<AlertEvent["notification"], "state" | "attempts" | "reason" | "finishedAt">;
};
export function publicAlertEvent(event: AlertEvent, now: Date = new Date()): PublicAlertEvent {
  const { key: _key, notification, ...data } = event;
  if(["pending","retry","sending"].includes(notification.state)&&now.getTime()-Date.parse(event.triggeredAt)>15*60_000) {
    return {...data,notification:{state:"failed",attempts:notification.attempts,reason:"retry-expired",finishedAt:notification.finishedAt}};
  }
  return { ...data, notification: { state: notification.state, attempts: notification.attempts,
    reason: notification.reason, finishedAt: notification.finishedAt } };
}
