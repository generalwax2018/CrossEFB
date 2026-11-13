import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOADS, isCustomId, profileById, resolveAircraft } from "./aircraft";
import { getAirport } from "./airports";
import { buildLegs, totals } from "./nav";
import { isLocalNight } from "./sun";
import { pickBackup } from "./backup";
import type { BaseChart } from "./layers";
import type { Aircraft, ChartMode, DocId, FratManual, LogEntry, PilotRecord, Rental, SavedPlan, Student, Tab, WindMode } from "./types";

const emptyManual: FratManual = {
  sleep: false,
  illness: false,
  medication: false,
  stress: false,
  alcohol: false,
  emotion: false,
  pressure: false,
  afterWork: false,
};

const SAMPLE_LOG_IDS = new Set(["log-pattern", "log-ils", "log-mtn"]);

function cleanLog(entries: LogEntry[] | undefined): LogEntry[] {
  if (!entries?.length) return [];
  return entries
    .filter((entry) => entry && !SAMPLE_LOG_IDS.has(entry.id))
    .map((entry) => ({
      ...entry,
      studentId: entry.studentId ?? "",
      student: entry.student ?? "",
      dual: typeof entry.dual === "number" ? entry.dual : 0,
      ground: typeof entry.ground === "number" ? entry.ground : 0,
      nightFullStop: typeof entry.nightFullStop === "number" ? entry.nightFullStop : 0,
    }));
}

function cleanStudents(entries: Student[] | undefined): Student[] {
  if (!entries?.length) return [];
  return entries.filter((student) => Boolean(student?.id && student.name));
}

const defaultRental: Rental = {
  pic: "",
  hobbsOut: 2412.4,
  hobbsIn: 0,
  tachOut: 1988.1,
  tachIn: 0,
  fuelOut: 40,
  fuelIn: 0,
  oilQt: 6,
  squawk: "",
};

const defaultPilot: PilotRecord = { name: "", flightReview: "", medicalExpires: "", xwindMin: 12 };

type EfbState = {
  windMode: WindMode;
  baseChart: BaseChart;
  showRadar: boolean;
  showTraffic: boolean;
  syncKey: string;
  platesFor: string | null;
  setBaseChart: (c: BaseChart) => void;
  setSyncKey: (key: string) => void;
  setPlatesFor: (icao: string | null) => void;
  showTfrs: boolean;
  showMetars: boolean;
  showGlide: boolean;
  plans: SavedPlan[];
  myAircraft: Aircraft[];
  pilot: PilotRecord;
  nearestOpen: boolean;
  setWindMode: (mode: WindMode) => void;
  setLayer: (layer: "showTfrs" | "showMetars" | "showGlide" | "showRadar" | "showTraffic", on: boolean) => void;
  savePlan: (name: string) => void;
  loadPlan: (id: string) => void;
  deletePlan: (id: string) => void;
  saveMyAircraft: () => void;
  deleteMyAircraft: (profileId: string) => void;
  setPilot: (patch: Partial<PilotRecord>) => void;
  setNearestOpen: (open: boolean) => void;
  /** Replace saved data from a backup file. Returns false if it was not a CrossEFB backup. */
  restore: (data: unknown, opts?: { keepUi?: boolean }) => boolean;
  tab: Tab;
  doc: DocId;
  route: string[];
  selected: string | null;
  aircraft: Aircraft;
  loads: Record<string, number>;
  fuelGal: number;
  windFrom: number;
  windKts: number;
  chartMode: ChartMode;
  showAdvisories: boolean;
  flying: boolean;
  progressNm: number;
  lat: number;
  lon: number;
  pxPerNm: number;
  departHour: number;
  tempC: number | null;
  altimInHg: number | null;
  rwyHdg: number | null;
  fratManual: FratManual;
  fratNote: string;
  checks: Record<string, boolean>;
  logbook: LogEntry[];
  instructor: boolean;
  students: Student[];
  activeStudent: string;
  rental: Rental;
  setTab: (tab: Tab) => void;
  setDoc: (doc: DocId) => void;
  select: (icao: string | null) => void;
  focus: (icao: string) => void;
  setRoute: (route: string[]) => void;
  setOrigin: (icao: string) => void;
  setDest: (icao: string) => void;
  addStop: (icao: string) => void;
  insertAt: (index: number, icao: string) => void;
  directTo: (icao: string) => void;
  removeAt: (index: number) => void;
  move: (index: number, dir: -1 | 1) => void;
  setAircraft: (patch: Partial<Aircraft>) => void;
  applyProfile: (profileId: string) => void;
  setLoad: (id: string, lb: number) => void;
  setFuelGal: (gal: number) => void;
  setWind: (from: number, kts: number) => void;
  setChartMode: (mode: ChartMode) => void;
  setShowAdvisories: (show: boolean) => void;
  setView: (lat: number, lon: number, pxPerNm?: number) => void;
  setFlying: (flying: boolean) => void;
  setProgressNm: (nm: number) => void;
  setDepartHour: (hour: number) => void;
  setTempC: (temp: number | null) => void;
  setAltim: (altim: number | null) => void;
  setRwyHdg: (hdg: number | null) => void;
  setFratManual: (patch: Partial<FratManual>) => void;
  setFratNote: (note: string) => void;
  toggleCheck: (id: string) => void;
  resetChecks: () => void;
  draftLog: () => void;
  addLog: () => void;
  updateLog: (id: string, patch: Partial<LogEntry>) => void;
  removeLog: (id: string) => void;
  setInstructor: (on: boolean) => void;
  addStudent: (name: string, note: string) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  setActiveStudent: (id: string) => void;
  setRental: (patch: Partial<Rental>) => void;
};

