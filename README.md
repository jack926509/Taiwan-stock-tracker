# 台股追蹤（tw-stock-tracker）

個人專用的台股即時追蹤儀表板。零券商帳戶、以免費資源為主，設計優先序：**穩定 > 盡量免費 > 實用**。台股慣例 **紅漲綠跌**、淺色護眼介面。

🔗 線上：<https://tw-stock-tracker.zeabur.app>（公開，無密碼）

> 完整規格見上層資料夾 `Taiwan-Stock-Tracker-Build-Plan.md`（v5.1）。

## 功能

- **即時報價牆**：自選股卡片（紅漲綠跌＋方向箭頭圖示，非純色辨識）、大盤指數、盤中每 10 秒更新（背景分頁自動暫停、連續異常自動停輪詢並於回前景恢復）、近 20 日 sparkline、漲跌停徽章、一鍵排序、「更新於 X 秒前」。
- **自選股管理**：新增（即時查名預覽）／刪除、拖曳排序、**精簡／詳細密度切換**、**快速篩選膠囊**（全部／已設提醒／僅漲／僅跌），雲端或本機儲存。
- **個股頁**（點卡片進入，手機／桌機響應式）：
  - 日 K 蠟燭圖（lightweight-charts v5，動態載入不拖慢首載）＋ 成交量 ＋ MA5/20/60 ＋ 十字游標讀數（含方向箭頭），支援 5 日／20 日／3 月／6 月／1 年切換。
  - 顯示區間漲跌、最新 K 日期、快取資料提示，並可從個股頁切換上一檔／下一檔自選股。
  - 基本面：估值（PER／PBR／殖利率）、三大法人買賣超（手機窄螢幕橫向捲動不外溢）、月營收 YoY、**每股盈餘 EPS（單季＋近四季合計）**，並顯示資料更新時間與過期快取提示。
  - **到價提醒**：報價卡右上角鈴鐺彈出設定，設「漲到／跌到」門檻，盤中達到門檻即推 LINE 通知（一次性，重設門檻可再啟用）。
- **提醒頁**：集中管理所有自選股提醒，支援上一頁返回、自選快捷、目前報價與提醒狀態檢視，輪詢暫停/恢復行為與首頁一致。
- **PWA／手機體驗**：支援安裝成獨立 App、手機底部導覽、自選／搜尋／提醒分頁、滑動刪除與安全區域間距、全站互動元素符合 44×44px 觸控目標與 WCAG AA 對比。
- **常駐排程**（Zeabur 內建 node-cron，限正式環境）：
  - 週一～五 17:00（台北）盤後補抓自選股當日 K，兼作 Supabase keep-alive；週末 12:30 輕量 ping 補足 keep-alive。
  - 工作日盤中每分鐘檢查到價提醒、13:35 收盤後推自選股收盤總覽（皆走 LINE）。

## 技術棧

Next.js 15（App Router）・React 19・TypeScript・Tailwind 3・SWR・lightweight-charts v5・Supabase（PostgreSQL）。

## 架構

| 層 | 內容 |
|---|---|
| 即時報價 | TWSE MIS 端點，session cookie 持久化、5 秒節流、stale 快照 failover |
| 歷史／基本面 | FinMind（日 K、法人、月營收、PER、財報 EPS）；`FINMIND_TOKEN` 可選，填了限流較寬 |
| 儲存 | 雙模式：設了 Supabase 變數走雲端，否則退回本機 JSON（`.data/`） |
| 健康檢查 | `/api/health` 輕量公開；`/api/health?detail=1` 需 token 或登入 cookie，Supabase 異常會回 503 |
| 測試 | `node:test` 覆蓋健康檢查授權、API 錯誤遮蔽、K 線區間與 Supabase migration |
| 部署 | Zeabur 常駐 Node 服務（東京專屬伺服器，固定 IP 利於 MIS） |
| 效能 | 三頁輪詢設定共用 `lib/pollConfig.ts`；`lightweight-charts`、`@dnd-kit/*` 皆以 `next/dynamic` 動態載入，縮小首頁／個股頁首次載入 JS |

**雙模式儲存**是核心設計：本機開發免任何金鑰即可跑（報價＋圖表全可測），填入 Supabase 金鑰就無痛切雲端。

### 資料表（Supabase）

| 表 | 用途 |
|---|---|
| `watchlist` | 自選股 |
| `daily_kline` | 日 K 線快取（增量補抓） |
| `news_cache` | 基本面快取（估值／法人／營收／EPS 的 JSON，12 小時 TTL） |
| `mis_session` | MIS 即時報價 session cookie |
| `assistant_conversations` | AI 助理對話 |
| `assistant_messages` | AI 助理訊息 |
| `news_articles` | 新聞文章快取 |

> 全表開啟 RLS 且不設 policy；後端以 service_role 金鑰存取。

## 本機啟動

```bash
npm install
cp .env.local.example .env.local   # 可全留空，純本機模式即可跑
npm run dev                        # http://localhost:3000
```

不填任何金鑰也能跑：報價、圖表、基本面都正常，自選股存本機 `.data/watchlist.json`。
要切雲端就填 `NEXT_PUBLIC_SUPABASE_URL` ＋ `SUPABASE_SERVICE_ROLE_KEY`。

### 環境變數

