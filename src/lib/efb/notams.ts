/** NOTAM shapes and helpers shared by the server route and the client. */

export type Notam = {
  id: string;
  number: string;
  location: string;
  /** RWY, TWY, NAV, AD, OBST, SVC, AIRSPACE, COM, APRON, ... */
  keyword: string;
  text: string;
  start: string;
  end: string;
  /** Closures, outages, and unlit obstacles that change a plan. */
  important: boolean;
};

export type NotamPack = {
  configured: boolean;
  notams: Record<string, Notam[]>;
  fetchedAt: string | null;
  error?: string;
};

const KEYWORDS = ["RWY", "TWY", "APRON", "AD", "OBST", "NAV", "COM", "SVC", "AIRSPACE", "ODP", "SID", "STAR", "IAP", "CHART", "DATA", "SPECIAL"];

/** The keyword is the first known token after the "!LOC nn/nnn LOC" header. */
export function notamKeyword(text: string): string {
  const tokens = text.replace(/^!\S+\s+\S+\s+\S+\s+/, "").split(/\s+/);
  for (const t of tokens.slice(0, 4)) if (KEYWORDS.includes(t)) return t;
  return "OTHER";
}

export function isImportant(text: string): boolean {
  return /\b(CLSD|CLOSED|U\/S|UNSERVICEABLE|OTS|UNMNT|NOT AVBL|UNLGTD|OUT OF SERVICE)\b/.test(text.toUpperCase());
}

type RawItem = {
  properties?: {
    coreNOTAMData?: {
      notam?: {
        id?: string;
        number?: string;
        location?: string;
        icaoLocation?: string;
        effectiveStart?: string;
        effectiveEnd?: string;
        text?: string;
      };
      notamTranslation?: { type?: string; simpleText?: string; formattedText?: string }[];
    };
  };
};

/** Map one item from the FAA NOTAM API (v1) response. */
export function mapNotamItem(item: RawItem): Notam | null {
  const core = item.properties?.coreNOTAMData;
  const n = core?.notam;
  if (!n) return null;
  const local = core?.notamTranslation?.find((t) => t.type === "LOCAL_FORMAT")?.simpleText;
  const text = (local || n.text || "").trim();
  if (!text) return null;
  return {
    id: n.id ?? `${n.location}-${n.number}`,
    number: n.number ?? "",
    location: (n.icaoLocation || n.location || "").toUpperCase(),
    keyword: notamKeyword(text),
    text,
    start: n.effectiveStart ?? "",
    end: n.effectiveEnd ?? "",
    important: isImportant(text),
  };
}

const ORDER = ["RWY", "AD", "TWY", "OBST", "NAV", "AIRSPACE", "SVC", "COM", "APRON"];

export function sortNotams(list: Notam[]): Notam[] {
  return list.slice().sort((a, b) => {
    if (a.important !== b.important) return a.important ? -1 : 1;
    const ka = ORDER.indexOf(a.keyword);
    const kb = ORDER.indexOf(b.keyword);
    return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb);
  });
}
