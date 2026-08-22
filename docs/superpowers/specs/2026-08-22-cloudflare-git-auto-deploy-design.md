# Cloudflare Git 自動部署設計

日期：2026-08-22（Asia/Taipei）

## 目標

將既有 Cloudflare Worker `tw-stock-tracker` 直接連接至 GitHub 儲存庫 `jack926509/Taiwan-stock-tracker`。合併或推送至 `main` 後，由 Cloudflare Workers Builds 自動驗證、建置並部署至正式 Worker；其他分支不在 Cloudflare 建置或部署。

完成後，Cloudflare Workers & Pages 專案列表與 Worker 的 Builds 設定會顯示 GitHub 儲存庫來源。

## 採用方案

採用 Cloudflare Workers Builds 原生 GitHub 整合，不以 GitHub Actions 執行正式部署。這個方案可直接在 Cloudflare 顯示 GitHub 來源，且由 Cloudflare 管理建置憑證與部署紀錄。

現有 GitHub Actions 保留為程式碼驗證管道，但移除 `workflow_dispatch` 與手動預覽上傳工作，避免 GitHub Actions 與 Cloudflare Workers Builds 同時持有部署責任。

## Cloudflare 設定

- 既有 Worker：`tw-stock-tracker`
- GitHub 儲存庫：`jack926509/Taiwan-stock-tracker`
- 正式分支：`main`
- 根目錄：`/`
- 非正式分支建置：停用
- 建置指令：`npm test && npx tsc --noEmit && npm run cf:build`
- 正式部署指令：`npx wrangler deploy`

Cloudflare 建置環境會先安裝 `package-lock.json` 鎖定的相依套件，再執行建置指令。Worker 名稱必須與 `wrangler.jsonc` 的 `name` 完全相同。

## 部署資料流

1. PR 分支與 PR 事件只由 GitHub Actions 執行測試與建置，不觸發 Cloudflare。
2. PR 合併至 `main`，或直接推送至 `main`。
3. GitHub Actions 執行現有驗證。
4. Cloudflare Workers Builds 同時取得該次 `main` commit，執行測試、型別檢查及 OpenNext Worker 建置。
5. 前述步驟全部成功後，Cloudflare 執行 `wrangler deploy`，更新現有正式 Worker。
6. 若任何步驟失敗，該次 Cloudflare 建置失敗，不更新正式 Worker；上一個正式版本繼續服務。

## 保留與不變更項目

- 保留 `twstock.xiehnet.com` Custom Domain。
- 保留 `wrangler.jsonc` 中的 Cron、routes、assets、service binding 與一般變數。
- 保留既有 Cloudflare Worker runtime secrets；不把 secrets 寫入 GitHub 或原始碼。
- 不建立新的 Pages 專案，也不刪除 Worker、網域、版本或資料。
- 不為非 `main` 分支建立 Cloudflare 預覽部署。

## 儲存庫變更

1. 更新 `.github/workflows/cloudflare-worker.yml`：保留 `push`、`pull_request` 的驗證工作，移除手動預覽上傳工作及 Cloudflare部署 secrets 的引用。
2. 更新 `CLAUDE.md`：將部署規則改為 `main` 由 Cloudflare Workers Builds 自動正式部署，並記錄非 `main` 分支不部署。

## 驗收標準

- Cloudflare Worker 的 Settings > Builds 顯示 `jack926509/Taiwan-stock-tracker`。
- Production branch 顯示 `main`，非正式分支建置為停用。
- 建置與部署指令符合本設計。
- GitHub Actions 不再包含手動 Cloudflare 預覽上傳工作。
- 以一個可識別且不影響功能的 `main` commit 觸發首次自動部署。
- Cloudflare 建置結果成功，部署 commit SHA 與 GitHub `main` 相同。
- `https://twstock.xiehnet.com/` 與 `/api/health` 回應正常，瀏覽器首頁可正常渲染。
- 現有 Custom Domain、Cron 與 runtime secrets 沒有遺失。

## 回復方式

若原生 Git 自動部署不穩定，先在 Worker Settings > Builds 停用或中斷 Git 連線；已上線版本仍會繼續服務。需要回復程式版本時，使用 Cloudflare 既有版本回滾，不刪除 Worker 或網域。
