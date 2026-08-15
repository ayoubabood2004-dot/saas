// ============================================================================
// حركة السوق (0106) — كم تُدخل العيادات فعلاً، لضبط الحدود والأسعار بالقراءة
// لا بالتخمين.
//
// الفكرة المحورية: الحدّ الصحيح لا يُخترع، يُقرأ من سلوك السوق. إذا العيادة
// الوسطى تضيف ١٨ حيواناً بالشهر، فحدّ ٢٥ يخدم أكثر من نصف السوق بلا شكوى،
// وحدّ ١٠ يخنق الجميع. لذلك نجلب صفاً لكل عيادة ونحسب المئينات هنا — أمرن من
// إرجاع مئينات جاهزة من الخادم، ويسمح بمحاكاة «لو حطيت الحد X» فورياً.
// ============================================================================
import { sb } from "./clinicSync";

export interface ClinicVolume {
  clinicId: string;
  clinicName: string | null;
  email: string | null;
  plan: string | null;
  pets: number;
  cases: number;
  invoices: number;
  wa: number;
  revenue: number;
  activeDays: number;
  firstSeen: string | null;
}

export interface MonthPoint {
  month: string;
  clinicsActive: number;
  pets: number;
  cases: number;
  invoices: number;
  wa: number;
  revenue: number;
}

const n = (v: unknown) => Number(v) || 0;

export async function fetchClinicVolumes(days = 30): Promise<ClinicVolume[] | null> {
  const client = sb();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("admin_clinic_volumes", { p_days: days });
    if (error || !Array.isArray(data)) return null; // قبل 0106 → الشاشة تقول ذلك
    return (data as Record<string, unknown>[]).map((r) => ({
      clinicId: String(r.clinic_id ?? ""),
      clinicName: (r.clinic_name as string) ?? null,
      email: (r.email as string) ?? null,
      plan: (r.plan as string) ?? null,
      pets: n(r.pets), cases: n(r.cases), invoices: n(r.invoices), wa: n(r.wa),
      revenue: n(r.revenue), activeDays: n(r.active_days),
      firstSeen: (r.first_seen as string) ?? null,
    }));
  } catch { return null; }
}

export async function fetchMarketMonthly(months = 6): Promise<MonthPoint[] | null> {
  const client = sb();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("admin_market_monthly", { p_months: months });
    if (error || !Array.isArray(data)) return null;
    return (data as Record<string, unknown>[]).map((r) => ({
      month: String(r.month ?? ""),
      clinicsActive: n(r.clinics_active),
      pets: n(r.pets), cases: n(r.cases), invoices: n(r.invoices), wa: n(r.wa),
      revenue: n(r.revenue),
    }));
  } catch { return null; }
}

/* ------------------------------- التحليل -------------------------------- */
export type Metric = "pets" | "cases" | "invoices" | "wa";

/** المئين بالاستيفاء الخطي — نفس ما يفعله percentile_cont. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface Spread {
  active: number;   // عيادات أدخلت شيئاً (غير النشطة تُستبعد — تشوّه المتوسطات)
  idle: number;     // مسجّلة وما لمست النظام بالنافذة
  p50: number; p75: number; p90: number; max: number; total: number;
}

/** توزيع مقياس واحد عبر العيادات النشطة. */
export function spreadOf(rows: ClinicVolume[], m: Metric): Spread {
  const all = rows.map((r) => r[m]);
  const touched = rows.filter((r) => r.pets + r.cases + r.invoices + r.wa > 0);
  const vals = touched.map((r) => r[m]).sort((a, b) => a - b);
  return {
    active: touched.length,
    idle: rows.length - touched.length,
    p50: percentile(vals, 0.5),
    p75: percentile(vals, 0.75),
    p90: percentile(vals, 0.9),
    max: vals.length ? vals[vals.length - 1] : 0,
    total: all.reduce((a, b) => a + b, 0),
  };
}

/** محاكاة حدّ: كم عيادة يكفيها الحدّ X، وكم تتجاوزه؟ */
export function simulateLimit(rows: ClinicVolume[], m: Metric, limit: number): {
  fits: number; exceeds: number; pct: number; worstOver: number;
} {
  const touched = rows.filter((r) => r.pets + r.cases + r.invoices + r.wa > 0);
  const over = touched.filter((r) => r[m] > limit);
  const worst = over.reduce((mx, r) => Math.max(mx, r[m] - limit), 0);
  return {
    fits: touched.length - over.length,
    exceeds: over.length,
    pct: touched.length ? Math.round((over.length / touched.length) * 100) : 0,
    worstOver: worst,
  };
}
