import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ClipboardList,
  CloudSun,
  Crosshair,
  Eye,
  Fuel,
  Layers,
  ListOrdered,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Moon,
  Navigation,
  Pause,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Play,
  Plus,
  RefreshCw,
  Route,
  Search,
  Sun,
  Sunrise,
  Trash2,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { getAirport, PRESETS, searchAirports } from "@/lib/efb/airports";
import { PROFILES } from "@/lib/efb/aircraft";
import { favoredRunway, runwayEnds } from "@/lib/efb/docs";
import {
  fmtGal,
  fmtMin,
  fmtNm,
  haversineNm,
  hdgText,
  nearestAirports,
  nextFix,
  routeDistance,
  totals,
} from "@/lib/efb/nav";
import { useEfb } from "@/lib/efb/store";
import { useTrack } from "@/lib/efb/track";
import { fmtClock, isLocalNight, sunClock } from "@/lib/efb/sun";
import type { Airport, ChartMode, Metar, Tab } from "@/lib/efb/types";
import { useWeather } from "@/lib/efb/use-weather";
import { fitAirports } from "./chart";
import { useLegs } from "@/lib/efb/live-store";
import {
  AirportLinks,
  BaseChartPicker,
  DataSourcesButton,
  NotamList,
  DataBackup,
  LayerToggles,
  MyAircraft,
  NearestButton,
  OfflineSave,
  SavedPlans,
  SyncPanel,
  WindModeSwitch,
} from "./extras";
import {
  Btn,
  Card,
  CatBadge,
  catColor,
  cx,
  IconBtn,
  Kbd,
  NumField,
  Readout,
  SectionTitle,
  Segmented,
  Toggle,
  WindRunway,
} from "./ui";

/* ================================================================== */
/* Weather hook                                                        */
/* ================================================================== */

export { useWeather };

/* ================================================================== */
/* Top bar                                                             */
/* ================================================================== */

export function BrandMark() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-[0.625rem] bg-amber text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.2)_inset]">
        <Navigation className="size-[1.05rem] rotate-45" strokeWidth={2.5} />
      </div>
      <div className="hidden leading-none lg:block">
        <div className="text-[0.95rem] font-bold tracking-tight">
          Cross<span className="text-amber">EFB</span>
        </div>
        <div className="mt-0.5 text-[0.625rem] font-medium tracking-widest text-faint uppercase">Beta · not for flight</div>
      </div>
      <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-warn uppercase lg:hidden">Not for flight</span>
    </div>
  );
}

