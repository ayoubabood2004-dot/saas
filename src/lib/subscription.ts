// ============================================================================
// Subscription state — the clinic's billing lifecycle, computed purely from
// timestamps so it can't drift:
//
//   • trialing  — brand-new clinic, within the 14-day trial, never paid  → FULL
//   • active    — paid, still inside the paid period                     → FULL
//   • expired   — WAS a paying subscriber, period lapsed                 → READ-ONLY
//   • locked    — never paid and the trial is over                       → BLOCKED
//
// (The two "no longer paying" outcomes are deliberately different: a clinic
//  that paid before keeps read access to its medical history; one that never
//  subscribed sees nothing but the subscribe screen.)
//
// Phase 1 stores the record in localStorage so the whole flow is testable in
// demo mode. The Supabase-backed read/activate (RPC + Wayl webhook) slots in
// behind the same shape in Phase 3 — nothing else has to change.
// ============================================================================
import { useSyncExternalStore } from "react";
import { getActiveClinicId } from "./clinics";
import { sb } from "./clinicSync";
import { supabaseUrl } from "./supabase";
import { registerReadOnlyChecker } from "./repo";
import { TRIAL_DAYS, type BillingPeriod, type PlanId } from "./plans";

export type SubStatus = "trialing" | "active" | "expired" | "locked";
export type AccessLevel = "full" | "readonly" | "blocked";

export interface Subscription {
  plan: PlanId | null;
  period: BillingPeriod | null;
  trialEndsAt: string;              // ISO
  currentPeriodEnd: string | null;  // ISO — when the paid window ends
  wasSubscriber: boolean;           // has ever paid at least once
  updatedAt: string;
}

const key = () => `vp_subscription_${getActiveClinicId()}`;
const DAY = 86400000;

/* ------------------------------ store core ------------------------------ */
const subs = new Set<() => void>();
let snapshot: string | null = null; // cached serialized value for useSyncExternalStore stability

function read(): Subscription {
  try {
    const raw = localStorage.getItem(key());
    if (raw) return JSON.parse(raw) as Subscription;
  } catch { /* ignore */ }
  // First touch → start the free trial now.
  const now = Date.now();
  const fresh: Subscription = {
    plan: null,
    period: null,
    trialEndsAt: new Date(now + TRIAL_DAYS * DAY).toISOString(),
    currentPeriodEnd: null,
    wasSubscriber: false,
    updatedAt: new Date(now).toISOString(),
  };
  try { localStorage.setItem(key(), JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh;
}

function write(next: Subscription) {
  try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* ignore */ }
  snapshot = null; // force re-serialize
  subs.forEach((f) => f());
}

/** Stable serialized snapshot so useSyncExternalStore doesn't loop. */
function getSnapshot(): string {
  if (snapshot == null) snapshot = JSON.stringify(read());
  return snapshot;
}
function subscribe(cb: () => void) {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === key()) { snapshot = null; cb(); } };
  window.addEventListener("storage", onStorage);
  return () => { subs.delete(cb); window.removeEventListener("storage", onStorage); };
}

/* ------------------------------ derivation ------------------------------ */
export function statusOf(s: Subscription, now = Date.now()): SubStatus {
  const periodEnd = s.currentPeriodEnd ? new Date(s.currentPeriodEnd).getTime() : 0;
  if (periodEnd > now) return "active";
  if (!s.wasSubscriber && new Date(s.trialEndsAt).getTime() > now) return "trialing";
  if (s.wasSubscriber) return "expired";
  return "locked";
}

export function accessOf(status: SubStatus): AccessLevel {
  if (status === "active" || status === "trialing") return "full";
  if (status === "expired") return "readonly"; // paid before → keep read access
  return "blocked"; // never paid, trial over → nothing but the subscribe screen
}

/** Whole days remaining in the trial (0 once it's over). */
export function trialDaysLeft(s: Subscription, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(s.trialEndsAt).getTime() - now) / DAY));
}

/** Whole days remaining in the paid period (0 if none / lapsed). */
export function periodDaysLeft(s: Subscription, now = Date.now()): number {
  if (!s.currentPeriodEnd) return 0;
  return Math.max(0, Math.ceil((new Date(s.currentPeriodEnd).getTime() - now) / DAY));
}

/* ------------------------------ mutations ------------------------------- */
/**
 * Extend/replace the paid window (called on a confirmed payment — demo now,
 * Wayl webhook in Phase 3). Stacks onto an unexpired period so early renewals
 * don't lose remaining days.
 */
