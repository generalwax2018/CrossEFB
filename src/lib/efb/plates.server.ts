import { dtppCycle, parseMetafile, type PlateIndex } from "./plates";

const UA = { "user-agent": "CrossEFB/1.0 (planning aid)" };
let current: { at: number; index: PlateIndex } | null = null;
let loading: Promise<PlateIndex | null> | null = null;

async function loadCycle(cycle: string): Promise<PlateIndex | null> {
  const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/xml_data/d-tpp_Metafile.xml`, {
    signal: AbortSignal.timeout(60000),
    headers: UA,
  });
  if (!res.ok) return null;
  const index = parseMetafile(await res.text());
  return index.byIdent.size ? index : null;
}

/** The plate index for the current cycle (falls back to the previous one while the FAA posts it). */
export async function plateIndex(): Promise<PlateIndex | null> {
  const want = dtppCycle();
  if (current && current.index.cycle === want && Date.now() - current.at < 24 * 3600 * 1000) return current.index;
  if (!loading) {
    loading = (async () => {
      const index = (await loadCycle(want).catch(() => null)) ?? (await loadCycle(dtppCycle(new Date(), -1)).catch(() => null));
      if (index) current = { at: Date.now(), index };
      return index ?? current?.index ?? null;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export async function platesFor(ident: string) {
  const index = await plateIndex();
  if (!index) return { ok: false as const, cycle: dtppCycle(), airport: null };
  const id = ident.toUpperCase();
  const airport = index.byIdent.get(id) ?? (id.length === 4 && id.startsWith("K") ? index.byIdent.get(id.slice(1)) : undefined) ?? null;
  return { ok: true as const, cycle: index.cycle, from: index.from, to: index.to, airport };
}
