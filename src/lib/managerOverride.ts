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
const LOCK_PREFIX = "vp_device_lock_";
const lockKey = () => `${LOCK_PREFIX}${getActiveClinicId()}`;
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
  try {
    if (localStorage.getItem(lockKey()) === "1") return true;
    // Self-heal across clinic-id changes: a kiosk locked under a different id
    // representation must stay locked (never silently drop the guard).
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(LOCK_PREFIX) && localStorage.getItem(k) === "1") return true;
    }
    return false;
  } catch { return false; }
}

/** Manager action: pin THIS device to the reception-only view (or release it). */
export function setDeviceLocked(v: boolean) {
  try {
    if (v) {
      localStorage.setItem(lockKey(), "1");
    } else {
      // Clear EVERY clinic-id representation so an orphaned lock can't keep the
      // device stuck in the restricted view after an unlock.
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(LOCK_PREFIX)) localStorage.removeItem(k);
      }
    }
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
const PIN_PREFIX = "vp_override_pin_";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// v2 device-mirror hash: clinic-id-INDEPENDENT. The storage key is already
// clinic-scoped, so baking the (volatile) clinic id into the salt only made the
// PIN stop verifying whenever the active id was later represented differently —
// the #1 cause of a code "disappearing". v2 removes that coupling.
const hashPin = (pin: string) => sha256(`vp_override_v2:${pin}`);
// Legacy (pre-v2) salt embedded the clinic id: SHA-256(`${cid}:${pin}`). Still
// accepted on unlock so codes set before this change keep working, then migrate.
const hashLegacy = (cid: string, pin: string) => sha256(`${cid}:${pin}`);

/** Locate the device PIN mirror, SELF-HEALING across clinic-id changes: if the
 *  exact active-clinic key is missing but exactly ONE override PIN exists on this
 *  device (the common single-clinic case, or a legacy key saved under a different
 *  id such as "default"), we still find it. This is what stops a code from
 *  silently vanishing just because the active clinic id shifted between sessions. */
function findLocalPin(): { key: string; cid: string; hash: string } | null {
  try {
    const direct = localStorage.getItem(pinKey());
    if (direct) return { key: pinKey(), cid: getActiveClinicId(), hash: direct };
    const hits: { key: string; cid: string; hash: string }[] = [];
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PIN_PREFIX)) {
        const v = localStorage.getItem(k);
        if (v) hits.push({ key: k, cid: k.slice(PIN_PREFIX.length), hash: v });
      }
    }
    return hits.length === 1 ? hits[0] : null;
  } catch { return null; }
}

/** Persist the device mirror under the CURRENT active-clinic key (v2 hash), and
 *  drop the single stale key it may have been adopted from. */
async function writeLocalPin(pin: string, from?: string): Promise<void> {
  try {
    const k = pinKey();
    localStorage.setItem(k, await hashPin(pin));
    if (from && from !== k) localStorage.removeItem(from);
  } catch { /* ignore */ }
}

/** Save the clinic PIN. On a migrated backend the PIN lives bcrypt-hashed
 *  server-side (managers only, enforced by the RPC) — the durable, cross-device
 *  home. We ALSO keep a synced device mirror so a transient cloud hiccup can
 *  never make a set code read as "not set". In demo / pre-0048 mode the mirror
 *  is the only store; it is now clinic-id-robust so it does not disappear. */
export async function setOverridePin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
  const client = sb();
  if (!client) { await writeLocalPin(pin); return; }   // demo / offline
  const { error } = await client.rpc("set_override_pin", { p_pin: pin });
  if (error) {
    if (MISSING_FN.test(error.message)) { await writeLocalPin(pin); return; } // pre-0048
    throw new Error(error.message);
  }
  await writeLocalPin(pin); // cloud is source of truth; mirror is the safety net
}

/** Logout teardown: end any running PIN elevation (server + this device) so the
 *  NEXT user to sign in on a shared/kiosk device never inherits manager access.
 *  A deliberate device lock (kiosk reception view) is intentionally PRESERVED —
 *  it must survive staff signing in and out all day. */
