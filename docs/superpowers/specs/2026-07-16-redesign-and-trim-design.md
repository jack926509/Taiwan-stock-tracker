# 全站視覺重設計 ＋ 程式碼精簡 設計文件

日期：2026-07-16（台北）。狀態：待使用者核准。
配套文件：`2026-07-16-trim-plan.md`（精簡逐項清單，對抗式審查產出）。

## 背景與目標

使用者要求兩件事：(1) UX/UI 大規模重新設計；(2) 把系統限縮成質高而精。
本文件是兩個工作流的單一規格；實作前將另出實作計畫（writing-plans）。

## 已定案決策（使用者於 2026-07-16 確認）

1. 視覺方向採「候選 A 版型 ＋ 候選 C 色系」混搭：高密度交易終端版型，淺色靛藍色系。定稿視覺規範：同目錄 `2026-07-16-visual-spec.html`（實作以其 token 為準，抄錄於下）。
2. 刪除 `frontend/` 目錄（Cloudflare Pages 靜態版實驗，456 MB，未使用）。
3. 昨日（7/15）未提交的深淺色主題修改已審查通過並提交（`d4d71b9`），作為本次起點。

## 一、視覺系統（design tokens）

沿用 `d4d71b9` 建立的 CSS 變數機制（`app/globals.css` 定義 R G B 三數字變數、`tailwind.config.ts` 以 `rgb(var(--x) / <alpha-value>)` 引用），只換色值與擴充缺少的 token。

### 淺色（預設主題，來自候選 C）

| Token | 色值 | 用途 |
|---|---|---|
| bg | `#eef0f6`（漸層至 `#f6f7fb`） | 頁面底 |
| surface | `#ffffff` / `#fbfbfe` | 卡片、表格、輸入框 |
| line | `#e5e7f0` | 分隔線、邊框 |
| ink | `#171a26` | 主文字 |
| muted / faint | `#7a7f92` / `#9aa0b2` | 次要文字 |
| primary | `#4b45d6`（深 `#2f2a9c`、亮 `#6d68f0`、淡底 `#edecfb`） | 品牌、active chip、focus ring、提醒鈴鐺、tab 選中 |
| up | `#e5343f`（淡底 `#fdecec`） | 漲（台股紅漲） |
| down | `#0e9f6e`（淡底 `#e6f6ef`） | 跌（台股綠跌） |

### 深色（副主題，`prefers-color-scheme: dark`，承候選 A）

near-black 分層底（`#07080a` / panel `#0f1116` 系）、primary 用亮靛藍 `#6d68f0`、紅綠提亮確保對比。KlineChart 已有明暗雙色票機制（`d4d71b9`），改色值對齊即可。

### 版型與質感（來自候選 A）

- 桌面（≥1000px）：sticky 頂欄；左欄指數卡（sticky）＋主欄滿寬自選股「報價表格」（欄：商品／現價／漲跌幅度／日內走勢／提醒）。
- 手機（<600px）：指數卡、高密度自選股卡片（左側 2-3px 漲跌色條）、底部四項導航（自選／搜尋／提醒／設定）。
- 數字一律 `font-variant-numeric: tabular-nums`；圓角 10-14px；細分隔線層次；柔和陰影（候選 C 的 shadow token）。
- 動效：進場 staggered 淡入、hover 微位移；尊重 `prefers-reduced-motion`。

### 硬規則

紅漲綠跌絕不可反；一律繁體中文禁簡體；中文與英文/數字間半形空格；390px 與 1440px 皆不得溢出或大片留白。

## 二、頁面範圍（全站逐頁套用）

依現有 app/ 路由：首頁（自選看盤）、個股頁 `stock/[id]`、警報頁 `alerts`、其餘頁面與共用元件（QuoteCard、IndexCard、PriceAlertCard、FundamentalSection、KlineChart、BottomNav 等）。行為與功能不增減——本次只換視覺層與必要的結構拆分。

## 三、程式碼精簡（行為不變，詳見 trim-plan）

執行順序（每步後跑驗收，綠燈才進下一步）：

1. 刪確定死碼：`components/IndexBar.tsx`、`components/PWAServiceWorker.tsx`＋根目錄雜物（png/yml/bak）。
2. 刪 `frontend/` 全目錄＋6 支 `tests/cloudflare-*.test.mjs`＋2 份過時 Cloudflare docs＋更新 `README.md:114-127` 部署段落。
3. 三項合併：`Quote` 型別單一真相（`lib/types.ts` 為準）、跨日判斷抽 `isSameTaipeiDay`、`marketSession.ts` 改用 `taipeiNow()`（省約 30 行重複 Intl 解析）。
4. 結構拆分併入 UI 重設計：`KlineChart.tsx`（582 行）、`app/page.tsx`（557 行）、`app/stock/[id]/page.tsx`（493 行）、`app/alerts/page.tsx`（422 行）依 trim-plan「結構問題」節拆分；同時檢視 `WatchlistItem` 與 `WatchItem` 型別對齊。

明確不動：alertLogic/alerts 分層、klineStore vs store、providers 抽象層、全部 npm 依賴、supabase migrations（審查確認皆為正當設計）。

PWA 離線：Service Worker 從未實際掛載（既有缺口）。本次不引入離線功能，維持現狀；若日後要做，另開任務。

## 四、驗收標準（宣稱完成前全過，fresh-context subagent 驗）

1. `npm run build` 綠燈、`npm run smoke` PASS（貼實際輸出）。
2. 刪 cloudflare 測試後 `npm test` 其餘全綠。
3. headless Chrome 開真實頁面截圖驗渲染：手機 390px＋桌面 1440px，各頁無溢出、無跑版、漲跌色正確、無簡體字。
4. 部署 Zeabur 後，線上網址再驗一次渲染。
5. 交付物路徑與改動清單列明。

## 五、風險與緩解

- 表格版桌面佈局是新結構：先做首頁，headless 驗過再推進其他頁。
- 精簡與重設計分開提交：精簡（行為不變）先行、每步小提交，出問題可單獨回退。
- KlineChart 主題色依賴 lightweight-charts 重繪：沿用 `d4d71b9` 的 matchMedia 機制，只換色值。
