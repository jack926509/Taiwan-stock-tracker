import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Task 7（首頁重構：表格補完版型）把 app/page.tsx 拆成資料層 lib/useHomeDashboard.ts
// ＋ components/home/* 六個組裝元件；本檔原本大量斷言 app/page.tsx 的舊 DOM／舊卡片格線，
// 隨拆分同步把讀取目標換成新檔案，行為斷言本身不刪不弱（見各 test 上方註記）。
const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("首頁提供搜尋入口、可換行的排序篩選工具列與離線快取時間", async () => {
  const [page, toolbar, dashboard, banner] = await Promise.all([
    read("app/page.tsx"),
    read("components/home/WatchlistToolbar.tsx"),
    read("lib/useHomeDashboard.ts"),
    read("components/MobileNetworkBanner.tsx"),
  ]);

  assert.match(page, /<StockSearch/);
  // 舊版手機工具列用橫向捲動（overflow-x-auto）；視覺規範 2026-07-18-visual-spec-final.html
  // 的 .toolbar 改用可換行（flex-wrap），排序/篩選晶片在窄螢幕自動換行，不再橫向捲動。
  assert.match(toolbar, /flex-wrap/);
  assert.match(dashboard, /revalidateOnReconnect:\s*true/);
  assert.match(banner, /asOf/);
});

