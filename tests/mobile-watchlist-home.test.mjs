import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("手機首頁提供搜尋入口、水平工具列與快取時間", async () => {
  const [page, banner] = await Promise.all([
    read("app/page.tsx"),
    read("components/MobileNetworkBanner.tsx"),
  ]);

  assert.match(page, /md:hidden[\s\S]*<StockSearch/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /revalidateOnReconnect:\s*true/);
  assert.match(banner, /asOf/);
});

test("自選股卡片與拖曳把手符合手機資訊層級", async () => {
  const [card, sortable] = await Promise.all([
    read("components/QuoteCard.tsx"),
    read("components/SortableCard.tsx"),
  ]);

  assert.match(card, /報價/);
  assert.match(card, /成交/);
  assert.match(card, /signals\.slice\(0, 1\)/);
  assert.match(sortable, /h-11 w-11/);
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

test("大盤資訊集中排列且小字警告色符合高對比設計", async () => {
  const [indexCard, globals] = await Promise.all([
    read("components/IndexCard.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(indexCard, /sm:justify-center/);
  assert.match(globals, /--c-warn:\s*151 82 0/);
  assert.match(globals, /--c-muted:\s*103 96 84/);
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
  const [page, dialog] = await Promise.all([
    read("app/page.tsx"),
    read("components/DeleteStockDialog.tsx"),
  ]);

  assert.match(page, /setPendingDelete\(null\);[\s\S]*setLiveMessage\(`已刪除/);
  assert.match(page, /void refreshAll\(\)\.catch/);
  assert.match(dialog, /tabIndex=\{-1\}/);
  assert.match(dialog, /if \(open && busy\)[\s\S]*dialogRef\.current\?\.focus/);
  assert.match(dialog, /\}, \[open\]\);/);
});

test("首頁深色模式的彩色底互動元件使用深色前景", async () => {
  const files = await Promise.all([
    read("app/page.tsx"),
    read("components/QuoteCard.tsx"),
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
  const files = await Promise.all([
    read("components/QuoteCard.tsx"),
    read("components/SortableCard.tsx"),
    read("components/SwipeToDelete.tsx"),
  ]);

  for (const source of files) {
    assert.doesNotMatch(source, /transition-all/);
  }
});
