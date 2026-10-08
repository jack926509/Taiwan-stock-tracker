import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("提醒頁不自動請求需要後端私密憑證的詳細健康檢查", async () => {
  const source = await readFile(new URL("../app/alerts/page.tsx", import.meta.url), "utf8");
  assert.equal(/\/api\/health\?detail=1/.test(source), false, "前端不可自動請求詳細健康檢查");
  assert.equal(/VERIFY_HEALTH_DETAIL_TOKEN|HEALTH_DETAIL_TOKEN|Bearer/.test(source), false, "前端不可存取後端健康檢查私密憑證");
});
