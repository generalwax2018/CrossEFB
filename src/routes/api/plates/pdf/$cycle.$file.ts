import { createFileRoute } from "@tanstack/react-router";

/** Same-origin proxy so pdf.js can read FAA plates (aeronav sends no CORS headers). */
export const Route = createFileRoute("/api/plates/pdf/$cycle/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const cycle = String(params.cycle ?? "");
        const file = String(params.file ?? "");
        if (!/^\d{4}$/.test(cycle) || !/^[A-Za-z0-9_-]{1,40}\.PDF$/i.test(file)) {
          return new Response("bad request", { status: 400 });
        }
        const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/${file.toUpperCase()}`, {
          signal: AbortSignal.timeout(30000),
          headers: { "user-agent": "CrossEFB/1.0 (planning aid)" },
        }).catch(() => null);
        if (!res || !res.ok || !res.body) return new Response("not found", { status: 404 });
        return new Response(res.body, {
          headers: {
            "content-type": "application/pdf",
            "cache-control": "public, max-age=604800, immutable",
          },
        });
      },
    },
  },
});
