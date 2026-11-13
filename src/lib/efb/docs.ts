import type { Aircraft, Airport, FratManual, LogEntry, Station } from "./types";

export type WbResult = {
  rows: { name: string; arm: number; lb: number; moment: number }[];
  weight: number;
  moment: number;
  arm: number;
  fuelLb: number;
  mgw: number;
  inside: boolean;
  reason: string;
  fwdArm: number;
  aftArm: number;
};

function lerpLimit(points: { lb: number; arm: number }[], weight: number): number {
  if (!points.length) return 0;
  const sorted = [...points].sort((a, b) => a.lb - b.lb);
  if (weight <= sorted[0].lb) return sorted[0].arm;
  const last = sorted[sorted.length - 1];
  if (weight >= last.lb) return last.arm;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (weight >= a.lb && weight <= b.lb) {
      const t = (weight - a.lb) / (b.lb - a.lb || 1);
      return a.arm + t * (b.arm - a.arm);
    }
  }
  return last.arm;
}

export function weightBalance(
  aircraft: Aircraft,
  loads: Record<string, number>,
  fuelGal: number,
): WbResult {
  const fuelLb = Math.max(0, fuelGal) * 6;
  const rows: WbResult["rows"] = [
    { name: "Empty", arm: aircraft.beArm, lb: aircraft.bew, moment: aircraft.bew * aircraft.beArm },
    { name: "Fuel", arm: aircraft.fuelArm, lb: fuelLb, moment: fuelLb * aircraft.fuelArm },
  ];
  for (const station of aircraft.stations) {
    const lb = Math.max(0, loads[station.id] ?? 0);
    rows.push({ name: station.name, arm: station.arm, lb, moment: lb * station.arm });
  }
  const weight = rows.reduce((n, r) => n + r.lb, 0);
  const moment = rows.reduce((n, r) => n + r.moment, 0);
  const arm = weight > 0 ? moment / weight : 0;
  const fwdArm = lerpLimit(aircraft.fwd, weight);
  const aftArm = lerpLimit(aircraft.aft, weight);
  let inside = true;
  let reason = "Inside the sample envelope";
  if (weight > aircraft.mgw + 0.5) {
    inside = false;
    reason = `${Math.round(weight - aircraft.mgw)} lb over max gross`;
  } else if (arm < fwdArm - 0.05) {
    inside = false;
    reason = "Forward of the limit";
  } else if (arm > aftArm + 0.05) {
    inside = false;
    reason = "Aft of the limit";
  }
  return { rows, weight, moment, arm, fuelLb, mgw: aircraft.mgw, inside, reason, fwdArm, aftArm };
}

export function runwayFeet(rwy: string): number {
  const comma = rwy.match(/(\d{1,2}),(\d{3})/);
  if (comma) return Number(comma[1]) * 1000 + Number(comma[2]);
  const plain = rwy.match(/(\d{3,5})\s*ft/i);
  return plain ? Number(plain[1]) : 0;
}

export function windComponents(windFrom: number, windKts: number, rwyHdg: number) {
  const rad = ((windFrom - rwyHdg) * Math.PI) / 180;
  const head = windKts * Math.cos(rad);
  return { head, cross: Math.abs(windKts * Math.sin(rad)) };
}

export function runwayEnds(rwy: string): { label: string; hdg: number }[] {
  const match = rwy.match(/(\d{2})([LRC])?\/(\d{2})([LRC])?/);
  if (!match) return [];
  const end = (num: string, side?: string) => {
    const n = Number(num);
    return { label: `${num}${side ?? ""}`, hdg: n === 0 ? 360 : n * 10 };
  };
  return [end(match[1], match[2]), end(match[3], match[4])];
}

export function favoredRunway(
  rwy: string,
  windFrom: number | null,
  windKts: number | null,
): { label: string; hdg: number; head: number; cross: number; calm: boolean } | null {
  const ends = runwayEnds(rwy);
  if (!ends.length || windFrom == null || windKts == null) return null;
  if (windKts < 3) return { ...ends[0], head: 0, cross: 0, calm: true };
  let best = ends[0];
  let bestHead = -Infinity;
  let bestCross = 0;
  for (const end of ends) {
    const wind = windComponents(windFrom, windKts, end.hdg);
    if (wind.head > bestHead) {
      best = end;
      bestHead = wind.head;
      bestCross = wind.cross;
    }
  }
  return { ...best, head: bestHead, cross: bestCross, calm: false };
}

