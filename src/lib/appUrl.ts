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

/** The public ROOT domain for display (invoice/consent footers, landing chip).
 *  Derived from the live hostname so changing the domain needs ZERO code edits.
 *  Falls back to the brand name on localhost / previews where no real domain exists. */
export function siteHost(): string {
  if (typeof window === "undefined") return "doctorVet";
  const h = window.location.hostname.replace(/^(app|www)\./, "");
  if (h === "localhost" || /^[0-9.]+$/.test(h) || h.endsWith(".vercel.app")) return "doctorVet";
  return h;
}

/** The app subdomain as display text (e.g. "app.example.com") — prefers the
 *  configured VITE_APP_URL, else derives from the current hostname. */
export function appHostLabel(): string {
  if (APP_BASE) return APP_BASE.replace(/^https?:\/\//, "");
  return `app.${siteHost()}`;
}
