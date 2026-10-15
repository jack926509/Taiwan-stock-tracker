# 僅本人存取與正式發布

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
- [ ] 以兩個現有網域測匿名首頁、API 與資源，確認無資料外洩；以本人登入驗桌面及手機核心頁面。
- [x] Astra 獨立複驗 Access 政策與 migration 證據；本人登入成功仍另待完成。
- [ ] 推送最新紀錄、確認 CI、合併 PR #10，核對正式部署並同步本機 main。

## 目前狀態（2026-10-15，台北）

- Cloudflare 管理頁已使用既有 Google 登入開啟；台股 Worker 的 Access 頁現已顯示「所有 Traffic」，每個正式／預覽 URL 都需登入。
- 原生 Worker Access 可覆蓋所有關聯網址，依據 [Cloudflare 官方文件](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)。
- 前輪「使用 Access 保護此 Worker」按鈕曾被自動核准審查拒絕；使用者已回覆確認唯一信箱，本輪重新開啟設定成功，未以 API 繞過拒絕。
- Worker 快速設定僅提供整個 Cloudflare 帳戶或 email 網域規則；為符合只允許本人，先在 Zero Trust 建立單一 email 原則，再套用到此 Worker。
- 已建立單一 email Allow 原則「台股追蹤僅本人」，ID `680aea9e-2320-40f9-b862-ac7960e6eb88`；Access app ID 為 `eab7b1fe-0ae8-4971-ac4f-dfa300515166`，工作階段 24 小時。未新增網域／所有帳戶成員或 bypass 規則。
- 兩個現有網域的首頁、搜尋、提醒、個股頁、個人 API、健康檢查、Service Worker 與離線頁共 24 個匿名 GET 均為 HTTP 302，導向 `xiehcs.cloudflareaccess.com`；不回傳個人資料。結果存於本機 `/private/tmp/twstock-anonymous-access.json`。
- 已寄出本人一次性登入碼，保留 Chrome 驗證頁供使用者直接輸入；不索取或讀取信箱／驗證碼內容。本人登入成功與正式頁面驗收仍待完成。
- 尚未合併或發布；不得把匿名阻擋通過寫成完整登入驗收通過。
- Astra 已另開只讀管理頁獨立確認：app 目的地僅 `tw-stock-tracker` 的正式與預覽 URL；政策只有一列 Allow、規則總計一筆精確 email、只供一個 app 使用。獨立無 cookie／key 的 12 個 HTTP 請求全數被 Access 攔截，無個人 API JSON；結論為 Access 範圍正確、未發現設定問題。
