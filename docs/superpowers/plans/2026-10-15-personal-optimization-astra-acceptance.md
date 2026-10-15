# Astra 全案驗收與發布紀錄

## 使用者更新指示

2026-10-15 使用者明確指示：此次不需要 Claude 審查；由 Astra 驗收，沒有問題後推送 GitHub 並合併。這項指示取代前輪等待外部 Claude 授權的阻擋條件。Astra 為本次合併前指定技術驗收者，不宣稱使用者已親自操作。

## 第一輪獨立驗收

- 模型：`gpt-6-astra`，獨立於實作者；範圍 `a4427df..0acc8f8`。
- 審查者實跑 `npm test`：346 / 346 通過；`npx tsc --noEmit`、`git diff --check a4427df..HEAD` 退出 0。
- 結論：需修正。0 Critical、2 Important。

### 收盤快照沿用盤中快取

13:28 的首頁摘要價格 100，13:35 已有價格 110，原本卻命中十分鐘摘要快取，把 100 保存成該日不覆寫的快照。修正為保存收盤時使用 `fresh: true` 略過摘要快取，保留來源與缺漏規則。新增實際摘要模組與保存模組的跨收盤整合測試，不只 mock 參數。

### 收盤後既有事件的重試被略過

13:31、13:32 連續失敗後，第三次重試排至 13:37，仍在十五分鐘內，原本卻被盤外守門擋掉。修正為 13:36 至 13:50 的交易日只派送既有事件，沿用原子租約與各事件期限，絕不重新取行情或判定新觸發。13:51 後、開盤前及非交易日不取得該工作租約。

以上兩項已先重現失敗、加入回歸測試並修正，349 項測試通過；待最後修正版本交 Astra 複驗。

### 首頁事件與已觸發條件不同步

Astra 提出疑慮後，以隔離瀏覽器模擬後端觸發 0050。未手動更新的首頁在一分鐘後事件數由 3 變 4，仍將 0050 列為未觸發且顯示距到價 4.76%，問題已證實。修正為可見首頁每分鐘及切回前景時同步自選清單，使事件計數與 hit 狀態都可更新；不在隱藏分頁持續輪詢。同一瀏覽器情境複驗通過：不手動更新，事件數 3→4 時，最近未觸發區改成「尚無可計算的到價條件」，0050 的距到價標籤消失；未見 console warning／error。

## 發布前實際查核

- GitHub 身分與操作權限有效；遠端 main 為 `a4427df`，既有 GitHub validate 與 Workers Builds 均成功。
- 正式 Supabase 有七筆既有 migration，尚無 `alert_versions`；不能先發布依賴新欄位與函式的程式。
- 已唯讀備份十筆自選股及兩筆狀態資料至本機 `.backups/personal-release-2026-10-15T05-47-50-994Z.json`，權限 0600，已確認被 Git 忽略。SHA-256：`ede48d9aa3f8d12a99ff3d40b25f7b1901192229737a8b670bf36af6771f7acc`。未將備份內容加入 Git。
- Cloudflare 既有憑證有效，該帳號 Access applications 為空；匿名對正式首頁及 `/api/watchlist` 皆為 HTTP 200，後者可讀取清單結構。已向使用者提出沿用公開／限本人選項，不把舊文件的未知狀態當作已受保護。
- 尚未套正式 migration、尚未推送／合併／部署。後續結果完成後補記。


## 第二輪 Astra 複驗

- 範圍 `0acc8f8..3386bda`，模型 `gpt-6-astra`。
- 審查者重新實跑 349 / 349 測試、TypeScript 與差異格式檢查通過。
- 原始重現腳本另跑修正檢查：收盤 fetches = 2、保存價格 110；13:37 新事件檢查 0、既有派送 1、deliveryOnly = true。
- 兩項 Important 關閉，未發現新增問題。結論「程式可合併」；發布需另確認 migration 能力與公開／限本人存取決策。
- 主代理最終 Next.js／OpenNext 建置、dry-run（gzip 2050.09 KiB）、既有 9 個 HTTP 驗收通過，記錄於 `/private/tmp/twstock-astra-final-*`。

## GitHub 推送與正式發布待辦

