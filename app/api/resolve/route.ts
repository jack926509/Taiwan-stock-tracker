// GET /api/resolve?id=2330 — 加自選股前的即時查名（複用 MIS 單檔查詢，非輪詢端點）
import { NextRequest, NextResponse } from "next/server";
import { resolveStock } from "@/lib/providers/quoteProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("id") ?? "").trim().toUpperCase();
  if (!ID_RE.test(code)) {
    return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  }
  const info = await resolveStock(code);
  if (!info) {
    return NextResponse.json({ error: "查無此代號" }, { status: 404 });
  }
  return NextResponse.json(info);
}
