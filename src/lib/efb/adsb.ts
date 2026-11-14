import { useEffect } from "react";
import { create } from "zustand";
import { decodeDatagram, hasPosition, type TrafficTarget } from "./gdl90";
import { stratuxOwnship, stratuxTargets } from "./stratux";
import { useEfb } from "./store";
import { useTrack } from "./track";

/**
 * ADS-B traffic from a GDL 90 receiver.
 *
 * Browsers cannot open UDP sockets, so datagrams arrive from the CrossEFB
 * Android shell (android-shell/), which listens on UDP 4000 and forwards each
 * packet to the page. Any other native wrapper can do the same by calling
 *   window.CrossEFB.gdl90(base64)
 * or dispatching a "crossefb:gdl90" event whose detail is a base64 string.
 */

export type Target = TrafficTarget & { seen: number };

type AdsbState = {
  connected: boolean;
  lastPacket: number;
  gpsValid: boolean;
  ownship: Target | null;
  ownGeoAltFt: number | null;
  targets: Record<string, Target>;
  receiverNote: string;
  ingest: (bytes: Uint8Array) => void;
  prune: () => void;
};

export const useAdsb = create<AdsbState>((set, get) => ({
  connected: false,
  lastPacket: 0,
  gpsValid: false,
  ownship: null,
  ownGeoAltFt: null,
  targets: {},
  receiverNote: "",
  ingest: (bytes) => {
    const now = Date.now();
    const msgs = decodeDatagram(bytes);
    if (!msgs.length) return;
    const targets = { ...get().targets };
    let ownship = get().ownship;
    let gpsValid = get().gpsValid;
    let geo = get().ownGeoAltFt;
    for (const m of msgs) {
      if (m.kind === "heartbeat") gpsValid = m.gpsValid;
      else if (m.kind === "geoalt") geo = m.altFt;
      else if (m.kind === "ownship") ownship = { ...m, seen: now };
      else if (hasPosition(m)) targets[m.address] = { ...m, seen: now };
    }
    // Some receivers echo the ownship as traffic; drop it.
    if (ownship) delete targets[ownship.address];
    set({ connected: true, lastPacket: now, gpsValid, ownship, ownGeoAltFt: geo, targets });
  },
  prune: () => {
    const now = Date.now();
    const s = get();
    const targets: Record<string, Target> = {};
    for (const [k, t] of Object.entries(s.targets)) if (now - t.seen < 30000) targets[k] = t;
    const connected = now - s.lastPacket < 6000;
    if (Object.keys(targets).length !== Object.keys(s.targets).length || connected !== s.connected) {
      set({ targets, connected, ownship: connected ? s.ownship : null });
    }
  },
}));

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type CapPlugin = {
  start?: () => Promise<unknown>;
  addListener?: (event: string, cb: (e: { data?: string }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
};

declare global {
  interface Window {
    CrossEFB?: { gdl90: (b64: string) => void; native?: boolean };
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, CapPlugin | undefined> };
  }
}

/** Mount once. Wires native packet sources and feeds ADS-B ownship into tracking. */
export function AdsbFeed() {
  useEffect(() => {
    const ingest = (b64: string) => {
      try {
        useAdsb.getState().ingest(fromBase64(b64));
      } catch {
        /* ignore malformed packets */
      }
    };
    window.CrossEFB = { ...(window.CrossEFB ?? {}), gdl90: ingest };
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (typeof d === "string") ingest(d);
    };
    window.addEventListener("crossefb:gdl90", onEvent);

    let remove: (() => void) | null = null;
    const plugin = window.Capacitor?.Plugins?.Gdl90;
    if (plugin?.addListener) {
      window.CrossEFB.native = true;
      void Promise.resolve(plugin.addListener("packet", (e) => e.data && ingest(e.data))).then((h) => {
        remove = () => h.remove();
      });
      void plugin.start?.();
    }

    let stopped = false;
    const pollReceiver = async () => {
      if (stopped || window.CrossEFB?.native) return;
      if (location.protocol === "https:") {
        useAdsb.setState({
          receiverNote: "A secure page cannot reach a receiver on Wi-Fi. Build the Android shell in the repo and open CrossEFB from the phone.",
        });
        return;
      }
      try {
        const [tr, sit] = await Promise.all([
          fetch("http://192.168.10.1/getTraffic", { signal: AbortSignal.timeout(2000) }),
          fetch("http://192.168.10.1/getSituation", { signal: AbortSignal.timeout(2000) }),
        ]);
        if (!tr.ok) throw new Error(String(tr.status));
        const now = Date.now();
        const list = stratuxTargets(await tr.json(), now);
        const own = sit.ok ? stratuxOwnship(await sit.json(), now) : null;
        const targets: Record<string, Target> = {};
        for (const item of list) targets[item.address] = item;
        useAdsb.setState({
          connected: true,
          lastPacket: now,
          gpsValid: Boolean(own),
          targets,
          ownship: own,
          ownGeoAltFt: own?.altFt ?? null,
          receiverNote: "",
        });
      } catch {
        if (!useAdsb.getState().connected) {
          useAdsb.setState({
            receiverNote: "No Stratux at 192.168.10.1. Join its Wi-Fi, or use the Android shell for other receivers.",
          });
        }
      }
    };
    void pollReceiver();
    const poll = setInterval(() => void pollReceiver(), location.protocol === "https:" ? 60_000 : 2000);

    const tick = setInterval(() => {
      useAdsb.getState().prune();
      // Use the receiver's GPS (usually WAAS) when tracking and the device has no fresh fix.
      const a = useAdsb.getState();
      const t = useTrack.getState();
      const own = a.ownship;
      if (t.tracking && a.connected && own && hasPosition(own) && Date.now() - own.seen < 3000) {
        const deviceFresh = t.fix && t.fixAt && Date.now() - t.fixAt < 4000 && t.source === "device" && t.fix.accuracyM < 30;
        if (!deviceFresh) {
          t.setFix(
            {
              lat: own.lat,
              lon: own.lon,
              accuracyM: own.nacp >= 9 ? 10 : own.nacp >= 8 ? 30 : 100,
              altFt: a.ownGeoAltFt ?? own.altFt,
              gsKt: own.gsKt,
              track: own.track,
            },
            "adsb",
          );
          if (t.follow) useEfb.getState().setView(own.lat, own.lon);
        }
      }
    }, 1000);

    return () => {
      stopped = true;
      clearInterval(poll);
      window.removeEventListener("crossefb:gdl90", onEvent);
      remove?.();
      clearInterval(tick);
    };
  }, []);
  return null;
}
