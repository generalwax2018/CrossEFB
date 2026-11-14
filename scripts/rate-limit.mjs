/** In-memory token bucket. One process only; enough to blunt open-endpoint abuse. */

const buckets = new Map();

/**
 * @param {string} key
 * @param {number} perSec
 * @param {number} burst
 */
function take(key, perSec, burst) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: burst, at: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  if (buckets.size > 8000) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
  return true;
}

/** @param {Headers} headers */
export function clientIp(headers) {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "local";
}

/** True when this caller should be turned away. */
/**
 * @param {string} ip
 * @param {string} path
 */
export function limited(ip, path) {
  const charts = path.startsWith("/api/charts/tile/");
  const proxy = path.startsWith("/api/charts/");
  const sync = path.startsWith("/api/sync/");
  const perSec = charts ? 8 : proxy ? 20 : sync ? 0.4 : 2;
  const burst = charts ? 40 : proxy ? 80 : sync ? 8 : 20;
  const group = charts ? "sectional" : proxy ? "charts" : sync ? "sync" : "api";
  return !take(`${ip}:${group}`, perSec, burst);
}
