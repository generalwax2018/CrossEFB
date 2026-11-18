import { decode } from "fast-png";
import { terrariumFeet, tileOf } from "./terrain";

type Tile = { data: Uint8Array | Uint16Array | Uint8ClampedArray; width: number; height: number; channels: number };
const cache = new Map<string, Tile>();

async function loadTile(z: number, x: number, y: number): Promise<Tile> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "CrossEFB/1.0 (planning aid)" },
  });
  if (!res.ok) throw new Error(String(res.status));
  const png = decode(new Uint8Array(await res.arrayBuffer()));
  const tile: Tile = { data: png.data, width: png.width, height: png.height, channels: png.channels };
  cache.set(key, tile);
  if (cache.size > 160) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return tile;
}

/** Feet MSL for each point. Null when the tile could not be read. */
export async function elevations(points: { lat: number; lon: number }[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      out.push(null);
      continue;
    }
    try {
      // Zoom 10 is about 150 m per pixel. Take the highest of the 3x3 pixels around the
      // point so peaks and ridges are not averaged away (conservative for terrain checks).
      const t = tileOf(p.lat, p.lon, 10);
      const img = await loadTile(10, t.x, t.y);
      const cx = Math.min(img.width - 1, Math.floor((t.px / 256) * img.width));
      const cy = Math.min(img.height - 1, Math.floor((t.py / 256) * img.height));
      let best = -Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = Math.max(0, Math.min(img.width - 1, cx + dx));
          const py = Math.max(0, Math.min(img.height - 1, cy + dy));
          const i = (py * img.width + px) * img.channels;
          best = Math.max(best, terrariumFeet(img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0));
        }
      }
      out.push(Math.round(best));
    } catch {
      out.push(null);
    }
  }
  return out;
}
