export type ChartBox = { west: number; south: number; east: number; north: number };

export function containsBox(box: ChartBox, lat: number, lon: number) {
  if (lat < box.south || lat > box.north) return false;
  if (box.west <= box.east) return lon >= box.west && lon <= box.east;
  return lon >= box.west || lon <= box.east;
}

export function tileCenter(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const merc = (y + 0.5) / n;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * merc))) * 180) / Math.PI;
  return { lat, lon };
}

export function sectionalTiles(lat: number, lon: number, w: number, h: number, pxPerNm: number) {
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const zoom = Math.log2(Math.max(0.01, pxPerNm) * cos * (21600 / 512));
  const z = Math.max(7, Math.min(11, Math.round(zoom)));
  const latSpan = h / pxPerNm / 60;
  const lonSpan = w / pxPerNm / (60 * cos);
  const n = 2 ** z;
  const x0 = Math.floor(((lon - lonSpan / 2 + 180) / 360) * n);
  const x1 = Math.floor(((lon + lonSpan / 2 + 180) / 360) * n);
  const yOf = (deg: number) => {
    const r = (Math.max(-85, Math.min(85, deg)) * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  };
  const y0 = Math.max(0, Math.floor(yOf(lat + latSpan / 2)));
  const y1 = Math.min(n - 1, Math.floor(yOf(lat - latSpan / 2)));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({ z, x: ((x % n) + n) % n, y });
      if (tiles.length >= 12) return tiles;
    }
  }
  return tiles;
}
