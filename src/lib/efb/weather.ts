import { createServerFn } from "@tanstack/react-start";
import type { Metar, Taf, WxBundle } from "./types";

type RawMetar = {
  icaoId?: string;
  rawOb?: string;
  fltCat?: string;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  visib?: string | number;
  altim?: number;
  obsTime?: number;
  cover?: string;
  clouds?: { cover?: string; base?: number }[];
};

type RawTaf = {
  icaoId?: string;
  rawTAF?: string;
};

function skyOf(m: RawMetar): string {
  const clouds = m.clouds ?? [];
  if (!clouds.length) return m.cover || "—";
  return clouds
    .map((c) => (c.base ? `${c.cover ?? ""} ${c.base}`.trim() : (c.cover ?? "")))
    .filter(Boolean)
    .join(" · ");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapMetar(m: RawMetar): Metar | null {
  const icao = m.icaoId?.toUpperCase();
  if (!icao) return null;
  const obs = m.obsTime ? new Date(m.obsTime * 1000).toISOString().slice(11, 16) + "Z" : "";
  return {
    icao,
    raw: m.rawOb ?? "",
    fltCat: (m.fltCat ?? "UNK").toUpperCase(),
    temp: num(m.temp),
    dewp: num(m.dewp),
    wdir: m.wdir === "VRB" ? null : num(m.wdir),
    wspd: num(m.wspd),
    visib: m.visib == null ? null : String(m.visib),
    altim: num(m.altim),
    sky: skyOf(m),
    obs,
  };
}

export const fetchWeather = createServerFn({ method: "POST" })
  .validator((data: { icaos?: string[] }) => {
    const icaos = Array.isArray(data?.icaos) ? data.icaos : [];
    return {
      icaos: icaos
        .map((s) => String(s).toUpperCase().trim())
        .filter((s) => /^[A-Z0-9]{3,4}$/.test(s))
        .slice(0, 16),
    };
  })
  .handler(async ({ data }): Promise<WxBundle> => {
    if (!data.icaos.length) {
      return { metars: [], tafs: [], source: "unavailable", fetchedAt: null };
    }
    const ids = data.icaos.join(",");
    try {
      const signal = AbortSignal.timeout(8000);
      const [metarRes, tafRes] = await Promise.all([
        fetch(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`, { signal }),
        fetch(`https://aviationweather.gov/api/data/taf?ids=${ids}&format=json`, { signal }),
      ]);
      if (!metarRes.ok) {
        return { metars: [], tafs: [], source: "unavailable", fetchedAt: null };
      }
      const metarJson = (await metarRes.json()) as RawMetar[];
      const tafJson = tafRes.ok ? ((await tafRes.json()) as RawTaf[]) : [];
      const metars = (Array.isArray(metarJson) ? metarJson : [])
        .map(mapMetar)
        .filter((m): m is Metar => m !== null);
      const tafs: Taf[] = (Array.isArray(tafJson) ? tafJson : [])
        .map((t) =>
          t.icaoId && t.rawTAF ? { icao: t.icaoId.toUpperCase(), raw: t.rawTAF } : null,
        )
        .filter((t): t is Taf => t !== null);
      return {
        metars,
        tafs,
        source: "live",
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return { metars: [], tafs: [], source: "unavailable", fetchedAt: null };
    }
  });
