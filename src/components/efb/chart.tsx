import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { airportsNear, getAirport, ringsNm } from "@/lib/efb/airports";
import { nearestAirports, positionAlong, routeDistance } from "@/lib/efb/nav";
import { loadStreetTile, streetTileIds, type StreetGeom } from "@/lib/efb/streets";
import { useEfb } from "@/lib/efb/store";
import { useTrack } from "@/lib/efb/track";
import { useWeather } from "@/lib/efb/use-weather";
import { useLive } from "@/lib/efb/live-store";
import { useAdsb } from "@/lib/efb/adsb";
import { FAA_LAYERS, RADAR_LAYER, RADAR_META, layerTiles } from "@/lib/efb/layers";
import { ringContains as tfrContains, type MetarField } from "@/lib/efb/live";
import type { WxAdvisories, WxArea } from "@/lib/efb/advisories";
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
  // Leave room for the status chips, the tool stack, and the instrument strip.
  const px = Math.min((chartSize.w - 170) / nmW, (chartSize.h - 240) / nmH);
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

function wxStroke(hazard: string): string {
  const h = hazard.toUpperCase();
  if (h.includes("ICE") || h.includes("FZ")) return "var(--chart-wx-ice)";
  if (h.includes("TURB") || h === "LLWS" || h === "MTW") return "var(--chart-wx-turb)";
  if (h.includes("WIND")) return "var(--chart-wx-wind)";
  if (h === "IFR" || h.includes("OBSC")) return "var(--chart-wx-ifr)";
  return "var(--chart-wx-sig)";
}

function ringHits(ring: [number, number][], south: number, west: number, north: number, east: number): boolean {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return maxLat >= south && minLat <= north && maxLon >= west && minLon <= east;
}

function ringContains(ring: [number, number][], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0000001) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function overheadLabels(areas: WxArea[], lat: number, lon: number): string[] {
  const labels: string[] = [];
  for (const area of areas) {
    if (area.line) continue;
    if (!area.rings.some((ring) => ringContains(ring, lat, lon))) continue;
    if (!labels.includes(area.label)) labels.push(area.label);
    if (labels.length >= 4) break;
  }
  return labels;
}

function clockZ(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16) + "Z";
}

type RasterImg = { href: string; x: number; y: number; s: number; opacity: number };

const rasterCache = new Map<string, HTMLImageElement>();

function RasterCanvas({
  w,
  h,
  scale,
  tx,
  ty,
  images,
  className,
}: {
  w: number;
  h: number;
  scale: number;
  tx: number;
  ty: number;
  images: RasterImg[];
  className: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = images.map((img) => `${img.href}@${img.opacity}`).join("|");
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
      for (const img of images) {
        const el = rasterCache.get(img.href);
        if (!el?.complete || !el.naturalWidth) continue;
        ctx.globalAlpha = img.opacity;
        ctx.drawImage(el, img.x, img.y, img.s + 0.5, img.s + 0.5);
      }
      ctx.globalAlpha = 1;
    };
    for (const img of images) {
      let el = rasterCache.get(img.href);
      if (!el) {
        el = new Image();
        el.decoding = "async";
        el.src = img.href;
        rasterCache.set(img.href, el);
        if (rasterCache.size > 500) {
          const first = rasterCache.keys().next().value;
          if (first) rasterCache.delete(first);
        }
      }
      if (!el.complete) el.addEventListener("load", draw, { once: true });
    }
    draw();
    return () => {
      alive = false;
    };
  }, [w, h, scale, tx, ty, key, images]);
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}

