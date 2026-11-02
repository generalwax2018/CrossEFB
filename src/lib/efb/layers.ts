/**
 * Raster chart layers.
 *
 * Sectional comes from this app's own FAA GeoTIFF pipeline (/api/charts/tile).
 * Terminal area and IFR en-route charts come from the FAA Aeronautical
 * Information Services tile services on ArcGIS Online (256 px, Web Mercator,
 * /tile/{z}/{y}/{x}). Radar is the NWS NEXRAD base-reflectivity composite as
 * cached by the Iowa Environmental Mesonet.
 */

export type BaseChart = "sectional" | "tac" | "ifrlow" | "ifrhigh";

const AGOL = "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services";

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
    url: (z, x, y) => `${AGOL}/VFR_Terminal/MapServer/tile/${z}/${y}/${x}`,
  },
  ifrlow: {
    id: "ifrlow",
    label: "IFR low",
    minZ: 7,
    maxZ: 12,
    paper: "ifr",
    url: (z, x, y) => `${AGOL}/IFR_AreaLow/MapServer/tile/${z}/${y}/${x}`,
  },
  ifrhigh: {
    id: "ifrhigh",
    label: "IFR high",
    minZ: 5,
    maxZ: 9,
    paper: "ifr",
    url: (z, x, y) => `${AGOL}/IFR_High/MapServer/tile/${z}/${y}/${x}`,
  },
};

export const RADAR_LAYER: TileLayer = {
  id: "radar",
  label: "Radar",
  minZ: 3,
  maxZ: 10,
  paper: "vfr",
  url: (z, x, y) => `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${z}/${x}/${y}.png`,
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
  const z = Math.max(layer.minZ, Math.min(layer.maxZ, Math.round(zoom256(pxPerNm, lat))));
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
