// ============================================================================
// Platform-operator (you) helpers: who is an admin, the live USD→IQD rate, and
// manual cash activation. Mirrors the server gate in 0054 — keep the email list
// in sync with is_platform_admin() there.
// ============================================================================
import { sb } from "./clinicSync";
import { activateSubscription, statusOf, _debugSetState, type SubStatus } from "./subscription";
import { DEFAULT_USD_RATE, periodMonths, setLivePrices, type BillingPeriod, type PlanId } from "./plans";

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

/** Admin: grant / reset a free trial (full access, no payment). Default 14 days. */
export async function adminGrantTrial(email: string, days = 14): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.rpc("admin_grant_trial", { p_email: email.trim(), p_days: days });
    if (error) throw new Error(error.message);
    return;
  }
  // Demo: no server → put the local subscription into a fresh trial for testing.
  _debugSetState("trialing");
}

/** Admin: cancel a subscription — end the paid window now. A clinic that paid
 *  before keeps READ-ONLY access; one that never paid falls back to its trial /
 *  lock state. Reversible via activate / grant-trial. */
export async function adminCancelSubscription(email: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.rpc("admin_cancel_subscription", { p_email: email.trim() });
    if (error) throw new Error(error.message);
    return;
  }
  // Demo: no server → expire the local subscription for testing.
  _debugSetState("expired");
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
  /** حصص الاشتراك (0104) — null = بلا حد. */
  petLimit: number | null;
  petsUsed: number;
  waLimit: number | null;
  waUsed: number;
  /** متى يتصفّر عدّاد الشهر (0105). */
  quotaPeriodEnd: string | null;
  status: SubStatus;
  daysLeft: number; // remaining days of the current window (paid or trial)
  /** أرقام الاستعمال — null إذا الخادم لسه ما شغّل هجرة 0101 (لا نعرض أصفاراً كاذبة). */
  usage: ClinicUsage | null;
}

/** كم استعملت العيادة النظام فعلاً — الفرق بين مشترِك ومستخدِم. */
export interface ClinicUsage {
  cases: number;        // كل الحالات منذ اليوم الأول
  cases30: number;      // المفتوحة بآخر ٣٠ يوم
  cases7: number;       // بآخر ٧ أيام
  patients: number;     // مرضى فعليون (pet_id مميّز داخل الحالات)
  invoices: number;     // فواتير البيع
  lastActivity: string | null; // آخر حالة أو فاتورة
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
      petLimit: r.pet_limit == null ? null : Number(r.pet_limit),
      petsUsed: Number(r.pets_used ?? 0),
      waLimit: r.wa_limit == null ? null : Number(r.wa_limit),
      waUsed: Number(r.wa_used ?? 0),
      quotaPeriodEnd: (r.quota_period_end as string) ?? null,
      // خادم قبل هجرة 0101 ما يرجّع هذي الأعمدة أصلاً — نميّز «ما نعرف» عن
      // «صفر»، فلا تظهر عيادة نشيطة وكأنها ميتة.
      usage: r.cases === undefined ? null : {
        cases: Number(r.cases ?? 0),
        cases30: Number(r.cases_30 ?? 0),
        cases7: Number(r.cases_7 ?? 0),
        patients: Number(r.patients ?? 0),
        invoices: Number(r.invoices ?? 0),
        lastActivity: (r.last_activity as string) ?? null,
      },
      ...classify({ trial_ends_at: (r.trial_ends_at as string) ?? null, current_period_end: (r.current_period_end as string) ?? null, was_subscriber: !!r.was_subscriber }),
    }));
  }
  // Demo: a small sample so the console is explorable offline — بأرقام استعمال
  // مختلفة عمداً: نشيطة، وخاملة رغم اشتراكها، وواحدة ما بدأت.
  const now = Date.now();
  const use = (cases: number, cases30: number, cases7: number, patients: number, invoices: number, lastDays: number | null): ClinicUsage => ({
    cases, cases30, cases7, patients, invoices,
    lastActivity: lastDays === null ? null : new Date(now - lastDays * DAY).toISOString(),
  });
  const mk = (name: string, email: string, patch: Partial<AdminClinic>): AdminClinic => ({
    clinicId: email, clinicName: name, email, plan: null, period: null, trialEndsAt: new Date(now + 10 * DAY).toISOString(),
    currentPeriodEnd: null, wasSubscriber: false, members: 3, status: "trialing", daysLeft: 10,
    petLimit: null, petsUsed: 0, waLimit: null, waUsed: 0, quotaPeriodEnd: null,
    usage: use(0, 0, 0, 0, 0, null), ...patch,
  });
  return [
    mk("عيادة الرحمة", "rahma@clinic.com", { plan: "super", period: "annual", currentPeriodEnd: new Date(now + 300 * DAY).toISOString(), wasSubscriber: true, members: 7, petLimit: 500, petsUsed: 176, waLimit: 2000, waUsed: 1310, usage: use(412, 38, 11, 176, 305, 0), ...classify({ trial_ends_at: null, current_period_end: new Date(now + 300 * DAY).toISOString(), was_subscriber: true }) }),
    mk("عيادة السلام", "salam@clinic.com", { petLimit: 20, petsUsed: 15, waLimit: 100, waUsed: 96, usage: use(23, 9, 4, 15, 12, 2), ...classify({ trial_ends_at: new Date(now + 10 * DAY).toISOString(), current_period_end: null, was_subscriber: false }) }),
    mk("عيادة النور", "noor@clinic.com", { wasSubscriber: true, currentPeriodEnd: new Date(now - 5 * DAY).toISOString(), usage: use(96, 0, 0, 54, 71, 63), ...classify({ trial_ends_at: null, current_period_end: new Date(now - 5 * DAY).toISOString(), was_subscriber: true }) }),
  ];
}

