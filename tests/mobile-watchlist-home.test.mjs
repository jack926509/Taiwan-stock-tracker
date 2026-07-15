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
  assert.match(card, /line-clamp-2/);
  assert.match(card, /whitespace-nowrap/);
  assert.match(card, /signals\.slice\(0, 1\)/);
});

test("首頁迷你走勢明確標示二十日且不使用漲跌色混淆今日行情", async () => {
  const sparkline = await read("components/Sparkline.tsx");

  assert.match(sparkline, /20 日/);
  assert.match(sparkline, /stroke-primary/);
  assert.doesNotMatch(sparkline, /stroke-up|stroke-down/);
});
