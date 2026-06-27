import { NextRequest, NextResponse } from "next/server";
import {
  fetchQuotes,
  resolveStock,
  INDEX_TARGETS,
  Quote,
  QuoteTarget,
  Market,
} from "@/lib/providers/quoteProvider";
import { isMarketOpenNow } from "@/lib/market-hours";
import { listWatchlist } from "@/lib/store";
import { logApiError, publicErrorBody } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// 代號 → 市場別查詢結果快取（避免重複打 getStock.jsp）
const marketCache = new Map<string, Market>();

async function targetsFromIds(ids: string[]): Promise<QuoteTarget[]> {
  const targets: QuoteTarget[] = [];
  for (const stockId of ids) {
    let market = marketCache.get(stockId);
    if (!market) {
      const info = await resolveStock(stockId);
      if (!info) continue; // 查無代號，略過
      market = info.market;
      marketCache.set(stockId, market);
    }
    targets.push({ stockId, market });
  }
  return targets;
}

async function targetsFromWatchlist(): Promise<QuoteTarget[]> {
  const items = await listWatchlist();
  return items.map((row) => ({ stockId: row.stock_id, market: row.market }));
}

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 30)
    : null;

  try {
    const stockTargets = ids
      ? await targetsFromIds(ids)
      : await targetsFromWatchlist();
    const [result, marketOpen] = await Promise.all([
      fetchQuotes([...INDEX_TARGETS, ...stockTargets]),
      isMarketOpenNow(),
    ]);
    const indexIds = new Set(INDEX_TARGETS.map((t) => t.stockId));
    const indices: Quote[] = [];
    const quotes: Quote[] = [];
    for (const q of result.quotes) {
      (indexIds.has(q.stockId) ? indices : quotes).push(q);
    }
    return NextResponse.json({
      asOf: result.asOf,
      marketOpen,
      source: result.source,
      indices,
      quotes,
    });
  } catch (err) {
    logApiError("api/quote", err);
    return NextResponse.json(
      publicErrorBody("報價來源暫時無法使用", err),
      { status: 502 }
    );
  }
}
