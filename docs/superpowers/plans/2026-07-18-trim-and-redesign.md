# 程式碼精簡＋全站視覺重設計 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 `docs/superpowers/specs/2026-07-16-redesign-and-trim-design.md`（2026-07-18 定稿）先做行為不變的程式碼精簡，再把全站視覺換成「表格補完版型 × 暖米白 × 深墨互動色」。

**Architecture:** 精簡（Task 1-5）與重設計（Task 6-11）嚴格分段：精簡每步行為不變、小提交、可單獨回退；重設計以 `docs/superpowers/specs/2026-07-18-visual-spec-final.html`（下稱**視覺規範**）為唯一視覺準據，先換 token 層再逐頁改版。既有 CSS 變數機制（globals.css 存 R G B 三數字＋tailwind `rgb(var(--x) / <alpha-value>)`）不動架構、只換值與增補 token。

**Tech Stack:** Next.js（App Router）、Tailwind、Supabase、lightweight-charts（KlineChart）、node --test。

## Global Constraints

- 一律繁體中文，禁止簡體字；中文與英文/數字之間半形空格。
- **紅漲綠跌絕對不可反**（漲 `--c-up` 紅、跌 `--c-down` 綠）。
- **介面不得出現藍／靛藍系互動色**（使用者明確要求；互動色一律深墨系）。
- 驗收指令：`npm run build`（綠燈）＋ `npm run smoke`（PASS）；改共用邏輯加跑 `npm test`。
- 每個 Task 結尾一個 commit，訊息句尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 不提交 `.env*`／secrets；不 force-push main。
- 精簡階段（Task 1-5）對外行為、API 契約、輸出格式完全不變。
- 頁面在 390px 與 1440px 皆不得水平溢出、不得大片留白。
- 尊重 `prefers-reduced-motion`。

---

## 檔案結構總覽

| 動作 | 路徑 | 說明 |
|---|---|---|
| 刪 | `components/IndexBar.tsx`、`components/PWAServiceWorker.tsx` | 死碼（2 行 re-export／從未掛載） |
| 刪 | 根目錄雜物 5 件 ＋ `frontend/` ＋ 6 支 cloudflare 測試 ＋ 2 份 Cloudflare docs | Task 1-2 |
| 改 | `lib/providers/quoteProvider.ts`、`lib/market-hours.ts`、`lib/alertLogic.ts`、`lib/daily-summary.ts`、`lib/marketSession.ts` | 三項合併（Task 3-5） |
| 改 | `app/globals.css`、`tailwind.config.ts`、`components/KlineChart.tsx` | token 換色（Task 6） |
| 建 | `components/home/TopBar.tsx`、`components/home/IndexRail.tsx`、`components/home/WatchSummaryCard.tsx`、`components/home/AlertSummaryCard.tsx`、`components/home/WatchlistToolbar.tsx`、`components/home/QuoteBoard.tsx` | 首頁拆分（Task 7） |
| 改 | `app/page.tsx`（557 行 → 組裝殼）、`app/stock/[id]/page.tsx`、`app/alerts/page.tsx`、`app/search/page.tsx`、`app/login/page.tsx`、`components/BottomNav.tsx` 等 | Task 7-10 |

---

### Task 1: 刪除確定死碼與根目錄雜物

**Files:**
- Delete: `components/IndexBar.tsx`（2 行 re-export，無引用）
- Delete: `components/PWAServiceWorker.tsx`（22 行，`app/layout.tsx` 從未 import，SW 從未掛載）
- Delete: `index-cards-mobile-fixed.png`、`mobile-watchlist-home.yml`、`.gitignore.bak-20260705-1844`、`tsconfig.tsbuildinfo`、`scripts/smoke-result.json`（未追蹤雜物）

**Interfaces:** 無（純刪除，不影響任何 import）。

- [ ] **Step 1: 確認零引用（防呆，不可跳過）**

