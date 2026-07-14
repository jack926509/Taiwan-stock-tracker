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
  assert.match(card, /hidden sm:block/);
  assert.match(sortable, /h-11 w-11/);
});
