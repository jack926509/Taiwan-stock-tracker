# tw-stock-tracker 專案規範

台股即時追蹤網頁，技術棧：Next.js + OpenNext for Cloudflare + Supabase。正式頁面、API 與排程目標運行於單一 Cloudflare Worker；Supabase 是唯一正式資料庫。

根目錄 `app/`、`lib/` 與 `cloudflare-worker.ts` 是正式專案。`frontend/` 保留舊 Pages 靜態匯出外殼，部分頁面引用根目錄；維護時確認共用引用，不自行刪除舊平台檔案或資源。

## 驗收指令
改動後依序執行：
1. `npm test`（單元與整合測試全數通過）
2. `npx tsc --noEmit`（TypeScript 型別檢查通過）
3. `npm run build`（Next.js build 成功）
4. `npm run cf:build`（OpenNext Worker build 成功）
5. `npx wrangler deploy --dry-run`（確認壓縮後 bundle 小於 Cloudflare Workers Paid 限制；不會上傳）
6. `git diff --check`（無 whitespace error）
7. 啟動 `npm run cf:preview`，再以實際預覽網址與僅在 shell 注入的驗收 token 執行 `VERIFY_BASE_URL=<preview-url> VERIFY_HEALTH_DETAIL_TOKEN=<token> npm run verify:cloudflare`
8. 用桌面與 390 × 844 手機 viewport 實際檢查 `/`、`/search`、`/alerts`、`/stock/2330`，確認沒有白頁、console error、失效資源或無法操作的主要按鈕

`npm run smoke` 僅測試執行節點能否穩定連上 TWSE 即時報價源，不是完整功能測試，不驗證頁面、API 回應格式或 Supabase 連線。

通知、儲存與排程測試使用假 fetch、假資料庫或隔離資料；不要以正式自選股、Supabase 寫入或 LINE 發送代替自動測試。正式寫入及通知另須使用者明確授權。

## 報價與提醒契約

- MIS 暫時失敗時進入固定 5 分鐘等待；等待期間的輪詢不得延長到期時間，到期後重新嘗試 MIS。
- Yahoo 備援僅供顯示，必須標示來源、資料日期及可能延遲；兩個來源皆失敗時才顯示舊快照。
- 報價完整性必須涵蓋全部要求的代號，包含指數；快取不得把部分成功改標為完整，畫面須呈現缺漏。
- Yahoo 成交量在取得官方單位證據前回傳未知，不直接加總後當作「張」，也不參與爆量提醒。
- 盤中 LINE 到價提醒僅接受 `source: "mis"` 且 `complete: true` 的批次，之後逐檔檢查 `traded: true`、有效的當日來源時間及 120 秒新鮮度；送出前再次檢查該檔行情。缺少 MIS 的 `d` 或 `t` 時不得自行補成當日；該檔過舊或日期未知只跳過該檔，不以批次最舊 `asOf` 停掉其他有效股票。Yahoo、舊快照及不完整批次不得觸發通知。
- 收盤摘要只以每筆行情的台北來源日期選取當日實際成交；舊日、未知日期及未來時間不參與今日漲跌、排名或 K 線合成。站內摘要呈現來源、行情時間及缺漏；每日 LINE 總覽只接受完整 MIS 當日資料，不套用盤中到價的 120 秒門檻，保留 13:35 使用 13:30 收盤價的正常流程。
- 缺少完整可信的開高低收或成交量時，不合成當日 K 線或產生新技術訊號；開高低收須有限且大於零，高低須涵蓋開收，成交量須有限且非負，不以價格或零補欄位。當日有效行情仍可參與站內價差、家數及排名。
- 收盤 LINE 略過時記錄經格式檢查的股票代號與固定原因，不記錄股票名稱、原始行情、來源原文或例外。完整 MIS 站內摘要快取 10 分鐘，完整 Yahoo／舊快照及無當日資料的 `null` 只快取 30 秒；`null` 仍代表無摘要，部分摘要不快取。

## 部署
正式平台為 Cloudflare Workers Paid，由 OpenNext 轉換根目錄 Next.js 專案；`twstock.xiehnet.com` 已綁定同一個 Worker，頁面、API 與 Cron 都由 Worker 執行。Zeabur 不再承接正式流量；若舊服務仍存在，只能作為短期回退，不得在未取得使用者明確核准前停止或刪除。Cloudflare Workers Builds 連接 GitHub `jack926509/Taiwan-stock-tracker`，只有 `main` 分支推送時才會在測試、型別檢查與 OpenNext 建置成功後自動部署正式 Worker；其他分支不建立 Cloudflare 預覽版本。GitHub Actions 只負責驗證，不再上傳 Worker。推送 `main` 等同啟動正式發布，必須先取得使用者明確授權；本地優化或工作分支提交不代表已授權正式發布。

## 特殊規則
- 本機開發的 secrets 只能放在 `.env.local`，絕對不可進 git；範本檔為 `.env.local.example`（可進 git）。Worker runtime secrets 只設於 Cloudflare Worker Secrets，同樣不可進 git。
- Supabase 是唯一正式資料庫；本機 JSON 只供開發。Cloudflare Workers filesystem 不持久，禁止當作正式儲存。
- Worker Cron 與業務工作的分派見 `lib/scheduledJobs.ts`；四個 UTC Cron 以 `wrangler.jsonc` 為準。`instrumentation-node.ts` 只保留為遷移歷史，production 不得 import。
- Worker runtime 的應用程式 secrets 設於 Cloudflare Worker Secrets，不寫入 `wrangler.jsonc`、GitHub Actions logs 或原始碼。
- 一律繁體中文、絕對禁止簡體字。
