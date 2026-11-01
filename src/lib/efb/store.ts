import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAirport } from "./airports";
import type { Aircraft, ChartMode, Tab } from "./types";

const defaultAircraft: Aircraft = {
  name: "Cessna 172S",
  tail: "N172EF",
  tas: 110,
  burnGph: 8.5,
  usableGal: 50,
  cruiseFt: 9500,
};

type EfbState = {
  tab: Tab;
  route: string[];
  selected: string | null;
  aircraft: Aircraft;
  windFrom: number;
  windKts: number;
  chartMode: ChartMode;
  flying: boolean;
  progressNm: number;
  lat: number;
  lon: number;
  pxPerNm: number;
  setTab: (tab: Tab) => void;
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
  setWind: (from: number, kts: number) => void;
  setChartMode: (mode: ChartMode) => void;
  setView: (lat: number, lon: number, pxPerNm?: number) => void;
  setFlying: (flying: boolean) => void;
  setProgressNm: (nm: number) => void;
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
      route: ["KAPA", "KBJC", "KLMO", "KEIK"],
      selected: "KAPA",
      aircraft: defaultAircraft,
      windFrom: 270,
      windKts: 12,
      chartMode: "night",
      flying: false,
      progressNm: 0,
      lat: 39.7,
      lon: -104.9,
      pxPerNm: 3.4,
      setTab: (tab) => set({ tab }),
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
      setAircraft: (patch) => set((s) => ({ aircraft: { ...s.aircraft, ...patch } })),
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
    }),
    {
      name: "crossefb",
      skipHydration: true,
      partialize: (s) => ({
        route: s.route,
        aircraft: s.aircraft,
        windFrom: s.windFrom,
        windKts: s.windKts,
        chartMode: s.chartMode,
      }),
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
