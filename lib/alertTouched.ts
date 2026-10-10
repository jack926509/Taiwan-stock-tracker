// 「已觸及」的單一判斷（只用於畫面顯示，不參與 LINE 通知／排程）：
// 目前行情已越過到價提醒價——漲到提醒：現價 ≥ 提醒價；跌到提醒：現價 ≤ 提醒價。
// 提醒頁 App、首頁提醒摘要、今日觸發則數、底部導覽紅點共用同一套，數字才會一致。
// 只用相對匯入，方便 node --test 直接載入。

export interface TouchableAlert {
  alert_high: number | null;
  alert_low: number | null;
}

export function isHighTouched(price: number | null | undefined, high: number | null | undefined): boolean {
  return price != null && Number.isFinite(price) && high != null && price >= high;
}

export function isLowTouched(price: number | null | undefined, low: number | null | undefined): boolean {
  return price != null && Number.isFinite(price) && low != null && price <= low;
}

// 已觸及的提醒則數（一檔同時設高低價且都越過則算 2 則）。
// priceOf：以股票代號取現價；查不到或 null 視為未觸及。
export function countTouchedAlerts(
  items: readonly (TouchableAlert & { stock_id: string })[],
  priceOf: (stockId: string) => number | null | undefined
): number {
  let n = 0;
  for (const item of items) {
    const price = priceOf(item.stock_id);
    if (isHighTouched(price, item.alert_high)) n++;
    if (isLowTouched(price, item.alert_low)) n++;
  }
  return n;
}
