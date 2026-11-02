import { mapNotamItem, sortNotams, type Notam, type NotamPack } from "./notams";

/**
 * FAA NOTAM API (api.faa.gov). Credentials come from the host environment:
 *   FAA_NOTAM_CLIENT_ID, FAA_NOTAM_CLIENT_SECRET
 * Optional FAA_NOTAM_API_URL overrides the endpoint (for the NMS successor).
 */
const DEFAULT_URL = "https://external-api.faa.gov/notamapi/v1/notams";
const cache = new Map<string, { at: number; list: Notam[] }>();

function creds() {
  const id = process.env.FAA_NOTAM_CLIENT_ID?.trim();
  const secret = process.env.FAA_NOTAM_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

async function fetchOne(icao: string, c: { id: string; secret: string }): Promise<Notam[]> {
  const hit = cache.get(icao);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  const base = process.env.FAA_NOTAM_API_URL?.trim() || DEFAULT_URL;
  const url = `${base}?icaoLocation=${encodeURIComponent(icao)}&pageSize=200`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { client_id: c.id, client_secret: c.secret, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`NOTAM API ${res.status}`);
  const body = (await res.json()) as { items?: unknown[] };
  const list = sortNotams(
    (Array.isArray(body.items) ? body.items : [])
      .map((i) => mapNotamItem(i as Parameters<typeof mapNotamItem>[0]))
      .filter((n): n is Notam => n !== null),
  );
  cache.set(icao, { at: Date.now(), list });
  return list;
}

export async function notamPack(icaos: string[]): Promise<NotamPack> {
  const c = creds();
  if (!c) return { configured: false, notams: {}, fetchedAt: null };
  const out: Record<string, Notam[]> = {};
  let error = "";
  await Promise.all(
    icaos.map(async (icao) => {
      try {
        out[icao] = await fetchOne(icao, c);
      } catch (e) {
        error = e instanceof Error ? e.message : "NOTAM API error";
        const stale = cache.get(icao);
        if (stale) out[icao] = stale.list;
      }
    }),
  );
  return { configured: true, notams: out, fetchedAt: new Date().toISOString(), ...(error ? { error } : {}) };
}
