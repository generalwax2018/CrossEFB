import { useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  HardDriveDownload,
  Navigation,
  Save,
  Siren,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { getAirport } from "@/lib/efb/airports";
import { runwayFeet } from "@/lib/efb/docs";
import { useLive } from "@/lib/efb/live-store";
import { fmtMin, fmtNm, haversineNm, hdgText, magCourse, nearestAirports, trueCourse } from "@/lib/efb/nav";
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
          { id: "forecast", label: "Forecast (FB)" },
          { id: "manual", label: "Manual" },
        ]}
      />
      {mode === "forecast" && (
        <p className="text-xs text-faint">
          {winds.fetchedAt
            ? `NWS winds aloft at ${cruiseFt.toLocaleString()} ft, valid ${winds.valid}${winds.forUse ? ` (use ${winds.forUse})` : ""}${
                winds.stale ? " · last copy" : ""
              }. Each leg uses the nearest stations.`
            : "Loading winds aloft… legs use the manual wind until they arrive."}
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

export function OfflineSave() {
  const route = useEfb((s) => s.route);
  const online = useLive((s) => s.online);
  const [state, setState] = useState<{ done: number; total: number; ok: number; running: boolean } | null>(null);
  const stop = useRef(false);

  const run = async () => {
    const tiles = tilesForRoute(route);
    stop.current = false;
    setState({ done: 0, total: tiles.length, ok: 0, running: true });
    let i = 0;
    let done = 0;
    let ok = 0;
    const worker = async () => {
      while (i < tiles.length && !stop.current) {
        const key = tiles[i++];
        try {
          const res = await fetch(`/api/charts/tile/${key}`);
          if (res.ok) ok++;
        } catch {
          /* keep going */
        }
        done++;
        if (done % 4 === 0 || done === tiles.length) setState({ done, total: tiles.length, ok, running: true });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setState({ done, total: tiles.length, ok, running: false });
  };

  if (route.length < 1) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Offline</SectionTitle>
      <Card className="flex flex-col gap-2 p-3">
        <p className="text-xs text-muted">
          Download the sectional within 15 NM of this route so the chart still draws without signal. Weather and TFRs
          need a connection.
        </p>
        {state && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-good" style={{ width: `${state.total ? (state.done / state.total) * 100 : 100}%` }} />
            </div>
            <p className="tnum mt-1 font-mono text-[0.6875rem] text-faint">
              {state.running
                ? `${state.done} / ${state.total} tiles`
                : `${state.ok} tiles saved${state.total - state.ok > 0 ? ` · ${state.total - state.ok} had no chart` : ""}`}
            </p>
          </div>
        )}
        {state?.running ? (
          <Btn
            size="sm"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop
          </Btn>
        ) : (
          <Btn size="sm" icon={<HardDriveDownload className="size-3.5" />} disabled={!online} onClick={() => void run()}>
            {online ? "Save route for offline" : "Offline now"}
          </Btn>
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
        Plans, aircraft, logbook, and settings live in this browser. Back them up to move to another device.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Btn
          size="sm"
          icon={<Download className="size-3.5" />}
          onClick={() => {
            let state: unknown = {};
            try {
              state = JSON.parse(localStorage.getItem("crossefb") ?? "{}").state ?? {};
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
  const showAdvisories = useEfb((s) => s.showAdvisories);
  const setShowAdvisories = useEfb((s) => s.setShowAdvisories);
  const setLayer = useEfb((s) => s.setLayer);
  const rows: { label: string; sub: string; on: boolean; set: (on: boolean) => void }[] = [
    { label: "TFRs", sub: "FAA temporary flight restrictions", on: showTfrs, set: (on) => setLayer("showTfrs", on) },
    { label: "Airport weather", sub: "Flight category dots from METARs", on: showMetars, set: (on) => setLayer("showMetars", on) },
    { label: "Advisories", sub: "G-AIRMET, SIGMET, PIREP", on: showAdvisories, set: setShowAdvisories },
    { label: "Glide range", sub: "No-wind ring while tracking or previewing", on: showGlide, set: (on) => setLayer("showGlide", on) },
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
    </div>
  );
}

/* ================================================================== */
/* Airport reference links                                             */
/* ================================================================== */

/** Current FAA 28-day procedures cycle, e.g. "2611". */
export function dtppCycle(now = new Date()): string {
  const ref = Date.UTC(2026, 9, 29, 9, 1); // cycle 2611
  const day = 24 * 3600 * 1000;
  const k = Math.floor((now.getTime() - ref) / (28 * day));
  const eff = new Date(ref + k * 28 * day);
  const start = Date.UTC(eff.getUTCFullYear(), 0, 1);
  const doy = Math.floor((eff.getTime() - start) / day);
  const n = Math.floor(doy / 28) + 1;
  return `${String(eff.getUTCFullYear()).slice(2)}${String(n).padStart(2, "0")}`;
}

export function AirportLinks({ airport }: { airport: Airport }) {
  const ident = airport.icao.startsWith("K") && airport.icao.length === 4 ? airport.icao.slice(1) : (airport.lid ?? airport.icao);
  const links = [
    {
      label: "Diagram & plates",
      href: `https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?cycle=${dtppCycle()}&ident=${ident}`,
    },
    { label: "AirNav", href: `https://www.airnav.com/airport/${airport.icao}` },
    { label: "SkyVector", href: `https://skyvector.com/airport/${ident}` },
    { label: "NOTAMs", href: "https://notams.aim.faa.gov/notamSearch/" },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
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
