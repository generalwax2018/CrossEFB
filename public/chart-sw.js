/*
 * CrossEFB service worker.
 *
 * - Charts (sectional, terminal, IFR) and FAA plate PDFs: network first, saved
 *   copy when there is no signal. "Save for offline" pre-fills this cache.
 * - The app itself (pages, hashed assets, fonts): network first for pages,
 *   cache first for hashed assets, so CrossEFB opens with no signal after one
 *   online visit.
 * - Live data (weather, TFRs, NOTAMs, sync) is never served from cache here.
 */
const TILES = "crossefb-sectionals-v1";
const SHELL = "crossefb-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([TILES, SHELL]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function isChart(url) {
  return (
    (url.origin === self.location.origin &&
      (url.pathname.startsWith("/api/charts/tile/") || url.pathname.startsWith("/api/plates/"))) ||
    (url.hostname === "tiles.arcgis.com" && url.pathname.includes("/ssFJjBXIUyZDrSYZ/"))
  );
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok || fresh.type === "opaque") await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const saved = await cache.match(request);
    if (saved) return saved;
    return new Response(null, { status: 504 });
  }
}

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === "opaque") await cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isChart(url)) {
    // Plate PDFs never change within a cycle; serve the saved copy first.
    if (url.pathname.startsWith("/api/plates/pdf/")) event.respondWith(cacheFirst(TILES, req));
    else event.respondWith(networkFirst(TILES, req));
    return;
  }

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const fresh = await fetch(req);
          if (fresh.ok) await cache.put("/", fresh.clone());
          return fresh;
        } catch {
          return (await cache.match("/")) || new Response("CrossEFB is offline and has not been opened online yet.", { status: 503 });
        }
      })(),
    );
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || /\.(svg|png|webmanifest)$/.test(url.pathname))) {
    event.respondWith(cacheFirst(SHELL, req));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(SHELL, req));
  }
});
