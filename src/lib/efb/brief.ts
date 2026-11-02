import type { LogEntry, PilotRecord } from "./types";

/* ------------------------------------------------------------------ */
/* Currency (14 CFR 61.56 and 61.57), from the local logbook           */
/* ------------------------------------------------------------------ */

export type CurrencyItem = {
  id: string;
  label: string;
  ok: boolean | null;
  detail: string;
};

const DAY = 24 * 3600 * 1000;

function parseDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Landings-based currency: current until the 3rd most recent landing turns 90 days old. */
function landingCurrency(entries: LogEntry[], pick: (e: LogEntry) => number, now: Date) {
  const events: Date[] = [];
  for (const e of entries) {
    const d = parseDate(e.date);
    if (!d) continue;
    for (let i = 0; i < Math.max(0, Math.round(pick(e))); i++) events.push(d);
  }
  events.sort((a, b) => b.getTime() - a.getTime());
  const third = events[2];
  if (!third) return { ok: false, until: null as Date | null, count: events.filter((d) => now.getTime() - d.getTime() <= 90 * DAY).length };
  const until = new Date(third.getTime() + 90 * DAY);
  const count = events.filter((d) => now.getTime() - d.getTime() <= 90 * DAY).length;
  return { ok: until.getTime() >= now.getTime(), until, count };
}

/** End of the 24th calendar month after the review. */
function reviewDue(iso: string): Date | null {
  const d = parseDate(iso);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 25, 0, 12));
}

export function currency(entries: LogEntry[], pilot: PilotRecord, now = new Date()): CurrencyItem[] {
  const day = landingCurrency(entries, (e) => e.dayLdg + e.nightLdg, now);
  const night = landingCurrency(entries, (e) => e.nightLdg, now);
  const review = reviewDue(pilot.flightReview);
  const medical = parseDate(pilot.medicalExpires);
  return [
    {
      id: "day",
      label: "Passengers, day",
      ok: day.ok,
      detail: day.ok && day.until ? `Current until ${fmt(day.until)}` : `${day.count} of 3 landings in 90 days`,
    },
    {
      id: "night",
      label: "Passengers, night",
      ok: night.ok,
      detail: night.ok && night.until ? `Current until ${fmt(night.until)}` : `${night.count} of 3 night landings in 90 days`,
    },
    {
      id: "review",
      label: "Flight review",
      ok: review ? review.getTime() >= now.getTime() : null,
      detail: review ? `Due by ${fmt(review)}` : "Add the date of your last review",
    },
    {
      id: "medical",
      label: "Medical / BasicMed",
      ok: medical ? medical.getTime() >= now.getTime() : null,
      detail: medical ? `Valid through ${fmt(medical)}` : "Add the expiration date",
    },
  ];
}