```bash
grep -rn "IndexBar\|PWAServiceWorker" app/ components/ lib/ tests/ --include="*.ts" --include="*.tsx" --include="*.mjs"
```
Expected: 只出現在兩個待刪檔自身（或無輸出）。若出現其他引用處，停止並回報，不得逕刪。

- [ ] **Step 2: 刪除**

```bash
git rm components/IndexBar.tsx components/PWAServiceWorker.tsx
rm -f index-cards-mobile-fixed.png mobile-watchlist-home.yml .gitignore.bak-20260705-1844 tsconfig.tsbuildinfo scripts/smoke-result.json
```

- [ ] **Step 3: 驗收**

```bash
npm run build && npm run smoke
```
Expected: build 綠燈、smoke PASS。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: 刪除死碼 IndexBar/PWAServiceWorker 與根目錄雜物"
```

---

### Task 2: 刪除 frontend/ 與 Cloudflare 相關測試、文件

**Files:**
- Delete: `frontend/`（整個目錄，Cloudflare Pages 靜態版實驗，已決策淘汰）
- Delete: `tests/cloudflare-api-proxy.test.mjs`、`tests/cloudflare-config.test.mjs`、`tests/cloudflare-hydration.test.mjs`、`tests/cloudflare-pwa.test.mjs`、`tests/cloudflare-stock-navigation.test.mjs`、`tests/cloudflare-stock-route.test.mjs`
- Delete: `docs/superpowers/plans/2026-07-13-cloudflare-frontend.md`、`docs/superpowers/specs/2026-07-13-cloudflare-frontend-design.md`
- Modify: `README.md:114-127`（刪「### Cloudflare 前端（GitHub 自動部署）」整段，含表格與尾段文字；保留行 108-112 的「## 部署（Zeabur）」段）

**Interfaces:** 無。刪測試後 `npm test` 剩 11 支必須全綠。

- [ ] **Step 1: 刪除**

```bash
git rm -r frontend/ 2>/dev/null || rm -rf frontend/
git rm tests/cloudflare-*.test.mjs
git rm docs/superpowers/plans/2026-07-13-cloudflare-frontend.md docs/superpowers/specs/2026-07-13-cloudflare-frontend-design.md
```
（`frontend/` 內含未追蹤的 `.wrangler/`，`git rm -r` 失敗就直接 `rm -rf`。）

- [ ] **Step 2: 改 README**

刪除 `### Cloudflare 前端（GitHub 自動部署）` 標題（行 114）起、至 `## 指令`（行 129）前的全部內容。改完該區應為：

```markdown
## 部署（Zeabur）

從 GitHub `main` 部署，push 即自動重新部署。在 Zeabur 設好上表環境變數即可。

> 注意：`NEXT_PUBLIC_` 開頭的變數於 build 時嵌入，改動後需 redeploy 才生效。

## 指令
```

- [ ] **Step 3: 全域殘留檢查**

```bash
grep -rni "cloudflare\|wrangler\|frontend/" app/ components/ lib/ tests/ scripts/ README.md package.json --include="*"
```
Expected: 無命中（docs/ 歷史檔不在掃描範圍，留檔可）。有命中就逐一清掉。

- [ ] **Step 4: 驗收**

