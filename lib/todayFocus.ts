import type { Quote, WatchlistItem } from "./types.ts";
import { nearestAlertDistance, sortByAlertDistance } from "./alertProximity.ts";
import { taipeiNow } from "./market-hours.ts";

const anomalyReasons = {
  "missing-price": "缺少有效價格",
  "unknown-time": "行情時間未知",
  "future-time": "行情時間晚於目前時間",
  "unexpected-date": "行情日期不符預期交易日",
} as const;

export function buildTodayFocus(items: WatchlistItem[], quotes: Quote[], date: string | null, now: number = Date.now()) {
  const byId = new Map(items.map(row => [row.stock_id, row]));
  const selected = quotes.filter(quote => byId.has(quote.stockId));
  const near = sortByAlertDistance(selected, items).flatMap(quote => {
    const item = byId.get(quote.stockId)!;
    const distance = nearestAlertDistance(item, quote);
    return distance === null ? [] : [{ stockId: item.stock_id, name: item.name, distance }];
  }).slice(0, 3);
  const anomalies = items.flatMap(item => {
    const quote = selected.find(q => q.stockId === item.stock_id);
    const timestamp = typeof quote?.asOf === "string" ? Date.parse(quote.asOf) : NaN;
    const kind = !quote || quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0 ? "missing-price"
      : !Number.isFinite(timestamp) ? "unknown-time"
      : timestamp > now ? "future-time"
      : date && taipeiNow(new Date(timestamp)).isoDate !== date ? "unexpected-date" : null;
    return kind ? [{ stockId: item.stock_id, name: item.name, kind, reason: anomalyReasons[kind] }] : [];
  });
  return { near, anomalies };
}
