const CACHE = "crossefb-sectionals-v1";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/api/charts/tile/")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok) await cache.put(event.request, fresh.clone());
        return fresh;
      } catch {
        const saved = await cache.match(event.request);
        if (saved) return saved;
        return new Response(null, { status: 504 });
      }
    })(),
  );
});
