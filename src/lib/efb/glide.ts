/** Still-air glide distance, and how far the ring center shifts downwind. */

export function glideRing(input: {
  altFt: number;
  groundFt: number;
  ratio: number;
  windFromDeg: number;
  windKt: number;
  glideKt: number;
}): { nm: number; driftNm: number; blowToDeg: number; aglFt: number } | null {
  const agl = input.altFt - input.groundFt;
  if (!(agl >= 300) || !(input.ratio > 0)) return null;
  const nm = (agl * input.ratio) / 6076;
  const vg = Math.max(40, input.glideKt);
  const driftNm = input.windKt > 0 ? (Math.min(input.windKt, vg * 0.8) / vg) * nm : 0;
  const blowToDeg = ((input.windFromDeg + 180) % 360 + 360) % 360;
  return { nm, driftNm, blowToDeg, aglFt: agl };
}

/** Move a point by nautical miles along a true bearing. */
export function offsetNm(lat: number, lon: number, bearingDeg: number, nm: number): { lat: number; lon: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (nm * Math.cos(rad)) / 60;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLon = cos === 0 ? 0 : (nm * Math.sin(rad)) / (60 * cos);
  return { lat: lat + dLat, lon: lon + dLon };
}

export type TerrainSample = { nm: number; elevFt: number };

/**
 * Nearest sample where the ground, plus a margin, is above the descending
 * glide path. A missed ridge between samples will not show up.
 */
export function firstTerrainConflict(
  altFt: number,
  ratio: number,
  samples: TerrainSample[],
  marginFt = 200,
): { nm: number; elevFt: number; pathFt: number } | null {
  if (!(ratio > 0)) return null;
  const hits = samples
    .filter((s) => s.nm > 0.2 && Number.isFinite(s.elevFt))
    .map((s) => ({ ...s, pathFt: Math.round(altFt - (s.nm * 6076) / ratio) }))
    .filter((s) => s.elevFt + marginFt > s.pathFt)
    .sort((a, b) => a.nm - b.nm);
  return hits[0] ?? null;
}
