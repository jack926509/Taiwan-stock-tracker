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

export interface EpsQuarter {
  date: string; // 季底日 YYYY-MM-DD
  year: number;
  quarter: number; // 1~4
  eps: number; // 單季每股盈餘（元；FinMind 已是單季值，非累計）
}

export interface Fundamental {
  institutional: InstDay[]; // 近 20 個交易日，舊→新
  revenue: RevenueMonth[]; // 近 12 個月，舊→新
  valuation: Valuation | null;
  eps: EpsQuarter[]; // 近 8 季，舊→新
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

interface FsRow {
  date: string;
  type: string; // 眾多會計科目之一，EPS 是其中一列
  value: number;
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

function buildEps(rows: FsRow[]): EpsQuarter[] {
  // 同一季底可能出現重複列（個別/合併報表），以日期為鍵取最後一筆
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "EPS") byDate.set(r.date, r.value);
  }
  return [...byDate.entries()]
    .map(([date, eps]) => ({
      date,
      year: parseInt(date.slice(0, 4), 10),
      quarter: Math.ceil(parseInt(date.slice(5, 7), 10) / 3), // 03→1 06→2 09→3 12→4
      eps,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);
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
  const fs = await safeRows<FsRow>(() =>
    finmindRows(
      "TaiwanStockFinancialStatements",
      stockId,
      isoDaysAgo(today, 800) // 約 26 個月，足以涵蓋近 8 季 EPS
    )
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
    eps: fs ? buildEps(fs) : [],
    // 只要有任一支「抓失敗」就不完整，呼叫端據此縮短快取
    complete: inst !== null && rev !== null && per !== null && fs !== null,
  };
}
