// Intent-based route prefetching. Each page is a lazily-loaded chunk (see
// App.tsx). Without prefetch, the *first* visit to a route stalls on the click
// while its JS downloads. Here we warm the chunk earlier — on hover/focus/touch
// of a nav link, and for the most-likely-next routes while the browser is idle.
//
// Dynamic import() caches by module specifier, so calling the same import here
// as App.tsx's lazy() is a plain cache hit at click time — no double download.

type Importer = () => Promise<unknown>;

// Keyed by the exact `to` path used in the nav (Sidebar/TopBar). Specifiers must
// match App.tsx's lazy() imports so they resolve to the same Vite chunk.
const importers: Record<string, Importer> = {
  "/": () => import("@/pages/Dashboard"),
  "/reception": () => import("@/pages/Reception"),
  "/records": () => import("@/pages/ClinicRecords"),
  "/inventory": () => import("@/pages/Inventory"),
  "/retail": () => import("@/pages/RetailSales"),
  "/reports": () => import("@/pages/AnalyticsHub"),
  "/campaigns": () => import("@/pages/WhatsAppCampaigns"),
  "/staff": () => import("@/pages/StaffManagement"),
  "/scan": () => import("@/pages/ScanChart"),
  "/settings": () => import("@/pages/Settings"),
  "/book": () => import("@/pages/BookingWizard"),
  "/new-case": () => import("@/pages/NewCase"),
};

const warmed = new Set<string>();

/** Warm the chunk for a route path. No-op if unknown or already warmed. */
export function prefetchRoute(to: string): void {
  const imp = importers[to];
  if (!imp || warmed.has(to)) return;
  warmed.add(to);
  // On failure (offline/transient), drop the flag so a later hover can retry.
  imp().catch(() => warmed.delete(to));
}

/** Warm a set of routes once the browser is idle (after first paint). */
export function prefetchIdle(paths: string[]): void {
  const run = () => paths.forEach(prefetchRoute);
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

/** Eagerly warm EVERY route chunk during idle time, so no navigation ever hits
 *  a Suspense fallback. The app is an internal tool (~15 small page chunks), so
 *  the total is modest and the "click → already there" payoff is worth it. */
export function prefetchAllIdle(): void {
  prefetchIdle(Object.keys(importers));
}

/** Handy spread onto a nav <Link> to warm its target on user intent. */
export function prefetchHandlers(to: string) {
  const fire = () => prefetchRoute(to);
  return { onMouseEnter: fire, onFocus: fire, onTouchStart: fire };
}
