import { execFile } from "node:child_process";
import { openSync, readSync, closeSync, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import { deflateSync, crc32 } from "node:zlib";
import { fromFile } from "geotiff";
import proj4 from "proj4";
import type { ChartBox } from "./web-mercator";

const exec = promisify(execFile);
const FAA_PAGE = "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/";
const ROOT = join(process.cwd(), "data", "charts");
const CHECK_MS = 12 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Edition = { id: string; effective: string; expires: string; names: string[] };
type Ready = ChartBox & { name: string; file: string };

const APPROX: Record<string, ChartBox> = {
  Albuquerque: { south: 31.2, north: 36.8, west: -109.8, east: -101.5 },
  Atlanta: { south: 31.5, north: 37.2, west: -88.5, east: -79.5 },
  Billings: { south: 43.5, north: 49.4, west: -109.5, east: -100.5 },
  Brownsville: { south: 25.2, north: 30.8, west: -100.5, east: -93 },
  Charlotte: { south: 32.5, north: 38.2, west: -83, east: -74.5 },
  Cheyenne: { south: 39, north: 45.2, west: -112.5, east: -102.8 },
  Chicago: { south: 39.5, north: 45.2, west: -92.5, east: -83.5 },
  Cincinnati: { south: 36.2, north: 41.8, west: -87.5, east: -78.5 },
  "Dallas-Ft_Worth": { south: 30.5, north: 36.8, west: -100.5, east: -93.5 },
  Denver: { south: 35, north: 40.4, west: -112.3, east: -103.3 },
  Detroit: { south: 40.2, north: 45.2, west: -86.5, east: -77.5 },
  El_Paso: { south: 28.8, north: 34.8, west: -109.5, east: -101.5 },
  Great_Falls: { south: 45.5, north: 49.6, west: -116.5, east: -103.5 },
  Green_Bay: { south: 42.8, north: 48.8, west: -92.5, east: -83.5 },
  Halifax: { south: 42.5, north: 48.5, west: -71, east: -59 },
  Houston: { south: 27.5, north: 33.2, west: -98.5, east: -89.5 },
  Jacksonville: { south: 27.8, north: 33.8, west: -84.5, east: -75.5 },
  Kansas_City: { south: 36.2, north: 41.8, west: -98.5, east: -89.5 },
  Klamath_Falls: { south: 40.5, north: 46, west: -125.2, east: -116 },
  Lake_Huron: { south: 42.8, north: 47.8, west: -85.5, east: -75.5 },
  Las_Vegas: { south: 34.5, north: 40.2, west: -118.5, east: -109.5 },
  Los_Angeles: { south: 32.2, north: 37.2, west: -121.8, east: -113.5 },
  Memphis: { south: 32.5, north: 38.2, west: -93.5, east: -84.5 },
  Miami: { south: 24, north: 29.8, west: -84, east: -76.5 },
  Montreal: { south: 43.5, north: 48.8, west: -77, east: -67 },
  New_Orleans: { south: 28.2, north: 33.8, west: -94.5, east: -85.5 },
  New_York: { south: 39.2, north: 44.8, west: -78.5, east: -69.5 },
  Omaha: { south: 39.8, north: 45.2, west: -100.5, east: -91.5 },
  Phoenix: { south: 30.8, north: 36.6, west: -116.5, east: -107.5 },
  Salt_Lake_City: { south: 36.8, north: 42.6, west: -116.5, east: -107.5 },
  San_Antonio: { south: 27.8, north: 33.6, west: -104.5, east: -95.5 },
  San_Francisco: { south: 35.8, north: 41.2, west: -125.2, east: -117.5 },
  Seattle: { south: 44.8, north: 49.6, west: -125.2, east: -116.5 },
  St_Louis: { south: 35.8, north: 41.2, west: -94.5, east: -85.5 },
  Twin_Cities: { south: 42.8, north: 48.6, west: -98.5, east: -89.5 },
  Washington: { south: 36.2, north: 41.2, west: -80.5, east: -71.5 },
  Wichita: { south: 35.2, north: 40.8, west: -104.5, east: -95.5 },
  Anchorage: { south: 59, north: 63.5, west: -154, east: -144 },
  Bethel: { south: 58, north: 63.5, west: -166, east: -155 },
  Cape_Lisburne: { south: 67, north: 72, west: -170, east: -156 },
  Cold_Bay: { south: 54, north: 58.5, west: -166, east: -155 },
  Dawson: { south: 62, north: 67, west: -146, east: -134 },
  Dutch_Harbor: { south: 52, north: 56.5, west: -171, east: -160 },
  Fairbanks: { south: 63, north: 67.5, west: -153, east: -141 },
  Juneau: { south: 56, north: 60.5, west: -138, east: -129 },
  Ketchikan: { south: 54, north: 58.5, west: -136, east: -128 },
  Kodiak: { south: 56, north: 60.5, west: -157, east: -147 },
  McGrath: { south: 60, north: 65, west: -161, east: -149 },
  Nome: { south: 63, north: 67.5, west: -170, east: -158 },
  Point_Barrow: { south: 69, north: 72.5, west: -162, east: -148 },
  Seward: { south: 58, north: 62.5, west: -153, east: -144 },
  Hawaiian_Islands: { south: 18, north: 23.2, west: -161.5, east: -154 },
  Western_Aleutian_Islands: { south: 51, north: 55, west: 170, east: 180 },
};

let edition: Edition | null = null;
let checkedAt = 0;
let checking: Promise<Edition> | null = null;
const ready = new Map<string, Ready>();
const covered = new Set<string>();
const order: string[] = [];
const queued = new Set<string>();
let pumping = false;
let timer: ReturnType<typeof setInterval> | null = null;

type OpenChart = {
  file: string;
  palette: Uint8Array;
  proj: string;
  originX: number;
  originY: number;
  resX: number;
  resY: number;
  width: number;
  height: number;
  pixels: Uint8Array | Uint16Array | null;
  pixelsPromise: Promise<Uint8Array | Uint16Array> | null;
  image: Awaited<ReturnType<Awaited<ReturnType<typeof fromFile>>["getImage"]>>;
};
const openCharts = new Map<string, OpenChart>();

function label(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

function isoFromParts(month: string, day: string, year: string) {
  const m = MONTHS.indexOf(month.slice(0, 3));
  if (m < 0) return "";
  return `${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isoFromId(id: string) {
  const [mm, dd, yyyy] = id.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

function plusDays(iso: string, days: number) {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function hits(box: ChartBox, south: number, west: number, north: number, east: number) {
  if (north < box.south || south > box.north) return false;
  const spans = (w: number, e: number) => (e >= w ? [[w, e]] : [[w, 180], [-180, e]]);
  for (const [aw, ae] of spans(box.west, box.east)) {
    for (const [bw, be] of spans(west, east)) {
      if (be >= aw && bw <= ae) return true;
    }
  }
  return false;
}

async function fetchEdition(): Promise<Edition> {
  const html = await fetch(FAA_PAGE, { signal: AbortSignal.timeout(20000) }).then((res) => {
    if (!res.ok) throw new Error("faa page");
    return res.text();
  });
  const id = html.match(/visual\/(\d{2}-\d{2}-\d{4})\/sectional-files\//)?.[1];
  if (!id) throw new Error("faa edition");
  const names = [...new Set([...html.matchAll(/sectional-files\/([A-Za-z0-9_-]+)\.zip/g)].map((m) => m[1]))];
  const next = html.match(/\.pdf>PDF<\/a><\/td><td>\s*([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  const effective = isoFromId(id);
  const expires = next ? isoFromParts(next[1], next[2], next[3]) : plusDays(effective, 56);
  return { id, effective, expires: expires || plusDays(effective, 56), names };
}

async function loadEdition() {
  const now = Date.now();
  if (edition && now - checkedAt < CHECK_MS && now < Date.parse(`${edition.expires}T00:00:00Z`)) return edition;
  if (!checking) {
    checking = fetchEdition()
      .then(async (next) => {
        const changed = edition && edition.id !== next.id;
        edition = next;
        checkedAt = Date.now();
        await mkdir(join(ROOT, next.id), { recursive: true });
        await writeFile(join(ROOT, "edition.json"), JSON.stringify(next));
        if (changed) {
          ready.clear();
          covered.clear();
          openCharts.clear();
          for (const entry of await readdir(ROOT)) {
            if (entry !== next.id && entry !== "edition.json") await rm(join(ROOT, entry), { recursive: true, force: true });
          }
        }
        await scan(next);
        return next;
      })
      .catch(async (err) => {
        console.error("[charts] FAA edition check failed", err);
        if (edition) return edition;
        if (existsSync(join(ROOT, "edition.json"))) {
          edition = JSON.parse(await readFile(join(ROOT, "edition.json"), "utf8")) as Edition;
          checkedAt = Date.now();
          await scan(edition);
          return edition;
        }
        throw err;
      })
      .finally(() => {
        checking = null;
      });
  }
  return checking;
}

function projOf(keys: Record<string, number | string>) {
  const num = (v: number | string | undefined) => (typeof v === "number" ? v : Number.NaN);
  const lat1 = num(keys.ProjStdParallel1GeoKey);
  const lat2 = num(keys.ProjStdParallel2GeoKey);
  const lat0 = num(keys.ProjFalseOriginLatGeoKey ?? keys.ProjNatOriginLatGeoKey);
  const lon0 = num(keys.ProjFalseOriginLongGeoKey ?? keys.ProjNatOriginLongGeoKey);
  const x0 = num(keys.ProjFalseOriginEastingGeoKey ?? keys.ProjNatOriginEastingGeoKey ?? 0);
  const y0 = num(keys.ProjFalseOriginNorthingGeoKey ?? keys.ProjNatOriginNorthingGeoKey ?? 0);
  if (![lat1, lat2, lat0, lon0].every(Number.isFinite)) throw new Error("projection");
  return `+proj=lcc +lat_1=${lat1} +lat_2=${lat2} +lat_0=${lat0} +lon_0=${lon0} +x_0=${x0} +y_0=${y0} +datum=NAD83 +units=m +no_defs`;
}

function boundsOf(projName: string, minX: number, minY: number, maxX: number, maxY: number): ChartBox {
  const lons: number[] = [];
  let south = 90;
  let north = -90;
  for (const corner of [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]) {
    const [lon, lat] = proj4(projName, "WGS84", corner);
    lons.push(lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const sorted = [...lons].sort((a, b) => a - b);
  let maxGap = sorted[0] + 360 - sorted[sorted.length - 1];
  let split = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > maxGap) {
      maxGap = gap;
      split = i;
    }
  }
  if (split < 0) return { west: sorted[0], south, east: sorted[sorted.length - 1], north };
  return { west: sorted[split + 1], south, east: sorted[split], north };
}

function coversPoint(box: ChartBox, lat: number, lon: number) {
  if (lat < box.south || lat > box.north) return false;
  if (box.west <= box.east) return lon >= box.west && lon <= box.east;
  return lon >= box.west || lon <= box.east;
}

function readPalette(file: string) {
  const fd = openSync(file, "r");
  try {
    const header = Buffer.alloc(8);
    readSync(fd, header, 0, 8, 0);
    if (header.toString("ascii", 0, 2) !== "II" || header.readUInt16LE(2) !== 42) throw new Error("tiff");
    const countBuf = Buffer.alloc(2);
    readSync(fd, countBuf, 0, 2, header.readUInt32LE(4));
    const n = countBuf.readUInt16LE(0);
    const entries = Buffer.alloc(n * 12);
    readSync(fd, entries, 0, entries.length, header.readUInt32LE(4) + 2);
    let colorOff = 0;
    let colorCount = 0;
    for (let i = 0; i < n; i++) {
      if (entries.readUInt16LE(i * 12) !== 320) continue;
      colorCount = entries.readUInt32LE(i * 12 + 4);
      colorOff = entries.readUInt32LE(i * 12 + 8);
    }
    if (!colorOff || colorCount < 768) throw new Error("palette");
    const cm = Buffer.alloc(colorCount * 2);
    readSync(fd, cm, 0, cm.length, colorOff);
    const bands = Math.floor(colorCount / 3);
    const pal = new Uint8Array(bands * 4);
    for (let i = 0; i < bands; i++) {
      pal[i * 4] = cm.readUInt16LE(i * 2) >> 8;
      pal[i * 4 + 1] = cm.readUInt16LE((bands + i) * 2) >> 8;
      pal[i * 4 + 2] = cm.readUInt16LE((bands * 2 + i) * 2) >> 8;
      pal[i * 4 + 3] = 255;
    }
    return pal;
  } finally {
    closeSync(fd);
  }
}

async function indexFile(name: string, file: string) {
  const tiff = await fromFile(file);
  const image = await tiff.getImage();
  const proj = projOf(image.getGeoKeys() as Record<string, number | string>);
  proj4.defs(name, proj);
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const box = boundsOf(name, minX, minY, maxX, maxY);
  ready.set(name, { name, file, ...box });
}

function sheetKey(zipName: string, fileName: string, only: boolean) {
  if (only) return zipName;
  const stem = fileName.replace(/\.tif$/i, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${zipName}__${stem}`;
}

function sheetsForZip(zipName: string) {
  const prefix = `${zipName}__`;
  return [...ready.values()].filter((sheet) => sheet.name === zipName || sheet.name.startsWith(prefix));
}

async function indexDir(zipName: string, dir: string) {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((file) => file.toLowerCase().endsWith(".tif"));
  } catch {
    return false;
  }
  if (!files.length) return false;
  const only = files.length === 1;
  let ok = 0;
  for (const file of files) {
    const key = sheetKey(zipName, file, only);
    if (ready.has(key)) {
      ok += 1;
      continue;
    }
    try {
      await indexFile(key, join(dir, file));
      ok += 1;
    } catch (err) {
      console.error(`[charts] ${key} unreadable`, err);
    }
  }
  if (ok === files.length) covered.add(zipName);
  return ok > 0;
}

async function scan(next: Edition) {
  const dir = join(ROOT, next.id);
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    if (name === "tiles" || covered.has(name)) continue;
    await indexDir(name, join(dir, name));
  }
}

