import { createFileRoute } from "@tanstack/react-router";

const MAX = 1_500_000;
const MAX_ROWS = 2000;
const valid = (id: string) => /^[0-9a-f]{64}$/.test(id);

type Row = { blob: string; rev: number; updated_at: string | Date };

export const Route = createFileRoute("/api/sync/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id ?? "");
        if (!valid(id)) return Response.json({ error: "bad id" }, { status: 400 });
        try {
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          const rows = await sql<Row>`select blob, rev, updated_at from sync_blobs where id = ${id}`;
          if (!rows.length) return Response.json({ rev: 0, blob: null }, { headers: { "cache-control": "no-store" } });
          const r = rows[0];
          return Response.json(
            { rev: Number(r.rev), blob: r.blob, updatedAt: new Date(r.updated_at).toISOString() },
            { headers: { "cache-control": "no-store" } },
          );
        } catch {
          return Response.json({ error: "sync unavailable" }, { status: 503 });
        }
      },
      PUT: async ({ params, request }) => {
        const id = String(params.id ?? "");
        if (!valid(id)) return Response.json({ error: "bad id" }, { status: 400 });
        const text = await request.text();
        if (text.length > MAX) return Response.json({ error: "too large" }, { status: 413 });
        let body: { blob?: unknown; baseRev?: unknown };
        try {
          body = JSON.parse(text);
        } catch {
          return Response.json({ error: "bad body" }, { status: 400 });
        }
        if (typeof body.blob !== "string" || !/^[A-Za-z0-9+/=]+$/.test(body.blob)) {
          return Response.json({ error: "bad blob" }, { status: 400 });
        }
        const baseRev = Number(body.baseRev ?? 0);
        try {
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          if (baseRev === 0) {
            const have = await sql<{ n: number }>`select count(*) as n from sync_blobs where id = ${id}`;
            if (!Number(have[0]?.n)) {
              const counted = await sql<{ n: number }>`select count(*) as n from sync_blobs`;
              if (Number(counted[0]?.n ?? 0) >= MAX_ROWS) {
                return Response.json({ error: "sync storage is full" }, { status: 429, headers: { "retry-after": "3600" } });
              }
            }
          }
          // Optimistic concurrency: only write on top of the revision the device last saw.
          const rows =
            baseRev === 0
              ? await sql<Row>`insert into sync_blobs (id, blob, rev) values (${id}, ${body.blob}, 1)
                  on conflict (id) do nothing returning blob, rev, updated_at`
              : await sql<Row>`update sync_blobs set blob = ${body.blob}, rev = rev + 1, updated_at = now()
                  where id = ${id} and rev = ${baseRev} returning blob, rev, updated_at`;
          if (!rows.length) {
            const cur = await sql<Row>`select blob, rev, updated_at from sync_blobs where id = ${id}`;
            return Response.json(
              cur.length ? { conflict: true, rev: Number(cur[0].rev), blob: cur[0].blob } : { conflict: true, rev: 0, blob: null },
              { status: 409 },
            );
          }
          return Response.json({ rev: Number(rows[0].rev), updatedAt: new Date(rows[0].updated_at).toISOString() });
        } catch {
          return Response.json({ error: "sync unavailable" }, { status: 503 });
        }
      },
    },
  },
});
