import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/plates/$ident")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const ident = String(params.ident ?? "").toUpperCase();
        if (!/^[A-Z0-9]{3,4}$/.test(ident)) return Response.json({ ok: false, airport: null }, { status: 400 });
        const { platesFor } = await import("@/lib/efb/plates.server");
        const body = await platesFor(ident);
        return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
