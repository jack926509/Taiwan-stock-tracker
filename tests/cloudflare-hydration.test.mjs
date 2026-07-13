import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("靜態前端首屏不直接讀取目前時間", () => {
  for (const file of ["app/page.tsx", "app/alerts/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /useState\(\(\) => new Date\(\)\)/, file);
    assert.match(source, /useState<Date \| null>\(null\)/, file);
  }
});
