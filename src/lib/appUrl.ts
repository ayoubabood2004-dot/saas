/* ============================================================================
 * Root domain vs. app subdomain.
 *
 * The marketing landing lives on the ROOT domain (doctorvet.doctor); the app
 * lives on the `app.` subdomain. Both are served by the SAME deployment — we
 * only branch on the hostname. Until the subdomain is actually configured,
 * `isAppHost()` is false everywhere (localhost, root), so the landing shows on
 * `/` and the app stays fully reachable at its own paths (/login, /reception…) —
 * nothing breaks before the DNS split is done.
 * ==========================================================================*/

/** True when we're on the app subdomain (app.example.com). */
export function isAppHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.startsWith("app.");
}

/** Absolute URL into the APP. When VITE_APP_URL is set (after the subdomain is
 *  live) links point there; otherwise they stay relative and work on any host. */
const APP_BASE = (import.meta.env.VITE_APP_URL || "").replace(/\/$/, "");
export function appUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return APP_BASE ? APP_BASE + p : p;
}