/* ---------------- التسعير الحيّ + الاشتراك بالأيام + الحصص (0104) --------- */

/** اجلب الأسعار الحيّة وطبّقها على وحدة الباقات. يُنادى عند الإقلاع. */
export async function hydratePlanPrices(): Promise<void> {
  const client = sb();
  if (!client) return; // ديمو → الأسعار المكتوبة بالكود هي المرجع
  try {
    const { data, error } = await client.from("plan_prices").select("plan,monthly_usd,annual_usd");
    if (error || !Array.isArray(data)) return; // قبل 0104 → الافتراضي
    setLivePrices(data as { plan: string; monthly_usd: number; annual_usd: number }[]);
  } catch { /* الشبكة → الافتراضي */ }
}

/** Admin: عدّل سعر باقة (شهري وسنوي) بلا نشر نسخة جديدة. */
export async function adminSetPlanPrice(plan: PlanId, monthlyUsd: number, annualUsd: number): Promise<void> {
  const client = sb();
  if (!client) throw new Error("no_backend");
  const { error } = await client.rpc("admin_set_plan_price", {
    p_plan: plan, p_monthly: monthlyUsd, p_annual: annualUsd,
  });
  if (error) throw new Error(error.message);
  await hydratePlanPrices(); // اعكسه فوراً على الواجهة
}

/** Admin: فعّل اشتراكاً بعدد أيام محدد، مع حصص اختيارية (null = بلا حد). */
export async function adminActivateDays(
  email: string, plan: PlanId, days: number,
  petLimit: number | null, waLimit: number | null,
): Promise<void> {
  const client = sb();
  if (!client) { activateSubscription(plan, days >= 365 ? "annual" : "monthly", Math.max(1, Math.round(days / 30))); return; }
  const { error } = await client.rpc("admin_activate_days", {
    p_email: email.trim(), p_plan: plan, p_days: days,
    p_pet_limit: petLimit, p_wa_limit: waLimit,
  });
  if (error) throw new Error(error.message);
}

/** Admin: عدّل الحصص وحدها بلا لمس مدّة الاشتراك. */
export async function adminSetLimits(email: string, petLimit: number | null, waLimit: number | null): Promise<void> {
  const client = sb();
  if (!client) return; // ديمو — ماكو حصص
  const { error } = await client.rpc("admin_set_limits", {
    p_email: email.trim(), p_pet_limit: petLimit, p_wa_limit: waLimit,
  });
  if (error) throw new Error(error.message);
}

/* ======================================================================
 * لوحةُ المنصّة (0151): الدخولُ إلى عيادةٍ بهويّة المشغّل، والنبضُ والحركةُ
 * عبر كل العيادات. كلُّها دوالّ مُعرِّف يحرسها is_platform_admin() بالخادم —
 * فحصُ البريد بالواجهة للإظهار فقط، لا للحماية.
 * ====================================================================== */