function cleanRoute(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const up = id.toUpperCase();
    if (out[out.length - 1] !== up) out.push(up);
  }
  return out;
}

export const useEfb = create<EfbState>()(
  persist(
    (set) => ({
      windMode: "manual",
      baseChart: "sectional",
      showRadar: false,
      showTraffic: true,
      syncKey: "",
      platesFor: null,
      setBaseChart: (baseChart) => set({ baseChart }),
      setSyncKey: (syncKey) => set({ syncKey }),
      setPlatesFor: (platesFor) => set({ platesFor }),
      showTfrs: true,
      showMetars: true,
      showGlide: true,
      plans: [],
      myAircraft: [],
      pilot: defaultPilot,
      nearestOpen: false,
      setWindMode: (windMode) => set({ windMode }),
      setLayer: (layer, on) => set({ [layer]: on } as Partial<EfbState>),
      savePlan: (name) =>
        set((s) => {
          const label = name.trim() || `${s.route[0] ?? ""} → ${s.route[s.route.length - 1] ?? ""}`;
          const plan: SavedPlan = {
            id: `plan-${Date.now()}`,
            name: label,
            route: s.route.slice(),
            windFrom: s.windFrom,
            windKts: s.windKts,
            aircraftId: s.aircraft.profileId,
            savedAt: new Date().toISOString(),
          };
          const rest = s.plans.filter((p) => p.name !== label);
          return { plans: [plan, ...rest].slice(0, 50) };
        }),
      loadPlan: (id) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === id);
          if (!plan) return {};
          const own = s.myAircraft.find((a) => a.profileId === plan.aircraftId);
          const aircraft = own
            ? own
            : plan.aircraftId && plan.aircraftId !== s.aircraft.profileId && !isCustomId(plan.aircraftId)
              ? { ...profileById(plan.aircraftId), tail: s.aircraft.tail }
              : s.aircraft;
          return {
            route: cleanRoute(plan.route),
            windFrom: plan.windFrom,
            windKts: plan.windKts,
            aircraft,
            selected: plan.route[0] ?? null,
            flying: false,
            progressNm: 0,
          };
        }),
      deletePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),
      saveMyAircraft: () =>
        set((s) => {
          const current = resolveAircraft(s.aircraft);
          const id = isCustomId(current.profileId) ? current.profileId : `my-${Date.now()}`;
          const saved: Aircraft = { ...current, profileId: id };
          const rest = s.myAircraft.filter((a) => a.profileId !== id);
          return { aircraft: saved, myAircraft: [saved, ...rest].slice(0, 30) };
        }),
      deleteMyAircraft: (profileId) =>
        set((s) => ({
          myAircraft: s.myAircraft.filter((a) => a.profileId !== profileId),
          aircraft: s.aircraft.profileId === profileId ? { ...s.aircraft, profileId: "c172s" } : s.aircraft,
        })),
      setPilot: (patch) => set((s) => ({ pilot: { ...s.pilot, ...patch } })),
      setNearestOpen: (nearestOpen) => set({ nearestOpen }),
      restore: (data, opts) => {
        const body = data as { app?: string; state?: Record<string, unknown> } | null;
        if (!body || body.app !== "crossefb" || typeof body.state !== "object" || !body.state || Array.isArray(body.state)) return false;
        const st = pickBackup(body.state);
        set((s) => ({
          ...s,
          ...st,
          syncKey: s.syncKey,
          aircraft: resolveAircraft(st.aircraft ?? s.aircraft),
          myAircraft: st.myAircraft ? st.myAircraft.map((a) => resolveAircraft(a)) : s.myAircraft,
          pilot: { ...defaultPilot, ...s.pilot, ...st.pilot },
          loads: st.loads ? { ...DEFAULT_LOADS, ...st.loads } : s.loads,
          fratManual: st.fratManual ? { ...emptyManual, ...st.fratManual } : s.fratManual,
          rental: st.rental ? { ...defaultRental, ...st.rental } : s.rental,
          logbook: st.logbook ? cleanLog(st.logbook) : s.logbook,
          students: st.students ? cleanStudents(st.students) : s.students,
          tab: opts?.keepUi ? s.tab : "chart",
          doc: opts?.keepUi ? s.doc : (st.doc ?? s.doc),
          lat: s.lat,
          lon: s.lon,
          pxPerNm: s.pxPerNm,
          flying: false,
          progressNm: 0,
        }));
        return true;
      },
      tab: "chart",
      doc: "navlog",
      route: ["KAPA", "KBJC", "KLMO", "KEIK"],
      selected: "KAPA",
      aircraft: profileById("c172s"),
      loads: { ...DEFAULT_LOADS },
      fuelGal: 40,
      windFrom: 270,
      windKts: 12,
      chartMode: "night",
      showAdvisories: true,
      flying: false,
      progressNm: 0,
      lat: 39.7,
      lon: -104.9,
      pxPerNm: 3.4,
      departHour: 10,
      tempC: null,
      altimInHg: null,
      rwyHdg: null,
      fratManual: emptyManual,
      fratNote: "",
      checks: {},
      logbook: [],
      instructor: false,
      students: [],
      activeStudent: "",
      rental: defaultRental,
      setTab: (tab) => set({ tab }),
      setDoc: (doc) => set({ doc, tab: "docs" }),
      select: (icao) => set({ selected: icao }),
      focus: (icao) => {
        const a = getAirport(icao);
        if (!a) return;
        set((s) => ({
          selected: a.icao,
          lat: a.lat,
          lon: a.lon,
          pxPerNm: Math.max(s.pxPerNm, 2.8),
        }));
      },
      setRoute: (route) => set({ route: cleanRoute(route), flying: false, progressNm: 0 }),
      setOrigin: (icao) =>
        set((s) => {
          const id = icao.toUpperCase();
          const rest = s.route.filter((x) => x !== id);
          return { route: [id, ...rest], selected: id, flying: false, progressNm: 0 };
        }),
      setDest: (icao) =>
        set((s) => {
          const id = icao.toUpperCase();
          if (s.route.length === 0) {
            return { route: [id], selected: id, flying: false, progressNm: 0 };
          }
          const kept = s.route.slice(0, -1).filter((x) => x !== id);
          const route = cleanRoute(kept.length ? [...kept, id] : [id]);
          return { route, selected: id, flying: false, progressNm: 0 };
        }),
      addStop: (icao) =>
        set((s) => {
          const id = icao.toUpperCase();
          return {
            route: cleanRoute([...s.route, id]),
            selected: id,
            flying: false,
            progressNm: 0,
          };
        }),
      insertAt: (index, icao) =>
        set((s) => {
          const id = icao.toUpperCase();
          const route = s.route.slice();
          const at = Math.max(0, Math.min(index, route.length));
          route.splice(at, 0, id);
          return { route: cleanRoute(route), selected: id, flying: false, progressNm: 0 };
        }),
      directTo: (icao) =>
        set((s) => {
          const id = icao.toUpperCase();
          const from = s.route[0];
          const route = from && from !== id ? [from, id] : [id];
          return { route, selected: id, flying: false, progressNm: 0, tab: "chart" };
        }),
      removeAt: (index) =>
        set((s) => ({
          route: s.route.filter((_, i) => i !== index),
          flying: false,
          progressNm: 0,
        })),
      move: (index, dir) =>
        set((s) => {
          const j = index + dir;
          if (j < 0 || j >= s.route.length) return {};
          const route = s.route.slice();
          const [item] = route.splice(index, 1);
          route.splice(j, 0, item);
          return { route: cleanRoute(route), flying: false, progressNm: 0 };
        }),
      setAircraft: (patch) => set((s) => ({ aircraft: { ...resolveAircraft(s.aircraft), ...patch } })),
      applyProfile: (profileId) =>
        set((s) => {
          const own = s.myAircraft.find((a) => a.profileId === profileId);
          if (own) return { aircraft: resolveAircraft(own), loads: { ...DEFAULT_LOADS } };
          return {
            aircraft: { ...profileById(profileId), tail: s.aircraft.tail || profileById(profileId).tail },
            loads: { ...DEFAULT_LOADS },
          };
        }),
      setLoad: (id, lb) => set((s) => ({ loads: { ...s.loads, [id]: clamp(lb, 0, 800) } })),
      setFuelGal: (fuelGal) => set({ fuelGal: clamp(fuelGal, 0, 200) }),
      setWind: (windFrom, windKts) =>
        set({
          windFrom: wrap(windFrom),
          windKts: clamp(windKts, 0, 120),
        }),
      setChartMode: (chartMode) => set({ chartMode }),
      setShowAdvisories: (showAdvisories) => set({ showAdvisories }),
      setView: (lat, lon, pxPerNm) =>
        set((s) => ({
          lat,
          lon,
          pxPerNm: pxPerNm === undefined ? s.pxPerNm : clamp(pxPerNm, 0.35, 48),
        })),
      setFlying: (flying) => set({ flying }),
      setProgressNm: (progressNm) => set({ progressNm }),
      setDepartHour: (departHour) => set({ departHour: clamp(Math.round(departHour), 0, 23) }),
      setTempC: (tempC) => set({ tempC }),
      setAltim: (altimInHg) => set({ altimInHg }),
      setRwyHdg: (rwyHdg) => set({ rwyHdg }),
      setFratManual: (patch) => set((s) => ({ fratManual: { ...s.fratManual, ...patch } })),
      setFratNote: (fratNote) => set({ fratNote }),
      toggleCheck: (id) => set((s) => ({ checks: { ...s.checks, [id]: !s.checks[id] } })),
      resetChecks: () => set({ checks: {} }),
      draftLog: () =>
        set((s) => {
          const aircraft = resolveAircraft(s.aircraft);
          const legs = buildLegs(s.route, aircraft, s.windFrom, s.windKts);
          const sum = totals(legs);
          const origin = getAirport(s.route[0] ?? "");
          const night = origin ? isLocalNight(origin.lat, origin.lon, s.departHour) : s.departHour >= 19 || s.departHour < 6;
          const hours = Math.round((sum.min / 60) * 10) / 10 || 0;
          const student = s.instructor ? s.students.find((st) => st.id === s.activeStudent) : undefined;
          const entry: LogEntry = {
            id: `log-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            from: s.route[0] ?? "",
            to: s.route[s.route.length - 1] ?? "",
            total: hours,
            night: night ? hours : 0,
            approaches: 0,
            dayLdg: night ? 0 : 1,
            nightLdg: night ? 1 : 0,
            nightFullStop: 0,
            pic: s.rental.pic,
            remarks: s.route.join(" "),
            tail: aircraft.tail,
            studentId: student?.id ?? "",
            student: student?.name ?? "",
            dual: student ? hours : 0,
            ground: 0,
          };
          return { logbook: [entry, ...s.logbook], doc: "log" };
        }),
      addLog: () =>
        set((s) => {
          const student = s.instructor ? s.students.find((st) => st.id === s.activeStudent) : undefined;
          const entry: LogEntry = {
            id: `log-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            from: "",
            to: "",
            total: 0,
            night: 0,
            approaches: 0,
            dayLdg: 0,
            nightLdg: 0,
            nightFullStop: 0,
            pic: s.rental.pic,
            remarks: "",
            tail: resolveAircraft(s.aircraft).tail,
            studentId: student?.id ?? "",
            student: student?.name ?? "",
            dual: 0,
            ground: 0,
          };
          return { logbook: [entry, ...s.logbook], doc: "log" };
        }),
      updateLog: (id, patch) =>
        set((s) => ({
          logbook: s.logbook.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeLog: (id) => set((s) => ({ logbook: s.logbook.filter((e) => e.id !== id) })),
      setInstructor: (instructor) => set({ instructor }),
      addStudent: (name, note) =>
        set((s) => {
          const trimmed = name.trim();
          if (!trimmed) return s;
          const student = { id: `stu-${Date.now()}`, name: trimmed, note: note.trim() };
          return { students: [student, ...s.students], activeStudent: student.id, instructor: true };
        }),
      updateStudent: (id, patch) =>
        set((s) => {
          const students = s.students.map((student) => (student.id === id ? { ...student, ...patch } : student));
          const name = students.find((student) => student.id === id)?.name;
          const logbook =
            patch.name && name
              ? s.logbook.map((entry) => (entry.studentId === id ? { ...entry, student: name } : entry))
              : s.logbook;
          return { students, logbook };
        }),
      removeStudent: (id) =>
        set((s) => ({
          students: s.students.filter((student) => student.id !== id),
          activeStudent: s.activeStudent === id ? "" : s.activeStudent,
        })),
      setActiveStudent: (activeStudent) => set({ activeStudent }),
      setRental: (patch) => set((s) => ({ rental: { ...s.rental, ...patch } })),
    }),
    {
      name: "crossefb",
      skipHydration: true,
      partialize: (s) => ({
        windMode: s.windMode,
        baseChart: s.baseChart,
        showRadar: s.showRadar,
        showTraffic: s.showTraffic,
        syncKey: s.syncKey,
        showTfrs: s.showTfrs,
        showMetars: s.showMetars,
        showGlide: s.showGlide,
        showAdvisories: s.showAdvisories,
        plans: s.plans,
        myAircraft: s.myAircraft,
        pilot: s.pilot,
        route: s.route,
        aircraft: s.aircraft,
        loads: s.loads,
        fuelGal: s.fuelGal,
        windFrom: s.windFrom,
        windKts: s.windKts,
        chartMode: s.chartMode,
        departHour: s.departHour,
        fratManual: s.fratManual,
        fratNote: s.fratNote,
        checks: s.checks,
        logbook: s.logbook,
        instructor: s.instructor,
        students: s.students,
        activeStudent: s.activeStudent,
        rental: s.rental,
        doc: s.doc,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<EfbState>;
        return {
          ...current,
          ...saved,
          aircraft: resolveAircraft(saved.aircraft ?? current.aircraft),
          loads: { ...DEFAULT_LOADS, ...saved.loads },
          fratManual: { ...emptyManual, ...saved.fratManual },
          rental: { ...defaultRental, ...saved.rental },
          pilot: { ...defaultPilot, ...saved.pilot },
          plans: Array.isArray(saved.plans) ? saved.plans : [],
          myAircraft: Array.isArray(saved.myAircraft) ? saved.myAircraft.map((a) => resolveAircraft(a)) : [],
          nearestOpen: false,
          platesFor: null,
          checks: saved.checks ?? {},
          logbook: cleanLog(saved.logbook ?? current.logbook),
          instructor: Boolean(saved.instructor),
          students: cleanStudents(saved.students),
          activeStudent: saved.activeStudent ?? "",
          tab: "chart",
          flying: false,
          progressNm: 0,
        };
      },
    },
  ),
);

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function wrap(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % 360) + 360) % 360;
}