export function densityAltitude(elevFt: number, tempC: number, altimInHg: number) {
  const pa = elevFt + (29.92 - altimInHg) * 1000;
  const isa = 15 - (pa / 1000) * 1.98;
  const da = pa + 120 * (tempC - isa);
  return { pa, isa, da };
}

export type PerfResult = {
  pa: number;
  da: number;
  head: number;
  cross: number;
  toRoll: number;
  to50: number;
  ldgRoll: number;
  ldg50: number;
  toFactor: number;
  ldgFactor: number;
  runway: number;
  toMargin: number;
  ldgMargin: number;
};

function windTakeoffFactor(head: number, liftoff: number): number {
  if (head >= 0) return Math.max(0.55, 1 - (head / liftoff) * 0.9);
  const tail = -head;
  return Math.min(2.2, 1 + (tail / liftoff) * 2);
}

function windLandingFactor(head: number, approach: number): number {
  if (head >= 0) return Math.max(0.6, 1 - (head / approach) * 0.5);
  return Math.min(2.2, 1 + (-head / approach) * 2);
}

export function performance(input: {
  aircraft: Aircraft;
  elevFt: number;
  tempC: number;
  altimInHg: number;
  windFrom: number;
  windKts: number;
  rwyHdg: number;
  toWeight: number;
  ldgWeight: number;
  runwayFt: number;
}): PerfResult {
  const { da, pa } = densityAltitude(input.elevFt, input.tempC, input.altimInHg);
  const { head, cross } = windComponents(input.windFrom, input.windKts, input.rwyHdg);
  const daFactor = 1 + Math.max(0, da) / 10000;
  const toW = Math.max(0.5, input.toWeight / input.aircraft.refLb);
  const ldW = Math.max(0.5, input.ldgWeight / input.aircraft.refLb);
  const toFactor = daFactor * toW * toW * windTakeoffFactor(head, input.aircraft.liftoffKt);
  const ldgFactor = daFactor * ldW * windLandingFactor(head, input.aircraft.approachKt);
  const toRoll = input.aircraft.toRoll * toFactor;
  const to50 = input.aircraft.to50 * toFactor;
  const ldgRoll = input.aircraft.ldgRoll * ldgFactor;
  const ldg50 = input.aircraft.ldg50 * ldgFactor;
  const runway = input.runwayFt;
  return {
    pa,
    da,
    head,
    cross,
    toRoll,
    to50,
    ldgRoll,
    ldg50,
    toFactor,
    ldgFactor,
    runway,
    toMargin: runway > 0 ? runway / to50 : 0,
    ldgMargin: runway > 0 ? runway / ldg50 : 0,
  };
}

export type FratItem = {
  id: string;
  label: string;
  detail: string;
  points: number;
  on: boolean;
  source: "auto" | "you";
};

