# 台股追蹤

一套以「快速掌握自選股狀態」為核心的台股追蹤工具，整合即時行情、技術圖表、基本面、法人動向、收盤摘要與 LINE 到價通知，並支援手機安裝與離線瀏覽。

> **遷移狀態：** Cloudflare Worker 程式已進入本機驗收，但尚未綁定正式網域；現行正式服務仍由 [Zeabur](https://tw-stock-tracker.zeabur.app) 提供。預覽驗收、Supabase migration 與正式切換都要另行取得核准，本機指令不會自動部署。

## ✨ 核心功能

### 即時行情與大盤

- 串接證交所 MIS 行情，交易時段每 10 秒自動更新。
- 集中呈現成交價、漲跌幅、成交量與更新時間，並採台股「紅漲綠跌」配色。
- 提供加權、櫃買等市場指數、近 20 日走勢，以及自選股排序與篩選。

### 自選股管理

- 可用股票代號或名稱搜尋、新增與刪除自選股。
- 支援拖曳排序、條件篩選與行動裝置滑動操作。
- 設定可保存至 Supabase；未設定雲端服務時，會改用本機 JSON 儲存。

### 個股圖表與基本面

- 提供日、週、月 K 線與不同觀察區間，搭配成交量、均線及布林通道。
- 整合本益比、股價淨值比、殖利率、月營收、EPS 與三大法人買賣超。
- 使用 Lightweight Charts 呈現互動式圖表，方便快速切換與比對。

### 站內收盤總覽

- 收盤後彙整大盤表現、自選股漲跌家數、當日與近一週變化。
- 自動整理強弱勢個股、技術訊號與已觸發提醒，減少逐檔檢查時間。

### 到價提醒與 LINE 通知

- 可設定突破價、跌破價、漲跌幅與成交量等提醒條件。
- 排程服務定期檢查條件，觸發後可透過 LINE Messaging API 推播。
- 站內可管理提醒狀態並查看觸發結果。

### PWA 與行動裝置支援

- 可安裝至手機主畫面，提供接近原生 App 的操作體驗。
- 支援離線提示、底部導覽與觸控友善操作。
- 介面以清楚對比、可讀字級與至少 44 px 的主要觸控區域為基準。

## 🧭 系統如何運作

```mermaid
flowchart LR
    U["使用者與手機 PWA"] --> CF["Cloudflare Worker<br/>Next.js 頁面、API 與 Cron"]
    CF --> TWSE["證交所 MIS"]
    CF --> FM["FinMind"]
    CF --> SB["Supabase<br/>唯一正式資料庫"]
    CF --> LINE["LINE Messaging API"]
```

| 層級 | 使用技術 | 主要用途 |
| --- | --- | --- |
| 前端 | Next.js、React、Tailwind CSS、Lightweight Charts | 儀表板、圖表、PWA 與互動操作 |
| 後端 | Next.js Route Handlers、OpenNext for Cloudflare | 行情整合、摘要與提醒 |
| 排程 | Cloudflare Cron Triggers | 到價提醒、收盤摘要、K 線補資料與 keep-alive |
| 資料層 | Supabase PostgreSQL | 唯一正式資料庫，保存自選股、提醒、快取與排程狀態 |

正式環境只使用 Supabase 持久化資料。專案中的本機 JSON 模式僅供本機開發；Cloudflare Workers 的檔案系統不持久，不得當成正式儲存。

## 🚀 本機快速啟動

需求：Node.js 22 以上版本。

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 即可使用。本機未設定 Supabase 時，部分儲存功能會使用 `.data/` 目錄的 JSON 檔案；這項 fallback 不適用於 Cloudflare Worker 正式環境。

## 🔐 環境變數

| 變數 | 必要性 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Worker 必要 | Supabase 專案網址；同時提供給 Next.js 建置與 Worker runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker 必要 | 後端存取 Supabase，禁止放入前端或提交至 Git |
| `FINMIND_TOKEN` | 功能必要 | 取得歷史行情、基本面與法人資料 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 必要 | 傳送 LINE 到價通知 |
| `LINE_TARGET_USER_ID` | LINE 必要 | LINE 通知接收者 ID |
| `APP_ACCESS_PASSWORD` | 正式環境必要 | 限制網站存取 |
| `HEALTH_DETAIL_TOKEN` | 正式環境必要 | 保護 `/api/health?detail=1` 的 Bearer token |
| `APP_BASE_URL` | Worker 必要 | 網站基礎網址，也用於提醒訊息連結 |

`NEXT_PUBLIC_*` 變數會在建置時寫入前端產物，須於部署平台的建置環境設定。所有私密金鑰只應存在後端環境變數，不可提交至版本庫。

## 🛠️ 常用指令與驗收

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動本機開發環境 |
| `npm test` | 執行單元與整合測試 |
| `npx tsc --noEmit` | 檢查 TypeScript 型別 |
| `npm run build` | 建置 Next.js 產物 |
| `npm run cf:build` | 以 OpenNext 產生 Cloudflare Worker 與靜態資源 |
| `npx wrangler deploy --dry-run` | 檢查可上傳 bundle 的 gzip 大小；不會上傳或部署 |
| `npm run cf:preview` | 以本機 workerd 啟動 Worker 預覽 |
| `npm run cf:upload` | 上傳 Worker 預覽版本；需 Cloudflare 憑證，不綁定正式網域 |
| `VERIFY_BASE_URL=<URL> npm run verify:cloudflare` | 實打預覽版的首頁、登入、健康檢查、manifest 與 service worker |
| `npm run start` | 啟動正式模式伺服器 |
| `npm run smoke` | 長時間檢查證交所 MIS 行情穩定性 |

每次變更至少依序執行 `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run cf:build` 與 `git diff --check`。預覽啟動後，再以實際預覽 URL 執行 `npm run verify:cloudflare` 與桌面／手機瀏覽器驗收。`npm run smoke` 僅檢查 TWSE 行情來源穩定性，不等同完整功能測試。

## ⏰ Worker 排程

Cloudflare Cron 以 UTC 設定，Worker 會依 `event.cron` 分派下列工作：

| 工作 | Cron（UTC） | 台北時間（UTC+8） | 守門條件 |
| --- | --- | --- | --- |
| 到價提醒 | `* * * * 1-5` | 週一至週五每分鐘 | 只有台股盤中才執行 |
| 收盤總覽 | `35 5 * * 1-5` | 週一至週五 13:35 | 非交易日跳過 |
| K 線補資料 | `0 9 * * 1-5` | 週一至週五 17:00 | 取得 Supabase 租約後執行 |
| Supabase keep-alive | `30 4 * * 0,6` | 週六、週日 12:30 | 取得 Supabase 租約後執行 |

四種工作都使用 Supabase 原子租約避免重複執行，並把最後執行狀態寫回 `scheduled_job_state`。

## ☁️ Cloudflare Workers 部署流程

目標運行環境是 **Cloudflare Workers Paid**。根目錄 Next.js 專案由 OpenNext 轉換，同一個 Worker 同時提供頁面、Static Assets、Route Handlers 與 Cron `scheduled` handler。

1. 本機執行完整測試與兩種 build。
2. 執行 `npm run cf:preview`，用 workerd 實際驗收頁面與公開 API。
3. 必要時由 GitHub Actions 手動 `workflow_dispatch`，在 `validate` 成功後才執行 `npm run cf:upload`。一般 push 與 pull request 只會驗證，不會上傳或部署。
4. 以預覽 URL 執行 `VERIFY_BASE_URL=<preview-url> npm run verify:cloudflare`，再完成 Supabase、LINE、四種 Cron、Workers Logs 與盤中 TWSE 驗收。
5. 全部驗收通過且取得使用者明確核准後，才能綁定 `twstock.xiehnet.com` 與停止 Zeabur；不得在預覽驗收前切換正式網域。

`wrangler.jsonc` 只放公開設定；應用程式 secrets 只設於 Cloudflare Worker Secrets。GitHub Actions 只使用上傳所需的 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`，不複製 Supabase、FinMind、LINE 或登入密碼。

## 🛡️ 資料與安全

- 即時行情主要取自證交所 MIS；歷史與基本面資料由 FinMind 補充。
- Supabase 使用 `service_role` 從後端存取，不將私密金鑰暴露給瀏覽器。
- 詳細健康資訊需使用 `HEALTH_DETAIL_TOKEN`；API 錯誤回應避免回傳內部例外內容。
- 本專案提供資料整理與追蹤功能，資訊可能因來源延遲或中斷而不完整，不構成投資建議。

---

若網站顯示的行情與交易所資訊不一致，請以臺灣證券交易所及櫃買中心公告為準。
