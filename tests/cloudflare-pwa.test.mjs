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
  assert.match(worker, /API_MAX_AGE_MS = 15 \* 60 \* 1000/);
  assert.match(worker, /x-twstock-pwa-cached-at/);
  assert.match(offline, /目前沒有網路連線/);
});

test("Cloudflare layout 註冊 Service Worker 並提供 Apple 安裝資訊", async () => {
  const [layout, registration, prompt] = await Promise.all([
    read("frontend/app/layout.tsx"),
    read("components/PWAServiceWorker.tsx"),
    read("components/PWAInstallPrompt.tsx"),
  ]);

  assert.match(layout, /appleWebApp/);
  assert.match(layout, /PWAServiceWorker/);
  assert.match(registration, /serviceWorker\s*\.\s*register\("\/sw\.js"\)/);
  assert.match(prompt, /加入主畫面/);
  assert.match(prompt, /分享/);
});

test("離線提示不把快取資料當成即時報價", async () => {
  const [banner, stockPage] = await Promise.all([
    read("components/MobileNetworkBanner.tsx"),
    read("app/stock/[id]/page.tsx"),
  ]);

  assert.match(banner, /最後一次快取資料/);
  assert.match(banner, /恢復連線後將自動更新/);
  assert.match(stockPage, /MobileNetworkBanner/);
});
