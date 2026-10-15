import test from "node:test";
import assert from "node:assert/strict";
import { alertMonitorLabel } from "../lib/alertMonitor.ts";
test("沒有後端紀錄不由目前前端行情猜測監控，規則版本改變後需等待新檢查",()=>{
  assert.match(alertMonitorLabel(undefined,{}),/尚無/);
  const row={status:"checked",captured:0,versions:{high:"old"}};
  assert.match(alertMonitorLabel(row,{high:"new"}),/設定已更新/);
  assert.match(alertMonitorLabel(row,{high:"old"}),/已檢查/);
});
