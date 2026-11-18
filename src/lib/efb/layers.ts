/**
 * Raster chart layers.
 *
 * Sectional comes from this app's own FAA GeoTIFF pipeline (/api/charts/tile)
 * where its sheets are on disk, and otherwise from the FAA sectional tile
 * service. Terminal area, IFR, sectional, and radar tiles are fetched through this app
 * (`/api/charts/layer/...`) so a saved copy counts as a normal same-origin file.
 */

export type BaseChart = "sectional" | "tac" | "ifrlow" | "ifrhigh";

const AGOL = "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services";

export const UPSTREAM_TILES: Record<string, (z: number, x: number, y: number) => string> = {
  sectional: (z, x, y) => `${AGOL}/VFR_Sectional/MapServer/tile/${z}/${y}/${x}`,
  tac: (z, x, y) => `${AGOL}/VFR_Terminal/MapServer/tile/${z}/${y}/${x}`,
  ifrlow: (z, x, y) => `${AGOL}/IFR_AreaLow/MapServer/tile/${z}/${y}/${x}`,
  ifrhigh: (z, x, y) => `${AGOL}/IFR_High/MapServer/tile/${z}/${y}/${x}`,
  radar: (z, x, y) => `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${z}/${x}/${y}.png`,
};

function localTile(layer: string) {
  return (z: number, x: number, y: number) => `/api/charts/layer/${layer}/${z}/${x}/${y}`;
}

export type TileLayer = {
  id: string;
  label: string;
  minZ: number;
  maxZ: number;
  url: (z: number, x: number, y: number) => string;
  /** IFR charts are white paper; dark modes invert them. */
  paper: "vfr" | "ifr";
};

export const FAA_LAYERS: Record<Exclude<BaseChart, "sectional">, TileLayer> = {
  tac: {
    id: "tac",
    label: "Terminal area",
    minZ: 9,
    maxZ: 12,
    paper: "vfr",
    url: localTile("tac"),
  },
  ifrlow: {
    id: "ifrlow",
    label: "IFR low",
    minZ: 7,
    maxZ: 12,
    paper: "ifr",
    url: localTile("ifrlow"),
  },
  ifrhigh: {
    id: "ifrhigh",
    label: "IFR high",
    minZ: 5,
    maxZ: 9,
    paper: "ifr",
    url: localTile("ifrhigh"),
  },
};

/** FAA sectional tile service, used when the GeoTIFF pipeline has no sheet for the view. */
export const SECTIONAL_LAYER: TileLayer = {
  id: "sectional",
  label: "Sectional",
  minZ: 8,
  maxZ: 12,
  paper: "vfr",
  url: localTile("sectional"),
};

export const RADAR_LAYER: TileLayer = {
  id: "radar",
  label: "Radar",
  minZ: 3,
  maxZ: 10,
  paper: "vfr",
  url: localTile("radar"),
};

export const RADAR_META = "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json";

export const BASE_CHARTS: { id: BaseChart; label: string; short: string }[] = [
  { id: "sectional", label: "Sectional", short: "VFR" },
  { id: "tac", label: "Terminal area", short: "TAC" },
  { id: "ifrlow", label: "IFR low", short: "LO" },
  { id: "ifrhigh", label: "IFR high", short: "HI" },
];

function lat2y(lat: number, n: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
}

/**
 * Web Mercator zoom for 256 px tiles that matches the chart's pixels-per-NM
 * at the given latitude.
 */
export function zoom256(pxPerNm: number, lat: number): number {
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return Math.log2(Math.max(0.01, pxPerNm) * cos * (21600 / 256));
}

/** Tiles of a layer covering a view. Clamps zoom to the layer and caps the count. */
export function layerTiles(
  layer: TileLayer,
  lat: number,
  lon: number,
  w: number,
  h: number,
  pxPerNm: number,
  cap = 48,
): { z: number; x: number; y: number }[] {
  const raw = zoom256(pxPerNm, lat);
  // Far below a layer's lowest zoom the tiles would be unreadable and there would be hundreds of them.
  if (raw < layer.minZ - 1.25) return [];
  if (raw < layer.minZ) cap *= 2;
  const z = Math.max(layer.minZ, Math.min(layer.maxZ, Math.round(raw)));
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const latSpan = h / pxPerNm / 60;
  const lonSpan = w / pxPerNm / (60 * cos);
  return boxTiles(z, lat - latSpan / 2, lon - lonSpan / 2, lat + latSpan / 2, lon + lonSpan / 2, cap);
}

export function boxTiles(z: number, south: number, west: number, north: number, east: number, cap = 4000) {
  const n = 2 ** z;
  const x0 = Math.floor(((west + 180) / 360) * n);
  const x1 = Math.floor(((east + 180) / 360) * n);
  const y0 = Math.max(0, Math.floor(lat2y(north, n)));
  const y1 = Math.min(n - 1, Math.floor(lat2y(south, n)));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({ z, x: ((x % n) + n) % n, y });
      if (tiles.length >= cap) return tiles;
    }
  }
  return tiles;
}

/** The FAA tile service labels JPEG and PNG tiles application/octet-stream, so trust the bytes, not the header. */
export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return null;
}

/** Whether a layer has a usable zoom for this view (false = "zoom in for the chart"). */
export function layerVisible(layer: TileLayer, pxPerNm: number, lat: number): boolean {
  return zoom256(pxPerNm, lat) >= layer.minZ - 1.25;
}
