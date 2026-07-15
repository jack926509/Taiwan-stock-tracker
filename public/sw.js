// 極簡 Service Worker：僅為 PWA 可安裝性而存在，刻意不註冊任何 fetch 快取——
// 即時報價 app 吃到舊快取比暫時離線更糟；離線 shell 列於設計檢視 roadmap（第二波）。

self.addEventListener("install", () => {
  self.skipWaiting();
});

// 配合 PWAServiceWorker.tsx 對 waiting worker 送出的 SKIP_WAITING 訊息
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清掉任何舊版（例如歷史部署）留下的快取，確保永遠拿到即時內容
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});
