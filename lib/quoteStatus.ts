import type { QuoteResponse } from "./types.ts";

export function formatQuoteAsOf(asOf: string | null | undefined): string | null {
  const timestamp = typeof asOf === "string" ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(timestamp);
}

export function quoteWarnings(data: QuoteResponse): string[] {
  const warnings: string[] = [];
  const date = formatQuoteAsOf(data.asOf);
  const at = date ? `行情時間：${date}（台北）` : "行情日期時間未知";
  if (data.source === "yahoo") {
    warnings.push(`目前顯示 Yahoo 備援報價，可能延遲；${at}。備援期間暫停即時提醒。`);
  } else if (data.source === "stale") {
    warnings.push(`報價來源暫時異常，顯示舊報價快照；${at}。快照不觸發即時提醒。`);
  } else if (!date) {
    warnings.push("部分行情日期時間未知，無法確認的股票暫停即時提醒。稍後會重新嘗試取得報價。");
  }
  if (data.complete !== true) {
    warnings.push("部分股票報價缺漏，僅顯示已取得的資料；本輪暫停即時提醒，稍後會重新嘗試。");
  }
  return warnings;
}

function quoteVersion(data: QuoteResponse): string {
  return [...data.indices, ...data.quotes]
    .map((q) => `${q.stockId}:${q.asOf ?? q.time}:${q.price}:${q.volume}`)
    .sort().join("|");
}

export function quoteRefreshFeedback(
  data: QuoteResponse | undefined,
  previous: QuoteResponse | undefined,
  now: number = Date.now()
): { message: string; tone: "success" | "info" } {
  if (!data) return { message: "未取得報價，請稍後再試", tone: "info" };
  if (data.source === "stale") return { message: "仍顯示舊報價快照，尚未取得最新行情", tone: "info" };
  if (data.source === "yahoo") return { message: "已讀取 Yahoo 備援報價，資料可能延遲", tone: "info" };
  if (data.complete !== true) return { message: "已重新讀取報價，部分股票資料仍缺漏", tone: "info" };
  const timestamp = typeof data.asOf === "string" ? Date.parse(data.asOf) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now) {
    return { message: "已重新讀取報價，行情日期時間尚無法確認", tone: "info" };
  }
  if (now - timestamp > 120_000 ||
      (previous?.source === data.source && quoteVersion(previous) === quoteVersion(data))) {
    return { message: "已重新讀取報價，行情時間未更新", tone: "info" };
  }
  return { message: "報價已更新", tone: "success" };
}

// 單檔報價是否落後同批最新行情：不同台北日期一律算落後；同日則落後超過 10 分鐘才算。
// 畫面只在落後時才在該列標「延遲 …」，正常列不再重複印時間（整批時間顯示在標題一次）。
// 回傳要顯示的字串（例「延遲 13:20」「延遲 10/08 13:30」），沒落後或無法判斷回 null。
export function quoteDelayLabel(
  rowAsOf: string | null | undefined,
  latestAsOf: string | null | undefined
): string | null {
  const row = typeof rowAsOf === "string" ? Date.parse(rowAsOf) : NaN;
  const latest = typeof latestAsOf === "string" ? Date.parse(latestAsOf) : NaN;
  if (!Number.isFinite(row) || !Number.isFinite(latest)) return null;
  const parts = (ms: number) => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(ms);
    const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
    return { md: `${get("month")}/${get("day")}`, hm: `${get("hour")}:${get("minute")}` };
  };
  const r = parts(row);
  const l = parts(latest);
  if (r.md !== l.md) return `延遲 ${r.md} ${r.hm}`;
  if (latest - row > 10 * 60_000) return `延遲 ${r.hm}`;
  return null;
}
