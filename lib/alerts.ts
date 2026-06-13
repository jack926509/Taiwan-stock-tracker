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

function fmtPrice(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// 漲跌：帶正負號（紅漲綠跌靠版面語意，純文字無法上色）
// 注意 changePct 是小數（0.0236），顯示需 ×100
function fmtChange(change: number | null, pct: number | null): string {
  if (change === null) return "";
  const sign = change > 0 ? "+" : "";
  const p = pct === null ? "" : `（${sign}${(pct * 100).toFixed(2)}%）`;
  return `　${sign}${fmtPrice(change)}${p}`;
}

const BASE_URL = process.env.APP_BASE_URL ?? "https://tw-stock-tracker.zeabur.app";

// 組一則到價提醒訊息（B 風格：資訊完整）
function buildMessage(
  q: { stockId: string; name: string; price: number | null; change: number | null; changePct: number | null; open: number | null; high: number | null; low: number | null },
  side: "high" | "low",
  threshold: number,
  time: string
): string {
  // 標題重點前置：色點＋標的＋方向＋門檻（通知列預覽即可看懂）
  const head =
    side === "high"
      ? `🔴 ${q.name} 漲破 ${fmtPrice(threshold)}`
      : `🟢 ${q.name} 跌破 ${fmtPrice(threshold)}`;
  return [
    head,
    "━━━━━━━━━━",
    `${q.name}（${q.stockId}）`,
    `現價 ${fmtPrice(q.price)}${fmtChange(q.change, q.changePct)}`,
    `📊 今日　開 ${fmtPrice(q.open)}　高 ${fmtPrice(q.high)}　低 ${fmtPrice(q.low)}`,
    `🕙 ${time}`,
    `👉 ${BASE_URL}/stock/${q.stockId}`,
  ].join("\n");
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
  const quoteOf = new Map(result.quotes.map((q) => [q.stockId, q]));
  const at = now.toISOString();
  const time = hhmm(now);
  let sent = 0;

  for (const row of armed) {
    const q = quoteOf.get(row.stock_id);
    const price = q?.price;
    if (!q || price === null || price === undefined) continue;

    // 漲破（🔺 紅）
    if (
      row.alert_high !== null &&
      row.alert_high_hit_at === null &&
      price >= row.alert_high
    ) {
      if (await pushLine(buildMessage(q, "high", row.alert_high, time))) {
        await markAlertHit(row.stock_id, "high", at);
        sent++;
      }
    }

    // 跌破（🟢 綠）
    if (
      row.alert_low !== null &&
      row.alert_low_hit_at === null &&
      price <= row.alert_low
    ) {
      if (await pushLine(buildMessage(q, "low", row.alert_low, time))) {
        await markAlertHit(row.stock_id, "low", at);
        sent++;
      }
    }
  }

  return sent;
}
