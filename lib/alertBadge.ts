// 「已設提醒」的統一判斷：漲到／跌到／漲跌幅／爆量四種任一有設定即成立。
// 供底部導覽徽章、首頁篩選、個股頁鈴鐺紅點與提醒總覽排序共用，
// 避免各處只算到價（high/low）而漏掉漲跌幅與爆量提醒。

export interface AlertFields {
  alert_high: number | null;
  alert_low: number | null;
  alert_change_pct: number | null;
  alert_volume_on: boolean;
}

export function hasAnyAlert(item: AlertFields): boolean {
  return (
    item.alert_high != null ||
    item.alert_low != null ||
    item.alert_change_pct != null ||
    item.alert_volume_on
  );
}
