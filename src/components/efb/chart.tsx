import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { airportsNear, getAirport, ringsNm } from "@/lib/efb/airports";
import { nearestAirports, positionAlong, routeDistance } from "@/lib/efb/nav";
import { loadStreetTile, streetTileIds, type StreetGeom } from "@/lib/efb/streets";
import { useEfb } from "@/lib/efb/store";
import { useTrack } from "@/lib/efb/track";
import type { Airport } from "@/lib/efb/types";
import { containsBox, sectionalTiles, tileCenter, type ChartBox } from "@/lib/efb/web-mercator";

let chartSize = { w: 800, h: 600 };

export function setChartSize(w: number, h: number) {
  chartSize = { w: Math.max(w, 240), h: Math.max(h, 240) };
}

export function fitAirports(ids: string[]) {
  const pts = ids.map((id) => getAirport(id)).filter((a): a is Airport => Boolean(a));
  if (!pts.length) return;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const nmH = Math.max((maxLat - minLat) * 60, 14);
  const nmW = Math.max((maxLon - minLon) * 60 * Math.cos((midLat * Math.PI) / 180), 14);
  const px = Math.min((chartSize.w - 96) / nmW, (chartSize.h - 140) / nmH);
  useEfb.getState().setView(midLat, midLon, px);
}

type Pt = { x: number; y: number };

const TILE = 512;

function mapZoom(pxPerNm: number, lat: number): number {
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return Math.max(0, Math.min(16, Math.log2(pxPerNm * cos * (21600 / TILE))));
}

