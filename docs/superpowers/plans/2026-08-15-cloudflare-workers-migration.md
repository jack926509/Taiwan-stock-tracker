# Cloudflare Workers 全端遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將台股追蹤網站的頁面、API、排程與 LINE 通知部署到單一 Cloudflare Worker，通過正式驗收後切換 `twstock.xiehnet.com` 並停止 Zeabur。

**Architecture:** 根目錄 Next.js 15 專案由 `@opennextjs/cloudflare` 轉換成 Worker；自訂 Worker 入口重用 OpenNext `fetch` handler 並增加 `scheduled` handler。Supabase 保留為唯一正式資料庫，另以一個新增表與兩個資料庫函式提供排程租約及最後執行狀態。

**Tech Stack:** Next.js 15.5、React 19、TypeScript 5.8、OpenNext for Cloudflare、Cloudflare Workers Paid、Wrangler、Supabase PostgreSQL、Node.js test runner、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-15-cloudflare-workers-migration-design.md`

## Global Constraints

- 正式頁面、API、排程與 LINE 通知必須由同一個 Cloudflare Worker 執行。
- Supabase 是唯一正式資料庫；不得新增 D1、KV 或 R2 作為正式資料來源。
- 不搬移、不修改、不刪除既有 Supabase 正式資料；只新增獨立排程鎖定結構。
- Secrets 不得寫入 Git、Wrangler 明文設定、測試輸出或 logs。
- 預覽驗收未全數通過前，不得切換 `twstock.xiehnet.com` 或停止 Zeabur。
- 正式切換後不重新啟用 Zeabur；失敗時修復或回滾 Cloudflare Worker 版本。
- 本計畫只停止 Zeabur，不永久刪除服務或環境變數。
- 保留既有 `frontend/`；正式切換完成後是否刪除另行決定。
- 每個程式切片遵守 RED → GREEN → REFACTOR，測試及 build 通過後才提交。
- 不納入既有未追蹤目錄 `.playwright-mcp/` 與 `.superpowers/`。

## File Structure

- `cloudflare-worker.ts`：單一 Worker 入口，轉交 HTTP 給 OpenNext，轉交 Cron 給排程分派器。
- `worker-configuration.d.ts`：由 Wrangler 根據 bindings 產生 `CloudflareEnv` 與 Worker runtime 型別。
- `wrangler.jsonc`：Worker、Static Assets、Paid CPU、Cron、環境變數名稱及預覽環境設定。
- `open-next.config.ts`：OpenNext Cloudflare 轉換設定。
- `lib/scheduledJobs.ts`：Cron 字串到業務工作的純分派、交易時段守門與統一執行結果。
- `lib/scheduledJobLock.ts`：透過 Supabase RPC 原子取得及完成排程租約。
- `supabase/migrations/20260815000000_add_scheduled_job_state.sql`：只新增排程狀態表與 claim／finish 函式。
- `tests/cloudflare-config.test.mjs`：OpenNext、Wrangler、Cron 與 secrets 契約。
- `tests/scheduled-jobs.test.mjs`：排程分派、盤中／交易日守門、鎖定與錯誤結果。
- `tests/scheduled-job-migration.test.mjs`：新增 migration 的 RLS、權限、原子租約與非破壞性契約。
- `.github/workflows/cloudflare-worker.yml`：建置、測試、預覽上傳及正式部署。
- `scripts/verify-cloudflare-release.mjs`：實打 Worker 頁面與公開 API 的發行驗證。
- `README.md`、`CLAUDE.md`：更新正式架構、驗收與部署說明。

---

### Task 0: 校正既有 UI 測試與目前核准版面的一致性

**Files:**
- Modify: `tests/mobile-watchlist-home.test.mjs`

**Interfaces:**
- Consumes: `components/home/QuoteBoard.tsx` 的既有手機／桌面 class 契約與 `docs/superpowers/specs/2026-07-18-visual-spec-final.html`。
- Produces: 與目前核准版面一致、可重現的基線測試。

- [ ] **Step 1: 確認三個基線失敗都只是不再適用的字串期望**

Run: `node --test tests/mobile-watchlist-home.test.mjs`

Expected: 只有下列三個測試失敗，且錯誤顯示期望的舊 class 不存在、目前 `QuoteBoard.tsx` 具有新版 class：

- `自選股卡片與拖曳把手符合手機資訊層級`
- `大盤指數卡在左欄堆疊，600–999px 併排兩欄、其餘斷點單欄`
- `桌面自選股改為表格版型，7 欄格線照抄視覺規範且訊號可換行不裁切`

- [ ] **Step 2: 用現行元件與視覺規格更新三條斷言**

只更新 `tests/mobile-watchlist-home.test.mjs` 的 regexp，使它驗證目前元件實際使用的：

```js
assert.match(quoteBoard, /max-\[599px\]:pl-8/);
assert.match(indexRail, /min-\[600px\]:grid-cols-2/);
assert.match(quoteBoard, /grid-cols-\[minmax\(210px,1\.8fr\)_84px_110px_minmax\(126px,0\.9fr\)_120px_36px\]/);
```

不得修改 `components/`、`app/`、CSS 或視覺規格文件；若現行元件和視覺規格矛盾，停止並回報，不得用改測試掩蓋產品缺陷。

- [ ] **Step 3: 驗證校正結果**

Run: `node --test tests/mobile-watchlist-home.test.mjs`

Expected: 全數 PASS。

Run: `npm test`

Expected: 全數 PASS，沒有測試警告。

- [ ] **Step 4: 提交基線測試校正**

```bash
git add tests/mobile-watchlist-home.test.mjs
git commit -m "test: 對齊自選股版面既有視覺契約"
```

---

### Task 1: 建立可重現的 OpenNext Worker build

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `next.config.ts`
- Modify: `.gitignore`
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- Create: `worker-configuration.d.ts`
- Test: `tests/cloudflare-config.test.mjs`

**Interfaces:**
- Consumes: 現有 `npm run build` 與根目錄 Next.js App Router。
- Produces: `npm run cf:build`、`npm run cf:preview`、`npm run cf:upload`、`.open-next/worker.js` 與 `.open-next/assets`。

- [ ] **Step 1: 寫入會失敗的 Cloudflare 設定測試**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("package exposes OpenNext build, preview and upload commands", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["cf:build"], "opennextjs-cloudflare build");
  assert.equal(pkg.scripts["cf:preview"], "opennextjs-cloudflare preview");
  assert.equal(pkg.scripts["cf:upload"], "opennextjs-cloudflare upload");
  assert.equal(pkg.scripts["cf:types"], "wrangler types --env-interface CloudflareEnv");
  assert.ok(pkg.devDependencies["@opennextjs/cloudflare"]);
  assert.ok(pkg.devDependencies.wrangler);
});

test("wrangler serves OpenNext assets without a production custom domain", () => {
  const config = read("wrangler.jsonc");
  assert.match(config, /"main":\s*"\.\/\.open-next\/worker\.js"/);
  assert.match(config, /"directory":\s*"\.open-next\/assets"/);
  assert.doesNotMatch(config, /twstock\.xiehnet\.com/);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/cloudflare-config.test.mjs`

