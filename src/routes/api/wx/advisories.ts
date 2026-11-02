import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/wx/advisories")({
  server: {
    handlers: {
      GET: async () => {
        const { advisoryPack } = await import("@/lib/efb/advisories.server");
        const body = await advisoryPack();
        return Response.json(body, {
          headers: { "cache-control": "public, max-age=60" },
        });
      },
    },
  },
});
