import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/airspace/tfrs")({
  server: {
    handlers: {
      GET: async () => {
        const { tfrPack } = await import("@/lib/efb/live.server");
        const body = await tfrPack();
        return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
      },
    },
  },
});
