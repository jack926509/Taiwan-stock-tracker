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