export function logbookCsv(entries: LogEntry[]): string {
  const head = ["Date", "Aircraft", "From", "To", "Total", "Night", "Approaches", "Day landings", "Night landings", "PIC", "Student", "Dual given", "Ground", "Remarks"];
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map((e) =>
    [e.date, e.tail, e.from, e.to, e.total, e.night, e.approaches, e.dayLdg, e.nightLdg, e.pic, e.student ?? "", e.dual ?? 0, e.ground ?? 0, e.remarks].map(esc).join(","),
  );
  return [head.join(","), ...rows].join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* Plain-English go / no-go summary                                    */
/* ------------------------------------------------------------------ */

export type Verdict = "go" | "caution" | "nogo";
export type BriefItem = { level: Verdict; text: string };

export function goNoGo(input: {
  originId: string | null;
  destId: string | null;
  originCat: string | null;
  destCat: string | null;
  surfaceWind: number;
  crosswind: number;
  maxXwind: number;
  personalXwind: number;
  fuelLeftGal: number;
  reserveGal: number;
  wbOk: boolean;
  wbReason: string;
  toMargin: number;
  densityAlt: number;
  night: boolean;
  tfrIds: string[];
  currency: CurrencyItem[];
  passengers: boolean;
  /** Runway/aerodrome closures from NOTAMs at departure and destination. */
  notamAlerts?: string[];
  notamsChecked?: boolean;
}): { verdict: Verdict; items: BriefItem[]; headline: string } {
  const items: BriefItem[] = [];
  const cat = (c: string | null, where: string, id: string | null) => {
    const v = (c ?? "").toUpperCase();
    if (!id) return;
    if (v === "IFR" || v === "LIFR") items.push({ level: "nogo", text: `${id} (${where}) is ${v}. Below VFR minimums.` });
    else if (v === "MVFR") items.push({ level: "caution", text: `${id} (${where}) is marginal VFR.` });
    else if (v === "VFR") items.push({ level: "go", text: `${id} (${where}) is VFR.` });
    else items.push({ level: "caution", text: `No current METAR for ${id} (${where}). Check a nearby station.` });
  };
  cat(input.originCat, "departure", input.originId);
  if (input.destId && input.destId !== input.originId) cat(input.destCat, "destination", input.destId);

  if (input.tfrIds.length)
    items.push({ level: "nogo", text: `Route crosses TFR ${input.tfrIds.join(", ")}. Read the NOTAM and reroute or confirm it is not active.` });
  else items.push({ level: "go", text: "No TFR on the route line right now." });

  if (input.crosswind > input.maxXwind)
    items.push({ level: "nogo", text: `Crosswind ${Math.round(input.crosswind)} kt is above the ${input.maxXwind} kt demonstrated.` });
  else if (input.crosswind > input.personalXwind)
    items.push({ level: "caution", text: `Crosswind ${Math.round(input.crosswind)} kt is above your ${input.personalXwind} kt personal minimum.` });
  if (input.surfaceWind >= 20) items.push({ level: "caution", text: `Surface wind ${Math.round(input.surfaceWind)} kt.` });

  if (!input.wbOk) items.push({ level: "nogo", text: `Weight and balance: ${input.wbReason}.` });
  if (input.fuelLeftGal < input.reserveGal)
    items.push({ level: "nogo", text: `Lands with ${input.fuelLeftGal.toFixed(1)} gal, under the ${input.reserveGal.toFixed(1)} gal VFR reserve.` });
  else if (input.fuelLeftGal < input.reserveGal * 1.5)
    items.push({ level: "caution", text: `Lands with ${input.fuelLeftGal.toFixed(1)} gal. Thin margin over reserve.` });
  else items.push({ level: "go", text: `Lands with ${input.fuelLeftGal.toFixed(1)} gal.` });

  if (input.toMargin > 0 && input.toMargin < 1)
    items.push({ level: "nogo", text: "Takeoff distance over 50 ft is longer than the runway." });
  else if (input.toMargin > 0 && input.toMargin < 1.5)
    items.push({ level: "caution", text: `Runway is only ${input.toMargin.toFixed(1)}× the takeoff distance over 50 ft.` });
  if (input.densityAlt > 8000) items.push({ level: "caution", text: `Density altitude ${Math.round(input.densityAlt).toLocaleString()} ft.` });

  const get = (id: string) => input.currency.find((c) => c.id === id);
  const review = get("review");
  const medical = get("medical");
  if (review?.ok === false) items.push({ level: "nogo", text: "Flight review is past due." });
  if (medical?.ok === false) items.push({ level: "nogo", text: "Medical or BasicMed has lapsed." });
  if (input.passengers) {
    const need = input.night ? get("night") : get("day");
    if (need && need.ok === false)
      items.push({ level: "nogo", text: `Not ${input.night ? "night" : "day"} current to carry passengers (${need.detail}).` });
  }
  if (input.night) items.push({ level: "caution", text: "Departure is after civil twilight." });
  for (const a of (input.notamAlerts ?? []).slice(0, 4)) items.push({ level: "caution", text: `NOTAM ${a.slice(0, 140)}` });
  if (!input.notamsChecked) items.push({ level: "caution", text: "NOTAMs not checked here. Read them in the official briefing." });

  const verdict: Verdict = items.some((i) => i.level === "nogo") ? "nogo" : items.some((i) => i.level === "caution") ? "caution" : "go";
  const order: Record<Verdict, number> = { nogo: 0, caution: 1, go: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  const n = items.filter((i) => i.level === verdict).length;
  const headline =
    verdict === "nogo"
      ? `No-go as planned: ${n} item${n === 1 ? "" : "s"} must change.`
      : verdict === "caution"
        ? `Go with caution: ${n} item${n === 1 ? "" : "s"} to brief.`
        : "Nothing in the plan stands out. Still read the full briefing.";
  return { verdict, items, headline };
}