| 變數 | 必要性 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 雲端模式 | Supabase 專案 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 雲端模式 | service_role（secret）金鑰，僅後端使用 |
| `FINMIND_TOKEN` | 建議 | FinMind JWT；不填亦可，但易撞限流 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 到價提醒 | LINE Messaging API token；與下列 userId 皆設了才會推播 |
| `LINE_TARGET_USER_ID` | 到價提醒 | 接收通知的 LINE userId |
| `APP_ACCESS_PASSWORD` | 選用 | 設了才啟用全站密碼保護；留空＝公開 |
| `HEALTH_DETAIL_TOKEN` | 建議 | `/api/health?detail=1` 的 Bearer token；未設定時詳細健康檢查只接受既有登入 cookie |

### Supabase schema

Schema migrations 已納入版本控管：

```bash
supabase/migrations/
```

這些 migrations 對齊目前 live Supabase history，建立 `watchlist`、`daily_kline`、`news_cache`、`mis_session`、`assistant_conversations`、`assistant_messages`、`news_articles`，補齊到價提醒觸發時間欄位、快取清理排程與說明註解。全表啟用 RLS，不開 anon/authenticated policy，並授權後端 `service_role` 存取。這維持本專案「前端不直接讀資料庫、後端 service role 統一存取」的安全模型。

## PWA 與手機優化方向

目前已支援手機安裝、底部導覽與提醒頁返回，並補上以下手機情境：

1. **弱網路／離線提示**：首頁與提醒頁會在離線、報價快取或更新失敗時提示目前狀態。
2. **下拉刷新**：首頁與提醒頁可在頂部下拉重新抓自選、報價與提醒狀態。
3. **安裝提示**：瀏覽器支援 PWA 安裝時，手機底部會以不干擾提示引導加入主畫面。
4. **提醒徽章**：手機底部「提醒」分頁會顯示已啟用提醒數量，降低漏看機率。

### Web Push 優化計劃

Web Push 可作為 LINE 通知以外的備援通道，但需要分階段導入，避免過早增加權限與維運複雜度。

1. **訂閱資料表**：新增 `push_subscriptions`，保存 endpoint、p256dh、auth、user agent、最後成功／失敗時間，並沿用 service_role 後端存取。
2. **前端授權流程**：只在使用者已安裝 PWA 或主動進入提醒設定時顯示推播開關，不在首次進站強迫要求通知權限。
3. **API 契約**：新增訂閱、取消訂閱與測試通知 API；失效 endpoint 收到 404/410 時自動停用。
4. **推送整合**：到價提醒先維持 LINE 為主，Web Push 作為同一事件的第二通道；需避免同一門檻重複推播。
5. **驗證與觀測**：加入 VAPID key 環境變數檢查、推送成功率 log、失敗重試上限與瀏覽器相容性測試，確認 iOS PWA、Android Chrome、桌面 Chrome 的行為差異。

## 部署（Zeabur）

從 GitHub `main` 部署，push 即自動重新部署。在 Zeabur 設好上表環境變數即可。

> 注意：`NEXT_PUBLIC_` 開頭的變數於 build 時嵌入，改動後需 redeploy 才生效。

### Cloudflare 前端（GitHub 自動部署）

Zeabur 保留 Node.js API、排程與資料存取；Cloudflare Pages 僅提供前端靜態檔案，並以 Pages Function 把同網域的 `/api/*` 代理至 Zeabur。因此瀏覽器不需要設定 CORS，既有相對 API 呼叫可維持不變。

在 Cloudflare Pages 建立 GitHub-connected 專案時，選擇此 repository 的 `main` 分支，並設定：

| 設定 | 值 |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Node.js version | 22 以上 |

Cloudflare 成功產生預覽網址後，先確認首頁、`/stock/2330` 與 `/api/health`。確認無誤後，於 Pages 的 Custom domains 新增 `twstock.xiehnet.com`；Cloudflare 會在已代管的 `xiehnet.com` zone 自動建立所需 DNS 紀錄與憑證。不要刪除 Zeabur 的 `tw-stock-tracker.zeabur.app`，它是 API 與可回退的既有入口。

## 指令

```bash
npm run dev      # 開發
npm test         # 單元測試
npm run build    # 正式 build
npm run start    # 啟動正式版
npm run smoke    # MIS 穩定度壓測（--url <網址> --minutes 5）
```

## 安全注意

- `SUPABASE_SERVICE_ROLE_KEY`、`FINMIND_TOKEN`、`LINE_CHANNEL_ACCESS_TOKEN` 只在後端使用，前端永不引用；只放 `.env.local`（已 gitignore）與 Zeabur 環境變數，絕不入程式碼／git。
- 資料表全開 RLS 不設 policy：anon key 即使外洩也讀不到資料。
- `APP_ACCESS_PASSWORD` 由 `middleware.ts` 攔截全站（除 `/api/health`、`/login`、`/api/auth`），密碼只在後端比對。本專案目前刻意不設＝公開。
- `/api/health` 輕量探針公開；`/api/health?detail=1` 需 `Authorization: Bearer <HEALTH_DETAIL_TOKEN>`，或在有設定 `APP_ACCESS_PASSWORD` 時帶有效登入 cookie。
- 對外 API 在正式環境只回通用錯誤訊息，詳細錯誤寫入 server log，避免把上游或資料庫錯誤細節洩漏到前端。

## 資料來源與免責

日 K 與基本面：FinMind（未還原價）・即時報價：TWSE MIS。本站僅供個人參考，非投資建議。