Expected: FAIL，指出缺少 Cloudflare scripts 或 `wrangler.jsonc`。

- [ ] **Step 3: 安裝並鎖定 OpenNext 與 Wrangler**

Run: `npm install --save-dev @opennextjs/cloudflare@latest wrangler@latest`

Expected: `package.json` 與 `package-lock.json` 更新，沒有移除既有 runtime dependencies。

- [ ] **Step 4: 加入最小 OpenNext 設定與 scripts**

`package.json` scripts 加入：

```json
{
  "cf:build": "opennextjs-cloudflare build",
  "cf:preview": "opennextjs-cloudflare preview",
  "cf:upload": "opennextjs-cloudflare upload",
  "cf:types": "wrangler types --env-interface CloudflareEnv"
}
```

`next.config.ts` 在 export 前初始化 Cloudflare 本機開發支援：

```ts
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
```

`open-next.config.ts`：

```ts
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

const config = {} satisfies OpenNextConfig;
export default config;
```

`wrangler.jsonc` 第一版只允許 `workers.dev` 預覽，不設定正式 route：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tw-stock-tracker",
  "main": "./.open-next/worker.js",
  "compatibility_date": "2026-08-15",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "workers_dev": true,
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "tw-stock-tracker"
    }
  ],
  "limits": { "cpu_ms": 300000 },
  "vars": {
    "APP_BASE_URL": "https://twstock.xiehnet.com",
    "CLOUDFLARE_WORKERS": "true"
  }
}
```

`.gitignore` 加入 `.open-next/`、`.wrangler/`、`.dev.vars*`。

- [ ] **Step 5: 執行單項測試確認 GREEN**

Run: `node --test tests/cloudflare-config.test.mjs`

Expected: PASS。

- [ ] **Step 6: 產生 Worker bindings 型別**

Run: `npm run cf:types`

Expected: 產生 `worker-configuration.d.ts`，包含 `interface CloudflareEnv`、`ASSETS` 與 Wrangler vars；檔案不得包含任何 secret 值。

- [ ] **Step 7: 實跑兩種 build**

Run: `npm run build`

Expected: Next.js build 成功。

Run: `npm run cf:build`

Expected: 產生 `.open-next/worker.js` 與 `.open-next/assets`；Wrangler 顯示壓縮後 bundle 小於 10 MiB。

- [ ] **Step 8: 提交 OpenNext build 基礎**

```bash
git add package.json package-lock.json next.config.ts .gitignore open-next.config.ts wrangler.jsonc worker-configuration.d.ts tests/cloudflare-config.test.mjs
git commit -m "chore: 建立 Cloudflare OpenNext 建置基礎"
```

---

### Task 2: 新增 Supabase 原子排程租約

**Files:**
- Create: `supabase/migrations/20260815000000_add_scheduled_job_state.sql`
- Create: `lib/scheduledJobLock.ts`
- Modify: `tests/supabase-migration.test.mjs`
- Test: `tests/scheduled-job-lock.test.mjs`
- Test: `tests/scheduled-job-migration.test.mjs`

**Interfaces:**
- Consumes: `getSupabase(): SupabaseClient | null`。
- Produces: `claimScheduledJob(jobName: ScheduledJobName, runId: string, leaseSeconds: number): Promise<boolean>`、`finishScheduledJob(jobName: ScheduledJobName, runId: string, result: ScheduledJobResult): Promise<void>`。

- [ ] **Step 1: 寫入 migration 契約測試並更新 migration 清單**

```js
test("scheduled job migration is additive and service-role only", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260815000000_add_scheduled_job_state.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /create table if not exists public\.scheduled_job_state/);
  assert.match(sql, /primary key \(job_name\)/);
  assert.match(sql, /alter table public\.scheduled_job_state enable row level security/);
  assert.match(sql, /grant all on table public\.scheduled_job_state to service_role/);
  assert.match(sql, /create or replace function public\.claim_scheduled_job/);
  assert.match(sql, /where public\.scheduled_job_state\.lease_until <= now\(\)/);
  assert.match(sql, /create or replace function public\.finish_scheduled_job/);
  assert.doesNotMatch(sql, /\b(drop|truncate|delete from|alter table public\.(watchlist|daily_kline|news_cache|mis_session))\b/i);
});
```

在 `tests/supabase-migration.test.mjs` 的預期檔名陣列最後加入 `20260815000000_add_scheduled_job_state.sql`，並把 `scheduled_job_state` 加入 backend storage tables。

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/scheduled-job-migration.test.mjs tests/supabase-migration.test.mjs`

