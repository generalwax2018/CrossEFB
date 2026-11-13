import type { Aircraft, ChartMode, DocId, FratManual, LogEntry, PilotRecord, Rental, SavedPlan, Student, WindMode } from "./types";

const CHARTS = ["night", "day", "red", "green", "yellow"] as const;
const BASES = ["sectional", "tac", "ifrlow", "ifrhigh"] as const;
const WINDS = ["manual", "forecast"] as const;
const DOCS = ["navlog", "wb", "perf", "brief", "frat", "checks", "log", "students", "rental"] as const;

function num(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.slice(0, max);
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function routeOf(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || !/^[A-Z0-9]{3,4}$/.test(id.toUpperCase())) continue;
    const up = id.toUpperCase();
    if (out[out.length - 1] !== up) out.push(up);
    if (out.length >= 12) break;
  }
  return out;
}

function logEntry(v: unknown): LogEntry | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const id = str(e.id, 40);
  const date = str(e.date, 10);
  if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const n = (k: string, max: number) => num(e[k], 0, max) ?? 0;
  return {
    id,
    date,
    from: (str(e.from, 4) ?? "").toUpperCase(),
    to: (str(e.to, 4) ?? "").toUpperCase(),
    total: n("total", 24),
    night: n("night", 24),
    approaches: n("approaches", 40),
    dayLdg: n("dayLdg", 40),
    nightLdg: n("nightLdg", 40),
    nightFullStop: n("nightFullStop", 40),
    pic: str(e.pic, 80) ?? "",
    remarks: str(e.remarks, 400) ?? "",
    tail: (str(e.tail, 10) ?? "").toUpperCase(),
    studentId: str(e.studentId, 40) ?? "",
    student: str(e.student, 80) ?? "",
    dual: n("dual", 24),
    ground: n("ground", 24),
  };
}

function studentOf(v: unknown): Student | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const id = str(s.id, 40);
  const name = str(s.name, 80);
  if (!id || !name) return null;
  return { id, name, note: str(s.note, 200) ?? "" };
}

function planOf(v: unknown): SavedPlan | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const id = str(p.id, 40);
  const name = str(p.name, 80);
  const route = routeOf(p.route);
  if (!id || !name || !route) return null;
  return {
    id,
    name,
    route,
    windFrom: num(p.windFrom, 0, 360) ?? 0,
    windKts: num(p.windKts, 0, 120) ?? 0,
    aircraftId: str(p.aircraftId, 40) ?? "",
    savedAt: str(p.savedAt, 40) ?? "",
  };
}

/** Drop the sync code before a backup file is written. */
export function backupState(state: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...state };
  delete copy.syncKey;
  return copy;
}

export type RestoredState = {
  windMode?: WindMode;
  baseChart?: (typeof BASES)[number];
  showRadar?: boolean;
  showTraffic?: boolean;
  showTfrs?: boolean;
  showMetars?: boolean;
  showGlide?: boolean;
  showAdvisories?: boolean;
  instructor?: boolean;
  plans?: SavedPlan[];
  myAircraft?: Aircraft[];
  pilot?: Partial<PilotRecord>;
  route?: string[];
  aircraft?: Aircraft;
  loads?: Record<string, number>;
  fuelGal?: number;
  windFrom?: number;
  windKts?: number;
  chartMode?: ChartMode;
  departHour?: number;
  fratManual?: Partial<FratManual>;
  fratNote?: string;
  checks?: Record<string, boolean>;
  logbook?: LogEntry[];
  students?: Student[];
  activeStudent?: string;
  rental?: Partial<Rental>;
  doc?: DocId;
};

