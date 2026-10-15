import { readyAlertEvents, claimAlertDelivery, finishAlertDelivery } from "@/lib/alertEvents";
import { sendLineMessages } from "@/lib/notify";
import { buildAlertFlex } from "@/lib/alertFlex";
import { logApiError } from "@/lib/apiErrors";

export async function deliverAlertEvents(now: Date = new Date()): Promise<number> {
  const items = await readyAlertEvents(now);
  let accepted = 0;
  let failures = 0;
  for (const item of items) {
    try {
    const event = await claimAlertDelivery(item.key, crypto.randomUUID(), new Date(Math.max(now.getTime(), Date.now())));
    if (!event) continue;
    const time = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false })
      .format(new Date(event.triggeredAt));
    const message = buildAlertFlex({ kind: event.kind, stockId: event.stockId, name: event.name,
      price: event.price, changePct: event.changePct, threshold: event.threshold, time,
      open: event.open ?? null, high: event.high ?? null, low: event.low ?? null, volume: event.volume,
      baseUrl: process.env.APP_BASE_URL ?? "https://twstock.xiehnet.com" });
    const result = await sendLineMessages([message], event.notification.retryKey);
    await finishAlertDelivery(event, result, new Date(Date.now()));
    if (result.state === "accepted") accepted++;
    } catch(error) {
      failures++;
      logApiError("alerts delivery",error);
    }
  }
  if(failures>0)throw new Error("部分通知處理失敗");
  return accepted;
}
