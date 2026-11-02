import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { resolveAircraft } from "./aircraft";
import { emptyTfrs, type MetarField, type TfrPack } from "./live";
import { buildLegs, type Leg, type WindLookup } from "./nav";
import { useEfb } from "./store";
import { emptyWinds, windAt, type WindPack } from "./winds";

/** Live feeds. Not persisted: they are refetched on load. */
type LiveState = {
  tfrs: TfrPack;
  winds: WindPack;
  metars: MetarField;
  online: boolean;
  pickedTfr: string | null;
  setPickedTfr: (id: string | null) => void;
  setTfrs: (t: TfrPack) => void;
  setWinds: (w: WindPack) => void;
  setMetars: (m: MetarField) => void;
  setOnline: (on: boolean) => void;
};

export const useLive = create<LiveState>((set) => ({
  tfrs: emptyTfrs,
  winds: emptyWinds,
  metars: { stations: [], fetchedAt: null },
  online: true,
  pickedTfr: null,
  setPickedTfr: (pickedTfr) => set({ pickedTfr }),
  setTfrs: (tfrs) => set({ tfrs }),
  setWinds: (winds) => set({ winds }),
  setMetars: (metars) => set({ metars }),
  setOnline: (online) => set({ online }),
}));

function poll(url: string, everyMs: number, apply: (body: unknown) => void) {
  let cancel = false;
  const pull = () =>
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancel && b) apply(b);
      })
      .catch(() => undefined);
  pull();
  const id = setInterval(pull, everyMs);
  const onVis = () => {
    if (document.visibilityState === "visible") pull();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    cancel = true;
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
  };
}

/** Mount once: keeps TFRs, forecast winds, and the online flag fresh. */
export function LiveFeeds() {
  const showTfrs = useEfb((s) => s.showTfrs);
  const windMode = useEfb((s) => s.windMode);
  const departHour = useEfb((s) => s.departHour);

  useEffect(() => {
    if (!showTfrs) return;
    return poll("/api/airspace/tfrs", 10 * 60 * 1000, (b) => {
      const body = b as TfrPack;
      if (Array.isArray(body.tfrs)) useLive.getState().setTfrs(body);
    });
  }, [showTfrs]);

  // Pick the forecast that covers the planned departure.
  const fcst = useMemo(() => {
    const now = new Date();
    const dep = new Date(now);
    dep.setHours(departHour, 0, 0, 0);
    if (dep.getTime() < now.getTime() - 60 * 60 * 1000) dep.setDate(dep.getDate() + 1);
    const hours = (dep.getTime() - now.getTime()) / 3600000;
    return hours > 15 ? "24" : hours > 6 ? "12" : "06";
  }, [departHour]);

  useEffect(() => {
    if (windMode !== "forecast") return;
    return poll(`/api/wx/winds?fcst=${fcst}`, 30 * 60 * 1000, (b) => {
      const body = b as WindPack;
      if (Array.isArray(body.stations)) useLive.getState().setWinds(body);
    });
  }, [windMode, fcst]);

  useEffect(() => {
    const apply = () => useLive.getState().setOnline(navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  return null;
}

/** Wind lookup for the current plan, or undefined when using the manual wind. */
export function useWindLookup(): WindLookup | undefined {
  const windMode = useEfb((s) => s.windMode);
  const cruiseFt = useEfb((s) => s.aircraft.cruiseFt);
  const stations = useLive((s) => s.winds.stations);
  return useMemo(() => {
    if (windMode !== "forecast" || !stations.length) return undefined;
    return (lat: number, lon: number) => windAt(stations, lat, lon, cruiseFt);
  }, [windMode, stations, cruiseFt]);
}

/** Legs for the active plan, using forecast winds when that mode is on. */
export function useLegs(): Leg[] {
  const route = useEfb((s) => s.route);
  const rawAircraft = useEfb((s) => s.aircraft);
  const windFrom = useEfb((s) => s.windFrom);
  const windKts = useEfb((s) => s.windKts);
  const lookup = useWindLookup();
  return useMemo(
    () => buildLegs(route, resolveAircraft(rawAircraft), windFrom, windKts, lookup),
    [route, rawAircraft, windFrom, windKts, lookup],
  );
}
