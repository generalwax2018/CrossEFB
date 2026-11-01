import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/charts/tile/$z/$x/$y")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const z = Number(params.z);
        const x = Number(params.x);
        const y = Number(params.y);
        const { renderSectionalTile } = await import("@/lib/efb/charts.server");
        const png = await renderSectionalTile(z, x, y);
        if (!png) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
        return new Response(new Uint8Array(png), {
          headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
        });
      },
    },
  },
});
