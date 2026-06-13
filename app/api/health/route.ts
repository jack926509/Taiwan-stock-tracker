// GET /api/health         → 輕量存活探針 { ok, ts }
// GET /api/health?detail=1 → 後端狀態（儲存模式、各表列數、上次 backfill、MIS session 新鮮度）
import { NextRequest } from "next/server";
import { getStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = { ok: true, ts: new Date().toISOString() };
  if (req.nextUrl.searchParams.get("detail") !== "1") {
    return Response.json(base);
  }
  try {
    const status = await getStatus(new Date());
    return Response.json({ ...base, ...status });
  } catch (e) {
    return Response.json({ ...base, statusError: (e as Error).message });
  }
}
