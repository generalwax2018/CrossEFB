import { create } from "zustand";
import { relativeAttitude } from "./attitude";
import type { TrackPoint } from "./track-log";

export type GpsFix = {
  lat: number;
  lon: number;
  accuracyM: number;
  altFt: number | null;
  gsKt: number | null;
  track: number | null;
};

type TrackState = {
  tracking: boolean;
  follow: boolean;
  fix: GpsFix | null;
  fixAt: number;
  source: "device" | "adsb";
  error: string;
  crumbs: TrackPoint[];
  /** Degrees, nose up positive. Null until the phone reports tilt. */
  pitch: number | null;
  /** Degrees, right wing down positive. */
  roll: number | null;
  levelBeta: number;
  levelGamma: number;
  rawBeta: number | null;
  rawGamma: number | null;
  setTracking: (on: boolean) => void;
  setFollow: (on: boolean) => void;
  setFix: (fix: GpsFix, source?: "device" | "adsb") => void;
  setError: (error: string) => void;
  setRawAttitude: (beta: number, gamma: number) => void;
  setLevel: () => void;
};

export const useTrack = create<TrackState>((set, get) => ({
  tracking: false,
  follow: true,
  fix: null,
  fixAt: 0,
  source: "device",
  error: "",
  crumbs: [],
  pitch: null,
  roll: null,
  levelBeta: 0,
  levelGamma: 0,
  rawBeta: null,
  rawGamma: null,
  setTracking: (on) => set(on ? { tracking: true, follow: true, error: "", crumbs: [] } : { tracking: false }),
  setFollow: (follow) => set({ follow }),
  setFix: (fix, source = "device") => {
    const now = Date.now();
    const crumbs = get().crumbs;
    const last = crumbs[crumbs.length - 1];
    const next = !last || now - last.t > 15000 ? [...crumbs, { t: now, lat: fix.lat, lon: fix.lon, altFt: fix.altFt, gsKt: fix.gsKt }].slice(-1500) : crumbs;
    set({ fix, fixAt: now, source, error: "", crumbs: get().tracking ? next : crumbs });
  },
  setError: (error) => set({ error }),
  setRawAttitude: (beta, gamma) => {
    const s = get();
    const { pitch, roll } = relativeAttitude(beta, gamma, s.levelBeta, s.levelGamma);
    set({ rawBeta: beta, rawGamma: gamma, pitch, roll });
  },
  setLevel: () => {
    const s = get();
    if (s.rawBeta == null || s.rawGamma == null) return;
    set({ levelBeta: s.rawBeta, levelGamma: s.rawGamma, pitch: 0, roll: 0 });
  },
}));