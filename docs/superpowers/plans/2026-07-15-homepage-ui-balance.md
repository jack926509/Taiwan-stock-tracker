# 首頁 UI 平衡改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 A「3 欄平衡卡片」重整首頁，消除卡片空白帶、名稱截斷、狀態擁擠與首頁資訊層級不清。

**Architecture:** 保留既有 SWR 資料流、API、排序、篩選、拖曳與 PWA 行為，只調整首頁組合元件、卡片呈現、刪除確認與設計 token。根目錄與 `frontend` 共用同一套頁面及元件，因此每個切片都要維持兩套 Next.js build 相容。

**Tech Stack:** Next.js 15、React 19、Tailwind CSS 3、Node test runner、SWR、dnd-kit。

## Global Constraints

- 一律使用繁體中文，中文與英文或數字之間保留半形空格。
- 不修改後端 API、Supabase、報價資料格式、Zeabur 或 Cloudflare API 代理。
- 保留既有未提交的深色模式、圖表與 hydration 修改，不覆蓋無關變更。
- 不部署、不推送 GitHub；完成後只交付本機驗證結果與 diff。
- 實作循序為 RED 測試、GREEN 實作、完整驗證、獨立審查。

---

### Task 1: 鎖定卡片版面與狀態規則

**Files:**
- Modify: `tests/mobile-watchlist-home.test.mjs`
- Modify: `components/QuoteCard.tsx`
- Modify: `components/Sparkline.tsx`
- Modify: `components/DraggableGrid.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- `QuoteCard` 繼續接收 `quote`、`spark`、`signals` 與刪除回呼。
- `Sparkline` 維持 `points: number[]`，改為固定中性主色並提供「20 日走勢」標示。

- [ ] 先新增卡片最多 3 欄、最多 1 個訊號、標籤禁止換行、走勢語意標示的失敗測試。
- [ ] 執行 `npm test -- --test-name-pattern="自選股卡片"`，確認新測試因現況 4 欄與標籤擠壓而失敗。
- [ ] 將桌面格線改為最多 3 欄，卡片改成名稱／價格、狀態／走勢、時間／成交量三段固定格線。
- [ ] 漲停／跌停取代一般漲跌標籤；未成交移到時間區；首頁只顯示第一個技術訊號。
- [ ] 執行 `npm test`，確認完整測試通過。

### Task 2: 重整首頁資訊層級與色彩

**Files:**
- Modify: `components/IndexCard.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- 不新增資料介面；只重新組合既有指數、搜尋、排序與篩選資料。

- [ ] 先新增指數集中排列、排序／篩選標示、按鈕一致尺寸與重要文字至少 12px 的失敗測試。
- [ ] 執行對應 Node 測試，確認舊版未符合新契約。
- [ ] 重排指數列、自選股標題、搜尋／新增、排序與篩選工具列。
- [ ] 將背景調淡、卡片提亮、分隔線與警告文字提高對比；同步調整深色模式。
- [ ] 以 `npm test` 與 `npm run build` 驗證此切片。

### Task 3: 加入安全刪除與無障礙回饋

**Files:**
- Create: `components/DeleteStockDialog.tsx`
- Modify: `components/SwipeToDelete.tsx`
- Modify: `components/QuoteCard.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- 頁面以 `pendingDelete: { stockId: string; name: string } | null` 控制共用確認對話框。
- 桌面刪除與手機左滑只提出刪除要求；使用者確認後才呼叫既有 DELETE API。

- [ ] 先新增「左滑不立即刪除」「確認後才刪除」「存在 polite 狀態區」的失敗測試。
- [ ] 實作有焦點管理的確認對話框；取消時不改資料，錯誤時保留卡片。
- [ ] 補齊更新、排序、篩選、拖曳、刪除的 `focus-visible`；移除 `transition-all`。
- [ ] 執行 `npm test` 與 `npm run build`。

### Task 4: 完整驗收與獨立審查

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] 執行 `npm test`。
- [ ] 執行 `npm run build`。
- [ ] 執行 `npm --prefix frontend run build`。
- [ ] 執行 `npm run smoke`。
- [ ] 以真實瀏覽器檢查 390×844、768px、1280×800、1440px、深色模式與鍵盤操作。
- [ ] 使用長 ETF 名稱、漲停＋未成交、無訊號與不同位數價格確認沒有空白帶、直排或重疊。
- [ ] 交給獨立 AI 審查 diff、驗收條件與風險，修正確定的問題後重跑全部驗證。
