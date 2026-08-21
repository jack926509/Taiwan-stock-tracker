import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildAlertFlex } from "../lib/alertFlex.ts";

const BASE = {
  stockId: "0050",
  name: "元大台灣 50",
  price: 102.9,
  changePct: -0.0191,
  time: "09:00",
  open: 103.05,
  high: 103.05,
  low: 102.75,
  volume: 23456,
  baseUrl: "https://twstock.xiehnet.com",
};

function bubbleOf(message) {
  assert.equal(message.type, "flex");
  assert.equal(message.contents.type, "bubble");
  return message.contents;
}

test("跌破提醒產生精簡綠色 Flex 卡片與個股連結", () => {
  const message = buildAlertFlex({ ...BASE, kind: "low", threshold: 103 });
  const bubble = bubbleOf(message);

  assert.match(message.altText, /元大台灣 50 0050 跌破設定價 103/);
  assert.equal(bubble.header.backgroundColor, "#4E7A3A");
  assert.equal(bubble.footer.contents[0].action.uri, "https://twstock.xiehnet.com/stock/0050");
  assert.match(JSON.stringify(bubble.body), /跌破設定價 103/);
});

test("到價卡採緊湊間距，避免大面積留白", () => {
  const message = buildAlertFlex({ ...BASE, kind: "low", threshold: 103 });
  const bubble = bubbleOf(message);

  assert.equal(bubble.header.paddingAll, "12px");
  assert.equal(bubble.body.paddingAll, "14px");
  assert.equal(bubble.body.spacing, "xs");
  assert.equal(bubble.footer.paddingAll, "10px");
  assert.equal(bubble.body.contents[0].text, "元大台灣 50　0050");
});

test("漲破提醒以紅色語意呈現觸發門檻", () => {
  const message = buildAlertFlex({ ...BASE, kind: "high", price: 103.1, changePct: 0.012, threshold: 103 });
  const bubble = bubbleOf(message);

  assert.match(message.altText, /元大台灣 50 0050 漲破設定價 103/);
  assert.equal(bubble.header.backgroundColor, "#C4362B");
  assert.match(JSON.stringify(bubble.body), /漲破設定價 103/);
});

test("漲跌幅提醒依實際方向使用語意色並顯示門檻", () => {
  const message = buildAlertFlex({ ...BASE, kind: "change", threshold: 1.5 });
  const bubble = bubbleOf(message);

  assert.match(message.altText, /今日大跌 1.9%.*門檻 1.5%/);
  assert.equal(bubble.header.backgroundColor, "#4E7A3A");
  assert.match(JSON.stringify(bubble.body), /大跌 1.9%（門檻 1.5%）/);
});

test("爆量提醒使用中性色並顯示近五日均量倍數", () => {
  const message = buildAlertFlex({ ...BASE, kind: "volume", threshold: 10000 });
  const bubble = bubbleOf(message);

  assert.match(message.altText, /爆量 2.3 萬張.*近 5 日均量 1.0 萬張 的 2.3 倍/);
  assert.equal(bubble.header.backgroundColor, "#6B5E54");
  assert.match(JSON.stringify(bubble.body), /爆量 2.3 萬張（近 5 日均量 1.0 萬張 的 2.3 倍）/);
});

test("提醒發送端改用 Flex 訊息且保留成功後標記語意", () => {
  const alerts = readFileSync(new URL("../lib/alerts.ts", import.meta.url), "utf8");

  assert.match(alerts, /import \{ pushLineMessages, lineConfigured \} from "@\/lib\/notify"/);
  assert.match(alerts, /buildAlertFlex\(/);
  assert.match(alerts, /if \(await pushLineMessages\(\[message\]\)\) \{\s*await markAlertHit/s);
});
