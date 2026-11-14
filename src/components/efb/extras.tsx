import { useEffect, useRef, useState } from "react";
import { backupState } from "@/lib/efb/backup";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  HardDriveDownload,
  Navigation,
  RefreshCcw,
  Save,
  Siren,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { getAirport } from "@/lib/efb/airports";
import { dtppCycle } from "@/lib/efb/plates";
import { BASE_CHARTS, FAA_LAYERS, RADAR_META, boxTiles, type BaseChart } from "@/lib/efb/layers";
import { runwayFeet } from "@/lib/efb/docs";
import { useLive } from "@/lib/efb/live-store";
import { useNotams } from "@/lib/efb/use-notams";
import { newSyncCode, normalizeCode } from "@/lib/efb/sync";
import { resetSyncRev, useSyncStatus } from "@/lib/efb/sync-engine";
import { fmtMin, fmtNm, haversineNm, hdgText, magCourse, nearestAirports, trueCourse } from "@/lib/efb/nav";
import { useAdsb } from "@/lib/efb/adsb";
import { useEfb } from "@/lib/efb/store";
import { useTrack } from "@/lib/efb/track";
import type { Airport } from "@/lib/efb/types";
import { fitAirports } from "./chart";
import { Btn, Card, cx, IconBtn, SectionTitle, Segmented, Toggle } from "./ui";

/* ================================================================== */
/* Winds: manual or forecast                                           */
/* ================================================================== */

