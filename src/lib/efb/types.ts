export type DocId =
  | "navlog"
  | "wb"
  | "perf"
  | "brief"
  | "frat"
  | "checks"
  | "log"
  | "rental";

export type Tab = "chart" | "plan" | "wx" | "aircraft" | "docs";
export type ChartMode = "night" | "day";

export type Airspace = "B" | "C" | "D" | "E";

export type Airport = {
  icao: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  elev: number;
  cls: Airspace;
  ring: boolean;
  rwy: string;
  freq: string;
  varE: number;
  hdg?: number;
};

export type Station = {
  id: string;
  name: string;
  arm: number;
  seat: boolean;
};

export type LimitPoint = { lb: number; arm: number };

export type Aircraft = {
  profileId: string;
  name: string;
  tail: string;
  color: string;
  tas: number;
  burnGph: number;
  usableGal: number;
  cruiseFt: number;
  bew: number;
  beArm: number;
  fuelArm: number;
  mgw: number;
  stations: Station[];
  fwd: LimitPoint[];
  aft: LimitPoint[];
  toRoll: number;
  to50: number;
  ldgRoll: number;
  ldg50: number;
  refLb: number;
  liftoffKt: number;
  approachKt: number;
};

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

export type FratManual = {
  sleep: boolean;
  illness: boolean;
  medication: boolean;
  stress: boolean;
  alcohol: boolean;
  emotion: boolean;
  pressure: boolean;
  afterWork: boolean;
};

export type LogEntry = {
  id: string;
  date: string;
  from: string;
  to: string;
  total: number;
  night: number;
  approaches: number;
  dayLdg: number;
  nightLdg: number;
  pic: string;
  remarks: string;
  tail: string;
};

export type Rental = {
  pic: string;
  hobbsOut: number;
  hobbsIn: number;
  tachOut: number;
  tachIn: number;
  fuelOut: number;
  fuelIn: number;
  oilQt: number;
  squawk: string;
};