export function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const focus = useEfb((s) => s.focus);
  const addStop = useEfb((s) => s.addStop);
  const lat = useEfb((s) => s.lat);
  const lon = useEfb((s) => s.lon);
  const results = useMemo(() => (q.trim() ? searchAirports(q) : []), [q]);

  useEffect(() => setCursor(0), [q]);

  // "/" or Ctrl/Cmd+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (a: Airport, add: boolean) => {
    if (add) addStop(a.icao);
    focus(a.icao);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 md:max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={q}
        aria-label="Search airports"
        placeholder="Search airport, city, or ident"
        className="h-10 w-full rounded-[0.75rem] border border-line bg-surface pr-10 pl-9 text-sm outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-amber"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(results.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          } else if (e.key === "Enter" && results[cursor]) {
            pick(results[cursor], e.shiftKey);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
        <Kbd>/</Kbd>
      </span>
      {open && results.length > 0 && (
        <div className="glass absolute top-12 z-40 w-full animate-pop overflow-hidden rounded-card">
          <ul className="max-h-[22rem] overflow-auto p-1.5">
            {results.map((a, i) => {
              const nm = haversineNm({ lat, lon }, a);
              return (
                <li key={a.icao}>
                  <div
                    className={cx(
                      "flex items-center gap-3 rounded-[0.625rem] px-2.5 py-2",
                      i === cursor ? "bg-hover" : "hover:bg-hover",
                    )}
                    onMouseEnter={() => setCursor(i)}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => pick(a, false)}>
                      <ClassChip cls={a.cls} />
                      <span className="w-12 shrink-0 font-mono text-sm font-semibold text-amber">{a.icao}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{a.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {a.city} · {a.elev.toLocaleString()} ft
                        </span>
                      </span>
                      <span className="tnum shrink-0 font-mono text-xs text-faint">{fmtNm(nm)} nm</span>
                    </button>
                    <button
                      aria-label={`Add ${a.icao} to route`}
                      title="Add to route"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-amber"
                      onClick={() => pick(a, true)}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-3 border-t border-line px-3 py-2 text-[0.6875rem] text-faint sm:flex">
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> go
            </span>
            <span className="flex items-center gap-1">
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd> add to route
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassChip({ cls }: { cls: Airport["cls"] }) {
  const color =
    cls === "B" ? "var(--color-mvfr)" : cls === "C" ? "var(--color-lifr)" : cls === "D" ? "var(--color-cyan)" : "var(--color-faint)";
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[0.6875rem] font-semibold"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
      title={`Class ${cls}`}
    >
      {cls}
    </span>
  );
}

export function ZuluClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const local = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <div className="text-right leading-tight">
        <div className="tnum text-sm font-medium text-fg">{now.toISOString().slice(11, 19)}Z</div>
        <div className="tnum text-[0.6875rem] text-faint">{local} LCL</div>
      </div>
    </div>
  );
}

export function GpsChip() {
  const tracking = useTrack((s) => s.tracking);
  const fix = useTrack((s) => s.fix);
  const error = useTrack((s) => s.error);
  const state = error ? "bad" : tracking ? (fix ? "good" : "warn") : "off";
  const label = error ? error : tracking ? (fix ? `GPS ±${Math.round(fix.accuracyM)}m` : "GPS…") : "GPS off";
  return (
    <span
      className={cx(
        "hidden h-8 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[0.6875rem] sm:inline-flex",
        state === "good" && "border-good/40 text-good",
        state === "warn" && "border-warn/40 text-warn",
        state === "bad" && "border-bad/40 text-bad",
        state === "off" && "border-line text-faint",
      )}
    >
      <span
        className={cx(
          "size-1.5 rounded-full",
          state === "good" && "bg-good",
          state === "warn" && "animate-pulse bg-warn",
          state === "bad" && "bg-bad",
          state === "off" && "bg-faint",
        )}
      />
      {label}
    </span>
  );
}

const MODES: { id: ChartMode; label: string; icon: LucideIcon }[] = [
  { id: "night", label: "Night", icon: Moon },
  { id: "day", label: "Day", icon: Sun },
  { id: "red", label: "Red", icon: Eye },
  { id: "green", label: "Green", icon: Eye },
  { id: "yellow", label: "Haze", icon: CloudSun },
];

const MODE_SWATCH: Record<ChartMode, string> = {
  night: "#f0b03f",
  day: "#f4f2ec",
  red: "#ff3b26",
  green: "#3dff7a",
  yellow: "#ffd400",
};

export function DisplayModeButton() {
  const mode = useEfb((s) => s.chartMode);
  const setMode = useEfb((s) => s.setChartMode);
  const idx = Math.max(0, MODES.findIndex((m) => m.id === mode));
  const next = MODES[(idx + 1) % MODES.length];
  const Icon = MODES[idx].icon;
  return (
    <IconBtn
      label={`Display: ${MODES[idx].label}. Switch to ${next.label}`}
      onClick={() => setMode(next.id)}
      className="size-10"
    >
      <Icon className="size-[1.1rem]" />
    </IconBtn>
  );
}

export function RouteSummaryPill() {
  const route = useEfb((s) => s.route);
  const setTab = useEfb((s) => s.setTab);
  const legs = useLegs();
  if (route.length < 2) return null;
  const sum = totals(legs);
  return (
    <button
      onClick={() => setTab("plan")}
      className="hidden h-10 shrink-0 items-center gap-2.5 rounded-[0.75rem] border border-line bg-surface px-3 font-mono text-xs hover:border-line-strong xl:flex"
    >
      <span className="font-semibold text-amber">{route[0]}</span>
      <ArrowRight className="size-3.5 text-faint" />
      <span className="font-semibold text-amber">{route[route.length - 1]}</span>
      {route.length > 2 && <span className="text-faint">+{route.length - 2}</span>}
      <span className="h-4 w-px bg-line" />
      <span className="tnum text-muted">
        {fmtNm(sum.nm)} nm · {fmtMin(sum.min)} · {fmtGal(sum.gal)} gal
      </span>
    </button>
  );
}

/* ================================================================== */
/* Navigation                                                          */
/* ================================================================== */

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "chart", label: "Map", icon: MapIcon },
  { id: "plan", label: "Plan", icon: Route },
  { id: "wx", label: "Weather", icon: CloudSun },
  { id: "docs", label: "File", icon: ClipboardList },
  { id: "aircraft", label: "Aircraft", icon: Plane },
];

/** Desktop/tablet vertical rail. */
export function Rail() {
  const tab = useEfb((s) => s.tab);
  const setTab = useEfb((s) => s.setTab);
  return (
    <nav className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg py-2" aria-label="Sections">
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(on && item.id !== "chart" ? "chart" : item.id)}
            aria-current={on ? "page" : undefined}
            className={cx(
              "group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-[0.75rem] text-[0.6875rem] font-medium transition-colors",
              on ? "bg-amber-soft text-amber" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {on && <span className="absolute top-3 -left-2 h-8 w-1 rounded-r-full bg-amber" />}
            <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} />
            {item.label}
          </button>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-1">
        <DisplayModeButton />
      </div>
    </nav>
  );
}

/** Phone bottom tab bar. */
export function MobileTabs() {
  const tab = useEfb((s) => s.tab);
  const setTab = useEfb((s) => s.setTab);
  return (
    <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]" aria-label="Sections">
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={on ? "page" : undefined}
            className={cx(
              "relative flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium",
              on ? "text-amber" : "text-muted",
            )}
          >
            {on && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-amber" />}
            <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

const TAB_TITLES: Record<Tab, { title: string; sub: string }> = {
  chart: { title: "Map", sub: "" },
  plan: { title: "Flight plan", sub: "Route, winds, and legs" },
  wx: { title: "Weather", sub: "METAR and TAF from aviationweather.gov" },
  aircraft: { title: "Aircraft", sub: "Cruise numbers used by the plan" },
  docs: { title: "Flight file", sub: "" },
};

/** Desktop drawer that sits beside the rail. */
export function Drawer() {
  const tab = useEfb((s) => s.tab);
  const setTab = useEfb((s) => s.setTab);
  if (tab === "chart" || tab === "docs") return null;
  const t = TAB_TITLES[tab];
  return (
    <aside className="flex w-[23rem] shrink-0 animate-fade-in flex-col border-r border-line bg-bg">
      <header className="flex items-start justify-between gap-2 px-5 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t.title}</h1>
          <p className="text-xs text-muted">{t.sub}</p>
        </div>
        <IconBtn label="Close panel" onClick={() => setTab("chart")} className="-mr-2 size-9 text-muted">
          <X className="size-4" />
        </IconBtn>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-6">
        <ActivePanel />
      </div>
    </aside>
  );
}

/** Phone bottom sheet over the map. */
export function MobileSheet() {
  const tab = useEfb((s) => s.tab);
  const setTab = useEfb((s) => s.setTab);
  if (tab === "chart" || tab === "docs") return null;
  const t = TAB_TITLES[tab];
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] animate-sheet-up flex-col rounded-t-[1.25rem] border-t border-line bg-bg shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.6)]">
      <button
        aria-label="Close panel"
        className="flex h-6 w-full shrink-0 items-center justify-center"
        onClick={() => setTab("chart")}
      >
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </button>
      <header className="flex items-center justify-between px-4 pb-2">
        <h1 className="text-base font-semibold">{t.title}</h1>
        <IconBtn label="Close panel" onClick={() => setTab("chart")} className="size-9 text-muted">
          <X className="size-4" />
        </IconBtn>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
        <ActivePanel />
      </div>
    </div>
  );
}

