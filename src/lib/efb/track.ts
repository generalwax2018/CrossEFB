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
  error: string;
  setTracking: (on: boolean) => void;
  setFollow: (on: boolean) => void;
  setFix: (fix: GpsFix) => void;
  setError: (error: string) => void;
};

export const useTrack = create<TrackState>((set) => ({
  tracking: false,
  follow: true,
  fix: null,
  error: "",
  setTracking: (on) => set(on ? { tracking: true, follow: true, error: "" } : { tracking: false }),
  setFollow: (follow) => set({ follow }),
  setFix: (fix) => set({ fix, error: "" }),
  setError: (error) => set({ error }),
}));
