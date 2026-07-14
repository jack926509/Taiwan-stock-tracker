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
  const [page, card, sortable] = await Promise.all([
    read("app/page.tsx"),
    read("components/QuoteCard.tsx"),
    read("components/SortableCard.tsx"),
  ]);

  assert.match(card, /報價/);
  assert.match(card, /成交/);
  assert.match(card, /hidden sm:block/);
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
