export type TrackPoint = { t: number; lat: number; lon: number; altFt: number | null; gsKt: number | null };

function nmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 60;
  const dLon = (b.lon - a.lon) * 60 * Math.cos(((a.lat + b.lat) * Math.PI) / 360);
  return Math.hypot(dLat, dLon);
}

/** Hours between the first and last point that looks airborne. Null when the track is too short. */
export function trackHours(points: TrackPoint[]): { hours: number; from: TrackPoint; to: TrackPoint } | null {
  if (points.length < 2) return null;
  const moving: TrackPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    const implied = next && next.t > p.t ? nmBetween(p, next) / ((next.t - p.t) / 3_600_000) : 0;
    const speed = p.gsKt != null ? p.gsKt : implied;
    if (speed >= 40) moving.push(p);
  }
  const used = moving.length >= 2 ? moving : points;
  const ms = used[used.length - 1].t - used[0].t;
  if (ms < 60_000) return null;
  const hours = Math.max(0.1, Math.round((ms / 3_600_000) * 10) / 10);
  return { hours, from: used[0], to: used[used.length - 1] };
}