export function Chart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
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
    cx: number;
    cy: number;
    lat: number;
    lon: number;
    moved: boolean;
    dx: number;
    dy: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const zoomRaf = useRef(0);

  const showAdvisories = useEfb((s) => s.showAdvisories);
  const wxIds = useMemo(() => [...new Set([...route, ...(selected ? [selected] : [])])].slice(0, 16), [route, selected]);
  const routeWx = useWeather(wxIds);
  const catOf = (icao: string): string | null => routeWx.data?.metars.find((m) => m.icao === icao)?.fltCat ?? null;
  const [streets, setStreets] = useState<StreetGeom[]>([]);
  const [sheets, setSheets] = useState<ChartBox[]>([]);
  const [cycle, setCycle] = useState("");
  const [wx, setWx] = useState<WxAdvisories | null>(null);
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

  useEffect(() => {
    if (!showAdvisories) return;
    let cancel = false;
    const pull = () => {
      void fetch("/api/wx/advisories")
        .then((res) => (res.ok ? res.json() : null))
        .then((body: WxAdvisories | null) => {
          if (!cancel && body && Array.isArray(body.areas)) setWx(body);
        })
        .catch(() => undefined);
    };
    pull();
    const id = setInterval(pull, 5 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancel = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [showAdvisories]);

  // Flight-category dots for every reporting station in view.
  const showMetars = useEfb((s) => s.showMetars);
  const showTfrs = useEfb((s) => s.showTfrs);
  const showGlide = useEfb((s) => s.showGlide);
  const metars = useLive((s) => s.metars);
  const tfrs = useLive((s) => s.tfrs);
  const metarKey = [Math.floor(viewSouth), Math.floor(viewWest), Math.ceil(viewNorth), Math.ceil(viewEast)].join(",");
  const metarsOn = showMetars && pxPerNm > 0.7;
  useEffect(() => {
    if (!metarsOn) return;
    const [south, west, north, east] = metarKey.split(",").map(Number);
    let cancel = false;
    const pull = () => {
      const q = new URLSearchParams({ south: String(south), west: String(west), north: String(north), east: String(east) });
      void fetch(`/api/wx/metars?${q}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: MetarField | null) => {
          if (!cancel && body && Array.isArray(body.stations)) useLive.getState().setMetars(body);
        })
        .catch(() => undefined);
    };
    const t = setTimeout(pull, 250);
    const id = setInterval(pull, 5 * 60 * 1000);
    return () => {
      cancel = true;
      clearTimeout(t);
      clearInterval(id);
    };
  }, [metarsOn, metarKey]);

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

  const baseChart = useEfb((s) => s.baseChart);
  const showRadar = useEfb((s) => s.showRadar);
  const faaLayer = baseChart === "sectional" ? null : FAA_LAYERS[baseChart];
  const faaTiles = useMemo(
    () => (faaLayer ? layerTiles(faaLayer, lat, lon, size.w, size.h, pxPerNm) : []),
    [faaLayer, lat, lon, size.w, size.h, pxPerNm],
  );
  const radarTiles = useMemo(
    () => (showRadar ? layerTiles(RADAR_LAYER, lat, lon, size.w, size.h, pxPerNm, 36) : []),
    [showRadar, lat, lon, size.w, size.h, pxPerNm],
  );
  // Radar tiles refresh every five minutes; the stamp busts the browser cache.
  const [radarStamp, setRadarStamp] = useState<{ key: number; valid: string }>({ key: 0, valid: "" });
  useEffect(() => {
    if (!showRadar) return;
    let cancel = false;
    const pull = () => {
      void fetch(RADAR_META)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { meta?: { valid?: string } } | null) => {
          if (!cancel) setRadarStamp({ key: Math.floor(Date.now() / 300000), valid: b?.meta?.valid ?? "" });
        })
        .catch(() => {
          if (!cancel) setRadarStamp((p) => ({ ...p, key: Math.floor(Date.now() / 300000) }));
        });
    };
    pull();
    const id = setInterval(pull, 5 * 60 * 1000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [showRadar]);

  const chartTiles = useMemo(
    () =>
      // TAC sits on top of the sectional, so keep drawing it underneath.
      (baseChart === "sectional" || baseChart === "tac" ? sectionalTiles(lat, lon, size.w, size.h, pxPerNm) : []).filter((tile) => {
        const center = tileCenter(tile.z, tile.x, tile.y);
        return sheets.some((sheet) => containsBox(sheet, center.lat, center.lon));
      }),
    [lat, lon, size.w, size.h, pxPerNm, sheets, baseChart],
  );
  const raster = useMemo(() => {
    const pack = (tiles: { z: number; x: number; y: number }[], href: (t: { z: number; x: number; y: number }) => string, opacity: number) => {
      const out: RasterImg[] = [];
      for (const tile of tiles) {
        const n = 2 ** tile.z;
        out.push({
          href: href(tile),
          x: (tile.x / n) * STREET_U,
          y: (tile.y / n) * STREET_U,
          s: STREET_U / n,
          opacity,
        });
      }
      return out;
    };
    return {
      sectional: pack(chartTiles, (t) => `/api/charts/tile/${t.z}/${t.x}/${t.y}`, 1),
      faa: faaLayer ? pack(faaTiles, (t) => faaLayer.url(t.z, t.x, t.y), 1) : [],
      radar: showRadar ? pack(radarTiles, (t) => `${RADAR_LAYER.url(t.z, t.x, t.y)}?t=${radarStamp.key}`, 0.7) : [],
    };
  }, [chartTiles, faaTiles, faaLayer, radarTiles, showRadar, radarStamp.key]);

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

  // ADS-B traffic.
  const showTraffic = useEfb((s) => s.showTraffic);
  const adsbTargets = useAdsb((s) => s.targets);
  const adsbOwn = useAdsb((s) => s.ownship);
  const adsbConnected = useAdsb((s) => s.connected);
  const ownAlt = adsbOwn?.altFt ?? null;
  const ownPos = live ? { lat: live.lat, lon: live.lon } : adsbOwn ? { lat: adsbOwn.lat, lon: adsbOwn.lon } : null;

  // No-wind glide range: height above the nearest field times the glide ratio.
  const glideRatio = useEfb((s) => s.aircraft.glide ?? 9);
  const cruiseFt = useEfb((s) => s.aircraft.cruiseFt);
  const glide = (() => {
    if (!showGlide || !ship || !shipPt) return null;
    const altFt = live ? live.altFt : flying || progressNm > 0 ? cruiseFt : null;
    if (altFt == null) return null;
    const ground = nearestAirports(ship.lat, ship.lon, 1)[0]?.airport.elev ?? 0;
    const agl = altFt - ground;
    if (agl < 300) return null;
    const nm = (agl * glideRatio) / 6076;
    return { nm, px: nm * pxPerNm };
  })();

  const scaleNm = pxPerNm > 8 ? 5 : pxPerNm > 2 ? 10 : 30;
  const scalePx = scaleNm * pxPerNm;
  const sx = w - scalePx - 76;
  const sy = h - 96;

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
      const at = unproject(x, y, state.lat, state.lon, state.pxPerNm, rect.width, rect.height);
      const live = useLive.getState();
      const tfr = state.showTfrs ? live.tfrs.tfrs.find((t) => t.rings.some((r) => tfrContains(r, at.lat, at.lon))) : undefined;
      live.setPickedTfr(tfr ? tfr.id : null);
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
      <div ref={panRef} className="absolute inset-0">
      <RasterCanvas w={w} h={h} scale={streetScale} tx={streetTx} ty={streetTy} images={raster.sectional} className="sectional-tiles" />
      {faaLayer && (
        <RasterCanvas
          w={w}
          h={h}
          scale={streetScale}
          tx={streetTx}
          ty={streetTy}
          images={raster.faa}
          className={faaLayer.paper === "ifr" ? "ifr-tiles" : "sectional-tiles"}
        />
      )}
      {showRadar && <RasterCanvas w={w} h={h} scale={streetScale} tx={streetTx} ty={streetTy} images={raster.radar} className="radar-tiles" />}
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
            const d = drag.current;
            if (d?.moved) {
              const world = TILE * 2 ** mapZoom(useEfb.getState().pxPerNm, d.lat);
              const cy = mercY(d.lat) - d.dy / world;
              let cx = (d.lon + 180) / 360 - d.dx / world;
              cx = ((cx % 1) + 1) % 1;
              let nextLon = cx * 360 - 180;
              if (nextLon > 180) nextLon -= 360;
              useEfb.getState().setView(latFromMercY(cy), nextLon);
            }
            if (panRef.current) panRef.current.style.transform = "";
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
            drag.current = null;
            return;
          }
          const s = useEfb.getState();
          drag.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, lat: s.lat, lon: s.lon, moved: false, dx: 0, dy: 0 };
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
            cancelAnimationFrame(zoomRaf.current);
            zoomRaf.current = requestAnimationFrame(() => useEfb.getState().setView(useEfb.getState().lat, useEfb.getState().lon, next));
            return;
          }
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.cx;
          const dy = e.clientY - d.cy;
          d.dx = dx;
          d.dy = dy;
          if (Math.hypot(dx, dy) > 5) {
            d.moved = true;
            if (useTrack.getState().tracking) useTrack.getState().setFollow(false);
          }
          if (panRef.current) panRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (d && d.id === e.pointerId) {
            const dx = e.clientX - d.cx;
            const dy = e.clientY - d.cy;
            if (panRef.current) panRef.current.style.transform = "";
            if (!d.moved) {
              const rect = e.currentTarget.getBoundingClientRect();
              hit(e.clientX - rect.left, e.clientY - rect.top);
            } else {
              const world = TILE * 2 ** mapZoom(useEfb.getState().pxPerNm, d.lat);
              const cy = mercY(d.lat) - dy / world;
              let cx = (d.lon + 180) / 360 - dx / world;
              cx = ((cx % 1) + 1) % 1;
              let nextLon = cx * 360 - 180;
              if (nextLon > 180) nextLon -= 360;
              useEfb.getState().setView(latFromMercY(cy), nextLon, useEfb.getState().pxPerNm);
            }
            drag.current = null;
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          drag.current = null;
          pinch.current = null;
          if (panRef.current) panRef.current.style.transform = "";
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
        </g>
        {lats.map((glat) => {
          const y = toXY(glat, lon).y;
          return (
            <g key={`lat-${glat}`}>
              <line x1={0} y1={y} x2={w} y2={y} stroke="var(--chart-grid)" strokeWidth={1} strokeOpacity={0.7} />
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
              <line x1={x} y1={0} x2={x} y2={h} stroke="var(--chart-grid)" strokeWidth={1} strokeOpacity={0.7} />
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

        {showAdvisories && wx && (
          <g data-wx="1" pointerEvents="none">
            {wx.areas.map((area) => {
              const visible = area.rings.some((ring) =>
                ringHits(ring, viewSouth - 1, viewWest - 1, viewNorth + 1, viewEast + 1),
              );
              if (!visible) return null;
              const color = wxStroke(area.hazard);
              const d = area.rings
                .map((ring) =>
                  ring
                    .map((pt, i) => {
                      const p = toXY(pt[1], pt[0]);
                      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
                    })
                    .join(" ") + (area.line ? "" : "Z"),
                )
                .join(" ");
              const mid = area.rings[0][Math.floor(area.rings[0].length / 2)];
              const labelAt = mid ? toXY(mid[1], mid[0]) : null;
              const showLabel = Boolean(labelAt && labelAt.x > 8 && labelAt.y > 16 && labelAt.x < w - 8 && labelAt.y < h - 8);
              return (
                <g key={area.id}>
                  <path
                    d={d}
                    fill={area.line ? "none" : color}
                    fillOpacity={area.line ? 0 : 0.22}
                    stroke={color}
                    strokeWidth={area.hazard === "CONV" || area.hazard === "TS" ? 2.4 : 1.5}
                    strokeDasharray={area.line ? "4 3" : undefined}
                  >
                    <title>{area.detail}</title>
                  </path>
                  {showLabel && pxPerNm > 2 && labelAt && (
                    <text
                      x={labelAt.x}
                      y={labelAt.y}
                      fill={color}
                      fontSize={11}
                      fontWeight={600}
                      fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    >
                      {area.label}
                    </text>
                  )}
                </g>
              );
            })}
            {wx.pireps.map((report) => {
              if (report.lat < viewSouth || report.lat > viewNorth || report.lon < viewWest || report.lon > viewEast) {
                return null;
              }
              const p = toXY(report.lat, report.lon);
              return (
                <g key={report.id}>
                  <circle cx={p.x} cy={p.y} r={4} fill="var(--chart-wx-turb)" stroke="var(--chart-ink)" strokeWidth={1} />
                  {pxPerNm > 6 && (
                    <text
                      x={p.x + 7}
                      y={p.y + 4}
                      fill="var(--chart-ink)"
                      fontSize={10}
                      fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    >
                      {report.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {showTfrs && tfrs.tfrs.length > 0 && (
          <g data-tfr="1" pointerEvents="none">
            {tfrs.tfrs.map((t) => {
              const hit = t.rings.some((ring) => ringHits(ring, viewSouth - 0.5, viewWest - 0.5, viewNorth + 0.5, viewEast + 0.5));
              if (!hit) return null;
              const d = t.rings
                .map(
                  (ring) =>
                    ring
                      .map((pt, i) => {
                        const p = toXY(pt[1], pt[0]);
                        return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
                      })
                      .join(" ") + "Z",
                )
                .join(" ");
              const first = t.rings[0];
              let cx = 0;
              let cy = 0;
              for (const [lo, la] of first) {
                cx += lo;
                cy += la;
              }
              const c = toXY(cy / first.length, cx / first.length);
              return (
                <g key={t.id}>
                  <path d={d} fill="#ff3df0" fillOpacity={0.14} stroke="#ff3df0" strokeWidth={2} strokeDasharray="6 3" />
                  {pxPerNm > 1.5 && (
                    <text
                      x={c.x}
                      y={c.y}
                      textAnchor="middle"
                      fill="#ff3df0"
                      stroke="var(--chart-paper)"
                      strokeWidth={3}
                      paintOrder="stroke"
                      fontSize={11}
                      fontWeight={700}
                      fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    >
                      TFR {t.id}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {metarsOn && (
          <g data-metars="1" pointerEvents="none">
            {metars.stations.map((m) => {
              const color = catColor(m.cat);
              if (!color) return null;
              const p = toXY(m.lat, m.lon);
              if (p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) return null;
              const r = pxPerNm > 4 ? 7 : 5.5;
              const len = m.wspd && m.wspd >= 5 && m.wdir != null ? Math.min(26, 8 + m.wspd) : 0;
              const a = m.wdir != null ? ((m.wdir - 90) * Math.PI) / 180 : 0;
              return (
                <g key={m.id}>
                  {len > 0 && (
                    <line
                      x1={Math.round(p.x + Math.cos(a) * r)}
                      y1={Math.round(p.y + Math.sin(a) * r)}
                      x2={Math.round(p.x + Math.cos(a) * (r + len))}
                      y2={Math.round(p.y + Math.sin(a) * (r + len))}
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  )}
                  <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.9} stroke="var(--chart-paper)" strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        )}

        {routePts.length >= 2 && (
          <g pointerEvents="none">
            <polyline
              points={routePts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--chart-route-case)"
              strokeOpacity={0.55}
              strokeWidth={7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={routePts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--chart-route)"
              strokeWidth={3.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {routePts.slice(1).map((b, i) => {
              const a = routePts[i];
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              if (len < 70) return null;
              const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={`chev-${i}`} transform={`translate(${mx} ${my}) rotate(${ang})`}>
                  <path
                    d="M-6,-6.5 L7,0 L-6,6.5 L-2.5,0 Z"
                    fill="var(--chart-route)"
                    stroke="var(--chart-route-case)"
                    strokeOpacity={0.6}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </g>
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
                  x1={Math.round(p.x - Math.cos(rad) * len)}
                  y1={Math.round(p.y - Math.sin(rad) * len)}
                  x2={Math.round(p.x + Math.cos(rad) * len)}
                  y2={Math.round(p.y + Math.sin(rad) * len)}
                  stroke="var(--chart-dim)"
                  strokeWidth={1.5}
                />
              )}
              {(() => {
                const cat = onRoute || isSel ? catOf(airport.icao) : null;
                const color = catColor(cat);
                return color ? (
                  <circle cx={p.x} cy={p.y} r={isSel ? 9 : 8} fill="none" stroke={color} strokeWidth={3} strokeOpacity={0.95}>
                    <title>{`${airport.icao} ${cat}`}</title>
                  </circle>
                ) : null;
              })()}
              {isSel && <circle cx={p.x} cy={p.y} r={14} fill="var(--chart-route)" fillOpacity={0.18} stroke="var(--chart-route)" strokeWidth={1.5} />}
              <circle
                cx={p.x}
                cy={p.y}
                r={isSel ? 6 : onRoute ? 5 : 4}
                fill={towered ? mark : "none"}
                stroke={mark}
                strokeWidth={1.5}
              />
              {label && (
                <text
                  x={p.x + (isSel ? 10 : 8)}
                  y={p.y + 4}
                  fill={isSel || onRoute ? "var(--chart-route)" : "var(--chart-ink)"}
                  stroke="var(--chart-paper)"
                  strokeWidth={3}
                  strokeOpacity={0.85}
                  paintOrder="stroke"
                  fontSize={isSel ? 13 : 12}
                  fontWeight={isSel || onRoute ? 700 : 500}
                  fontFamily="IBM Plex Mono, ui-monospace, monospace"
                >
                  {airport.icao}
                </text>
              )}
            </g>
          );
        })}

        {showTraffic && (
          <g data-traffic="1" pointerEvents="none">
            {Object.values(adsbTargets).map((t) => {
              const p = toXY(t.lat, t.lon);
              if (p.x < -30 || p.y < -30 || p.x > w + 30 || p.y > h + 30) return null;
              const rel = ownAlt != null && t.altFt != null ? Math.round((t.altFt - ownAlt) / 100) : null;
              const nm = ownPos ? Math.hypot((t.lat - ownPos.lat) * 60, (t.lon - ownPos.lon) * 60 * Math.cos((t.lat * Math.PI) / 180)) : 99;
              const threat = t.alert || (nm < 2 && rel != null && Math.abs(rel) <= 10);
              const near = nm < 6 && rel != null && Math.abs(rel) <= 30;
              const color = threat ? "var(--color-bad)" : near ? "var(--color-warn)" : "var(--color-cyan)";
              const stale = Date.now() - t.seen > 10000;
              const altText =
                rel != null ? `${rel >= 0 ? "+" : "−"}${String(Math.abs(rel)).padStart(2, "0")}` : t.altFt != null ? String(Math.round(t.altFt / 100)).padStart(3, "0") : "";
              const vs = t.vsFpm != null && Math.abs(t.vsFpm) >= 500 ? (t.vsFpm > 0 ? "↑" : "↓") : "";
              return (
                <g key={t.address} transform={`translate(${p.x} ${p.y})`} opacity={stale ? 0.45 : 1}>
                  {t.track != null ? (
                    <g transform={`rotate(${t.track})`}>
                      <path d="M0,-10 L7,8 L0,4 L-7,8 Z" fill={color} stroke="var(--chart-paper)" strokeWidth={1.5} strokeLinejoin="round" />
                    </g>
                  ) : (
                    <path d="M0,-8 L8,0 L0,8 L-8,0 Z" fill={color} stroke="var(--chart-paper)" strokeWidth={1.5} />
                  )}
                  <text
                    x={11}
                    y={-4}
                    fill={color}
                    stroke="var(--chart-paper)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, ui-monospace, monospace"
                  >
                    {altText}
                    {vs}
                  </text>
                  {pxPerNm > 3 && t.callsign && (
                    <text
                      x={11}
                      y={9}
                      fill={color}
                      stroke="var(--chart-paper)"
                      strokeWidth={3}
                      paintOrder="stroke"
                      fontSize={10}
                      fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    >
                      {t.callsign}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {glide && shipPt && (
          <g pointerEvents="none">
            <circle
              cx={shipPt.x}
              cy={shipPt.y}
              r={glide.px}
              fill="var(--chart-own)"
              fillOpacity={0.05}
              stroke="var(--chart-own)"
              strokeWidth={1.5}
              strokeDasharray="8 5"
            />
            <text
              x={shipPt.x}
              y={shipPt.y - glide.px - 6}
              textAnchor="middle"
              fill="var(--chart-own)"
              stroke="var(--chart-paper)"
              strokeWidth={3}
              paintOrder="stroke"
              fontSize={11}
              fontFamily="IBM Plex Mono, ui-monospace, monospace"
            >
              {`GLIDE ${glide.nm.toFixed(1)} NM · no wind · field elev, not terrain`}
            </text>
          </g>
        )}

        {ship && shipPt && (
          <g transform={`translate(${shipPt.x} ${shipPt.y})`}>
            {accuracyPx > 4 && (
              <circle r={accuracyPx} fill="none" stroke="var(--chart-own)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <circle r={22} fill="var(--chart-own)" fillOpacity={0.12} />
            {ship.track == null ? (
              <circle r={6} fill="var(--chart-own)" stroke="var(--chart-route)" strokeWidth={1.5} />
            ) : (
              <g transform={`rotate(${ship.track})`}>
                <polygon points="0,-15 9,12 0,6 -9,12" fill="var(--chart-own)" stroke="var(--chart-route-case)" strokeWidth={1.5} strokeLinejoin="round" />
              </g>
            )}
          </g>
        )}

        <g stroke="var(--chart-ink)" strokeWidth={1.5} pointerEvents="none">
          <line x1={sx} y1={sy} x2={sx + scalePx} y2={sy} />
          <line x1={sx} y1={sy - 4} x2={sx} y2={sy + 4} />
          <line x1={sx + scalePx} y1={sy - 4} x2={sx + scalePx} y2={sy + 4} />
        </g>
        <text
          x={sx + scalePx / 2}
          y={sy - 8}
          fill="var(--chart-ink)"
          stroke="var(--chart-paper)"
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={11}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
        >
          {scaleNm} NM
        </text>
      </svg>
      </div>
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-5.5rem)] flex-col items-start gap-1.5">
        {faaLayer ? (
          <StatusChip tone={faaTiles.length ? "ok" : "wait"}>{`FAA ${faaLayer.label} · current edition`}</StatusChip>
        ) : (
          <StatusChip tone={chartTiles.length ? "ok" : "wait"}>
            {cycle ? `Sectional ${cycle}` : "Loading FAA sectional"}
          </StatusChip>
        )}
        {adsbConnected && (
          <StatusChip tone="ok">{`ADS-B · ${Object.keys(adsbTargets).length} traffic${adsbOwn ? " · own GPS" : ""}`}</StatusChip>
        )}
        {showRadar && (
          <StatusChip tone={radarStamp.valid ? "ok" : "wait"}>
            {radarStamp.valid ? `Radar ${clockZ(radarStamp.valid)}` : "Loading radar"}
          </StatusChip>
        )}
        {showAdvisories && (
          <StatusChip tone={wx?.fetchedAt ? (wx.stale ? "wait" : "ok") : "wait"}>
            {wx?.fetchedAt
              ? `NWS ${clockZ(wx.fetchedAt)}${wx.stale ? " · last copy" : ""} · ${
                  overheadLabels(wx.areas, tracking && fix ? fix.lat : lat, tracking && fix ? fix.lon : lon).join(" · ") ||
                  "nothing overhead"
                }`
              : "Loading advisories"}
          </StatusChip>
        )}
        {showTfrs && tfrs.fetchedAt && (
          <StatusChip tone={tfrs.stale ? "wait" : "ok"}>
            {`${tfrs.tfrs.filter((t) => t.rings.some((ring) => ringHits(ring, viewSouth, viewWest, viewNorth, viewEast))).length} TFR in view · ${tfrs.tfrs.length} US`}
          </StatusChip>
        )}
        {!chartTiles.length && !faaLayer && (
          <span className="pointer-events-auto rounded-full px-2 text-[0.625rem] text-[var(--chart-dim)]">
            ©{" "}
            <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{" "}
            until the sheet arrives
          </span>
        )}
      </div>
    </div>
  );
}

function StatusChip({ tone, children }: { tone: "ok" | "wait"; children: ReactNode }) {
  return (
    <span className="glass flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 font-mono text-[0.6875rem] text-muted">
      <span className={`size-1.5 shrink-0 rounded-full ${tone === "ok" ? "bg-good" : "animate-pulse bg-warn"}`} />
      <span className="truncate">{children}</span>
    </span>
  );
}

function catColor(cat: string | null): string | null {
  switch (cat) {
    case "VFR":
      return "var(--color-vfr)";
    case "MVFR":
      return "var(--color-mvfr)";
    case "IFR":
      return "var(--color-ifr)";
    case "LIFR":
      return "var(--color-lifr)";
    default:
      return null;
  }
}
