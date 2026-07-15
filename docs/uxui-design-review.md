# UX/UI 設計檢視報告 — 台股追蹤

> 2026-07 全站設計檢視:盤點現況設計系統、依嚴重度列出發現、定義「更親近使用者」的第一波改造範圍與後續 roadmap。

## 1. 設計系統現況(「晨間財經誌」)

整體視覺語言完整且有個性:暖紙底色、扁平雜誌式排版、襯線標題、等寬表格數字、單一靛藍點綴、台股慣例紅漲綠跌。

### 色彩 token(`tailwind.config.ts`)

| Token | 色值 | 用途 |
|---|---|---|
| `app` | `#F7F2E7` | 暖白紙感底 |
| `surface` | `#FFFDF7` | 卡片底 |
| `line` | `#DDD3BF` | 分隔線 |
| `ink` | `#211D16` | 主文字 |
| `muted` | `#7D7361` | 次要文字 |
| `primary` | `#1A3A63` | 單一靛藍點綴 |
| `up` | `#C01926` | 漲(紅);`strong` 為 ≥3% 加深階 |
| `down` | `#0A7A45` | 跌(綠);`strong` 同上 |
| `warn` | `#C97A1B` | 警示橘 |
| `danger` | `#8B1E12` | **本次新增**:破壞性操作專用深磚紅 |

### 字體與動效

- 三族字體:PingFang TC 內文/Songti TC 襯線標題/等寬數字 + `.tabular`(價格跳動不位移)
- 動效:價格閃色、卡片進場、呼吸燈、面板彈出;全部尊重 `prefers-reduced-motion`
- 圓角刻意銳利(card 4px),陰影近乎扁平,靠實色分隔線分界

### 既有優點(檢視時確認,毋須重做)

- 紅漲綠跌全站一致(`lib/format.ts` 統一出口),漲跌停有特殊 ring 標記
- 觸控目標大致守 44px(`h-11`/`min-h-11`/`min-h-[3.5rem]`)
- `DeleteStockDialog` 具完整 focus trap(Tab 循環、Esc、焦點還原、捲動鎖定)
- aria 標籤覆蓋廣:`aria-pressed`(排序/篩選)、`aria-current`(導覽)、`role="switch"`(爆量開關)、`role="img"`(走勢圖)
- 颱風/停盤自動暫停輪詢、`sr-only` 即時區域、safe-area 內距

## 2. 發現清單(依嚴重度)

### 🔴 功能缺口

| # | 問題 | 位置 | 第一波處理 |
|---|---|---|---|
| 1 | 搜尋只吃代號,無法輸入「台積電」 | `StockSearch`/`AddStockForm` 限 `/^[0-9A-Z]{4,6}$/` | ✅ 名稱搜尋(`/api/search` + FinMind 全市場清單) |
| 2 | 操作回饋只有 sr-only,明眼使用者看不到 | `app/page.tsx` aria-live 區域 | ✅ Toast 系統(容器即 aria-live) |
| 3 | Service Worker 從未註冊:元件未掛載、`public/sw.js` 不存在、middleware 攔截 | `PWAServiceWorker.tsx`/`middleware.ts` | ✅ 零快取極簡 SW + 公開路徑 + 掛載 |
| 4 | 提醒徽章/篩選漏算漲跌幅與爆量 | `BottomNav.tsx`、首頁 `alertedIds`、個股頁鈴鐺 | ✅ `hasAnyAlert()` 四種提醒統一判斷 |

### 🟠 流程與導覽

| # | 問題 | 第一波處理 |
|---|---|---|
| 5 | 手機首頁無法加自選(`AddStockForm` 桌機限定),空狀態文案卻叫人「輸入代號加入」 | ✅ 行動版首頁加入 AddStockForm |
| 6 | 桌機無全域導覽,搜尋頁入口難尋 | ✅ 首頁 header 加搜尋 icon;搜尋頁返回鍵桌機也顯示 |
| 7 | 排序/篩選啟用時拖曳靜默失效 | ✅ 顯示「拖曳排序暫停」提示 |
| 8 | 左滑刪除是無提示的隱藏手勢 | ✅ 行動版提示文案併入「向左滑卡片可刪除」 |

### 🟡 語意與一致性

| # | 問題 | 第一波處理 |
|---|---|---|
| 9 | 破壞性操作(左滑刪除、確認刪除鍵)用漲色紅 `bg-up`,「刪除=上漲」語意衝突 | ✅ 新增 `danger` 深磚紅並替換 |
| 10 | 三套彈窗三種標準:DeleteStockDialog(完整)/BottomSheet(無 trap)/鈴鐺 popover(無 role) | ✅ `useDialogFocus` hook 通用化,套用後兩者 |
| 11 | Login 頁錯誤訊息用 `text-up`(漲色) | ✅ 改 `text-warn` |
| 12 | 圖示媒材混用(SVG/文字符號/emoji) | 部分:搜尋 🔍 改 SVG;其餘列 roadmap |

