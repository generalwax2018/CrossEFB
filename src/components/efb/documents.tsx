import { useMemo, useState, type ReactNode } from "react";
import { CHECKS, checkId, PROFILES, resolveAircraft } from "@/lib/efb/aircraft";
import { getAirport } from "@/lib/efb/airports";
import {
  hoursIn,
  hpaToInHg,
  performance,
  runwayFeet,
  scoreFrat,
  souls,
  weightBalance,
  windComponents,
} from "@/lib/efb/docs";
import { fmtGal, fmtMin, fmtNm, hdgText, totals } from "@/lib/efb/nav";
import { fmtClock, isLocalNight, sunClock } from "@/lib/efb/sun";
import { useEfb } from "@/lib/efb/store";
import type { DocId, LogEntry, Metar, Student } from "@/lib/efb/types";
import { useWeather } from "./panels";
import { useLegs, useLive } from "@/lib/efb/live-store";
import { tfrsOnRoute } from "@/lib/efb/live";
import { currency, goNoGo, logbookCsv } from "@/lib/efb/brief";
import { favoredRunway } from "@/lib/efb/docs";
import { download, NotamList } from "./extras";
import { useNotams } from "@/lib/efb/use-notams";
import { Btn, CatBadge, catColor, cx, NumField, Readout, Toggle } from "./ui";
import {
  BookOpen,
  CheckSquare,
  ClipboardCheck,
  CloudSun,
  Gauge,
  GraduationCap,
  KeyRound,
  Copy,
  Download,
  ExternalLink,
  Printer,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

const DOCS: { id: DocId; label: string; icon: LucideIcon }[] = [
  { id: "navlog", label: "Navlog", icon: ClipboardCheck },
  { id: "wb", label: "Weight", icon: Scale },
  { id: "perf", label: "Performance", icon: Gauge },
  { id: "brief", label: "Brief", icon: CloudSun },
  { id: "frat", label: "Risk", icon: ShieldAlert },
  { id: "checks", label: "Checklist", icon: CheckSquare },
  { id: "log", label: "Logbook", icon: BookOpen },
  { id: "students", label: "Students", icon: GraduationCap },
  { id: "rental", label: "Rental", icon: KeyRound },
];

function useFlight() {
  const route = useEfb((s) => s.route);
  const aircraft = resolveAircraft(useEfb((s) => s.aircraft));
  const loads = useEfb((s) => s.loads);
  const fuelGal = useEfb((s) => s.fuelGal);
  const windFrom = useEfb((s) => s.windFrom);
  const windKts = useEfb((s) => s.windKts);
  const departHour = useEfb((s) => s.departHour);
  const tempOverride = useEfb((s) => s.tempC);
  const altimOverride = useEfb((s) => s.altimInHg);
  const rwyOverride = useEfb((s) => s.rwyHdg);
  const ids = useMemo(() => [...new Set(route)], [route]);
  const wx = useWeather(ids);
  const origin = route.length ? getAirport(route[0]) : undefined;
  const dest = route.length ? getAirport(route[route.length - 1]) : undefined;
  const metar = wx.data?.metars.find((m) => m.icao === origin?.icao);
  const destMetar = wx.data?.metars.find((m) => m.icao === dest?.icao);
  const tempC = tempOverride ?? metar?.temp ?? 15;
  const altimInHg = altimOverride ?? (metar?.altim != null ? hpaToInHg(metar.altim) : 29.92);
  const rwyHdg = rwyOverride ?? origin?.hdg ?? 0;
  const legs = useLegs();
  const sum = totals(legs);
  const wb = weightBalance(aircraft, loads, fuelGal);
  const burned = Number.isFinite(sum.gal) ? sum.gal : 0;
  const ldgWeight = Math.max(aircraft.bew, wb.weight - burned * 6);
  const perf = performance({
    aircraft,
    elevFt: origin?.elev ?? 0,
    tempC,
    altimInHg,
    windFrom,
    windKts,
    rwyHdg,
    toWeight: wb.weight,
    ldgWeight,
    runwayFt: runwayFeet(origin?.rwy ?? ""),
  });
  const fuelLeftGal = fuelGal - burned;
  const fuelMinLeft = aircraft.burnGph > 0 ? (fuelLeftGal / aircraft.burnGph) * 60 : 0;
  const night = origin ? isLocalNight(origin.lat, origin.lon, departHour) : departHour >= 19 || departHour < 6;
  const sun = origin ? sunClock(origin.lat, origin.lon) : null;
  const mountain =
    Math.abs((dest?.elev ?? 0) - (origin?.elev ?? 0)) > 3000 ||
    route.some((id) => (getAirport(id)?.elev ?? 0) > 7500);
  return {
    route,
    aircraft,
    loads,
    fuelGal,
    windFrom,
    windKts,
    departHour,
    wx,
    origin,
    dest,
    metar,
    destMetar,
    tempC,
    altimInHg,
    rwyHdg,
    legs,
    sum,
    wb,
    burned,
    ldgWeight,
    perf,
    fuelLeftGal,
    fuelMinLeft,
    night,
    sun,
    mountain,
  };
}

function Sheet({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const aircraft = resolveAircraft(useEfb((s) => s.aircraft));
  const route = useEfb((s) => s.route);
  return (
    <article
      id="flight-file"
      className={`mx-auto flex w-full flex-col gap-4 rounded-[1.1rem] border border-line bg-surface p-4 sm:p-6 ${wide ? "log-page max-w-none" : "max-w-3xl"}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="eyebrow text-amber">CrossEFB · Planning aid</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 truncate font-mono text-xs text-muted">
            <span className="text-fg">{aircraft.tail}</span> · {aircraft.name} · {route.join(" › ") || "No route"}
          </p>
        </div>
        <Btn variant="secondary" className="no-print shrink-0" icon={<Printer className="size-4" />} onClick={() => window.print()}>
          <span className="hidden sm:inline">Print</span>
        </Btn>
      </header>
      {children}
      <p className="border-t border-line pt-3 text-xs leading-relaxed text-faint">
        Sample aircraft figures, not an AFM. Estimates only. The pilot in command verifies weight,
        performance, weather, and NOTAMs before flight.
      </p>
    </article>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : undefined;
  return <NumField label={label} value={Number.isFinite(value) ? value : 0} decimals={decimals} onChange={onChange} />;
}

function NavlogSheet() {
  const f = useFlight();
  const reserveMin = f.night ? 45 : 30;
  const reserveGal = (f.aircraft.burnGph * reserveMin) / 60;
  const plan = [
    `(FPL-${f.aircraft.tail}-VG`,
    `-${f.aircraft.name.split(" ").slice(-1)[0]}/L-S`,
    `-${f.route[0] ?? "ZZZZ"}${String(f.departHour).padStart(2, "0")}00`,
    `-N${String(Math.round(f.aircraft.tas)).padStart(4, "0")}A${String(Math.round(f.aircraft.cruiseFt / 100)).padStart(3, "0")} ${f.route.slice(1, -1).join(" ") || "DCT"}`,
    `-${f.route[f.route.length - 1] ?? "ZZZZ"}${fmtMin(f.sum.min).replace(":", "")}`,
    `-DOF/ ${f.aircraft.color} POB/${souls(f.aircraft.stations, f.loads) || 1} RMK/PLANNING AID NOT FILED)`,
  ].join("\n");

  return (
    <Sheet title="Navigation log">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Distance" v={`${fmtNm(f.sum.nm)} NM`} />
        <Stat k="ETE" v={fmtMin(f.sum.min)} />
        <Stat k="Fuel burn" v={`${fmtGal(f.sum.gal)} gal`} />
        <Stat
          k={f.legs.some((l) => l.windSource === "forecast") ? "Wind (forecast)" : "Wind"}
          v={
            f.legs.some((l) => l.windSource === "forecast")
              ? `${hdgText(f.legs[0].windFrom)} / ${f.legs[0].windKts}`
              : `${hdgText(f.windFrom)} / ${f.windKts}`
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead className="text-muted">
            <tr>
              {["Leg", "Wind", "MC", "MH", "NM", "GS", "ETE", "Fuel", "Actual"].map((h) => (
                <th key={h} className="py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {f.legs.map((l) => (
              <tr key={l.from + l.to} className="border-t border-line">
                <td className="py-2">
                  {l.from}–{l.to}
                </td>
                <td className={l.windSource === "forecast" ? "text-cyan" : "text-muted"}>
                  {hdgText(l.windFrom)}/{l.windKts}
                  {l.oat != null ? ` ${l.oat > 0 ? "+" : ""}${l.oat}°` : ""}
                </td>
                <td>{hdgText(l.mc)}</td>
                <td>{hdgText(l.mh)}</td>
                <td>{fmtNm(l.nm)}</td>
                <td>{l.gs < 1 ? "—" : Math.round(l.gs)}</td>
                <td>{fmtMin(l.min)}</td>
                <td>{fmtGal(l.gal)}</td>
                <td className="text-muted">____</td>
              </tr>
            ))}
            {f.legs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-3 text-muted">
                  Add at least two airports on the plan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={`font-mono text-sm ${f.fuelLeftGal < reserveGal ? "text-amber" : "text-fg"}`}>
        Depart {fmtGal(f.fuelGal)} gal · land with {fmtGal(f.fuelLeftGal)} gal (
        {Math.round(f.fuelMinLeft)} min). {f.night ? "Night" : "Day"} VFR reserve used here is {reserveMin}{" "}
        min ({fmtGal(reserveGal)} gal).
      </p>
      <pre className="overflow-x-auto rounded-[0.75rem] border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
        {plan}
      </pre>
      <FilingHelper plan={plan} />
    </Sheet>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "warn" | "bad" | "good" }) {
  return <Readout label={k} value={v} tone={tone} />;
}

function Envelope({ arm, weight }: { arm: number; weight: number }) {
  const aircraft = resolveAircraft(useEfb((s) => s.aircraft));
  const arms = [...aircraft.fwd, ...aircraft.aft, { arm, lb: weight }].map((p) => p.arm);
  const lbs = [...aircraft.fwd, ...aircraft.aft, { arm, lb: weight }].map((p) => p.lb);
  const minA = Math.min(...arms) - 2;
  const maxA = Math.max(...arms) + 2;
  const minW = Math.min(...lbs) - 150;
  const maxW = Math.max(...lbs, aircraft.mgw) + 80;
  const W = 320;
  const H = 180;
  const x = (a: number) => ((a - minA) / (maxA - minA)) * (W - 24) + 12;
  const y = (lb: number) => H - 16 - ((lb - minW) / (maxW - minW)) * (H - 28);
  const fwd = [...aircraft.fwd].sort((a, b) => a.lb - b.lb);
  const aft = [...aircraft.aft].sort((a, b) => b.lb - a.lb);
  const poly = [...fwd, ...aft].map((p) => `${x(p.arm)},${y(p.lb)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full rounded-[0.75rem] border border-line" role="img" aria-label="Center of gravity envelope">
      <rect width={W} height={H} fill="var(--color-bg)" />
      <polygon points={poly} fill="var(--color-amber)" fillOpacity="0.28" stroke="var(--color-amber)" strokeWidth="1.5" />
      <circle cx={x(arm)} cy={y(weight)} r="5" fill="var(--color-fg)" stroke="var(--color-amber)" />
      <text x="12" y="16" fill="var(--color-muted)" fontSize="11">
        Weight vs arm
      </text>
      <text x={x(arm) + 8} y={y(weight) - 8} fill="var(--color-fg)" fontSize="11">
        {weight.toFixed(0)} lb · {arm.toFixed(1)} in
      </text>
    </svg>
  );
}

function WbSheet() {
  const f = useFlight();
  const setLoad = useEfb((s) => s.setLoad);
  const setFuelGal = useEfb((s) => s.setFuelGal);
  return (
    <Sheet title="Weight and balance">
      <p
        className={cx(
          "rounded-[0.75rem] border px-3 py-2 text-sm",
          f.wb.inside ? "border-good/40 bg-good/10 text-good" : "border-bad/40 bg-bad/10 text-bad",
        )}
      >
        {Math.round(f.wb.weight)} lb · CG {f.wb.arm.toFixed(1)} in · {f.wb.reason}. Limits at this weight{" "}
        {f.wb.fwdArm.toFixed(1)} to {f.wb.aftArm.toFixed(1)} in. Max {f.wb.mgw} lb.
      </p>
      <Envelope arm={f.wb.arm} weight={f.wb.weight} />
      <div className="grid grid-cols-2 gap-2">
        <Num label="Fuel gal" value={f.fuelGal} step={0.5} onChange={setFuelGal} />
        {f.aircraft.stations.map((s) => (
          <Num
            key={s.id}
            label={`${s.name} lb`}
            value={f.loads[s.id] ?? 0}
            onChange={(n) => setLoad(s.id, n)}
          />
        ))}
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-medium">Item</th>
            <th className="font-medium">Arm</th>
            <th className="font-medium">Lb</th>
            <th className="font-medium">Moment</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {f.wb.rows.map((r) => (
            <tr key={r.name} className="border-t border-line">
              <td className="py-1">{r.name}</td>
              <td>{r.arm.toFixed(1)}</td>
              <td>{r.lb.toFixed(0)}</td>
              <td>{r.moment.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}

function PerfSheet() {
  const f = useFlight();
  const setTemp = useEfb((s) => s.setTempC);
  const setAltim = useEfb((s) => s.setAltim);
  const setRwy = useEfb((s) => s.setRwyHdg);
  const wind = windComponents(f.windFrom, f.windKts, f.rwyHdg);
  const short = (n: number) => `${Math.round(n).toLocaleString()} ft`;
  return (
    <Sheet title="Takeoff and landing">
      <p className="text-sm text-muted">
        Rule-of-thumb distances from the sample sea-level figures, scaled for density altitude, weight, and
        wind. Not a substitute for the AFM chart.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Num label="OAT °C" value={Math.round(f.tempC)} onChange={setTemp} />
        <Num label="Altimeter inHg" value={Number(f.altimInHg.toFixed(2))} step={0.01} onChange={setAltim} />
        <Num label="Runway heading" value={f.rwyHdg} onChange={setRwy} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Density alt" v={`${Math.round(f.perf.da).toLocaleString()} ft`} />
        <Stat k="Headwind" v={`${wind.head.toFixed(0)} kt`} />
        <Stat k="Crosswind" v={`${wind.cross.toFixed(0)} kt`} />
        <Stat k="Runway" v={f.perf.runway ? `${f.perf.runway.toLocaleString()} ft` : "—"} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={`rounded-[0.75rem] border bg-bg p-3 ${f.perf.toMargin > 0 && f.perf.toMargin < 1.5 ? "border-warn" : "border-line"}`}>
          <h3 className="text-sm font-semibold">Takeoff · {Math.round(f.wb.weight)} lb</h3>
          <p className="mt-2 font-mono text-sm">Ground roll {short(f.perf.toRoll)}</p>
          <p className="font-mono text-sm">Over 50 ft {short(f.perf.to50)}</p>
          <p className="mt-1 text-xs text-muted">
            {f.perf.toMargin ? `${f.perf.toMargin.toFixed(1)}× runway versus the 50-ft distance` : "No runway length"}
          </p>
        </div>
        <div className={`rounded-[0.75rem] border bg-bg p-3 ${f.perf.ldgMargin > 0 && f.perf.ldgMargin < 1.5 ? "border-warn" : "border-line"}`}>
          <h3 className="text-sm font-semibold">Landing · {Math.round(f.ldgWeight)} lb</h3>
          <p className="mt-2 font-mono text-sm">Ground roll {short(f.perf.ldgRoll)}</p>
          <p className="font-mono text-sm">Over 50 ft {short(f.perf.ldg50)}</p>
          <p className="mt-1 text-xs text-muted">Landing weight subtracts planned fuel burn.</p>
        </div>
      </div>
      <p className="text-xs text-muted">
        {f.origin ? `${f.origin.icao} elevation ${f.origin.elev.toLocaleString()} ft · ${f.origin.rwy}` : "No origin"}
      </p>
    </Sheet>
  );
}

function BriefSheet() {
  const f = useFlight();
  return (
    <Sheet title="Briefing pack">
      <GoNoGoCard />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {f.wx.loading
            ? "Loading"
            : f.wx.data?.source === "live"
              ? `Live ${f.wx.data.fetchedAt?.slice(11, 16) ?? ""}Z`
              : "Weather unavailable"}
        </p>
        <Btn size="sm" className="no-print" onClick={f.wx.reload}>
          Refresh
        </Btn>
      </div>
      {f.wx.failed && <p className="text-sm text-amber">Live weather is unavailable. Do not treat this sheet as a briefing.</p>}
      {f.route.map((id) => {
        const metar = f.wx.data?.metars.find((m) => m.icao === id);
        const taf = f.wx.data?.tafs.find((t) => t.icao === id);
        return (
          <section key={id} className="overflow-hidden rounded-[0.75rem] border border-line bg-bg">
            <div className="h-1" style={{ background: catColor(metar?.fltCat) }} />
            <div className="p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-amber">{id}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{getAirport(id)?.name}</span>
              {metar && <CatBadge cat={metar.fltCat} />}
            </div>
            <WxLine metar={metar} />
            {taf && <p className="mt-2 font-mono text-xs leading-relaxed text-muted">{taf.raw}</p>}
            </div>
          </section>
        );
      })}
      <section className="rounded-[0.75rem] border border-line p-3 text-sm">
        <h3 className="mb-2 font-semibold">NOTAMs</h3>
        <NotamList icaos={f.route} />
        <p className="mt-2 text-xs text-muted">
          Check TFRs and the official briefing for {f.route.join(", ") || "the route"} before you go.
        </p>
      </section>
      <section className="text-sm">
        <h3 className="font-semibold">Fuel</h3>
        <p className="mt-1 font-mono text-xs">
          {fmtGal(f.fuelGal)} gal out · {fmtGal(f.burned)} gal planned · {fmtGal(f.fuelLeftGal)} gal remaining · cruise{" "}
          {f.aircraft.cruiseFt.toLocaleString()} ft
        </p>
      </section>
    </Sheet>
  );
}

function WxLine({ metar }: { metar: Metar | undefined }) {
  if (!metar) return <p className="mt-2 text-xs text-muted">No METAR</p>;
  return (
    <>
      <p className="mt-2 font-mono text-xs leading-relaxed">{metar.raw}</p>
      <p className="mt-1 text-xs text-muted">{metar.sky}</p>
    </>
  );
}

function FratSheet() {
  const f = useFlight();
  const manual = useEfb((s) => s.fratManual);
  const note = useEfb((s) => s.fratNote);
  const setManual = useEfb((s) => s.setFratManual);
  const setNote = useEfb((s) => s.setFratNote);
  const logbook = useEfb((s) => s.logbook);
  const scored = scoreFrat({
    manual,
    night: f.night,
    cross: f.perf.cross,
    wind: f.windKts,
    fltCat: f.destMetar?.fltCat ?? f.metar?.fltCat ?? null,
    runway: f.perf.runway,
    towered: f.dest ? f.dest.cls !== "E" : true,
    mountain: f.mountain,
    fuelMinLeft: f.fuelMinLeft,
    wbOk: f.wb.inside,
    toMargin: f.perf.toMargin,
    hours90: hoursIn(logbook, 90, (e) => e.total),
    hoursType: logbook.filter((e) => e.tail === f.aircraft.tail).reduce((n, e) => n + e.total, 0),
    nightLdg90: hoursIn(logbook, 90, (e) => e.nightLdg),
  });
  const band =
    scored.band === "high" ? "High risk" : scored.band === "medium" ? "Medium risk" : "Low risk";
  return (
    <Sheet title="Flight risk">
      <div
        className={cx(
          "flex items-center gap-4 rounded-[0.75rem] border px-4 py-3",
          scored.band === "low" && "border-good/40 bg-good/10",
          scored.band === "medium" && "border-warn/40 bg-warn/10",
          scored.band === "high" && "border-bad/40 bg-bad/10",
        )}
      >
        <div
          className={cx(
            "tnum font-mono text-4xl font-semibold",
            scored.band === "low" ? "text-good" : scored.band === "medium" ? "text-warn" : "text-bad",
          )}
        >
          {scored.score}
        </div>
        <div>
        <p className="text-sm font-semibold">{band}</p>
        <p className="mt-1 text-xs text-muted">
          Auto items come from the plan, weather, and logbook. You only answer what the airplane cannot know.
          A low score is not a clearance to go.
        </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {scored.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-[0.75rem] border border-line bg-bg px-3 py-2.5">
            {item.source === "you" ? (
              <Toggle
                on={item.on}
                label={item.label}
                onChange={(on) => setManual({ [item.id]: on } as Partial<typeof manual>)}
              />
            ) : (
              <span className="flex h-7 w-12 shrink-0 items-center justify-center">
                <span className={`size-2.5 rounded-full ${item.on ? "bg-warn" : "bg-line-strong"}`} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm">{item.label}</span>
                <span className="font-mono text-xs text-muted">
                  {item.source === "auto" ? "auto" : "you"} · {item.on ? `+${item.points}` : "0"}
                </span>
              </div>
              <p className="text-xs text-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <label className="text-xs text-muted">
        Mitigation {scored.band !== "low" ? "(needed before you would treat this as briefed)" : "(optional)"}
        <textarea
          className="field mt-1 min-h-24 py-2.5"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What changes if the score is not low"
        />
      </label>
    </Sheet>
  );
}

function CheckSheet() {
  const checks = useEfb((s) => s.checks);
  const toggle = useEfb((s) => s.toggleCheck);
  const reset = useEfb((s) => s.resetChecks);
  const total = CHECKS.reduce((n, p) => n + p.items.length, 0);
  const done = CHECKS.reduce(
    (n, p) => n + p.items.filter((_, i) => checks[checkId(p.phase, i)]).length,
    0,
  );
  return (
    <Sheet title="Checklist">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm">
          {done}/{total}
        </p>
        <Btn size="sm" className="no-print" onClick={reset}>
          Reset
        </Btn>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {CHECKS.map((phase) => (
        <section key={phase.phase}>
          <h3 className="eyebrow">{phase.phase}</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {phase.items.map((text, i) => {
              const id = checkId(phase.phase, i);
              const on = Boolean(checks[id]);
              return (
                <li key={id}>
                  <button
                    aria-pressed={on}
                    className={cx(
                      "flex min-h-12 w-full items-center gap-3 rounded-[0.75rem] border px-3 text-left text-sm transition-colors",
                      on ? "border-good/30 bg-good/5" : "border-line bg-bg hover:border-line-strong",
                    )}
                    onClick={() => toggle(id)}
                  >
                    <span
                      className={cx(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-[0.7rem] font-bold",
                        on ? "border-good bg-good text-ink" : "border-line-strong",
                      )}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className={on ? "text-muted line-through" : ""}>{text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const LOG_HEAD = ["Date", "Tail", "From", "To", "Total", "Night", "Appr", "Day ldg", "Night ldg", "PIC", "Remarks"];

function LogSheet() {
  const logbook = useEfb((s) => s.logbook);
  const instructor = useEfb((s) => s.instructor);
  const students = useEfb((s) => s.students);
  const draft = useEfb((s) => s.draftLog);
  const add = useEfb((s) => s.addLog);
  const update = useEfb((s) => s.updateLog);
  const remove = useEfb((s) => s.removeLog);
  const total = logbook.reduce((n, e) => n + e.total, 0);
  const dual = logbook.reduce((n, e) => n + e.dual, 0);
  const night90 = hoursIn(logbook, 90, (e) => e.nightLdg);
  const heads = instructor ? ["Student", "Dual", "Ground", ...LOG_HEAD] : LOG_HEAD;
  const blanks = Array.from({ length: 8 }, (_, i) => i);

  return (
    <Sheet title="Logbook" wide>
      <CurrencyCard />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm">
          {total.toFixed(1)} hr in this copy
          {instructor ? ` · ${dual.toFixed(1)} dual given` : ""} · {night90} night landings in 90 days
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={add}>Add a line</Btn>
          <Btn variant="primary" onClick={draft}>Add this flight</Btn>
        </div>
      </div>
      <p className="text-sm text-muted">
        Working copy only. Print it and write on the blank lines, or export the CSV into your own book. CrossEFB does not keep the official log.
      </p>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              {heads.map((head) => (
                <th key={head} className="px-1 py-2 font-medium">
                  {head}
                </th>
              ))}
              <th className="no-print px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {logbook.map((entry) => (
              <LogRow key={entry.id} entry={entry} instructor={instructor} students={students} onChange={update} onRemove={remove} />
            ))}
            {blanks.map((n) => (
              <tr key={`blank-${n}`} className="log-blank border-b border-line">
                {heads.map((head) => (
                  <td key={head} className="h-8 border-b border-line" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {logbook.length === 0 && <p className="no-print text-sm text-muted">No lines yet. Add this flight, or write one in.</p>}
    </Sheet>
  );
}

function LogRow({
  entry,
  instructor,
  students,
  onChange,
  onRemove,
}: {
  entry: LogEntry;
  instructor: boolean;
  students: Student[];
  onChange: (id: string, patch: Partial<LogEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const cell = "field min-w-16";
  const setStudent = (id: string) => {
    const student = students.find((item) => item.id === id);
    onChange(entry.id, { studentId: id, student: student?.name ?? "" });
  };
  return (
    <tr className="border-b border-line align-top">
      {instructor && (
        <>
          <td className="p-1">
            <select className={cell} value={entry.studentId} onChange={(e) => setStudent(e.target.value)}>
              <option value="">—</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
              {entry.studentId && !students.some((student) => student.id === entry.studentId) && (
                <option value={entry.studentId}>{entry.student || "Former student"}</option>
              )}
            </select>
          </td>
          <td className="p-1">
            <Num label="" value={entry.dual} step={0.1} onChange={(n) => onChange(entry.id, { dual: n })} />
          </td>
          <td className="p-1">
            <Num label="" value={entry.ground} step={0.1} onChange={(n) => onChange(entry.id, { ground: n })} />
          </td>
        </>
      )}
      <td className="p-1">
        <input type="date" className={cell} value={entry.date} onChange={(e) => onChange(entry.id, { date: e.target.value })} />
      </td>
      <td className="p-1">
        <input className={`${cell} font-mono`} value={entry.tail} onChange={(e) => onChange(entry.id, { tail: e.target.value.toUpperCase() })} />
      </td>
      <td className="p-1">
        <input className={`${cell} font-mono`} value={entry.from} onChange={(e) => onChange(entry.id, { from: e.target.value.toUpperCase() })} />
      </td>
      <td className="p-1">
        <input className={`${cell} font-mono`} value={entry.to} onChange={(e) => onChange(entry.id, { to: e.target.value.toUpperCase() })} />
      </td>
      <td className="p-1">
        <Num label="" value={entry.total} step={0.1} onChange={(n) => onChange(entry.id, { total: n })} />
      </td>
      <td className="p-1">
        <Num label="" value={entry.night} step={0.1} onChange={(n) => onChange(entry.id, { night: n })} />
      </td>
      <td className="p-1">
        <Num label="" value={entry.approaches} onChange={(n) => onChange(entry.id, { approaches: n })} />
      </td>
      <td className="p-1">
        <Num label="" value={entry.dayLdg} onChange={(n) => onChange(entry.id, { dayLdg: n })} />
      </td>
      <td className="p-1">
        <Num label="" value={entry.nightLdg} onChange={(n) => onChange(entry.id, { nightLdg: n })} />
      </td>
      <td className="p-1">
        <input className={cell} value={entry.pic} onChange={(e) => onChange(entry.id, { pic: e.target.value })} />
      </td>
      <td className="p-1">
        <input className={`${cell} min-w-40`} value={entry.remarks} onChange={(e) => onChange(entry.id, { remarks: e.target.value })} />
      </td>
      <td className="no-print p-1">
        <Btn variant="danger" size="sm" onClick={() => onRemove(entry.id)}>
          Delete
        </Btn>
      </td>
    </tr>
  );
}

function StudentsSheet() {
  const instructor = useEfb((s) => s.instructor);
  const setInstructor = useEfb((s) => s.setInstructor);
  const students = useEfb((s) => s.students);
  const logbook = useEfb((s) => s.logbook);
  const active = useEfb((s) => s.activeStudent);
  const setActive = useEfb((s) => s.setActiveStudent);
  const addStudent = useEfb((s) => s.addStudent);
  const updateStudent = useEfb((s) => s.updateStudent);
  const removeStudent = useEfb((s) => s.removeStudent);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const chosen = students.find((student) => student.id === active) ?? students[0];
  const lessons = chosen ? logbook.filter((entry) => entry.studentId === chosen.id || (entry.student && entry.student === chosen.name)) : [];
  const dual = (id: string, studentName: string) =>
    logbook.filter((entry) => entry.studentId === id || entry.student === studentName).reduce((n, entry) => n + entry.dual, 0);
  const ground = (id: string, studentName: string) =>
    logbook.filter((entry) => entry.studentId === id || entry.student === studentName).reduce((n, entry) => n + entry.ground, 0);

  const exportStudents = () => {
    const head = ["student", "note", "flights", "dual_given", "ground", "last_flight"];
    const rows = students.map((student) => {
      const flights = logbook.filter((entry) => entry.studentId === student.id || entry.student === student.name);
      const last = flights.map((entry) => entry.date).sort().at(-1) ?? "";
      return [student.name, student.note, flights.length, dual(student.id, student.name), ground(student.id, student.name), last];
    });
    downloadCsv(`crossefb-students-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows]);
  };

  return (
    <Sheet title="Students" wide>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Btn variant={instructor ? "primary" : "secondary"} onClick={() => setInstructor(!instructor)}>
          {instructor ? "Instructor mode on" : "Instructor mode off"}
        </Btn>
        {instructor && <Btn onClick={exportStudents}>Export CSV</Btn>}
      </div>
      <p className="text-sm text-muted">
        A roster on this device. It tracks who you flew with and how much dual you gave. It is not an endorsement and not the student's logbook.
      </p>
      {instructor && (
        <>
          <form
            className="no-print grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              addStudent(name, note);
              setName("");
              setNote("");
            }}
          >
            <input
              aria-label="Student name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Student name"
            />
            <input
              aria-label="Student note"
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note, such as pre-solo"
            />
            <Btn variant="primary" type="submit">
              Add student
            </Btn>
          </form>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 font-medium">Student</th>
                  <th className="px-2 py-2 font-medium">Note</th>
                  <th className="px-2 py-2 font-medium">Flights</th>
                  <th className="px-2 py-2 font-medium">Dual</th>
                  <th className="px-2 py-2 font-medium">Ground</th>
                  <th className="no-print px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const flights = logbook.filter((entry) => entry.studentId === student.id || entry.student === student.name);
                  const on = student.id === (chosen?.id ?? "");
                  return (
                    <tr key={student.id} className="border-b border-line">
                      <td className="p-1">
                        <button className={`h-11 px-2 text-left ${on ? "text-amber" : ""}`} onClick={() => setActive(student.id)}>
                          {student.name}
                        </button>
                      </td>
                      <td className="p-1">
                        <input
                          className="field"
                          value={student.note}
                          onChange={(e) => updateStudent(student.id, { note: e.target.value })}
                        />
                      </td>
                      <td className="px-2 font-mono">{flights.length}</td>
                      <td className="px-2 font-mono">{dual(student.id, student.name).toFixed(1)}</td>
                      <td className="px-2 font-mono">{ground(student.id, student.name).toFixed(1)}</td>
                      <td className="no-print p-1">
                        <Btn variant="danger" size="sm" onClick={() => removeStudent(student.id)}>
                          Remove
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={`stu-blank-${i}`} className="log-blank">
                    <td className="h-8 border-b border-line" colSpan={5} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {students.length === 0 && <p className="no-print text-sm text-muted">No students yet.</p>}
          {chosen && (
            <section>
              <h3 className="text-sm font-semibold">{chosen.name}</h3>
              <ul className="mt-2 flex flex-col gap-1 font-mono text-xs text-muted">
                {lessons.length === 0 && <li>No lessons tagged to this student.</li>}
                {lessons.map((entry) => (
                  <li key={entry.id}>
                    {entry.date} {entry.tail} {entry.from}-{entry.to} dual {entry.dual.toFixed(1)} ground {entry.ground.toFixed(1)} {entry.remarks}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}

function RentalSheet() {
  const rental = useEfb((s) => s.rental);
  const setRental = useEfb((s) => s.setRental);
  const aircraft = resolveAircraft(useEfb((s) => s.aircraft));
  const hobbs = rental.hobbsIn > rental.hobbsOut ? rental.hobbsIn - rental.hobbsOut : 0;
  const tach = rental.tachIn > rental.tachOut ? rental.tachIn - rental.tachOut : 0;
  return (
    <Sheet title="Club checkout">
      <p className="text-sm text-muted">
        {aircraft.tail} · hobbs {hobbs.toFixed(1)} · tach {tach.toFixed(1)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs text-muted">
          PIC
          <input
            className="field mt-1"
            value={rental.pic}
            onChange={(e) => setRental({ pic: e.target.value })}
          />
        </label>
        <Num label="Hobbs out" value={rental.hobbsOut} step={0.1} onChange={(n) => setRental({ hobbsOut: n })} />
        <Num label="Hobbs in" value={rental.hobbsIn} step={0.1} onChange={(n) => setRental({ hobbsIn: n })} />
        <Num label="Tach out" value={rental.tachOut} step={0.1} onChange={(n) => setRental({ tachOut: n })} />
        <Num label="Tach in" value={rental.tachIn} step={0.1} onChange={(n) => setRental({ tachIn: n })} />
        <Num label="Fuel out gal" value={rental.fuelOut} step={0.1} onChange={(n) => setRental({ fuelOut: n })} />
        <Num label="Fuel in gal" value={rental.fuelIn} step={0.1} onChange={(n) => setRental({ fuelIn: n })} />
        <Num label="Oil qt" value={rental.oilQt} step={0.1} onChange={(n) => setRental({ oilQt: n })} />
      </div>
      <label className="text-xs text-muted">
        Squawks
        <textarea
          className="field mt-1 min-h-24 py-2.5"
          value={rental.squawk}
          onChange={(e) => setRental({ squawk: e.target.value })}
          placeholder="Write discrepancies before the next renter"
        />
      </label>
      <p className="text-sm">
        Accepted by {rental.pic || "____________"} · signature on the printed copy
      </p>
    </Sheet>
  );
}

const SHEETS: Record<DocId, () => ReactNode> = {
  navlog: NavlogSheet,
  wb: WbSheet,
  perf: PerfSheet,
  brief: BriefSheet,
  frat: FratSheet,
  checks: CheckSheet,
  log: LogSheet,
  students: StudentsSheet,
  rental: RentalSheet,
};

export function DocumentDesk() {
  const doc = useEfb((s) => s.doc);
  const setDoc = useEfb((s) => s.setDoc);
  const departHour = useEfb((s) => s.departHour);
  const setDepartHour = useEfb((s) => s.setDepartHour);
  const route = useEfb((s) => s.route);
  const origin = route.length ? getAirport(route[0]) : undefined;
  const sun = origin ? sunClock(origin.lat, origin.lon) : null;
  const night = origin ? isLocalNight(origin.lat, origin.lon, departHour) : false;
  const apply = useEfb((s) => s.applyProfile);
  const profileId = useEfb((s) => s.aircraft.profileId);
  const myAircraft = useEfb((s) => s.myAircraft);
  const Active = SHEETS[doc] ?? NavlogSheet;

  return (
    <div className="flex flex-col gap-4 px-3 pt-4 pb-24 sm:px-6 sm:pb-10">
      <div className="no-print mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Flight file</h1>
            <p className="text-xs text-muted">One plan fills every sheet.</p>
            {sun && (
              <p className={`tnum mt-1 font-mono text-xs ${night ? "text-warn" : "text-faint"}`}>
                Sun {fmtClock(sun.riseMin)}–{fmtClock(sun.setMin)} · twilight {fmtClock(sun.civilStartMin)}–{fmtClock(sun.civilEndMin)}
                {night ? " · night departure" : " · day departure"}
              </p>
            )}
          </div>
          <NumField
            label="Depart hour (local)"
            className="w-36"
            value={departHour}
            pad={2}
            min={0}
            max={23}
            suffix=":00"
            onChange={setDepartHour}
          />
        </div>
        <nav className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Flight file sheets">
          {DOCS.map((d) => {
            const on = doc === d.id;
            return (
              <button
                key={d.id}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                  on ? "bg-amber text-ink" : "border border-line bg-surface text-muted hover:text-fg",
                )}
                onClick={() => setDoc(d.id)}
              >
                <d.icon className="size-4" />
                {d.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="eyebrow shrink-0">Aircraft</span>
          {myAircraft.map((p) => (
            <button
              key={p.profileId}
              className={cx(
                "h-8 shrink-0 rounded-full px-3 font-mono text-xs font-medium",
                profileId === p.profileId ? "bg-amber-soft text-amber ring-1 ring-amber/50" : "text-muted ring-1 ring-line hover:text-fg",
              )}
              onClick={() => apply(p.profileId)}
            >
              {p.tail}
            </button>
          ))}
          {PROFILES.map((p) => (
            <button
              key={p.profileId}
              className={cx(
                "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
                profileId === p.profileId ? "bg-amber-soft text-amber ring-1 ring-amber/50" : "text-muted ring-1 ring-line hover:text-fg",
              )}
              onClick={() => apply(p.profileId)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <Active />
    </div>
  );
}

function FilingHelper({ plan }: { plan: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Btn
        size="sm"
        icon={<Copy className="size-3.5" />}
        onClick={() => {
          void navigator.clipboard?.writeText(plan).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Copied" : "Copy flight plan"}
      </Btn>
      <a
        href="https://www.1800wxbrief.com/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-[0.625rem] border border-line bg-surface px-3 text-xs font-medium hover:bg-hover"
      >
        File and brief at 1800wxbrief <ExternalLink className="size-3.5" />
      </a>
      <span className="text-[0.6875rem] text-faint">CrossEFB does not file. Paste the plan and get an official briefing.</span>
    </div>
  );
}

function GoNoGoCard() {
  const f = useFlight();
  const tfrs = useLive((s) => s.tfrs.tfrs);
  const field = useLive((s) => s.metars.stations);
  // Fall back to the map's METAR layer when the briefing fetch has nothing.
  const mapCat = (id: string | undefined) => (id ? (field.find((m) => m.id === id)?.cat ?? null) : null);
  const logbook = useEfb((s) => s.logbook);
  const pilot = useEfb((s) => s.pilot);
  const pts = f.route.map((id) => getAirport(id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const hits = tfrsOnRoute(tfrs, pts);
  const fav = f.origin && f.metar ? favoredRunway(f.origin.rwy, f.metar.wdir, f.metar.wspd) : null;
  const xw = fav && !fav.calm ? Math.abs(fav.cross) : f.metar ? 0 : f.perf.cross;
  const reserveGal = (f.aircraft.burnGph * (f.night ? 45 : 30)) / 60;
  const notams = useNotams(f.route);
  const closures = notams?.configured
    ? [f.origin?.icao, f.dest?.icao]
        .filter((id): id is string => Boolean(id))
        .flatMap((id) => (notams.notams[id] ?? []).filter((n) => n.important && (n.keyword === "RWY" || n.keyword === "AD")).map((n) => `${id}: ${n.text.replace(/^!\S+\s+\S+\s+\S+\s+/, "")}`))
    : [];
  const pax = Object.entries(f.loads).some(([id, lb]) => id !== "pilot" && id !== "bags" && lb > 0);
  const result = goNoGo({
    originId: f.origin?.icao ?? null,
    destId: f.dest?.icao ?? null,
    originCat: f.metar?.fltCat ?? mapCat(f.origin?.icao),
    destCat: f.destMetar?.fltCat ?? mapCat(f.dest?.icao),
    surfaceWind: f.metar?.wspd ?? 0,
    crosswind: xw,
    maxXwind: f.aircraft.maxXwind ?? 15,
    personalXwind: pilot.xwindMin,
    fuelLeftGal: f.fuelLeftGal,
    reserveGal,
    wbOk: f.wb.inside,
    wbReason: f.wb.reason,
    toMargin: f.perf.toMargin,
    densityAlt: f.perf.da,
    night: f.night,
    tfrIds: hits.map((t) => t.id),
    currency: currency(logbook, pilot),
    passengers: pax,
    notamAlerts: closures,
    notamsChecked: Boolean(notams?.configured),
  });
  const tone =
    result.verdict === "nogo" ? "border-bad/50 bg-bad/10 text-bad" : result.verdict === "caution" ? "border-warn/50 bg-warn/10 text-warn" : "border-good/50 bg-good/10 text-good";
  const label = result.verdict === "nogo" ? "NO-GO" : result.verdict === "caution" ? "CAUTION" : "GO";
  return (
    <section className={cx("rounded-[0.875rem] border p-4", tone)}>
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-current/15 px-2 py-1 font-mono text-sm font-bold">{label}</span>
        <p className="text-sm font-semibold text-fg">{result.headline}</p>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-fg">
        {result.items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={cx(
                "mt-1.5 size-2 shrink-0 rounded-full",
                it.level === "nogo" ? "bg-bad" : it.level === "caution" ? "bg-warn" : "bg-good",
              )}
            />
            {it.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.6875rem] text-muted">
        Computed from this plan, live METARs, TFRs, and your logbook. It is a checklist, not a weather briefing.
      </p>
    </section>
  );
}

function CurrencyCard() {
  const logbook = useEfb((s) => s.logbook);
  const pilot = useEfb((s) => s.pilot);
  const setPilot = useEfb((s) => s.setPilot);
  const items = currency(logbook, pilot);
  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((c) => (
          <div
            key={c.id}
            className={cx(
              "flex items-center gap-3 rounded-[0.75rem] border px-3 py-2.5",
              c.ok === true && "border-good/40 bg-good/5",
              c.ok === false && "border-bad/40 bg-bad/10",
              c.ok === null && "border-line bg-bg",
            )}
          >
            <span
              className={cx(
                "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold",
                c.ok === true ? "bg-good text-ink" : c.ok === false ? "bg-bad text-ink" : "bg-raised text-muted",
              )}
            >
              {c.ok === true ? "✓" : c.ok === false ? "!" : "?"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="truncate text-xs text-muted">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Last flight review</span>
          <input type="date" className="field" value={pilot.flightReview} onChange={(e) => setPilot({ flightReview: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Medical expires</span>
          <input type="date" className="field" value={pilot.medicalExpires} onChange={(e) => setPilot({ medicalExpires: e.target.value })} />
        </label>
        <NumField label="Personal xwind max" suffix="kt" value={pilot.xwindMin} min={0} max={40} onChange={(n) => setPilot({ xwindMin: n })} />
        <div className="flex flex-col justify-end">
          <Btn
            size="md"
            icon={<Download className="size-4" />}
            onClick={() => download(`crossefb-logbook-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", logbookCsv(logbook))}
          >
            Export CSV
          </Btn>
        </div>
      </div>
    </section>
  );
}
