// 「今日觸發提醒」則數（站內畫面用）：與收盤總覽 lib/daily-summary.ts 的 countTodayHits
// 同一套規則（伺服端記錄的 *_hit_at 落在今天台北日期，含到價、漲跌幅、爆量四種）。
// daily-summary.ts 會連帶載入伺服端模組，前端不能直接匯入，故這裡放一份只依賴 hitToday 的純函式；
// 測試以同一組資料比對兩者結果，防止日後分歧。
import { hitToday } from "./alertLogic.ts";

export interface HitStampItem {
  alert_high_hit_at: string | null;
  alert_low_hit_at: string | null;
  alert_change_hit_at: string | null;
  alert_volume_hit_at: string | null;
}

export function countTodayHitStamps(items: readonly HitStampItem[], now: Date): number {
  let n = 0;
  for (const i of items) {
    if (hitToday(i.alert_high_hit_at, now)) n++;
    if (hitToday(i.alert_low_hit_at, now)) n++;
    if (hitToday(i.alert_change_hit_at, now)) n++;
    if (hitToday(i.alert_volume_hit_at, now)) n++;
  }
  return n;
}
