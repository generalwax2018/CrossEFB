export type Airspace = "B" | "C" | "D" | "E";

export type Airport = {
  icao: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  elev: number;
  cls: Airspace;
  /** Draw a ring. Satellite fields inside a primary Class B stay false. */
  ring: boolean;
  rwy: string;
  freq: string;
  /** Magnetic variation, east positive. */
  varE: number;
  /** Primary runway heading, degrees magnetic-ish true for the symbol. */
  hdg?: number;
};

export type Aircraft = {
  name: string;
  tail: string;
  tas: number;
  burnGph: number;
  usableGal: number;
  cruiseFt: number;
};

export type Tab = "chart" | "plan" | "wx" | "aircraft";
export type ChartMode = "night" | "day";

export type Metar = {
  icao: string;
  raw: string;
  fltCat: string;
  temp: number | null;
  dewp: number | null;
  wdir: number | null;
  wspd: number | null;
  visib: string | null;
  altim: number | null;
  sky: string;
  obs: string;
};

export type Taf = {
  icao: string;
  raw: string;
};

export type WxBundle = {
  metars: Metar[];
  tafs: Taf[];
  source: "live" | "unavailable";
  fetchedAt: string | null;
};