export function ActivePanel() {
  const tab = useEfb((s) => s.tab);
  if (tab === "wx") return <WxPanel />;
  if (tab === "aircraft") return <AircraftPanel />;
  return <PlanPanel />;
}

/* ================================================================== */
/* Chart overlays                                                      */
/* ================================================================== */

export function ChartTools() {
  const mode = useEfb((s) => s.chartMode);
  const setMode = useEfb((s) => s.setChartMode);
  const showAdvisories = useEfb((s) => s.showAdvisories);
  const setShowAdvisories = useEfb((s) => s.setShowAdvisories);
  const setView = useEfb((s) => s.setView);
  const route = useEfb((s) => s.route);
  const lat = useEfb((s) => s.lat);
  const lon = useEfb((s) => s.lon);
  const focus = useEfb((s) => s.focus);
  const [geoNote, setGeoNote] = useState("");
  const [open, setOpen] = useState<"near" | "layers" | null>(null);
  const nearest = open === "near" ? nearestAirports(lat, lon, 8) : [];

  const zoom = (k: number) => {
    const s = useEfb.getState();
    setView(s.lat, s.lon, s.pxPerNm * k);
  };

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
      <div className="glass flex flex-col rounded-card p-1">
        <IconBtn label="Layers and display" active={open === "layers"} onClick={() => setOpen(open === "layers" ? null : "layers")}>
          <Layers className="size-5" />
        </IconBtn>
        <IconBtn label="Nearest airports" active={open === "near"} onClick={() => setOpen(open === "near" ? null : "near")}>
          <ListOrdered className="size-5" />
        </IconBtn>
        <IconBtn
          label="Center on my position"
          onClick={() => {
            if (!navigator.geolocation) {
              setGeoNote("No GPS on this device");
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setGeoNote("");
                const s = useEfb.getState();
                s.setView(pos.coords.latitude, pos.coords.longitude, Math.max(s.pxPerNm, 8));
                setOpen("near");
              },
              () => setGeoNote("Location blocked"),
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }}
        >
          <Crosshair className="size-5" />
        </IconBtn>
        {route.length >= 2 && (
          <IconBtn label="Fit route" onClick={() => fitAirports(useEfb.getState().route)}>
            <Route className="size-5" />
          </IconBtn>
        )}
      </div>
      <div className="glass flex flex-col rounded-card p-1">
        <IconBtn label="Zoom in" onClick={() => zoom(1.35)}>
          <Plus className="size-5" />
        </IconBtn>
        <span className="mx-2 h-px bg-line" />
        <IconBtn label="Zoom out" onClick={() => zoom(1 / 1.35)}>
          <Minus className="size-5" />
        </IconBtn>
      </div>

      {open === "layers" && (
        <div className="glass absolute top-0 right-[3.75rem] max-h-[calc(100dvh-9rem)] w-80 max-w-[calc(100vw-6rem)] animate-pop overflow-auto rounded-card p-3">
          <p className="eyebrow mb-2">Display</p>
          <div className="grid grid-cols-5 gap-1 rounded-[0.75rem] border border-line bg-bg p-1" role="radiogroup" aria-label="Display mode">
            {MODES.map((m) => {
              const on = m.id === mode;
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={on}
                  title={m.id === "yellow" ? "Haze: yellow, high contrast for hazy or bright skies" : `${m.label} display`}
                  onClick={() => setMode(m.id)}
                  className={cx(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-[0.5rem] text-[0.6875rem] font-semibold transition-colors",
                    on ? "bg-raised text-fg ring-1 ring-line-strong" : "text-muted hover:text-fg",
                  )}
                >
                  <span
                    className="size-4 rounded-full ring-2 ring-line-strong"
                    style={{ background: MODE_SWATCH[m.id], boxShadow: on ? `0 0 0 2px ${MODE_SWATCH[m.id]}55` : undefined }}
                  />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="eyebrow mt-4 mb-2">Chart</p>
          <BaseChartPicker />
          <p className="eyebrow mt-4 mb-2">Layers</p>
          <LayerToggles />
          <p className="eyebrow mt-4 mb-2">Legend</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted">
            <LegendRow swatch={<span className="size-2.5 rounded-full bg-[var(--chart-ink)]" />}>Towered</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-full border-[1.5px] border-[var(--chart-ink)]" />}>Non-towered</LegendRow>
            <LegendRow swatch={<span className="h-0.5 w-4 rounded bg-[var(--chart-ring)]" />}>Class B</LegendRow>
            <LegendRow swatch={<span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-ring)]" />}>Class C / D</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-sm bg-[var(--chart-wx-ifr)]" />}>IFR / mtn obsc</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-sm bg-[var(--chart-wx-turb)]" />}>Turbulence</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-sm bg-[var(--chart-wx-ice)]" />}>Icing</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-sm bg-[var(--chart-wx-sig)]" />}>SIGMET / conv</LegendRow>
            <LegendRow swatch={<span className="size-2.5 rounded-sm border-2 border-[#ff3df0] bg-[#ff3df0]/25" />}>TFR</LegendRow>
            <LegendRow swatch={<span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-own)]" />}>Glide range</LegendRow>
            <li className="col-span-2 flex items-center gap-2">
              <span className="h-2.5 w-24 rounded-sm bg-[linear-gradient(90deg,#04e9e7,#019ff4,#02fd02,#01c501,#fdf802,#fd9500,#fd0000,#bc0000,#f800fd)]" />
              Radar: light → extreme
            </li>
          </ul>
          <DataSourcesButton />
        </div>
      )}

      {open === "near" && (
        <div className="glass absolute top-0 right-[3.75rem] w-72 max-w-[calc(100vw-6rem)] animate-pop rounded-card p-1.5">
          <p className="eyebrow px-2 pt-1.5 pb-1">Nearest to map center</p>
          {nearest.length === 0 && <p className="px-2 py-2 text-sm text-muted">None nearby</p>}
          {nearest.map(({ airport, nm }) => (
            <button
              key={airport.icao}
              className="flex h-11 w-full items-center gap-2.5 rounded-[0.625rem] px-2 text-left hover:bg-hover"
              onClick={() => {
                focus(airport.icao);
                setOpen(null);
              }}
            >
              <ClassChip cls={airport.cls} />
              <span className="w-11 font-mono text-sm font-semibold text-amber">{airport.icao}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{airport.name}</span>
              <span className="tnum font-mono text-xs text-muted">{nm < 10 ? nm.toFixed(1) : Math.round(nm)}</span>
            </button>
          ))}
        </div>
      )}
      {geoNote && <span className="glass rounded-full px-3 py-1 text-xs text-warn">{geoNote}</span>}
    </div>
  );
}

function LegendRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-4 justify-center">{swatch}</span>
      {children}
    </li>
  );
}

function windLineFor(metar: Metar | undefined) {
  if (!metar) return null;
  if (metar.wspd == null) return "Wind —";
  if (metar.wdir == null) return `VRB / ${Math.round(metar.wspd)} kt`;
  return `${hdgText(metar.wdir)}° / ${Math.round(metar.wspd)} kt`;
}

export function AirportCard() {
  const selected = useEfb((s) => s.selected);
  const airport = selected ? getAirport(selected) : undefined;
  const route = useEfb((s) => s.route);
  const setOrigin = useEfb((s) => s.setOrigin);
  const setDest = useEfb((s) => s.setDest);
  const addStop = useEfb((s) => s.addStop);
  const directTo = useEfb((s) => s.directTo);
  const select = useEfb((s) => s.select);
  const setWind = useEfb((s) => s.setWind);
  const setRwyHdg = useEfb((s) => s.setRwyHdg);
  const wx = useWeather(airport ? [airport.icao] : []);
  if (!airport) return null;
  const metar = wx.data?.metars.find((m) => m.icao === airport.icao);
  const favored = favoredRunway(airport.rwy, metar?.wdir ?? null, metar?.wspd ?? null);
  const ends = runwayEnds(airport.rwy);
  const diagramHdg = favored?.hdg ?? ends[0]?.hdg ?? airport.hdg ?? 0;
  const onRoute = route.includes(airport.icao);
  const sun = sunClock(airport.lat, airport.lon);

  return (
    <section
      className="glass pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[calc(100%-1rem)] animate-sheet-up overflow-auto rounded-[1.1rem] p-4 sm:inset-x-auto sm:bottom-[5.5rem] sm:left-3 sm:max-h-[calc(100%-6.5rem)] sm:w-[22.5rem]"
      aria-label={`${airport.icao} details`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xl leading-none font-semibold text-amber">{airport.icao}</span>
            <ClassChip cls={airport.cls} />
            {metar ? <CatBadge cat={metar.fltCat} /> : wx.loading ? <span className="text-xs text-faint">loading wx…</span> : <CatBadge cat={null} />}
            {onRoute && (
              <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-amber">ON ROUTE</span>
            )}
          </div>
          <h2 className="mt-1.5 truncate text-base leading-tight font-semibold">{airport.name}</h2>
          <p className="text-xs text-muted">
            {airport.city} · {airport.elev.toLocaleString()} ft MSL
          </p>
        </div>
        <IconBtn label="Close airport" onClick={() => select(null)} className="-mt-1 -mr-1 size-9 text-muted">
          <X className="size-4" />
        </IconBtn>
      </div>

      <div className="mt-3 flex gap-3">
        <div className="shrink-0">
          <WindRunway
            rwyHdg={diagramHdg}
            rwyLabel={favored && !favored.calm ? `RWY ${favored.label}` : ends[0] ? `RWY ${ends[0].label}` : undefined}
            wdir={metar?.wdir ?? null}
            wspd={metar?.wspd ?? null}
            size={84}
          />
        </div>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-xs">
          <dt className="text-faint">Wind</dt>
          <dd className="tnum truncate font-mono text-fg">{windLineFor(metar) ?? (wx.loading ? "…" : "No METAR")}</dd>
          {favored && !favored.calm && (
            <>
              <dt className="text-faint">Comp.</dt>
              <dd className="tnum truncate font-mono">
                <span className={favored.head >= 0 ? "text-good" : "text-bad"}>
                  {Math.abs(Math.round(favored.head))} {favored.head >= 0 ? "hd" : "tl"}
                </span>
                <span className="text-faint"> · </span>
                <span className={Math.abs(favored.cross) >= 15 ? "text-warn" : "text-fg"}>{Math.round(Math.abs(favored.cross))} xw</span>
              </dd>
            </>
          )}
          {metar?.altim != null && (
            <>
              <dt className="text-faint">Altim</dt>
              <dd className="tnum font-mono">
                {(metar.altim > 100 ? metar.altim * 0.02953 : metar.altim).toFixed(2)}
                {metar.temp != null ? ` · ${Math.round(metar.temp)}°C` : ""}
              </dd>
            </>
          )}
          <dt className="text-faint">Rwy</dt>
          <dd className="truncate font-mono">{airport.rwy || "—"}</dd>
          {airport.freq && (
            <>
              <dt className="text-faint">{airport.cls === "E" ? "CTAF" : "TWR"}</dt>
              <dd className="font-mono">{airport.freq}</dd>
            </>
          )}
          <dt className="text-faint">Sun</dt>
          <dd className="tnum font-mono">
            {fmtClock(sun.riseMin)}–{fmtClock(sun.setMin)}
          </dd>
        </dl>
      </div>

      {metar?.raw && (
        <p className="mt-3 line-clamp-2 rounded-[0.625rem] bg-bg/60 px-2.5 py-1.5 font-mono text-[0.6875rem] leading-relaxed text-muted">
          {metar.raw}
        </p>
      )}

      {favored && !favored.calm && metar?.wdir != null && (
        <Btn
          size="sm"
          className="mt-2 w-full"
          icon={<Wind className="size-3.5" />}
          onClick={() => {
            setWind(metar.wdir ?? 0, metar.wspd ?? 0);
            setRwyHdg(favored.hdg);
          }}
        >
          Use this wind and RWY {favored.label} on the plan
        </Btn>
      )}

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <CardAction icon={PlaneTakeoff} label="From" onClick={() => setOrigin(airport.icao)} />
        <CardAction icon={PlaneLanding} label="To" onClick={() => setDest(airport.icao)} />
        <CardAction icon={Plus} label="Add" onClick={() => addStop(airport.icao)} />
        <CardAction
          icon={() => <span className="font-mono text-[0.95rem] leading-none font-bold">D→</span>}
          label="Direct"
          primary
          onClick={() => directTo(airport.icao)}
        />
      </div>
      <AirportLinks airport={airport} />
      <NotamList icaos={[airport.icao]} compact />
      <p className="mt-2 text-[0.6875rem] leading-snug text-faint">Planning data — confirm class and frequencies in the Chart Supplement.</p>
    </section>
  );
}

function CardAction({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: LucideIcon | (() => ReactNode);
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex h-14 flex-col items-center justify-center gap-1 rounded-[0.75rem] text-[0.6875rem] font-semibold transition-colors active:scale-[0.97]",
        primary ? "bg-amber text-ink hover:brightness-110" : "border border-line bg-surface hover:border-line-strong hover:bg-hover",
      )}
    >
      <Icon className="size-[1.1rem]" />
      {label}
    </button>
  );
}

