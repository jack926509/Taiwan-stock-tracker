// 前端共用型別：對應 /api/quote 與 /api/watchlist 回應契約

export interface Quote {
  stockId: string;
  name: string;
  market: "tse" | "otc";
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  traded: boolean;
  time: string;
}

export interface QuoteResponse {
  asOf: string;
  marketOpen: boolean;
  source: "mis" | "stale";
  indices: Quote[];
  quotes: Quote[];
}

export interface WatchlistItem {
  stock_id: string;
  market: "tse" | "otc";
  name: string;
  group_name: string;
  alert_high: number | null;
  alert_low: number | null;
  alert_high_hit_at: string | null;
  alert_low_hit_at: string | null;
  sort_order: number;
}
