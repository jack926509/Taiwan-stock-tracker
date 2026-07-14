# 手機離線 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Cloudflare Pages 前端可安裝為手機 PWA，離線開啟快取介面並在恢復網路後重新取得資料。

**Architecture:** 在 `frontend/public` 提供原生 Service Worker 與離線頁，使用版本化 Cache Storage。HTML 導覽採網路優先並回退至快取介面；`/api/*` 採網路優先，僅在斷線時使用舊回應。React 元件負責註冊 Service Worker、顯示 iOS 安裝指引與離線狀態，不保存敏感資料。

**Tech Stack:** Next.js 15 靜態輸出、React 19、Cloudflare Pages Functions、原生 Service Worker、Node.js 內建測試。

## Global Constraints

- 不新增第三方 PWA、快取或推播套件。
- `/api/*` 保持由 Cloudflare Pages Functions 代理到 Zeabur。
- 離線資料必須明示「快取／可能非最新」，不得偽裝為即時報價。
- 不快取帳密、token、環境變數或含 `no-store` 的回應。
- 不覆蓋既有使用者未提交的 `app/globals.css`、`app/layout.tsx`、K 線與色彩調整。
- 每項程式改動完成後執行對應測試；最終執行 `npm test`、`npm run build` 與 `npm --prefix frontend run build`。

---

## File Structure

- `frontend/app/manifest.ts`：Cloudflare 前端的 Web App Manifest 與安裝圖示宣告。
- `frontend/app/icons/192/route.tsx`、`frontend/app/icons/512/route.tsx`：靜態輸出可用的 PNG PWA 圖示。
- `frontend/public/sw.js`：版本化 App shell 與 API 快取策略。
- `frontend/public/offline.html`：第一次離線且無首頁快取時的安全說明頁。
- `components/PWAServiceWorker.tsx`：只負責註冊、更新與網路恢復通知的 client 元件。
- `components/PWAInstallPrompt.tsx`：保留 Android 安裝流程，新增 iOS 手動安裝說明。
- `components/MobileNetworkBanner.tsx`：把離線訊息改為明確說明快取資料與自動更新。
- `frontend/app/layout.tsx`：宣告 Apple Web App metadata、圖示，掛載註冊元件。
- `tests/cloudflare-pwa.test.mjs`：驗證 PWA 靜態設定與 Service Worker 的安全快取契約。

### Task 1: 定義 Cloudflare PWA 靜態資源與安全快取契約

**Files:**
- Create: `tests/cloudflare-pwa.test.mjs`
- Create: `frontend/app/manifest.ts`
- Create: `frontend/app/icons/192/route.tsx`
- Create: `frontend/app/icons/512/route.tsx`
- Create: `frontend/public/sw.js`
- Create: `frontend/public/offline.html`

**Interfaces:**
- Produces：`/manifest.webmanifest`、`/icons/192`、`/icons/512`、`/sw.js` 與 `/offline.html`。
- Service Worker constants：`CACHE_VERSION = "twstock-pwa-v1"`、`APP_SHELL_PATHS`、`isCacheableApiResponse(response)`。

