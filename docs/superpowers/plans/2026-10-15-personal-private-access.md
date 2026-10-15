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
- [ ] 確認登入 email 及以上保護範圍。
- [ ] 建立單一 email 政策並只套用到台股 Worker 的全部流量。
- [ ] 以兩個現有網域測匿名首頁、API 與資源，確認無資料外洩；以本人登入驗桌面及手機核心頁面。
- [ ] Astra 獨立複驗 Access 政策與 migration 證據。
- [ ] 推送最新紀錄、確認 CI、合併 PR #10，核對正式部署並同步本機 main。

## 目前狀態（2026-10-15，台北）

- Cloudflare 管理頁已使用既有 Google 登入開啟；台股 Worker 的 Access 頁明確顯示尚未受保護。
- 原生 Worker Access 可覆蓋所有關聯網址，依據 [Cloudflare 官方文件](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)。
- 「使用 Access 保護此 Worker」按鈕被自動核准審查拒絕，原因為單一登入 email 與政策範圍尚待確認。未重試或以 API 繞過；已向使用者提出具體確認。
- 尚未建立 Access 政策、尚未合併或發布；不得把本人保護計畫寫成已完成。