test("自選股卡片與拖曳把手符合手機資訊層級", async () => {
  // Task 7 把 components/QuoteCard.tsx／components/SortableCard.tsx（孤兒檔，已刪除）
  // 的職責併入 components/home/QuoteBoard.tsx（列/卡片內容）與
  // components/home/SortableQuoteRows.tsx（拖曳把手）；斷言改讀新檔，強度不降低
  // （44px 觸控目標 h-11 w-11 為 review 修復重點，務必對 live 檔案生效）。
  const [page, card, sortable] = await Promise.all([
    read("app/page.tsx"),
    read("components/home/QuoteBoard.tsx"),
    read("components/home/SortableQuoteRows.tsx"),
  ]);

  assert.match(card, /報價/);
  assert.match(card, /成交/);
  // 舊版手機卡片訊號上限 1 個（signals.slice(0, 1)）；新版表格列改用合併徽章
  // （漲跌停 + 訊號）並保留手機資訊層級上限，上限改為 3（badges.slice(0, 3)）。
  assert.match(card, /badges\s*\.slice\(0, 3\)/);
  assert.match(card, /reorderable/);
  // 桌面刪除鈕手機隱藏、桌面 flex 顯示（md:flex ... max-[599px]:hidden）
  assert.match(card, /md:flex max-\[599px\]:hidden/);
  assert.match(card, /absolute right-2 top-1\/2/);
  assert.doesNotMatch(card, /-(?:right|top)-\d/);
  assert.match(sortable, /h-11 w-11/);
  assert.match(sortable, /absolute left-0\.5 top-1\/2/);
  assert.doesNotMatch(sortable, /-(?:left|top)-\d/);
  assert.doesNotMatch(sortable, /\s\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(sortable, /md:\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(page, /reorderable=\{canSort\}/);
});

test("大盤指數卡在左欄堆疊，600–999px 併排兩欄、其餘斷點單欄", async () => {
  // 舊版「手機兩顆各半寬」是首頁頂欄橫條帶的版型；視覺規範把指數卡搬進左欄（IndexRail），
  // 改成直式卡片：<600px／≥1000px 單欄堆疊，600–999px 兩欄併排（同一套「可依斷點縮放」訴求）。
  const indexCard = await read("components/IndexCard.tsx");
  assert.match(indexCard, /min-w-0/);
  assert.match(indexCard, /min-\[600px\]:grid-cols-2/);
  assert.match(indexCard, /min-\[1000px\]:grid-cols-1/);
});

test("桌面自選股改為表格版型，7 欄格線照抄視覺規範且訊號可換行不裁切", async () => {
  // 舊版桌面是 3 欄卡片格線（lg:grid-cols-3）；Task 7 換成視覺規範的表格（.thead/.row 7 欄），
  // 這裡改驗證新格線與「名稱/訊號不被壓縮裁切」兩件事的新載體。
  const board = await read("components/home/QuoteBoard.tsx");
  assert.match(
    board,
    /minmax\(150px,1\.1fr\)_90px_120px_minmax\(196px,1\.5fr\)_86px_104px_92px/
  );
  assert.doesNotMatch(board, /line-clamp/);
  assert.match(board, /flex-wrap/);
});

test("首頁迷你走勢明確標示二十日且不使用漲跌色混淆今日行情", async () => {
  const sparkline = await read("components/Sparkline.tsx");

  assert.match(sparkline, /20 日/);
  assert.match(sparkline, /stroke-primary/);
  assert.doesNotMatch(sparkline, /stroke-up|stroke-down/);
});

test("首頁工具列清楚區分排序與篩選且頂部操作尺寸一致", async () => {
  const [toolbar, topbar] = await Promise.all([
    read("components/home/WatchlistToolbar.tsx"),
    read("components/home/TopBar.tsx"),
  ]);

  assert.match(toolbar, />排序</);
  assert.match(toolbar, />篩選</);
  assert.match(topbar, /href="\/alerts"[\s\S]*hidden h-11 w-11/);
  assert.match(topbar, /aria-label="立即更新"[\s\S]*focus-visible:ring-primary/);
});

test("大盤指數卡名稱與市場代碼清楚分列且保留小字警告語意", async () => {
  const [indexCard, board] = await Promise.all([
    read("components/IndexCard.tsx"),
    read("components/home/QuoteBoard.tsx"),
  ]);

  assert.match(indexCard, /justify-between/);
  assert.match(board, /text-warn/);
});

test("桌面刪除與手機左滑共用確認流程且提供操作狀態", async () => {
  const [page, swipe, dialog] = await Promise.all([
    read("app/page.tsx"),
    read("components/SwipeToDelete.tsx"),
    read("components/DeleteStockDialog.tsx"),
  ]);

  assert.match(page, /<DeleteStockDialog/);
  assert.match(page, /aria-live="polite"/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /確定刪除/);
  assert.doesNotMatch(swipe, /setDx\(-window\.innerWidth\)/);
});

test("刪除成功不會因後續重新整理失敗而誤報且忙碌時焦點留在對話框", async () => {
  // confirmDelete/refreshAll 邏輯已搬進資料層 lib/useHomeDashboard.ts（app/page.tsx 只組裝 JSX）
  const [dashboard, dialog] = await Promise.all([
    read("lib/useHomeDashboard.ts"),
    read("components/DeleteStockDialog.tsx"),
  ]);

  assert.match(dashboard, /setPendingDelete\(null\);[\s\S]*setLiveMessage\(`已刪除/);
  assert.match(dashboard, /void refreshAll\(\)\.catch/);
  assert.match(dialog, /tabIndex=\{-1\}/);
  assert.match(dialog, /if \(open && busy\)[\s\S]*dialogRef\.current\?\.focus/);
  assert.match(
    dialog,
    /if \(!buttons \|\| buttons\.length === 0\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*dialogRef\.current\?\.focus\(\)/
  );
  assert.match(dialog, /\}, \[open\]\);/);
});

test("首頁深色模式的彩色底互動元件使用深色前景", async () => {
  // app/page.tsx 本身不再直接持有任何彩色底互動元件（都搬進 components/home/*）；
  // 檢查目標換成實際持有這些元件的新檔案，範圍不縮小（新增 TopBar/WatchlistToolbar/QuoteBoard）。
  const files = await Promise.all([
    read("components/home/TopBar.tsx"),
    read("components/home/WatchlistToolbar.tsx"),
    read("components/home/QuoteBoard.tsx"),
    read("components/DeleteStockDialog.tsx"),
    read("components/AddStockForm.tsx"),
    read("components/StockSearch.tsx"),
    read("components/SwipeToDelete.tsx"),
  ]);

  for (const source of files) {
    assert.match(source, /dark:text-app/);
  }
});

test("首頁主要互動不使用 transition-all", async () => {
  // components/QuoteCard.tsx／components/SortableCard.tsx 已刪除（孤兒檔，Task 7 後零引用）；
  // 其職責已併入下方 components/home/QuoteBoard.tsx／SortableQuoteRows.tsx，範圍不縮小。
  const files = await Promise.all([
    read("components/SwipeToDelete.tsx"),
    read("components/home/QuoteBoard.tsx"),
    read("components/home/SortableQuoteRows.tsx"),
    read("components/home/TopBar.tsx"),
    read("components/home/WatchlistToolbar.tsx"),
  ]);

  for (const source of files) {
    assert.doesNotMatch(source, /transition-all/);
  }
});
