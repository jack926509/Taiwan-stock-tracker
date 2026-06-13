# 台股追蹤（tw-stock-tracker）

個人專用的台股即時追蹤儀表板。零券商帳戶、以免費資源為主，設計優先序：**穩定 > 盡量免費 > 實用**。台股慣例 **紅漲綠跌**、淺色護眼介面。

🔗 線上：<https://tw-stock-tracker.zeabur.app>（公開，無密碼）

> 完整規格見上層資料夾 `Taiwan-Stock-Tracker-Build-Plan.md`（v5.1）。

## 功能

- **即時報價牆**：自選股卡片（紅漲綠跌）、大盤指數、盤中每 10 秒更新、近 20 日 sparkline、漲跌停徽章、一鍵排序、「更新於 X 秒前」。
- **自選股管理**：新增（即時查名預覽）／刪除，雲端或本機儲存。
- **個股頁**（點卡片進入）：
  - 日 K 蠟燭圖（lightweight-charts v5）＋ 成交量 ＋ MA5/20/60 ＋ 十字游標讀數，3 月／6 月／1 年切換。
  - 基本面：估值（PER／PBR／殖利率）、三大法人買賣超、月營收 YoY、**每股盈餘 EPS（單季＋近四季合計）**。
- **盤後自動補資料**：Zeabur 常駐程式內建 node-cron，週一～五 17:00（台北）補抓自選股當日 K，兼作 Supabase keep-alive。

## 技術棧

Next.js 15（App Router）・React 19・TypeScript・Tailwind 3・SWR・lightweight-charts v5・Supabase（PostgreSQL）。

## 架構

| 層 | 內容 |
|---|---|
| 即時報價 | TWSE MIS 端點，session cookie 持久化、5 秒節流、stale 快照 failover |
| 歷史／基本面 | FinMind（日 K、法人、月營收、PER、財報 EPS）；`FINMIND_TOKEN` 可選，填了限流較寬 |
| 儲存 | 雙模式：設了 Supabase 變數走雲端，否則退回本機 JSON（`.data/`） |
| 部署 | Zeabur 常駐 Node 服務（東京專屬伺服器，固定 IP 利於 MIS） |

**雙模式儲存**是核心設計：本機開發免任何金鑰即可跑（報價＋圖表全可測），填入 Supabase 金鑰就無痛切雲端。

### 資料表（Supabase，共 4 張）

| 表 | 用途 |
|---|---|
| `watchlist` | 自選股 |
| `daily_kline` | 日 K 線快取（增量補抓） |
| `news_cache` | 基本面快取（估值／法人／營收／EPS 的 JSON，12 小時 TTL） |
| `mis_session` | MIS 即時報價 session cookie |

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
| `APP_ACCESS_PASSWORD` | 選用 | 設了才啟用全站密碼保護；留空＝公開 |

## 部署（Zeabur）

從 GitHub `main` 部署，push 即自動重新部署。在 Zeabur 設好上表環境變數即可。

> 注意：`NEXT_PUBLIC_` 開頭的變數於 build 時嵌入，改動後需 redeploy 才生效。

## 指令

```bash
npm run dev      # 開發
npm run build    # 正式 build
npm run start    # 啟動正式版
npm run smoke    # MIS 穩定度壓測（--url <網址> --minutes 5）
```

## 安全注意

- `SUPABASE_SERVICE_ROLE_KEY`、`FINMIND_TOKEN` 只在後端 Route Handler 使用，前端永不引用；只放 `.env.local`（已 gitignore）與 Zeabur 環境變數，絕不入程式碼／git。
- 資料表全開 RLS 不設 policy：anon key 即使外洩也讀不到資料。
- `APP_ACCESS_PASSWORD` 由 `middleware.ts` 攔截全站（除 `/api/health`、`/login`、`/api/auth`），密碼只在後端比對。本專案目前刻意不設＝公開。

## 資料來源與免責

日 K 與基本面：FinMind（未還原價）・即時報價：TWSE MIS。本站僅供個人參考，非投資建議。
