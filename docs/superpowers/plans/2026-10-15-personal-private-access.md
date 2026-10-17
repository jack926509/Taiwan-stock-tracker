# 僅本人存取與正式發布

> 歷史紀錄：以下為 2026-10-15 的決策與驗收。使用者於 2026-10-17 明確要求並再次確認移除登入，已刪除台股 Worker 專用的 Access app；目前以 [免登入設定紀錄](2026-10-17-no-login-access.md) 為準，不再以匿名被攔截作為驗收條件。

使用者已於 2026-10-15 同意正式 migration，並選擇網站「僅本人使用」。先前已授權 Astra 驗收、GitHub 推送與合併；不再要求 Claude 審查。

## 驗收條件

1. 自選清單、提醒、歷史、備份與頁面，在未登入時皆不得讀取。
2. 只允許使用者確認的一個 email 登入，不用整個 email 網域或全部 Cloudflare 帳戶成員代替本人。
3. `tw-stock-tracker` 的正式站、`workers.dev` 及預覽網址全部受保護，其他 Worker 不受影響。
4. 保留既有 Cron、資料庫與 LINE 工作；不以正式 LINE 發送或修改清單測試權限。
5. Astra 複驗通過、最新 CI 全綠後合併；確認正式部署版本並實際開頁驗收。

## 實作方式

- 優先使用 Cloudflare 原生「單一 Worker、全部流量」Access 保護，涵蓋該 Worker 的所有網域與 API，避免自行維護密碼、session 與 JWT 驗證。
- 使用單一 email allow policy。登入信箱只存於 Cloudflare 設定，不放進公開 GitHub 文件。
- 以 email 一次性驗證碼登入；若帳戶尚未完成 Zero Trust 啟用，先查可用的免費設定與現有身分提供者，不自行啟用付費方案。
- 不以開放全部成員／網域的暫時規則上線。若 Worker 設定頁無法選單一 email，先在 Zero Trust 建立明確政策後再套用。
- 本機仍用既有隔離預覽驗功能；正式站另外驗匿名拒絕與本人登入成功，不能以本機成功代替正式權限驗收。

## 依序工作

- [x] 正式 migration 前備份並取得使用者授權。
- [x] 套用 `20261015060931_personal_alert_events.sql`，比對 10 筆既有資料完全保留。
- [x] 本機 SQL 檔與測試對齊正式 migration 版本，SQL 原文不變。
- [x] 使用者已確認唯一登入 email 及以上保護範圍。
- [x] 建立單一 email 政策並只套用到台股 Worker 的全部流量。
- [x] 以兩個現有網域測匿名首頁、API 與資源，確認請求被 Access 攔截。
- [x] 以本人登入驗桌面及手機核心頁面與 API。
- [x] Astra 獨立複驗 Access 政策、migration 證據與本人正式 API。
- [x] 推送最新紀錄、確認 CI、合併 PR #10，核對正式部署並同步本機 main。

## 目前狀態（2026-10-15，台北）

- Cloudflare 管理頁已使用既有 Google 登入開啟；台股 Worker 的 Access 頁現已顯示「所有 Traffic」，每個正式／預覽 URL 都需登入。
- 原生 Worker Access 可覆蓋所有關聯網址，依據 [Cloudflare 官方文件](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)。
- 前輪「使用 Access 保護此 Worker」按鈕曾被自動核准審查拒絕；使用者已回覆確認唯一信箱，本輪重新開啟設定成功，未以 API 繞過拒絕。
- Worker 快速設定僅提供整個 Cloudflare 帳戶或 email 網域規則；為符合只允許本人，先在 Zero Trust 建立單一 email 原則，再套用到此 Worker。
- 已建立單一 email Allow 原則「台股追蹤僅本人」，ID `680aea9e-2320-40f9-b862-ac7960e6eb88`；Access app ID 為 `eab7b1fe-0ae8-4971-ac4f-dfa300515166`，工作階段 24 小時。未新增網域／所有帳戶成員或 bypass 規則。
- 兩個現有網域的首頁、搜尋、提醒、個股頁、個人 API、健康檢查、Service Worker 與離線頁共 24 個匿名 GET 均為 HTTP 302，導向 `xiehcs.cloudflareaccess.com`；不回傳個人資料。結果存於本機 `/private/tmp/twstock-anonymous-access.json`。
- 本人已直接在 Chrome 完成一次性驗證碼登入；不索取、讀取或保存信箱／驗證碼內容。正式桌面／手機四頁與 API 驗收已完成，細節見下節。
- 使用者另明確指示「請直接推送與合併」，PR #10 已於台北時間 15:49 合併，合併提交為 `72f4210cbe1fc236714d07d39131827aa37a8faa`；GitHub validate 與 Cloudflare Workers Builds 均成功，晚間查核時正式 Worker `db784774` 承接 100% 流量。
- Astra 已另開只讀管理頁獨立確認：app 目的地僅 `tw-stock-tracker` 的正式與預覽 URL；政策只有一列 Allow、規則總計一筆精確 email、只供一個 app 使用。獨立無 cookie／key 的 12 個 HTTP 請求全數被 Access 攔截，無個人 API JSON；結論為 Access 範圍正確、未發現設定問題。

