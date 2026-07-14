const CACHE_VERSION = "twstock-pwa-v2";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const API_MAX_AGE_MS = 15 * 60 * 1000;
const CACHED_AT_HEADER = "x-twstock-pwa-cached-at";
const APP_SHELL_PATHS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/192",
  "/icons/512",
  "/splash/750x1334",
  "/splash/828x1792",
  "/splash/1125x2436",
  "/splash/1170x2532",
  "/splash/1179x2556",
  "/splash/1206x2622",
  "/splash/1242x2688",
  "/splash/1290x2796",
  "/splash/1320x2868",
];

function isApiRequest(request) {
  return new URL(request.url).pathname.startsWith("/api/");
}

function isCacheableApiResponse(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.ok && !cacheControl.includes("no-store") && !cacheControl.includes("private") && !response.headers.has("set-cookie");
}

async function cacheResponse(cache, request, response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  );
  return response;
}

function isFreshCachedApiResponse(response) {
  const cachedAt = Number(response.headers.get(CACHED_AT_HEADER));
  return Number.isFinite(cachedAt) && Date.now() - cachedAt <= API_MAX_AGE_MS;
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    return isCacheableApiResponse(response) ? cacheResponse(cache, request, response) : response;
  } catch {
    const cached = await cache.match(request);
    if (cached && isFreshCachedApiResponse(cached)) return cached;
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
