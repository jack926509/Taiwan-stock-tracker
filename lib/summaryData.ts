// 站內「收盤總覽」資料層：與每日 LINE 總結（lib/daily-summary.ts）同源的彙整邏輯，
// 差別在回傳結構化 JSON 供 /api/summary → 首頁面板使用，而非組字串推播。
// 收盤後資料不再變動：模組層快取 10 分鐘（同一台北日期＋同一份自選清單才命中）。

import { listWatchlist } from "@/lib/store";
import { fetchQuotes, INDEX_TARGETS } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { taipeiNow } from "@/lib/market-hours";
import { newSignalsToday } from "@/lib/summarySignals";
import {
  thisMondayIso,
  weekChangePct,
  todayCandleFromQuote,
  countTodayHits,
} from "@/lib/daily-summary";
import type { Signal } from "@/lib/signals";

export interface SummaryIndexRow {
  name: string;
  price: number | null;
  changePct: number | null;
}

export interface SummaryStockRow {
  stockId: string;
  name: string;
  price: number | null;
  changePct: number | null;
  weekPct: number | null;
  newSignals: Pick<Signal, "kind" | "label" | "tone">[];
}

export interface DailySummaryData {
  date: string; // 台北 ISO 日期
  indices: SummaryIndexRow[];
  counts: { up: number; down: number; flat: number };
  rows: SummaryStockRow[]; // 依當日漲跌幅由大到小
  best: { name: string; changePct: number } | null;
  worst: { name: string; changePct: number } | null;
  alertHits: number; // 今日觸發提醒則數
}

const TTL_MS = 10 * 60_000;
let cache: { key: string; at: number; data: DailySummaryData } | null = null;

export async function buildSummaryData(
  now: Date = new Date()
): Promise<DailySummaryData | null> {
  const items = await listWatchlist();
  if (items.length === 0) return null;

  const t = taipeiNow(now);
  const key = `${t.isoDate}|${items.map((i) => i.stock_id).sort().join(",")}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }

  const ids = new Set(items.map((i) => i.stock_id));
  // 自選股 + 加權／櫃買指數併同一個 MIS 請求（與 dailySummary 相同）
  const result = await fetchQuotes([
    ...items.map((i) => ({ stockId: i.stock_id, market: i.market })),
    ...INDEX_TARGETS,
  ]);

  const indices: SummaryIndexRow[] = [];
  const weighted = result.quotes.find((q) => q.stockId === "t00");
  const otc = result.quotes.find((q) => q.stockId === "o00");
  if (weighted) indices.push({ name: "加權", price: weighted.price, changePct: weighted.changePct });
  if (otc) indices.push({ name: "櫃買", price: otc.price, changePct: otc.changePct });

  const quotes = result.quotes
    .filter((q) => ids.has(q.stockId))
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));

  const counts = { up: 0, down: 0, flat: 0 };
  for (const q of quotes) {
    const c = q.changePct;
    if (c === null || c === 0) counts.flat++;
    else if (c > 0) counts.up++;
    else counts.down++;
  }

  const mondayIso = thisMondayIso(t);
  const rows: SummaryStockRow[] = await Promise.all(
    quotes.map(async (q) => {
      const [weekPct, newSignals] = await Promise.all([
        weekChangePct(q.stockId, q.price, mondayIso),
        (async () => {
          const todayCandle = todayCandleFromQuote(q, t.isoDate);
          if (!todayCandle) return [];
          const existing = await loadKline(q.stockId);
          return newSignalsToday(existing, todayCandle);
        })(),
      ]);
      return {
        stockId: q.stockId,
        name: q.name,
        price: q.price,
        changePct: q.changePct,
        weekPct,
        newSignals: newSignals.map((s) => ({
          kind: s.kind,
          label: s.label,
          tone: s.tone,
        })),
      };
    })
  );

  const ranked = rows.filter((r) => r.changePct !== null);
  const best = ranked[0] ?? null;
  const worst = ranked[ranked.length - 1] ?? null;

  const data: DailySummaryData = {
    date: t.isoDate,
    indices,
    counts,
    rows,
    best: best && { name: best.name, changePct: best.changePct as number },
    worst:
      worst && worst.stockId !== best?.stockId
        ? { name: worst.name, changePct: worst.changePct as number }
        : null,
    alertHits: countTodayHits(items, now),
  };
  cache = { key, at: Date.now(), data };
  return data;
}