- [ ] **Step 1: 寫入會失敗的 PWA 靜態設定測試**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Cloudflare PWA 提供 manifest、離線頁與版本化 Service Worker", async () => {
  const [manifest, worker, offline] = await Promise.all([
    read("frontend/app/manifest.ts"),
    read("frontend/public/sw.js"),
    read("frontend/public/offline.html"),
  ]);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /\/icons\/192/);
  assert.match(worker, /const CACHE_VERSION = "twstock-pwa-v1"/);
  assert.match(worker, /request\.url.*\/api\//s);
  assert.match(worker, /cache-control/i);
  assert.match(offline, /目前沒有網路連線/);
});
```

- [ ] **Step 2: 執行測試，確認尚未具備 Cloudflare PWA 資源而失敗**

Run: `node --test tests/cloudflare-pwa.test.mjs`

Expected: FAIL，訊息指出 `frontend/app/manifest.ts` 或 `frontend/public/sw.js` 不存在。

- [ ] **Step 3: 新增最小可用靜態資源**

在 manifest 使用 `name: "台股追蹤"`、`start_url: "/"`、`scope: "/"`、`display: "standalone"`、暖白背景色與三個 `any`／`maskable` 圖示宣告。圖示 route 與既有 `app/icons/*/route.tsx` 同樣呼叫 `renderAppIcon`。

在 `sw.js` 實作以下行為：

```js
const CACHE_VERSION = "twstock-pwa-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const APP_SHELL_PATHS = ["/", "/offline.html", "/manifest.webmanifest", "/favicon.svg"];

function isApiRequest(request) {
  return new URL(request.url).pathname.startsWith("/api/");
}

function isCacheableApiResponse(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.ok && !cacheControl.includes("no-store");
}
```

`fetch` 事件中：導覽請求先 `fetch` 並將成功回應寫入 shell cache；失敗時回傳已快取導覽，沒有時回傳 `/offline.html`。API 先 `fetch`，成功且可快取時寫入 API cache；失敗時才回傳 API cache，沒有舊回應時保留失敗結果。`activate` 清除不是 `CACHE_VERSION` 前綴的 cache，並呼叫 `clients.claim()`。

- [ ] **Step 4: 執行 PWA 靜態測試，確認通過**

Run: `node --test tests/cloudflare-pwa.test.mjs`

Expected: PASS，顯示 1 passing test。

- [ ] **Step 5: Commit**

```bash
git add tests/cloudflare-pwa.test.mjs frontend/app/manifest.ts frontend/app/icons frontend/public/sw.js frontend/public/offline.html
git commit -m "feat: 新增離線 PWA 靜態資源"
```

### Task 2: 註冊 Service Worker 並完成手機安裝提示

**Files:**
- Modify: `frontend/app/layout.tsx`
- Create: `components/PWAServiceWorker.tsx`
- Modify: `components/PWAInstallPrompt.tsx`
- Modify: `tests/cloudflare-pwa.test.mjs`

**Interfaces:**
- `PWAServiceWorker`：無 props；掛載後註冊 `/sw.js`，新版本等待中時傳送 `SKIP_WAITING`。
- `PWAInstallPrompt`：Android 維持 `beforeinstallprompt`；iOS Safari 未安裝時顯示「分享 → 加入主畫面」。

- [ ] **Step 1: 擴充會失敗的測試**

在 `tests/cloudflare-pwa.test.mjs` 加入：

```js
test("Cloudflare layout 註冊 Service Worker 並提供 Apple 安裝資訊", async () => {
  const [layout, registration, prompt] = await Promise.all([
    read("frontend/app/layout.tsx"),
    read("components/PWAServiceWorker.tsx"),
    read("components/PWAInstallPrompt.tsx"),
  ]);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /PWAServiceWorker/);
  assert.match(registration, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(prompt, /加入主畫面/);
  assert.match(prompt, /分享/);
});
```

- [ ] **Step 2: 執行測試，確認 Service Worker 註冊元件尚不存在而失敗**

Run: `node --test tests/cloudflare-pwa.test.mjs`

Expected: FAIL，訊息指出 `components/PWAServiceWorker.tsx` 不存在。

- [ ] **Step 3: 實作註冊與 iOS 提示**

新增 client component：

```tsx
useEffect(() => {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }).catch(() => undefined);
}, []);
```

layout 補上 `appleWebApp: { capable: true, statusBarStyle: "default", title: "台股追蹤" }`、Apple icon，並在 `<body>` 內掛載 `<PWAServiceWorker />`。不碰使用者已改動的 root `app/layout.tsx`。

`PWAInstallPrompt` 新增 `isIosSafari()`，僅在 iOS Safari、未 standalone、未曾略過提示時顯示同一張手機提示卡；內容固定為「點分享按鈕，再選加入主畫面」。Android 原本安裝按鈕流程不變。

- [ ] **Step 4: 執行測試，確認通過**

Run: `node --test tests/cloudflare-pwa.test.mjs`

Expected: PASS，所有 PWA 靜態測試通過。

- [ ] **Step 5: Commit**

```bash
git add frontend/app/layout.tsx components/PWAServiceWorker.tsx components/PWAInstallPrompt.tsx tests/cloudflare-pwa.test.mjs
git commit -m "feat: 完成手機 PWA 安裝與更新註冊"
```

### Task 3: 明示離線快取狀態並驗證恢復網路流程

**Files:**
- Modify: `components/MobileNetworkBanner.tsx`
- Modify: `tests/cloudflare-pwa.test.mjs`

**Interfaces:**
- `MobileNetworkBanner` 保持 `stale?: boolean`、`error?: unknown` props；離線文案明確表示使用最後一次快取資料與恢復連線後自動更新。
- SWR 保持預設 `revalidateOnReconnect: true`，由既有頁面的 SWR hooks 在 `online` 後重新驗證。

- [ ] **Step 1: 擴充會失敗的文案與安全測試**

```js
test("離線提示不把快取資料當成即時報價", async () => {
  const banner = await read("components/MobileNetworkBanner.tsx");
  assert.match(banner, /最後一次快取資料/);
  assert.match(banner, /恢復連線後將自動更新/);
});
```

- [ ] **Step 2: 執行測試，確認既有文案尚未符合驗收字句而失敗**

Run: `node --test tests/cloudflare-pwa.test.mjs`

Expected: FAIL，找不到「最後一次快取資料」或「恢復連線後將自動更新」。

- [ ] **Step 3: 調整離線訊息，不改資料存取行為**

將離線訊息改為：`目前離線，正在顯示最後一次快取資料；恢復連線後將自動更新。` 保持現有 `online`／`offline` 事件監聽與 `stale`／`error` 分支；不加入輪詢、不新增 API，也不宣告舊報價為即時。

- [ ] **Step 4: 執行專屬與完整驗收**

Run:

```bash
node --test tests/cloudflare-pwa.test.mjs
npm test
npm run build
npm --prefix frontend run build
```

Expected: PWA 測試、全部既有測試與兩次建置皆成功。

- [ ] **Step 5: 瀏覽器實機驗收與 Commit**

在本機 Cloudflare 前端預覽中：首次線上開啟首頁、切離網路後重整確認快取介面或離線頁、恢復網路後確認離線橫幅消失且 API 請求成功。然後：

```bash
git add components/MobileNetworkBanner.tsx tests/cloudflare-pwa.test.mjs
git commit -m "fix: 明示 PWA 離線快取與自動更新"
```

## Plan Self-Review

- Spec coverage：安裝、iOS 指引、App shell、API 網路優先快取、快取版本清理、離線標示、恢復連線、三項驗收命令皆對應至 Task 1–3。
- Placeholder scan：沒有 TODO、TBD 或未定義的後續工作。
- Type consistency：Service Worker 使用原生 JS；React 元件均使用既有 TypeScript／TSX 型別與既有 `MobileNetworkBannerProps`。