async function downloadSheet(name: string) {
  if (!edition || covered.has(name) || !/^[A-Za-z0-9_-]+$/.test(name)) return;
  const dir = join(ROOT, edition.id, name);
  await mkdir(dir, { recursive: true });
  if ((await readdir(dir).catch(() => [] as string[])).some((file) => file.toLowerCase().endsWith(".tif"))) {
    await indexDir(name, dir);
    return;
  }
  const url = `https://aeronav.faa.gov/visual/${edition.id}/sectional-files/${name}.zip`;
  console.log(`[charts] downloading ${name}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const zip = join(dir, `${name}.zip`);
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  await exec("unzip", ["-o", "-q", zip, "-d", dir]);
  await unlink(zip).catch(() => undefined);
  const tifs = (await readdir(dir)).filter((file) => file.toLowerCase().endsWith(".tif"));
  if (!tifs.length) throw new Error(`${name} zip had no tif`);
  for (const extra of await readdir(dir)) {
    if (!extra.toLowerCase().endsWith(".tif")) await unlink(join(dir, extra)).catch(() => undefined);
  }
  await indexDir(name, dir);
  console.log(`[charts] ready ${name} (${covered.size}/${edition.names.length})`);
}

function kick() {
  if (pumping) return;
  pumping = true;
  void (async () => {
    while (order.length) {
      const name = order.shift();
      if (!name) break;
      queued.delete(name);
      if (covered.has(name)) continue;
      try {
        await downloadSheet(name);
      } catch (err) {
        console.error(`[charts] ${name} failed`, err);
      }
    }
    pumping = false;
    if (order.length) kick();
  })();
}

function requestSheet(name: string, urgent: boolean) {
  if (!edition || covered.has(name) || !edition.names.includes(name)) return;
  if (queued.has(name)) {
    if (!urgent) return;
    const at = order.indexOf(name);
    if (at > 0) {
      order.splice(at, 1);
      order.unshift(name);
    }
    return;
  }
  queued.add(name);
  if (urgent) order.unshift(name);
  else order.push(name);
  kick();
}

function candidates(lat: number, lon: number) {
  const exact = [...ready.values()].filter((sheet) => coversPoint(sheet, lat, lon));
  if (exact.length) return exact.map((sheet) => sheet.name);
  return Object.entries(APPROX)
    .filter(([, box]) => coversPoint(box, lat, lon))
    .map(([name]) => name);
}

export async function chartStatus(view?: ChartBox) {
  if (!timer) timer = setInterval(() => void loadEdition().catch(() => undefined), CHECK_MS);
  const current = await loadEdition();
  const focus = view
    ? current.names.filter((name) => {
        const boxes = sheetsForZip(name);
        const list = boxes.length ? boxes : APPROX[name] ? [APPROX[name]] : [];
        return list.some((box) => hits(box, view.south, view.west, view.north, view.east));
      })
    : [];
  for (const name of current.names) requestSheet(name, focus.includes(name));
  for (const name of focus) requestSheet(name, true);
  return {
    effective: label(current.effective),
    expires: label(current.expires),
    total: current.names.length,
    ready: covered.size,
    sheets: [...ready.values()].map(({ name, west, south, east, north }) => ({ name, west, south, east, north })),
  };
}

const R = 6378137;

function tileMerc(z: number, x: number, y: number) {
  const origin = Math.PI * R;
  const span = (2 * origin) / 2 ** z;
  const minx = -origin + x * span;
  const maxy = origin - y * span;
  return { minx, maxx: minx + span, miny: maxy - span, maxy };
}

function mercToWgs(x: number, y: number) {
  const lon = ((x / R) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
  return { lon, lat };
}

async function openChart(name: string): Promise<OpenChart | null> {
  const hit = openCharts.get(name);
  if (hit) return hit;
  const sheet = ready.get(name);
  if (!sheet) return null;
  const tiff = await fromFile(sheet.file);
  const image = await tiff.getImage();
  const proj = projOf(image.getGeoKeys() as Record<string, number | string>);
  proj4.defs(name, proj);
  const origin = image.getOrigin();
  const res = image.getResolution();
  const chart: OpenChart = {
    file: sheet.file,
    palette: readPalette(sheet.file),
    proj,
    originX: origin[0],
    originY: origin[1],
    resX: res[0],
    resY: res[1],
    width: image.getWidth(),
    height: image.getHeight(),
    pixels: null,
    pixelsPromise: null,
    image,
  };
  openCharts.set(name, chart);
  if (openCharts.size > 2) {
    const oldest = openCharts.keys().next().value;
    if (oldest && oldest !== name) openCharts.delete(oldest);
  }
  return chart;
}

function png(width: number, height: number, raw: Buffer) {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head, data])) >>> 0);
    return Buffer.concat([len, head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let decodeChain: Promise<unknown> = Promise.resolve();
let decoder: Worker | null = null;
let decodeSeq = 0;
const decodeWaiters = new Map<number, { resolve: (pixels: Uint8Array | Uint16Array) => void; reject: (err: Error) => void }>();

function decoderWorker() {
  if (decoder) return decoder;
  decoder = new Worker(join(process.cwd(), "src/lib/efb/charts.decode.mjs"));
  decoder.on("message", (msg: { id: number; pixels?: Uint8Array | Uint16Array; error?: string }) => {
    const waiter = decodeWaiters.get(msg.id);
    if (!waiter) return;
    decodeWaiters.delete(msg.id);
    if (!msg.pixels) waiter.reject(new Error(msg.error || "decode"));
    else waiter.resolve(msg.pixels);
  });
  decoder.on("error", (err) => {
    for (const waiter of decodeWaiters.values()) waiter.reject(err);
    decodeWaiters.clear();
    decoder = null;
  });
  return decoder;
}

function decodeSheet(file: string) {
  const run = decodeChain.then(() => decodeSheetNow(file));
  decodeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function decodeSheetNow(file: string) {
  const id = ++decodeSeq;
  return new Promise<Uint8Array | Uint16Array>((resolve, reject) => {
    decodeWaiters.set(id, { resolve, reject });
    decoderWorker().postMessage({ id, file });
  });
}

let slots = 0;
const waiters: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>) {
  if (slots >= 2) await new Promise<void>((resolve) => waiters.push(resolve));
  slots += 1;
  try {
    return await fn();
  } finally {
    slots -= 1;
    waiters.shift()?.();
  }
}

async function renderSheet(name: string, z: number, x: number, y: number) {
  const chart = await openChart(name);
  if (!chart) return null;
  const merc = tileMerc(z, x, y);
  const nw = mercToWgs(merc.minx, merc.maxy);
  const ne = mercToWgs(merc.maxx, merc.maxy);
  const sw = mercToWgs(merc.minx, merc.miny);
  const se = mercToWgs(merc.maxx, merc.miny);
  const toPx = (lon: number, lat: number) => {
    const [lx, ly] = proj4("WGS84", name, [lon, lat]);
    return [(lx - chart.originX) / chart.resX, (ly - chart.originY) / chart.resY];
  };
  const corners = [toPx(nw.lon, nw.lat), toPx(ne.lon, ne.lat), toPx(sw.lon, sw.lat), toPx(se.lon, se.lat)];
  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const [c, r] of corners) {
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  const left = Math.max(0, Math.floor(minC) - 2);
  const top = Math.max(0, Math.floor(minR) - 2);
  const right = Math.min(chart.width, Math.ceil(maxC) + 2);
  const bottom = Math.min(chart.height, Math.ceil(maxR) + 2);
  if (right - left < 2 || bottom - top < 2) return null;
  if (!chart.pixelsPromise) {
    chart.pixelsPromise = decodeSheet(chart.file).then((pixels) => {
      chart.pixels = pixels;
      return pixels;
    });
  }
  const src = await chart.pixelsPromise;
  const size = 512;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c00 = corners[0];
  const c10 = corners[1];
  const c01 = corners[2];
  const c11 = corners[3];
  let p = 0;
  let ink = 0;
  for (let row = 0; row < size; row++) {
    raw[p++] = 0;
    const v = (row + 0.5) / size;
    for (let col = 0; col < size; col++) {
      const u = (col + 0.5) / size;
      const sc = (c00[0] * (1 - u) + c10[0] * u) * (1 - v) + (c01[0] * (1 - u) + c11[0] * u) * v;
      const sr = (c00[1] * (1 - u) + c10[1] * u) * (1 - v) + (c01[1] * (1 - u) + c11[1] * u) * v;
      const ix = Math.round(sc);
      const iy = Math.round(sr);
      if (ix < 0 || iy < 0 || ix >= chart.width || iy >= chart.height) {
        p += 4;
        continue;
      }
      const sx = ix;
      const sy = iy;
      if (sx < 0 || sy < 0 || sx >= chart.width || sy >= chart.height) {
        p += 4;
        continue;
      }
      const idx = src[sy * chart.width + sx] ?? 0;
      const o = idx * 4;
      raw[p++] = chart.palette[o] ?? 0;
      raw[p++] = chart.palette[o + 1] ?? 0;
      raw[p++] = chart.palette[o + 2] ?? 0;
      raw[p++] = 255;
      ink += 1;
    }
  }
  if (ink < size * size * 0.05) return null;
  return png(size, size, raw);
}

export async function renderSectionalTile(z: number, x: number, y: number) {
  if (!Number.isInteger(z) || z < 0 || z > 14 || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  await chartStatus();
  if (!edition) return null;
  const cache = join(ROOT, edition.id, "tiles", String(z), String(x), `${y}.png`);
  if (existsSync(cache)) return readFile(cache);
  const { lon, lat } = mercToWgs((tileMerc(z, x, y).minx + tileMerc(z, x, y).maxx) / 2, (tileMerc(z, x, y).miny + tileMerc(z, x, y).maxy) / 2);
  const names = candidates(lat, lon);
  for (const name of names) requestSheet(name, true);
  const have = names.filter((name) => ready.has(name));
  if (!have.length) return null;
  return withSlot(async () => {
    if (existsSync(cache)) return readFile(cache);
    for (const name of have) {
      const body = await renderSheet(name, z, x, y);
      if (!body) continue;
      await mkdir(join(ROOT, edition!.id, "tiles", String(z), String(x)), { recursive: true });
      await writeFile(cache, body);
      return body;
    }
    return null;
  });
}