## 發布後查核（2026-10-15 晚間，台北）

- Cloudflare 後台確認正式來源仍為 `72f4210`、100% 流量，Worker Access 仍為所有流量及單一精確 email；四個 Cron 已設定，最近十次 Cron 叫用成功。盤外叫用成功不能代替盤中提醒或收盤通知的業務驗收。
- 過去 24 小時的 Worker 執行錯誤及資源 5xx 都為 0；資源請求共 180 筆，其中 4xx 為 125 筆。現有 invocation logs 關閉，沒有歷史逐筆路徑可歸因，不宣稱這 125 筆皆為使用者錯誤或皆為正常。
- Astra 以實際 OpenNext middleware 與隔離 ASSETS adapter 重現：首頁、搜尋、提醒、個股頁及三個個人 API，共七個合法動態路徑，都先取得內部 ASSETS 404，再正確交給 Next.js；Service Worker、離線頁與目前首頁 JavaScript 則直接取得 200。這證實正常路由也會產生資源 4xx，並非歷史 125 筆的逐筆證據。
- Astra 核對 42 個 manifest 靜態引用均存在，52 個來源／打包檔內容一致；未發現需要更改資源路由的證據。主代理另重跑上述隔離 middleware 診斷，結果一致。
- 正式資料庫唯讀查核：17:00 的 K 線補齊為 10 成功、0 失敗、0 待補；13:35 收盤總覽因單檔缺少官方報價而未發送，日誌屬發布前版本。當日晚間仍查不到該代號的官方 MIS 報價；保留自選資料與完整性守門，不以刪除資料、放寬通知條件或事後補造收盤快照排除警告。
- 兩個正式網域各檢查首頁、健康檢查及自選 API，共六個匿名請求均為 302，導向 Access。實際 Chrome 開啟正式首頁先顯示信箱驗證碼登入頁，本人完成驗證後正常進入首頁；沒有修改政策或關閉保護以代替驗收。
- 本輪使用者已授權登入、查看及修改專案。登入驗證碼由使用者直接輸入保留的 Chrome 分頁，不保存至原始碼、日誌或 Git。

### 本人正式頁面與 API 驗收

- 主代理實際以已登入 Chrome 驗 `/`、`/search`、`/alerts`、`/stock/2330`，桌面 1280 × 900 及手機 390 × 844 均載入成功，document 寬度不超過 viewport，未見 console warning／error。個股圖表等待 canvas 完成後確認繪製；手機提醒面板左右邊界在畫面內。
- 實際操作名稱／代號搜尋並選取結果進入個股、已設提醒篩選與全部清單、距到價排序、提醒面板開關、歷史日期切換、日／週 K 切換及手機底部導覽。偏好於檢查後恢復原值；未儲存提醒、改動正式清單或發送 LINE。缺少報價的項目仍保留並明確標示；無收盤快照時顯示今日暫覽，不冒充已保存。
- Astra 使用獨立 Chrome 分頁及正常本人工作階段唯讀驗證：`/api/watchlist` 回傳 10 筆且 storage 為 supabase；`/api/personal-status` 的 issues 為空、K 線補齊 10／0／0；`/api/alert-history?date=2026-10-15&offset=0` 回傳合法空歷史及分頁欄位；`/api/summary?date=2026-10-15` 回傳 summary／savedAt 皆 null；`/api/health` 回傳 ok true。
- 收盤歷史的正確端點是 `/api/summary?date=YYYY-MM-DD`，不存在 `/api/closing-history`。先前匿名測試對不存在路徑仍會被 Access 攔截，該結果只證明保護範圍，不能證明歷史 API 功能；本輪已用正確端點補驗。
- Astra 另驗 `/api/personal-backup` 的 attachment 下載，實體 JSON 為版本 1、10 筆、Asia/Taipei，欄位符合備份白名單；私有檔保留於使用者下載資料夾，未輸出內容或加入 Git。下載導致的瀏覽器導航中止已用實體檔驗證排除，未將其誤判為 API 故障。
- 本輪 `npm test` 349／349、`npx tsc --noEmit`、Next.js build、OpenNext build 與 `git diff --check` 均通過；Worker dry-run gzip 2049.02 KiB，未由本機上傳。
- 本輪只修正發布／驗收文件，沒有證據支持更動應用程式、Access 政策或資料。ASSETS 歷史 125 筆的逐筆來源仍未知，當日收盤快照未回補；盤中實際通知與下一個收盤排程不以本次晚間唯讀驗收代替。
