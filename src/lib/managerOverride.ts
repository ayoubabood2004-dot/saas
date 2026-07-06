// Manager Override (وضع المدير برمز سري) — one 4-digit clinic PIN, two uses:
//
//  · A RESTRICTED account (receptionist/vet) enters the PIN → temporarily
//    elevated to the full manager view for 10 minutes. On a real backend the
//    elevation is SERVER-side (migration 0048: staff_elevations + auth_role()),
//    so RLS-protected data (activity log, reports…) genuinely opens up.
//  · A MANAGER account can lock ITS device into a reception-only view
//    ("قفل الجهاز") — the same PIN lifts the curtain for 10 minutes.
//
// The store is synchronous (localStorage-backed) so usePermissions can consult
// it on every render; React subscribes via useOverride(). Demo mode and
// pre-migration databases fall back to a device-local SHA-256 PIN mirror.
import { useSyncExternalStore } from "react";
import { sb } from "./clinicSync";
import { getActiveClinicId } from "./clinics";
import { repo } from "./repo";

const SESSION_MS = 10 * 60 * 1000; // elevation lifetime
const MAX_TRIES = 5;               // wrong PINs before the cooldown
const COOLDOWN_MS = 5 * 60 * 1000;

const untilKey = () => `vp_override_until_${getActiveClinicId()}`;
const lockKey = () => `vp_device_lock_${getActiveClinicId()}`;
const pinKey = () => `vp_override_pin_${getActiveClinicId()}`; // demo / pre-migration hash

/* ------------------------------ store core ------------------------------ */
let version = 0;
const subs = new Set<() => void>();
let expiryTimer: number | null = null;

function notify() {
  version++;
  subs.forEach((f) => f());
}

function readUntil(): number {
  try { return Number(localStorage.getItem(untilKey()) || 0) || 0; } catch { return 0; }
}

function armExpiry() {
  if (expiryTimer != null) { window.clearTimeout(expiryTimer); expiryTimer = null; }
  const u = readUntil();
  if (u > Date.now()) expiryTimer = window.setTimeout(notify, u - Date.now() + 250);
}

function writeUntil(ms: number) {
  try {
    if (ms > 0) localStorage.setItem(untilKey(), String(ms));
    else localStorage.removeItem(untilKey());
  } catch { /* ignore */ }
  armExpiry();
  notify();
}

/* ------------------------------ public state ---------------------------- */
export function overrideActive(): boolean {
  return readUntil() > Date.now();
}

export function overrideUntil(): number | null {
  const u = readUntil();
  return u > Date.now() ? u : null;
}

export function isDeviceLocked(): boolean {
  try { return localStorage.getItem(lockKey()) === "1"; } catch { return false; }
}

/** Manager action: pin THIS device to the reception-only view (or release it). */
export function setDeviceLocked(v: boolean) {
  try {
    if (v) localStorage.setItem(lockKey(), "1");
    else localStorage.removeItem(lockKey());
  } catch { /* ignore */ }
  if (v) writeUntil(0); // locking also ends any running elevation
  notify();
  void repo.logClientEvent(v ? "override.devlock" : "override.devunlock", {});
}

/** Re-lock immediately (chip click / expiry cleanup). */
export function lockNow() {
  writeUntil(0);
  const client = sb();
  if (client) {
    // Server logs "override.lock" inside end_elevation(); swallow pre-0048 absence.
    void Promise.resolve(client.rpc("end_elevation")).then(() => undefined, () => undefined);
  } else {
    void repo.logClientEvent("override.lock", {});
  }
}

/* ------------------------------ PIN handling ---------------------------- */
const MISSING_FN = /could not find the function|does not exist|schema cache|42883/i;

async function localHash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${getActiveClinicId()}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Save the clinic PIN. Server-side for real backends (managers only, enforced
 *  by the RPC); ALWAYS mirrored locally so demo mode and pre-migration
 *  databases keep a working device-local PIN. */
export async function setOverridePin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
  try { localStorage.setItem(pinKey(), await localHash(pin)); } catch { /* ignore */ }
  const client = sb();
  if (client) {
    const { error } = await client.rpc("set_override_pin", { p_pin: pin });
    // Pre-0048 database → the local mirror above still makes the feature work
    // on this device; anything else is a real failure the UI should surface.
    if (error && !MISSING_FN.test(error.message)) throw new Error(error.message);
  }
}

export async function hasOverridePin(): Promise<boolean> {
  const client = sb();
  if (client) {
    try {
      const { data, error } = await client.rpc("has_override_pin");
      if (!error) return !!data;
    } catch { /* fall through to the local mirror */ }
  }
  try { return !!localStorage.getItem(pinKey()); } catch { return false; }
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "locked" | "no_pin" | "error"; remaining?: number; lockedUntil?: number };

// Demo / pre-migration brute-force cooldown (per browser session).
let localFails = 0;
let localLockedUntil = 0;

async function unlockLocal(pin: string): Promise<UnlockResult> {
  if (localLockedUntil > Date.now()) return { ok: false, reason: "locked", lockedUntil: localLockedUntil };
  let stored: string | null = null;
  try { stored = localStorage.getItem(pinKey()); } catch { /* ignore */ }
  if (!stored) return { ok: false, reason: "no_pin" };
  if ((await localHash(pin)) === stored) {
    localFails = 0;
    writeUntil(Date.now() + SESSION_MS);
    void repo.logClientEvent("override.unlock", {});
    return { ok: true };
  }
  localFails++;
  void repo.logClientEvent("override.fail", {});
  if (localFails >= MAX_TRIES) {
    localFails = 0;
    localLockedUntil = Date.now() + COOLDOWN_MS;
    return { ok: false, reason: "locked", lockedUntil: localLockedUntil };
  }
  return { ok: false, reason: "wrong", remaining: MAX_TRIES - localFails };
}

/** Verify the PIN and start a 10-minute manager session. */
export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const client = sb();
  if (!client) return unlockLocal(pin);
  try {
    const { data, error } = await client.rpc("elevate_with_pin", { p_pin: pin });
    if (error) {
      if (MISSING_FN.test(error.message)) return unlockLocal(pin); // pre-0048 DB
      return { ok: false, reason: "error" };
    }
    const d = (data ?? {}) as { ok?: boolean; until?: string; reason?: string; remaining?: number; locked_until?: string };
    if (d.ok && d.until) {
      writeUntil(new Date(d.until).getTime());
      return { ok: true };
    }
    if (d.reason === "no_pin") return unlockLocal(pin); // PIN set pre-migration on this device only
    return {
      ok: false,
      reason: d.reason === "locked" ? "locked" : d.reason === "wrong" ? "wrong" : "error",
      remaining: d.remaining,
      lockedUntil: d.locked_until ? new Date(d.locked_until).getTime() : undefined,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/* ------------------------------ React hook ------------------------------ */
export function useOverride(): { active: boolean; until: number | null; deviceLocked: boolean } {
  useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => version,
  );
  return { active: overrideActive(), until: overrideUntil(), deviceLocked: isDeviceLocked() };
}

armExpiry(); // resume a countdown that survived a page reload
