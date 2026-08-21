# LINE 到價提醒精簡 Flex 卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將四種 LINE 到價提醒改為使用使用者確認的精簡 Flex 卡片，同時保留既有觸發與成功後標記語意。

**Architecture:** 建立無 I/O 的 `lib/alertFlex.ts`，集中把提醒資料轉為 LINE Flex 訊息與可讀的 `altText`。`lib/alerts.ts` 繼續負責行情、觸發判斷與成功後寫入，只改為把 Flex 訊息交給既有 `pushLineMessages()`。

**Tech Stack:** TypeScript、Next.js、LINE Messaging API Flex Message、Node.js test runner。

**Spec:** `docs/superpowers/specs/2026-08-21-line-alert-flex-card-design.md`

## Global Constraints

- 四種提醒均採 B 方案的精簡卡片；每日收盤總結維持不變。
- 不讀取或輸出任何 secret；不改 Cloudflare Worker Secrets、正式資料或部署設定。
- LINE 成功後才呼叫 `markAlertHit()` 的現有語意不得改變。
- 每個 Flex 訊息必須提供 400 字以內的 `altText` 和個股頁 URI。

---

### Task 1: 建立可測試的到價 Flex 卡片組裝器

**Files:**
- Create: `lib/alertFlex.ts`
- Test: `tests/alert-flex.test.mjs`

**Interfaces:**
- Produces: `buildAlertFlex(input: AlertFlexInput): LineMessage`，其中 `kind` 為 `high | low | change | volume`。
- Consumes: `LineMessage` 型別，輸出僅含 LINE Flex payload，無網路、資料庫或環境變數存取。

- [ ] **Step 1: 寫入會失敗的測試**

```js
import { buildAlertFlex } from "../lib/alertFlex.ts";

test("跌破提醒產生精簡綠色 Flex 卡片與個股連結", () => {
  const message = buildAlertFlex({
    kind: "low", stockId: "0050", name: "元大台灣 50", price: 102.9,
    changePct: -0.0191, threshold: 103, time: "09:00",
    open: 103.05, high: 103.05, low: 102.75, baseUrl: "https://twstock.xiehnet.com",
  });
  assert.equal(message.type, "flex");
  assert.match(message.altText, /元大台灣 50 0050 跌破 103/);
  assert.equal(message.contents.header.backgroundColor, "#4E7A3A");
  assert.equal(message.contents.footer.contents[0].action.uri, "https://twstock.xiehnet.com/stock/0050");
});
```

- [ ] **Step 2: 執行測試並確認失敗**

Run: `node --test --experimental-transform-types tests/alert-flex.test.mjs`

Expected: FAIL，因 `lib/alertFlex.ts` 尚不存在。

- [ ] **Step 3: 實作最小組裝器**

```ts
export function buildAlertFlex(input: AlertFlexInput): LineMessage {
  const tone = input.kind === "high" || (input.kind === "change" && (input.changePct ?? 0) >= 0)
    ? { header: "#C4362B", text: "#C4362B" }
    : input.kind === "volume"
      ? { header: "#6B5E54", text: "#2B2420" }
      : { header: "#4E7A3A", text: "#4E7A3A" };
  return {
    type: "flex",
    altText: buildAlertAltText(input),
    contents: {
      type: "bubble",
      header: alertHeader(input, tone),
      body: alertBody(input, tone),
      footer: alertFooter(input),
    },
  };
}
```

- [ ] **Step 4: 擴充四種提醒的結果測試並確認通過**

Run: `node --test --experimental-transform-types tests/alert-flex.test.mjs`

Expected: PASS；測試驗證漲破、跌破、漲跌幅與爆量各自的標題、觸發原因、色彩和個股連結。

- [ ] **Step 5: 提交組裝器與測試**

```bash
git add lib/alertFlex.ts tests/alert-flex.test.mjs
git commit -m "feat: 將到價提醒改為精簡 LINE Flex 卡片"
```

### Task 2: 將通知發送端接到 Flex 卡片

**Files:**
- Modify: `lib/alerts.ts:1-160`
- Test: `tests/alert-flex.test.mjs`

**Interfaces:**
- Consumes: `buildAlertFlex(input)` 和 `pushLineMessages(messages)`。
- Produces: 每一個 `AlertDecision` 都會發送單一 Flex 訊息；只有 `pushLineMessages()` 回傳 `true` 才標記提醒命中。

- [ ] **Step 1: 寫入靜態整合測試**

```js
const alerts = readFileSync("lib/alerts.ts", "utf8");
assert.match(alerts, /import \{ pushLineMessages \} from "@\/lib\/notify"/);
assert.match(alerts, /buildAlertFlex\(/);
assert.doesNotMatch(alerts, /pushLine\(message\)/);
```

- [ ] **Step 2: 執行整合測試並確認失敗**

Run: `node --test --experimental-transform-types tests/alert-flex.test.mjs`

Expected: FAIL，因現有程式仍以 `pushLine()` 發送純文字。

- [ ] **Step 3: 以最小改動接線**

```ts
const message = buildAlertFlex({
  kind: decision.kind,
  stockId: q.stockId,
  name: q.name,
  price: q.price,
  changePct: q.changePct,
  threshold: decision.threshold,
  time,
  open: q.open,
  high: q.high,
  low: q.low,
  volume: q.volume,
  baseUrl: BASE_URL,
});
if (await pushLineMessages([message])) {
  await markAlertHit(row.stock_id, decision.kind, at);
}
```

- [ ] **Step 4: 執行聚焦測試與全套測試**

Run: `npm test`

Expected: PASS，既有提醒判斷測試與新增 Flex 測試均綠燈。

- [ ] **Step 5: 提交接線改動**

```bash
git add lib/alerts.ts tests/alert-flex.test.mjs
git commit -m "fix: 讓四種到價提醒統一發送 Flex 卡片"
```

### Task 3: 完整驗收與交接

**Files:**
- Verify only: `lib/alertFlex.ts`, `lib/alerts.ts`, `tests/alert-flex.test.mjs`

- [ ] **Step 1: 執行專案驗收**

Run: `npm test && npx tsc --noEmit && npm run build && npm run cf:build && npx wrangler deploy --dry-run && git diff --check`

Expected: 全部結束碼為 0；dry-run 不上傳、不部署。

- [ ] **Step 2: 檢查暫存區與工作區**

Run: `git status --short --branch && git log --oneline -3`

Expected: 只有本功能的文件、測試與程式提交；保留既有 `.playwright-mcp/` 與 `.superpowers/` 未追蹤內容。

- [ ] **Step 3: 交付不對外的驗收結果**

回報四種提醒都使用 Flex 卡片的自動測試結果，並明示未發送測試訊息、未上傳預覽與未部署。
