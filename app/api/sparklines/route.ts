// GET /api/sparklines?ids=2330,2317 — 首頁卡片用：每檔回傳近 N 日收盤價陣列 + 技術狀態徽章
import { NextRequest, NextResponse } from "next/server";
import { ensureKline } from "@/lib/klineService";
import { taipeiNow } from "@/lib/market-hours";
import { computeSignals, type Signal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;
const SPARK_POINTS = 20; // 走勢圖近 20 個交易日
const SIGNAL_POINTS = 40; // 技術狀態計算暖身期（KD/RSI/MA20 需 ~35 根）
const MAX_IDS = 30; // 自選股上限保護

export interface SparkEntry {
  spark: number[];
  signals: Signal[];
}

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("ids") ?? "").toUpperCase();
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ID_RE.test(s))
    ),
  ].slice(0, MAX_IDS);

  const today = taipeiNow().isoDate;
  const out: Record<string, SparkEntry> = {};
  // 逐檔處理：已快取者瞬間返回，未快取者才向 FinMind 抓；避免一次併發過多
  for (const id of ids) {
    try {
      const candles = await ensureKline(id, today);
      const recent = candles.slice(-SIGNAL_POINTS);
      out[id] = {
        spark: recent.slice(-SPARK_POINTS).map((c) => c.close),
        signals: computeSignals(recent),
      };
    } catch {
      out[id] = { spark: [], signals: [] };
    }
  }
  return NextResponse.json({ data: out });
}