/* ================================================================== */
/* Plan                                                                */
/* ================================================================== */

function parseRoute(text: string): { ids: string[]; bad: string[] } {
  const ids: string[] = [];
  const bad: string[] = [];
  for (const raw of text.toUpperCase().split(/[\s,>-]+/)) {
    const t = raw.trim();
    if (!t || t === "DCT") continue;
    const hit = getAirport(t) ?? (t.length === 3 ? getAirport(`K${t}`) : undefined) ?? searchAirports(t).find((a) => a.lid === t || a.iata === t);
    if (hit) ids.push(hit.icao);
    else bad.push(t);
  }
  return { ids, bad };
}

function RouteEntry() {
  const route = useEfb((s) => s.route);
  const setRoute = useEfb((s) => s.setRoute);
  const [text, setText] = useState(route.join(" "));
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  useEffect(() => {
    if (!editing) setText(route.join(" "));
  }, [route, editing]);

  const apply = () => {
    const parsed = parseRoute(text);
    setBad(parsed.bad);
    if (parsed.ids.length) {
      setRoute(parsed.ids);
      requestAnimationFrame(() => fitAirports(parsed.ids));
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="field font-mono uppercase"
          value={text}
          placeholder="KAPA KBJC KLMO"
          aria-label="Route string"
          spellCheck={false}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            apply();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
      {bad.length > 0 && <p className="mt-1 text-xs text-warn">Not found: {bad.join(", ")}</p>}
    </div>
  );
}

export function PlanPanel() {
  const route = useEfb((s) => s.route);
  const aircraft = useEfb((s) => s.aircraft);
  const windFrom = useEfb((s) => s.windFrom);
  const windKts = useEfb((s) => s.windKts);
  const setWind = useEfb((s) => s.setWind);
  const setRoute = useEfb((s) => s.setRoute);
  const setTab = useEfb((s) => s.setTab);
  const removeAt = useEfb((s) => s.removeAt);
  const move = useEfb((s) => s.move);
  const focus = useEfb((s) => s.focus);
  const windMode = useEfb((s) => s.windMode);
  const legs = useLegs();
  const sum = totals(legs);
  const overFuel = sum.gal > aircraft.usableGal;
  const departHour = useEfb((s) => s.departHour);
  const origin = route.length ? getAirport(route[0]) : undefined;
  const sun = origin ? sunClock(origin.lat, origin.lon) : null;
  const night = origin ? isLocalNight(origin.lat, origin.lon, departHour) : false;
  const fuelPct = aircraft.usableGal > 0 ? Math.min(1, sum.gal / aircraft.usableGal) : 0;
  const reserveGal = (aircraft.burnGph * (night ? 45 : 30)) / 60;
  const reservePct = aircraft.usableGal > 0 ? Math.min(1, reserveGal / aircraft.usableGal) : 0;
  const tight = sum.gal + reserveGal > aircraft.usableGal;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionTitle>Route</SectionTitle>
        <RouteEntry />
        {route.length === 0 && (
          <p className="rounded-[0.75rem] border border-dashed border-line-strong p-4 text-center text-sm text-muted">
            Type idents above, search an airport, or load a practice route below.
          </p>
        )}
        <ol className="relative flex flex-col">
          {route.map((id, i) => {
            const a = getAirport(id);
            const leg = legs[i];
            const first = i === 0;
            const last = i === route.length - 1;
            return (
              <li key={`${id}-${i}`} className="relative">
                <div className="group flex items-center gap-2 rounded-[0.75rem] py-1 pr-1 hover:bg-surface">
                  <div className="relative flex w-8 shrink-0 justify-center self-stretch">
                    {!first && <span className="absolute top-0 h-1/2 w-0.5 bg-amber/50" />}
                    {!last && <span className="absolute bottom-0 h-1/2 w-0.5 bg-amber/50" />}
                    <span
                      className={cx(
                        "relative z-10 my-auto flex size-6 items-center justify-center rounded-full font-mono text-[0.625rem] font-bold",
                        first || last ? "bg-amber text-ink" : "border-2 border-amber bg-bg text-amber",
                      )}
                    >
                      {first ? <PlaneTakeoff className="size-3" /> : last ? <PlaneLanding className="size-3" /> : i}
                    </span>
                  </div>
                  <button className="min-w-0 flex-1 py-1.5 text-left" onClick={() => focus(id)}>
                    <span className="font-mono text-sm font-semibold text-amber">{id}</span>
                    <span className="ml-2 truncate text-xs text-muted">{a?.name}</span>
                  </button>
                  <div className="flex opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <IconBtn label="Move up" className="size-8" disabled={first} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </IconBtn>
                    <IconBtn label="Move down" className="size-8" disabled={last} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </IconBtn>
                    <IconBtn label="Remove" className="size-8 text-muted hover:text-bad" onClick={() => removeAt(i)}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  </div>
                </div>
                {leg && (
                  <div className="flex items-center gap-2 py-0.5 pl-10 font-mono text-[0.6875rem] text-faint">
                    <span className="tnum">{hdgText(leg.mc)}°</span>
                    <span>·</span>
                    <span className="tnum">{fmtNm(leg.nm)} nm</span>
                    <span>·</span>
                    <span className="tnum">GS {leg.gs < 1 ? "—" : Math.round(leg.gs)}</span>
                    <span>·</span>
                    <span className="tnum">{fmtMin(leg.min)}</span>
                    {leg.windSource === "forecast" && (
                      <span className="tnum text-cyan">
                        · {hdgText(leg.windFrom)}/{leg.windKts}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {route.length >= 2 && (
          <p className="text-xs text-faint">Tip: tap the route line on the map to insert the nearest field.</p>
        )}
      </section>

      {route.length >= 2 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Totals</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <Readout label="Dist" value={fmtNm(sum.nm)} unit="nm" />
            <Readout label="ETE" value={fmtMin(sum.min)} />
            <Readout label="Fuel" value={fmtGal(sum.gal)} unit="gal" tone={overFuel ? "bad" : tight ? "warn" : undefined} />
          </div>
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <Fuel className="size-3.5" /> Burn vs usable
              </span>
              <span className={cx("tnum font-mono", overFuel ? "text-bad" : tight ? "text-warn" : "text-fg")}>
                {fmtGal(sum.gal)} / {aircraft.usableGal} gal
              </span>
            </div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-raised">
              <div
                className={cx("h-full rounded-full", overFuel ? "bg-bad" : tight ? "bg-warn" : "bg-good")}
                style={{ width: `${fuelPct * 100}%` }}
              />
              <div
                className="absolute inset-y-0 border-l-2 border-dashed border-fg/60"
                style={{ left: `${(1 - reservePct) * 100}%` }}
                title="Reserve"
              />
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-faint">
              Dashed mark: {night ? "night" : "day"} VFR reserve ({night ? 45 : 30} min · {fmtGal(reserveGal)} gal)
              {overFuel ? " — over usable fuel" : tight ? " — eats into reserve" : ""}
            </p>
          </Card>
          <Btn variant="primary" className="w-full" icon={<ClipboardList className="size-4" />} onClick={() => setTab("docs")}>
            Open flight file
          </Btn>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle>Winds aloft</SectionTitle>
        <WindModeSwitch />
        <div className="grid grid-cols-2 gap-2">
          <NumField label={windMode === "forecast" ? "Fallback from" : "From"} value={windFrom} pad={3} suffix="°" min={0} max={360} onChange={(n) => setWind(n, windKts)} />
          <NumField label="Speed" value={windKts} suffix="kt" min={0} max={120} onChange={(n) => setWind(windFrom, n)} />
        </div>
        {windMode === "manual" && (
          <p className="text-xs text-faint">One wind for the whole route at {aircraft.cruiseFt.toLocaleString()} ft.</p>
        )}
      </section>

      <SavedPlans />

      {sun && (
        <Card className="flex items-center gap-3 p-3">
          <Sunrise className={cx("size-5 shrink-0", night ? "text-warn" : "text-muted")} />
          <div className="tnum font-mono text-xs leading-relaxed">
            <div>
              Sun {fmtClock(sun.riseMin)}–{fmtClock(sun.setMin)}
            </div>
            <div className="text-faint">
              Civil twilight {fmtClock(sun.civilStartMin)}–{fmtClock(sun.civilEndMin)}
              {night ? <span className="text-warn"> · departs at night</span> : ""}
            </div>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle
          action={
            route.length > 0 && (
              <Btn variant="danger" size="sm" onClick={() => setRoute([])}>
                Clear route
              </Btn>
            )
          }
        >
          Practice routes
        </SectionTitle>
        <div className="grid grid-cols-1 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="flex items-center justify-between gap-2 rounded-[0.75rem] border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong hover:bg-hover"
              onClick={() => {
                setRoute(p.ids);
                requestAnimationFrame(() => fitAirports(p.ids));
              }}
            >
              <span className="text-sm font-medium">{p.name}</span>
              <span className="truncate font-mono text-[0.6875rem] text-faint">{p.ids.join(" ")}</span>
            </button>
          ))}
        </div>
      </section>
      <OfflineSave />
      <SyncPanel />
      <DataBackup />
      <p className="text-xs leading-relaxed text-faint">
        Beta. Not for flight. Not a certified EFB. Check official charts, weather, and NOTAMs.
      </p>
    </div>
  );
}

/* ================================================================== */
/* Weather                                                             */
/* ================================================================== */

export function WxPanel() {
  const route = useEfb((s) => s.route);
  const selected = useEfb((s) => s.selected);
  const focus = useEfb((s) => s.focus);
  const ids = [...new Set([...route, ...(selected ? [selected] : [])])];
  const { data, loading, failed, reload } = useWeather(ids);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="tnum font-mono text-xs text-muted">
          {data?.fetchedAt && data.source === "live" ? `Updated ${data.fetchedAt.slice(11, 16)}Z` : loading ? "Loading…" : ""}
        </p>
        <Btn
          size="sm"
          onClick={reload}
          disabled={loading || ids.length === 0}
          icon={<RefreshCw className={cx("size-3.5", loading && "animate-spin")} />}
        >
          Refresh
        </Btn>
      </div>
      {ids.length > 0 && data?.metars.length ? (
        <div className="flex h-2 overflow-hidden rounded-full">
          {ids.map((id) => {
            const m = data.metars.find((x) => x.icao === id);
            return <span key={id} className="flex-1" style={{ background: catColor(m?.fltCat) }} title={`${id} ${m?.fltCat ?? ""}`} />;
          })}
        </div>
      ) : null}
      {ids.length === 0 && <p className="text-sm text-muted">Add an airport to pull METAR and TAF.</p>}
      {failed && ids.length > 0 && (
        <p className="rounded-[0.75rem] border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">Live weather is unavailable right now.</p>
      )}
      {ids.map((id) => {
        const metar = data?.metars.find((m) => m.icao === id);
        const taf = data?.tafs.find((t) => t.icao === id);
        const a = getAirport(id);
        return (
          <article key={id} className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="h-1" style={{ background: catColor(metar?.fltCat) }} />
            <div className="p-3">
              <div className="flex items-center gap-2">
                <button className="font-mono text-base font-semibold text-amber hover:underline" onClick={() => focus(id)}>
                  {id}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{a?.name}</span>
                {metar && <CatBadge cat={metar.fltCat} />}
              </div>
              {metar ? (
                <>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    <MiniStat k="Wind" v={metar.wspd != null ? `${metar.wdir == null ? "VRB" : hdgText(metar.wdir)}/${Math.round(metar.wspd)}` : "—"} />
                    <MiniStat k="Vis" v={metar.visib ? `${metar.visib}` : "—"} />
                    <MiniStat k="Temp" v={metar.temp != null ? `${Math.round(metar.temp)}/${metar.dewp != null ? Math.round(metar.dewp) : "—"}` : "—"} />
                    <MiniStat k="Altim" v={metar.altim != null ? (metar.altim > 100 ? metar.altim * 0.02953 : metar.altim).toFixed(2) : "—"} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    <span className="text-faint">Sky </span>
                    {metar.sky}
                    {metar.obs && <span className="text-faint"> · obs {metar.obs}</span>}
                  </p>
                  <p className="mt-2 rounded-[0.5rem] bg-bg px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed">{metar.raw}</p>
                </>
              ) : (
                !loading && <p className="mt-2 text-xs text-muted">No METAR reported</p>
              )}
              {taf && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-xs font-semibold text-muted select-none hover:text-fg">TAF</summary>
                  <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-line text-muted">
                    {taf.raw.replace(/\s(FM\d{6}|TEMPO|BECMG|PROB\d{2})/g, "\n$1")}
                  </p>
                </details>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[0.5rem] bg-bg px-2 py-1.5">
      <div className="text-[0.625rem] font-semibold tracking-wider text-faint uppercase">{k}</div>
      <div className="tnum truncate font-mono text-xs font-medium">{v}</div>
    </div>
  );
}

/* ================================================================== */
/* Aircraft                                                            */
/* ================================================================== */

export function AircraftPanel() {
  const aircraft = useEfb((s) => s.aircraft);
  const setAircraft = useEfb((s) => s.setAircraft);
  const apply = useEfb((s) => s.applyProfile);

  return (
    <div className="flex flex-col gap-5">
      <MyAircraft />
      <section className="flex flex-col gap-2">
        <SectionTitle>Sample profiles</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {PROFILES.map((p) => {
            const on = aircraft.profileId === p.profileId;
            return (
              <button
                key={p.profileId}
                onClick={() => apply(p.profileId)}
                className={cx(
                  "rounded-[0.75rem] border px-3 py-2.5 text-left transition-colors",
                  on ? "border-amber bg-amber-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <div className={cx("text-sm font-semibold", on && "text-amber")}>{p.name}</div>
                <div className="tnum font-mono text-[0.6875rem] text-muted">
                  {p.tas} kt · {p.burnGph} gph
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Identity</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Type</span>
            <input className="field" value={aircraft.name} onChange={(e) => setAircraft({ name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Tail</span>
            <input
              className="field font-mono uppercase"
              value={aircraft.tail}
              onChange={(e) => setAircraft({ tail: e.target.value.toUpperCase() })}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Cruise</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="True airspeed" suffix="kt" value={aircraft.tas} min={30} max={400} onChange={(n) => setAircraft({ tas: n })} />
          <NumField label="Fuel burn" suffix="gph" value={aircraft.burnGph} min={0} max={100} onChange={(n) => setAircraft({ burnGph: n })} />
          <NumField label="Usable fuel" suffix="gal" value={aircraft.usableGal} min={0} max={400} onChange={(n) => setAircraft({ usableGal: n })} />
          <NumField label="Cruise alt" suffix="ft" value={aircraft.cruiseFt} min={0} max={25000} onChange={(n) => setAircraft({ cruiseFt: n })} />
          <NumField label="Best glide" suffix=": 1" value={aircraft.glide ?? 9} min={3} max={30} onChange={(n) => setAircraft({ glide: n })} />
          <NumField label="Demo crosswind" suffix="kt" value={aircraft.maxXwind ?? 15} min={0} max={40} onChange={(n) => setAircraft({ maxXwind: n })} />
        </div>
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line">
          <div className="bg-surface p-3">
            <div className="eyebrow">Endurance</div>
            <div className="tnum mt-1 font-mono text-lg">
              {aircraft.burnGph > 0 ? fmtMin((aircraft.usableGal / aircraft.burnGph) * 60) : "—"}
            </div>
          </div>
          <div className="bg-surface p-3">
            <div className="eyebrow">Range (no wind)</div>
            <div className="tnum mt-1 font-mono text-lg">
              {aircraft.burnGph > 0 ? Math.round((aircraft.usableGal / aircraft.burnGph) * aircraft.tas) : "—"}
              <span className="ml-1 text-xs text-muted">nm</span>
            </div>
          </div>
        </Card>
      </section>
      <p className="text-xs leading-relaxed text-faint">
        Sample profiles — not your POH. Weight and performance live in the flight file.
      </p>
    </div>
  );
}

/* ================================================================== */
/* Instrument strip                                                    */
/* ================================================================== */

function Tile({ k, v, unit, tone, wide }: { k: string; v: ReactNode; unit?: string; tone?: "amber" | "warn" | "bad"; wide?: boolean }) {
  return (
    <div className={cx("flex min-w-[4.75rem] shrink-0 flex-col justify-center border-r border-line px-3 last:border-r-0", wide && "min-w-[6.5rem]")}>
      <span className="text-[0.625rem] font-semibold tracking-[0.12em] text-faint uppercase">{k}</span>
      <span
        className={cx(
          "tnum font-mono text-base leading-tight font-medium whitespace-nowrap sm:text-lg",
          tone === "amber" && "text-amber",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
        )}
      >
        {v}
        {unit && <span className="ml-0.5 text-[0.6875rem] font-normal text-faint">{unit}</span>}
      </span>
    </div>
  );
}

export function InstrumentBar() {
  const route = useEfb((s) => s.route);
  const aircraft = useEfb((s) => s.aircraft);
  const windFrom = useEfb((s) => s.windFrom);
  const windKts = useEfb((s) => s.windKts);
  const progressNm = useEfb((s) => s.progressNm);
  const flying = useEfb((s) => s.flying);
  const setFlying = useEfb((s) => s.setFlying);
  const setProgress = useEfb((s) => s.setProgressNm);
  const tracking = useTrack((s) => s.tracking);
  const follow = useTrack((s) => s.follow);
  const fix = useTrack((s) => s.fix);
  const gpsError = useTrack((s) => s.error);
  const setTracking = useTrack((s) => s.setTracking);
  const setFollow = useTrack((s) => s.setFollow);
  const legs = useLegs();
  const sum = totals(legs);
  const totalNm = routeDistance(route);
  const remain = Math.max(0, totalNm - progressNm);
  const upcoming = tracking && fix ? nextFix(route, fix) : null;

  // Walk the legs once: find the active leg and what is left of time and fuel.
  let acc = 0;
  let legIndex = -1;
  let remainMin = 0;
  let remainGal = 0;
  for (let i = 0; i < legs.length; i++) {
    const start = acc;
    acc += legs[i].nm;
    if (legIndex < 0 && progressNm <= acc) legIndex = i;
    const left = Math.max(0, Math.min(legs[i].nm, acc - Math.max(progressNm, start)));
    const frac = legs[i].nm > 0 ? left / legs[i].nm : 0;
    if (Number.isFinite(legs[i].min)) remainMin += legs[i].min * frac;
    if (Number.isFinite(legs[i].gal)) remainGal += legs[i].gal * frac;
  }
  if (legIndex < 0) legIndex = legs.length - 1;
  const leg = legs[legIndex];
  const pct = totalNm > 0 ? Math.min(1, progressNm / totalNm) : 0;
  const eteNext = upcoming && fix?.gsKt && fix.gsKt > 20 ? (upcoming.nm / fix.gsKt) * 60 : null;

  return (
    <div className="glass relative overflow-hidden rounded-card">
      {!tracking && route.length >= 2 && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-line">
          <div className="h-full bg-amber transition-[width] duration-100" style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center gap-1.5 border-r border-line p-1.5">
          <button
            aria-label={tracking ? "Stop GPS tracking" : "Track my position"}
            className={cx(
              "flex h-11 items-center gap-1.5 rounded-[0.625rem] px-3 text-sm font-semibold transition-colors",
              tracking ? "bg-good/15 text-good ring-1 ring-good/40" : "bg-amber text-ink hover:brightness-110",
            )}
            onClick={() => {
              if (tracking) {
                setTracking(false);
                return;
              }
              setFlying(false);
              setTracking(true);
            }}
          >
            <LocateFixed className={cx("size-4", tracking && !fix && "animate-pulse")} />
            <span className="hidden sm:inline">{tracking ? "Tracking" : "Track"}</span>
          </button>
          {!tracking && route.length >= 2 && (
            <IconBtn
              label={flying ? "Pause preview" : "Preview the route"}
              active={flying}
              onClick={() => {
                if (flying) {
                  setFlying(false);
                  return;
                }
                if (progressNm >= totalNm - 0.2) setProgress(0);
                setFlying(true);
              }}
            >
              {flying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </IconBtn>
          )}
          {tracking && !follow && fix && (
            <Btn size="sm" onClick={() => setFollow(true)} icon={<Navigation className="size-3.5" />}>
              Follow
            </Btn>
          )}
          <NearestButton compact />
        </div>

        <div className="flex min-w-0 flex-1 overflow-x-auto py-1.5 [scrollbar-width:none]">
          {tracking ? (
            <>
              <Tile k="GS" v={fix?.gsKt != null ? Math.round(fix.gsKt) : "—"} unit="kt" />
              <Tile k="TRK" v={fix?.track != null ? `${hdgText(fix.track)}°` : "—"} />
              <Tile k="GPS ALT" v={fix?.altFt != null ? Math.round(fix.altFt).toLocaleString() : "—"} unit="ft" wide />
              <Tile k="NEXT" v={upcoming?.icao ?? "—"} tone="amber" />
              <Tile k="DTK" v={upcoming ? `${hdgText(upcoming.mc)}°` : "—"} />
              <Tile k="DIST" v={upcoming ? fmtNm(upcoming.nm) : "—"} unit="nm" />
              <Tile k="ETE" v={eteNext != null ? fmtMin(eteNext) : "—"} />
              <div className="flex min-w-0 flex-1 items-center px-3 text-[0.6875rem] text-faint">
                {gpsError ? <span className="text-bad">{gpsError}</span> : !fix ? "Waiting for GPS fix…" : "Not a navigation GPS"}
              </div>
            </>
          ) : route.length >= 2 ? (
            <>
              <Tile
                k="LEG"
                v={leg ? `${leg.from.replace(/^K/, "")}›${leg.to.replace(/^K/, "")}` : "—"}
                tone="amber"
                wide
              />
              <Tile k="MC" v={leg ? `${hdgText(leg.mc)}°` : "—"} />
              <Tile k="GS" v={leg && leg.gs >= 1 ? Math.round(leg.gs) : "—"} unit="kt" />
              <Tile k="DIST" v={fmtNm(remain)} unit="nm" />
              <Tile k="ETE" v={fmtMin(remainMin)} />
              <Tile k="FUEL" v={fmtGal(flying || progressNm > 0 ? remainGal : sum.gal)} unit="gal" tone={sum.gal > aircraft.usableGal ? "bad" : undefined} />
              <Tile k="HDG" v={leg ? `${hdgText(leg.mh)}°` : "—"} />
              <Tile k="WIND" v={leg ? `${hdgText(leg.windFrom)}/${leg.windKts}` : `${hdgText(windFrom)}/${windKts}`} />
            </>
          ) : (
            <div className="flex items-center px-3 text-xs text-muted">
              Search or tap an airport to start a route. <span className="ml-1 hidden sm:inline">Track uses this device's GPS.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
