import { NextRequest, NextResponse } from "next/server";
import { buildSummaryData } from "@/lib/summaryData";
import { loadClosingSummary } from "@/lib/closingHistory";
import { countAlertEvents } from "@/lib/alertHistory";
import { taipeiDateRange } from "@/lib/personalDates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (date !== null && !taipeiDateRange(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
  try {
    const snapshot = date ? await loadClosingSummary(date) : null;
    const summary = date ? snapshot?.summary ?? null : await buildSummaryData();
    return NextResponse.json({
      summary: summary && !date ? { ...summary, alertHits: await countAlertEvents(summary.date) } : summary,
      savedAt: snapshot?.savedAt ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "收盤總覽暫時無法取得" }, { status: 503 }); }
}
