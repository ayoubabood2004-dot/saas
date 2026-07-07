// ============================================================================
// Platform-operator (you) helpers: who is an admin, the live USD→IQD rate, and
// manual cash activation. Mirrors the server gate in 0054 — keep the email list
// in sync with is_platform_admin() there.
// ============================================================================
import { sb } from "./clinicSync";
import { activateSubscription } from "./subscription";
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
