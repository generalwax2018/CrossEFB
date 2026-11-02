import { create } from "zustand";

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
  setTracking: (on: boolean) => void;
  setFollow: (on: boolean) => void;
  setFix: (fix: GpsFix, source?: "device" | "adsb") => void;
  setError: (error: string) => void;
};

export const useTrack = create<TrackState>((set) => ({
  tracking: false,
  follow: true,
  fix: null,
  fixAt: 0,
  source: "device",
  error: "",
  setTracking: (on) => set(on ? { tracking: true, follow: true, error: "" } : { tracking: false }),
  setFollow: (follow) => set({ follow }),
  setFix: (fix, source = "device") => set({ fix, fixAt: Date.now(), source, error: "" }),
  setError: (error) => set({ error }),
}));