export function endElevationOnLogout(): void {
  const client = sb();
  if (client) void Promise.resolve(client.rpc("end_elevation")).then(() => undefined, () => undefined);
  // Remove EVERY clinic's elevation flag, not just the active one — a user who
  // switched clinics mid-session could otherwise leave a stale flag that unlocks
  // the manager UI for the next person on a shared device.
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("vp_override_until_")) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  if (expiryTimer != null) { window.clearTimeout(expiryTimer); expiryTimer = null; }
  notify();
}

function hasLocalPin(): boolean {
  return !!findLocalPin();
}

/** Where the clinic's PIN actually lives:
 *  · "cloud"  — saved server-side (durable: survives cache clears, deploys, and
 *               works on every device). This is the safe, permanent home.
 *  · "device" — only a device-local mirror exists (set before the cloud store was
 *               available). FRAGILE: lost if this browser's data is cleared or the
 *               manager signs in elsewhere — the cause of a PIN "disappearing".
 *  · "none"   — no PIN set anywhere. */
export async function overridePinScope(): Promise<"cloud" | "device" | "none"> {
  const client = sb();
  if (client) {
    try {
      const { data, error } = await client.rpc("has_override_pin");
      if (!error) return data ? "cloud" : (hasLocalPin() ? "device" : "none");
    } catch { /* fall through to the local mirror */ }
  }
  return hasLocalPin() ? "device" : "none";
}

/** True if a PIN exists ANYWHERE (cloud or this device). We honour the device
 *  mirror even when the server reports none, so a code set before the cloud store
 *  existed never silently reads as "not set" on the device that holds it. */
export async function hasOverridePin(): Promise<boolean> {
  return (await overridePinScope()) !== "none";
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "locked" | "no_pin" | "error"; remaining?: number; lockedUntil?: number };

// Demo / pre-migration brute-force cooldown (per browser session).
let localFails = 0;
let localLockedUntil = 0;

async function unlockLocal(pin: string): Promise<UnlockResult> {
  if (localLockedUntil > Date.now()) return { ok: false, reason: "locked", lockedUntil: localLockedUntil };
  const rec = findLocalPin();
  if (!rec) return { ok: false, reason: "no_pin" };
  // Accept the v2 hash and every legacy salt (the id the mirror was stored under,
  // the current active id, and "default") so codes set before this change keep
  // working — then migrate the match to the stable v2 form under the current key.
  const candidates = new Set([
    await hashPin(pin),
    await hashLegacy(rec.cid, pin),
    await hashLegacy(getActiveClinicId(), pin),
    await hashLegacy("default", pin),
  ]);
  if (candidates.has(rec.hash)) {
    localFails = 0;
    await writeLocalPin(pin, rec.key);
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

/** "Restricted" = a device locked to the guarded view with NO active manager
 *  session. In this state the icons/operations stay available, but the sensitive
 *  areas (report history, staff editing, activity history) are content-locked.
 *  Entering the PIN (→ active) lifts every restriction for 10 minutes. */
export function overrideRestricted(): boolean {
  return isDeviceLocked() && !overrideActive();
}

// Hidden-lock feedback: locked controls look normal and silently ignore input;
// only after several taps does a small toast reveal WHY nothing happened — so a
// bystander can't tell at a glance which controls are guarded.
let lockedTaps = 0;
export function noteLockedTap(reveal: () => void, threshold = 5): void {
  lockedTaps++;
  if (lockedTaps >= threshold) { lockedTaps = 0; reveal(); }
}

/* ------------------------------ React hook ------------------------------ */
export function useOverride(): { active: boolean; until: number | null; deviceLocked: boolean; restricted: boolean } {
  useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => version,
  );
  return { active: overrideActive(), until: overrideUntil(), deviceLocked: isDeviceLocked(), restricted: overrideRestricted() };
}

armExpiry(); // resume a countdown that survived a page reload