export function scoreFrat(input: {
  manual: FratManual;
  night: boolean;
  cross: number;
  wind: number;
  fltCat: string | null;
  runway: number;
  towered: boolean;
  mountain: boolean;
  fuelMinLeft: number;
  wbOk: boolean;
  toMargin: number;
  hours90: number;
  hoursType: number;
  nightLdg90: number;
}): { items: FratItem[]; score: number; band: "low" | "medium" | "high" } {
  const cat = (input.fltCat ?? "").toUpperCase();
  const wxPoints = cat === "LIFR" || cat === "IFR" ? 5 : cat === "MVFR" ? 3 : 0;
  const items: FratItem[] = [
    {
      id: "wx",
      label: "Destination category",
      detail: input.fltCat ? input.fltCat : "No METAR yet",
      points: wxPoints,
      on: wxPoints > 0,
      source: "auto",
    },
    {
      id: "wind",
      label: "Surface wind",
      detail: `${Math.round(input.wind)} kt`,
      points: input.wind > 15 ? 2 : 0,
      on: input.wind > 15,
      source: "auto",
    },
    {
      id: "xwind",
      label: "Crosswind",
      detail: `${input.cross.toFixed(0)} kt`,
      points: input.cross > 12 ? 4 : input.cross > 7 ? 2 : 0,
      on: input.cross > 7,
      source: "auto",
    },
    {
      id: "night",
      label: "Night departure",
      detail: input.night ? "After civil twilight" : "Before dusk",
      points: input.night ? 2 : 0,
      on: input.night,
      source: "auto",
    },
    {
      id: "rwy",
      label: "Runway length",
      detail: input.runway ? `${input.runway.toLocaleString()} ft` : "Unknown",
      points: input.runway > 0 && input.runway < 3000 ? 3 : 0,
      on: input.runway > 0 && input.runway < 3000,
      source: "auto",
    },
    {
      id: "tower",
      label: "Tower",
      detail: input.towered ? "Towered" : "Non-towered",
      points: input.towered ? 0 : 1,
      on: !input.towered,
      source: "auto",
    },
    {
      id: "mtn",
      label: "Terrain",
      detail: input.mountain ? "High or large elevation change" : "Modest terrain",
      points: input.mountain ? 2 : 0,
      on: input.mountain,
      source: "auto",
    },
    {
      id: "fuel",
      label: "Fuel after landing",
      detail: Number.isFinite(input.fuelMinLeft) ? `${Math.round(input.fuelMinLeft)} min` : "—",
      points: input.fuelMinLeft < 30 ? 5 : input.fuelMinLeft < 45 ? 3 : 0,
      on: input.fuelMinLeft < 45,
      source: "auto",
    },
    {
      id: "wb",
      label: "Weight and balance",
      detail: input.wbOk ? "Inside sample envelope" : "Outside sample envelope",
      points: input.wbOk ? 0 : 5,
      on: !input.wbOk,
      source: "auto",
    },
    {
      id: "perf",
      label: "Takeoff margin over 50 ft",
      detail: input.toMargin ? `${input.toMargin.toFixed(1)}× runway` : "No runway length",
      points: input.toMargin > 0 && input.toMargin < 1 ? 6 : input.toMargin > 0 && input.toMargin < 1.5 ? 3 : 0,
      on: input.toMargin > 0 && input.toMargin < 1.5,
      source: "auto",
    },
    {
      id: "type",
      label: "Time in this tail's type, logged here",
      detail: `${input.hoursType.toFixed(1)} hr`,
      points: input.hoursType < 50 ? 3 : 0,
      on: input.hoursType < 50,
      source: "auto",
    },
    {
      id: "recency",
      label: "Hours in the last 90 days",
      detail: `${input.hours90.toFixed(1)} hr`,
      points: input.hours90 < 15 ? 2 : 0,
      on: input.hours90 < 15,
      source: "auto",
    },
    {
      id: "nightcur",
      label: "Night landing currency",
      detail: `${input.nightLdg90} full-stop landings, 1 hour after sunset to 1 hour before sunrise, in 90 days`,
      points: input.night && input.nightLdg90 < 3 ? 4 : 0,
      on: input.night && input.nightLdg90 < 3,
      source: "auto",
    },
    you("sleep", "Less than 8 hours of sleep", input.manual.sleep, 2),
    you("illness", "IMSAFE illness", input.manual.illness, 3),
    you("medication", "IMSAFE medication", input.manual.medication, 3),
    you("stress", "IMSAFE stress", input.manual.stress, 2),
    you("alcohol", "IMSAFE alcohol within limits concern", input.manual.alcohol, 6),
    you("emotion", "IMSAFE emotion", input.manual.emotion, 2),
    you("pressure", "External pressure to go", input.manual.pressure, 3),
    you("afterWork", "Flight is after a full work day", input.manual.afterWork, 2),
  ];
  const score = items.reduce((n, item) => n + (item.on ? item.points : 0), 0);
  const band = score >= 17 ? "high" : score >= 9 ? "medium" : "low";
  return { items, score, band };
}

function you(id: string, label: string, on: boolean, points: number): FratItem {
  return { id, label, detail: on ? "Yes" : "No", points, on, source: "you" };
}

export function hoursIn(entries: LogEntry[], days: number, pick: (e: LogEntry) => number): number {
  const cut = Date.now() - days * 86400000;
  return entries.reduce((n, e) => {
    const t = new Date(`${e.date}T12:00:00`).getTime();
    return t >= cut ? n + pick(e) : n;
  }, 0);
}

export function souls(stations: Station[], loads: Record<string, number>): number {
  return stations.filter((s) => s.seat && (loads[s.id] ?? 0) >= 30).length;
}

export function hpaToInHg(hpa: number): number {
  return hpa * 0.02953;
}

export function originOf(route: string[], airports: (icao: string) => Airport | undefined): Airport | undefined {
  return route.length ? airports(route[0]) : undefined;
}
