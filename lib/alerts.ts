// 到價提醒檢查器：盤中由常駐排程每分鐘呼叫一次。
// 只看自選股已武裝（門檻已設、尚未觸發）的提醒，穿越門檻即推 LINE 並標記為已觸發（一次性）。
import { listWatchlist, markAlertHit } from "@/lib/store";
import { fetchQuotes } from "@/lib/providers/quoteProvider";
import { pushLine, lineConfigured } from "@/lib/notify";

function hhmm(now: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

function fmtPrice(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// 回傳本次推播筆數
export async function checkAlerts(now: Date = new Date()): Promise<number> {
  if (!lineConfigured()) return 0;

  const items = await listWatchlist();
  const armed = items.filter(
    (i) =>
      (i.alert_high !== null && i.alert_high_hit_at === null) ||
      (i.alert_low !== null && i.alert_low_hit_at === null)
  );
  if (armed.length === 0) return 0;

  const result = await fetchQuotes(
    armed.map((i) => ({ stockId: i.stock_id, market: i.market }))
  );
  const priceOf = new Map(result.quotes.map((q) => [q.stockId, q.price]));
  const at = now.toISOString();
  const time = hhmm(now);
  let sent = 0;

  for (const row of armed) {
    const price = priceOf.get(row.stock_id);
    if (price === null || price === undefined) continue;

    // 漲到（🔺 紅）
    if (
      row.alert_high !== null &&
      row.alert_high_hit_at === null &&
      price >= row.alert_high
    ) {
      const text = `🔺 到價提醒\n${row.name}（${row.stock_id}）漲到 ${fmtPrice(
        price
      )}\n門檻 ${fmtPrice(row.alert_high)}・${time}`;
      if (await pushLine(text)) {
        await markAlertHit(row.stock_id, "high", at);
        sent++;
      }
    }

    // 跌到（🔻 綠）
    if (
      row.alert_low !== null &&
      row.alert_low_hit_at === null &&
      price <= row.alert_low
    ) {
      const text = `🔻 到價提醒\n${row.name}（${row.stock_id}）跌到 ${fmtPrice(
        price
      )}\n門檻 ${fmtPrice(row.alert_low)}・${time}`;
      if (await pushLine(text)) {
        await markAlertHit(row.stock_id, "low", at);
        sent++;
      }
    }
  }

  return sent;
}
