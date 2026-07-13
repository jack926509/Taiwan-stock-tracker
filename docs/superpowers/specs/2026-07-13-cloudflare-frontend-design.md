# Cloudflare 前端遷移設計

## 目標

讓使用者以 `https://twstock.xiehnet.com` 使用台股追蹤器。Cloudflare 負責前端與邊緣代理；Zeabur 保留既有 Node.js API、資料庫存取、TWSE 連線與常駐排程。GitHub `main` 更新後，Cloudflare 自動部署前端。

## 現況與限制

- 現有 Next.js 服務同時提供畫面與 `/api/*`，包含 Node.js runtime API 與 `node-cron` 排程，不能直接做純靜態匯出後關閉 Zeabur。
- 瀏覽器目前以相對路徑呼叫 `/api/*`。若直接改呼叫 Zeabur 網址，會引入 CORS 與登入 cookie 網域問題。
- `xiehnet.com` 已由 Cloudflare 代管，`twstock.xiehnet.com` 尚未有 DNS 紀錄。

## 採用架構

```text
瀏覽器
  └─ twstock.xiehnet.com
       ├─ /*       → Cloudflare Pages：靜態前端
       └─ /api/*   → Cloudflare Pages Function：代理至 Zeabur
                                      └─ tw-stock-tracker.zeabur.app/api/*
```

代理會保留 HTTP 方法、查詢字串、請求本文與必要標頭；同時改寫上游回應中的 `Set-Cookie` 網域，讓登入 cookie 屬於 `twstock.xiehnet.com`。前端繼續使用相對 `/api/*`，因此不需瀏覽器 CORS 設定，也不會把後端金鑰帶到 Cloudflare 前端。

## 範圍

1. 新增可靜態輸出的前端建置設定與 Cloudflare Pages Function API 代理。
2. 新增單元測試，驗證代理僅接受 `/api/` 路徑、正確組合 Zeabur 上游網址，且不轉送敏感或 hop-by-hop 標頭。
3. 新增 Cloudflare Pages 的 GitHub 部署設定與操作文件。
4. 維持 Zeabur 原服務與排程，不變更環境變數或資料庫。
5. 最後建立 Cloudflare Pages 專案、連接 GitHub `main`、新增 `twstock.xiehnet.com` DNS／自訂網域，並以實際頁面與 API 驗收。

## 不在範圍

- 不修改 Supabase schema 或資料。
- 不更換 Zeabur 專案、服務、地區或環境變數。
- 不處理與此次部署無關的既有介面修改。

## 驗收條件

1. `npm test` 與 `npm run build` 成功。
2. Cloudflare Pages 的預覽網址可顯示首頁與個股深連結。
3. 預覽網址的 `/api/health` 回應 `200` 與 `ok: true`，且由 Zeabur 後端提供。
4. 正式網址 `https://twstock.xiehnet.com` 顯示首頁，`/api/health` 回應 `200`。
5. Zeabur 既有網址與排程維持可用。

## 風險與處理

- **靜態輸出限制**：Next.js 動態個股路由需改為靜態 shell 加用戶端資料載入；直接輸入個股網址需由 Pages fallback 回傳 app shell。
- **快取／舊版 Server Action 請求**：Cloudflare 對 `/_next/*` 採版本化快取；對不合法 Server Action 請求加 WAF 規則，不以應用程式錯誤回應。
- **切換風險**：先以 Pages 預覽網址驗收，最後才新增正式子網域；Zeabur 原網址留作可回退來源。
