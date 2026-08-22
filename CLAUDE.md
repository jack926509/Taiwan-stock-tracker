# tw-stock-tracker 專案規範

台股即時追蹤網頁，技術棧：Next.js + OpenNext for Cloudflare + Supabase。正式頁面、API 與排程目標運行於單一 Cloudflare Worker；Supabase 是唯一正式資料庫。

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

## 部署
正式平台為 Cloudflare Workers Paid，由 OpenNext 轉換根目錄 Next.js 專案；`twstock.xiehnet.com` 已綁定同一個 Worker，頁面、API 與 Cron 都由 Worker 執行。Zeabur 不再承接正式流量；若舊服務仍存在，只能作為短期回退，不得在未取得使用者明確核准前停止或刪除。Cloudflare Workers Builds 連接 GitHub `jack926509/Taiwan-stock-tracker`，只有 `main` 分支推送時才會在測試、型別檢查與 OpenNext 建置成功後自動部署正式 Worker；其他分支不建立 Cloudflare 預覽版本。GitHub Actions 只負責驗證，不再上傳 Worker。

## 特殊規則
- 本機開發的 secrets 只能放在 `.env.local`，絕對不可進 git；範本檔為 `.env.local.example`（可進 git）。Worker runtime secrets 只設於 Cloudflare Worker Secrets，同樣不可進 git。
- Supabase 是唯一正式資料庫；本機 JSON 只供開發。Cloudflare Workers filesystem 不持久，禁止當作正式儲存。
- Worker Cron 與業務工作的分派見 `lib/scheduledJobs.ts`；四個 UTC Cron 以 `wrangler.jsonc` 為準。`instrumentation-node.ts` 只保留為遷移歷史，production 不得 import。
- Worker runtime 的應用程式 secrets 設於 Cloudflare Worker Secrets，不寫入 `wrangler.jsonc`、GitHub Actions logs 或原始碼。
- 一律繁體中文、絕對禁止簡體字。