Expected: FAIL，指出 migration 尚不存在。

- [ ] **Step 3: 寫入非破壞性 migration**

Migration 必須建立下列欄位：

```sql
create table if not exists public.scheduled_job_state (
  job_name text primary key,
  run_id uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('running', 'ok', 'error')),
  last_detail jsonb not null default '{}'::jsonb
);
```

`claim_scheduled_job` 使用 `insert ... on conflict (job_name) do update ... where lease_until is null or lease_until <= now()`，以 `GET DIAGNOSTICS changed = ROW_COUNT` 回傳是否取得租約。`finish_scheduled_job` 只能更新同一 `run_id`，清除 `lease_until` 並寫入 `ok` 或 `error`。兩個函式都設定 `security definer set search_path = public`，撤銷 `public` 執行權並只授權 `service_role`。

- [ ] **Step 4: 執行 migration 契約測試確認 GREEN**

Run: `node --test tests/scheduled-job-migration.test.mjs tests/supabase-migration.test.mjs`

Expected: PASS。

- [ ] **Step 5: 以依賴注入測試租約 wrapper**

新增測試，fake client 的 `rpc` 依序回傳 `{ data: true, error: null }`，驗證：

```js
assert.equal(await claimScheduledJob("alerts", "00000000-0000-4000-8000-000000000001", 55, fakeDb), true);
assert.deepEqual(calls[0], {
  name: "claim_scheduled_job",
  args: {
    p_job_name: "alerts",
    p_run_id: "00000000-0000-4000-8000-000000000001",
    p_lease_seconds: 55,
  },
});
```

錯誤回應必須拋出不含 Supabase key 的 `Error("排程鎖定失敗：...")`。

- [ ] **Step 6: 實作 `lib/scheduledJobLock.ts`**

```ts
export type ScheduledJobName = "alerts" | "daily-summary" | "backfill" | "keep-alive";
export type ScheduledJobResult = {
  status: "ok" | "error";
  detail: Record<string, string | number | boolean | null>;
};
```

`claimScheduledJob` 與 `finishScheduledJob` 接受可選的 `SupabaseClient` 參數供單元測試；正式呼叫未傳入時使用 `getSupabase()`，沒有 Supabase 就明確拋錯，不走本機 fallback。