### 🟢 可及性細節

| # | 問題 | 第一波處理 |
|---|---|---|
| 13 | Login 無 label、無 `aria-invalid`/`aria-describedby`、標題非襯線、無品牌徽章 | ✅ 全部補上 |
| 14 | `muted` 色大量用於 10–11px 小字,對比在 WCAG AA 邊緣 | roadmap(對比稽核) |
| 15 | K 線 MA 切換 chip 僅 28px、缺 focus-visible | roadmap |
| 16 | 卡片只顯示 1 個技術訊號(後端算出最多 6 個) | roadmap |

## 3. 第一波實作摘要(本次)

1. **Toast 系統**(`components/Toast.tsx`):`ToastProvider` + `useToast()`,深墨底紙色字、3 秒自動消失、避開底部導覽、`role="status" aria-live="polite"`(取代 sr-only 區域,明眼與讀屏共用同一份訊息)。接線:首頁手動更新/刪除、加自選成功。
2. **名稱搜尋**:
   - `lib/providers/stockList.ts`:FinMind `TaiwanStockInfo` 全市場清單,記憶體快取 24h、in-flight 去重;`searchStockList` 純函式排名(代號完全相符 > 代號前綴 > 名稱開頭 > 名稱包含)
   - `app/api/search/route.ts`:`GET /api/search?q=`;FinMind 掛掉時代號查詢退回 MIS `resolveStock`
   - `hooks/useStockSuggestions.ts`:防抖 300ms 共用 hook
   - `StockSearch` 升級為 combobox(↑↓ 鍵導航、`aria-activedescendant`、上市/上櫃 chip);`AddStockForm` 同步支援名稱
3. **PWA 修復**:`public/sw.js`(零快取設計——即時報價 app 吃到舊快取比離線更糟)、middleware 公開 `/sw.js`、layout 掛載 `PWAServiceWorker`
4. **提醒計數**:`lib/alertBadge.ts` 的 `hasAnyAlert()` 統一四種提醒判斷,套用於底部導覽徽章、首頁篩選、個股頁鈴鐺紅點、提醒總覽排序
5. **行動版加自選**:首頁自選股區塊直接提供 `AddStockForm`
6. **拖曳提示**:排序/篩選中顯示暫停說明;行動版提示併入左滑刪除說明
7. **Login 可及性**:label、`aria-invalid`、`aria-describedby`、`role="alert"`、襯線標題+品牌徽章、錯誤色改 warn
8. **桌機導覽**:首頁 header 搜尋 icon;搜尋頁返回鍵全尺寸顯示
9. **彈窗統一**:`hooks/useDialogFocus.ts`(記焦點、聚焦容器、Tab 循環、還焦)套用於提醒 BottomSheet 與個股頁鈴鐺 popover(補 `role="dialog"`)
10. **danger 色票**:`#8B1E12` 深磚紅,左滑刪除底層與確認刪除鍵改用

## 4. Roadmap(第二波以後)

依價值/成本排序:

1. **真深色模式**:把 token 改為 CSS 變數(`--paper`、`--ink`⋯),`darkMode: "class"` + 手動切換鈕;現存 7 檔散落的 `dark:` class 屬半成品,應一併收斂。`themeColor` 也需隨主題切換。
2. **站內收盤總覽面板**:`lib/daily-summary.ts` 的每日 LINE 總結含大量 app 內看不到的資料——各股週漲跌、今日新增技術訊號、最強/最弱、觸發提醒數、漲跌家數。建議首頁收盤後顯示「今日收盤總覽」卡(複用 `summarySignals.ts` 邏輯)。
3. **卡片多訊號**:`signals.slice(0, 1)` 放寬至 2–3 個,或以「+2」聚合 chip 展開。
4. **離線 shell**:SW 加入 App Shell 快取(僅靜態資源,絕不快取 `/api/*`),`offline.html` 後備頁。
5. **對比稽核**:`muted #7D7361` 於 11px 以下改用 `flat #5F5745` 或放大字級;`warn` 於 tint 底的組合重驗 AA。
6. **共用輪詢 hook**:三頁重複的 stale-guard/visibility 邏輯抽 `usePollGuard()`(維護性,非直接 UX)。
7. **圖示統一**:`←`、`↻`、`⌄`、剩餘 emoji 換成既有 SVG 線條圖示語彙。
8. **K 線 chip 觸控目標**:MA/布林切換提高到 44px 並補 focus-visible。

## 5. 驗收

- `npm run build` 綠燈
- `npm test` 96 項全數通過(含新增 `tests/stock-search.test.mjs` 與更新後的原始碼斷言)
- `npm run smoke`(需可達 mis.twse.com.tw 的網路節點)
- 手動走查:搜尋「台積」出現建議清單 → 點選進個股頁;手動更新出現 toast;375px 視窗首頁可直接加自選;只設爆量提醒的股票會計入底部導覽徽章
