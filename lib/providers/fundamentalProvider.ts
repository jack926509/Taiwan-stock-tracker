// 基本面資料：法人買賣超、月營收、估值（FinMind 三個資料集，一次抓齊）
import { finmindRows } from "@/lib/providers/finmind";

export interface InstDay {
  date: string; // YYYY-MM-DD
  foreign: number; // 外資買賣超（張，外資+外資自營）
  trust: number; // 投信（張）
  dealer: number; // 自營商（張，自行+避險）
}

export interface RevenueMonth {
  year: number;
  month: number;
  revenue: number; // 元
  yoy: number | null; // 年增率 %
}

export interface Valuation {
  date: string;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null; // %
}

export interface Fundamental {
  institutional: InstDay[]; // 近 20 個交易日，舊→新
  revenue: RevenueMonth[]; // 近 12 個月，舊→新
  valuation: Valuation | null;
}

export interface FundamentalResult extends Fundamental {
  // 三個資料集是否全部成功回應（含「成功但回空」）。任一「抓失敗」即 false，
  // 供快取層改用短 TTL 重試，避免半套結果被鎖 12 小時。
  complete: boolean;
}

interface InstRow {
  date: string;
  buy: number; // 股
  sell: number; // 股
  name: string;
}

interface RevenueRow {
  date: string;
  revenue: number; // 元
  revenue_month: number;
  revenue_year: number;
}

interface PerRow {
  date: string;
  dividend_yield: number;
  PER: number;
  PBR: number;
}

function isoDaysAgo(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function groupInstitutional(rows: InstRow[]): InstDay[] {
  const byDate = new Map<string, InstDay>();
  for (const r of rows) {
    const day = byDate.get(r.date) ?? {
      date: r.date,
      foreign: 0,
      trust: 0,
      dealer: 0,
    };
    const net = (r.buy - r.sell) / 1000; // 股 → 張
    if (r.name === "Foreign_Investor" || r.name === "Foreign_Dealer_Self") {
      day.foreign += net;
    } else if (r.name === "Investment_Trust") {
      day.trust += net;
    } else if (r.name === "Dealer_self" || r.name === "Dealer_Hedging") {
      day.dealer += net;
    }
    byDate.set(r.date, day);
  }
  return [...byDate.values()]
    .map((d) => ({
      ...d,
      foreign: Math.round(d.foreign),
      trust: Math.round(d.trust),
      dealer: Math.round(d.dealer),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
}

function buildRevenue(rows: RevenueRow[]): RevenueMonth[] {
  const byYm = new Map<string, RevenueRow>();
  for (const r of rows) byYm.set(`${r.revenue_year}-${r.revenue_month}`, r);
  return [...byYm.values()]
    .sort((a, b) =>
      a.revenue_year !== b.revenue_year
        ? a.revenue_year - b.revenue_year
        : a.revenue_month - b.revenue_month
    )
    .map((r) => {
      const prev = byYm.get(`${r.revenue_year - 1}-${r.revenue_month}`);
      return {
        year: r.revenue_year,
        month: r.revenue_month,
        revenue: r.revenue,
        yoy:
          prev && prev.revenue > 0
            ? (r.revenue / prev.revenue - 1) * 100
            : null,
      };
    })
    .slice(-12);
}

// 抓失敗回 null（與「成功但回空陣列」區分）：null=失敗、[]=該股真的沒這項資料
async function safeRows<T>(fn: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function fetchFundamental(
  stockId: string,
  today: string
): Promise<FundamentalResult> {
  // 逐一抓，避免三支併發轟 FinMind 觸發限流（沒帶 token 時尤甚）。
  // 基本面 12 小時才更新一次，這點延遲無妨。
  const inst = await safeRows<InstRow>(() =>
    finmindRows(
      "TaiwanStockInstitutionalInvestorsBuySell",
      stockId,
      isoDaysAgo(today, 40)
    )
  );
  const rev = await safeRows<RevenueRow>(() =>
    finmindRows(
      "TaiwanStockMonthRevenue",
      stockId,
      isoDaysAgo(today, 800) // 約 26 個月，足以對前一年同月算 YoY
    )
  );
  const per = await safeRows<PerRow>(() =>
    finmindRows("TaiwanStockPER", stockId, isoDaysAgo(today, 14))
  );

  const latestPer = per && per.length > 0 ? per[per.length - 1] : null;

  return {
    // null（抓失敗）→ 視為無資料；[]（成功但空）也是無資料，但不影響 complete
    institutional: inst ? groupInstitutional(inst) : [],
    revenue: rev ? buildRevenue(rev) : [],
    valuation: latestPer
      ? {
          date: latestPer.date,
          per: latestPer.PER > 0 ? latestPer.PER : null,
          pbr: latestPer.PBR > 0 ? latestPer.PBR : null,
          dividendYield:
            latestPer.dividend_yield > 0 ? latestPer.dividend_yield : null,
        }
      : null,
    // 只要有任一支「抓失敗」就不完整，呼叫端據此縮短快取
    complete: inst !== null && rev !== null && per !== null,
  };
}