```bash
npm test && npm run build && npm run smoke
```
Expected: 11 支測試全綠、build 綠燈、smoke PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: 移除 Cloudflare 前端實驗（frontend/、測試、文件、README 段落）"
```

---

### Task 3: Quote 型別單一真相

**Files:**
- Modify: `lib/providers/quoteProvider.ts:25-39`（刪本地 `Quote` interface，改從 `@/lib/types` 匯入並 re-export）
- Test: 既有 `npm test` 全套（契約不變，不加新測試）

**Interfaces:**
- Produces: `lib/providers/quoteProvider.ts` 繼續 export `Quote`（型別來源改為 `lib/types.ts`）、`Market`、`QuoteTarget`、`fetchQuotes`、`INDEX_TARGETS` —— 所有既有 import 路徑不變。
- 注意：`lib/types.ts:12-26` 的 `Quote` 與 provider 本地版欄位逐一相同（`market` 欄位 `"tse" | "otc"` 即 `Market`），合併無行為差異。

- [ ] **Step 1: 改 quoteProvider.ts**

刪除行 25-39 的 `export interface Quote { … }` 區塊，並在檔頭 import 區（`import { getSupabase } …` 之後）加入：

```ts
import type { Quote } from "@/lib/types";
export type { Quote };
```

`export type Market`、`QuoteTarget` 維持原樣不動。

- [ ] **Step 2: 驗收**

```bash
npx tsc --noEmit && npm test && npm run build
```
Expected: 型別檢查通過、測試全綠、build 綠燈。

- [ ] **Step 3: Commit**

```bash
git add lib/providers/quoteProvider.ts && git commit -m "refactor: Quote 型別以 lib/types.ts 為單一真相"
```

---

### Task 4: 跨日判斷去重（isSameTaipeiDay ＋ hitToday 單一實作）

**Files:**
- Modify: `lib/market-hours.ts`（`taipeiNow` 之後新增 `isSameTaipeiDay`）
- Modify: `lib/alertLogic.ts:9-12`（`hitToday` 改用新 helper）
- Modify: `lib/daily-summary.ts:69-84`（刪 `isTodayHit`，改 import `hitToday`）
- Test: 既有 `tests/alerts.test.mjs`、`tests/daily-summary-signals.test.mjs`

**Interfaces:**
- Produces: `lib/market-hours.ts` 新增 `export function isSameTaipeiDay(a: Date, b: Date): boolean`。
- `lib/alertLogic.ts` 的 `export function hitToday(hitAt: string | null, now: Date): boolean` 簽名不變。

- [ ] **Step 1: market-hours.ts 加 helper**（放在 `taipeiNow` 函式定義之後）

```ts
// 兩個時間點是否落在同一個台北日曆日（跨日提醒重新武裝的判準）
export function isSameTaipeiDay(a: Date, b: Date): boolean {
  return taipeiNow(a).isoDate === taipeiNow(b).isoDate;
}
```

- [ ] **Step 2: alertLogic.ts 改寫 hitToday**（行 9-12 改為）

```ts
// 每日一次性提醒（漲跌幅／爆量）：hit_at 的台北日期＝今天才算「今天已觸發」，跨日自動重新武裝
export function hitToday(hitAt: string | null, now: Date): boolean {
  if (!hitAt) return false;
  return isSameTaipeiDay(new Date(hitAt), now);
}
```

import 行改為同時引入：`import { taipeiNow, isSameTaipeiDay } from "./market-hours";`（若檔內其餘處已不再用 `taipeiNow`，只留 `isSameTaipeiDay`）。

- [ ] **Step 3: daily-summary.ts 刪重複**

刪除行 69-73 的 `isTodayHit` 函式；`countTodayHits`（行 75-84）內四處 `isTodayHit(` 全改為 `hitToday(`；檔頭加 `import { hitToday } from "./alertLogic";`。

- [ ] **Step 4: 驗收**

```bash
npm test && npm run build
```
Expected: 全綠（特別看 alerts 與 daily-summary-signals 兩套）。

- [ ] **Step 5: Commit**

```bash
git add lib/market-hours.ts lib/alertLogic.ts lib/daily-summary.ts
git commit -m "refactor: 跨日判斷收斂為 isSameTaipeiDay 單一實作"
```

---

### Task 5: marketSession.ts 改用 taipeiNow()

**Files:**
- Modify: `lib/marketSession.ts`（兩函式內手刻的 Intl 解析改用 `taipeiNow`，全檔 72 行 → 約 40 行）
- Test: 既有 `tests/marketSession.test.mjs`（行為不變的硬驗收）

**Interfaces:**
- `getMarketSessionLabel(date?: Date): MarketSessionLabel` 與 `getMarketSessionDetail(date?: Date): string` 簽名、回傳字串完全不變。
- **警告**：本檔 `OPEN_MIN`/`CLOSE_MIN`（09:00/13:30，UI 標籤用）與 `market-hours.ts` 同名常數（08:45/13:35，MIS 可打窗）是不同語意，**不可合併數值**，維持各自定義。

- [ ] **Step 1: 改寫全檔**

```ts
// 台股平日盤中時段標籤（純時間判斷，不打任何 API，不依賴瀏覽器物件）。
// 規則：
//   週六、週日 → 休市
//   平日 00:00–08:59 → 盤前
//   平日 09:00–13:30 → 盤中
//   平日 13:30 之後 → 已收盤
import { taipeiNow } from "./market-hours";

export type MarketSessionLabel = "盤前" | "盤中" | "已收盤" | "休市";

// 注意：與 market-hours.ts 的 OPEN_MIN/CLOSE_MIN（08:45/13:35，MIS 可打窗）語意不同，勿合併
const OPEN_MIN = 9 * 60; // 09:00
const CLOSE_MIN = 13 * 60 + 30; // 13:30

/**
 * 依台灣時間（Asia/Taipei）與台股平日盤中規則，回傳當下所屬時段標籤。
 */
export function getMarketSessionLabel(date: Date = new Date()): MarketSessionLabel {
  const t = taipeiNow(date);
  if (t.dayOfWeek === 0 || t.dayOfWeek === 6) return "休市";
  if (t.minutes < OPEN_MIN) return "盤前";
  if (t.minutes <= CLOSE_MIN) return "盤中";
  return "已收盤";
}

/**
 * 同上，但盤前／盤中附細節文字（「09:00 開盤」「距收盤 N 分」），供 masthead 顯示。
 */
export function getMarketSessionDetail(date: Date = new Date()): string {
  const label = getMarketSessionLabel(date);
  if (label === "盤前") return "盤前・09:00 開盤";
  if (label === "盤中") return `盤中・距收盤 ${CLOSE_MIN - taipeiNow(date).minutes} 分`;
  return label;
}
```

- [ ] **Step 2: 驗收**

```bash
npm test && npm run build && npm run smoke
```
Expected: `marketSession.test.mjs` 全綠（行為不變的證明）、其餘全綠。

- [ ] **Step 3: Commit**

```bash
git add lib/marketSession.ts && git commit -m "refactor: marketSession 改用 taipeiNow，去除三處重複的台北時間解析"
```

---

### Task 6: 視覺 token 層換色（暖米白 × 深墨，含深色副主題）

**Files:**
- Modify: `app/globals.css:5-74`（淺色＋深色變數值全面換為定稿色票）
- Modify: `tailwind.config.ts`（新增 `faint`、`line-strong`、`surface-2` token；`borderRadius.card` 4px → 12px；陰影微調）
- Modify: `components/KlineChart.tsx`（明暗雙色票的色值對齊新 token；機制不動）

**Interfaces:**
- Produces: Tailwind class `bg-app`、`bg-surface`、`bg-surface-2`、`text-ink`、`text-muted`、`text-faint`、`border-line`、`border-line-strong`、`text-primary`／`bg-primary`、`text-up`／`text-down` 及各 `-tint`。後續 Task 7-10 一律用這些 class，**不得寫死 hex**。

- [ ] **Step 1: globals.css 淺色區（行 5-42）換值**

保留既有結構與註解慣例，色票值改為（R G B 三數字者為可帶透明度 token）：

```css
  --c-app: 245 241 232;        /* #f5f1e8 暖米白底 */
  --c-surface: 255 253 248;    /* #fffdf8 卡片 */
  --c-surface-2: 250 246 238;  /* #faf6ee 次層（表頭、hover） */
  --c-line: 233 226 211;       /* #e9e2d3 */
  --c-line-strong: 221 212 192;/* #ddd4c0 */
  --c-ink: 41 36 28;           /* #29241c */
  --c-muted: 124 116 96;       /* #7c7460 */
  --c-faint: 168 158 136;      /* #a89e88 */
  --c-primary: 74 66 55;       /* #4a4237 深墨互動色（去藍） */
  --c-primary-tint: #f0ebe0;
  --c-up: 217 45 58;           /* #d92d3a 漲・紅 */
  --c-up-tint: #fbeae7;
  --c-up-strong: #a31622;      /* |漲跌幅|≥3% 加深一階 */
  --c-down: 14 159 110;        /* #0e9f6e 跌・綠 */
  --c-down-tint: #e6f6ef;
  --c-down-strong: #0a7a52;
  --c-flat: 124 116 96;
  --c-warn: 151 82 0;
  --c-warn-tint: #f6ead6;

  --shadow-card-color: rgba(74, 58, 28, 0.06);
  --shadow-lift-color: rgba(74, 58, 28, 0.10);

  --body-bg: #f5f1e8;
  --body-bg-glow: #faf7f0;
  --selection-bg: rgba(74, 66, 55, 0.18);
  --flash-up-bg: rgba(217, 45, 58, 0.07);
  --flash-down-bg: rgba(14, 159, 110, 0.07);
```

- [ ] **Step 2: globals.css 深色區（行 45-74）換值**（暖近黑，維持暖色相、去藍）

```css
    --c-app: 20 17 12;           /* #14110c */
    --c-surface: 29 25 19;       /* #1d1913 */
    --c-surface-2: 38 33 25;
    --c-line: 61 54 42;
    --c-line-strong: 82 73 57;
    --c-ink: 234 226 207;
    --c-muted: 156 144 120;
    --c-faint: 120 110 90;
    --c-primary: 191 180 156;    /* 亮暖墨（深底上的互動色，仍無藍） */
    --c-primary-tint: rgba(191, 180, 156, 0.16);
    --c-up: 232 100 112;
    --c-up-tint: rgba(232, 100, 112, 0.14);
    --c-up-strong: #f08a93;
    --c-down: 67 181 126;
    --c-down-tint: rgba(67, 181, 126, 0.14);
    --c-down-strong: #6bcb9b;
    --c-flat: 179 167 141;
    --c-warn: 224 154 69;
    --c-warn-tint: rgba(224, 154, 69, 0.16);

    --shadow-card-color: rgba(0, 0, 0, 0.35);
    --shadow-lift-color: rgba(0, 0, 0, 0.45);

    --body-bg: #14110c;
    --body-bg-glow: #1b1710;
    --selection-bg: rgba(191, 180, 156, 0.24);
    --flash-up-bg: rgba(232, 100, 112, 0.12);
    --flash-down-bg: rgba(67, 181, 126, 0.12);
```

- [ ] **Step 3: tailwind.config.ts 增補 token**

`colors` 內新增三行（其餘既有 token 不動）：

```ts
        "surface-2": "rgb(var(--c-surface-2) / <alpha-value>)",
        "line-strong": "rgb(var(--c-line-strong) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
```

`borderRadius` 改為：

```ts
      borderRadius: {
        card: "12px",
        pill: "999px",
      },
```

`boxShadow` 改為（視覺規範的柔和兩層影）：

```ts
      boxShadow: {
        card: "0 1px 2px var(--shadow-card-color), 0 2px 8px var(--shadow-card-color)",
        lift: "0 4px 14px var(--shadow-lift-color), 0 12px 32px var(--shadow-card-color)",
      },
```

- [ ] **Step 4: KlineChart.tsx 色票對齊**

找到檔內明暗雙色票定義（`d4d71b9` 建立的 matchMedia 機制），把其中的文字／格線／背景色值改為對應新 token 同值 hex（淺：背景 `#fffdf8`、文字 `#29241c`、格線 `#e9e2d3`；深：背景 `#1d1913`、文字 `#eae2cf`、格線 `#3d362a`）；漲跌 K 棒色改 `#d92d3a`／`#0e9f6e`（深色 `#e86470`／`#43b57e`）。機制（matchMedia 監聽、applyOptions）不動。

- [ ] **Step 5: 去藍檢查（硬驗收）**

```bash
grep -rn "26 58 99\|1a3a63\|8fa9cc\|143, 169, 204\|e7ecf3" app/ components/ tailwind.config.ts
```
Expected: 無命中（舊靛藍色票完全清除）。

- [ ] **Step 6: 驗收**

```bash
npm run build && npm run smoke
```
再以 headless Chrome 開 `npm run dev` 起的 `http://localhost:3000`（或 build 後 `npm start`），390 與 1440 各截一張，目視：底色暖米白、按鈕深墨、紅漲綠跌正確。
Expected: 綠燈；截圖無藍色互動元素。

- [ ] **Step 7: Commit**

```bash
git add app/globals.css tailwind.config.ts components/KlineChart.tsx
git commit -m "feat: 視覺 token 換色——暖米白 × 深墨互動色（去藍），深色副主題同步"
```

---

### Task 7: 首頁重構（表格補完版型）

**Files:**
- Create: `components/home/TopBar.tsx`、`components/home/IndexRail.tsx`、`components/home/WatchSummaryCard.tsx`、`components/home/AlertSummaryCard.tsx`、`components/home/WatchlistToolbar.tsx`、`components/home/QuoteBoard.tsx`
- Modify: `app/page.tsx`（557 行 → 資料層＋組裝，目標 <200 行）
- Modify: `components/IndexCard.tsx`、`components/Sparkline.tsx`（樣式對齊；介面不變）
- Modify（如有斷言 DOM）: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: Task 6 的 Tailwind token；既有資料流（`/api/quote` 輪詢、`/api/watchlist`、`/api/sparklines`）與排序／篩選／新增／刪除邏輯——**全部保留，不增減功能**。
- Produces（props 契約，供本 task 內部與後續 task 引用）:
  - `TopBar`: `{ sessionLabel: string; sessionDetail: string; hasUnread: boolean; onRefresh: () => void }`
  - `IndexRail`: `{ indices: Quote[]; watchStats: { up: number; down: number; flat: number; todayHits: number }; alertItems: WatchlistItem[] }`
  - `WatchlistToolbar`: `{ sort: SortKey; filter: FilterKey; onSort: (k: SortKey) => void; onFilter: (k: FilterKey) => void; statusText: string }`（`SortKey`/`FilterKey` 沿用 `app/page.tsx` 既有型別，搬移至 `QuoteBoard.tsx` export）
  - `QuoteBoard`: `{ quotes: Quote[]; items: WatchlistItem[]; onDelete: (id: string) => void }`——內部同時渲染桌面表格與手機卡片（CSS 斷點切換）
- **版型準據**：視覺規範 `2026-07-18-visual-spec-final.html`。桌面 ≥1000px 左欄 336px sticky＋主欄表格；手機 <600px 卡片式。表格欄與 grid（照抄規範）：

```css
grid-template-columns:
  minmax(150px, 1.1fr)  /* 商品 */
  90px                  /* 現價 */
  120px                 /* 漲跌/幅度 */
  minmax(196px, 1.5fr)  /* 訊號 */
  86px                  /* 量 */
  104px                 /* 日內走勢 */
  92px;                 /* 報價/提醒 */
```

手機卡片 grid-areas（照抄規範）：`"sym price" "pill change" "sig sig" "trend trend" "foot foot"`，卡片左緣 3px 漲跌色條（`--tone`）。

- **左欄內容（規範的「市場概況」改為既有資料版）**：`WatchSummaryCard` 顯示自選股上漲/下跌/平盤家數＋今日觸發提醒數（資料來源：頁面既有 quotes 陣列即時計算＋`hitToday` 邏輯；不新增 API）。卡片標題文字用「自選概況」。`AlertSummaryCard` 列出已設 `alert_high`/`alert_low` 的自選股（名稱、代號、條件價、距觸價 %，由現價與條件價計算）。
- 訊號標籤（站上/跌破 MA20、KD 交叉、RSI、漲停/跌停）：沿用個股頁／daily-summary 既有訊號計算來源；首頁若目前沒有此資料流，**該欄先顯示既有的漲跌停與提醒狀態，不新建訊號 API**（功能不增減）。

- [ ] **Step 1: 建 `components/home/` 六個元件**，照上述 props 契約與視覺規範版型實作；所有色彩用 Task 6 token class，禁止 hex。
- [ ] **Step 2: 改寫 `app/page.tsx`**：保留全部既有 state／輪詢／handler，JSX 換成 `<TopBar/><IndexRail/>…<QuoteBoard/>` 組裝；刪除搬走的 JSX。
- [ ] **Step 3: 驗收（行為）**

```bash
npm test && npm run build && npm run smoke
```
`tests/mobile-watchlist-home.test.mjs` 若斷言舊 DOM 結構，同步更新斷言（行為斷言不得刪弱）。
Expected: 全綠。

- [ ] **Step 4: 驗收（渲染）**

headless Chrome 開真實首頁，390×844 與 1440×900 各截圖：無溢出、左欄填滿、表格欄距均勻、紅漲綠跌正確、無藍色、無簡體字。手機確認底部導覽與卡片版型。
Expected: 皆通過。

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/home/ components/IndexCard.tsx components/Sparkline.tsx tests/
git commit -m "feat: 首頁改版——表格補完版型（桌面表格＋手機卡片），拆分為 home/ 元件"
```

---

### Task 8: 個股頁重設計＋KlineChart 拆分

**Files:**
- Modify: `app/stock/[id]/page.tsx`（493 行；樣式對齊新 token，頁首改 TopBar 同款 sticky 樣式，區塊卡片化）
- Modify: `components/FundamentalSection.tsx`（351 行；樣式對齊，表格數字 `tabular-nums`）
- Split: `components/KlineChart.tsx`（582 行）→ `components/kline/KlineChart.tsx`（圖表核心）＋ `components/kline/klinePalette.ts`（明暗色票與 matchMedia 邏輯）＋ `components/kline/KlineToolbar.tsx`（週期切換等 UI）

**Interfaces:**
- `KlineChart` 對外 props 完全不變（呼叫處只改 import 路徑）；`klinePalette.ts` export `getKlinePalette(dark: boolean)` 回傳既有 options 物件形狀。
- Consumes: Task 6 token。

- [ ] **Step 1: 先跑基線** `npm test`（記錄綠燈）。
- [ ] **Step 2: 拆 KlineChart** 為三檔，行為不變；原路徑 `components/KlineChart.tsx` 改為 `export { default } from "./kline/KlineChart";` 或直接更新兩個呼叫處 import（擇一，取呼叫處少者）。
- [ ] **Step 3: 個股頁與 FundamentalSection 樣式改版**（token class、圓角 12px、卡片陰影、mono 數字）。
- [ ] **Step 4: 驗收** `npm test && npm run build && npm run smoke`；headless 390/1440 開 `/stock/2330` 截圖驗渲染（K 線圖有畫出、明暗切換正常）。
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: 個股頁改版與 KlineChart 拆分（palette/toolbar 分檔）"`

---

### Task 9: 警報頁重設計＋PriceAlertCard 精修

**Files:**
- Modify: `app/alerts/page.tsx`（422 行；版型對齊視覺規範——狀態列、chips、卡片）
- Modify: `components/PriceAlertCard.tsx`（279 行；token 化、左緣色條、mono 數字）

**Interfaces:** 既有 props 與提醒 CRUD 行為完全不變。

- [ ] **Step 1: 兩檔樣式改版**（同 Task 7 的 token 與版型語彙）。
- [ ] **Step 2: 驗收** `npm test && npm run build`；headless 390/1440 開 `/alerts` 截圖驗渲染。
- [ ] **Step 3: Commit** `git commit -am "feat: 警報頁改版對齊新視覺"`

---

### Task 10: 其餘頁面與共用元件收尾

**Files:**
- Modify: `app/search/page.tsx`、`app/login/page.tsx`（token 化，搜尋框樣式對齊規範）
- Modify: `components/BottomNav.tsx`（底部導覽選中色改 primary 深墨、毛玻璃底）、`components/QuoteCard.tsx`、`components/EmptyState.tsx`、`components/AddStockForm.tsx`、`components/StockSearch.tsx`、`components/DeleteStockDialog.tsx`、`components/MobileNetworkBanner.tsx`、`components/PullToRefresh.tsx`（凡有寫死舊色或舊圓角處一律 token 化）

**Interfaces:** 全部元件 props 不變。

- [ ] **Step 1: 逐檔掃寫死色**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}\|rgb(" app/ components/ --include="*.tsx" | grep -v "globals.css"
```
命中處逐一改為 token class（KlineChart palette 檔為唯一允許 hex 的例外）。

- [ ] **Step 2: 驗收** `npm test && npm run build && npm run smoke`；headless 390/1440 開 `/search`、`/login` 截圖。
- [ ] **Step 3: Commit** `git commit -am "feat: 其餘頁面與共用元件 token 化收尾"`

---

### Task 11: 全站驗收、部署與線上驗證

**Files:** 無新增（驗收與部署）。

- [ ] **Step 1: 全套驗收**

```bash
npm test && npm run build && npm run smoke
```
Expected: 全綠，貼實際輸出末段。

- [ ] **Step 2: 全頁渲染矩陣**：headless Chrome 對 `/`、`/stock/2330`、`/alerts`、`/search`、`/login` × {390, 1440} × {淺色, 深色（`--force-dark-mode` 或 emulate prefers-color-scheme）} 截圖，逐張確認：無溢出、無跑版、紅漲綠跌正確、無藍色互動元素、無簡體字。
- [ ] **Step 3: fresh-context 驗收**：派全新 subagent 依設計文件驗收條款（`2026-07-16-redesign-and-trim-design.md` §四）逐條核對，回報通過/不通過。不通過即修復後重驗。
- [ ] **Step 4: 部署**：`git push` → Zeabur 自動部署；等部署完成後 headless 開 `https://tw-stock-tracker.zeabur.app` 首頁與 `/stock/2330` 截圖，確認線上渲染與本機一致。
- [ ] **Step 5: 收尾 commit**（如驗收有小修）＋回報使用者：改動清單、線上網址、截圖結論。

---

## Self-Review 紀錄

- Spec 覆蓋：精簡四步（死碼／frontend／三合併／結構拆分）→ Task 1-5、8；視覺 token＋逐頁 → Task 6-10；驗收五條 → Task 11。設計文件「市場概況卡」因無既有資料源，依「功能不增減」原則改為既有資料的「自選概況」卡（Task 7），已於計畫明文標註，屬對 spec 的一處明確偏離，需使用者知悉。
- 佔位掃描：無 TBD/TODO；UI task 的完整版型程式碼以「視覺規範 HTML＝唯一準據＋關鍵 grid 抄錄」承載，實作者可直接開檔對照。
- 型別一致：`Quote`（lib/types.ts）、`isSameTaipeiDay(a, b)`、`hitToday(hitAt, now)`、`getKlinePalette(dark)` 前後引用一致；`OPEN_MIN`/`CLOSE_MIN` 同名異值陷阱已在 Task 5 標註。
