import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

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
  assert.match(worker, /const CACHE_VERSION = "twstock-pwa-v2"/);
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

test("PWA 使用精品牛市 icon 與 iPhone 啟動畫面", async () => {
  const [icon, layout, manifest, worker] = await Promise.all([
    read("lib/iconImage.tsx"),
    read("frontend/app/layout.tsx"),
    read("frontend/app/manifest.ts"),
    read("frontend/public/sw.js"),
  ]);

  for (const color of ["#F7F2E7", "#17385F", "#F05449", "#E4B84F"]) {
    assert.match(icon, new RegExp(color, "i"));
  }
  assert.match(icon, /BULLISH_CANDLES = \[/);
  assert.match(icon, /renderLaunchImage/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  for (const size of ["750x1334", "828x1792", "1125x2436", "1170x2532", "1179x2556", "1206x2622", "1242x2688", "1290x2796", "1320x2868"]) {
    assert.match(layout, new RegExp(`/splash/${size}`));
    assert.match(worker, new RegExp(`/splash/${size}`));
  }
  assert.match(worker, /CACHE_VERSION = "twstock-pwa-v2"/);
});

test("單張啟動畫面快取失敗不阻斷 Service Worker 安裝", async () => {
  const worker = await read("frontend/public/sw.js");
  const listeners = new Map();
  let installPromise;
  const cache = {
    async addAll(paths) {
      if (paths.includes("/splash/1290x2796")) throw new Error("temporary 503");
    },
    async add(path) {
      if (path === "/splash/1290x2796") throw new Error("temporary 503");
    },
  };

  runInNewContext(worker, {
    caches: { open: async () => cache },
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() {},
      clients: { claim() {} },
      location: { origin: "https://twstock.example" },
    },
  });

  listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await assert.doesNotReject(installPromise);
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
