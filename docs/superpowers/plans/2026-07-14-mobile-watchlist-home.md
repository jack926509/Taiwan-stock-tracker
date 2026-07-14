# Mobile Watchlist Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將手機版首頁改為 A「資訊卡片型」自選股介面，讓使用者快速讀取行情、排序篩選及辨識離線快取資料。

**Architecture:** 保持既有首頁資料與 API 契約不變。`app/page.tsx` 只負責首頁版面與狀態組合；`QuoteCard` 在既有卡片上以 mobile-first class 調整資訊層級；拖曳元件只調整手機觸控把手。所有手機特有樣式以 Tailwind 斷點限定，桌面多欄格線與既有資料流維持相容。

**Tech Stack:** Next.js 15、React、TypeScript、Tailwind CSS、SWR、dnd-kit、Node test runner、Cloudflare Pages 靜態輸出。

## Global Constraints

- 不修改 Zeabur 後端、Supabase、Cloudflare API 代理或股票資料型別。
- 主要手機寬度為 360–430 CSS px；最小觸控目標為 44 × 44 CSS px。
- 離線資料維持 15 分鐘 Service Worker 快取上限，資料必須清楚標示快取。
- 不覆蓋既有未提交的 `app/globals.css`、`app/layout.tsx`、圖表與 Tailwind 修改。
- 桌面版維持現有搜尋、橫向版面與多欄自選股格線。
- 每個任務完成後必須執行指定測試並建立單一用途提交。

---

## File Structure

- Create: `tests/mobile-watchlist-home.test.mjs` — 驗證手機版首頁、卡片與拖曳把手的必要結構及離線重驗證設定。
- Modify: `app/page.tsx` — 手機 masthead、搜尋入口、自選股工具列、排序篩選與空狀態的版面。
- Modify: `components/QuoteCard.tsx` — 手機卡片的名稱、代號、價格、漲跌、成交量及時間層級。
- Modify: `components/SortableCard.tsx` — 44 px 手機拖曳把手與無障礙標籤。
- Modify: `components/MobileNetworkBanner.tsx` — 可選擇性顯示快取時間，且不影響既有頁面呼叫端。

## Task 1: 建立首頁重設計驗收測試

**Files:**
- Create: `tests/mobile-watchlist-home.test.mjs`
- Test: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: `app/page.tsx`、`components/QuoteCard.tsx`、`components/SortableCard.tsx`、`components/MobileNetworkBanner.tsx` 原始碼。
- Produces: 以原始碼契約保護手機首頁主要資訊、離線時間與拖曳觸控尺寸的 Node 測試。

- [ ] **Step 1: 寫入會失敗的測試**

```js
test("手機首頁提供搜尋入口、水平工具列與快取時間", async () => {
  const [page, banner] = await Promise.all([read("app/page.tsx"), read("components/MobileNetworkBanner.tsx")]);
  assert.match(page, /md:hidden[\s\S]*<StockSearch/);
  assert.match(page, /overflow-x-auto/);
  assert.match(banner, /asOf/);
});

test("自選股卡片與拖曳把手符合手機資訊層級", async () => {
  const [card, sortable] = await Promise.all([read("components/QuoteCard.tsx"), read("components/SortableCard.tsx")]);
  assert.match(card, /sm:flex-row/);
  assert.match(card, /成交/);
  assert.match(sortable, /h-11 w-11/);
});
```

- [ ] **Step 2: 執行測試並確認失敗**

Run: `node --test tests/mobile-watchlist-home.test.mjs`
Expected: FAIL，因為首頁尚未有手機搜尋入口／水平工具列，離線提示尚未接收 `asOf`。

- [ ] **Step 3: 保留測試作為後續實作驗收契約**

不要以測試字串取代實際 UI；後續任務必須讓測試反映可見需求。

- [ ] **Step 4: 不提交未通過的測試**

測試於 Task 2–4 實作完成後一併變綠並提交。

## Task 2: 重整手機首頁骨架與離線資料說明

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/MobileNetworkBanner.tsx`
- Modify: `tests/mobile-watchlist-home.test.mjs`
- Test: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: `QuoteResponse.asOf`、既有 `StockSearch`、`MobileNetworkBanner` 的 `stale` 與 `error`。
- Produces: `MobileNetworkBanner` 新增可選 `asOf?: string`，首頁於離線／快取時傳入 `data?.asOf`。

- [ ] **Step 1: 在首頁行動版呈現搜尋入口**

在原有桌面搜尋區塊前加入手機專屬區塊，保留桌面 `md:block` 行為：

```tsx
<div className="md:hidden">
  <StockSearch />
</div>
<div className="hidden md:block">
  <StockSearch />
</div>
```

將 `<main>` 手機水平內距改為 `px-4 py-4 sm:px-6 sm:py-6`，避免 360 px 寬螢幕過度壓縮。

- [ ] **Step 2: 將手機 masthead 調整為清楚兩層狀態列**

保留現有資料與按鈕，但將手機盤別改為可換行的文字區塊：

```tsx
<div className="text-right font-mono text-[11px] leading-tight tabular sm:hidden">
  <div>{now ? formatMastheadDateShort(now) : "--/-- --:--"}</div>
  <div className={data?.marketOpen ? "mt-0.5 font-semibold text-primary" : "mt-0.5 text-muted"}>
    {now ? getMarketSessionDetail(now) : "載入中"}
  </div>
</div>
```

- [ ] **Step 3: 擴充離線提示但保持相容**

將 Props 與訊息改為：

```tsx
interface MobileNetworkBannerProps {
  stale?: boolean;
  error?: unknown;
  asOf?: string;
}

