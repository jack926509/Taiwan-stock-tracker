import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("個股入口使用完整頁面導向，避免靜態殼被當成 RSC 頁面", () => {
  const quoteCard = readFileSync("components/QuoteCard.tsx", "utf8");
  const search = readFileSync("components/StockSearch.tsx", "utf8");
  const alerts = readFileSync("app/alerts/page.tsx", "utf8");
  const stock = readFileSync("app/stock/[id]/page.tsx", "utf8");

  assert.match(quoteCard, /<a\s+href=\{`\/stock\/\$\{quote\.stockId\}`\}/s);
  assert.match(search, /window\.location\.assign\(`\/stock\/\$\{stockId\}`\)/);
  assert.match(alerts, /<a\s+href=\{`\/stock\/\$\{editingRow\.stock_id\}`\}/s);
  assert.equal((stock.match(/<a\s+href=\{`\/stock\/\$\{/gs) ?? []).length, 2);
});
