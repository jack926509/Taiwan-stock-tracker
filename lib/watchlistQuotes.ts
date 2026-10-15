import type { Quote, WatchlistItem } from "./types.ts";

/** 僅供畫面使用；缺漏列不能當成來源行情或提醒依據。 */
export interface WatchlistQuote extends Quote {
  missing?: boolean;
}

export function buildWatchlistQuotes(
  items: Pick<WatchlistItem, "stock_id" | "market" | "name">[] | undefined,
  quotes: Quote[]
): WatchlistQuote[] {
  if (!items) return quotes;
  const byId = new Map(quotes.map(q => [q.stockId, q]));
  return items.map(item => {
    const quote = byId.get(item.stock_id);
    if (quote) return { ...quote, name: item.name, missing: false };
    return {
      stockId: item.stock_id, market: item.market, name: item.name,
      price: null, prevClose: null, change: null, changePct: null,
      open: null, high: null, low: null, volume: null,
      traded: false, time: "", missing: true,
    };
  });
}
