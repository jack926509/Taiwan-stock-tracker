# 穩定性與診斷優化

使用者授權：依已發現項目執行，檢查完成後直接 push。main 推送會依既定流程自動部署 Cloudflare。基準提交 788c5bd；不另啟動通知、寫入正式自選股或變更資料庫結構。

## 驗收條件與測試介面

1. runScheduledCron：排程失敗仍重新拋出原錯誤，但資料庫與診斷日誌只存固定原因、工作種類、失敗階段及排程時間。取得鎖失敗不執行業務；完成紀錄失敗與業務失敗能區分。
2. 瀏覽器診斷：hydration 前建立監聽；記錄 React 418、未處理錯誤與錯誤頁。只回傳固定頁面分類、錯誤種類、數字 digest、連線／viewport／SW 狀態；不傳原始錯誤、堆疊、查詢字串、使用者內容或完整網址。正常載入不送診斷；既有 console 與錯誤行為維持。POST API 檢查同源、限制資料大小、驗證欄位並限量寫日誌。
3. buildSummaryData：相同代號不同市場不可命中舊摘要；自選名稱或提醒觸發狀態變動不可保留舊名稱或提醒次數。保留既有快取時效及行情來源契約。
4. 首頁：首次資料讀取失敗時，桌機／手機在行情列表之前可見明確錯誤與重試方式；失敗不持續假裝載入。
5. 套件：先核對目前 audit，僅採可驗收的相容修補；未修補通報據實保留，不以強制主要版本升級取代評估。
6. 正式排程：唯讀核對 scheduled_job_state，區分執行成功與使用者實際收到 LINE；不為驗收觸發新通知。

## 執行順序

先紅後綠修正排程與摘要介面，接著加入安全診斷與首頁提示，最後套件與文件。依 CLAUDE.md 完成 test、型別、Next／Worker build、dry-run、隔離 API、桌機／手機四頁與異常情境驗收，交 Claude 唯讀交叉審查；通過後提交、正常推送 main，核對遠端 SHA、CI、Cloudflare 建置版本與正式頁面。

## 已核對的正式紀錄

2026-10-09（台北）：daily-summary 13:35:53–13:35:58，ok、sent=true；backfill 17:01:08–17:01:15，ok=9、fail=0。均為本次修改前的既有排程，不能代表新版本或手機收件驗收。

## 限制

React 418 在手機提醒頁的原始 Worker 重載中再次出現，開發版八次重載未重現。完整傳送 HTML 的隔離代理 25 次重載沒有錯誤；原始 Worker 另一輪進入頁面時發生一次、隨後 25 次重載未新增。上游 React／OpenNext 有相似未解議題，但仍不能證實本專案的根因。嘗試小型 HTML 完整傳送後，50 次普通重載未新增錯誤，但「JavaScript 已快取、HTML 每次重新取得」的第四次驗收再次出現，因此緩解未奏效，已撤回修改並將嘗試檔案保留在忽略的驗收目錄。保留 SSR 與原有錯誤行為，尚未宣稱 hydration 問題已解決。

資料庫結構不變；請求快取及 API 限量只作用於同一 Worker 執行個體。多人共享行情快取仍待流量證據，未納入本次。

## 官方來源與套件決策

- Next.js 的 [instrumentation-client](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client) 自 15.3 支援，於 hydration 前執行。現行 Next 15.5.27 原始碼的 recoverable-error 回呼經 `reportGlobalError` 使用原生 `reportError`；不攔截 console。
- 上游相似問題：[React 37321](https://github.com/react/react/issues/37321)、[OpenNext Cloudflare 1321](https://github.com/opennextjs/opennextjs-cloudflare/issues/1321)。僅作時序假設與緩解的參考，不能據此判定本專案根因。
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) 支援自訂結構化日誌及 `invocation_logs: false`；本次只啟用既有 Worker 的診斷，不新增外部監控服務。
- [selector parser 7.1.6 官方修補](https://github.com/postcss/postcss-selector-parser/releases) 排除 CPU 耗盡問題，固定覆寫並經兩種建置與頁面驗收確認 Tailwind 3 相容；完整 audit 7 降為 5（均 high），正式相依 0。剩餘 [braces 通報](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 尚無修補版本，保留記錄。
- Supabase 官方 changelog 與 select 文件已核對；既有查詢只需檢查回傳 `error`，不變更資料庫結構或採用新 SDK。


## Hydration 修正與本機驗收結果

2026-10-09 18:50（Asia/Taipei）。隔離的 React 最小探針捕捉到：頁面預期根 `div`，hydration 游標卻在內層 `header`，當時文件已是 `interactive`。React 原始產物已由重新建置還原，SHA-256 與探針前原檔一致；探針未納入正式程式碼。

`app/layout.tsx` 改用 React `Suspense` 包住各頁內容，讓頁面與共用版面的 hydration 有自己的邊界，保留 SSR。這是依實測結果採用的最小修正，並非底層根因已完全證實。原始提醒頁 HTML 仍包含 header、main 與 Suspense 標記，共 12714 bytes。修改後以每次新 HTML、已快取 JavaScript 的情境提醒頁連續載入 100 次，另外首頁、搜尋與個股頁各 25 次，共 175 次，console error／warn 為 0。

| 驗收 | 結果 |
| --- | --- |
| `npm test` | 246 通過、0 失敗、0 略過 |
| `npx tsc --noEmit --incremental false` | exit 0 |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0 |
| `npx wrangler deploy --dry-run` | exit 0，gzip 2009.42 KiB，未上傳 |
| `git diff --check` | exit 0 |
| 隔離 `verify:cloudflare` | 9 個端點全數通過 |
| 1440 × 900／390 × 844 四頁 | 8 個情境全過，無正常 console error／warn、溢出或失效圖片，K 線可見 |
| 週 K 與到價提醒面板 | 實際操作通過，未儲存或發送通知 |
| 首次報價 503 | 桌面／手機提示距頁頂 93／85 px，無假載入骨架，重試按鈕可見 |
| 報價恢復 | 自動重試恢復；再實按「立即更新」顯示「報價已更新」 |
| 跨視窗原生 Error | 人工隔離 418 回報得到 204；只含白名單欄位，原始 console 錯誤仍可見 |

詳細日誌、JSON 與截圖保留於忽略的 `.backups/stability-20261009/`；不提交假資料、探針或敏感設定。正式資料僅做先前唯讀查詢，本次沒有正式 Supabase 寫入或 LINE 手動發送。

發布仍待獨立 Claude 審查。自動核准審查以「使用者尚未明確授權將本機程式碼與診斷紀錄交給外部 Claude 服務」拒絕啟動唯讀 CLI；已向使用者詢問，不能繞過。使用者已授權通過檢查後推送 main，遠端仍為 `788c5bd14ee2efd99bdfef93cb6c5b60ffe07e17`，本機 main 與遠端沒有分歧；尚未推送或部署本次修改。
