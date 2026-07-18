# 全站視覺重設計 ＋ 程式碼精簡 設計文件

日期：2026-07-16（台北）；2026-07-18 依使用者回饋改版定稿。狀態：已核准，進入實作計畫。
配套文件：`2026-07-16-trim-plan.md`（精簡逐項清單，對抗式審查產出）。

## 背景與目標

使用者要求兩件事：(1) UX/UI 大規模重新設計；(2) 把系統限縮成質高而精。
本文件是兩個工作流的單一規格；實作前將另出實作計畫（writing-plans）。

## 已定案決策（使用者於 2026-07-16 確認）

1. 視覺方向（2026-07-18 定稿，取代 07-16 的 A×C 混搭）：使用者檢視 A×C 原型後指出五缺點（左欄留白、表格中段空洞、資訊量倒退、缺加入自選鈕、控制列過重），經三個融合方案比選後定案——**表格補完版型 × 暖米白底 × 互動色去藍改深墨**。定稿視覺規範：同目錄 `2026-07-18-visual-spec-final.html`（實作以其 token 與版型為唯一準據；`2026-07-16-visual-spec.html` 作廢僅留檔）。
2. 刪除 `frontend/` 目錄（Cloudflare Pages 靜態版實驗，456 MB，未使用）。
3. 昨日（7/15）未提交的深淺色主題修改已審查通過並提交（`d4d71b9`），作為本次起點。

## 一、視覺系統（design tokens）

沿用 `d4d71b9` 建立的 CSS 變數機制（`app/globals.css` 定義 R G B 三數字變數、`tailwind.config.ts` 以 `rgb(var(--x) / <alpha-value>)` 引用），只換色值與擴充缺少的 token。

### 淺色（預設主題，2026-07-18 定稿：暖米白 × 深墨）

| Token | 色值 | 用途 |
|---|---|---|
| bg | `#f5f1e8`（漸層至 `#faf7f0`） | 頁面底 |
| surface | `#fffdf8`（次層 `#faf6ee`、高亮 `#f4efe4`） | 卡片、表格、輸入框 |
| line | `#e9e2d3`（強 `#ddd4c0`） | 分隔線、邊框 |
| ink | `#29241c` | 主文字 |
| muted / faint | `#7c7460` / `#a89e88` | 次要文字 |
| primary（深墨，無藍） | `#4a4237`（深 `#2e2921`、亮 `#6b6152`、淡底 `#f0ebe0`） | 按鈕、active chip、focus ring、提醒鈴鐺、tab 選中 |
| up | `#d92d3a`（淡底 `#fbeae7`） | 漲（台股紅漲） |
| down | `#0e9f6e`（淡底 `#e6f6ef`） | 跌（台股綠跌） |

使用者明確要求：**介面不得出現藍／靛藍系互動色**（不調和）。

### 深色（副主題，`prefers-color-scheme: dark`）

暖近黑分層底（如 `#14110c` / panel `#1d1913` 系，維持暖色相）、primary 用亮暖墨（`#a89e88` 系）、紅綠提亮確保對比，同樣不得引入藍色。KlineChart 已有明暗雙色票機制（`d4d71b9`），改色值對齊即可。

### 版型與質感（表格補完版，見定稿視覺規範）

- 桌面（≥1000px）：sticky 頂欄；左欄 sticky（指數卡×2＋市場概況卡＋提醒摘要卡，不留白）；主欄為搜尋框＋「加入自選」實心鈕、自選股狀態列（N / N 檔・更新頻率・更新於 X 前）、排序＋篩選單排 chips、報價表格（欄：商品／現價／漲跌與幅度／訊號標籤／量／日內走勢／報價與提醒），欄距均勻無中段空洞。
- 手機（<600px）：指數卡、高密度自選股卡片（左側 3px 漲跌色條，含訊號標籤、量、報價時間、20 日走勢）、底部四項導航（自選／搜尋／提醒／設定）。
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