- [ ] **Step 7: 執行租約測試與全套測試**

Run: `node --test tests/scheduled-job-lock.test.mjs tests/scheduled-job-migration.test.mjs tests/supabase-migration.test.mjs`

Expected: PASS。

Run: `npm test`

Expected: 全數 PASS。

- [ ] **Step 8: 提交排程租約切片**

```bash
git add supabase/migrations/20260815000000_add_scheduled_job_state.sql lib/scheduledJobLock.ts tests/scheduled-job-lock.test.mjs tests/scheduled-job-migration.test.mjs tests/supabase-migration.test.mjs
git commit -m "feat: 以 Supabase 租約防止排程重複執行"
```

---

### Task 3: 將常駐 node-cron 改成可測試的 Worker 排程分派

**Files:**
- Create: `lib/scheduledJobs.ts`
- Create: `tests/scheduled-jobs.test.mjs`
- Modify: `instrumentation.ts`

**Interfaces:**
- Consumes: `checkAlerts()`、`dailySummary()`、`backfillWatchlist()`、`keepAlive()`、`isMarketOpenNow()`、`isTradingDay()`、`claimScheduledJob()`、`finishScheduledJob()`。
- Produces: `runScheduledCron(cron: string, now?: Date, deps?: ScheduledJobDependencies): Promise<ScheduledJobExecution>`。

- [ ] **Step 1: 寫入 Cron 分派與守門的失敗測試**

```js
test("盤外 alerts cron 不取得鎖也不抓報價", async () => {
  const calls = [];
  const result = await runScheduledCron("* * * * 1-5", NOW, deps({
    isMarketOpenNow: async () => false,
    claim: async () => { calls.push("claim"); return true; },
    checkAlerts: async () => { calls.push("alerts"); return 1; },
  }));
  assert.deepEqual(result, { job: "alerts", status: "skipped", reason: "market-closed" });
  assert.deepEqual(calls, []);
});

test("重複 cron 取不到租約時跳過", async () => {
  const result = await runScheduledCron("35 5 * * 1-5", NOW, deps({
    isTradingDay: async () => true,
    claim: async () => false,
  }));
  assert.deepEqual(result, { job: "daily-summary", status: "skipped", reason: "locked" });
});
```

另測試四個 cron 的正確工作名稱、非交易日 summary、成功 detail、業務函式失敗後呼叫 `finish(..., { status: "error" })` 並重新拋錯。

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/scheduled-jobs.test.mjs`

Expected: FAIL，指出 `lib/scheduledJobs.ts` 不存在。

- [ ] **Step 3: 實作最小排程分派器**

```ts
export type ScheduledJobExecution =
  | { job: ScheduledJobName; status: "ok"; detail: Record<string, string | number | boolean | null> }
  | { job: ScheduledJobName; status: "skipped"; reason: "market-closed" | "non-trading-day" | "locked" };

