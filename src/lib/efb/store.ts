import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOADS, profileById, resolveAircraft } from "./aircraft";
import { getAirport } from "./airports";
import { buildLegs, totals } from "./nav";
import type { Aircraft, ChartMode, DocId, FratManual, LogEntry, Rental, Tab } from "./types";

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

const seedLog: LogEntry[] = [
  {
    id: "log-pattern",
    date: "2026-10-18",
    from: "KAPA",
    to: "KBJC",
    total: 1.2,
    night: 0,
    approaches: 0,
    dayLdg: 3,
    nightLdg: 0,
    pic: "Self",
    remarks: "Pattern work",
    tail: "N172EF",
  },
  {
    id: "log-ils",
    date: "2026-09-02",
    from: "KAPA",
    to: "KCOS",
    total: 1.6,
    night: 0.4,
    approaches: 1,
    dayLdg: 1,
    nightLdg: 1,
    pic: "Self",
    remarks: "Practice approach",
    tail: "N172EF",
  },
  {
    id: "log-mtn",
    date: "2026-06-11",
    from: "KAPA",
    to: "KEGE",
    total: 1.8,
    night: 0,
    approaches: 0,
    dayLdg: 1,
    nightLdg: 0,
    pic: "Self",
    remarks: "Mountain checkout",
    tail: "N172EF",
  },
];

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

type EfbState = {
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
  rental: Rental;
  setTab: (tab: Tab) => void;
  setDoc: (doc: DocId) => void;
  select: (icao: string | null) => void;
  focus: (icao: string) => void;
  setRoute: (route: string[]) => void;
  setOrigin: (icao: string) => void;
  setDest: (icao: string) => void;
  addStop: (icao: string) => void;
  directTo: (icao: string) => void;
  removeAt: (index: number) => void;
  move: (index: number, dir: -1 | 1) => void;
  setAircraft: (patch: Partial<Aircraft>) => void;
  applyProfile: (profileId: string) => void;
  setLoad: (id: string, lb: number) => void;
  setFuelGal: (gal: number) => void;
  setWind: (from: number, kts: number) => void;
  setChartMode: (mode: ChartMode) => void;
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
  updateLog: (id: string, patch: Partial<LogEntry>) => void;
  removeLog: (id: string) => void;
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
      logbook: seedLog,
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
        set((s) => ({
          aircraft: { ...profileById(profileId), tail: s.aircraft.tail || profileById(profileId).tail },
          loads: { ...DEFAULT_LOADS },
        })),
      setLoad: (id, lb) => set((s) => ({ loads: { ...s.loads, [id]: clamp(lb, 0, 800) } })),
      setFuelGal: (fuelGal) => set({ fuelGal: clamp(fuelGal, 0, 200) }),
      setWind: (windFrom, windKts) =>
        set({
          windFrom: wrap(windFrom),
          windKts: clamp(windKts, 0, 120),
        }),
      setChartMode: (chartMode) => set({ chartMode }),
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
          const entry: LogEntry = {
            id: `log-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            from: s.route[0] ?? "",
            to: s.route[s.route.length - 1] ?? "",
            total: Math.round((sum.min / 60) * 10) / 10 || 0,
            night: s.departHour >= 19 || s.departHour < 6 ? Math.round((sum.min / 60) * 10) / 10 : 0,
            approaches: 0,
            dayLdg: s.departHour >= 19 || s.departHour < 6 ? 0 : 1,
            nightLdg: s.departHour >= 19 || s.departHour < 6 ? 1 : 0,
            pic: s.rental.pic || "Self",
            remarks: s.route.join(" "),
            tail: aircraft.tail,
          };
          return { logbook: [entry, ...s.logbook], doc: "log" };
        }),
      updateLog: (id, patch) =>
        set((s) => ({
          logbook: s.logbook.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeLog: (id) => set((s) => ({ logbook: s.logbook.filter((e) => e.id !== id) })),
      setRental: (patch) => set((s) => ({ rental: { ...s.rental, ...patch } })),
    }),
    {
      name: "crossefb",
      skipHydration: true,
      partialize: (s) => ({
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
          checks: saved.checks ?? {},
          logbook: saved.logbook?.length ? saved.logbook : current.logbook,
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
