// GET /api/summary — 站內收盤總覽（漲跌家數、各股當日/本週幅、今日新訊號、最強最弱、提醒觸發數）。
// 資料層 10 分鐘記憶體快取；自選清單為空回 { summary: null }。
import { NextResponse } from "next/server";
import { buildSummaryData } from "@/lib/summaryData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await buildSummaryData();
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json(
      { error: "收盤總覽暫時無法取得" },
      { status: 503 }
    );
  }
}
