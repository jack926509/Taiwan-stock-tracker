# Cloudflare Git 自動部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將既有 Cloudflare Worker 連接 GitHub，讓 `main` 自動部署正式站，其他分支只跑 GitHub 驗證。

**Architecture:** Cloudflare Workers Builds 是唯一正式部署管道，連接現有 `tw-stock-tracker` Worker 與 `jack926509/Taiwan-stock-tracker`。Cloudflare 只監聽 `main`，執行測試、型別檢查與 OpenNext 建置後以 Wrangler 部署；GitHub Actions 僅保留驗證。

**Tech Stack:** GitHub Actions、Cloudflare Workers Builds、Wrangler、OpenNext、Next.js、TypeScript。

**Spec:** `docs/superpowers/specs/2026-08-22-cloudflare-git-auto-deploy-design.md`

## Global Constraints

- Worker 必須維持名稱 `tw-stock-tracker`，與根目錄 `wrangler.jsonc` 的 `name` 一致。
- GitHub 儲存庫為 `jack926509/Taiwan-stock-tracker`；正式分支固定為 `main`。
- 停用 Cloudflare 非正式分支建置；不得建立 Cloudflare 預覽部署。
- 保留 `twstock.xiehnet.com`、Cron、routes、assets、service binding、runtime secrets 與現有 Worker。
- 不得將 Cloudflare token、帳戶 ID 或 runtime secrets 寫入 Git。

---

### Task 1: 限縮 GitHub Actions 為驗證管道

**Files:**
- Modify: `.github/workflows/cloudflare-worker.yml:1-57`
- Modify: `CLAUDE.md:18-19`
- Modify: `tests/cloudflare-config.test.mjs:62-121`

**Interfaces:**
- Consumes: GitHub `push` 與 `pull_request` 事件、根目錄 `package-lock.json`、`package.json` 的 `test`、`build`、`cf:build` scripts。
- Produces: 僅驗證的 GitHub Actions workflow；文件化的 Cloudflare Workers Builds 正式部署規則。

- [ ] **Step 1: 移除 workflow dispatch 與預覽上傳工作**

將 workflow 觸發條件限定為 `push` 和 `pull_request`，刪除 `upload-preview` job、`CLOUDFLARE_API_TOKEN` 及 `CLOUDFLARE_ACCOUNT_ID` 引用，使 GitHub Actions 不再具備部署能力。

- [ ] **Step 2: 更新專案部署文件**

將 `CLAUDE.md` 的部署段落改為：Cloudflare Workers Builds 連接 GitHub `main` 並在驗證成功後自動部署；非 `main` 分支不產生 Cloudflare 預覽版本；GitHub Actions 只負責驗證。

- [ ] **Step 3: 更新 workflow 合約測試**

將 `tests/cloudflare-config.test.mjs` 的 workflow 測試改為斷言 `push` 與 `pull_request` 仍會執行 `validate`，但 `workflow_dispatch`、`upload-preview`、`npm run cf:upload` 和 Cloudflare secrets 引用都不存在。

- [ ] **Step 4: 驗證 workflow 靜態內容**

執行：`rg -n 'workflow_dispatch|upload-preview|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID' .github/workflows/cloudflare-worker.yml`。

預期：無輸出，表示 workflow 不會手動或透過 secrets 上傳 Worker。

- [ ] **Step 5: 驗證 YAML 與工作區差異**

執行：`node -e "const fs=require('fs'); const y=fs.readFileSync('.github/workflows/cloudflare-worker.yml','utf8'); if (!/^on:/m.test(y)||!/pull_request:/.test(y)||!/push:/.test(y)) process.exit(1)" && git diff --check`。

預期：結束碼 0。

- [ ] **Step 6: Commit**

執行：`git add .github/workflows/cloudflare-worker.yml CLAUDE.md tests/cloudflare-config.test.mjs docs/superpowers/plans/2026-08-22-cloudflare-git-auto-deploy.md && git commit -m 'ci: 交由 Cloudflare Git 整合正式部署'`。

### Task 2: 連接既有 Cloudflare Worker 至 GitHub

**Files:**
- Modify: Cloudflare Dashboard 的 `tw-stock-tracker` Worker Settings > Builds（外部設定，不寫入 Git）

**Interfaces:**
- Consumes: `tw-stock-tracker` Worker、GitHub App 授權、`jack926509/Taiwan-stock-tracker`、根目錄 `wrangler.jsonc`。
- Produces: 監聽 `main` 的 Cloudflare Workers Builds production trigger，並在控制台顯示 GitHub 儲存庫來源。

- [ ] **Step 1: 連接 GitHub repository**

在 Cloudflare Workers & Pages 選擇 `tw-stock-tracker`，進入 Settings > Builds，選擇 Connect，授權 Cloudflare Workers and Pages GitHub App 存取 `jack926509/Taiwan-stock-tracker`。

- [ ] **Step 2: 設定 production trigger**

在 Build settings 設定根目錄 `/`、production branch `main`、build command `npm test && npx tsc --noEmit && npm run cf:build`、deploy command `npx wrangler deploy`。

- [ ] **Step 3: 關閉 non-production branch builds**

取消「Builds for non-production branches」，確認沒有 preview trigger。

- [ ] **Step 4: 驗證設定畫面**

確認 Cloudflare 顯示 GitHub repository `jack926509/Taiwan-stock-tracker`、production branch `main`、non-production branch builds 為關閉，且 Worker 名稱仍為 `tw-stock-tracker`。

### Task 3: 觸發並驗收首次自動正式部署

**Files:**
- Verify: `https://twstock.xiehnet.com/`
- Verify: `https://twstock.xiehnet.com/api/health`

**Interfaces:**
- Consumes: Task 1 的 `main` commit、Task 2 的 Cloudflare production trigger。
- Produces: 可追溯至 Git SHA 的 Cloudflare 正式部署與公開網站驗收證據。

- [ ] **Step 1: 推送 Task 1 commit 至 origin/main**

執行：`git push origin main`。

預期：遠端 `main` 前進，Cloudflare Workers Builds 收到同一個 commit。

- [ ] **Step 2: 等待並檢查 Cloudflare Build**

在 Worker Builds 歷程確認對應 Git SHA 的 production build 成功，部署 command 為 `npx wrangler deploy`，並記錄 Worker version。

- [ ] **Step 3: 驗證公開端點**

執行：`curl -fsS https://twstock.xiehnet.com/api/health`。

預期：回傳 JSON，且 `ok` 為 `true`。

- [ ] **Step 4: 以瀏覽器檢查首頁**

開啟 `https://twstock.xiehnet.com/`，確認可見「台股追蹤」、沒有白頁、主要導覽可操作。

- [ ] **Step 5: 檢查 Cloudflare 基礎設定未遺失**

在 Worker Settings 確認 Custom Domain `twstock.xiehnet.com`、四個 Cron 與 Worker runtime secrets 仍存在；不得顯示或複製 secret 值。

- [ ] **Step 6: 回報驗收結果**

回報 Git SHA、Cloudflare build 結果、正式 Worker version、公開 health 回應與首頁渲染結果；若 build 失敗，停止並保留上一個正式版本。
