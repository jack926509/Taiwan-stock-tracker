// 報價輪詢共用設定（MIS 限流硬規則：預設 10 秒、不可低於 5 秒）
export const POLL_MS = 10_000;

// 連續 N 次（約 1 分鐘）報價時間未變 → 視為異常（颱風/臨時停盤）自動停輪詢
export const STALE_STOP_THRESHOLD = 6;
