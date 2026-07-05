# tw-stock-tracker 專案規範

台股即時追蹤網頁，技術棧：Next.js + Supabase。

## 驗收指令
改動後依序執行：
1. `npm run build`（build 綠燈才算過）
2. `npm run smoke`（僅測本機／部署節點能否穩定連上 TWSE 即時報價源，**不是**完整功能測試，不驗證頁面、API 回應格式或 Supabase 連線）

## 部署
Zeabur（東京常駐 Node 服務，固定 IP）：https://tw-stock-tracker.zeabur.app

## 特殊規則
- Secrets 只能放在 `.env.local`，絕對不可進 git；範本檔為 `.env.local.example`（可進 git）。
- 排程任務（補資料、到價提醒、每日總結）邏輯見 `instrumentation-node.ts`。
- 一律繁體中文、絕對禁止簡體字。
