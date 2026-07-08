// ============================================================================
// Platform-operator (you) helpers: who is an admin, the live USD→IQD rate, and
// manual cash activation. Mirrors the server gate in 0054 — keep the email list
// in sync with is_platform_admin() there.
// ============================================================================
import { sb } from "./clinicSync";
import { activateSubscription, statusOf, type SubStatus } from "./subscription";
import { DEFAULT_USD_RATE, periodMonths, type BillingPeriod, type PlanId } from "./plans";

/** Operator accounts. EDIT to add/rotate — must match is_platform_admin() in SQL. */
export const PLATFORM_ADMIN_EMAILS = ["ayoubabood2004@gmail.com"];

export function isPlatformAdmin(email?: string | null): boolean {
  return !!email && PLATFORM_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

const RATE_KEY = "vp_usd_rate"; // demo mirror

/** The live USD→IQD rate (server app_config, else the demo mirror, else default). */
export async function getUsdRate(): Promise<number> {
  const client = sb();
  if (client) {
    try {
      const { data } = await client.from("app_config").select("value").eq("key", "usd_rate").maybeSingle();
      const n = Number(data?.value);
      if (n > 0) return n;
    } catch { /* pre-migration → fall through */ }
  }
  const local = Number(localStorage.getItem(RATE_KEY));
  return local > 0 ? local : DEFAULT_USD_RATE;
}

/** Admin: update the USD→IQD rate (server-gated to platform admins). */
export async function setUsdRate(rate: number): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.rpc("set_usd_rate", { p_rate: rate });
    if (error) throw new Error(error.message);
    return;
  }
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* ignore */ }
}

/** Admin: manually activate a clinic that paid in cash (server-gated). */
export async function adminActivate(email: string, plan: PlanId, period: BillingPeriod): Promise<void> {
  const client = sb();
  const months = periodMonths(period);
  if (client) {
    const { error } = await client.rpc("admin_activate_subscription", {
      p_email: email.trim(), p_plan: plan, p_period: period, p_months: months,
    });
    if (error) throw new Error(error.message);
    return;
  }
  // Demo: no server → activate the local (single) subscription for testing.
  activateSubscription(plan, period, months);
}

/* ------------------------------ clinics list ----------------------------- */
export interface AdminClinic {
  clinicId: string;
  clinicName: string | null;
  email: string | null;
  plan: string | null;
  period: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  wasSubscriber: boolean;
  members: number;
  status: SubStatus;
  daysLeft: number; // remaining days of the current window (paid or trial)
}

const DAY = 86400000;

function classify(row: { trial_ends_at: string | null; current_period_end: string | null; was_subscriber: boolean }): { status: SubStatus; daysLeft: number } {
  // No subscription row yet → treat as an unstarted trial (locked until first login/seed).
  const sub = {
    plan: null, period: null,
    trialEndsAt: row.trial_ends_at ?? new Date(0).toISOString(),
    currentPeriodEnd: row.current_period_end ?? null,
    wasSubscriber: row.was_subscriber, updatedAt: new Date(0).toISOString(),
  };
  const status = statusOf(sub);
  const end = status === "active" ? row.current_period_end : status === "trialing" ? row.trial_ends_at : null;
  const daysLeft = end ? Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / DAY)) : 0;
  return { status, daysLeft };
}

/** Admin: list every clinic on the platform + its subscription status. */
export async function adminListClinics(): Promise<AdminClinic[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client.rpc("admin_list_subscriptions");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      clinicId: r.clinic_id as string,
      clinicName: (r.clinic_name as string) ?? null,
      email: (r.email as string) ?? null,
      plan: (r.plan as string) ?? null,
      period: (r.period as string) ?? null,
      trialEndsAt: (r.trial_ends_at as string) ?? null,
      currentPeriodEnd: (r.current_period_end as string) ?? null,
      wasSubscriber: !!r.was_subscriber,
      members: Number(r.members ?? 0),
      ...classify({ trial_ends_at: (r.trial_ends_at as string) ?? null, current_period_end: (r.current_period_end as string) ?? null, was_subscriber: !!r.was_subscriber }),
    }));
  }
  // Demo: a small sample so the console is explorable offline.
  const now = Date.now();
  const mk = (name: string, email: string, patch: Partial<AdminClinic>): AdminClinic => ({
    clinicId: email, clinicName: name, email, plan: null, period: null, trialEndsAt: new Date(now + 10 * DAY).toISOString(),
    currentPeriodEnd: null, wasSubscriber: false, members: 3, status: "trialing", daysLeft: 10, ...patch,
  });
  return [
    mk("عيادة السلام", "salam@clinic.com", { ...classify({ trial_ends_at: new Date(now + 10 * DAY).toISOString(), current_period_end: null, was_subscriber: false }) }),
    mk("عيادة الرحمة", "rahma@clinic.com", { plan: "super", period: "annual", currentPeriodEnd: new Date(now + 300 * DAY).toISOString(), wasSubscriber: true, ...classify({ trial_ends_at: null, current_period_end: new Date(now + 300 * DAY).toISOString(), was_subscriber: true }) }),
    mk("عيادة النور", "noor@clinic.com", { wasSubscriber: true, currentPeriodEnd: new Date(now - 5 * DAY).toISOString(), ...classify({ trial_ends_at: null, current_period_end: new Date(now - 5 * DAY).toISOString(), was_subscriber: true }) }),
  ];
}