- 已推送工作分支並建立 Draft PR：<https://github.com/jack926509/Taiwan-stock-tracker/pull/10>。
- 來源 `62fe4a0e55871d62bd1b2b45846cb4b52cfa54e7` 的 push／pull_request 兩個 validate 均成功：[push 驗證](https://github.com/jack926509/Taiwan-stock-tracker/actions/runs/38689353483)、[PR 驗證](https://github.com/jack926509/Taiwan-stock-tracker/actions/runs/38689409665)。後續文件提交的檢查另以 PR 最新 SHA 為準。
- 修正版四頁 `/`、`/search`、`/alerts`、`/stock/2330` 已再跑桌面 1280 px 及手機 390 × 844，實際渲染、無橫向溢出，未見 console warning／error。
- 正式 Supabase 安全 advisors 僅有八個既有 RLS 無 policy 的 INFO；後端使用 service role、匿名資料表存取維持封鎖，未增加公開資料庫 policy。這不代表網站 API 已有登入保護；網站匿名清單可讀的實測結果仍有效。[INFO 說明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。
- 依使用者全域 AGENTS.md 的正式資料規則，已提出套用必要新增 migration 的確認；另已詢問沿用公開或限本人存取，目前都尚未收到答覆。未將 async 選項的預選或經過時間當作同意。
- 在上述確認完成前，不合併 main、不啟用新正式寫入；使用者已授權 GitHub 推送與合併，確認後不用再重問相同 GitHub 操作。
- Supabase CLI dry-run 長時間無輸出，已明確終止本次程序；未把它當作已通過或已套 migration。正式能力與七筆既有 migration 已由已連線的 Supabase 工具唯讀查核。

## 使用者正式授權與 migration 套用（2026-10-15 14:09，台北）

- 使用者明確回覆「資料庫更新：同意套用；存取方式：僅本人使用」。先前兩項決策已獲答覆，僅本人登入信箱另待確認。
- 更新前重新備份 10 筆 watchlist 與 2 筆狀態，檔案位於 gitignored 的 .backups，權限 0600；SHA-256 為 7e99b6f36304b2a79e98d2bc3554f2a9a9c1d1cc55fa4e84962f38b9d887ce1a。
- 已透過 Supabase apply_migration 成功套用 personal_alert_events；正式版本 20261015060931。為使後續 CLI 不會誤判重複未套用，將原檔 20261015040817 重新命名對齊正式版本，SQL 完全一致，SHA-256 為 56e00c6041f70a5429d883666893d52453faee24b56fc95214032e8b35c17c34。
- 套用後以備份逐欄位比對，10 筆既有清單原值全部保留；10 筆各具 high/low/change/volume 版本，5 個事件／通知函式存在，preserve_alert_versions trigger 啟用。匿名角色對事件函式的 EXECUTE 權限為 0。
- 安全 advisors 無新增警告；維持 8 項既有 RLS 無 policy 的 INFO，後端以 service role 存取，未加匿名 policy。[官方說明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。
- 目前仍未合併或部署。下一步為只對 tw-stock-tracker 的全部網址設本人 Access 保護、獨立驗收，再沿已授權的 GitHub 流程發布。

### 套用後獨立複驗

- Astra 親自驗證 SQL 原文 byte-identical、13／13 SQL 與 migration 測試通過、diffcheck 通過，結論為本輪 migration 紀錄修正可合併，0 Critical／Important／Nit。
- Astra 直接查正式系統目錄：第八筆 migration 版本正確；alert_versions 為 JSONB NOT NULL 且四種 UUID default；preserve_alert_versions 為啟用的 BEFORE UPDATE FOR EACH ROW trigger。
- 5 個業務函式及 trigger 函式皆 SECURITY INVOKER、search_path=public,pg_temp；anon/authenticated 無 EXECUTE，service_role 有 EXECUTE；watchlist/news_cache 維持 RLS 啟用及 0 policy。
- 主代理再次實跑完整測試 349／349、TypeScript 通過。npm audit 仍有 5 項既有 high 通報，集中於 Tailwind 3 的 braces／micromatch／chokidar／fast-glob 建置相依鏈；未因本輪增加，既有風險未宣稱消除。升級 Tailwind 4 屬另一項介面與建置變更，本輪不混入。
- Access 尚未設定或驗收，不能把本輪通過解讀為已可正式發布。

- 本輪 Next.js build、OpenNext build 均通過；Worker dry-run gzip 2047.47 KiB，未上傳。最初沙箱 listen EPERM 以相同指令在可綁定 localhost 的環境重跑通過。
- 本輪未修改應用程式執行碼；前輪 9 個 HTTP 與桌面／手機互動證據繼續涵蓋相同功能。正式 Access 的匿名拒絕及本人登入驗收另待實施，未以本機結果代替。

## 單一信箱 Access 啟用（2026-10-15，台北）

- 使用者已明確確認唯一登入信箱；實際信箱只寫入 Cloudflare 政策，未放進公開 Git。前輪按鈕拒絕的待確認條件已消除，本輪 UI 正常開啟並完成設定。
- 先建立單一精確 email Allow 原則「台股追蹤僅本人」，ID 680aea9e-2320-40f9-b862-ac7960e6eb88，再套用 tw-stock-tracker Worker 的 All traffic，24 小時；未使用帳戶成員／整個網域或 bypass 規則。
- 管理頁顯示 Worker Access、所有 Traffic、每個正式／預覽 URL 都需登入；Access app ID eab7b1fe-0ae8-4971-ac4f-dfa300515166。官方 Worker 層級保護說明：https://developers.cloudflare.com/workers/configuration/cloudflare-access/ 。
- 主代理實測兩個現有網域的 24 個匿名 GET，包含四頁、watchlist／alert-history／personal-status／personal-backup／closing-history／health，以及 sw.js／offline.html，全部 HTTP 302 到 xiehcs.cloudflareaccess.com。未帶登入 cookie，未讀取個人資料本文。
- 已讀 Service Worker 原始碼：只快取無個人內容的 offline.html，不快取頁面或 API；未為 Access 放寬離線快取。
- 現有 Cloudflare API token 讀取詳細 Access app／policy 回 403；設定及讀回以已登入管理 UI 為準，不用空 list 宣稱無設定，不新增權杖或擴大權限。
- 正式站已寄出本人 email 一次性驗證碼，由使用者直接在 Chrome 輸入；尚未確認登入成功。Astra 已派工獨立驗匿名阻擋與政策範圍。尚未合併或部署新版。

### Astra Access 獨立驗收

- 審查者自行開啟只讀 Cloudflare 管理頁：app 目的地僅 tw-stock-tracker、類型為 Worker 的生產與預覽 URL、24h；政策表僅一列 Allow，Include Emails 只有使用者確認的精確 email，無 Bypass／整個網域／整個帳戶授權。規則總計一筆、使用 app 數為一。
- 審查者獨立對兩個正式網域各六個路徑發出無 cookie／key 的 HTTP 請求，12／12 皆為 302 到 xiehcs.cloudflareaccess.com，本文無個人 API 欄位。結論：Access 範圍正確，未發現設定問題。
- 審查者未修改政策、未操作 OTP 分頁。本人登入尚待完成，未把單一允許規則正確當作登入端到端通過。
