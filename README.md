# 台股追蹤（tw-stock-tracker）

個人專用台股即時追蹤儀表板。零券商帳戶、以免費資源為主（設計優先序：穩定 > 盡量免費 > 實用）。
完整規格見上層資料夾 `Taiwan-Stock-Tracker-Build-Plan.md`（v5.1）。

## 目前進度

- ✅ Phase 0：Supabase 9 張表建妥、MIS 端點實測通過、smoke test 腳本完成
- ✅ Phase 1：即時報價 MVP（自選股 CRUD、報價牆、大盤指數、密碼保護）
- ⬜ Phase 2+：K 線/指標、基本面、消息面、手機優化

## 本機啟動

```bash
npm install
cp .env.local.example .env.local   # 填入 SUPABASE_SERVICE_ROLE_KEY
npm run dev                        # http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` 取得方式：Supabase Dashboard → 專案 → Project Settings → API Keys → `service_role`（secret）。沒填的話報價照常可看，但自選股無法儲存。

## Phase 0 決策 Gate（部署前必跑）

部署到 Vercel 後，從本機實測「海外節點 → MIS」的穩定度：

```bash
# 真正的 Gate：打部署好的代理端點 5 分鐘
node scripts/smoke-test.mjs --url https://<你的部署網址> --minutes 5 --password <APP_ACCESS_PASSWORD>

# 對照組：本機（台灣 IP）直打 MIS
node scripts/smoke-test.mjs --minutes 5
```

- 成功率 ≥ 95% → 免費路線：留在 Vercel，月費 NT$0
- 成功率 < 95% → 穩定路線：報價代理搬 Zeabur 常駐服務（月付約 NT$150–300）

結果會寫入 `scripts/smoke-result.json`，請保留作為路線決策紀錄。

## 部署（Vercel）

1. push 到 GitHub，Vercel 匯入專案
2. 環境變數設定：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`APP_ACCESS_PASSWORD`（公開 URL 必設）
3. 部署完成後跑上面的 Gate 測試

## 安全注意

- `SUPABASE_SERVICE_ROLE_KEY`、`TAVILY_API_KEY` 只在後端 Route Handler 使用，前端永不引用
- 全部資料表已開 RLS 且不設 policy：anon key 即使外洩也讀不到資料
- `APP_ACCESS_PASSWORD` 由 `middleware.ts` 攔截全站（除 `/api/health`、`/login`），密碼只在後端比對
