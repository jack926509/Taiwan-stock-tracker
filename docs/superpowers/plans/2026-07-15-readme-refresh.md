# README 功能優先重整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 README 重寫成核心功能優先、視覺清楚且符合目前正式環境的專案首頁。

**Architecture:** 只修改 `README.md`，不變更產品程式碼、環境變數或部署設定。內容以實際程式與正式部署為準，先呈現功能與正式入口，再提供架構、啟動、部署、驗收與安全資訊。

**Tech Stack:** Markdown、Mermaid、Next.js 15、React 19、Cloudflare Pages、Zeabur、Supabase

## Global Constraints

- 核心功能必須放在 README 最前段。
- Cloudflare `https://twstock.xiehnet.com` 是主要入口；Zeabur `https://tw-stock-tracker.zeabur.app` 是後端與備援入口。
- 只描述已實作功能，不保留 Web Push 計畫或不存在的密度切換。
- 使用繁體中文；中文與英文、數字之間保留半形空格。
- 不揭露 `.env.local`、API key、service role key 或其他 secret。
- 不修改 `README.md` 以外的產品檔案。

---

### Task 1: 重寫 README 資訊架構與內容

**Files:**
- Modify: `README.md:1`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-15-readme-refresh-design.md`、目前正式網址、`package.json` 指令、`.env.local.example` 變數名稱、`app/api` 路由與 `frontend` 部署設定。
- Produces: 可直接作為 GitHub repository 首頁的完整 `README.md`。

- [ ] **Step 1: 以功能優先結構取代既有 README**

使用以下完整段落順序，避免把技術細節放在核心功能前面：

```markdown
# 台股追蹤

一句話定位、主要網站與後端備援入口。

## 核心功能
六項已上線功能：即時行情、自選股、個股分析、收盤總覽、LINE 提醒、PWA／離線體驗。

## 系統如何運作
Mermaid：使用者 → Cloudflare Pages → Zeabur API → TWSE／FinMind／Supabase。

## 本機快速啟動
安裝、複製環境範本、啟動三個指令，以及不填金鑰時的本機 JSON 模式。

## 環境變數
只列目前程式實際需要的變數、用途與必要性。

## 常用指令與驗收
dev、test、build、start、smoke。

## 部署
說明 GitHub main 同時觸發 Cloudflare 前端與 Zeabur 後端，並列 Cloudflare build 設定。

## 安全與資料
說明 secrets、RLS、健康檢查授權、資料來源與免責聲明。
```

- [ ] **Step 2: 校正功能與部署事實**

逐項核對並保留以下內容：

```text
Cloudflare 主要入口：https://twstock.xiehnet.com
Zeabur 後端／備援：https://tw-stock-tracker.zeabur.app
即時行情：TWSE MIS，盤中每 10 秒更新
歷史與基本面：FinMind
儲存：Supabase 或本機 .data JSON
站內收盤總覽：休市時段顯示
排程：盤中提醒、13:35 收盤總覽、17:00 補 K、週末 keep-alive
Cloudflare root directory：frontend
Cloudflare build command：npm run build
Cloudflare output directory：out
```

- [ ] **Step 3: 移除過時與重複內容**

確認 README 不再包含：

```text
上層 Taiwan-Stock-Tracker-Build-Plan.md v5.1 連結
精簡／詳細密度切換
Web Push 優化計劃
重複的部署與指令段落
未實作功能的承諾
```

### Task 2: 驗證 README 與專案仍一致

**Files:**
- Verify: `README.md`
- Verify: `package.json`
- Verify: `.env.local.example`
- Verify: `frontend/next.config.ts`

**Interfaces:**
- Consumes: Task 1 完成的 `README.md`。
- Produces: 通過內容、格式、測試與 build 驗證的文件變更。

- [ ] **Step 1: 檢查 Markdown 結構與過時字串**

Run:

```bash
rg -n '^#{1,3} ' README.md
rg -n 'Build-Plan|密度切換|Web Push|TODO|TBD' README.md
```

Expected: 第一個指令顯示標題層級依序；第二個指令無輸出。

- [ ] **Step 2: 檢查網址、指令與必要部署設定**

Run:

```bash
rg -n 'twstock\.xiehnet\.com|tw-stock-tracker\.zeabur\.app|npm test|npm run build|Root directory|frontend|Build output|out' README.md
```

Expected: 所有必要網址、驗收指令與 Cloudflare 設定皆存在。

- [ ] **Step 3: 執行專案驗收**

Run:

```bash
npm test
npm run build
cd frontend && npm run build
```

Expected: 測試 97 項全數通過；根目錄 build 成功；Cloudflare 靜態頁 19 頁全數輸出成功。

- [ ] **Step 4: 檢查差異並提交**

Run:

```bash
git diff --check
git diff -- README.md
git add README.md
git commit -m "docs: 重整 README 強調核心功能"
```

Expected: diff 只有 README 文件內容，沒有空白錯誤、程式碼或 secrets 變更。
