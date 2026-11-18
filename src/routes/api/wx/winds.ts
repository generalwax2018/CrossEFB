import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/wx/winds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const points = (q.get("pts") ?? "")
          .split(";")
          .slice(0, 12)
          .map((pair) => {
            const [lat, lon] = pair.split(",").map(Number);
            return { lat, lon };
          })
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
        const atRaw = Date.parse(q.get("at") ?? "");
        const now = Date.now();
        // GFS hourly data covers the next few days; clamp to that window.
        const at = new Date(Number.isFinite(atRaw) ? Math.min(now + 60 * 3600000, Math.max(now - 3600000, atRaw)) : now);
        const { windPack } = await import("@/lib/efb/live.server");
        const body = await windPack(points, at);
        return Response.json(body, { headers: { "cache-control": "public, max-age=600" } });
      },
    },
  },
});