function mercY(lat: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const s = Math.sin(r);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

function latFromMercY(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return ((180 / Math.PI) * Math.atan(Math.sinh(n)));
}

function projectPoint(
  plat: number,
  plon: number,
  lat: number,
  lon: number,
  pxPerNm: number,
  w: number,
  h: number,
): Pt {
  const world = TILE * 2 ** mapZoom(pxPerNm, lat);
  const cx = (lon + 180) / 360;
  const cy = mercY(lat);
  let dx = (plon + 180) / 360 - cx;
  if (dx > 0.5) dx -= 1;
  if (dx < -0.5) dx += 1;
  return { x: w / 2 + dx * world, y: h / 2 + (mercY(plat) - cy) * world };
}

function unproject(
  x: number,
  y: number,
  lat: number,
  lon: number,
  pxPerNm: number,
  w: number,
  h: number,
): { lat: number; lon: number } {
  const world = TILE * 2 ** mapZoom(pxPerNm, lat);
  const cx = (lon + 180) / 360;
  const cy = mercY(lat);
  let nx = cx + (x - w / 2) / world;
  nx = ((nx % 1) + 1) % 1;
  const ny = Math.max(0.001, Math.min(0.999, cy + (y - h / 2) / world));
  let nextLon = nx * 360 - 180;
  if (nextLon > 180) nextLon -= 360;
  return { lat: latFromMercY(ny), lon: nextLon };
}

const STREET_U = 4096;

function mercPath(list: StreetGeom[]): string {
  let d = "";
  for (const g of list) {
    const pts = g.pts;
    for (let i = 0; i < pts.length; i++) {
      const x = ((pts[i][0] + 180) / 360) * STREET_U;
      const y = mercY(pts[i][1]) * STREET_U;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    if (g.closed) d += "Z";
  }
  return d;
}

function shownOnChart(airport: Airport, pxPerNm: number, selected: boolean, onRoute: boolean) {
  return selected || onRoute || pxPerNm > 4.5 || (pxPerNm > 1.7 && airport.cls !== "E") || airport.cls === "B";
}

export function Chart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const lat = useEfb((s) => s.lat);
  const lon = useEfb((s) => s.lon);
  const pxPerNm = useEfb((s) => s.pxPerNm);
  const route = useEfb((s) => s.route);
  const selected = useEfb((s) => s.selected);
  const progressNm = useEfb((s) => s.progressNm);
  const flying = useEfb((s) => s.flying);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    lat: number;
    lon: number;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const chartMode = useEfb((s) => s.chartMode);
  const [streets, setStreets] = useState<StreetGeom[]>([]);
  const [sheets, setSheets] = useState<ChartBox[]>([]);
  const [cycle, setCycle] = useState("");
  useEffect(() => {
    document.documentElement.dataset.chart = chartMode;
  }, [chartMode]);
  const streetKey = streetTileIds(lat, lon, size.w, size.h, pxPerNm).join(",");
  useEffect(() => {
    let cancel = false;
    const ids = streetKey ? streetKey.split(",") : [];
    void Promise.all(ids.map((id) => loadStreetTile(id))).then((groups) => {
      if (!cancel) setStreets(groups.flat());
    });
    return () => {
      cancel = true;
    };
  }, [streetKey]);

  const viewSouth = lat - size.h / pxPerNm / 120;
  const viewNorth = lat + size.h / pxPerNm / 120;
  const viewWest = lon - size.w / pxPerNm / (120 * Math.cos((lat * Math.PI) / 180));
  const viewEast = lon + size.w / pxPerNm / (120 * Math.cos((lat * Math.PI) / 180));
  const viewKey = [viewSouth, viewWest, viewNorth, viewEast].map((n) => n.toFixed(1)).join(",");
  useEffect(() => {
    let cancel = false;
    const pull = () => {
      const q = new URLSearchParams({
        south: String(viewSouth),
        west: String(viewWest),
        north: String(viewNorth),
        east: String(viewEast),
      });
      void fetch(`/api/charts/status?${q}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { effective?: string; expires?: string; sheets?: ChartBox[] } | null) => {
          if (cancel || !body?.sheets) return;
          setSheets(body.sheets);
          if (body.effective && body.expires) setCycle(`${body.effective} – ${body.expires}`);
        })
        .catch(() => undefined);
    };
    pull();
    const id = setInterval(pull, 8000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [viewKey, viewSouth, viewWest, viewNorth, viewEast]);

  const streetDraw = useMemo(() => {
    const water: StreetGeom[] = [];
    const river: StreetGeom[] = [];
    const park: StreetGeom[] = [];
    const road: StreetGeom[] = [];
    const hwy: StreetGeom[] = [];
    for (const g of streets) {
      if (g.kind === "water") (g.closed ? water : river).push(g);
      else if (g.kind === "park") park.push(g);
      else if (g.kind === "road") road.push(g);
      else hwy.push(g);
    }
    return {
      water: mercPath(water),
      river: mercPath(river),
      park: mercPath(park),
      road: mercPath(road),
      hwy: mercPath(hwy),
    };
  }, [streets]);

  const chartTiles = useMemo(
    () =>
      sectionalTiles(lat, lon, size.w, size.h, pxPerNm).filter((tile) => {
        const center = tileCenter(tile.z, tile.x, tile.y);
        return sheets.some((sheet) => containsBox(sheet, center.lat, center.lon));
      }),
    [lat, lon, size.w, size.h, pxPerNm, sheets],
  );

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(240, rect.width);
      const h = Math.max(240, rect.height);
      setChartSize(w, h);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const ids = useEfb.getState().route;
    if (ids.length < 2) return;
    const id = requestAnimationFrame(() => fitAirports(useEfb.getState().route));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!flying) return;
    const total = routeDistance(route);
    if (total < 0.5) {
      useEfb.getState().setFlying(false);
      return;
    }
    let progress = useEfb.getState().progressNm;
    if (progress >= total) progress = 0;
    let last = performance.now();
    let raf = 0;
    const nmPerSec = Math.max(total, 28) / 18;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      progress += nmPerSec * dt;
      if (progress >= total) {
        useEfb.getState().setProgressNm(total);
        useEfb.getState().setFlying(false);
        return;
      }
      useEfb.getState().setProgressNm(progress);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flying, route]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const state = useEfb.getState();
      const factor = e.deltaY > 0 ? 0.9 : 1.11;
      const next = Math.min(48, Math.max(0.35, state.pxPerNm * factor));
      const under = unproject(x, y, state.lat, state.lon, state.pxPerNm, rect.width, rect.height);
      const world = TILE * 2 ** mapZoom(next, state.lat);
      const cy = mercY(under.lat) - (y - rect.height / 2) / world;
      let cx = (under.lon + 180) / 360 - (x - rect.width / 2) / world;
      cx = ((cx % 1) + 1) % 1;
      let lon2 = cx * 360 - 180;
      if (lon2 > 180) lon2 -= 360;
      state.setView(latFromMercY(cy), lon2, next);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const { w, h } = size;
  const toXY = (plat: number, plon: number): Pt =>
    projectPoint(plat, plon, lat, lon, pxPerNm, w, h);

  const nmPerPx = 1 / pxPerNm;
  const latSpan = (h * nmPerPx) / 60;
  const lonSpan = (w * nmPerPx) / (60 * Math.cos((lat * Math.PI) / 180));
  const step = pxPerNm > 8 ? 0.25 : pxPerNm > 2.2 ? 0.5 : 1;
  const lat0 = Math.floor((lat - latSpan / 2) / step) * step;
  const lon0 = Math.floor((lon - lonSpan / 2) / step) * step;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let glat = lat0; glat <= lat + latSpan / 2 + step; glat += step) lats.push(Number(glat.toFixed(2)));
  for (let glon = lon0; glon <= lon + lonSpan / 2 + step; glon += step) lons.push(Number(glon.toFixed(2)));

  const routeSet = new Set(route);
  const visible = airportsNear(lat, lon, latSpan, lonSpan);
  const routePts = route
    .map((id) => getAirport(id))
    .filter((a): a is Airport => Boolean(a))
    .map((a) => toXY(a.lat, a.lon));

  const tracking = useTrack((s) => s.tracking);
  const fix = useTrack((s) => s.fix);
  const live = tracking && fix ? fix : null;
  const ship = live
    ? { lat: live.lat, lon: live.lon, track: live.track }
    : route.length
      ? positionAlong(route, progressNm)
      : null;
  const shipPt = ship ? toXY(ship.lat, ship.lon) : null;
  const accuracyPx = live && live.accuracyM < 5000 ? (live.accuracyM / 1852) * pxPerNm : 0;

  const scaleNm = pxPerNm > 8 ? 5 : pxPerNm > 2 ? 10 : 30;
  const scalePx = scaleNm * pxPerNm;
  const sx = w - scalePx - 20;
  const sy = h - 78;

  const hit = (x: number, y: number) => {
    const state = useEfb.getState();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    let best: Airport | null = null;
    let bestD = 22;
    const latSpanHit = rect.height / (60 * state.pxPerNm);
    const lonSpanHit = rect.width / (Math.cos((state.lat * Math.PI) / 180) * 60 * state.pxPerNm);
    const routeIds = state.route;
    for (const airport of airportsNear(state.lat, state.lon, latSpanHit, lonSpanHit, 0.4)) {
      if (!shownOnChart(airport, state.pxPerNm, airport.icao === state.selected, routeIds.includes(airport.icao))) continue;
      const p = projectPoint(airport.lat, airport.lon, state.lat, state.lon, state.pxPerNm, rect.width, rect.height);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = airport;
      }
    }
    if (best) {
      state.focus(best.icao);
      return;
    }
    const project = (plat: number, plon: number) =>
      projectPoint(plat, plon, state.lat, state.lon, state.pxPerNm, rect.width, rect.height);
    let seg = -1;
    let segD = 18;
    for (let i = 0; i < routeIds.length - 1; i++) {
      const a = getAirport(routeIds[i]);
      const b = getAirport(routeIds[i + 1]);
      if (!a || !b) continue;
      const pa = project(a.lat, a.lon);
      const pb = project(b.lat, b.lon);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      let t = ((x - pa.x) * dx + (y - pa.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      if (t < 0.08 || t > 0.92) continue;
      const d = Math.hypot(x - (pa.x + t * dx), y - (pa.y + t * dy));
      if (d < segD) {
        segD = d;
        seg = i;
      }
    }
    if (seg < 0) {
      state.select(null);
      return;
    }
    const here = unproject(x, y, state.lat, state.lon, state.pxPerNm, rect.width, rect.height);
    const from = routeIds[seg];
    const to = routeIds[seg + 1];
    const pick = nearestAirports(here.lat, here.lon, 8).find((n) => n.nm <= 20 && n.airport.icao !== from && n.airport.icao !== to);
    if (pick) state.insertAt(seg + 1, pick.airport.icao);
  };

  const streetWorld = TILE * 2 ** mapZoom(pxPerNm, lat);
  const streetScale = streetWorld / STREET_U;
  const streetTx = w / 2 - ((lon + 180) / 360) * streetWorld;
  const streetTy = h / 2 - mercY(lat) * streetWorld;

  return (
    <div ref={wrapRef} className="relative h-full w-full" style={{ background: "var(--chart-paper)" }}>
      <svg
        ref={svgRef}
        className="relative z-10 h-full w-full touch-none"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Moving chart"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          pointers.current.set(e.pointerId, { x, y });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
            drag.current = null;
            return;
          }
          const s = useEfb.getState();
          drag.current = { id: e.pointerId, x, y, lat: s.lat, lon: s.lon, moved: false };
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y });
          if (pointers.current.size >= 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const s = useEfb.getState();
            const next = Math.min(48, Math.max(0.35, s.pxPerNm * (dist / pinch.current)));
            pinch.current = dist;
            s.setView(s.lat, s.lon, next);
            return;
          }
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = x - d.x;
          const dy = y - d.y;
          if (Math.hypot(dx, dy) > 5) {
            d.moved = true;
            if (useTrack.getState().tracking) useTrack.getState().setFollow(false);
          }
          const s = useEfb.getState();
          const world = TILE * 2 ** mapZoom(s.pxPerNm, d.lat);
          const cy = mercY(d.lat) - dy / world;
          let cx = (d.lon + 180) / 360 - dx / world;
          cx = ((cx % 1) + 1) % 1;
          let nextLon = cx * 360 - 180;
          if (nextLon > 180) nextLon -= 360;
          s.setView(latFromMercY(cy), nextLon, s.pxPerNm);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (d && d.id === e.pointerId) {
            if (!d.moved) {
              const rect = e.currentTarget.getBoundingClientRect();
              hit(e.clientX - rect.left, e.clientY - rect.top);
            }
            drag.current = null;
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          drag.current = null;
          pinch.current = null;
        }}
      >
        <rect width={w} height={h} fill="transparent" />
        <g
          pointerEvents="none"
          transform={`matrix(${streetScale} 0 0 ${streetScale} ${streetTx} ${streetTy})`}
        >
          {streetDraw.water && (
            <path d={streetDraw.water} fill="var(--chart-water)" stroke="none" />
          )}
          {streetDraw.park && <path d={streetDraw.park} fill="var(--chart-park)" stroke="none" />}
          {streetDraw.river && (
            <path
              d={streetDraw.river}
              fill="none"
              stroke="var(--chart-water)"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {streetDraw.road && (
            <path
              d={streetDraw.road}
              fill="none"
              stroke="var(--chart-road)"
              strokeWidth={1.15}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {streetDraw.hwy && (
            <path
              d={streetDraw.hwy}
              fill="none"
              stroke="var(--chart-hwy)"
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {chartTiles.map((tile) => {
            const n = 2 ** tile.z;
            const s = STREET_U / n;
            return (
              <image
                key={`${tile.z}/${tile.x}/${tile.y}`}
                href={`/api/charts/tile/${tile.z}/${tile.x}/${tile.y}`}
                x={(tile.x / n) * STREET_U}
                y={(tile.y / n) * STREET_U}
                width={s}
                height={s}
                preserveAspectRatio="none"
              />
            );
          })}
        </g>
        {lats.map((glat) => {
          const y = toXY(glat, lon).y;
          return (
            <g key={`lat-${glat}`}>
              <line x1={0} y1={y} x2={w} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={8} y={y - 4} fill="var(--chart-dim)" fontSize={11} fontFamily="IBM Plex Mono, ui-monospace, monospace">
                {glat.toFixed(step < 1 ? 1 : 0)}°
              </text>
            </g>
          );
        })}
        {lons.map((glon) => {
          const x = toXY(lat, glon).x;
          return (
            <g key={`lon-${glon}`}>
              <line x1={x} y1={0} x2={x} y2={h} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={x + 4} y={16} fill="var(--chart-dim)" fontSize={11} fontFamily="IBM Plex Mono, ui-monospace, monospace">
                {glon.toFixed(step < 1 ? 1 : 0)}°
              </text>
            </g>
          );
        })}

        {visible.map((airport) => {
          const rings = ringsNm(airport);
          if (!rings.length) return null;
          if (airport.cls === "D" && pxPerNm < 2.2) return null;
          if (airport.cls === "C" && pxPerNm < 1.05) return null;
          const c = toXY(airport.lat, airport.lon);
          const maxR = rings[rings.length - 1] * pxPerNm;
          if (c.x < -maxR || c.y < -maxR || c.x > w + maxR || c.y > h + maxR) return null;
          const dash = airport.cls === "D" ? "3 4" : airport.cls === "C" ? "7 4" : undefined;
          return rings.map((nm) => (
            <circle
              key={`${airport.icao}-${nm}`}
              cx={c.x}
              cy={c.y}
              r={nm * pxPerNm}
              fill="none"
              stroke="var(--chart-ring)"
              strokeWidth={airport.cls === "B" ? 1.4 : 1}
              strokeDasharray={dash}
            />
          ));
        })}

        {routePts.length >= 2 && (
          <polyline
            points={routePts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--chart-route)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}

        {visible.map((airport) => {
          const p = toXY(airport.lat, airport.lon);
          if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) return null;
          const onRoute = routeSet.has(airport.icao);
          const isSel = selected === airport.icao;
          if (!shownOnChart(airport, pxPerNm, isSel, onRoute)) return null;
          const towered = airport.cls !== "E";
          const mark = isSel || onRoute ? "var(--chart-route)" : "var(--chart-ink)";
          const label = pxPerNm > 5 || isSel || onRoute || airport.cls === "B";
          const rad = airport.hdg !== undefined ? ((airport.hdg - 90) * Math.PI) / 180 : 0;
          const len = Math.min(28, 1.1 * pxPerNm);
          return (
            <g key={airport.icao}>
              {airport.hdg !== undefined && pxPerNm > 11 && (
                <line
                  x1={p.x - Math.cos(rad) * len}
                  y1={p.y - Math.sin(rad) * len}
                  x2={p.x + Math.cos(rad) * len}
                  y2={p.y + Math.sin(rad) * len}
                  stroke="var(--chart-dim)"
                  strokeWidth={1.5}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isSel ? 6 : 4}
                fill={towered ? mark : "none"}
                stroke={mark}
                strokeWidth={1.5}
              />
              {label && (
                <text
                  x={p.x + 8}
                  y={p.y + 4}
                  fill="var(--chart-ink)"
                  fontSize={12}
                  fontWeight={isSel ? 600 : 500}
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {airport.icao}
                </text>
              )}
            </g>
          );
        })}

        {ship && shipPt && (
          <g transform={`translate(${shipPt.x} ${shipPt.y})`}>
            {accuracyPx > 4 && (
              <circle r={accuracyPx} fill="none" stroke="var(--chart-own)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {ship.track == null ? (
              <circle r={6} fill="var(--chart-own)" stroke="var(--chart-route)" strokeWidth={1.5} />
            ) : (
              <g transform={`rotate(${ship.track})`}>
                <polygon points="0,-12 7,10 0,5 -7,10" fill="var(--chart-own)" stroke="var(--chart-route)" strokeWidth={1} />
              </g>
            )}
          </g>
        )}

        <g stroke="var(--chart-ink)" strokeWidth={1.5}>
          <line x1={sx} y1={sy} x2={sx + scalePx} y2={sy} />
          <line x1={sx} y1={sy - 4} x2={sx} y2={sy + 4} />
          <line x1={sx + scalePx} y1={sy - 4} x2={sx + scalePx} y2={sy + 4} />
        </g>
        <text
          x={sx + scalePx / 2}
          y={sy - 8}
          fill="var(--chart-ink)"
          fontSize={11}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
        >
          {scaleNm} NM
        </text>
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-bg/80 px-2 py-1 text-xs text-muted">
        <div>Filled tower · Open CTAF</div>
        <div>{cycle ? `FAA sectional · ${cycle}` : "Loading FAA sectional"}</div>
        <div>
          {chartTiles.length ? (
            "Not a certified EFB. Check NOTAMs."
          ) : (
            <>
              <a className="pointer-events-auto underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
              {" until the sheet arrives"}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
