// Service Worker：PWA 可安裝性 + 最小離線後備。
// 快取原則：只預快取 offline.html 一頁；「絕不」快取 /api/*、頁面或任何動態內容——
// 即時報價 app 吃到舊快取比暫時離線更糟。導覽請求一律先走網路，失敗才回離線頁。

const OFFLINE_CACHE = "offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// 配合 PWAServiceWorker.tsx 對 waiting worker 送出的 SKIP_WAITING 訊息
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清掉舊版快取（含歷史部署遺留），只保留本版離線頁
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // 只攔頁面導覽；其餘請求（API、靜態資源）不經 SW，維持瀏覽器原生行為
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
