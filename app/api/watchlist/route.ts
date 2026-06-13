import { NextRequest, NextResponse } from "next/server";
import { resolveStock } from "@/lib/providers/quoteProvider";
import {
  listWatchlist,
  addWatch,
  removeWatch,
  setAlert,
  usingSupabase,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listWatchlist();
    return NextResponse.json({ items, storage: usingSupabase() ? "supabase" : "local" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let code = "";
  try {
    const body = await req.json();
    code = typeof body?.stockId === "string" ? body.stockId.trim().toUpperCase() : "";
  } catch {
    /* fallthrough */
  }
  if (!code) {
    return NextResponse.json({ error: "請輸入股票代號" }, { status: 400 });
  }
  // 自動判斷上市/上櫃與名稱（A.4 契約），免手動選市場別
  const info = await resolveStock(code);
  if (!info) {
    return NextResponse.json({ error: `查無代號 ${code}` }, { status: 404 });
  }
  try {
    await addWatch(info);
    return NextResponse.json({ ok: true, item: info });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// 設定到價門檻：{ stockId, high, low }，high/low 為數字或 null（null=取消該側）
export async function PATCH(req: NextRequest) {
  let body: { stockId?: unknown; high?: unknown; low?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }
  const stockId =
    typeof body.stockId === "string" ? body.stockId.trim().toUpperCase() : "";
  if (!stockId) {
    return NextResponse.json({ error: "缺少 stockId" }, { status: 400 });
  }
  const parse = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const high = parse(body.high);
  const low = parse(body.low);
  if (Number.isNaN(high) || Number.isNaN(low)) {
    return NextResponse.json({ error: "門檻需為正數" }, { status: 400 });
  }
  try {
    await setAlert(stockId, high, low);
    return NextResponse.json({ ok: true, stockId, high, low });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const stockId = req.nextUrl.searchParams.get("id");
  if (!stockId) {
    return NextResponse.json({ error: "缺少 id 參數" }, { status: 400 });
  }
  try {
    await removeWatch(stockId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
