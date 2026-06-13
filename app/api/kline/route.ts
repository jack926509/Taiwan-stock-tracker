// GET /api/kline?id=2330 — 回傳近一年日 K（FinMind），有快取就用、缺最新才補抓
import { NextRequest, NextResponse } from "next/server";
import { ensureKline } from "@/lib/klineService";
import { taipeiNow } from "@/lib/market-hours";
import type { Candle } from "@/lib/providers/klineProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toUpperCase();
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  }

  const today = taipeiNow().isoDate;
  let candles: Candle[];
  try {
    candles = await ensureKline(id, today);
  } catch (e) {
    return NextResponse.json(
      { error: `讀取快取失敗：${(e as Error).message}` },
      { status: 500 }
    );
  }

  if (candles.length === 0) {
    return NextResponse.json(
      { error: "查無此股票的歷史資料" },
      { status: 404 }
    );
  }

  return NextResponse.json({ stockId: id, candles });
}
