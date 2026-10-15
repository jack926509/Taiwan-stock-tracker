import { NextResponse } from "next/server";
import { buildPersonalBackup } from "@/lib/personalStatus";
import { taipeiNow } from "@/lib/market-hours";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const now = new Date();
    return NextResponse.json(await buildPersonalBackup(now), { headers: {
      "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="twstock-backup-${taipeiNow(now).isoDate}.json"`,
    } });
  } catch { return NextResponse.json({ error: "備份匯出失敗，請稍後再試" }, { status: 503 }); }
}
