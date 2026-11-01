const RAD = Math.PI / 180;

function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function dayOfYear(year: number, month: number, date: number): number {
  const start = Date.UTC(year, 0, 0);
  const now = Date.UTC(year, month, date);
  return Math.round((now - start) / 86400000);
}

function eventUtcHours(doy: number, lat: number, lon: number, zenith: number, rising: boolean): number | null {
  const lngHour = lon / 15;
  const t = doy + ((rising ? 6 : 18) - lngHour) / 24;
  const m = 0.9856 * t - 3.289;
  let l = m + 1.916 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 282.634;
  l = wrap360(l);
  let ra = Math.atan(0.91764 * Math.tan(l * RAD)) / RAD;
  ra = wrap360(ra);
  const lQuad = Math.floor(l / 90) * 90;
  const raQuad = Math.floor(ra / 90) * 90;
  ra = (ra + (lQuad - raQuad)) / 15;
  const sinDec = 0.39782 * Math.sin(l * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(zenith * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const h = (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  let ut = h + ra - 0.06571 * t - 6.622 - lngHour;
  ut = ((ut % 24) + 24) % 24;
  return ut;
}

export type SunClock = {
  offset: number;
  riseMin: number | null;
  setMin: number | null;
  civilStartMin: number | null;
  civilEndMin: number | null;
};

function localMinutes(utcHours: number | null, offset: number): number | null {
  if (utcHours == null) return null;
  const h = ((utcHours + offset) % 24 + 24) % 24;
  return Math.round(h * 60);
}

export function sunClock(lat: number, lon: number, when = new Date()): SunClock {
  const offset = Math.round(lon / 15);
  const local = new Date(when.getTime() + offset * 3600000);
  const doy = dayOfYear(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return {
    offset,
    riseMin: localMinutes(eventUtcHours(doy, lat, lon, 90.833, true), offset),
    setMin: localMinutes(eventUtcHours(doy, lat, lon, 90.833, false), offset),
    civilStartMin: localMinutes(eventUtcHours(doy, lat, lon, 96, true), offset),
    civilEndMin: localMinutes(eventUtcHours(doy, lat, lon, 96, false), offset),
  };
}

export function fmtClock(mins: number | null): string {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isLocalNight(lat: number, lon: number, hour: number, when = new Date()): boolean {
  const sun = sunClock(lat, lon, when);
  if (sun.civilStartMin == null || sun.civilEndMin == null) return hour >= 19 || hour < 6;
  const mins = ((Math.round(hour) % 24) + 24) % 24 * 60;
  return mins < sun.civilStartMin || mins >= sun.civilEndMin;
}