/** Keep only known fields. The sync code is never restored from a file. */
export function pickBackup(state: Record<string, unknown>): RestoredState {
  const out: RestoredState = {};
  const windMode = oneOf(state.windMode, WINDS);
  if (windMode) out.windMode = windMode;
  const baseChart = oneOf(state.baseChart, BASES);
  if (baseChart) out.baseChart = baseChart;
  const chartMode = oneOf(state.chartMode, CHARTS);
  if (chartMode) out.chartMode = chartMode;
  const doc = oneOf(state.doc, DOCS);
  if (doc) out.doc = doc;
  for (const key of ["showRadar", "showTraffic", "showTfrs", "showMetars", "showGlide", "showAdvisories", "instructor"] as const) {
    const v = bool(state[key]);
    if (v !== undefined) out[key] = v;
  }
  const route = routeOf(state.route);
  if (route) out.route = route;
  const fuelGal = num(state.fuelGal, 0, 200);
  if (fuelGal !== undefined) out.fuelGal = fuelGal;
  const windFrom = num(state.windFrom, 0, 360);
  if (windFrom !== undefined) out.windFrom = windFrom;
  const windKts = num(state.windKts, 0, 120);
  if (windKts !== undefined) out.windKts = windKts;
  const departHour = num(state.departHour, 0, 23);
  if (departHour !== undefined) out.departHour = Math.round(departHour);
  const fratNote = str(state.fratNote, 500);
  if (fratNote !== undefined) out.fratNote = fratNote;
  const activeStudent = str(state.activeStudent, 40);
  if (activeStudent !== undefined) out.activeStudent = activeStudent;

  if (state.pilot && typeof state.pilot === "object") {
    const p = state.pilot as Record<string, unknown>;
    out.pilot = {
      name: str(p.name, 80) ?? "",
      flightReview: str(p.flightReview, 10) ?? "",
      medicalExpires: str(p.medicalExpires, 10) ?? "",
      xwindMin: num(p.xwindMin, 0, 40) ?? 12,
    };
  }
  if (state.fratManual && typeof state.fratManual === "object") {
    const m = state.fratManual as Record<string, unknown>;
    const manual: Partial<FratManual> = {};
    for (const k of ["sleep", "illness", "medication", "stress", "alcohol", "emotion", "pressure", "afterWork"] as const) {
      const v = bool(m[k]);
      if (v !== undefined) manual[k] = v;
    }
    out.fratManual = manual;
  }
  if (state.loads && typeof state.loads === "object" && !Array.isArray(state.loads)) {
    const loads: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.loads as Record<string, unknown>)) {
      const n = num(v, 0, 800);
      if (n !== undefined && /^[a-z0-9-]{1,40}$/i.test(k)) loads[k] = n;
    }
    out.loads = loads;
  }
  if (state.checks && typeof state.checks === "object" && !Array.isArray(state.checks)) {
    const checks: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(state.checks as Record<string, unknown>)) {
      if (typeof v === "boolean" && /^[a-z0-9-]{1,40}$/i.test(k)) checks[k] = v;
    }
    out.checks = checks;
  }
  if (state.rental && typeof state.rental === "object") {
    const r = state.rental as Record<string, unknown>;
    out.rental = {
      pic: str(r.pic, 80) ?? "",
      hobbsOut: num(r.hobbsOut, 0, 99999) ?? 0,
      hobbsIn: num(r.hobbsIn, 0, 99999) ?? 0,
      tachOut: num(r.tachOut, 0, 99999) ?? 0,
      tachIn: num(r.tachIn, 0, 99999) ?? 0,
      fuelOut: num(r.fuelOut, 0, 200) ?? 0,
      fuelIn: num(r.fuelIn, 0, 200) ?? 0,
      oilQt: num(r.oilQt, 0, 20) ?? 0,
      squawk: str(r.squawk, 400) ?? "",
    };
  }
  if (state.aircraft && typeof state.aircraft === "object") out.aircraft = state.aircraft as Aircraft;
  if (Array.isArray(state.myAircraft)) out.myAircraft = state.myAircraft.filter((a) => a && typeof a === "object").slice(0, 30) as Aircraft[];
  if (Array.isArray(state.plans)) out.plans = state.plans.map(planOf).filter((p): p is SavedPlan => Boolean(p)).slice(0, 50);
  if (Array.isArray(state.logbook)) out.logbook = state.logbook.map(logEntry).filter((e): e is LogEntry => Boolean(e)).slice(0, 2000);
  if (Array.isArray(state.students)) out.students = state.students.map(studentOf).filter((s): s is Student => Boolean(s)).slice(0, 200);
  return out;
}
