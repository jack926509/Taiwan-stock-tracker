# 台股網站免登入設定

## 使用者要求與範圍

2026-10-17（Asia/Taipei），使用者明確要求移除每次開啟網站時的登入設定。本次要求取代 2026-10-15 的僅本人登入決策；只處理 `tw-stock-tracker` 的 Cloudflare Access，不變更其他網站或帳戶層級政策。

程式的 Next middleware 與 Worker 已直接放行，登入來源是 Cloudflare Worker Access。移除後，知道網址的人也能讀取及操作網站的自選股、提醒與備份；個人使用不代表網站仍為私有。後端 secrets、資料庫 RLS 與詳細健康檢查 token 保護維持原有設定。

## 執行計畫與驗收條件

1. 確認正式兩個網域目前匿名請求導向 Access，以及對應 Access app 僅涵蓋本 Worker。
2. 透過 Cloudflare 管理介面移除本 Worker 的登入保護；不刪除股票、提醒或資料庫資料，不重新部署應用程式。
3. 匿名首頁、搜尋、提醒、個股頁與既有讀取 API 可直接回應；`/api/health?detail=1` 無 token 仍回傳 401。
4. 實際開啟桌面與手機頁面驗渲染，唯讀操作搜尋及導覽，不寫入正式資料或發送 LINE。
5. 執行既有測試、型別與建置驗收，交獨立代理複驗匿名 HTTP 結果，再同步專案文件及本機提交。

## 執行狀態

- 已確認 middleware 與 Worker 無應用程式登入攔截；正式版本為 `95c2bd1d`，承接 100% 流量。
- 修改前匿名正式首頁及自選 API 皆為 HTTP 302，導向 Cloudflare Access。
- 後台變更及修改後驗收尚待執行；此紀錄不代表已停用登入。

## 變更前驗證

- Cloudflare 管理頁確認 app 目的地只有 `tw-stock-tracker` 的正式及預覽 URL，原則只有一條「台股追蹤僅本人」Allow。瀏覽器工具要求停用驗證於執行當下取得確認，已向使用者提出，尚未點擊刪除。
- 兩個正式主機各測 `/`、`/api/watchlist`、`/api/health?detail=1`，6 個匿名 GET 皆為 HTTP 302。
- 獨立代理執行：`npm test` 350／350、`npx tsc --noEmit`、`npm run build`、`npm run cf:build`、`npx wrangler deploy --dry-run`、`git diff --check` 全數通過；Worker gzip 2045.69 KiB。建置需要本機 listen 權限，原 sandbox EPERM 後以相同指令取得權限重跑成功；dry-run 日誌改寫至 `/private/tmp`，未上傳 Worker。
- 獨立複核 middleware 與 Worker 放行、詳細健康檢查缺少／錯誤 token 拒絕、舊登入 cookie 無法代替 token；這些執行檔本次沒有修改。
- 驗證日誌存於本機 `/private/tmp/twstock-no-login-*-verify.log`，不含環境金鑰。
