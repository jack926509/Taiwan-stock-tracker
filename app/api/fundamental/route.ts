// GET /api/fundamental?id=2330 — 法人買賣超 + 月營收 + 估值（12 小時快取）
import { NextRequest, NextResponse } from "next/server";
import { fetchFundamental } from "@/lib/providers/fundamentalProvider";
import {
  loadFundamental,
  saveFundamental,
  TTL_MS,
  RETRY_TTL_MS,
} from "@/lib/fundamentalStore";
import { taipeiNow } from "@/lib/market-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9A-Z]{4,6}$/;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toUpperCase();
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  }

  let cached;
  try {
    cached = await loadFundamental(id);
  } catch (e) {
    return NextResponse.json(
      { error: `讀取快取失敗：${(e as Error).message}` },
      { status: 500 }
    );
  }

  const now = new Date();
  if (cached && new Date(cached.expiresAt) > now) {
    return NextResponse.json({ stockId: id, asOf: cached.fetchedAt, ...cached.data });
  }

  try {
    const { complete, ...data } = await fetchFundamental(
      id,
      taipeiNow(now).isoDate
    );
    // 半套結果（任一資料集抓失敗）只存 30 分鐘，下次瀏覽自動重抓修復
    const fresh = await saveFundamental(
      id,
      data,
      now,
      complete ? TTL_MS : RETRY_TTL_MS
    );
    return NextResponse.json({ stockId: id, asOf: fresh.fetchedAt, ...data });
  } catch (e) {
    // 抓不到新資料時退回過期快照；完全沒快取才回錯誤
    if (cached) {
      return NextResponse.json({
        stockId: id,
        asOf: cached.fetchedAt,
        ...cached.data,
      });
    }
    return NextResponse.json(
      { error: `取得基本面資料失敗：${(e as Error).message}` },
      { status: 502 }
    );
  }
}
