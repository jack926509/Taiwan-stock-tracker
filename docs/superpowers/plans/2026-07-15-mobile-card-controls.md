# 手機版自選股卡片操作控制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將手機拖曳把手與桌機刪除按鈕完整收進自選股卡片，避免遮字與邊緣裁切，同時保留手機左滑刪除。

**Architecture:** 由首頁既有 `canSort` 狀態把 `reorderable` 傳入 `QuoteCard`，只在真正可排序時保留左側安全區。`SortableCard` 維持排序事件與 44 px 觸控目標，但改用卡片內定位；`QuoteCard` 的刪除按鈕僅在桌面顯示並使用卡片內定位。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、dnd-kit、Node.js test runner

## Global Constraints

- 不變更報價資料、後端 API、PWA 快取或刪除資料流程。
- 不覆蓋主工作區既有未提交修改。
- 嚴格依 RED → GREEN → REFACTOR 執行。
- `npm test`、`npm run build`、`npm run smoke` 未全數通過不得部署。

---

### Task 1: 新增卡片控制項回歸測試

**Files:**
- Modify: `tests/mobile-watchlist-home.test.mjs`
- Test: `tests/mobile-watchlist-home.test.mjs`

- [ ] 在既有手機卡片測試中要求拖曳把手使用卡片內 `left-2 top-2`，且不含負向 `left/top`。
- [ ] 要求刪除按鈕具備 `hidden md:flex`、卡片內 `right-2 top-2`，且不含負向 `right/top`。
- [ ] 要求首頁把 `canSort` 傳為 `reorderable`，卡片只在此狀態保留左側安全區。
- [ ] 執行 `node --test --experimental-transform-types --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/mobile-watchlist-home.test.mjs`，確認因現有負向定位與缺少 `reorderable` 而失敗。
- [ ] Commit: `test: 新增卡片控制項版面回歸測試`

### Task 2: 將控制項收進卡片

**Files:**
- Modify: `components/SortableCard.tsx`
- Modify: `components/QuoteCard.tsx`
- Modify: `app/page.tsx`
- Test: `tests/mobile-watchlist-home.test.mjs`

- [ ] 將 `SortableCard` 把手改為 `left-2 top-2`，手機維持 `h-11 w-11`，移除圓形外框、陰影與所有負向定位。
- [ ] 為 `QuoteCard` 增加 `reorderable?: boolean`，可排序時使用左側安全內距；不可排序時維持原內距。
- [ ] 手機隱藏刪除按鈕，桌面使用 `hidden md:flex` 並固定於卡片內 `right-2 top-2`；有刪除功能時桌面保留右側安全內距。
- [ ] 在 `app/page.tsx` 以 `reorderable={canSort}` 傳入狀態，保留 `SwipeToDelete`。
- [ ] 重跑單檔測試，確認通過；再執行 `npm test`，確認全部回歸測試通過。
- [ ] Commit: `fix: 改善手機自選股卡片操作控制`

### Task 3: 完整驗收與部署

**Files:**
- Verify only unless驗收發現直接相關問題

- [ ] 執行 `npm run build`。
- [ ] 執行 `npm run smoke`。
- [ ] 啟動本機網站，以 390 px 手機尺寸檢查拖曳把手、股票名稱、價格、刪除叉號與左滑底層。
- [ ] 執行變更範圍與無障礙審查，確認無負向控制項定位、觸控目標至少 44 px、焦點狀態可見。
- [ ] 推送 `codex/mobile-card-controls`，建立並合併 PR。
- [ ] 確認 Cloudflare 正式站 `https://twstock.xiehnet.com` 已更新且手機版渲染正常。
