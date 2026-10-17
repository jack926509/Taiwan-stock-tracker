import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const fixture = { data: undefined, error: undefined, validating: false };
globalThis.__personalStatusCard = {
  useState: initial => [initial, () => {}],
  useSWR: () => ({ data: fixture.data, error: fixture.error, isValidating: fixture.validating, mutate() {} }),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      react: "export const useState = globalThis.__personalStatusCard.useState;",
      swr: "export default globalThis.__personalStatusCard.useSWR;",
    };
    if (context.parentURL?.endsWith("/components/PersonalStatusCard.tsx") && stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/components/PersonalStatusCard.tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
const { default: PersonalStatusCard } = await import("../components/PersonalStatusCard.tsx");
function status(overrides = {}) {
  return {
    monitor: { finishedAt: "2026-10-16T05:35:10Z", outcome: "completed", source: "mis", complete: true, rows: [] },
    line: { configured: false, usage: null }, backfill: null, issues: [], ...overrides,
  };
}
function render(data, { error, monitorRows = false, validating = false } = {}) {
  Object.assign(fixture, { data, error, validating });
  return renderToStaticMarkup(createElement(PersonalStatusCard, { monitorRows }));
}
const visible = html => html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");

test("首頁以明確的上次執行時間呈現完成紀錄，不暗示現在持續運作", () => {
  const html = render(status());
  assert.match(visible(html), /上次提醒檢查/);
  assert.match(visible(html), /2026\/10\/16 13:35:10/);
  assert.match(visible(html), /上次已完成/);
  assert.match(visible(html), /僅代表上次執行結果/);
  assert.doesNotMatch(visible(html), /系統正常|持續運作中|目前正常|即時運作/);
  assert.match(html, /<details>/);
  assert.match(html, /MIS 行情/);
  assert.doesNotMatch(visible(html), /MIS 行情/);
  assert.match(visible(html), /aria-label="匯出備份：自選股與提醒設定"/);
  assert.match(visible(html), />匯出備份<\/button>/);
});

test("上次處理失敗、批次不完整和資料讀取問題不藏在展開區", () => {
  const data = status();
  data.monitor.outcome = "failed";
  data.monitor.complete = false;
  data.issues = ["LINE 用量讀取失敗"];
  const output = visible(render(data));
  assert.match(output, /部分處理失敗/);
  assert.match(output, /上次行情批次不完整/);
  assert.match(output, /LINE 用量讀取失敗/);
  assert.doesNotMatch(output, /上次已完成/);
});

test("讀取失敗時明示保留舊資料，尚無資料時不偽造完成紀錄", () => {
  assert.match(visible(render(status(), { error: new Error("offline") })), /狀態讀取失敗，以下保留上次資料/);
  const empty = visible(render(undefined, { error: new Error("offline") }));
  assert.match(empty, /狀態讀取失敗，請稍後重試/);
  assert.doesNotMatch(empty, /上次已完成|尚無紀錄/);
  assert.match(visible(render(undefined)), /讀取狀態中/);
});

test("未知檢查時間、LINE 用量與 K 線紀錄維持未知，不冒充零或完成", () => {
  const data = status();
  data.monitor.finishedAt = "invalid";
  data.monitor.source = null;
  data.monitor.complete = null;
  const html = render(data);
  assert.match(visible(html), /時間未知/);
  assert.match(html, /未取行情/);
  assert.match(html, /完整性未確認/);
  assert.match(html, /通知用量未知/);
  assert.match(html, /K 線補齊[\s\S]*尚無紀錄/);
  assert.doesNotMatch(html, /Invalid Date|今日 0/);
  assert.match(visible(render(status({ monitor: null }))), /尚無檢查紀錄/);
});

test("提醒頁每檔檢查結果直接可讀，不必展開系統明細", () => {
  const data = status();
  data.monitor.rows = [{ stockId: "2330", name: "台積電", status: "行情時間未知、過舊或不屬當日" }];
  const html = render(data, { monitorRows: true });
  assert.match(visible(html), /後端提醒檢查/);
  assert.match(visible(html), /台積電/);
  assert.match(visible(html), /2330/);
  assert.match(visible(html), /行情時間未知、過舊或不屬當日/);
});

test("K 線補齊失敗提示直接可見，舊版未區分待更新的說明保留", () => {
  const html = render(status({ backfill: { ranAt: "2026-10-16T06:00:00Z", ok: 2, fail: 1, pending: null } }));
  assert.match(visible(html), /最近 K 線補齊失敗 1 檔/);
  assert.match(html, /舊版紀錄，未區分待更新/);
});

test("尚有待更新 K 線時在收合狀態明示，不誤稱失敗或來源正常", () => {
  const html = render(status({ backfill: { ranAt: "2026-10-16T06:00:00Z", ok: 3, fail: 0, pending: 2 } }));
  assert.match(visible(html), /最近 K 線仍有 2 檔待更新。/);
  assert.doesNotMatch(visible(html), /K 線補齊失敗|來源正常/);
});
