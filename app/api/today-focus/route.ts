import { NextResponse } from "next/server";
import { countAlertEvents } from "@/lib/alertHistory";
import { taipeiNow } from "@/lib/market-hours";
export const dynamic = "force-dynamic";
export async function GET() {
  const date = taipeiNow().isoDate;
  try { return NextResponse.json({ date, events: await countAlertEvents(date) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ date, error: "今日提醒數暫時無法讀取" }, { status: 503 }); }
}
