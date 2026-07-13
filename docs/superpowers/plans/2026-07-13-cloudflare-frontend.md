# Cloudflare 前端遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將靜態前端部署至 Cloudflare Pages，並以同網域 `/api/*` 安全代理既有 Zeabur 後端。

**Architecture:** 新增 `frontend/` 作為獨立 Next.js 靜態匯出專案，只引用既有用戶端頁面與元件，不含 `app/api`、middleware 或排程。Cloudflare Pages Function 將 `/api/*` 原樣代理至 Zeabur；個股深連結則回傳 `/stock/` 的靜態殼，由用戶端解析網址代號。

**Tech Stack:** Next.js 15 static export、Cloudflare Pages Functions、TypeScript、Node.js built-in test。

## Global Constraints

- Zeabur 的 Node.js API、Supabase 存取、TWSE 連線與排程一律保留。
- 前端瀏覽器請求維持相對 `/api/*`，不得公開任何後端 secret。
- Cloudflare Pages 只對 `/api/*` 與 `/stock/*` 呼叫 Function；其餘內容為靜態資產。
- 不納入既有未提交的介面修改。

---

### Task 1: 建立可測試的 Zeabur API 代理

**Files:**
- Create: `frontend/lib/apiProxy.ts`
- Create: `frontend/functions/api/[[path]].ts`
- Create: `tests/cloudflare-api-proxy.test.mjs`

**Interfaces:**
- Produces: `toBackendRequest(request: Request): Request` 與 `proxyApiRequest(request, fetcher?): Promise<Response>`。

- [ ] 寫失敗測試：`/api/health?detail=1` 必須轉成 `https://tw-stock-tracker.zeabur.app/api/health?detail=1`；非 `/api/` 路徑必須拒絕；上游回應狀態與本文必須保留。
- [ ] 執行 `node --test --experimental-transform-types tests/cloudflare-api-proxy.test.mjs`，確認尚未實作而失敗。
- [ ] 最小實作：以固定 Zeabur origin 加入原始 path 與 query，移除 `host`、`content-length`、`connection` 與 `cf-*` 請求標頭，再以注入的 fetcher 轉送。
- [ ] 執行 `node --test --experimental-transform-types tests/cloudflare-api-proxy.test.mjs && npm test`。
- [ ] 提交：`git add frontend/lib/apiProxy.ts frontend/functions/api/[[path]].ts tests/cloudflare-api-proxy.test.mjs && git commit -m "feat: 新增 Cloudflare API 代理"`。

### Task 2: 建立靜態前端與個股深連結

**Files:**
- Create: `frontend/package.json`, `frontend/next.config.ts`, `frontend/tsconfig.json`
- Create: `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/app/search/page.tsx`, `frontend/app/alerts/page.tsx`, `frontend/app/stock/page.tsx`
- Create: `frontend/functions/stock/[id].ts`, `lib/stockPath.ts`, `tests/stock-path.test.mjs`
- Modify: `app/stock/[id]/page.tsx:68-69`

**Interfaces:**
- Produces: `frontend/out/` 的 `/`、`/search/`、`/alerts/`、`/stock/` 靜態頁面。
- Produces: `stockIdFromPath(pathname: string): string`，`/stock/2330` 回傳 `2330`，其他路徑回傳空字串。

- [ ] 寫失敗測試，斷言 `stockIdFromPath("/stock/2330") === "2330"` 與 `stockIdFromPath("/stock") === ""`。
- [ ] 執行 `node --test --experimental-transform-types tests/stock-path.test.mjs`，確認 helper 尚不存在而失敗。
- [ ] 最小實作 helper；個股頁優先讀 `useParams()`，未匹配時讀 `stockIdFromPath(window.location.pathname)`。前端 `/stock/` 重用該 client page；Function 以 `context.env.ASSETS.fetch()` 回傳 `/stock/` 靜態資產。
- [ ] 設定 `output: "export"`、`trailingSlash: true` 與根目錄 `@/*` alias；執行 `npm --prefix frontend run build && test -f frontend/out/index.html && test -f frontend/out/stock/index.html`。
- [ ] 執行 `npm test && npm run build`，再提交靜態前端切片。

### Task 3: Cloudflare Pages 設定、文件與預覽驗收

**Files:**
- Create: `frontend/public/_routes.json`, `frontend/public/_headers`, `tests/cloudflare-config.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Pages build root: `frontend`；build command: `npm run build`；build output: `out`。
- Function include: `/api/*`、`/stock/*`。

- [ ] 寫失敗測試，讀取 `_routes.json` 並斷言 include 等於 `["/api/*", "/stock/*"]`。
- [ ] 執行 `node --test tests/cloudflare-config.test.mjs`，確認設定尚不存在而失敗。
- [ ] 建立設定與操作文件：HTML 設 `no-cache`、`/_next/static/*` 設一年 immutable cache；README 記錄 GitHub `main`、Cloudflare root directory 與自訂網域程序。
- [ ] 執行 `node --test tests/cloudflare-config.test.mjs && npm test && npm run build && npm --prefix frontend run build`。
- [ ] 提交設定切片，push 分支；建立 GitHub-connected Pages project、驗收預覽網址與 `/api/health`，最後新增並驗收 `twstock.xiehnet.com`。
