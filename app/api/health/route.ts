// GET /api/health         → 輕量存活探針 { ok, ts }
// GET /api/health?detail=1 → 後端狀態（儲存模式、各表列數、上次 backfill、MIS session 新鮮度）
import { NextRequest } from "next/server";
import { getStatus } from "@/lib/status";
import { isAuthorizedHealthDetail } from "@/lib/healthAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = { ok: true, ts: new Date().toISOString() };
  if (req.nextUrl.searchParams.get("detail") !== "1") {
    return Response.json(base);
  }
  if (!(await isAuthorizedHealthDetail(req))) {
    return Response.json(
      { ok: false, error: "unauthorized", ts: base.ts },
      { status: 401 }
    );
  }
  try {
    const status = await getStatus(new Date());
    return Response.json({ ...base, ...status });
  } catch {
    console.error("[health] detail status failed");
    return Response.json(
      { ok: false, ts: base.ts, error: "health status unavailable" },
      { status: 503 }
    );
  }
}