const CRON_JOB = {
  "* * * * 1-5": "alerts",
  "35 5 * * 1-5": "daily-summary",
  "0 9 * * 1-5": "backfill",
  "30 4 * * 0,6": "keep-alive",
} as const;
```

租約秒數固定為 alerts 55 秒、daily-summary 300 秒、backfill 840 秒、keep-alive 60 秒。錯誤 detail 只保留 `error: error instanceof Error ? error.message.slice(0, 300) : "unknown"`。

- [ ] **Step 4: 停用 Next.js 啟動時的常駐排程**

將 `instrumentation.ts` 改成：

```ts
// 排程由 Cloudflare Worker scheduled handler 執行；Next.js 啟動不再建立常駐 timer。
export async function register() {}
```

保留 `instrumentation-node.ts` 作為遷移歷史，不讓任何 production import 指向它。

- [ ] **Step 5: 執行排程測試與全套測試**

Run: `node --test tests/scheduled-jobs.test.mjs`

Expected: PASS。

Run: `npm test`

Expected: 全數 PASS，既有提醒判斷語意不變。

- [ ] **Step 6: 提交 Worker 排程分派切片**

```bash
git add lib/scheduledJobs.ts tests/scheduled-jobs.test.mjs instrumentation.ts
git commit -m "feat: 將常駐排程改為 Worker Cron 分派"
```

---

### Task 4: 組合單一自訂 Worker 入口

**Files:**
- Create: `cloudflare-worker.ts`
- Modify: `wrangler.jsonc`
- Modify: `tests/cloudflare-config.test.mjs`

**Interfaces:**
- Consumes: `.open-next/worker.js` 的 `handler.fetch`、`runScheduledCron(event.cron, new Date(event.scheduledTime))`。
- Produces: `ExportedHandler<CloudflareEnv>`，同時支援 `fetch` 與 `scheduled`。

- [ ] **Step 1: 擴充設定測試確認自訂入口與四個 Cron**

```js
test("custom worker exposes fetch and scheduled handlers", () => {
  const worker = read("cloudflare-worker.ts");
  assert.match(worker, /fetch:\s*handler\.fetch/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /runScheduledCron\(event\.cron/);
});

test("wrangler config registers the four UTC cron triggers", () => {
  const config = read("wrangler.jsonc");
  for (const cron of ["* * * * 1-5", "35 5 * * 1-5", "0 9 * * 1-5", "30 4 * * 0,6"]) {
    assert.match(config, new RegExp(cron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/cloudflare-config.test.mjs`

Expected: FAIL，指出 `cloudflare-worker.ts` 不存在或 main 尚未切換。

- [ ] **Step 3: 建立自訂 Worker**

```ts
// @ts-ignore OpenNext build 才會產生此模組。
import handler from "./.open-next/worker.js";
import { runScheduledCron } from "./lib/scheduledJobs";

export default {
  fetch: handler.fetch,
  async scheduled(event, _env, ctx) {
    ctx.waitUntil(
      runScheduledCron(event.cron, new Date(event.scheduledTime)).catch((error) => {
        console.error("[scheduled] 執行失敗", error instanceof Error ? error.message : "unknown");
      })
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
```

`wrangler.jsonc` 將 `main` 改為 `./cloudflare-worker.ts`，加入四個 Cron；維持沒有正式 custom domain。

- [ ] **Step 4: 執行測試、typecheck 與 OpenNext build**

Run: `node --test tests/cloudflare-config.test.mjs tests/scheduled-jobs.test.mjs`

Expected: PASS。

Run: `npx tsc --noEmit`

Expected: PASS。

Run: `npm run cf:build`

Expected: 成功產出同時具有 HTTP 與 scheduled handler 的 bundle，壓縮後小於 10 MiB。

- [ ] **Step 5: 提交單一 Worker 入口**

```bash
git add cloudflare-worker.ts wrangler.jsonc tests/cloudflare-config.test.mjs
git commit -m "feat: 在單一 Worker 組合 Next.js 與 Cron"
```

---

### Task 5: 將排程狀態納入健康檢查

**Files:**
- Modify: `lib/status.ts`
- Test: `tests/scheduled-job-status.test.mjs`

**Interfaces:**
- Consumes: Supabase `scheduled_job_state` rows。
- Produces: `BackendStatus.scheduledJobs?: Record<ScheduledJobName, ScheduledJobStatus>`。

- [ ] **Step 1: 寫入狀態轉換的失敗測試**

將資料列轉換抽成純函式：

```js
assert.deepEqual(toScheduledJobStatus({
  job_name: "alerts",
  last_started_at: "2026-08-15T01:00:00.000Z",
  last_finished_at: "2026-08-15T01:00:03.000Z",
  last_status: "ok",
  last_detail: { sent: 1 },
}), ["alerts", {
  lastStartedAt: "2026-08-15T01:00:00.000Z",
  lastFinishedAt: "2026-08-15T01:00:03.000Z",
  status: "ok",
  detail: { sent: 1 },
}]);
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/scheduled-job-status.test.mjs`

Expected: FAIL，指出 `toScheduledJobStatus` 尚未匯出。

- [ ] **Step 3: 實作狀態查詢與轉換**

`getStatus()` 以 Supabase 查詢 `scheduled_job_state` 的安全欄位，不查 `run_id` 或 `lease_until`，組成 `scheduledJobs`。若表尚未套用 migration，詳細健康檢查回 503，禁止誤認排程已可用。

- [ ] **Step 4: 執行健康檢查相關測試**

Run: `node --test tests/scheduled-job-status.test.mjs tests/health-auth.test.mjs`

Expected: PASS。

Run: `npm test`

Expected: 全數 PASS。

- [ ] **Step 5: 提交排程可觀測性**

```bash
git add lib/status.ts tests/scheduled-job-status.test.mjs
git commit -m "feat: 在健康檢查顯示 Worker 排程狀態"
```

---

### Task 6: 建立 Cloudflare 發行驗證與 GitHub workflow

**Files:**
- Create: `scripts/verify-cloudflare-release.mjs`
- Create: `.github/workflows/cloudflare-worker.yml`
- Modify: `package.json`
- Modify: `tests/cloudflare-config.test.mjs`

**Interfaces:**
- Consumes: `VERIFY_BASE_URL`、僅在 shell 注入的 `VERIFY_APP_ACCESS_PASSWORD` 與 `VERIFY_HEALTH_DETAIL_TOKEN`。
- Produces: `npm run verify:cloudflare`；branch 只 build，手動 dispatch 才 upload，`main` 在正式切換核准後才 deploy。

- [ ] **Step 1: 寫入 workflow 與 verifier 契約測試**

```js
test("worker workflow gates deployment behind tests and build", () => {
  const workflow = read(".github/workflows/cloudflare-worker.yml");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run cf:build/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `node --test tests/cloudflare-config.test.mjs`

Expected: FAIL，指出 workflow 或 verifier 不存在。

- [ ] **Step 3: 建立不具破壞性的 CI workflow**

Workflow 的 `validate` job 固定執行 `npm ci`、`npm test`、`npm run build`、`npm run cf:build`。`upload-preview` job 僅在 `workflow_dispatch` 且 validate 成功時執行 `npm run cf:upload`，使用既有 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。初版不得包含 custom domain、Pages 刪除或 Zeabur 操作。

- [ ] **Step 4: 建立公開發行驗證器**

`scripts/verify-cloudflare-release.mjs` 要求 `VERIFY_BASE_URL`、`VERIFY_APP_ACCESS_PASSWORD` 與 `VERIFY_HEALTH_DETAIL_TOKEN`，依序檢查公開頁面、登入、Supabase 自選股、授權詳細健康檢查與靜態資源；每個請求 15 秒 timeout，非 2xx 或不是 Supabase 儲存就結束碼 1。不得讀取或輸出 `.env.local`、密碼、token 或 cookie。

`package.json` 加入：

```json
{
  "verify:cloudflare": "node scripts/verify-cloudflare-release.mjs"
}
```

- [ ] **Step 5: 執行測試與本機 verifier 失敗路徑**

Run: `node --test tests/cloudflare-config.test.mjs`

Expected: PASS。

Run: `VERIFY_BASE_URL=http://127.0.0.1:9 VERIFY_APP_ACCESS_PASSWORD=test VERIFY_HEALTH_DETAIL_TOKEN=test npm run verify:cloudflare`

Expected: FAIL 且錯誤只含 endpoint 與連線結果，不含 secrets。

- [ ] **Step 6: 提交 CI 與發行驗證**

```bash
git add .github/workflows/cloudflare-worker.yml scripts/verify-cloudflare-release.mjs package.json package-lock.json tests/cloudflare-config.test.mjs
git commit -m "ci: 加入 Cloudflare Worker 預覽與發行驗證"
```

---

### Task 7: 更新文件並完成本機驗收

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: Tasks 1–6 的實際 scripts、Cron 與部署流程。
- Produces: 下一位維護者可照做的 Cloudflare Worker 建置、預覽、驗收與正式切換說明。

- [ ] **Step 1: 更新 README 架構與操作命令**

README 必須把架構圖改成「使用者 → Cloudflare Worker → TWSE／FinMind／Supabase／LINE」，列出 `npm run cf:build`、`npm run cf:preview`、`npm run cf:upload`、`npm run verify:cloudflare`，並明說 Supabase 是唯一正式資料庫、Workers filesystem 不能當正式儲存。

- [ ] **Step 2: 更新專案規則與環境變數範本**

`CLAUDE.md` 部署改成 Cloudflare Workers Paid；驗收加入 `npm test`、`npm run build`、`npm run cf:build`、`npm run verify:cloudflare`。`.env.local.example` 修正健康 token 註解並補 `APP_BASE_URL=`，不加入任何真實值。

- [ ] **Step 3: 執行完整自動驗收**

Run: `npm test`

Expected: 全數 PASS。

Run: `npx tsc --noEmit`

Expected: PASS。

Run: `npm run build`

Expected: Next.js build 成功。

Run: `npm run cf:build`

Expected: OpenNext build 成功，bundle 壓縮後小於 10 MiB。

Run: `git diff --check`

Expected: 無輸出。

- [ ] **Step 4: 啟動 workerd 並做瀏覽器驗收**

Run: `npm run cf:preview`

在桌面與 390×844 手機 viewport 檢查 `/`、`/login`、`/search`、`/alerts`、`/stock/2330`；確認沒有白頁、console error、失效資源或無法操作的主要按鈕。再以預覽網址執行 `VERIFY_BASE_URL=<preview-url> VERIFY_APP_ACCESS_PASSWORD=<密碼> VERIFY_HEALTH_DETAIL_TOKEN=<token> npm run verify:cloudflare`，三個值只可由 shell 安全注入。

- [ ] **Step 5: 提交文件與本機驗收切片**

```bash
git add README.md CLAUDE.md .env.local.example
git commit -m "docs: 更新 Cloudflare Worker 維運與驗收流程"
```

---

### Checkpoint A: 程式完成、正式環境未變更

- [ ] 所有 Task 1–7 commits 都在 `codex/cloudflare-workers-migration`。
- [ ] `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run cf:build` 全部成功。
- [ ] workerd 桌面與手機基本渲染驗收成功；缺少 Supabase runtime secrets 或 `scheduled_job_state` 時，不得把完整資料 API 驗收誤報為成功。
- [ ] 由另一個 AI 依 `origin/main..HEAD` 交叉審查 diff 與驗收證據。
- [ ] 使用者核准後，才進行 Supabase migration 與 Cloudflare 預覽部署。

完整 Supabase verifier（登入、`/api/watchlist` 與授權 detailed health）必須在 Task 8 套用 `scheduled_job_state` 後的 Task 9 執行；不得為了提前通過 verifier 而先改動正式資料庫。

---

### Task 8: 備份並套用 Supabase 排程 migration

**Files:**
- No source changes expected。

**Interfaces:**
- Consumes: `20260815000000_add_scheduled_job_state.sql`。
- Produces: 正式 Supabase 的 `scheduled_job_state`、`claim_scheduled_job`、`finish_scheduled_job`。

- [ ] **Step 1: 使用 Supabase 工具讀取專案與 migration 狀態**

確認目標 project ref 與 `NEXT_PUBLIC_SUPABASE_URL` 一致；只列出 schema、migration 與資料表 metadata，不顯示 service role key。

- [ ] **Step 2: 建立可回復備份並取得使用者確認**

備份 `public` schema 與既有資料，記錄備份時間、範圍與還原方式。沒有可驗證備份或使用者未確認時停止，不套 migration。

- [ ] **Step 3: 套用單一 additive migration**

只套用 `20260815000000_add_scheduled_job_state.sql`。不得執行其他待套用 migration，不得 drop、truncate、delete 或改動既有表。

- [ ] **Step 4: 驗證權限與原子租約**

以 transaction 測試同一 `job_name` 的兩次 claim 只有第一次為 true，finish 後可再次 claim；rollback 測試資料。確認 anon／authenticated 無權讀寫或執行 RPC，service_role 可用。

---

### Task 9: 部署 Cloudflare 預覽並完成真實服務驗收

**Files:**
- No source changes expected，除非真實環境揭露可重現缺陷；修正必須回到 TDD 小切片並重新走 Checkpoint A。

**Interfaces:**
- Consumes: Cloudflare API token、Worker Secrets、Tasks 1–8 的 build 與 migration。
- Produces: 未綁定正式網域的 Worker 預覽 URL 與完整驗收證據。

- [ ] **Step 1: 確認 Workers Paid 與部署目標**

讀取 Cloudflare account、Workers plan、現有 Pages project 與自訂網域狀態；確認 Paid 已啟用且目標 worker 名稱不覆蓋其他服務。

- [ ] **Step 2: 設定 Worker runtime secrets**

在 Cloudflare Worker 設定 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`FINMIND_TOKEN`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_TARGET_USER_ID`、`APP_ACCESS_PASSWORD`、`HEALTH_DETAIL_TOKEN`。只確認名稱與已設定狀態，不讀回或輸出值。

- [ ] **Step 3: 上傳預覽版本**

Run: `npm run cf:upload`

Expected: 取得 Cloudflare preview URL；`twstock.xiehnet.com` 仍由既有 Pages 服務，不切換網域。

- [ ] **Step 4: 驗證頁面、API 與 Supabase**

Run: `VERIFY_BASE_URL=<preview-url> VERIFY_APP_ACCESS_PASSWORD=<密碼> VERIFY_HEALTH_DETAIL_TOKEN=<token> npm run verify:cloudflare`

Expected: 全數 PASS。

登入後逐一實打 quote、kline、fundamental、watchlist、summary API。Supabase 寫入測試只新增一筆可明確辨識且可立即回復的測試狀態；驗證後還原原值，不改動使用者自選股。

- [ ] **Step 5: 驗證 LINE 與四種 Cron**

發送一則標題含「Cloudflare 遷移測試」的 LINE 訊息，不寫入任何 alert hit timestamp。以 Wrangler scheduled test 或 Cloudflare dashboard 手動觸發四個 cron，確認 Supabase 狀態、租約、成功／失敗 detail 與 Workers Logs；同一工作並發觸發只能有一個取得租約。

- [ ] **Step 6: 交易時段驗證 TWSE**

在下一個台股交易日盤中，從預覽 Worker 連續執行專案 smoke 測試；至少涵蓋 10 分鐘及 60 次報價輪詢，沒有 5xx、空報價、Session Cookie 重建風暴或 Workers CPU 超限。未通過就修復 Cloudflare，禁止切換正式網域。

- [ ] **Step 7: 檢查 logs 與資源限制**

檢查 HTTP、Cron、subrequest、CPU、記憶體與例外；logs 不得出現 Supabase key、LINE token、MIS Cookie 或 Authorization header。

---

### Checkpoint B: 正式切換授權

- [ ] Cloudflare 預覽的頁面、API、Supabase、LINE、四種 Cron 與盤中 TWSE 全數通過。
- [ ] GitHub SHA、OpenNext build 與 Cloudflare preview version 可互相對應。
- [ ] 使用者看到驗收證據並明確核准「切換正式網域並停止 Zeabur」。
- [ ] 未取得核准前，不修改 custom domain、不停止 Zeabur。

---

### Task 10: 一次性切換正式網域並停止 Zeabur

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `.github/workflows/cloudflare-worker.yml`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Checkpoint B 核准、已驗證的 Cloudflare Worker version。
- Produces: `twstock.xiehnet.com` 由單一 Worker 提供，Zeabur 服務停止。

- [ ] **Step 1: 記錄切換前狀態**

記錄 GitHub commit SHA、Cloudflare preview version、Pages project、DNS/custom domain、Zeabur service ID 與健康狀態。不得記錄任何 secret 值。

- [ ] **Step 2: 加入正式 custom domain 與 main deploy**

`wrangler.jsonc` 加入：

```jsonc
"routes": [
  { "pattern": "twstock.xiehnet.com", "custom_domain": true }
]
```

Workflow 的 production job 只允許 `main` 且 validate 成功後執行 `opennextjs-cloudflare deploy`。提交前重跑 `npm test`、`npm run build`、`npm run cf:build`、`git diff --check`。

- [ ] **Step 3: 交叉審查切換 diff**

另一個 AI 審查 `origin/main..HEAD`，特別檢查 custom domain、workflow secrets、Cron、Supabase migration 與不回切 Zeabur 的約束。所有高嚴重度 finding 修正並重跑驗收。

- [ ] **Step 4: 合併並部署已驗證版本**

合併 feature branch 到 `main` 並觸發 Worker production deploy。等待 Cloudflare 顯示部署成功且 custom domain active；不以 workflow 綠燈取代公開網址驗證。

- [ ] **Step 5: 實測正式網域**

Run: `VERIFY_BASE_URL=https://twstock.xiehnet.com VERIFY_APP_ACCESS_PASSWORD=<密碼> VERIFY_HEALTH_DETAIL_TOKEN=<token> npm run verify:cloudflare`

實際用桌面與手機開啟網站，登入並檢查首頁、搜尋、自選股、個股、提醒、quote、kline、fundamental、summary、health detail。確認回應不再含 `x-zeabur-request-id`。

- [ ] **Step 6: 停止 Zeabur**

只有 Step 5 全數成功才停止 Zeabur service。使用 Zeabur 服務工具執行停止或縮容至不再提供服務；不得刪除 service、project、volume 或環境變數。記錄停止時間與操作結果。

- [ ] **Step 7: 停止後再次驗證 Cloudflare**

Zeabur 停止後再次執行正式 verifier、核心 API、Supabase、LINE 測試與 Workers Logs 檢查。任何失敗只修復或回滾 Cloudflare Worker，不重新啟用 Zeabur。

- [ ] **Step 8: 更新最終文件與提交**

README 與 CLAUDE 移除 Zeabur 現役部署敘述，記錄 Cloudflare Worker、Cron、Supabase、驗收指令與 Zeabur 已停止但尚未永久刪除。

```bash
git add wrangler.jsonc .github/workflows/cloudflare-worker.yml README.md CLAUDE.md
git commit -m "docs: 記錄 Cloudflare 全端切換完成"
```

---

### Final Checkpoint: 完成定義

- [ ] `twstock.xiehnet.com` 的頁面與所有 API 由單一 Cloudflare Worker 提供。
- [ ] Supabase 是唯一正式資料庫，既有資料未搬移或破壞。
- [ ] 四種 Cron 與 LINE 通知由 Worker 正常執行且不重複。
- [ ] 盤中 TWSE smoke、正式 verifier、桌面與手機渲染全部通過。
- [ ] Cloudflare logs 沒有未處理錯誤、資源超限或 secrets 洩漏。
- [ ] Zeabur 已停止，且沒有重新啟用。
- [ ] Zeabur 尚未永久刪除；永久刪除需另行取得使用者確認。
