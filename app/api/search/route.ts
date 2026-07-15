// GET /api/search?q=台積 — 代號／名稱模糊搜尋（FinMind 全市場清單，記憶體快取 24 小時）。
// FinMind 暫時不可用時：代號格式的查詢退回 MIS 單檔查名（resolveStock），名稱查詢回 503。
import { NextRequest, NextResponse } from "next/server";
import { getStockList, searchStockList } from "@/lib/providers/stockList";
import { resolveStock } from "@/lib/providers/quoteProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    const list = await getStockList();
    return NextResponse.json({ results: searchStockList(list, q) });
  } catch {
    const code = q.toUpperCase();
    if (ID_RE.test(code)) {
      const info = await resolveStock(code).catch(() => null);
      if (info) {
        return NextResponse.json({
          results: [{ stockId: code, name: info.name, market: info.market }],
        });
      }
    }
    return NextResponse.json(
      { error: "名稱搜尋暫時無法使用，請改輸入代號" },
      { status: 503 }
    );
  }
}
