import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/wx/metars")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const box = {
          south: Number(q.get("south")),
          west: Number(q.get("west")),
          north: Number(q.get("north")),
          east: Number(q.get("east")),
        };
        if (!Object.values(box).every(Number.isFinite) || box.north <= box.south) {
          return Response.json({ stations: [], fetchedAt: null }, { status: 400 });
        }
        const { metarField } = await import("@/lib/efb/live.server");
        const body = await metarField(box);
        return Response.json(body, { headers: { "cache-control": "public, max-age=120" } });
      },
    },
  },
});
