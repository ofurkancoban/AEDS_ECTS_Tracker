// Offline support for the tracker. Hashed build assets are cached forever;
// pages and data files (catalog.csv, CHANGELOG.json, ratings.json) are fetched
// fresh when online and served from cache when offline. Requests to other
// origins (assistant API, visit counter, ratings inbox) are left alone.
const CACHE = "ects-tracker-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Hashed assets from older deploys are never requested again; keep the cache
// from growing forever by dropping the oldest ones past this many.
const MAX_ASSETS = 80;

async function pruneAssets(cache) {
  const assets = (await cache.keys()).filter((r) => new URL(r.url).pathname.includes("/assets/"));
  for (const r of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(r);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    pruneAssets(cache);
  }
  return res;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const path = url.pathname.slice(scope.pathname.length);

  if (request.mode === "navigate") {
    const shell = path.startsWith("legacy/") ? new URL("legacy/", scope).href : scope.href;
    event.respondWith(networkFirst(request, shell));
  } else if (path.startsWith("assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
