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

| # | 問題 | 處理 |
|---|---|---|
| 13 | Login 無 label、無 `aria-invalid`/`aria-describedby`、標題非襯線、無品牌徽章 | ✅ 全部補上 |
| 14 | `muted` 色大量用於 10–11px 小字,對比在 WCAG AA 邊緣 | ✅ 第二波:`muted` 加深為 `#6F6553`(5.6/5.1:1)、`warn` 加深為 `#9A5B0E`(tint 底 4.6:1) |
| 15 | K 線 MA 切換 chip 僅 28px、缺 focus-visible | ✅ 第二波:行動版 44px、補 focus-visible 與 aria-pressed |
| 16 | 卡片只顯示 1 個技術訊號(後端算出最多 6 個) | ✅ 第二波:顯示 2 個 + 「+N」聚合 |

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

## 4. 第二波實作摘要(本次)

原 roadmap 除深色模式(使用者決定不做)外全數完成:

1. **站內收盤總覽**:`lib/summaryData.ts` 復用 `daily-summary.ts` 匯出的彙整函式(週累計、今日新訊號、觸發計數),`/api/summary` 帶 10 分鐘記憶體快取,首頁休市時段顯示 `ClosingSummary` 面板(漲跌家數、指數、各股當日/週幅、新技術訊號、最強最弱、提醒觸發數)
2. **卡片多訊號**:`QuoteCard` 顯示 2 個訊號 + 「+N」聚合 chip
3. **離線後備**:`public/offline.html`(品牌風格獨立頁)+ SW 只攔頁面導覽、網路失敗才回離線頁;**仍然零快取 API 與頁面**
4. **對比稽核**:`muted` `#7D7361`→`#6F6553`、`warn` `#C97A1B`→`#9A5B0E`,以 WCAG 相對亮度公式驗算,雙底色皆過 AA(4.5:1+)
5. **共用輪詢 hook**:`hooks/usePollGuard.ts` 取代三頁各自複製的停盤守衛(~25 行 ×3)
6. **圖示統一**:`components/icons.tsx` 統一 SVG 線條圖示,取代 `←`/`↻`/`⌄`/`✕`/`✓` 文字符號與功能性 emoji(📊、⚠️、🔍);空狀態的裝飾性 emoji 保留
7. **K 線 chip**:MA/布林切換行動版 44px、補 focus-visible 與 `aria-pressed`;日/週/月與區間切換同步補齊
8. **BottomSheet 關閉鍵**:28px → 44px

## 5. Roadmap(後續)

- **深色模式**:使用者已決定不做。現存 `dark:text-app` class 在 OS 深色下僅微調按鈕前景,無害,保留不動。
- **離線 App Shell**:目前僅離線後備頁;若日後需要完整離線瀏覽,再評估靜態資源快取(仍不得快取 `/api/*`)。

## 6. 驗收

- `npm run build` 綠燈
- `npm test` 96 項全數通過(含新增 `tests/stock-search.test.mjs` 與更新後的原始碼斷言)
- `npm run smoke`(需可達 mis.twse.com.tw 的網路節點)
- 手動走查:搜尋「台積」出現建議清單 → 點選進個股頁;手動更新出現 toast;375px 視窗首頁可直接加自選;只設爆量提醒的股票會計入底部導覽徽章
