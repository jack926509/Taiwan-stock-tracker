// 到價／漲跌幅／爆量提醒檢查器：盤中由常駐排程每分鐘呼叫一次。
// 到價提醒：只看已武裝（門檻已設、尚未觸發）者，穿越門檻即推 LINE 並標記為已觸發——觸發後靜音直到使用者重設門檻。
// 漲跌幅／爆量提醒：語意不同——每日一次性，只要 hit_at 不是「今天」就視為可再觸發，跨日自動重新武裝，不需使用者手動重設。
import { listWatchlist, markAlertHit, type WatchItem } from "@/lib/store";
import { fetchQuotes, type Quote } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { pushLine, lineConfigured } from "@/lib/notify";
import { isArmed, decideAlerts, hitToday } from "@/lib/alertLogic";

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

const BASE_URL = process.env.APP_BASE_URL ?? "https://twstock.xiehnet.com";

// 組一則到價提醒訊息（精簡 4 行：標題／現價／今日高低／時間＋連結）
function buildMessage(
  q: { stockId: string; name: string; price: number | null; change: number | null; changePct: number | null; open: number | null; high: number | null; low: number | null },
  side: "high" | "low",
  threshold: number,
  time: string
): string {
  // 標題重點前置：色點＋標的＋方向＋門檻（通知列預覽即可看懂）
  const head =
    side === "high"
      ? `🔴 ${q.name} ${q.stockId} 漲破 ${fmtPrice(threshold)}`
      : `🟢 ${q.name} ${q.stockId} 跌破 ${fmtPrice(threshold)}`;
  return [
    head,
    `現價 ${fmtPrice(q.price)}${fmtChange(q.change, q.changePct)}`,
    `開 ${fmtPrice(q.open)}　高 ${fmtPrice(q.high)}　低 ${fmtPrice(q.low)}`,
    `🕙 ${time}　👉 ${BASE_URL}/stock/${q.stockId}`,
  ].join("\n");
}

// 漲跌幅提醒訊息：📈 紅漲／📉 綠跌（changePct 為小數，顯示需 ×100）
function buildChangeMessage(q: Quote, thresholdPct: number, time: string): string {
  const pct = (q.changePct ?? 0) * 100;
  const dir = pct >= 0 ? "大漲" : "大跌";
  const dot = pct >= 0 ? "🔴" : "🟢";
  return [
    `${dot} ${q.name} ${q.stockId} 今日${dir} ${Math.abs(pct).toFixed(1)}%（門檻 ${thresholdPct}%）`,
    `現價 ${fmtPrice(q.price)}${fmtChange(q.change, q.changePct)}`,
    `🕙 ${time}　👉 ${BASE_URL}/stock/${q.stockId}`,
  ].join("\n");
}

// 爆量提醒訊息：現量 vs 近 5 日均量（張數，四捨五入到百張顯示為「萬張」較易讀）
function fmtVolume(vol: number): string {
  if (vol >= 10000) return `${(vol / 10000).toFixed(1)} 萬張`;
  return `${Math.round(vol).toLocaleString("en-US")} 張`;
}

function buildVolumeMessage(
  q: Quote,
  avgVolume: number,
  time: string
): string {
  const ratio = avgVolume > 0 ? q.volume! / avgVolume : 0;
  return [
    `📊 ${q.name} ${q.stockId} 爆量 ${fmtVolume(q.volume ?? 0)}（近 5 日均量 ${fmtVolume(avgVolume)} 的 ${ratio.toFixed(1)} 倍）`,
    `現價 ${fmtPrice(q.price)}${fmtChange(q.change, q.changePct)}`,
    `🕙 ${time}　👉 ${BASE_URL}/stock/${q.stockId}`,
  ].join("\n");
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
      let message: string;
      switch (decision.kind) {
        case "high":
        case "low":
          message = buildMessage(q, decision.kind, decision.threshold, time);
          break;
        case "change":
          message = buildChangeMessage(q, decision.threshold, time);
          break;
        case "volume":
          message = buildVolumeMessage(q, decision.threshold, time);
          break;
      }
      if (await pushLine(message)) {
        await markAlertHit(row.stock_id, decision.kind, at);
        sent++;
      }
    }
  }

  return sent;
}
