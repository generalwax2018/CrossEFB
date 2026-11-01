import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CloudSun,
  LocateFixed,
  Map as MapIcon,
  Moon,
  Plane,
  Play,
  Pause,
  Plus,
  Route,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { getAirport, PRESETS, searchAirports } from "@/lib/efb/airports";
import { buildLegs, fmtGal, fmtMin, fmtNm, hdgText, routeDistance, totals } from "@/lib/efb/nav";
import { useEfb } from "@/lib/efb/store";
import type { Tab, WxBundle } from "@/lib/efb/types";
import { fetchWeather } from "@/lib/efb/weather";
import { fitAirports } from "./chart";

const wxCache = new Map<string, { at: number; data: WxBundle }>();

export function useWeather(icaos: string[]) {
  const key = icaos.join(",");
  const [data, setData] = useState<WxBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async (force: boolean) => {
    if (!key) {
      setData(null);
      setFailed(false);
      return;
    }
    const hit = wxCache.get(key);
    if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) {
      setData(hit.data);
      setFailed(hit.data.source !== "live");
      return;
    }
    setLoading(true);
    try {
      const bundle = await fetchWeather({ data: { icaos } });
      wxCache.set(key, { at: Date.now(), data: bundle });
      setData(bundle);
      setFailed(bundle.source !== "live" || bundle.metars.length === 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, failed, reload: () => void load(true) };
}

export function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = q.trim() ? searchAirports(q) : [];
  const focus = useEfb((s) => s.focus);

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={q}
        aria-label="Search airports"
        placeholder="Airport, city, or ident"
        className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            focus(results[0].icao);
            setQ("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="absolute top-12 z-20 max-h-80 w-full overflow-auto rounded-md border border-line bg-surface shadow-lg">
          {results.map((a) => (
            <li key={a.icao}>
              <button
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-raised"
                onClick={() => {
                  focus(a.icao);
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="font-mono text-sm text-amber">{a.icao}</span>
                <span className="truncate text-sm">{a.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{a.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ZuluClock() {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => setText(new Date().toISOString().slice(11, 19) + "Z");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-xs text-muted">{text}</span>;
}

export function ChartTools() {
  const mode = useEfb((s) => s.chartMode);
  const setMode = useEfb((s) => s.setChartMode);
  const setView = useEfb((s) => s.setView);
  const [geoNote, setGeoNote] = useState("");

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <ToolButton
        label="My position"
        onClick={() => {
          if (!navigator.geolocation) {
            setGeoNote("No GPS");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGeoNote("");
              const s = useEfb.getState();
              s.setView(pos.coords.latitude, pos.coords.longitude, Math.max(s.pxPerNm, 8));
            },
            () => setGeoNote("GPS blocked"),
            { enableHighAccuracy: true, timeout: 8000 },
          );
        }}
      >
        <LocateFixed className="size-5" />
      </ToolButton>
      <ToolButton
        label={mode === "night" ? "Day chart" : "Night chart"}
        onClick={() => setMode(mode === "night" ? "day" : "night")}
      >
        {mode === "night" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </ToolButton>
      <ToolButton
        label="Zoom in"
        onClick={() => {
          const s = useEfb.getState();
          setView(s.lat, s.lon, s.pxPerNm * 1.25);
        }}
      >
        <Plus className="size-5" />
      </ToolButton>
      <ToolButton
        label="Zoom out"
        onClick={() => {
          const s = useEfb.getState();
          setView(s.lat, s.lon, s.pxPerNm / 1.25);
        }}
      >
        <span className="text-lg leading-none">−</span>
      </ToolButton>
      {geoNote && (
        <span className="rounded-md bg-bg/90 px-2 py-1 text-center text-xs text-amber">{geoNote}</span>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-bg/90 text-fg"
    >
      {children}
    </button>
  );
}

export function AirportCard() {
  const selected = useEfb((s) => s.selected);
  const airport = selected ? getAirport(selected) : undefined;
  const setOrigin = useEfb((s) => s.setOrigin);
  const setDest = useEfb((s) => s.setDest);
  const addStop = useEfb((s) => s.addStop);
  const directTo = useEfb((s) => s.directTo);
  const select = useEfb((s) => s.select);
  if (!airport) return null;

  return (
    <section className="pointer-events-auto absolute bottom-16 left-3 z-10 w-72 max-w-[calc(100%-4.5rem)] rounded-md border border-line bg-bg/95 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm text-amber">{airport.icao}</div>
          <h2 className="text-base font-semibold leading-tight">{airport.name}</h2>
          <p className="text-xs text-muted">
            {airport.city} · {airport.elev.toLocaleString()} ft · Class {airport.cls}
          </p>
        </div>
        <button aria-label="Close airport" className="px-2 text-muted" onClick={() => select(null)}>
          ×
        </button>
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {airport.rwy}
        {airport.freq ? ` · ${airport.freq}` : ""}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted">Class and frequency are planning data. Confirm them in the Chart Supplement.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CardButton label="Origin" onClick={() => setOrigin(airport.icao)} />
        <CardButton label="Destination" onClick={() => setDest(airport.icao)} />
        <CardButton label="Add stop" onClick={() => addStop(airport.icao)} />
        <CardButton label="Direct" onClick={() => directTo(airport.icao)} />
      </div>
    </section>
  );
}

function CardButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-11 rounded-md border border-line bg-surface text-sm hover:bg-raised"
    >
      {label}
    </button>
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
  const legs = buildLegs(route, aircraft, windFrom, windKts);
  const sum = totals(legs);
  const overFuel = sum.gal > aircraft.usableGal;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide">ROUTE</h2>
        {route.length === 0 && (
          <p className="mt-2 text-sm text-muted">Search an airport, or load a Colorado practice route.</p>
        )}
        <ol className="mt-2 flex flex-col gap-1">
          {route.map((id, i) => {
            const a = getAirport(id);
            return (
              <li key={`${id}-${i}`} className="flex items-center gap-2 rounded-md bg-surface px-2">
                <button className="min-w-0 flex-1 py-2 text-left" onClick={() => focus(id)}>
                  <span className="font-mono text-sm text-amber">{id}</span>
                  <span className="ml-2 text-xs text-muted">{a?.name}</span>
                </button>
                <button aria-label="Move up" className="flex h-11 w-8 items-center justify-center" onClick={() => move(i, -1)}>
                  <ChevronUp className="size-4" />
                </button>
                <button aria-label="Move down" className="flex h-11 w-8 items-center justify-center" onClick={() => move(i, 1)}>
                  <ChevronDown className="size-4" />
                </button>
                <button aria-label="Remove" className="flex h-11 w-8 items-center justify-center text-muted" onClick={() => removeAt(i)}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {legs.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Leg</th>
              <th className="font-medium">NM</th>
              <th className="font-medium">MC</th>
              <th className="font-medium">GS</th>
              <th className="font-medium">ETE</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {legs.map((l) => (
              <tr key={l.from + l.to} className="border-t border-line">
                <td className="py-1">
                  {l.from.replace(/^K/, "")}–{l.to.replace(/^K/, "")}
                </td>
                <td>{fmtNm(l.nm)}</td>
                <td>{hdgText(l.mc)}</td>
                <td>{l.gs < 1 ? "—" : Math.round(l.gs)}</td>
                <td>{fmtMin(l.min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Wind from
          <input
            inputMode="numeric"
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
            value={windFrom}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) setWind(n, windKts);
            }}
          />
        </label>
        <label className="text-xs text-muted">
          Wind kt
          <input
            inputMode="numeric"
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
            value={windKts}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) setWind(windFrom, n);
            }}
          />
        </label>
      </div>

      {route.length >= 2 && (
        <p className={`font-mono text-sm ${overFuel ? "text-amber" : "text-fg"}`}>
          {fmtNm(sum.nm)} NM · {fmtMin(sum.min)} · {fmtGal(sum.gal)} gal
          {overFuel ? " · over usable" : ""}
        </p>
      )}
      {route.length >= 2 && (
        <button
          className="h-11 rounded-md bg-amber px-3 text-left text-sm font-medium text-ink"
          onClick={() => setTab("docs")}
        >
          Open flight file
        </button>
      )}

      <div className="flex flex-col gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="h-11 rounded-md border border-line bg-surface px-3 text-left text-sm hover:bg-raised"
            onClick={() => {
              setRoute(p.ids);
              requestAnimationFrame(() => fitAirports(p.ids));
            }}
          >
            {p.name}
          </button>
        ))}
        {route.length > 0 && (
          <button
            className="h-11 rounded-md px-3 text-left text-sm text-muted"
            onClick={() => setRoute([])}
          >
            Clear route
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Planning aid only. Not a certified EFB. Check official charts, weather, and NOTAMs.
      </p>
    </div>
  );
}

export function WxPanel() {
  const route = useEfb((s) => s.route);
  const selected = useEfb((s) => s.selected);
  const ids = [...new Set([...route, ...(selected ? [selected] : [])])];
  const { data, loading, failed, reload } = useWeather(ids);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide">WEATHER</h2>
        <button
          className="h-11 rounded-md border border-line px-3 text-sm"
          onClick={reload}
          disabled={loading || ids.length === 0}
        >
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>
      {ids.length === 0 && <p className="text-sm text-muted">Add an airport to pull METAR and TAF.</p>}
      {failed && ids.length > 0 && (
        <p className="text-sm text-amber">Live weather is unavailable right now.</p>
      )}
      {data?.fetchedAt && data.source === "live" && (
        <p className="font-mono text-xs text-muted">
          Retrieved {data.fetchedAt.slice(11, 16)}Z · aviationweather.gov
        </p>
      )}
      {ids.map((id) => {
        const metar = data?.metars.find((m) => m.icao === id);
        const taf = data?.tafs.find((t) => t.icao === id);
        const hot = metar && (metar.fltCat === "IFR" || metar.fltCat === "LIFR" || metar.fltCat === "MVFR");
        return (
          <article key={id} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-amber">{id}</span>
              {metar && (
                <span
                  className={`rounded px-2 py-0.5 font-mono text-xs ${hot ? "bg-amber text-ink" : "border border-line"}`}
                >
                  {metar.fltCat}
                </span>
              )}
              {metar?.obs && <span className="ml-auto font-mono text-xs text-muted">{metar.obs}</span>}
            </div>
            {metar ? (
              <>
                <p className="mt-2 font-mono text-xs leading-relaxed">{metar.raw}</p>
                <p className="mt-2 text-xs text-muted">
                  {metar.wspd != null
                    ? `Wind ${metar.wdir == null ? "VRB" : hdgText(metar.wdir)}° / ${Math.round(metar.wspd)} kt`
                    : "Wind —"}
                  {metar.visib ? ` · Vis ${metar.visib}` : ""}
                  {metar.temp != null ? ` · ${Math.round(metar.temp)}°C` : ""}
                  {metar.altim != null ? ` · ${metar.altim.toFixed(2)}` : ""}
                </p>
                <p className="text-xs text-muted">{metar.sky}</p>
              </>
            ) : (
              !loading && <p className="mt-2 text-xs text-muted">No METAR</p>
            )}
            {taf && <p className="mt-2 font-mono text-xs leading-relaxed text-muted">{taf.raw}</p>}
          </article>
        );
      })}
    </div>
  );
}

export function AircraftPanel() {
  const aircraft = useEfb((s) => s.aircraft);
  const setAircraft = useEfb((s) => s.setAircraft);
  const fields: { key: "name" | "tail" | "tas" | "burnGph" | "usableGal" | "cruiseFt"; label: string; numeric?: boolean }[] = [
    { key: "name", label: "Aircraft" },
    { key: "tail", label: "Tail" },
    { key: "tas", label: "TAS kt", numeric: true },
    { key: "burnGph", label: "Burn gph", numeric: true },
    { key: "usableGal", label: "Usable gal", numeric: true },
    { key: "cruiseFt", label: "Cruise ft", numeric: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide">AIRCRAFT</h2>
      <p className="text-sm text-muted">
        Cruise numbers for the plan. Sample weight and performance profiles are on the flight file.
      </p>
      {fields.map((f) => (
        <label key={f.key} className="text-xs text-muted">
          {f.label}
          <input
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg"
            inputMode={f.numeric ? "decimal" : "text"}
            value={aircraft[f.key] ?? ""}
            onChange={(e) => {
              if (!f.numeric) {
                setAircraft({ [f.key]: e.target.value });
                return;
              }
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) setAircraft({ [f.key]: n });
            }}
          />
        </label>
      ))}
      <p className="text-xs text-muted">
        CrossEFB is a planning aid for Android and PC. It is not approved for navigation.
      </p>
    </div>
  );
}

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "chart", label: "Chart", icon: MapIcon },
  { id: "plan", label: "Plan", icon: Route },
  { id: "wx", label: "Weather", icon: CloudSun },
  { id: "docs", label: "File", icon: ClipboardList },
  { id: "aircraft", label: "Aircraft", icon: Plane },
];

export function SideNav({ mobile }: { mobile?: boolean }) {
  const tab = useEfb((s) => s.tab);
  const setTab = useEfb((s) => s.setTab);
  const items = mobile ? NAV : NAV.filter((n) => n.id !== "chart");
  const active = tab === "chart" && !mobile ? "plan" : tab;

  return (
    <div className={mobile ? "grid grid-cols-5" : "flex border-b border-line"}>
      {items.map((item) => {
        const Icon = item.icon;
        const on = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${on ? "text-amber" : "text-muted"}`}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function ActivePanel() {
  const tab = useEfb((s) => s.tab);
  if (tab === "wx") return <WxPanel />;
  if (tab === "aircraft") return <AircraftPanel />;
  return <PlanPanel />;
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
  const legs = buildLegs(route, aircraft, windFrom, windKts);
  const sum = totals(legs);
  const totalNm = routeDistance(route);
  const remain = Math.max(0, totalNm - progressNm);

  if (route.length < 2) {
    return (
      <div className="flex h-12 items-center px-3 text-xs text-muted">
        Drag the chart. Tap an airport to start a route.
      </div>
    );
  }

  const leg = legs.find((_, i) => {
    let acc = 0;
    for (let k = 0; k <= i; k++) acc += legs[k].nm;
    return progressNm <= acc;
  }) ?? legs[legs.length - 1];

  return (
    <div className="flex h-12 items-center gap-3 px-3">
      <button
        aria-label={flying ? "Pause" : "Fly route"}
        className="flex h-9 w-9 items-center justify-center rounded-md bg-amber text-ink"
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
      </button>
      <p className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">
        {leg ? `${leg.from.replace(/^K/, "")}→${leg.to.replace(/^K/, "")} MC ${hdgText(leg.mc)}` : ""}
        {" · "}
        {fmtNm(remain)} NM left
        {" · "}
        GS {leg && leg.gs >= 1 ? Math.round(leg.gs) : "—"}
        {" · "}
        {fmtGal(sum.gal)} gal
        {" · "}
        {aircraft.cruiseFt.toLocaleString()} ft
      </p>
    </div>
  );
}
