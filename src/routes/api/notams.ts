import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/notams")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ids = (new URL(request.url).searchParams.get("ids") ?? "")
          .toUpperCase()
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^[A-Z0-9]{3,4}$/.test(s))
          .slice(0, 10);
        const { notamPack } = await import("@/lib/efb/notams.server");
        const body = await notamPack([...new Set(ids)]);
        return Response.json(body, { headers: { "cache-control": "private, max-age=300" } });
      },
    },
  },
});