export interface PlatformContext {
  /** معرّفُ العيادة التي يعمل بها المشغّلُ الآن — null خارج أي عيادة. */
  acting: string | null;
  clinicName: string | null;
  since: string | null;
  reason: string | null;
}

const NO_CONTEXT: PlatformContext = { acting: null, clinicName: null, since: null, reason: null };

export async function platformContext(): Promise<PlatformContext> {
  const client = sb();
  if (!client) return NO_CONTEXT;
  const { data, error } = await client.rpc("platform_context");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    acting: (d.acting as string) ?? null,
    clinicName: (d.clinic_name as string) ?? null,
    since: (d.since as string) ?? null,
    reason: (d.reason as string) ?? null,
  };
}

/** ادخل عيادةً: من هذه اللحظة كلُّ قراءةٍ وكتابةٍ تجري بحسابها وبدور مدير، باسمك. */
export async function platformEnter(clinicId: string, reason?: string): Promise<{ clinicName: string | null }> {
  const client = sb();
  if (!client) throw new Error("no_backend");
  const { data, error } = await client.rpc("platform_enter", { p_clinic: clinicId, p_reason: reason?.trim() || null });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { clinicName: (d.clinic_name as string) ?? null };
}

export async function platformLeave(): Promise<void> {
  const client = sb();
  if (!client) return;
  const { error } = await client.rpc("platform_leave");
  if (error) throw new Error(error.message);
}

export interface ClinicPulse {
  clinicId: string; clinicName: string | null; email: string | null;
  plan: string | null; periodEnd: string | null; trialEnd: string | null;
  members: number; onlineNow: number;
  invoicesToday: number; salesToday: number; invoices7d: number; sales7d: number;
  openDebtCount: number; openDebtTotal: number;
  products: number; zeroStock: number; pendingDeliveries: number;
  audit24h: number; lastLogin: string | null; lastInvoice: string | null; lastActivity: string | null;
}

export async function platformPulse(): Promise<ClinicPulse[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.rpc("platform_pulse");
  if (error) throw new Error(error.message);
  const n = (v: unknown) => Number(v ?? 0);
  const s = (v: unknown) => (v == null ? null : String(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    clinicId: String(r.clinic_id), clinicName: s(r.clinic_name), email: s(r.email),
    plan: s(r.plan), periodEnd: s(r.period_end), trialEnd: s(r.trial_end),
    members: n(r.members), onlineNow: n(r.online_now),
    invoicesToday: n(r.invoices_today), salesToday: n(r.sales_today), invoices7d: n(r.invoices_7d), sales7d: n(r.sales_7d),
    openDebtCount: n(r.open_debt_count), openDebtTotal: n(r.open_debt_total),
    products: n(r.products), zeroStock: n(r.zero_stock), pendingDeliveries: n(r.pending_deliveries),
    audit24h: n(r.audit_24h), lastLogin: s(r.last_login), lastInvoice: s(r.last_invoice), lastActivity: s(r.last_activity),
  }));
}

export interface PlatformActivityRow {
  id: number; clinicId: string | null; clinicName: string | null;
  actor: string | null; actorName: string | null;
  action: string | null; entity: string | null; entityId: string | null;
  details: Record<string, unknown> | null; createdAt: string;
}

export async function platformActivity(limit = 100, clinicId?: string | null): Promise<PlatformActivityRow[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.rpc("platform_activity", { p_limit: limit, p_clinic: clinicId ?? null });
  if (error) throw new Error(error.message);
  const s = (v: unknown) => (v == null ? null : String(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id), clinicId: s(r.clinic_id), clinicName: s(r.clinic_name),
    actor: s(r.actor), actorName: s(r.actor_name),
    action: s(r.action), entity: s(r.entity), entityId: s(r.entity_id),
    details: (r.details as Record<string, unknown>) ?? null, createdAt: String(r.created_at),
  }));
}

export interface PlatformLoginRow {
  clinicId: string; clinicName: string | null; userId: string | null; email: string | null; name: string | null; createdAt: string;
}

export async function platformLogins(limit = 100): Promise<PlatformLoginRow[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.rpc("platform_logins", { p_limit: limit });
  if (error) throw new Error(error.message);
  const s = (v: unknown) => (v == null ? null : String(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    clinicId: String(r.clinic_id), clinicName: s(r.clinic_name), userId: s(r.user_id), email: s(r.email), name: s(r.name), createdAt: String(r.created_at),
  }));
}
