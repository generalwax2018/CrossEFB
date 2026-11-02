import { useEffect } from "react";
import { haversineNm, trueCourse } from "@/lib/efb/nav";
import { useEfb } from "@/lib/efb/store";
import { useTrack, type GpsFix } from "@/lib/efb/track";
import { useAdsb } from "@/lib/efb/adsb";

function courseFrom(prev: GpsFix, lat: number, lon: number): number | null {
  if (haversineNm(prev, { lat, lon }) < 0.008) return prev.track;
  return trueCourse(prev, { lat, lon });
}

export function OwnShip() {
  const tracking = useTrack((s) => s.tracking);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/chart-sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!tracking) return;
    if (!navigator.geolocation) {
      useTrack.getState().setTracking(false);
      useTrack.getState().setError("No GPS");
      return;
    }
    let prev: GpsFix | null = useTrack.getState().fix;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const lat = c.latitude;
        const lon = c.longitude;
        const moving = (c.speed ?? 0) > 1;
        const reported = c.heading != null && Number.isFinite(c.heading) && moving ? c.heading : null;
        const track = reported ?? (prev ? courseFrom(prev, lat, lon) : null);
        const fix: GpsFix = {
          lat,
          lon,
          accuracyM: Number.isFinite(c.accuracy) ? c.accuracy : 9999,
          altFt: c.altitude != null && Number.isFinite(c.altitude) ? c.altitude * 3.28084 : null,
          gsKt: c.speed != null && Number.isFinite(c.speed) ? Math.max(0, c.speed * 1.943844) : null,
          track,
        };
        prev = fix;
        useTrack.getState().setFix(fix);
        if (!useTrack.getState().follow) return;
        useEfb.getState().setView(lat, lon);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // With an ADS-B receiver connected, keep tracking on its GPS.
          if (useAdsb.getState().connected) {
            useTrack.getState().setError("");
            return;
          }
          useTrack.getState().setTracking(false);
          useTrack.getState().setError("GPS blocked");
          return;
        }
        useTrack.getState().setError("No GPS fix");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );

    let released = false;
    let sentinel: WakeLockSentinel | null = null;
    const arm = () => {
      const request = navigator.wakeLock?.request.bind(navigator.wakeLock);
      if (!request) return;
      void request("screen")
        .then((lock) => {
          if (released) void lock.release();
          else sentinel = lock;
        })
        .catch(() => undefined);
    };
    arm();
    const onVis = () => {
      if (document.visibilityState === "visible") arm();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [tracking]);

  return null;
}
