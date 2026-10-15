import { NextRequest, NextResponse } from "next/server";
import { listPersonalRecords } from "@/lib/personalRecords";
import { taipeiNow } from "@/lib/market-hours";
import { taipeiDateRange } from "@/lib/personalDates";
import { publicAlertEvent, type AlertEvent } from "@/lib/alertEventTypes";
import { logApiError } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? taipeiNow().isoDate;
  const range = taipeiDateRange(date);
  const rawOffset = req.nextUrl.searchParams.get("offset") ?? "0";
  if (!range || !/^\d{1,6}$/.test(rawOffset) || Number(rawOffset) > 100000) {
    return NextResponse.json({error:"日期或分頁格式不正確"},{status:400});
  }
  const offset = Number(rawOffset), limit = 50;
  try {
    const result = await listPersonalRecords<AlertEvent>("alert:event:", { ...range, offset, limit });
    return NextResponse.json({date,total:result.total,offset,limit,
      nextOffset:offset+limit < result.total ? offset+limit : null,
      events:result.items.map(item=>publicAlertEvent(item.data))}, {headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    logApiError("api/alert-history",error);
    return NextResponse.json({error:"讀取提醒歷史失敗"},{status:500});
  }
}
