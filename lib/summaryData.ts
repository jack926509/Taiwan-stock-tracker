// 站內「收盤總覽」資料層：與每日 LINE 總結（lib/daily-summary.ts）同源的彙整邏輯，
// 差別在回傳結構化 JSON 供 /api/summary → 首頁面板使用，而非組字串推播。
// 完整 MIS 摘要快取 10 分鐘；備援與無資料短快取 30 秒（同日＋同一自選清單才命中）。

import { listWatchlist } from "@/lib/store";
import { fetchQuotes, INDEX_TARGETS } from "@/lib/providers/quoteProvider";
import { loadKline } from "@/lib/klineStore";
import { taipeiNow } from "@/lib/market-hours";
import { newSignalsToday } from "@/lib/summarySignals";
import {
  thisMondayIso,
  weekChangePct,
  todayCandleFromQuote,
  isQuoteForSummaryDate,
  countTodayHits,
} from "@/lib/daily-summary";
import type { Signal } from "@/lib/signals";
import type { QuoteSource } from "@/lib/types";

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
  source: QuoteSource;
  asOf: string | null; // 實際參與摘要的行情時間，不能使用重新抓取時間
  complete: boolean;
  indices: SummaryIndexRow[];
  counts: { up: number; down: number; flat: number };
  rows: SummaryStockRow[]; // 依當日漲跌幅由大到小
  best: { name: string; changePct: number } | null;
  worst: { name: string; changePct: number } | null;
  alertHits: number; // 今日觸發提醒則數
}

const TTL_MS = 10 * 60_000;
const SHORT_TTL_MS = 30_000;
let cache: { key: string; expiresAt: number; data: DailySummaryData | null } | null = null;

export async function buildSummaryData(
  now: Date = new Date()
): Promise<DailySummaryData | null> {
  const items = await listWatchlist();
  if (items.length === 0) return null;

  const t = taipeiNow(now);
  const key = `${t.isoDate}|${items.map((i) => i.stock_id).sort().join(",")}`;
  if (cache && cache.key === key && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const ids = new Set(items.map((i) => i.stock_id));
  // 自選股 + 加權／櫃買指數併同一個 MIS 請求（與 dailySummary 相同）
  const targets = [
    ...items.map((i) => ({ stockId: i.stock_id, market: i.market })),
    ...INDEX_TARGETS,
  ];
  const result = await fetchQuotes(targets);
  const datedQuotes = result.quotes.filter((q) => isQuoteForSummaryDate(q, t.isoDate, now));

  const indices: SummaryIndexRow[] = [];
  const weighted = datedQuotes.find((q) => q.stockId === "t00");
  const otc = datedQuotes.find((q) => q.stockId === "o00");
  if (weighted) indices.push({ name: "加權", price: weighted.price, changePct: weighted.changePct });
  if (otc) indices.push({ name: "櫃買", price: otc.price, changePct: otc.changePct });

  const quotes = datedQuotes
    .filter((q) => ids.has(q.stockId))
    .map((q) => ({
      ...q,
      changePct: q.changePct !== null && Number.isFinite(q.changePct) ? q.changePct : null,
    }))
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  if (quotes.length === 0) {
    // 週末或全數缺少當日行情仍回 null，只節流外部請求，不合成成功摘要。
    cache = { key, expiresAt: Date.now() + SHORT_TTL_MS, data: null };
    return null;
  }

  const counts = { up: 0, down: 0, flat: 0 };
  for (const q of quotes) {
    const c = q.changePct;
    if (c === null) continue;
    if (c === 0) counts.flat++;
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

  const ranked = rows.filter((r) => r.changePct !== null && Number.isFinite(r.changePct));
  const best = ranked[0] ?? null;
  const worst = ranked[ranked.length - 1] ?? null;

  const data: DailySummaryData = {
    date: t.isoDate,
    source: result.source,
    asOf: new Date(Math.min(...datedQuotes.map((q) => Date.parse(q.asOf ?? "")))).toISOString(),
    complete: result.complete && targets.every((target) => datedQuotes.some((q) =>
      q.stockId === target.stockId && q.market === target.market
    )),
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
  // 缺漏時下一次請求繼續補資料，避免十分鐘快取遮住來源恢復。
  if (data.complete) {
    const ttl = data.source === "mis" ? TTL_MS : SHORT_TTL_MS;
    cache = { key, expiresAt: Date.now() + ttl, data };
  }
  return data;
}
