import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/charts/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const south = Number(url.searchParams.get("south"));
        const west = Number(url.searchParams.get("west"));
        const north = Number(url.searchParams.get("north"));
        const east = Number(url.searchParams.get("east"));
        const view =
          [south, west, north, east].every(Number.isFinite)
            ? { south, west, north, east }
            : undefined;
        const { chartStatus } = await import("@/lib/efb/charts.server");
        const body = await chartStatus(view);
        return Response.json(body);
      },
    },
  },
});
