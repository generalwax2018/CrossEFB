import { createFileRoute } from "@tanstack/react-router";

const HOSTS = new Set(["tiles.arcgis.com", "mesonet.agron.iastate.edu"]);

export const Route = createFileRoute("/api/charts/layer/$layer/$z/$x/$y")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const z = Number(params.z);
        const x = Number(params.x);
        const y = Number(params.y);
        const layer = String(params.layer ?? "");
        const n = 2 ** z;
        if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 14 || x < 0 || y < 0 || x >= n || y >= n) {
          return new Response(null, { status: 400 });
        }
        const { UPSTREAM_TILES, sniffImage } = await import("@/lib/efb/layers");
        const build = UPSTREAM_TILES[layer];
        if (!build) return new Response(null, { status: 404 });
        let target: URL;
        try {
          target = new URL(build(z, x, y));
        } catch {
          return new Response(null, { status: 404 });
        }
        if (!HOSTS.has(target.hostname)) return new Response(null, { status: 404 });
        const res = await fetch(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(12000),
          headers: { "user-agent": "CrossEFB/1.0 (planning aid)", accept: "image/png,image/jpeg,image/*" },
        }).catch(() => null);
        // Outside a chart's coverage the FAA service answers 404 with an HTML page.
        if (res && res.status === 404) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
        if (!res || !res.ok) return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = sniffImage(bytes);
        if (!type) return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
        const cache = layer === "radar" ? "public, max-age=300" : "public, max-age=86400";
        return new Response(bytes, { headers: { "content-type": type, "cache-control": cache } });
      },
    },
  },
});
