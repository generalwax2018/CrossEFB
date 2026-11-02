import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/wx/winds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const f = new URL(request.url).searchParams.get("fcst");
        const fcst = f === "12" || f === "24" ? f : "06";
        const { windPack } = await import("@/lib/efb/live.server");
        const body = await windPack(fcst);
        return Response.json(body, { headers: { "cache-control": "public, max-age=600" } });
      },
    },
  },
});
