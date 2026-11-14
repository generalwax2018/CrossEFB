import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/terrain/grid")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const raw = q.get("pts") ?? "";
        const points = raw
          .split(";")
          .slice(0, 80)
          .map((pair) => {
            const [lat, lon] = pair.split(",").map(Number);
            return { lat, lon };
          })
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
        if (!points.length) return Response.json({ elevFt: [], source: "none" }, { status: 400 });
        const { elevations } = await import("@/lib/efb/terrain.server");
        const elevFt = await elevations(points);
        return Response.json(
          { elevFt, source: "AWS terrain tiles (3DEP / SRTM). Planning aid, not a survey." },
          { headers: { "cache-control": "public, max-age=86400" } },
        );
      },
    },
  },
});
