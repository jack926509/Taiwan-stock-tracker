// GET /api/kline?id=2330 — 回傳近一年日 K（FinMind），有快取就用、缺最新才補抓
import { NextRequest, NextResponse } from "next/server";
import { ensureKlineWithStatus } from "@/lib/klineService";
import { taipeiNow } from "@/lib/market-hours";
import type { Candle } from "@/lib/providers/klineProvider";
import { logApiError, publicErrorBody } from "@/lib/apiErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toUpperCase();
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  }

  const today = taipeiNow().isoDate;
  let result: { candles: Candle[]; latestDate: string | null; stale: boolean };
  try {
    result = await ensureKlineWithStatus(id, today);
  } catch (e) {
    logApiError("api/kline", e);
    return NextResponse.json(
      publicErrorBody("讀取歷史資料失敗", e),
      { status: 500 }
    );
  }

  if (result.candles.length === 0) {
    return NextResponse.json(
      { error: "查無此股票的歷史資料" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    stockId: id,
    candles: result.candles,
    latestDate: result.latestDate,
    stale: result.stale,
  });
}
