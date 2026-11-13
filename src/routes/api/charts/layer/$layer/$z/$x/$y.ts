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
        if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 14 || x < 0 || y < 0) {
          return new Response(null, { status: 400 });
        }
        const { UPSTREAM_TILES } = await import("@/lib/efb/layers");
        const build = UPSTREAM_TILES[layer];
        if (!build) return new Response(null, { status: 404 });
        const upstream = build(z, x, y);
        let target: URL;
        try {
          target = new URL(upstream);
        } catch {
          return new Response(null, { status: 404 });
        }
        if (!HOSTS.has(target.hostname)) return new Response(null, { status: 404 });
        const res = await fetch(target, {
          redirect: "manual",
          headers: { "user-agent": "CrossEFB/1.0 (planning aid)", accept: "image/png,image/jpeg,image/*" },
        });
        if (!res.ok || !res.body) return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
        const type = res.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
        const cache = layer === "radar" ? "public, max-age=300" : "public, max-age=86400";
        return new Response(res.body, { headers: { "content-type": type, "cache-control": cache } });
      },
    },
  },
});
