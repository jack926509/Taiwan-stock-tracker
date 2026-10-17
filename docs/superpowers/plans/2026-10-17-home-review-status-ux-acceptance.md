# 首頁收盤回顧與系統狀態驗收

驗收時間：2026-10-17 16:25（Asia/Taipei）

## 結果

本機實作、獨立審查及隔離 Worker 驗收通過。未推送、合併或部署，未操作正式資料庫或發送 LINE。仍待使用者確認實際介面偏好。

- 收盤回顧預設最近已保存的日期，可切換今天與指定日期；無歷史、指定日無紀錄、讀取失敗各自顯示正確提示。
- 系統狀態保留上次檢查時間與結果，標題列可重新整理、匯出備份；來源、LINE、K 線與備份說明可展開。
- 失敗、行情不完整、K 線失敗／待更新與讀取問題保持可見。提醒頁每檔狀態未折疊。

## 自動驗證

最終程式版本依序執行：

| 項目 | 結果 |
| --- | --- |
| `npm test` | 438 tests，438 pass，0 fail，3780.23 ms |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0，OpenNext build complete |
| `npx wrangler deploy --dry-run` | exit 0，gzip 2053.44 KiB；未上傳 |
| `git diff --check` | exit 0 |
| `npm run verify:cloudflare` | 首頁、health、自選股、授權詳細 health 與 5 個靜態資源，共 9 項通過 |
| 隔離 Worker API | 11 項通過：最近／指定快照、無紀錄、無效參數、狀態、備份、詳細 health 無 token 401、空歷史、部分失敗及讀取錯誤 503 |

記錄位於 `/private/tmp/twstock-home-ux-{test,tsc,build,cf-build,dry-run}.log`，API 證據位於 `/private/tmp/twstock-home-ux-api-evidence.json`。

## 瀏覽器驗證

使用本機 Worker `127.0.0.1:8787` 及僅監聽 `127.0.0.1:8791` 的無正式憑證記憶體假資料庫。收盤與檢查紀錄是合成測試資料；測試中的一般行情仍取公開來源。

- 1280 × 900、390 × 844 各檢查 `/`、`/search`、`/alerts`、`/stock/2330`。八組皆正常渲染，頁面寬度等於 viewport，正常情境 console error／warn 皆為 0。
- 預設開啟 10/16；原生日期欄位用鍵盤切至 10/15，確認保存時間與內容一同變更。點今天呈現 10/17 無紀錄，再按最近一筆回到 10/16。
- 可展開／收合紀錄說明與檢查明細。重新整理及匯出備份可按，匯出沒有錯誤；備份 API 回 attachment、10 檔、提醒欄位及台北時區，未包含驗收憑證。
- 切換空歷史情境，顯示「尚無收盤紀錄」與重新讀取；不補造歷史。
- 切換部分失敗，收合時仍顯示處理失敗、行情不完整及 LINE 用量讀取失敗。
- 切換資料庫讀取錯誤，收盤顯示錯誤與重試，狀態卡顯示各讀取問題；恢復資料後按重試／重新整理即可恢復。此情境的預期 HTTP 503 不計入正常頁面的錯誤檢查。
- 單獨設 `fail=0、pending=2`，確認「最近 K 線仍有 2 檔待更新。」在收合時可見。
- 日期欄位的自動 `fill` 未觸發這次瀏覽器工具的日期變更，因此改用原生鍵盤選日期完成實際操作，未以注入程式修改 DOM。

畫面：`/private/tmp/twstock-home-ux-desktop.png`、`/private/tmp/twstock-home-ux-mobile-empty-date.png`、`/private/tmp/twstock-home-ux-mobile-degraded.png`。八組版面與 console 證據：`/private/tmp/twstock-home-ux-browser-evidence.json`。

## 獨立審查

fresh-context 審查發現 1 項 P2：K 線待更新可能涵蓋舊資料或完全缺資料，不能僅藏在明細。已補可見提示與測試並經獨立複查，無未解決問題；詳見同目錄 `2026-10-17-home-review-status-ux-review.md`。
