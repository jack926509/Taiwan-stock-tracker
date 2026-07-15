import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("手機首頁提供搜尋入口、加自選入口、水平工具列與快取時間", async () => {
  const [page, banner] = await Promise.all([
    read("app/page.tsx"),
    read("components/MobileNetworkBanner.tsx"),
  ]);

  assert.match(page, /<StockSearch \/>/);
  // 行動版首頁必須有加自選入口（不能只有桌機 hidden md:block 那一份）
  assert.match(page, /md:hidden">\s*<AddStockForm/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /revalidateOnReconnect:\s*true/);
  assert.match(banner, /asOf/);
});

test("搜尋支援名稱與代號並以無障礙下拉呈現建議", async () => {
  const [search, addForm, hook] = await Promise.all([
    read("components/StockSearch.tsx"),
    read("components/AddStockForm.tsx"),
    read("hooks/useStockSuggestions.ts"),
  ]);

  for (const source of [search, addForm]) {
    assert.match(source, /useStockSuggestions/);
    assert.match(source, /role="listbox"/);
    assert.doesNotMatch(source, /inputMode="numeric"/);
  }
  assert.match(search, /role="combobox"/);
  assert.match(search, /aria-activedescendant/);
  assert.match(hook, /\/api\/search\?q=/);
});

test("自選股卡片與拖曳把手符合手機資訊層級", async () => {
  const [page, card, sortable] = await Promise.all([
    read("app/page.tsx"),
    read("components/QuoteCard.tsx"),
    read("components/SortableCard.tsx"),
  ]);

  assert.match(card, /報價/);
  assert.match(card, /成交/);
  assert.match(card, /signals\.slice\(0, 1\)/);
  assert.match(card, /reorderable/);
  assert.match(card, /hidden md:flex/);
  assert.match(card, /absolute right-2 top-2/);
  assert.doesNotMatch(card, /-(?:right|top)-\d/);
  assert.match(sortable, /h-11 w-11/);
  assert.match(sortable, /absolute left-2 top-2/);
  assert.doesNotMatch(sortable, /-(?:left|top)-\d/);
  assert.doesNotMatch(sortable, /\s\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(sortable, /md:\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(page, /reorderable=\{canSort\}/);
});

test("手機大盤指數卡片可以縮入各半寬且將漲跌資訊分行", async () => {
  const indexCard = await read("components/IndexCard.tsx");

  assert.match(indexCard, /min-w-0/);
  assert.match(indexCard, /flex-col[^"]*sm:flex-row/);
});

test("桌面自選股採三欄平衡卡片且不再壓縮名稱與狀態", async () => {
  const [page, grid, card] = await Promise.all([
    read("app/page.tsx"),
    read("components/DraggableGrid.tsx"),
    read("components/QuoteCard.tsx"),
  ]);

  for (const source of [page, grid]) {
    assert.match(source, /lg:grid-cols-3/);
    assert.doesNotMatch(source, /xl:grid-cols-4/);
  }
  assert.doesNotMatch(card, /line-clamp-2/);
  assert.match(card, /break-words/);
  assert.match(card, /whitespace-nowrap/);
  assert.match(card, /signals\.slice\(0, 1\)/);
});

test("首頁迷你走勢明確標示二十日且不使用漲跌色混淆今日行情", async () => {
  const sparkline = await read("components/Sparkline.tsx");

  assert.match(sparkline, /20 日/);
  assert.match(sparkline, /stroke-primary/);
  assert.doesNotMatch(sparkline, /stroke-up|stroke-down/);
});

test("首頁工具列清楚區分排序與篩選且頂部操作尺寸一致", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, />排序</);
  assert.match(page, />篩選</);
  assert.match(page, /href="\/alerts"[\s\S]*hidden h-11 w-11/);
  assert.match(page, /aria-label="立即更新"[\s\S]*focus-visible:ring-primary/);
});

test("大盤資訊集中排列且保留小字警告語意", async () => {
  const [indexCard, card] = await Promise.all([
    read("components/IndexCard.tsx"),
    read("components/QuoteCard.tsx"),
  ]);

  assert.match(indexCard, /sm:justify-center/);
  assert.match(card, /text-warn/);
});

test("桌面刪除與手機左滑共用確認流程且提供操作狀態", async () => {
  const [page, swipe, dialog, toast] = await Promise.all([
    read("app/page.tsx"),
    read("components/SwipeToDelete.tsx"),
    read("components/DeleteStockDialog.tsx"),
    read("components/Toast.tsx"),
  ]);

  assert.match(page, /<DeleteStockDialog/);
  // 視覺回饋改由 Toast 承擔；Toast 容器本身是 aria-live 區域（讀屏＋明眼共用同一份訊息）
  assert.match(page, /toast\.show/);
  assert.match(toast, /aria-live="polite"/);
  assert.match(toast, /role="status"/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /確定刪除/);
  assert.doesNotMatch(swipe, /setDx\(-window\.innerWidth\)/);
});

test("破壞性操作使用 danger 色而非漲色紅", async () => {
  const [swipe, dialog, config] = await Promise.all([
    read("components/SwipeToDelete.tsx"),
    read("components/DeleteStockDialog.tsx"),
    read("tailwind.config.ts"),
  ]);

  assert.match(config, /danger:/);
  assert.match(swipe, /bg-danger/);
  assert.doesNotMatch(swipe, /bg-up/);
  assert.match(dialog, /bg-danger/);
  assert.doesNotMatch(dialog, /bg-up/);
});

test("刪除成功不會因後續重新整理失敗而誤報且忙碌時焦點留在對話框", async () => {
  const [page, dialog] = await Promise.all([
    read("app/page.tsx"),
    read("components/DeleteStockDialog.tsx"),
  ]);

  assert.match(page, /setPendingDelete\(null\);[\s\S]*toast\.show\(`已刪除/);
  assert.match(page, /void refreshAll\(\)\.catch/);
  assert.match(dialog, /tabIndex=\{-1\}/);
  assert.match(dialog, /if \(open && busy\)[\s\S]*dialogRef\.current\?\.focus/);
  assert.match(dialog, /if \(!buttons \|\| buttons\.length === 0\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*dialogRef\.current\?\.focus\(\)/);
  assert.match(dialog, /\}, \[open\]\);/);
});

test("首頁深色模式的彩色底互動元件使用深色前景", async () => {
  // StockSearch 改版後不再有彩色底按鈕，故不在此清單
  const files = await Promise.all([
    read("app/page.tsx"),
    read("components/QuoteCard.tsx"),
    read("components/DeleteStockDialog.tsx"),
    read("components/AddStockForm.tsx"),
    read("components/SwipeToDelete.tsx"),
  ]);

  for (const source of files) {
    assert.match(source, /dark:text-app/);
  }
});

test("首頁主要互動不使用 transition-all", async () => {
  const files = await Promise.all([
    read("components/QuoteCard.tsx"),
    read("components/SortableCard.tsx"),
    read("components/SwipeToDelete.tsx"),
  ]);

  for (const source of files) {
    assert.doesNotMatch(source, /transition-all/);
  }
});