export function activateSubscription(plan: PlanId, period: BillingPeriod, months: number) {
  const cur = read();
  const now = Date.now();
  const base = cur.currentPeriodEnd && new Date(cur.currentPeriodEnd).getTime() > now
    ? new Date(cur.currentPeriodEnd).getTime()
    : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  write({
    ...cur,
    plan,
    period,
    currentPeriodEnd: end.toISOString(),
    wasSubscriber: true,
    updatedAt: new Date(now).toISOString(),
  });
}

/* ---- Dev/testing helpers (demo only) — jump the clinic into any state ---- */
export function _debugSetState(state: SubStatus) {
  const now = Date.now();
  const base: Subscription = read();
  if (state === "active") write({ ...base, plan: base.plan ?? "super", period: "monthly", currentPeriodEnd: new Date(now + 20 * DAY).toISOString(), wasSubscriber: true });
  else if (state === "trialing") write({ ...base, currentPeriodEnd: null, wasSubscriber: false, trialEndsAt: new Date(now + 10 * DAY).toISOString() });
  else if (state === "expired") write({ ...base, plan: base.plan ?? "super", currentPeriodEnd: new Date(now - DAY).toISOString(), wasSubscriber: true });
  else write({ ...base, currentPeriodEnd: null, wasSubscriber: false, trialEndsAt: new Date(now - DAY).toISOString() });
}

/* ------------------------------- hook ----------------------------------- */
export function useSubscription() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sub = JSON.parse(raw) as Subscription;
  const status = statusOf(sub);
  return {
    sub,
    status,
    access: accessOf(status),
    trialDaysLeft: trialDaysLeft(sub),
    periodDaysLeft: periodDaysLeft(sub),
  };
}

export function getSubscriptionNow() {
  const sub = read();
  const status = statusOf(sub);
  return { sub, status, access: accessOf(status) };
}

/** Expired-but-was-a-subscriber → may view but not change anything. */
export function isReadOnlyNow(): boolean {
  return getSubscriptionNow().access === "readonly";
}
/** Never paid + trial over → the app is hidden; only the subscribe screen shows. */
export function isBlockedNow(): boolean {
  return getSubscriptionNow().access === "blocked";
}

// Wire the repo write-guard to the live subscription state (see repo.ts).
registerReadOnlyChecker(isReadOnlyNow);

/* --------------------------- server integration -------------------------- */
/**
 * Pull the authoritative subscription from the server into the local mirror
 * (the hook reads the mirror). On a real backend the server is the source of
 * truth — the Wayl webhook writes it after a verified payment. In demo mode
 * there is no server, so localStorage stays authoritative.
 */
export async function syncSubscriptionFromServer(): Promise<void> {
  const client = sb();
  if (!client) return;
  try {
    const { data, error } = await client.rpc("get_or_init_subscription");
    if (error || !data) return; // pre-migration backend → keep the local mirror
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) return;
    write({
      plan: (row.plan as PlanId) ?? null,
      period: (row.period as BillingPeriod) ?? null,
      trialEndsAt: String(row.trial_ends_at),
      currentPeriodEnd: (row.current_period_end as string) ?? null,
      wasSubscriber: !!row.was_subscriber,
      updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
    });
  } catch { /* network hiccup → keep the local mirror */ }
}

/**
 * Start a Wayl checkout for a plan via the wayl-create-link Edge Function
 * (which holds the secret key server-side). Resolves to the hosted payment URL
 * the browser should redirect to.
 */
export async function createPaymentLink(plan: PlanId, period: BillingPeriod): Promise<string> {
  const client = sb();
  if (!client || !supabaseUrl) throw new Error("no_backend");

  // NOTE: we deliberately DON'T use `client.functions.invoke()` here. That helper
  // attaches `apikey` + `x-client-info` headers, which forces the CORS preflight
  // to request them — and if the deployed function's Access-Control-Allow-Headers
  // doesn't list them, the browser blocks the POST ("Failed to send a request to
  // the Edge Function"). A hand-built fetch sends only `authorization` +
  // `content-type` — the two headers every deployment already allows — so the
  // call works regardless of the function's exact CORS config. The user's JWT in
  // Authorization is what the function authenticates against (auth.getUser()).
  const { data: sess } = await client.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("not_signed_in");

  const res = await fetch(`${supabaseUrl}/functions/v1/wayl-create-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plan, period }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || !body?.url) {
    throw new Error(String(body?.detail || body?.error || `wayl_failed_${res.status}`));
  }
  return body.url as string;
}
