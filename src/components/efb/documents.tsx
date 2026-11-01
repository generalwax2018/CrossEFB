import { useMemo, type ReactNode } from "react";
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
import { buildLegs, fmtGal, fmtMin, fmtNm, hdgText, totals } from "@/lib/efb/nav";
import { useEfb } from "@/lib/efb/store";
import type { DocId, Metar } from "@/lib/efb/types";
import { useWeather } from "./panels";

const DOCS: { id: DocId; label: string }[] = [
  { id: "navlog", label: "Navlog" },
  { id: "wb", label: "Weight" },
  { id: "perf", label: "Performance" },
  { id: "brief", label: "Brief" },
  { id: "frat", label: "Risk" },
  { id: "checks", label: "Checks" },
  { id: "log", label: "Logbook" },
  { id: "rental", label: "Rental" },
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
  const legs = buildLegs(route, aircraft, windFrom, windKts);
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
  const night = departHour >= 19 || departHour < 6;
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
    mountain,
  };
}

function Sheet({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const aircraft = resolveAircraft(useEfb((s) => s.aircraft));
  const route = useEfb((s) => s.route);
  return (
    <article id="flight-file" className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-amber">CROSS EFB · PLANNING AID</p>
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          <p className="mt-1 font-mono text-xs text-muted">
            {aircraft.tail} · {aircraft.name} · {route.join(" ") || "No route"}
          </p>
        </div>
        <button
          className="no-print h-11 shrink-0 rounded-md bg-amber px-4 text-sm font-medium text-ink"
          onClick={() => window.print()}
        >
          Print
        </button>
      </header>
      {children}
      <p className="text-xs leading-relaxed text-muted">
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
  return (
    <label className="text-xs text-muted">
      {label}
      <input
        inputMode="decimal"
        step={step}
        className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
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
      <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
        <Stat k="Distance" v={`${fmtNm(f.sum.nm)} NM`} />
        <Stat k="ETE" v={fmtMin(f.sum.min)} />
        <Stat k="Fuel burn" v={`${fmtGal(f.sum.gal)} gal`} />
        <Stat k="Wind" v={`${hdgText(f.windFrom)} / ${f.windKts}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="text-muted">
            <tr>
              {["Leg", "MC", "NM", "GS", "ETE", "Fuel", "Actual"].map((h) => (
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
                <td>{hdgText(l.mc)}</td>
                <td>{fmtNm(l.nm)}</td>
                <td>{l.gs < 1 ? "—" : Math.round(l.gs)}</td>
                <td>{fmtMin(l.min)}</td>
                <td>{fmtGal(l.gal)}</td>
                <td className="text-muted">____</td>
              </tr>
            ))}
            {f.legs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-muted">
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
      <pre className="overflow-x-auto rounded-md border border-line bg-surface p-3 font-mono text-xs leading-relaxed">
        {plan}
      </pre>
    </Sheet>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="text-xs text-muted">{k}</div>
      <div className="font-mono">{v}</div>
    </div>
  );
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
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full rounded-md" role="img" aria-label="Center of gravity envelope">
      <rect width={W} height={H} fill="var(--color-surface)" />
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
      <p className={`text-sm ${f.wb.inside ? "text-fg" : "text-amber"}`}>
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
      <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
        <Stat k="Density alt" v={`${Math.round(f.perf.da).toLocaleString()} ft`} />
        <Stat k="Headwind" v={`${wind.head.toFixed(0)} kt`} />
        <Stat k="Crosswind" v={`${wind.cross.toFixed(0)} kt`} />
        <Stat k="Runway" v={f.perf.runway ? `${f.perf.runway.toLocaleString()} ft` : "—"} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={`rounded-md border p-3 ${f.perf.toMargin > 0 && f.perf.toMargin < 1.5 ? "border-amber" : "border-line"}`}>
          <h3 className="text-sm font-semibold">Takeoff · {Math.round(f.wb.weight)} lb</h3>
          <p className="mt-2 font-mono text-sm">Ground roll {short(f.perf.toRoll)}</p>
          <p className="font-mono text-sm">Over 50 ft {short(f.perf.to50)}</p>
          <p className="mt-1 text-xs text-muted">
            {f.perf.toMargin ? `${f.perf.toMargin.toFixed(1)}× runway versus the 50-ft distance` : "No runway length"}
          </p>
        </div>
        <div className={`rounded-md border p-3 ${f.perf.ldgMargin > 0 && f.perf.ldgMargin < 1.5 ? "border-amber" : "border-line"}`}>
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {f.wx.loading
            ? "Loading"
            : f.wx.data?.source === "live"
              ? `Live ${f.wx.data.fetchedAt?.slice(11, 16) ?? ""}Z`
              : "Weather unavailable"}
        </p>
        <button className="no-print h-11 rounded-md border border-line px-3 text-sm" onClick={f.wx.reload}>
          Refresh
        </button>
      </div>
      {f.wx.failed && <p className="text-sm text-amber">Live weather is unavailable. Do not treat this sheet as a briefing.</p>}
      {f.route.map((id) => {
        const metar = f.wx.data?.metars.find((m) => m.icao === id);
        const taf = f.wx.data?.tafs.find((t) => t.icao === id);
        return (
          <section key={id} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm text-amber">{id}</span>
              <span className="text-xs text-muted">{getAirport(id)?.name}</span>
              {metar && <span className="ml-auto font-mono text-xs">{metar.fltCat}</span>}
            </div>
            <WxLine metar={metar} />
            {taf && <p className="mt-2 font-mono text-xs leading-relaxed text-muted">{taf.raw}</p>}
          </section>
        );
      })}
      <section className="rounded-md border border-line p-3 text-sm">
        <h3 className="font-semibold">NOTAMs and TFRs</h3>
        <p className="mt-1 text-muted">
          This build does not pull NOTAMs. Read the official briefing for {f.route.join(", ") || "the route"} before
          you go.
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
      <div className={`rounded-md border px-3 py-3 ${scored.band === "low" ? "border-line" : "border-amber"}`}>
        <p className="font-mono text-sm">
          {scored.score} points · {band}
        </p>
        <p className="mt-1 text-xs text-muted">
          Auto items come from the plan, weather, and logbook. You only answer what the airplane cannot know.
          A low score is not a clearance to go.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {scored.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-2">
            {item.source === "you" ? (
              <button
                aria-pressed={item.on}
                className={`mt-0.5 h-6 w-11 shrink-0 rounded-full ${item.on ? "bg-amber" : "bg-raised"}`}
                onClick={() => setManual({ [item.id]: !item.on } as Partial<typeof manual>)}
              >
                <span className="sr-only">{item.label}</span>
              </button>
            ) : (
              <span className={`mt-1 size-2 shrink-0 rounded-full ${item.on ? "bg-amber" : "bg-line"}`} />
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
          className="mt-1 min-h-24 w-full rounded-md border border-line bg-surface p-3 text-sm text-fg"
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
        <button className="no-print h-11 rounded-md border border-line px-3 text-sm" onClick={reset}>
          Reset
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-amber" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {CHECKS.map((phase) => (
        <section key={phase.phase}>
          <h3 className="text-sm font-semibold">{phase.phase}</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {phase.items.map((text, i) => {
              const id = checkId(phase.phase, i);
              const on = Boolean(checks[id]);
              return (
                <li key={id}>
                  <button
                    aria-pressed={on}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md border border-line bg-surface px-3 text-left text-sm"
                    onClick={() => toggle(id)}
                  >
                    <span className={`size-4 shrink-0 rounded-sm border ${on ? "border-amber bg-amber" : "border-line"}`} />
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

function LogSheet() {
  const logbook = useEfb((s) => s.logbook);
  const draft = useEfb((s) => s.draftLog);
  const update = useEfb((s) => s.updateLog);
  const remove = useEfb((s) => s.removeLog);
  const total = logbook.reduce((n, e) => n + e.total, 0);
  const night90 = hoursIn(logbook, 90, (e) => e.nightLdg);
  return (
    <Sheet title="Logbook">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-sm">
          {total.toFixed(1)} hr logged here · {night90} night landings in 90 days
        </p>
        <button className="no-print h-11 rounded-md bg-amber px-3 text-sm font-medium text-ink" onClick={draft}>
          Draft this flight
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {logbook.map((e) => (
          <li key={e.id} className="rounded-md border border-line bg-surface p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-xs text-muted">
                Date
                <input
                  type="date"
                  className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-2 text-sm text-fg"
                  value={e.date}
                  onChange={(ev) => update(e.id, { date: ev.target.value })}
                />
              </label>
              <label className="text-xs text-muted">
                From
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-2 font-mono text-sm text-fg"
                  value={e.from}
                  onChange={(ev) => update(e.id, { from: ev.target.value.toUpperCase() })}
                />
              </label>
              <label className="text-xs text-muted">
                To
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-2 font-mono text-sm text-fg"
                  value={e.to}
                  onChange={(ev) => update(e.id, { to: ev.target.value.toUpperCase() })}
                />
              </label>
              <Num label="Total hr" value={e.total} step={0.1} onChange={(n) => update(e.id, { total: n })} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-mono text-xs text-muted">
                Night {e.night} · Appr {e.approaches} · Ldg {e.dayLdg}/{e.nightLdg} · {e.remarks}
              </p>
              <button className="no-print h-11 px-2 text-xs text-muted" onClick={() => remove(e.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
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
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg"
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
          className="mt-1 min-h-24 w-full rounded-md border border-line bg-surface p-3 text-sm text-fg"
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
  rental: RentalSheet,
};

export function DocumentDesk() {
  const doc = useEfb((s) => s.doc);
  const setDoc = useEfb((s) => s.setDoc);
  const departHour = useEfb((s) => s.departHour);
  const setDepartHour = useEfb((s) => s.setDepartHour);
  const apply = useEfb((s) => s.applyProfile);
  const profileId = useEfb((s) => s.aircraft.profileId);
  const Active = SHEETS[doc] ?? NavlogSheet;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="no-print flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide">FLIGHT FILE</h2>
            <p className="text-xs text-muted">One plan fills every sheet.</p>
          </div>
          <label className="text-xs text-muted">
            Depart hour
            <input
              inputMode="numeric"
              className="mt-1 h-11 w-20 rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
              value={departHour}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isFinite(n)) setDepartHour(n);
              }}
            />
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DOCS.map((d) => (
            <button
              key={d.id}
              className={`h-11 shrink-0 rounded-md px-3 text-sm ${doc === d.id ? "bg-amber text-ink" : "border border-line bg-surface text-fg"}`}
              onClick={() => setDoc(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {PROFILES.map((p) => (
            <button
              key={p.profileId}
              className={`h-10 shrink-0 rounded-md px-3 text-xs ${profileId === p.profileId ? "border border-amber text-amber" : "border border-line text-muted"}`}
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
