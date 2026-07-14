const CACHE_VERSION = "twstock-pwa-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const APP_SHELL_PATHS = ["/", "/offline.html", "/manifest.webmanifest", "/favicon.svg"];

function isApiRequest(request) {
  return new URL(request.url).pathname.startsWith("/api/");
}

function isCacheableApiResponse(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.ok && !cacheControl.includes("no-store") && !cacheControl.includes("private") && !response.headers.has("set-cookie");
}

async function cacheResponse(cache, request, response) {
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    return isCacheableApiResponse(response) ? cacheResponse(cache, request, response) : response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "目前離線，尚無快取資料" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    return response.ok ? cacheResponse(cache, request, response) : response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match("/")) ?? (await cache.match("/offline.html"));
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  return response.ok ? cacheResponse(cache, request, response) : response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_PATHS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("twstock-pwa-") && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (isApiRequest(request)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});