const cachedAt = asOf
  ? new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(new Date(asOf))
  : null;
```

離線訊息包含 `cachedAt ? `快取時間 ${cachedAt}` : "最後一次快取資料"`，其它既有呼叫端不傳 `asOf` 時仍顯示原文案。

- [ ] **Step 4: 首頁傳遞資料時間並明確啟用恢復連線重新驗證**

```tsx
<MobileNetworkBanner
  stale={data?.source === "stale" || autoPaused}
  error={quote.error || watchlist.error}
  asOf={data?.asOf}
/>
```

對首頁的 `watchlist`、`quote`、`sparks` SWR 選項加入 `revalidateOnReconnect: true`。

- [ ] **Step 5: 執行測試**

Run: `node --test tests/mobile-watchlist-home.test.mjs`
Expected: 首頁搜尋與離線提示斷言通過；卡片與拖曳把手斷言仍失敗。

## Task 3: 建立資訊卡片型自選股與工具列

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/QuoteCard.tsx`
- Modify: `tests/mobile-watchlist-home.test.mjs`
- Test: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: `Quote` 的 `name`、`stockId`、`price`、`change`、`changePct`、`volume`、`time`。
- Produces: 不改變 `QuoteCard` public props 的 mobile-first 卡片結構。

- [ ] **Step 1: 將排序與篩選改為手機水平工具列**

排序與篩選容器採用以下 class，桌面仍可正常換行：

```tsx
<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
  {/* 排序或篩選按鈕 */}
</div>
```

每個按鈕加入 `min-h-11 shrink-0`，讓觸控目標至少 44 px。

- [ ] **Step 2: 調整卡片的手機掃視順序**

卡片的第一列改為名稱／代號與價格；第二列為方向、漲跌幅與漲跌金額；第三列顯示時間與成交量。保留 `Sparkline`、訊號、漲跌停及桌面刪除鈕：

```tsx
<div className="flex items-start justify-between gap-3">
  <div className="min-w-0">
    <div className="truncate font-serif text-base font-semibold text-ink">{quote.name}</div>
    <div className="mt-0.5 font-mono text-[11px] text-muted">{quote.stockId}・{quote.market === "tse" ? "上市" : "上櫃"}</div>
  </div>
  <div className="shrink-0 text-right">
    <div className={`font-mono text-3xl font-bold tabular ${textColor[t]}`}>{fmt(quote.price)}</div>
    <div className={`mt-1 font-mono text-xs font-semibold tabular ${textColor[t]}`}>{arrowOf(t)} {fmtPct(quote.changePct)}</div>
  </div>
</div>
```

使用現有 `fmtVol` 顯示成交量；報價時間使用 `quote.time`，不得捏造時間或資料狀態。

- [ ] **Step 3: 保留卡片導向與滑動刪除**

卡片主體仍使用 `<a href={`/stock/${quote.stockId}`}>`；不變更 `SwipeToDelete` 的判斷與刪除 API。

- [ ] **Step 4: 執行測試並確認變綠**

Run: `node --test tests/mobile-watchlist-home.test.mjs`
Expected: PASS，驗證卡片保留成交量／時間、工具列可水平捲動。

- [ ] **Step 5: 執行全套單元測試與提交**

Run: `npm test`
Expected: 全數通過。

```bash
git add app/page.tsx components/QuoteCard.tsx components/MobileNetworkBanner.tsx tests/mobile-watchlist-home.test.mjs
git commit -m "feat: 重整手機版自選股首頁"
```

## Task 4: 調整手機拖曳與底部安全區域，完成驗收

**Files:**
- Modify: `components/SortableCard.tsx`
- Modify: `tests/mobile-watchlist-home.test.mjs`
- Test: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: `SortableCard` 的 dnd-kit `listeners` 與 `attributes`。
- Produces: 手機可觸控的 44 px 拖曳把手，桌面 hover 行為不變。

- [ ] **Step 1: 調整拖曳把手尺寸與可見性**

將按鈕 class 中的 `h-7 w-7` 改為 `h-11 w-11`；手機預設顯示，把手在桌面用 `md:opacity-0` 及 `[@media(hover:hover)]` 規則維持 hover 顯示。保留 `touch-none`、`cursor-grab`、`aria-label="拖曳排序"`。

- [ ] **Step 2: 完成測試契約**

Run: `node --test tests/mobile-watchlist-home.test.mjs`
Expected: PASS，確認 `h-11 w-11`、水平工具列、快取時間與手機搜尋入口均存在。

- [ ] **Step 3: 執行建置與靜態前端建置**

Run: `npm run build`
Expected: exit 0。

Run: `npm --prefix frontend run build`
Expected: exit 0，靜態輸出維持可用。

- [ ] **Step 4: 實際瀏覽器驗收**

以本機首頁在 390 × 844 與桌面寬度確認：搜尋、兩張以上卡片資訊、工具列水平捲動、底部導覽、拖曳把手、未截斷價格，以及桌面多欄。停止本機伺服器後重載一次，確認 PWA 快取仍能開啟介面；恢復伺服器後確認 API 請求重新嘗試。

- [ ] **Step 5: 提交驗收完成的拖曳調整**

```bash
git add components/SortableCard.tsx tests/mobile-watchlist-home.test.mjs
git commit -m "feat: 強化手機自選股排序操作"
```

## Plan Self-Review

- 覆蓋目標、首頁架構、卡片資訊、排序篩選、離線更新、響應式、可及性、錯誤與空狀態及驗收標準。
- 未保留未完成項目或未定義介面；新增 Props 為可選，既有呼叫端維持相容。
- 不修改後端與桌面資料流；所有程式修改均限定於規格列出的元件。
