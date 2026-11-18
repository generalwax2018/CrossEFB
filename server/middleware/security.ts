/**
 * Security headers and a per-IP limit on /api. Runs on the deployed server.
 * Framing is left open so the in-browser preview can still embed the app.
 */
import { clientIp, limited } from "../../scripts/rate-limit.mjs";

const HEADERS: [string, string][] = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=(self)"],
  [
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://grok.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://grok.com https://tiles.openfreemap.org https://*.openfreemap.org https://mesonet.agron.iastate.edu http://192.168.10.1",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  ],
];

interface Event {
  url: URL;
  req: { method?: string; headers: Headers };
}

function withHeaders(result: unknown): unknown {
  if (!(result instanceof Response)) return result;
  const headers = new Headers(result.headers);
  for (const [key, value] of HEADERS) if (!headers.has(key)) headers.set(key, value);
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}

export default async function securityMiddleware(event: Event, next: () => unknown | Promise<unknown>): Promise<unknown> {
  const path = event.url.pathname;
  if (path.startsWith("/api/") && limited(clientIp(event.req.headers), path)) {
    return new Response(JSON.stringify({ error: "slow down" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "60",
        "cache-control": "no-store",
        ...Object.fromEntries(HEADERS),
      },
    });
  }
  return withHeaders(await next());
}