export function WindModeSwitch() {
  const mode = useEfb((s) => s.windMode);
  const setMode = useEfb((s) => s.setWindMode);
  const winds = useLive((s) => s.winds);
  const cruiseFt = useEfb((s) => s.aircraft.cruiseFt);
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { id: "forecast", label: "Forecast" },
          { id: "manual", label: "Manual" },
        ]}
      />
      {mode === "forecast" && (
        <p className="text-xs text-faint">
          {winds.note
            ? winds.note
            : winds.fetchedAt
            ? `NWS winds aloft at ${cruiseFt.toLocaleString()} ft, valid ${winds.valid}${winds.forUse ? ` (use ${winds.forUse})` : ""}${
                winds.stale ? " · last copy" : ""
              }. Each leg uses the nearest stations.`
            : "Loading winds aloft… legs use the manual wind until they arrive."}{" "}
          <a className="underline" href="https://aviationweather.gov/gfa/" target="_blank" rel="noreferrer">
            Official GFA wind chart
          </a>
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/* Saved plans                                                         */
/* ================================================================== */

export function SavedPlans() {
  const plans = useEfb((s) => s.plans);
  const route = useEfb((s) => s.route);
  const save = useEfb((s) => s.savePlan);
  const load = useEfb((s) => s.loadPlan);
  const remove = useEfb((s) => s.deletePlan);
  const [name, setName] = useState("");

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Saved plans</SectionTitle>
      {route.length >= 2 && (
        <div className="flex gap-2">
          <input
            className="field"
            placeholder={`${route[0]} → ${route[route.length - 1]}`}
            value={name}
            aria-label="Plan name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save(name);
                setName("");
              }
            }}
          />
          <Btn
            icon={<Save className="size-4" />}
            onClick={() => {
              save(name);
              setName("");
            }}
          >
            Save
          </Btn>
        </div>
      )}
      {plans.length === 0 ? (
        <p className="text-xs text-faint">Save this route to reuse it later. Plans stay on this device and in backups.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-[0.75rem] border border-line bg-surface pr-1">
              <button
                className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left"
                onClick={() => {
                  load(p.id);
                  requestAnimationFrame(() => fitAirports(p.route));
                }}
              >
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="truncate font-mono text-[0.6875rem] text-faint">{p.route.join(" ")}</span>
              </button>
              <IconBtn label={`Delete ${p.name}`} className="size-9 text-muted hover:text-bad" onClick={() => remove(p.id)}>
                <Trash2 className="size-3.5" />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* Offline: pre-load sectional tiles along the route                   */
/* ================================================================== */

function tilesForRoute(ids: string[], corridorNm = 15, zooms = [8, 9, 10, 11], cap = 2400) {
  const pts = ids.map((id) => getAirport(id)).filter((a): a is Airport => Boolean(a));
  if (!pts.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const distToRoute = (lat: number, lon: number) => {
    if (pts.length === 1) return haversineNm(pts[0], { lat, lon });
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
      const ax = a.lon * k * 60;
      const ay = a.lat * 60;
      const bx = b.lon * k * 60;
      const by = b.lat * 60;
      const px = lon * k * 60;
      const py = lat * 60;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
  };
  let s = 90;
  let n = -90;
  let w = 180;
  let e = -180;
  for (const p of pts) {
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
  }
  const pad = corridorNm / 60 + 0.3;
  s -= pad;
  n += pad;
  w -= pad / Math.cos((((s + n) / 2) * Math.PI) / 180);
  e += pad / Math.cos((((s + n) / 2) * Math.PI) / 180);
  const yOf = (deg: number, z: number) => {
    const r = (deg * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  for (const z of zooms) {
    const N = 2 ** z;
    const x0 = Math.floor(((w + 180) / 360) * N);
    const x1 = Math.floor(((e + 180) / 360) * N);
    const y0 = yOf(n, z);
    const y1 = yOf(s, z);
    const tileNm = (360 / N) * 60 * Math.cos((((s + n) / 2) * Math.PI) / 180);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const lon = ((x + 0.5) / N) * 360 - 180;
        const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / N))) * 180) / Math.PI;
        if (distToRoute(lat, lon) > corridorNm + tileNm * 0.75) continue;
        const key = `${z}/${x}/${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}

type Job = { label: string; done: number; total: number; ok: number; running: boolean };

/** Fetch a list of URLs through the service worker so they land in the offline cache. */
async function warm(urls: string[], onProgress: (done: number, ok: number) => void, stop: { current: boolean }) {
  let i = 0;
  let done = 0;
  let ok = 0;
  const worker = async () => {
    while (i < urls.length && !stop.current) {
      const url = urls[i++];
      try {
        const cross = !url.startsWith("/");
        const res = await fetch(url, cross ? { mode: "no-cors" } : undefined);
        if (res.ok || res.type === "opaque") ok++;
      } catch {
        /* keep going */
      }
      done++;
      if (done % 5 === 0 || done === urls.length) onProgress(done, ok);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  return { done, ok };
}

function sectionalUrls(z: number[], box: { s: number; w: number; n: number; e: number }, cap: number) {
  return z.flatMap((zz) => boxTiles(zz, box.s, box.w, box.n, box.e, cap).map((t) => `/api/charts/tile/${t.z}/${t.x}/${t.y}`));
}

function regionUrls(base: BaseChart, box: { s: number; w: number; n: number; e: number }): string[] {
  if (base === "sectional") return sectionalUrls([7, 8, 9, 10, 11], box, 3000).slice(0, 4000);
  const layer = FAA_LAYERS[base];
  const out: string[] = [];
  for (let z = layer.minZ; z <= layer.maxZ; z++) {
    for (const t of boxTiles(z, box.s, box.w, box.n, box.e, 4000)) out.push(layer.url(t.z, t.x, t.y));
    if (out.length > 4000) break;
  }
  if (base === "tac") out.push(...sectionalUrls([8, 9, 10, 11], box, 2000));
  return out.slice(0, 5000);
}

export function OfflineSave() {
  const route = useEfb((s) => s.route);
  const base = useEfb((s) => s.baseChart);
  const online = useLive((s) => s.online);
  const [job, setJob] = useState<Job | null>(null);
  const stop = useRef(false);

  const start = async (label: string, urls: string[]) => {
    stop.current = false;
    setJob({ label, done: 0, total: urls.length, ok: 0, running: true });
    const r = await warm(urls, (done, ok) => setJob({ label, done, total: urls.length, ok, running: true }), stop);
    setJob({ label, done: r.done, total: urls.length, ok: r.ok, running: false });
  };

  const routeJob = async () => {
    const tiles = tilesForRoute(route).map((k) => `/api/charts/tile/${k}`);
    // Plates for every airport on the route: the index, then each chart PDF.
    const pdfs: string[] = [];
    for (const id of route) {
      try {
        const r = await fetch(`/api/plates/${id}`);
        const b = (await r.json()) as { cycle?: string; airport?: { plates: { pdf: string; code: string }[] } | null };
        for (const p of b.airport?.plates ?? []) {
          if (["APD", "IAP", "DP", "ODP", "STR", "MIN"].includes(p.code)) pdfs.push(`/api/plates/pdf/${b.cycle}/${p.pdf}`);
        }
      } catch {
        /* offline or no plates */
      }
    }
    await start("Route charts and plates", [...tiles, ...new Set(pdfs)]);
  };

  const areaJob = () => {
    const s = useEfb.getState();
    const el = document.querySelector('svg[aria-label="Moving chart"]');
    const rect = el?.getBoundingClientRect();
    const w = rect?.width ?? 800;
    const h = rect?.height ?? 600;
    const latSpan = h / s.pxPerNm / 60;
    const lonSpan = w / s.pxPerNm / (60 * Math.cos((s.lat * Math.PI) / 180));
    const box = { s: s.lat - latSpan / 2, n: s.lat + latSpan / 2, w: s.lon - lonSpan / 2, e: s.lon + lonSpan / 2 };
    const label = BASE_CHARTS.find((c) => c.id === s.baseChart)?.label ?? "Chart";
    void start(`${label} for this map area`, regionUrls(s.baseChart, box));
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Offline</SectionTitle>
      <Card className="flex flex-col gap-2 p-3">
        <p className="text-xs text-muted">
          Save charts before you lose signal. The app itself opens offline after one online visit. Weather, TFRs, and NOTAMs
          need a connection.
        </p>
        {job && (
          <div>
            <p className="text-xs font-medium">{job.label}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-good" style={{ width: `${job.total ? (job.done / job.total) * 100 : 100}%` }} />
            </div>
            <p className="tnum mt-1 font-mono text-[0.6875rem] text-faint">
              {job.running
                ? `${job.done} / ${job.total}`
                : `${job.ok} saved${job.total - job.ok > 0 ? ` · ${job.total - job.ok} had no chart` : ""}`}
            </p>
          </div>
        )}
        {job?.running ? (
          <Btn
            size="sm"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop
          </Btn>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {route.length > 0 && (
              <Btn size="sm" icon={<HardDriveDownload className="size-3.5" />} disabled={!online} onClick={() => void routeJob()}>
                Save route charts and plates
              </Btn>
            )}
            <Btn size="sm" icon={<HardDriveDownload className="size-3.5" />} disabled={!online} onClick={areaJob}>
              Save {base === "sectional" ? "sectional" : BASE_CHARTS.find((c) => c.id === base)?.label} for this map area
            </Btn>
            {!online && <p className="text-xs text-warn">You are offline now.</p>}
          </div>
        )}
      </Card>
    </section>
  );
}

/* ================================================================== */
/* Backup and restore                                                  */
/* ================================================================== */

export function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


export function DataBackup() {
  const restore = useEfb((s) => s.restore);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Your data</SectionTitle>
      <p className="text-xs text-faint">
        Plans, aircraft, logbook, and settings live in this browser. A backup does not include the sync code.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Btn
          size="sm"
          icon={<Download className="size-3.5" />}
          onClick={() => {
            let state: Record<string, unknown> = {};
            try {
              state = backupState((JSON.parse(localStorage.getItem("crossefb") ?? "{}").state ?? {}) as Record<string, unknown>);
            } catch {
              state = {};
            }
            download(
              `crossefb-backup-${new Date().toISOString().slice(0, 10)}.json`,
              "application/json",
              JSON.stringify({ app: "crossefb", version: 1, savedAt: new Date().toISOString(), state }, null, 2),
            );
            setNote("Backup downloaded.");
          }}
        >
          Back up
        </Btn>
        <Btn size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
          Restore
        </Btn>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const ok = restore(JSON.parse(await f.text()));
            setNote(ok ? "Restored." : "That file is not a CrossEFB backup.");
          } catch {
            setNote("Could not read that file.");
          }
        }}
      />
      {note && <p className="text-xs text-muted">{note}</p>}
    </section>
  );
}

/* ================================================================== */
/* Layer toggles                                                       */
/* ================================================================== */

export function LayerToggles() {
  const showTfrs = useEfb((s) => s.showTfrs);
  const showMetars = useEfb((s) => s.showMetars);
  const showGlide = useEfb((s) => s.showGlide);
  const showRadar = useEfb((s) => s.showRadar);
  const showTraffic = useEfb((s) => s.showTraffic);
  const showTerrain = useEfb((s) => s.showTerrain);
  const showAhead = useEfb((s) => s.showAhead);
  const showAdvisories = useEfb((s) => s.showAdvisories);
  const setShowAdvisories = useEfb((s) => s.setShowAdvisories);
  const setLayer = useEfb((s) => s.setLayer);
  const receiverNote = useAdsb((s) => s.receiverNote);
  const rows: { label: string; sub: string; on: boolean; set: (on: boolean) => void }[] = [
    { label: "TFRs", sub: "FAA temporary flight restrictions", on: showTfrs, set: (on) => setLayer("showTfrs", on) },
    { label: "Airport weather", sub: "Flight category dots from METARs", on: showMetars, set: (on) => setLayer("showMetars", on) },
    { label: "Radar", sub: "NEXRAD composite, refreshed every 5 min", on: showRadar, set: (on) => setLayer("showRadar", on) },
    { label: "Advisories", sub: "G-AIRMET, SIGMET, PIREP", on: showAdvisories, set: setShowAdvisories },
    { label: "ADS-B traffic", sub: "Android shell, or a receiver on this Wi-Fi", on: showTraffic, set: (on) => setLayer("showTraffic", on) },
    { label: "Glide range", sub: "Uses your wind and terrain height", on: showGlide, set: (on) => setLayer("showGlide", on) },
    { label: "Terrain tint", sub: "Elevation shading. Not a terrain warning.", on: showTerrain, set: (on) => setLayer("showTerrain", on) },
    { label: "Terrain ahead", sub: "Wings-level view. Not synthetic vision.", on: showAhead, set: (on) => setLayer("showAhead", on) },
  ];
  return (
    <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[0.75rem] border border-line bg-surface">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{r.label}</p>
            <p className="truncate text-[0.6875rem] text-muted">{r.sub}</p>
          </div>
          <Toggle on={r.on} onChange={r.set} label={r.label} />
        </div>
      ))}
      {receiverNote && <p className="px-3 py-2 text-[0.6875rem] leading-relaxed text-muted">{receiverNote}</p>}
    </div>
  );
}

/* ================================================================== */
/* Airport reference links                                             */
/* ================================================================== */

export function AirportLinks({ airport }: { airport: Airport }) {
  const ident = airport.icao.startsWith("K") && airport.icao.length === 4 ? airport.icao.slice(1) : (airport.lid ?? airport.icao);
  const openPlates = useEfb((s) => s.setPlatesFor);
  const links = [
    {
      label: "FAA d-TPP",
      href: `https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?cycle=${dtppCycle()}&ident=${ident}`,
    },
    { label: "AirNav", href: `https://www.airnav.com/airport/${airport.icao}` },
    { label: "SkyVector", href: `https://skyvector.com/airport/${ident}` },
    { label: "NOTAMs", href: "https://notams.aim.faa.gov/notamSearch/" },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button
        onClick={() => openPlates(airport.icao)}
        className="inline-flex h-7 items-center gap-1 rounded-full bg-amber-soft px-2.5 text-[0.6875rem] font-semibold text-amber ring-1 ring-amber/40 hover:brightness-110"
      >
        Plates & diagram
      </button>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[0.6875rem] font-medium text-muted hover:border-line-strong hover:text-fg"
        >
          {l.label}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Emergency nearest                                                   */
/* ================================================================== */

export function NearestButton({ compact }: { compact?: boolean }) {
  const open = useEfb((s) => s.setNearestOpen);
  return (
    <button
      aria-label="Nearest airports (emergency)"
      title="Nearest airports"
      onClick={() => open(true)}
      className={cx(
        "flex h-11 items-center gap-1.5 rounded-[0.625rem] px-3 text-sm font-semibold text-bad ring-1 ring-bad/40 transition-colors hover:bg-bad/10",
        compact && "px-2.5",
      )}
    >
      <Siren className="size-4" />
      <span className="hidden lg:inline">Nearest</span>
    </button>
  );
}

export function NearestSheet() {
  const open = useEfb((s) => s.nearestOpen);
  const setOpen = useEfb((s) => s.setNearestOpen);
  const directTo = useEfb((s) => s.directTo);
  const focus = useEfb((s) => s.focus);
  const lat = useEfb((s) => s.lat);
  const lon = useEfb((s) => s.lon);
  const tas = useEfb((s) => s.aircraft.tas);
  const fix = useTrack((s) => s.fix);
  const tracking = useTrack((s) => s.tracking);
  const [minRwy, setMinRwy] = useState<"any" | "2500" | "4000">("2500");
  if (!open) return null;
  const here = tracking && fix ? { lat: fix.lat, lon: fix.lon } : { lat, lon };
  const gs = tracking && fix?.gsKt && fix.gsKt > 30 ? fix.gsKt : tas;
  const min = minRwy === "any" ? 0 : Number(minRwy);
  const list = nearestAirports(here.lat, here.lon, 40)
    .filter(({ airport }) => min === 0 || runwayFeet(airport.rwy) >= min)
    .slice(0, 10);

  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-2 sm:items-center" role="dialog" aria-modal="true" aria-label="Nearest airports">
      <div className="glass flex max-h-[90%] w-full max-w-lg animate-sheet-up flex-col overflow-hidden rounded-[1.25rem] ring-1 ring-bad/40">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-bad/15 text-bad">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Nearest airports</h2>
            <p className="text-xs text-muted">
              From {tracking && fix ? "your GPS position" : "the map center"} · ETE at {Math.round(gs)} kt · no wind
            </p>
          </div>
          <IconBtn label="Close" onClick={() => setOpen(false)} className="text-muted">
            <X className="size-5" />
          </IconBtn>
        </header>
        <div className="px-4 pt-3">
          <Segmented
            value={minRwy}
            onChange={setMinRwy}
            options={[
              { id: "any", label: "Any runway" },
              { id: "2500", label: "≥ 2,500 ft" },
              { id: "4000", label: "≥ 4,000 ft" },
            ]}
          />
        </div>
        <ul className="flex flex-col gap-1.5 overflow-auto p-3">
          {list.length === 0 && <li className="p-3 text-sm text-muted">No airport with that runway nearby.</li>}
          {list.map(({ airport, nm }) => {
            const brg = magCourse(trueCourse(here, airport), airport.varE);
            return (
              <li key={airport.icao} className="flex items-center gap-3 rounded-[0.875rem] border border-line bg-surface p-2.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => focus(airport.icao)}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-base font-semibold text-amber">{airport.icao}</span>
                    <span className="truncate text-sm">{airport.name}</span>
                  </div>
                  <div className="tnum mt-0.5 font-mono text-xs text-muted">
                    <span className="text-fg">{hdgText(brg)}°</span> · {fmtNm(nm)} nm · {fmtMin((nm / gs) * 60)} ·{" "}
                    {runwayFeet(airport.rwy) ? `${runwayFeet(airport.rwy).toLocaleString()} ft` : "rwy ?"} · {airport.elev.toLocaleString()} ft
                    {airport.freq ? ` · ${airport.freq}` : ""}
                  </div>
                </button>
                <button
                  className="flex h-12 shrink-0 items-center gap-1 rounded-[0.75rem] bg-amber px-3 font-mono text-sm font-bold text-ink"
                  onClick={() => {
                    directTo(airport.icao);
                    setOpen(false);
                    if (tracking) useTrack.getState().setFollow(true);
                  }}
                >
                  <Navigation className="size-4" /> D→
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[0.6875rem] text-faint">
          Squawk 7700 and talk to ATC on 121.5 if you need help. Runway lengths are planning data.
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* My aircraft                                                         */
/* ================================================================== */

export function MyAircraft() {
  const mine = useEfb((s) => s.myAircraft);
  const current = useEfb((s) => s.aircraft.profileId);
  const save = useEfb((s) => s.saveMyAircraft);
  const remove = useEfb((s) => s.deleteMyAircraft);
  const apply = useEfb((s) => s.applyProfile);
  const isMine = current.startsWith("my-");
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        action={
          <Btn size="sm" icon={<Save className="size-3.5" />} onClick={save}>
            {isMine ? "Update" : "Save as mine"}
          </Btn>
        }
      >
        My aircraft
      </SectionTitle>
      {mine.length === 0 ? (
        <p className="text-xs text-faint">Edit the numbers below, then save to keep this airplane as your own profile.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {mine.map((a) => (
            <li
              key={a.profileId}
              className={cx(
                "flex items-center rounded-[0.75rem] border pr-1",
                a.profileId === current ? "border-amber bg-amber-soft" : "border-line bg-surface",
              )}
            >
              <button className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left" onClick={() => apply(a.profileId)}>
                <span className={cx("truncate text-sm font-semibold", a.profileId === current && "text-amber")}>
                  {a.tail} · {a.name}
                </span>
                <span className="tnum font-mono text-[0.6875rem] text-muted">
                  {a.tas} kt · {a.burnGph} gph · {a.usableGal} gal
                </span>
              </button>
              <IconBtn label={`Delete ${a.tail}`} className="size-9 text-muted hover:text-bad" onClick={() => remove(a.profileId)}>
                <Trash2 className="size-3.5" />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


/* ================================================================== */
/* TFR detail card                                                     */
/* ================================================================== */

export function TfrCard() {
  const id = useLive((s) => s.pickedTfr);
  const tfr = useLive((s) => s.tfrs.tfrs.find((t) => t.id === s.pickedTfr));
  const close = useLive((s) => s.setPickedTfr);
  const airportOpen = useEfb((s) => Boolean(s.selected));
  if (!id || !tfr || airportOpen) return null;
  return (
    <section className="glass absolute inset-x-2 bottom-2 z-20 animate-sheet-up rounded-[1.1rem] p-4 ring-1 ring-[#ff3df0]/50 sm:inset-x-auto sm:bottom-[5.5rem] sm:left-3 sm:w-[22.5rem]">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-[#ff3df0]/15 px-2 py-1 font-mono text-xs font-bold text-[#ff3df0]">TFR</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-base font-semibold">{tfr.id}</h2>
          <p className="text-xs font-semibold text-muted uppercase">{tfr.type}</p>
        </div>
        <IconBtn label="Close TFR" onClick={() => close(null)} className="-mt-1 -mr-1 size-9 text-muted">
          <X className="size-4" />
        </IconBtn>
      </div>
      <p className="mt-2 text-sm">{tfr.title}</p>
      <p className="mt-2 text-xs text-muted">Altitudes and times are in the NOTAM. Read it before you plan near this area.</p>
      <a
        href={tfr.link}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-[0.625rem] border border-line px-3 text-sm font-medium hover:bg-hover"
      >
        Open the NOTAM <ExternalLink className="size-3.5" />
      </a>
    </section>
  );
}

/* ================================================================== */
/* Base chart picker                                                   */
/* ================================================================== */

export function BaseChartPicker() {
  const base = useEfb((s) => s.baseChart);
  const set = useEfb((s) => s.setBaseChart);
  return (
    <div className="grid grid-cols-4 gap-1 rounded-[0.75rem] border border-line bg-bg p-1" role="radiogroup" aria-label="Chart">
      {BASE_CHARTS.map((c) => {
        const on = c.id === base;
        return (
          <button
            key={c.id}
            role="radio"
            aria-checked={on}
            title={c.label}
            onClick={() => set(c.id)}
            className={cx(
              "flex h-12 flex-col items-center justify-center rounded-[0.5rem] leading-tight transition-colors",
              on ? "bg-raised text-fg ring-1 ring-line-strong" : "text-muted hover:text-fg",
            )}
          >
            <span className={cx("font-mono text-xs font-bold", on && "text-amber")}>{c.short}</span>
            <span className="text-[0.625rem]">{c.label.replace("Terminal area", "Terminal")}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* NOTAMs                                                              */
/* ================================================================== */

function NotamRow({ n }: { n: import("@/lib/efb/notams").Notam }) {
  return (
    <li className={cx("rounded-[0.625rem] border px-2.5 py-2", n.important ? "border-warn/50 bg-warn/10" : "border-line bg-bg")}>
      <div className="flex items-center gap-2">
        <span className={cx("font-mono text-[0.625rem] font-bold", n.important ? "text-warn" : "text-faint")}>{n.keyword}</span>
        <span className="font-mono text-[0.625rem] text-faint">{n.number}</span>
      </div>
      <p className="mt-0.5 font-mono text-[0.6875rem] leading-relaxed break-words">{n.text}</p>
    </li>
  );
}

/** NOTAMs for a list of airports, important ones first. */
export function NotamList({ icaos, compact }: { icaos: string[]; compact?: boolean }) {
  const pack = useNotams(icaos);
  const [open, setOpen] = useState(!compact);
  if (!pack) return compact ? null : <p className="text-xs text-muted">Loading NOTAMs…</p>;
  if (!pack.configured) {
    return (
      <p className={cx("text-xs text-muted", compact && "mt-2")}>
        NOTAM text is off until the person hosting this copy adds their own FAA API keys. This app does not include a key.{" "}
        <a className="underline" href="https://notams.aim.faa.gov/notamSearch/" target="_blank" rel="noreferrer">
          FAA NOTAM search
        </a>
      </p>
    );
  }
  const all = icaos.flatMap((id) => pack.notams[id] ?? []);
  const hot = all.filter((n) => n.important).length;
  if (compact) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-semibold ring-1",
            hot ? "bg-warn/10 text-warn ring-warn/40" : "text-muted ring-line",
          )}
        >
          NOTAMs · {all.length}
          {hot ? ` · ${hot} closure/outage` : ""}
        </button>
        {open && (
          <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-auto">
            {all.map((n) => (
              <NotamRow key={n.id} n={n} />
            ))}
            {all.length === 0 && <li className="text-xs text-muted">No NOTAMs on file.</li>}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {pack.error && <p className="text-xs text-warn">Some NOTAMs did not load ({pack.error}). Use the official briefing.</p>}
      {icaos.map((id) => {
        const list = pack.notams[id] ?? [];
        return (
          <section key={id}>
            <h4 className="mb-1.5 font-mono text-xs font-semibold text-amber">
              {id} <span className="text-faint">· {list.length}</span>
            </h4>
            <ul className="flex flex-col gap-1.5">
              {list.slice(0, 40).map((n) => (
                <NotamRow key={n.id} n={n} />
              ))}
              {list.length === 0 && <li className="text-xs text-muted">No NOTAMs on file.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Encrypted sync                                                      */
/* ================================================================== */

export function SyncPanel() {
  const code = useEfb((s) => s.syncKey);
  const setCode = useEfb((s) => s.setSyncKey);
  const status = useSyncStatus();
  const [entry, setEntry] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Sync across devices</SectionTitle>
      {!code ? (
        <>
          <p className="text-xs text-faint">
            One code links your phone, tablet, and PC. Data is encrypted on the device with that code before upload; the
            server stores only ciphertext and cannot read it. Keep the code private.
          </p>
          <Btn
            size="sm"
            icon={<RefreshCcw className="size-3.5" />}
            onClick={() => {
              resetSyncRev();
              setCode(newSyncCode());
              setShow(true);
            }}
          >
            Start syncing (new code)
          </Btn>
          <div className="flex gap-2">
            <input
              className="field font-mono uppercase"
              placeholder="Enter a code from another device"
              value={entry}
              aria-label="Sync code"
              onChange={(e) => {
                setEntry(e.target.value);
                setErr("");
              }}
            />
            <Btn
              size="sm"
              className="h-11"
              onClick={() => {
                const c = normalizeCode(entry);
                if (!c) {
                  setErr("That code is not valid. It has 26 letters and numbers.");
                  return;
                }
                resetSyncRev();
                setCode(c);
                setEntry("");
              }}
            >
              Link
            </Btn>
          </div>
          {err && <p className="text-xs text-bad">{err}</p>}
        </>
      ) : (
        <Card className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "size-2 rounded-full",
                status.state === "ok" ? "bg-good" : status.state === "error" ? "bg-bad" : "animate-pulse bg-warn",
              )}
            />
            <span className="text-sm font-medium">
              {status.state === "ok"
                ? "Synced"
                : status.state === "error"
                  ? "Not synced"
                  : status.state === "syncing"
                    ? "Syncing…"
                    : "Waiting"}
            </span>
            {status.lastSync && <span className="ml-auto font-mono text-[0.6875rem] text-faint">{status.lastSync.slice(11, 16)}Z</span>}
          </div>
          {status.message && <p className="text-xs text-bad">{status.message}</p>}
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-bg px-2 py-1.5 font-mono text-xs">
              {show ? code : code.replace(/[A-Z0-9]/g, "•")}
            </code>
            <Btn size="sm" variant="ghost" onClick={() => setShow((s) => !s)}>
              {show ? "Hide" : "Show"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(code)}>
              Copy
            </Btn>
          </div>
          <p className="text-[0.6875rem] text-faint">Enter this code on your other devices under Plan → Sync across devices.</p>
          <Btn
            size="sm"
            variant="danger"
            onClick={() => {
              setCode("");
              resetSyncRev();
            }}
          >
            Stop syncing on this device
          </Btn>
        </Card>
      )}
    </section>
  );
}

/* ================================================================== */
/* Data sources and currency                                           */
/* ================================================================== */

export function DataSourcesSheet() {
  const open = useLive((s) => s.dataOpen);
  const setOpen = useLive((s) => s.setDataOpen);
  const tfrs = useLive((s) => s.tfrs);
  const winds = useLive((s) => s.winds);
  const metars = useLive((s) => s.metars);
  const online = useLive((s) => s.online);
  const [sectional, setSectional] = useState("");
  const [radar, setRadar] = useState("");
  const [notams, setNotams] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/charts/status?south=39&west=-105&north=40&east=-104")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { effective?: string; expires?: string } | null) => setSectional(b?.effective ? `${b.effective} – ${b.expires}` : ""))
      .catch(() => undefined);
    void fetch(RADAR_META)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { meta?: { valid?: string } } | null) => setRadar(b?.meta?.valid ?? ""))
      .catch(() => undefined);
    void fetch("/api/notams?ids=")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { configured?: boolean } | null) => setNotams(b ? Boolean(b.configured) : null))
      .catch(() => undefined);
  }, [open]);

  if (!open) return null;
  const z = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z` : "—");
  const rows: { name: string; source: string; status: string; ok: boolean | null }[] = [
    { name: "VFR sectional", source: "FAA AIS GeoTIFF, 56-day cycle", status: sectional || "loading…", ok: sectional ? true : null },
    { name: "Terminal area, IFR low/high", source: "FAA AIS chart tile service", status: "Current FAA edition", ok: true },
    {
      name: "Plates and diagrams",
      source: "FAA d-TPP, 28-day cycle",
      status: `Cycle ${dtppCycle()}`,
      ok: true,
    },
    { name: "METAR / TAF", source: "aviationweather.gov", status: metars.fetchedAt ? `Map layer ${z(metars.fetchedAt)}` : "On demand", ok: true },
    { name: "Advisories, PIREPs", source: "aviationweather.gov", status: "Every 5 min while shown", ok: true },
    { name: "Winds aloft", source: "NWS", status: winds.note ? "FB tables ended 3 Nov 2026" : winds.valid ? `Valid ${winds.valid}${winds.stale ? " (last copy)" : ""}` : "When forecast mode is on", ok: winds.note ? false : winds.valid ? !winds.stale : null },
    { name: "TFRs", source: "tfr.faa.gov", status: tfrs.fetchedAt ? `${tfrs.tfrs.length} active · ${z(tfrs.fetchedAt)}${tfrs.stale ? " (last copy)" : ""}` : "loading…", ok: tfrs.fetchedAt ? !tfrs.stale : null },
    { name: "Radar", source: "NWS NEXRAD via Iowa State Mesonet", status: radar ? `Valid ${z(radar)}` : "—", ok: radar ? true : null },
    { name: "NOTAMs", source: "Host's FAA API key", status: notams === null ? "—" : notams ? "Connected" : "Host has not added a key", ok: notams },
    { name: "Airports", source: "Built into the app", status: "Update with app releases", ok: true },
  ];
  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-2 sm:items-center" role="dialog" aria-modal="true" aria-label="Data sources">
      <div className="glass flex max-h-[90%] w-full max-w-xl animate-sheet-up flex-col overflow-hidden rounded-[1.25rem]">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Data sources and currency</h2>
            <p className="text-xs text-muted">{online ? "Online" : "Offline: showing saved copies where available"}</p>
          </div>
          <IconBtn label="Close" onClick={() => setOpen(false)} className="text-muted">
            <X className="size-5" />
          </IconBtn>
        </header>
        <ul className="divide-y divide-line overflow-auto">
          {rows.map((r) => (
            <li key={r.name} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", r.ok === true ? "bg-good" : r.ok === false ? "bg-warn" : "bg-faint")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-faint">{r.source}</p>
              </div>
              <p className="max-w-[45%] text-right font-mono text-[0.6875rem] text-muted">{r.status}</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[0.6875rem] text-faint">
          CrossEFB is a planning aid, not a certified EFB. Confirm currency with official sources before flight.
        </p>
      </div>
    </div>
  );
}

export function DataSourcesButton() {
  const setOpen = useLive((s) => s.setDataOpen);
  return (
    <Btn size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>
      Data sources and currency
    </Btn>
  );
}
