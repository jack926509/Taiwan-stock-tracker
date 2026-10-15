import { NextRequest, NextResponse } from "next/server";
import { resolveStock } from "@/lib/providers/quoteProvider";
import {
  listWatchlist,
  addWatch,
  removeWatch,
  reorderWatch,
  setAlert,
  setWatchGroup,
  usingSupabase,
  type AlertSide,
} from "@/lib/store";
import { logApiError, publicErrorBody } from "@/lib/apiErrors";
import { normalizeGroupName } from "@/lib/watchlistGroups";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listWatchlist();
    return NextResponse.json({ items, storage: usingSupabase() ? "supabase" : "local" });
  } catch (err) {
    logApiError("api/watchlist GET", err);
    return NextResponse.json(publicErrorBody("讀取自選股失敗", err), { status: 500 });
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
    logApiError("api/watchlist POST", err);
    return NextResponse.json(publicErrorBody("新增自選股失敗", err), { status: 500 });
  }
}

// 設定提醒門檻：{ stockId, high, low, changePct, volumeOn }
// high/low/changePct 為數字或 null（null=取消該側）；volumeOn 為布林（開關爆量提醒）
export async function PATCH(req: NextRequest) {
  let body: {
    stockId?: unknown;
    high?: unknown;
    low?: unknown;
    changePct?: unknown;
    volumeOn?: unknown;
    rearm?: unknown;
    groupName?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }
  const stockId =
    typeof body.stockId === "string" ? body.stockId.trim().toUpperCase() : "";
  if (!/^[0-9A-Z]{4,6}$/.test(stockId)) {
    return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  }
  if(body.groupName!==undefined) {
    const groupName=typeof body.groupName==="string"?normalizeGroupName(body.groupName):null;
    if(groupName===null||[body.high,body.low,body.changePct,body.volumeOn,body.rearm].some(value=>value!==undefined)) {
      return NextResponse.json({error:"分組名稱最多 20 字，請與提醒條件分開儲存"},{status:400});
    }
    try {
      if(!await setWatchGroup(stockId,groupName))return NextResponse.json({error:"自選清單中沒有此股票"},{status:404});
      return NextResponse.json({ok:true,stockId,groupName});
    } catch(error) {
      logApiError("api/watchlist group",error);
      return NextResponse.json({error:"儲存分組失敗"},{status:500});
    }
  }
  const parse = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v !== "string" && typeof v !== "number") return NaN;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const high = parse(body.high);
  const low = parse(body.low);
  const changePct = parse(body.changePct);
  if (Number.isNaN(high) || Number.isNaN(low) || Number.isNaN(changePct)) {
    return NextResponse.json({ error: "門檻需為正數" }, { status: 400 });
  }
  if (body.volumeOn !== undefined && typeof body.volumeOn !== "boolean") {
    return NextResponse.json({ error: "爆量開關格式不正確" }, { status: 400 });
  }
  const sides: AlertSide[] = ["high", "low", "change", "volume"];
  if (body.rearm !== undefined && (!Array.isArray(body.rearm) || body.rearm.some(side => !sides.includes(side)))) {
    return NextResponse.json({ error: "重新啟用條件格式不正確" }, { status: 400 });
  }
  const rearm = [...new Set((body.rearm ?? []) as AlertSide[])];
  const volumeOn = body.volumeOn as boolean | undefined;
  try {
    const found = await setAlert(stockId, high, low, changePct, volumeOn, rearm);
    if (!found) return NextResponse.json({ error: "自選清單中沒有此股票" }, { status: 404 });
    return NextResponse.json({ ok: true, stockId, high, low, changePct, volumeOn, rearm });
  } catch (err) {
    logApiError("api/watchlist PATCH", err);
    return NextResponse.json(publicErrorBody("設定到價提醒失敗", err), { status: 500 });
  }
}

// 拖曳排序：{ order: string[] }，依陣列順序重寫 sort_order
export async function PUT(req: NextRequest) {
  let body: { order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  }
  const order = Array.isArray(body.order)
    ? body.order.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : null;
  if (!order || order.length === 0) {
    return NextResponse.json({ error: "缺少 order" }, { status: 400 });
  }
  try {
    await reorderWatch(order);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/watchlist PUT", err);
    return NextResponse.json(publicErrorBody("更新排序失敗", err), { status: 500 });
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
    logApiError("api/watchlist DELETE", err);
    return NextResponse.json(publicErrorBody("刪除自選股失敗", err), { status: 500 });
  }
}
