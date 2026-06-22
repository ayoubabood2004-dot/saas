// Shared plumbing for migrating the clinic CONFIG catalogues (services, promos,
// breeds, meds, vaccines, areas, vital ranges, prefs) from device-only
// localStorage to Supabase — WITHOUT changing any synchronous call site.
//
// Strategy (per module): keep an in-memory cache that the existing synchronous
// getters read from. Mutations update the cache + localStorage instantly
// (optimistic, so the UI stays snappy and offline-safe), then write through to
// Supabase in the BACKGROUND. If the cloud write fails the user is told via a
// global toast, but their change is never lost (it stays local and re-syncs on
// the next hydrate). Multi-tenancy is automatic: these tables DEFAULT clinic_id
// to auth_clinic() and RLS restricts every row to the caller's clinic, so the
// client never has to pass a clinic id.
import { supabase } from "./supabase";
import { emitGlobalToast } from "./globalToast";

/** The Supabase client when a real backend is configured, else null (demo mode). */
export const sb = () => supabase;

/** Fire a Supabase write in the background. The optimistic local update already
 *  happened; if the cloud copy fails we warn the user but keep their data. */
export function cloudWrite(
  run: () => PromiseLike<{ error: { message: string } | null }>,
  ctx: string,
): void {
  if (!supabase) return; // demo / offline → localStorage is the source of truth
  let warned = false;
  const fail = (msg: string) => {
    if (warned) return;
    warned = true;
    console.error(`[cloud:${ctx}]`, msg);
    // Stay silent if the config tables simply aren't migrated yet (0021 not run):
    // the local save already succeeded and will sync on the next hydrate.
    if (/does not exist|schema cache|relation|42p01|could not find the table/i.test(msg)) return;
    emitGlobalToast({
      tone: "warn",
      title: "تعذّر الحفظ في السحابة",
      description: "تم الحفظ على هذا الجهاز — سنحاول المزامنة لاحقًا.",
    });
  };
  try {
    Promise.resolve(run()).then(
      ({ error }) => { if (error) fail(error.message); },
      (e) => fail(e instanceof Error ? e.message : String(e)),
    );
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

/* ----------------------------- Hydration ------------------------------------
 * Each config module registers a hydrate() that pulls its rows from Supabase
 * into the in-memory cache (and migrates any pre-existing local data up on the
 * first run). hydrateClinicConfig() runs them all once the active clinic is
 * known (see AuthContext). Safe to call repeatedly. */
const hydrators: Array<() => Promise<void>> = [];

export function registerHydrator(fn: () => Promise<void>): void {
  hydrators.push(fn);
}

// Each module also registers how to clear its in-memory cache, so that switching
// workspace (a user who belongs to several clinics) can never serve clinic A's
// catalog while clinic B is active — the cache is dropped and re-hydrated, and
// the synchronous getters fall back to the clinic-namespaced localStorage mirror
// in the meantime.
const resetters: Array<() => void> = [];

export function registerReset(fn: () => void): void {
  resetters.push(fn);
}

export function resetClinicConfigCaches(): void {
  for (const r of resetters) r();
}

let lastHydrated = "";
/** Hydrate every registered config cache for the active clinic. */
export async function hydrateClinicConfig(clinicKey: string): Promise<void> {
  if (clinicKey !== lastHydrated) resetClinicConfigCaches(); // dropped stale clinic data
  lastHydrated = clinicKey;
  await Promise.allSettled(hydrators.map((h) => h()));
}

export const hydratedFor = () => lastHydrated;
