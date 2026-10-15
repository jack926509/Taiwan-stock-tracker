import { NextResponse } from "next/server";
import { buildPersonalStatus } from "@/lib/personalStatus";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await buildPersonalStatus(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "系統狀態暫時無法讀取" }, { status: 503 }); }
}
