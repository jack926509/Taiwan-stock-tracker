// 到價／漲跌幅／爆量提醒檢查器：盤中由常駐排程每分鐘呼叫一次。
// 到價提醒：只看已武裝（門檻已設、尚未觸發）者，穿越門檻即推 LINE 並標記為已觸發——觸發後靜音直到使用者重設門檻。
// 漲跌幅／爆量提醒：語意不同——每日一次性，只要 hit_at 不是「今天」就視為可再觸發，跨日自動重新武裝，不需使用者手動重設。
import { listWatchlist, markAlertHit, type WatchItem } from "@/lib/store";
import { fetchQuotes } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { pushLineMessages, lineConfigured } from "@/lib/notify";
import { isArmed, decideAlerts, hitToday } from "@/lib/alertLogic";
import { buildAlertFlex } from "@/lib/alertFlex";

function hhmm(now: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

const BASE_URL = process.env.APP_BASE_URL ?? "https://twstock.xiehnet.com";

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
  if (!lineConfigured()) return 0;

  const items = await listWatchlist();
  const armed = items.filter((i: WatchItem) => isArmed(i, now));
  if (armed.length === 0) return 0;

  const result = await fetchQuotes(
    armed.map((i) => ({ stockId: i.stock_id, market: i.market }))
  );
  const quoteOf = new Map(result.quotes.map((q) => [q.stockId, q]));
  const at = now.toISOString();
  const time = hhmm(now);
  let sent = 0;

  for (const row of armed) {
    const q = quoteOf.get(row.stock_id);

    // 爆量判斷需要均量，且讀日 K 快取有成本，只在可能觸發爆量時才抓（不誤報、也不白白讀取）
    const needsVolumeCheck =
      row.alert_volume_on &&
      !hitToday(row.alert_volume_hit_at, now) &&
      q?.volume !== null &&
      q?.volume !== undefined;
    const avg = needsVolumeCheck ? await avgVolume5d(row.stock_id) : null;

    const decisions = decideAlerts(row, q, avg, now);

    for (const decision of decisions) {
      if (!q) continue;
      const message = buildAlertFlex({
        kind: decision.kind,
        stockId: q.stockId,
        name: q.name,
        price: q.price,
        changePct: q.changePct,
        threshold: decision.threshold,
        time,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: q.volume,
        baseUrl: BASE_URL,
      });
      if (await pushLineMessages([message])) {
        await markAlertHit(row.stock_id, decision.kind, at);
        sent++;
      }
    }
  }

  return sent;
}
