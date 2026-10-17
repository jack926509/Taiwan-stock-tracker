# 休市與興櫃行情 Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development 分工實作，整合後以獨立審查驗收；僅提交本地工作分支。

**Goal:** 休市不誤報缺價，興櫃能正確辨識並顯示官方參考行情。

**Architecture:** 日期判斷由 API 提供顯示用交易日；官方興櫃 provider 處理名冊及參考行情；混合來源逐檔標示並維持通知守門。

**Tech Stack:** Next.js、TypeScript、Node test、OpenNext／Cloudflare、Supabase。

**Spec:** `docs/superpowers/specs/2026-10-17-market-quote-coverage-design.md`

## Global Constraints

- 不改正式資料、不發 LINE、不推送或部署；來源與資料日期不得偽造。
- 舊自選股只讀取校正；缺欄位保持 null；既有 MIS 通知規則維持。

## Review Focus

- 09:00 邊界、連假及補行交易日：日期測試覆蓋。
- 指數缺漏、自選股時間錯誤與錯標完整：真實 StatusNotice 渲染測試覆蓋。
- 興櫃名冊中斷或 Yahoo `.TWO`：辨識失敗時不可誤判上櫃，來源測試覆蓋。
- 製表時間、前日均價及股數：parser 測試拒絕不合法日期、價與未來資料，未知欄位不補造。
- 混合來源或既有興櫃提醒：隔離通知測試確認一般 MIS 提醒仍運作，興櫃不觸發。

## Task 1：休市日期與缺漏分類

Files: `lib/market-hours.ts`、`lib/todayFocus.ts`、`components/home/StatusNotice.tsx` 與測試。
Interface: `getExpectedQuoteDate(now?: Date): Promise<string>`；API 回傳 `expectedQuoteDate`。

- [x] 先重現週六 9 檔誤判、缺價與異常混計的失敗測試。
- [x] 實作交易日比較與缺價／時間分類，通過相關測試。

## Task 2：官方興櫃資料

Files: `lib/providers/emergingProvider.ts`、`quoteProvider.ts`、`stockList.ts` 與來源測試。
Interface: `getEmergingStockList()`、`normalizeEmergingMarkets(items)`、`fetchEmergingQuotes(targets)`；既有 `fetchQuotes` 分流及合併。

- [x] 先測官方辨識、舊市場校正、資料 parser、部分失敗及混合來源。
- [x] 實作快取／逾時／失敗重試，保留 MIS 原有冷卻契約，驗證官方實際資料。

## Task 3：API、儲存讀取、顯示與提醒隔離

Files: `lib/types.ts`、`lib/store.ts`、`app/api/quote/route.ts`、`app/api/watchlist/route.ts`、`lib/alerts.ts`、首頁／搜尋／單股／提醒頁與測試。

- [x] 先測 API 預期交易日、讀取不寫回、興櫃提醒不觸發且不阻擋一般 MIS 股票。
- [x] 串接三種市場、逐檔來源與參考時間；拒絕新增／重啟興櫃提醒，允許取消既有條件。
- [x] 保留收盤 LINE 完整 MIS 限制，文件說明興櫃只供參考。

## Task 4：驗收與交付

- [x] `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run cf:build`、`npx wrangler deploy --dry-run`、`git diff --check`。
- [x] 本機 Worker preview 執行 `verify:cloudflare`，正式資料僅讀。
- [x] 桌機及 390 × 844 手機檢查 `/`、`/search`、`/alerts`、`/stock/2330`，另驗 7930、名稱搜尋與來源失敗畫面。
- [x] 獨立審查、修正發現、記錄結果與本地 commit。
