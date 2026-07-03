import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  AreaChart, Area, Line, ComposedChart, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, Wallet, Banknote, CreditCard, ArrowLeftRight, Receipt, TrendingUp,
  Stethoscope, Package, Trophy, Snail, PawPrint, Lock, Download, FileText, CalendarRange,
  Crown, Star, ShieldAlert, Trash2, LogIn, FlaskConical, Pill, Users, Clock,
  ScrollText, Search, Eye, X, BadgePercent,
} from "lucide-react";
import { playTap } from "@/lib/sounds";
import type { Pet, Invoice, InvoiceItem, Product, MedicalVisit, PaymentMethod, Species, MediaItem, TreatmentEntry, AuditEntry, LoginEvent } from "@/types";
import { type StaffMember } from "@/lib/staff";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { loadAnalyticsSnap, analyticsKey, type AnalyticsSnap } from "@/lib/prefetchData";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast, Skeleton } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";
import { dueOf, isDebt, paidOf } from "@/lib/debt";
import { invoiceNo } from "@/lib/invoicePrint";
import { getClinicName } from "@/lib/settings";
import { UniversalReportTable, type ReportColumn, type SummaryMetric } from "@/components/reports/UniversalReportTable";

/* ============================================================================
 * Reports & Analytics hub (التقارير والإحصائيات) — admin-only, clinic-scoped.
 * All data comes through the existing repo (dual-adapter); every aggregation is
 * memoised so re-renders stay cheap. Money/percentages use Western numerals.
 * ==========================================================================*/

type RangeKey = "today" | "week" | "month" | "custom";
type TabKey = "ops" | "revenue" | "sales" | "staff" | "ledger" | "top" | "audit" | "clinical";

/** One staff member's sales performance in the selected range. */
interface StaffTopItem { name: string; qty: number; revenue: number }
interface StaffSalesRow {
  id: string; name: string; invoices: number; revenue: number; profit: number; units: number; avg: number;
  topItem: string; topItemRev: number;
  /** Top 5 items this seller moved (by revenue) — feeds the drill-down panel. */
  topItems: StaffTopItem[];
  /** Distinct customers served (by phone, falling back to name). */
  customers: number;
  /** Total discounts this seller granted. */
  discounts: number;
  servicesRev: number; productsRev: number;
  /** Amount collected per payment method across this seller's invoices. */
  payMix: Record<PaymentMethod, number>;
  /** The single largest invoice in range. */
  biggest: { total: number; client: string; when: string } | null;
  /** Share of the clinic's total revenue in range (0–100). */
  share: number;
}
/** Per-bucket revenue series (2h buckets for a single day, daily up to ~6 months,
 *  monthly beyond). Series are keyed by staff ID — display names can collide. */
interface StaffTrend { series: Array<Record<string, number | string>>; keys: { id: string; name: string }[] }

/** Lab/imaging media kinds counted in the "الأشعة والتحاليل" report. */
const CLINICAL_MEDIA: Record<string, string> = { lab: "تحاليل مخبرية", xray: "أشعة سينية", ultrasound: "سونار / تصوير" };

const PIE = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2", "#7c3aed", "#64748b"];
const SPECIES_AR: Record<string, string> = { dog: "كلاب", cat: "قطط", horse: "خيول", cow: "أبقار", bird: "طيور", rabbit: "أرانب", other: "أخرى" };
const PAY_AR: Record<PaymentMethod, string> = { cash: "نقداً", card: "بطاقة", transfer: "تحويل" };
const PAY_ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight };
/** A sale's payment legs — the recorded split when present, else one leg for the whole
 *  total at the (legacy) single method. Empty when the sale is still unpaid (a receivable). */
const paymentsOf = (inv: Invoice): { method: PaymentMethod; amount: number }[] => {
  const d = inv.payment_details;
  if (Array.isArray(d) && d.length) {
    return d.filter((p): p is { method: PaymentMethod; amount: number } => !!p && !!p.method && Number(p.amount) > 0);
  }
  return inv.payment_method ? [{ method: inv.payment_method, amount: inv.total }] : [];
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parse "HH:mm" → minutes-of-day (0–1439), or null when blank/invalid. */
const parseHM = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || "").trim());
  if (!m) return null;
  const h = +m[1]; const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};
/** minutes-of-day → "h:mm ص/م" (12-hour, Western numerals) — for shift labels. */
const fmtMins = (mins: number) => {
  const h = Math.floor(mins / 60) % 24; const mi = mins % 60;
  const period = h < 12 ? "ص" : "م"; const h12 = h % 12 || 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${period}`;
};
/** Whole-hour 12-hour label for chart axes (e.g. "8 ص", "2 م"). */
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "ص" : "م"}`;

function rangeBounds(key: RangeKey, from: string, to: string): { lo: number; hi: number } {
  const now = new Date();
  if (key === "today") return { lo: startOfDay(now).getTime(), hi: endOfDay(now).getTime() };
  if (key === "week") { const s = new Date(now); s.setDate(now.getDate() - 6); return { lo: startOfDay(s).getTime(), hi: endOfDay(now).getTime() }; }
  if (key === "month") return { lo: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime(), hi: endOfDay(now).getTime() };
  // custom
  const lo = from ? startOfDay(new Date(from + "T00:00:00")).getTime() : 0;
  const hi = to ? endOfDay(new Date(to + "T00:00:00")).getTime() : endOfDay(now).getTime();
  return { lo, hi };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function AnalyticsHub() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const canProfit = can("viewProfits");

  // Stale-while-revalidate: reports are the heaviest fetch — paint the last
  // snapshot instantly (seeded by the page's own load() or the idle warmer).
  const cacheKey = analyticsKey(user?.clinic_id ?? user?.id);
  const seed = getCached<AnalyticsSnap>(cacheKey);

  const [loading, setLoading] = useState(!seed);
  const [pets, setPets] = useState<Pet[]>(seed?.pets ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(seed?.invoices ?? []);
  const [items, setItems] = useState<InvoiceItem[]>(seed?.items ?? []);
  const [products, setProducts] = useState<Product[]>(seed?.products ?? []);
  const [visits, setVisits] = useState<MedicalVisit[]>(seed?.visits ?? []);
  const [staff, setStaff] = useState<StaffMember[]>(seed?.staff ?? []);
  const [media, setMedia] = useState<MediaItem[]>(seed?.media ?? []);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>(seed?.treatments ?? []);
  const [audit, setAudit] = useState<AuditEntry[]>(seed?.audit ?? []);
  const [logins, setLogins] = useState<LoginEvent[]>(seed?.logins ?? []);

  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Shift-based reporting: an optional time-of-day window (HH:mm) applied on top of
  // the date range. Blank = inactive. Local wall-clock is used consistently so the
  // window means the same thing regardless of the stored timestamp's UTC offset.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [tab, setTab] = useState<TabKey>("ops");

  useEffect(() => {
    let alive = true;
    const clinicId = user?.clinic_id ?? user?.id;
    if (isFresh(cacheKey, 20_000)) return; // fresh snapshot — skip the heavy refetch
    (async () => {
      try {
        // Fetch composition lives in prefetchData so the page and the idle warmer
        // stay identical. Populate every slice from the one snapshot.
        const s = await loadAnalyticsSnap(clinicId);
        if (!alive) return;
        setPets(s.pets); setInvoices(s.invoices); setItems(s.items); setProducts(s.products);
        setVisits(s.visits); setMedia(s.media); setTreatments(s.treatments); setStaff(s.staff); setAudit(s.audit); setLogins(s.logins);
        setCached<AnalyticsSnap>(cacheKey, s);
      } catch { /* empty states cover it */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.clinic_id, user?.id]);

  const { lo, hi } = useMemo(() => rangeBounds(range, from, to), [range, from, to]);

  // Shift window (minutes-of-day). Blank → null; window inactive when both null.
  const startMin = useMemo(() => parseHM(startTime), [startTime]);
  const endMin = useMemo(() => parseHM(endTime), [endTime]);
  const timeActive = startMin !== null || endMin !== null;
  // Predicate over a minutes-of-day value. End blank → end of day; an end earlier
  // than the start is treated as an overnight shift (e.g. 22:00 → 04:00) that wraps.
  const inWindow = useMemo(() => {
    if (startMin === null && endMin === null) return (_m: number) => true;
    const loM = startMin ?? 0; const hiM = endMin ?? 1439;
    return loM <= hiM ? (m: number) => m >= loM && m <= hiM : (m: number) => m >= loM || m <= hiM;
  }, [startMin, endMin]);
  // Convenience: test an ISO timestamp's LOCAL wall-clock time against the window.
  const tsOk = useMemo(() => (iso: string) => { const d = new Date(iso); return inWindow(d.getHours() * 60 + d.getMinutes()); }, [inWindow]);

  // Invoices in range (date) AND within the optional shift window.
  const invInRange = useMemo(() => invoices.filter((i) => { const t = new Date(i.created_at).getTime(); return t >= lo && t <= hi && tsOk(i.created_at); }), [invoices, lo, hi, tsOk]);
  const paid = useMemo(() => invInRange.filter((i) => (i.status ?? "paid") !== "refunded"), [invInRange]);
  const inRangeInvoiceIds = useMemo(() => new Set(paid.map((i) => i.id)), [paid]);
  const itemsInRange = useMemo(() => items.filter((it) => inRangeInvoiceIds.has(it.invoice_id)), [items, inRangeInvoiceIds]);

  // ---- Transaction log (سجل الحركات): one enriched row per invoice in range ----
  const staffById = useMemo(() => { const m = new Map<string, string>(); for (const s of staff) m.set(s.id, s.name); return m; }, [staff]);
  const itemsByInvoice = useMemo(() => {
    const m = new Map<string, InvoiceItem[]>();
    for (const it of items) { const a = m.get(it.invoice_id) ?? []; a.push(it); m.set(it.invoice_id, a); }
    return m;
  }, [items]);
  // The ledger spans ALL invoices (not the global range) — it carries its own historical
  // date-range picker, so it must have the full set to filter locally.
  const ledger = useMemo<LedgerRow[]>(() => invoices.map((inv) => {
    const its = itemsByInvoice.get(inv.id) ?? [];
    const summary = its.length
      ? its.slice(0, 3).map((it) => (it.qty && it.qty > 1 ? `${it.name}×${formatNum(it.qty)}` : it.name)).join("، ") + (its.length > 3 ? ` +${formatNum(its.length - 3)}` : "")
      : "—";
    const refunded = (inv.status ?? "paid") === "refunded";
    const legs = paymentsOf(inv);
    const method = refunded ? "مُرجعة" : legs.length > 1 ? "دفع مجزأ" : legs.length === 1 ? PAY_AR[legs[0].method] : "آجل";
    return {
      id: inv.id, ref: invoiceNo(inv.id), when: inv.created_at, whenMs: new Date(inv.created_at).getTime(),
      client: (inv.customer_name ?? "").trim() || "عميل نقدي",
      staff: (inv.staff_id && staffById.get(inv.staff_id)) || "—",
      items: summary, method,
      total: inv.total, discount: inv.discount ?? 0, profit: inv.profit ?? 0, refunded,
    };
  }).sort((a, b) => b.whenMs - a.whenMs), [invoices, itemsByInvoice, staffById]);

  // ---- Module 1: Daily Operations ----
  const zReport = useMemo(() => {
    const byMethod: Record<PaymentMethod, { total: number; count: number }> = {
      cash: { total: 0, count: 0 }, card: { total: 0, count: 0 }, transfer: { total: 0, count: 0 },
    };
    let gross = 0; let pending = 0;
    for (const i of paid) {
      gross += i.total;
      const legs = paymentsOf(i);
      if (legs.length) for (const p of legs) { if (byMethod[p.method]) { byMethod[p.method].total += p.amount; byMethod[p.method].count += 1; } }
      else pending += i.total;
    }
    const refunds = invInRange.filter((i) => (i.status ?? "paid") === "refunded");
    const refundTotal = refunds.reduce((s, i) => s + i.total, 0);
    return { byMethod, gross, pending, txCount: paid.length, refundCount: refunds.length, refundTotal };
  }, [paid, invInRange]);

  // Outstanding balances (credit / آجل): any non-refunded sale still owing — partial or unpaid.
  const receivables = useMemo(() => paid.filter(isDebt), [paid]);

  // Time series: hourly when the range is a single day, otherwise daily — gross + net.
  const series = useMemo(() => {
    const hourly = (hi - lo) <= 86400000 * 1.5;
    const buckets = new Map<string, { label: string; gross: number; net: number; order: number }>();
    if (hourly) {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), gross: 0, net: 0, order: h });
    } else {
      const d = startOfDay(new Date(lo));
      for (let i = 0; d.getTime() <= hi && i < 92; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, gross: 0, net: 0, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    }
    for (const inv of paid) {
      const dt = new Date(inv.created_at);
      const key = hourly ? String(Math.floor(dt.getHours() / 2) * 2) : localISO(startOfDay(dt));
      const b = buckets.get(key);
      if (b) { b.gross += inv.total; b.net += inv.profit ?? 0; }
    }
    return Array.from(buckets.values()).sort((a, b) => a.order - b.order)
      .map((b) => ({ label: b.label, gross: Math.round(b.gross), net: Math.round(b.net) }));
  }, [paid, lo, hi]);

  const paymentPie = useMemo(() => {
    const m = { cash: 0, card: 0, transfer: 0 } as Record<PaymentMethod, number>;
    for (const i of paid) for (const p of paymentsOf(i)) if (m[p.method] !== undefined) m[p.method] += p.amount;
    return (["cash", "card", "transfer"] as PaymentMethod[]).map((k) => ({ name: PAY_AR[k], value: Math.round(m[k]) })).filter((d) => d.value > 0);
  }, [paid]);

  // ---- Module 2: Revenue & Profits ----
  const revenue = useMemo(() => {
    const gross = paid.reduce((s, i) => s + i.total, 0);
    const cogs = paid.reduce((s, i) => s + (i.cost_total ?? 0), 0);
    const net = paid.reduce((s, i) => s + (i.profit ?? 0), 0);
    let services = 0; let productsRev = 0;
    for (const it of itemsInRange) { if (it.product_id) productsRev += it.line_total; else services += it.line_total; }
    return { gross, cogs, net, margin: pct(net, gross), services, products: productsRev };
  }, [paid, itemsInRange]);

  const categoryData = useMemo(() => [
    { name: "المنتجات والصيدلية", value: Math.round(revenue.products) },
    { name: "الخدمات", value: Math.round(revenue.services) },
  ].filter((d) => d.value > 0), [revenue]);

  const staffPerf = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits) {
      const t = new Date((v.visit_date || "") + "T00:00:00").getTime();
      if (Number.isNaN(t) || t < lo || t > hi) continue;
      const doc = (v.doctor_name || "").trim() || "غير محدد";
      m.set(doc, (m.get(doc) ?? 0) + 1);
    }
    return Array.from(m, ([doctor, count]) => ({ doctor, count })).sort((a, b) => b.count - a.count);
  }, [visits, lo, hi]);

  // ---- Staff sales performance: full per-seller profile (revenue, best sellers,
  //      customers, discounts, service/product mix, payment mix, biggest ticket) ----
  const staffSales = useMemo<StaffSalesRow[]>(() => {
    type Agg = {
      id: string; name: string; invoices: number; revenue: number; profit: number; units: number; discounts: number;
      servicesRev: number; productsRev: number;
      itemAgg: Map<string, StaffTopItem>; customers: Set<string>;
      payMix: Record<PaymentMethod, number>; biggest: { total: number; client: string; when: string } | null;
    };
    const m = new Map<string, Agg>();
    for (const inv of paid) {
      const key = inv.staff_id || "__none";
      let a = m.get(key);
      if (!a) {
        a = {
          id: key, name: key === "__none" ? "غير محدد" : (staffById.get(key) || "غير محدد"),
          invoices: 0, revenue: 0, profit: 0, units: 0, discounts: 0, servicesRev: 0, productsRev: 0,
          itemAgg: new Map(), customers: new Set(), payMix: { cash: 0, card: 0, transfer: 0 }, biggest: null,
        };
        m.set(key, a);
      }
      a.invoices += 1;
      a.revenue += inv.total;
      a.profit += inv.profit ?? 0;
      a.units += inv.item_count ?? 0;
      a.discounts += inv.discount ?? 0;
      const ck = ((inv.customer_phone ?? "").trim() || (inv.customer_name ?? "").trim()).toLowerCase();
      if (ck) a.customers.add(ck);
      for (const leg of paymentsOf(inv)) if (a.payMix[leg.method] !== undefined) a.payMix[leg.method] += leg.amount;
      if (!a.biggest || inv.total > a.biggest.total) a.biggest = { total: inv.total, client: (inv.customer_name ?? "").trim() || "عميل نقدي", when: inv.created_at };
      for (const it of itemsByInvoice.get(inv.id) ?? []) {
        const e = a.itemAgg.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 };
        e.qty += it.qty; e.revenue += it.line_total;
        a.itemAgg.set(it.name, e);
        if (it.product_id) a.productsRev += it.line_total; else a.servicesRev += it.line_total;
      }
    }
    const totalRev = Array.from(m.values()).reduce((s, a) => s + a.revenue, 0);
    return Array.from(m.values()).map((a) => {
      const topItems = Array.from(a.itemAgg.values()).sort((x, y) => y.revenue - x.revenue).slice(0, 5);
      return {
        id: a.id, name: a.name, invoices: a.invoices, revenue: a.revenue, profit: a.profit, units: a.units,
        avg: a.invoices ? a.revenue / a.invoices : 0,
        topItem: topItems[0]?.name ?? "—", topItemRev: topItems[0]?.revenue ?? 0, topItems,
        customers: a.customers.size, discounts: a.discounts,
        servicesRev: a.servicesRev, productsRev: a.productsRev, payMix: a.payMix, biggest: a.biggest,
        share: totalRev ? (a.revenue / totalRev) * 100 : 0,
      };
    }).sort((x, y) => y.revenue - x.revenue);
  }, [paid, itemsByInvoice, staffById]);

  // Per-seller revenue over time (stacked). Series are keyed by staff ID (never by
  // display name — names can collide); top-4 named sellers get their own series,
  // unattributed sales keep a distinct "غير محدد" series, the rest fold into "أخرى".
  // Granularity adapts: 2h buckets for a single day, daily up to ~6 months, monthly
  // beyond — so long custom ranges aggregate instead of silently dropping days.
  const staffTrend = useMemo<StaffTrend>(() => {
    const named = staffSales.filter((s) => s.id !== "__none");
    const top = named.slice(0, 4);
    const topIds = new Set(top.map((s) => s.id));
    // A blank custom "from" reaches us as lo=0 (epoch) — treat it as unbounded too.
    const spanLo = Number.isFinite(lo) && lo > 0 ? lo : paid.reduce((mn, i) => Math.min(mn, new Date(i.created_at).getTime()), Date.now());
    const spanHi = Number.isFinite(hi) ? hi : paid.reduce((mx, i) => Math.max(mx, new Date(i.created_at).getTime()), Date.now());
    const spanDays = (spanHi - spanLo) / 86400000;
    const mode: "hour" | "day" | "month" = spanDays <= 1.5 ? "hour" : spanDays <= 190 ? "day" : "month";
    const buckets = new Map<string, Record<string, number | string>>();
    if (mode === "hour") {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), order: h });
    } else if (mode === "day") {
      const d = startOfDay(new Date(spanLo));
      for (let i = 0; d.getTime() <= spanHi && i < 200; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    } else {
      const d = new Date(spanLo); d.setDate(1); d.setHours(0, 0, 0, 0);
      for (let i = 0; d.getTime() <= spanHi && i < 60; i++) {
        buckets.set(`${d.getFullYear()}-${d.getMonth()}`, { label: `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`, order: d.getTime() });
        d.setMonth(d.getMonth() + 1);
      }
    }
    const keyOf = (dd: Date) =>
      mode === "hour" ? String(Math.floor(dd.getHours() / 2) * 2)
        : mode === "day" ? localISO(startOfDay(dd))
          : `${dd.getFullYear()}-${dd.getMonth()}`;
    let hasNone = false; let hasOther = false;
    for (const inv of paid) {
      const b = buckets.get(keyOf(new Date(inv.created_at)));
      if (!b) continue;
      const sid = inv.staff_id || "__none";
      const bk = sid === "__none" ? "__none" : topIds.has(sid) ? sid : "__other";
      if (bk === "__none") hasNone = true;
      if (bk === "__other") hasOther = true;
      b[bk] = ((b[bk] as number) ?? 0) + inv.total;
    }
    const series = Array.from(buckets.values()).sort((a, b) => (a.order as number) - (b.order as number));
    const keys = [
      ...top.map((s) => ({ id: s.id, name: s.name })),
      ...(hasOther ? [{ id: "__other", name: "أخرى" }] : []),
      ...(hasNone ? [{ id: "__none", name: "غير محدد" }] : []),
    ];
    return { series, keys };
  }, [staffSales, paid, lo, hi]);

  // ---- Module 3: Sales & Inventory ----
  const movers = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of itemsInRange) {
      const key = it.product_id ?? `name:${it.name.toLowerCase()}`;
      const cur = m.get(key) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty; cur.revenue += it.line_total; m.set(key, cur);
    }
    const sold = Array.from(m.values());
    const top = [...sold].sort((a, b) => b.qty - a.qty).slice(0, 8);
    // Slow movers: stocked products with the fewest (incl. zero) units sold.
    const soldByProduct = new Map<string, number>();
    for (const it of itemsInRange) if (it.product_id) soldByProduct.set(it.product_id, (soldByProduct.get(it.product_id) ?? 0) + it.qty);
    const slow = products
      .map((p) => ({ name: p.name, qty: soldByProduct.get(p.id) ?? 0 }))
      .sort((a, b) => a.qty - b.qty).slice(0, 8);
    return { top, slow };
  }, [itemsInRange, products]);

  const speciesActivity = useMemo(() => {
    const sp = new Map<string, Species>(pets.map((p) => [p.id, p.species]));
    const m = new Map<string, number>();
    for (const v of visits) {
      const t = new Date((v.visit_date || "") + "T00:00:00").getTime();
      if (Number.isNaN(t) || t < lo || t > hi) continue;
      const s = (v.pet_id && sp.get(v.pet_id)) || "other";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m, ([s, count]) => ({ name: SPECIES_AR[s] ?? s, count })).sort((a, b) => b.count - a.count);
  }, [visits, pets, lo, hi]);

  // ---- Module 4: VIP & performance (أفضل 10) ----
  const topClients = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; total: number; visits: number }>();
    for (const i of paid) {
      const phone = (i.customer_phone ?? "").trim();
      const name = (i.customer_name ?? "").trim();
      if (!phone && !name) continue; // skip anonymous walk-ins
      const key = (phone || name).toLowerCase();
      const cur = m.get(key) ?? { name: name || "عميل", phone, total: 0, visits: 0 };
      cur.total += i.total; cur.visits += 1;
      if (!cur.name && name) cur.name = name;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [paid]);

  const topServices = useMemo(() => {
    const m = new Map<string, { name: string; count: number; revenue: number }>();
    for (const it of itemsInRange) {
      if (it.product_id) continue; // services/meds are non-product lines
      const key = it.name.trim().toLowerCase();
      const cur = m.get(key) ?? { name: it.name, count: 0, revenue: 0 };
      cur.count += it.qty; cur.revenue += it.line_total; m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [itemsInRange]);

  // ---- Module 5: Audit & security ----
  const staffByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) if (s.userId) m.set(s.userId, s.name);
    return m;
  }, [staff]);

  const deletedInvoices = useMemo(() => {
    return audit
      .filter((a) => a.entity === "invoices" && a.action === "DELETE")
      .filter((a) => { const t = new Date(a.created_at).getTime(); return t >= lo && t <= hi && tsOk(a.created_at); })
      .map((a) => {
        const d = (a.details ?? {}) as { id?: string; total?: number; customer_name?: string | null; created_at?: string };
        return {
          id: String(a.id),
          invoiceId: d.id ?? a.entity_id ?? "—",
          total: typeof d.total === "number" ? d.total : null,
          customer: (d.customer_name ?? "").trim() || "عميل غير مسجّل",
          by: (a.actor && staffByUser.get(a.actor)) || "—",
          when: a.created_at,
        };
      });
  }, [audit, lo, hi, staffByUser, tsOk]);

  const loginsInRange = useMemo(() => {
    return logins
      .filter((l) => { const t = new Date(l.created_at).getTime(); return t >= lo && t <= hi && tsOk(l.created_at); })
      .map((l) => ({ id: String(l.id), who: (l.name ?? "").trim() || (l.email ?? "").trim() || "مستخدم", email: (l.email ?? "").trim(), when: l.created_at }))
      .slice(0, 100);
  }, [logins, lo, hi, tsOk]);

  // ---- Module 6: Clinical & medical ----
  const labXray = useMemo(() => {
    const m = new Map<string, number>();
    for (const md of media) {
      if (!(md.kind in CLINICAL_MEDIA)) continue;
      const t = new Date(md.created_at).getTime();
      if (Number.isNaN(t) || t < lo || t > hi || !tsOk(md.created_at)) continue;
      m.set(md.kind, (m.get(md.kind) ?? 0) + 1);
    }
    const rows = Object.keys(CLINICAL_MEDIA).map((k) => ({ name: CLINICAL_MEDIA[k], count: m.get(k) ?? 0 }));
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { rows, total };
  }, [media, lo, hi, tsOk]);

  const dispensedMeds = useMemo(() => {
    const m = new Map<string, { name: string; count: number; given: number }>();
    for (const t of treatments) {
      const ts = new Date((t.day || "") + "T00:00:00").getTime();
      if (Number.isNaN(ts) || ts < lo || ts > hi) continue;
      // Treatments carry their own HH:mm administration time — honor the shift window.
      if (timeActive) { const tm = parseHM(t.time); if (tm === null || !inWindow(tm)) continue; }
      const key = t.medication.trim().toLowerCase();
      const cur = m.get(key) ?? { name: t.medication, count: 0, given: 0 };
      cur.count += 1; if (t.administered_at) cur.given += 1; m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [treatments, lo, hi, timeActive, inWindow]);

  // ---- Export ----
  const exportCSV = () => {
    const rows: string[][] = [
      ["تقرير doctorVet", new Date().toLocaleDateString("en-GB")],
      [],
      ["إجمالي المبيعات", String(Math.round(zReport.gross))],
      ["صافي الربح", String(Math.round(revenue.net))],
      ["تكلفة البضاعة", String(Math.round(revenue.cogs))],
      ["عدد العمليات", String(zReport.txCount)],
      [],
      ["طريقة الدفع", "المبلغ", "عدد العمليات"],
      ...(["cash", "card", "transfer"] as PaymentMethod[]).map((k) => [PAY_AR[k], String(Math.round(zReport.byMethod[k].total)), String(zReport.byMethod[k].count)]),
      [],
      ["الأكثر مبيعاً", "الكمية", "الإيراد"],
      ...movers.top.map((p) => [p.name, String(p.qty), String(Math.round(p.revenue))]),
    ];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `doctorvet-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير الملف", "CSV");
  };

  const TABS: { id: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { id: "ops", label: "التشغيل اليومي", icon: Wallet },
    { id: "revenue", label: "الإيرادات والأرباح", icon: TrendingUp },
    { id: "sales", label: "المبيعات والمخزون", icon: Package },
    { id: "staff", label: "مبيعات الموظفين", icon: Users },
    { id: "ledger", label: "سجل الحركات", icon: ScrollText },
    { id: "top", label: "الأفضل أداءً", icon: Crown },
    { id: "clinical", label: "التقارير الطبية", icon: Stethoscope },
    { id: "audit", label: "المراقبة والنشاط", icon: ShieldAlert },
  ];
  const RANGES: { id: RangeKey; label: string }[] = [
    { id: "today", label: "اليوم" }, { id: "week", label: "هذا الأسبوع" },
    { id: "month", label: "هذا الشهر" }, { id: "custom", label: "مخصّص" },
  ];

  // Defense-in-depth: the nav link is already gated, but block direct-URL access too.
  if (!can("viewReports")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">ليس لديك صلاحية الاطّلاع على التقارير. تواصل مع مدير العيادة.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><BarChart3 size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">التقارير والإحصائيات</h1>
          <p className="text-sm text-ink-subtle">لوحة تحليلية شاملة لأداء العيادة المالي والتشغيلي.</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2 text-sm font-semibold text-ink-muted transition hover:border-brand-300 hover:text-brand-600"><Download size={15} /> تصدير CSV</button>
        <button onClick={() => toast.toast({ tone: "info", title: "التصدير إلى PDF", description: "هذه الميزة ستتوفّر قريباً." })} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2 text-sm font-semibold text-ink-muted transition hover:border-brand-300 hover:text-brand-600"><FileText size={15} /> تصدير PDF</button>
      </div>

      {/* Global date picker */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CalendarRange size={16} className="text-ink-subtle" />
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", range === r.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>{r.label}</button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="input h-9 py-0 [color-scheme:light] dark:[color-scheme:dark]" />
            <span className="text-ink-subtle">—</span>
            <input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="input h-9 py-0 [color-scheme:light] dark:[color-scheme:dark]" />
          </div>
        )}
      </div>

      {/* Shift window — optional time-of-day drill-down (compact, single line). */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Clock size={15} className="text-brand-600" /> تصفية حسب نوبة العمل</span>
        <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
          وقت البدء
          <input type="time" dir="ltr" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input h-8 w-28 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
          وقت الانتهاء
          <input type="time" dir="ltr" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input h-8 w-28 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
        </label>
        {timeActive ? (
          <>
            <span className="chip bg-brand-50 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              النافذة: {fmtMins(startMin ?? 0)} — {fmtMins(endMin ?? 1439)}
            </span>
            <button onClick={() => { setStartTime(""); setEndTime(""); }} className="chip bg-surface-2 text-2xs font-semibold text-ink-muted transition hover:text-danger-600">✕ مسح الوقت</button>
          </>
        ) : (
          <span className="text-2xs text-ink-subtle">اتركه فارغاً لعرض اليوم كاملاً.</span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 inline-flex w-full items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button key={tb.id} onClick={() => setTab(tb.id)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition", tab === tb.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <Icon size={16} /> <span className="hidden sm:inline">{tb.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : (
        <>
          {tab === "ops" && <OpsTab z={zReport} receivables={receivables} series={series} paymentPie={paymentPie} />}
          {tab === "revenue" && <RevenueTab revenue={revenue} categoryData={categoryData} staff={staffPerf} canProfit={canProfit} series={series} />}
          {tab === "sales" && <SalesTab movers={movers} species={speciesActivity} />}
          {tab === "staff" && (
            <StaffSalesTab
              rows={staffSales}
              trend={staffTrend}
              canProfit={canProfit}
              rangeLabel={Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) ? `الفترة: ${shortDate(lo)} — ${shortDate(hi)}` : undefined}
            />
          )}
          {tab === "ledger" && <LedgerTab rows={ledger} canProfit={canProfit} />}
          {tab === "top" && <TopTab clients={topClients} services={topServices} />}
          {tab === "clinical" && <ClinicalTab labXray={labXray} meds={dispensedMeds} />}
          {tab === "audit" && <AuditTab deleted={deletedInvoices} logins={loginsInRange} />}
        </>
      )}
    </div>
  );
}

/* ----------------------------- Module 1 ----------------------------- */
interface ZReport { byMethod: Record<PaymentMethod, { total: number; count: number }>; gross: number; pending: number; txCount: number; refundCount: number; refundTotal: number }
type Series = { label: string; gross: number; net: number }[];
function OpsTab({ z, receivables, series, paymentPie }: { z: ZReport; receivables: Invoice[]; series: Series; paymentPie: { name: string; value: number }[] }) {
  const methods: PaymentMethod[] = ["cash", "card", "transfer"];
  return (
    <div className="space-y-5">
    {/* Sales trend over the period */}
    <Panel title="حركة المبيعات خلال الفترة" icon={BarChart3}>
      {series.length === 0 ? <Empty text="لا توجد بيانات في هذه الفترة." /> : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="gGross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
            <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
            <Tooltip formatter={(v: number) => money(v)} labelStyle={{ color: "#64748b" }} />
            <Area type="monotone" dataKey="gross" name="المبيعات" stroke="#2563eb" strokeWidth={2} fill="url(#gGross)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>

    <div className="grid gap-5 lg:grid-cols-2">
      {/* Z-Report */}
      <Panel title="إغلاق الصندوق (Z-Report)" icon={Wallet}>
        <div className="mb-4 rounded-2xl bg-brand-grad p-4 text-white shadow-soft">
          <p className="text-xs font-semibold opacity-90">إجمالي المبيعات للفترة</p>
          <p className="font-display text-3xl font-extrabold tabular-nums">{money(z.gross)}</p>
          <p className="mt-1 text-xs opacity-90">{formatNum(z.txCount)} عملية بيع</p>
        </div>
        {paymentPie.length > 0 && (
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={paymentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={2}>
                  {paymentPie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="space-y-2">
          {methods.map((m) => {
            const Icon = PAY_ICON[m]; const row = z.byMethod[m];
            return (
              <div key={m} className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-ink-muted"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{PAY_AR[m]}</p>
                  <p className="text-2xs text-ink-subtle">{formatNum(row.count)} عملية · {pct(row.total, z.gross)}%</p>
                </div>
                <p className="font-display font-bold tabular-nums text-ink">{money(row.total)}</p>
              </div>
            );
          })}
          {z.refundCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-danger-200 bg-danger-50/50 p-3 text-sm dark:border-danger-500/30 dark:bg-danger-500/10">
              <span className="font-semibold text-danger-700 dark:text-danger-300">مرتجعات ({formatNum(z.refundCount)})</span>
              <span className="font-display font-bold tabular-nums text-danger-700 dark:text-danger-300">− {money(z.refundTotal)}</span>
            </div>
          )}
        </div>
      </Panel>

      {/* Receivables — outstanding credit / debts (سجل الديون) */}
      <Panel title="الذمم / الديون الآجلة" icon={Receipt}>
        {receivables.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <Receipt size={28} className="mb-2 text-ink-subtle/40" />
            <p className="text-sm text-ink-subtle">لا توجد ديون معلّقة — كل المبيعات مسدّدة بالكامل.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-xl bg-warn-50 px-3 py-2 text-sm dark:bg-warn-500/10">
              <span className="font-semibold text-warn-700 dark:text-warn-300">إجمالي المتبقّي على العملاء</span>
              <span className="font-display font-bold tabular-nums text-warn-700 dark:text-warn-300">{money(receivables.reduce((s, i) => s + dueOf(i), 0))}</span>
            </div>
            <ul className="space-y-1.5">
              {receivables.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{i.customer_name || "عميل غير مسجّل"}</p>
                    <p className="text-2xs text-ink-subtle">مدفوع {money(paidOf(i))} من {money(i.total)}</p>
                  </div>
                  <span className="font-display font-bold tabular-nums text-warn-600">{money(dueOf(i))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
    </div>
  );
}

/* ----------------------------- Module 2 ----------------------------- */
function RevenueTab({ revenue, categoryData, staff, canProfit, series }: {
  revenue: { gross: number; cogs: number; net: number; margin: number; services: number; products: number };
  categoryData: { name: string; value: number }[];
  staff: { doctor: string; count: number }[];
  canProfit: boolean;
  series: Series;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={TrendingUp} tone="brand" label="إجمالي الإيرادات" value={money(revenue.gross)} />
        {canProfit ? (
          <>
            <Kpi icon={Package} tone="warn" label="تكلفة البضاعة المباعة" value={money(revenue.cogs)} />
            <Kpi icon={Wallet} tone="success" label={`صافي الربح · ${formatNum(revenue.margin)}%`} value={money(revenue.net)} />
          </>
        ) : (
          <div className="sm:col-span-2 flex items-center gap-3 rounded-2xl border border-line bg-surface-2/50 p-4 text-sm text-ink-subtle">
            <Lock size={18} /> بيانات الأرباح والتكلفة متاحة لمن يملك صلاحية «الاطّلاع على الأرباح».
          </div>
        )}
      </div>

      {/* Revenue vs net profit over the period */}
      <Panel title={canProfit ? "الإيرادات مقابل صافي الربح" : "الإيرادات خلال الفترة"} icon={TrendingUp}>
        {series.length === 0 ? <Empty text="لا توجد بيانات في هذه الفترة." /> : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
              <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="gross" name="الإيرادات" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={36} />
              {canProfit && <Line type="monotone" dataKey="net" name="صافي الربح" stroke="#16a34a" strokeWidth={2.5} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="الإيرادات حسب الفئة" icon={BarChart3}>
          {categoryData.length === 0 ? <Empty text="لا توجد مبيعات في هذه الفترة." /> : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {categoryData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm" style={{ background: PIE[i % PIE.length] }} />
                    <span className="text-ink-muted">{d.name}</span>
                    <span className="font-bold tabular-nums text-ink">{money(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="أداء الكادر (عدد الزيارات)" icon={Stethoscope}>
          <p className="mb-2 text-2xs text-ink-subtle">يُحتسب بعدد الاستشارات المسجّلة لكل طبيب (الإيراد غير مرتبط بطبيب في النظام).</p>
          {staff.length === 0 ? <Empty text="لا توجد زيارات مسجّلة في هذه الفترة." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-2xs text-ink-subtle"><th className="pb-2 text-start font-semibold">الطبيب</th><th className="pb-2 text-end font-semibold">الزيارات</th></tr></thead>
              <tbody className="divide-y divide-line">
                {staff.map((s) => (
                  <tr key={s.doctor}><td className="py-2 text-ink">{s.doctor}</td><td className="py-2 text-end font-bold tabular-nums text-ink">{formatNum(s.count)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ----------------------------- Module 3 ----------------------------- */
function SalesTab({ movers, species }: {
  movers: { top: { name: string; qty: number; revenue: number }[]; slow: { name: string; qty: number }[] };
  species: { name: string; count: number }[];
}) {
  const maxQty = movers.top[0]?.qty ?? 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="الأكثر مبيعاً" icon={Trophy}>
          {movers.top.length === 0 ? <Empty text="لا توجد مبيعات في هذه الفترة." /> : (
            <ul className="space-y-2">
              {movers.top.map((p, i) => (
                <li key={p.name + i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 tabular-nums">{formatNum(i + 1)}</span>{p.name}</span>
                    <span className="font-bold tabular-nums text-ink">{formatNum(p.qty)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct(p.qty, maxQty)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="الأقل مبيعاً" icon={Snail}>
          {movers.slow.length === 0 ? <Empty text="لا توجد منتجات بعد." /> : (
            <ul className="divide-y divide-line">
              {movers.slow.map((p, i) => (
                <li key={p.name + i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-muted">{p.name}</span>
                  <span className={cn("font-bold tabular-nums", p.qty === 0 ? "text-danger-500" : "text-ink")}>{formatNum(p.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="النشاط حسب نوع الحيوان (عدد الزيارات)" icon={PawPrint}>
        <p className="mb-2 text-2xs text-ink-subtle">توزيع الزيارات حسب النوع — المبيعات في النظام غير مرتبطة بنوع الحيوان.</p>
        {species.length === 0 ? <Empty text="لا توجد زيارات مسجّلة في هذه الفترة." /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={species} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="currentColor" className="text-ink-subtle" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-ink-subtle" />
              <Tooltip formatter={(v: number) => formatNum(v)} cursor={{ fill: "rgba(37,99,235,0.08)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {species.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------- Module 4: VIP & Performance (أفضل 10) ----------------------------- */
function TopTab({ clients, services }: {
  clients: { name: string; phone: string; total: number; visits: number }[];
  services: { name: string; count: number; revenue: number }[];
}) {
  const maxSvc = services[0]?.count || 1;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="أفضل 10 زبائن (الأعلى إنفاقاً)" icon={Crown}>
        {clients.length === 0 ? <Empty text="لا توجد مبيعات لعملاء مسجّلين في هذه الفترة." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-2xs text-ink-subtle">
              <th className="pb-2 text-start font-semibold">#</th>
              <th className="pb-2 text-start font-semibold">الزبون</th>
              <th className="pb-2 text-center font-semibold">الزيارات</th>
              <th className="pb-2 text-end font-semibold">إجمالي الإنفاق</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {clients.map((c, i) => (
                <tr key={c.phone + c.name + i}>
                  <td className="py-2"><Rank i={i} /></td>
                  <td className="py-2"><p className="font-semibold text-ink">{c.name}</p>{c.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}</td>
                  <td className="py-2 text-center tabular-nums text-ink-muted">{formatNum(c.visits)}</td>
                  <td className="py-2 text-end font-bold tabular-nums text-ink">{money(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="أفضل 10 خدمات (الأكثر طلباً)" icon={Star}>
        {services.length === 0 ? <Empty text="لا توجد خدمات مفوترة في هذه الفترة." /> : (
          <ul className="space-y-2.5">
            {services.map((s, i) => (
              <li key={s.name + i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink"><Rank i={i} />{s.name}</span>
                  <span className="text-ink-muted">{formatNum(s.count)} · <span className="font-bold tabular-nums text-ink">{money(s.revenue)}</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct(s.count, maxSvc)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------- Module 5: Clinical & Medical (التقارير الطبية) ----------------------------- */
function ClinicalTab({ labXray, meds }: {
  labXray: { rows: { name: string; count: number }[]; total: number };
  meds: { name: string; count: number; given: number }[];
}) {
  return (
    <div className="space-y-5">
      <Panel title="تقرير الأشعة والتحاليل" icon={FlaskConical}>
        <div className="grid gap-3 sm:grid-cols-3">
          {labXray.rows.map((r) => (
            <div key={r.name} className="rounded-2xl border border-line bg-surface-1 p-4 text-center">
              <p className="font-display text-3xl font-extrabold tabular-nums text-ink">{formatNum(r.count)}</p>
              <p className="mt-1 text-xs text-ink-muted">{r.name}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-ink-subtle">الإجمالي خلال الفترة: <span className="font-bold tabular-nums text-ink">{formatNum(labXray.total)}</span> طلب</p>
      </Panel>

      <Panel title="تقرير الأدوية المصروفة" icon={Pill}>
        <p className="mb-2 text-2xs text-ink-subtle">عدد مرات صرف كل دواء خلال الفترة، وكم منها أُعطي فعلاً (مقابل المُخطّط).</p>
        {meds.length === 0 ? <Empty text="لا توجد أدوية مصروفة في هذه الفترة." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-2xs text-ink-subtle">
              <th className="pb-2 text-start font-semibold">الدواء</th>
              <th className="pb-2 text-center font-semibold">عدد مرات الصرف</th>
              <th className="pb-2 text-end font-semibold">منها أُعطيت فعلاً</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {meds.map((m, i) => (
                <tr key={m.name + i}>
                  <td className="py-2 text-ink">{m.name}</td>
                  <td className="py-2 text-center font-bold tabular-nums text-ink">{formatNum(m.count)}</td>
                  <td className="py-2 text-end tabular-nums text-success-600">{formatNum(m.given)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------- Module 6: Audit & Security (المراقبة والنشاط) ----------------------------- */
function AuditTab({ deleted, logins }: {
  deleted: { id: string; invoiceId: string; total: number | null; customer: string; by: string; when: string }[];
  logins: { id: string; who: string; email: string; when: string }[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="الفواتير المحذوفة" icon={Trash2}>
        <p className="mb-2 text-2xs text-ink-subtle">سجلّ أمني بالفواتير التي حُذفت نهائياً ومَن قام بذلك.</p>
        {deleted.length === 0 ? <Empty text="لا توجد فواتير محذوفة في هذه الفترة." /> : (
          <ul className="space-y-1.5">
            {deleted.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-danger-200 bg-danger-50/40 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{d.customer}{d.total != null ? ` · ${money(d.total)}` : ""}</p>
                  <p className="text-2xs text-ink-subtle">بواسطة {d.by} · <span dir="ltr">{dt(d.when)}</span></p>
                </div>
                <Trash2 size={15} className="shrink-0 text-danger-500" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="سجلّ دخول المستخدمين" icon={LogIn}>
        <p className="mb-2 text-2xs text-ink-subtle">آخر عمليات تسجيل الدخول إلى النظام.</p>
        {logins.length === 0 ? <Empty text="لا توجد عمليات دخول مسجّلة في هذه الفترة." /> : (
          <ul className="divide-y divide-line">
            {logins.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Users size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{l.who}</p>
                  {l.email && <p className="truncate text-2xs text-ink-subtle" dir="ltr">{l.email}</p>}
                </div>
                <span className="shrink-0 text-2xs text-ink-subtle" dir="ltr">{dt(l.when)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Ranked badge — gold/silver/bronze for the top three, neutral after. */
function Rank({ i }: { i: number }) {
  const tone = i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
    : i === 1 ? "bg-slate-200 text-slate-600 dark:bg-slate-500/25 dark:text-slate-200"
      : i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
        : "bg-surface-2 text-ink-muted";
  return <span className={cn("inline-grid h-5 w-5 place-items-center rounded-full text-2xs font-bold tabular-nums", tone)}>{formatNum(i + 1)}</span>;
}

/** Date-time in 12-hour ص/م with Western numerals — used by the audit/login logs. */
const dt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString("ar-EG-u-nu-latn", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

/* ----------------------------- Transaction log (سجل الحركات) ----------------------------- */
/* ===== Staff sales performance — leaderboard, insights, trends & drill-down ===== */
type StaffSortKey = "name" | "invoices" | "units" | "customers" | "avg" | "revenue" | "profit";

/** Stable per-seller palette. Colour is resolved from the seller's ID via ONE
 *  `colorOf` mapping (rank among NAMED sellers), and that same colour feeds the
 *  avatar, donut slice and trend series — one colour = one person everywhere.
 *  Unattributed sales (غير محدد) and the fold-bucket (أخرى) get distinct neutrals. */
const STAFF_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6"];
const OTHER_COLOR = "#64748b";
const UNATTRIBUTED_COLOR = "#94a3b8";
const PAY_ICONS: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight };

const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "؟";

function StaffAvatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-white shadow-soft"
      style={{ width: size, height: size, background: color, fontSize: Math.max(11, size * 0.34) }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Top-3 podium — gold centre (lifted on desktop), silver and bronze flanking. */
function StaffPodium({ rows, colorOf, onSelect }: {
  rows: StaffSalesRow[]; colorOf: (id: string) => string; onSelect: (id: string) => void;
}) {
  const named = rows.filter((r) => r.id !== "__none").slice(0, 3);
  if (named.length === 0) return null;
  const TONES = [
    { label: "المركز الأول", medal: "🥇", ring: "border-amber-400/60 ring-1 ring-amber-400/30", grad: "from-amber-400/15", bar: "#f59e0b", order: "order-1 md:order-2", lift: "md:-mt-2" },
    { label: "المركز الثاني", medal: "🥈", ring: "border-slate-400/50", grad: "from-slate-400/10", bar: "#94a3b8", order: "order-2 md:order-1", lift: "" },
    { label: "المركز الثالث", medal: "🥉", ring: "border-orange-400/50", grad: "from-orange-400/10", bar: "#fb923c", order: "order-3", lift: "" },
  ];
  return (
    <div className="grid items-start gap-3 md:grid-cols-3">
      {named.map((r, i) => {
        const tone = TONES[i];
        return (
          <button
            key={r.id}
            onClick={() => { playTap(); onSelect(r.id); }}
            className={cn("card relative w-full overflow-hidden border p-4 text-start transition hover:shadow-raised", tone.ring, tone.order, tone.lift)}
          >
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent", tone.grad)} />
            <div className="relative flex items-center gap-3">
              <StaffAvatar name={r.name} color={colorOf(r.id)} size={46} />
              <div className="min-w-0 flex-1">
                <span className="chip bg-surface-2 text-2xs font-bold text-ink-muted">{tone.medal} {tone.label}</span>
                <p className="mt-1 truncate font-display font-extrabold text-ink">{r.name}</p>
              </div>
            </div>
            <p className="relative mt-3 font-display text-2xl font-extrabold tabular-nums text-ink">{money(r.revenue)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-muted">
              <span>{formatNum(r.invoices)} فاتورة</span>·<span>حصة {r.share.toFixed(0)}%</span>·<span>{formatNum(r.customers)} عميل</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.share)}%`, background: tone.bar }} />
            </div>
            {r.topItem !== "—" && <p className="mt-2 truncate text-2xs text-ink-subtle">⭐ الأكثر مبيعاً: {r.topItem}</p>}
          </button>
        );
      })}
    </div>
  );
}

/** Auto-computed highlights — the "so what?" of the numbers, at a glance. */
function StaffInsights({ rows }: { rows: StaffSalesRow[] }) {
  const named = rows.filter((r) => r.id !== "__none");
  const star = named[0] ?? rows[0];
  let bigInv: { total: number; client: string; seller: string } | null = null;
  for (const r of rows) if (r.biggest && (!bigInv || r.biggest.total > bigInv.total)) bigInv = { total: r.biggest.total, client: r.biggest.client, seller: r.name };
  let bestItem: { item: string; rev: number; seller: string } | null = null;
  for (const r of rows) if (r.topItemRev > (bestItem?.rev ?? 0)) bestItem = { item: r.topItem, rev: r.topItemRev, seller: r.name };
  const avgKing = named.filter((r) => r.invoices >= 2).sort((a, b) => b.avg - a.avg)[0] ?? null;
  const cards = [
    star ? { icon: Crown, tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", title: "نجم الفترة", line: star.name, sub: `${star.share.toFixed(0)}% من إجمالي المبيعات` } : null,
    bigInv ? { icon: Receipt, tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300", title: "أكبر فاتورة", line: money(bigInv.total), sub: `${bigInv.seller} · ${bigInv.client}` } : null,
    bestItem && bestItem.rev > 0 ? { icon: Star, tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", title: "أفضل صنف", line: bestItem.item, sub: `${money(bestItem.rev)} · ${bestItem.seller}` } : null,
    avgKing ? { icon: TrendingUp, tone: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300", title: "أعلى متوسط فاتورة", line: money(avgKing.avg), sub: avgKing.name } : null,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const I = c.icon;
        return (
          <div key={c.title} className="card flex items-center gap-3 p-3">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", c.tone)}><I size={18} /></span>
            <div className="min-w-0">
              <p className="text-2xs text-ink-subtle">{c.title}</p>
              <p className="truncate text-sm font-bold text-ink" title={c.line}>{c.line}</p>
              <p className="truncate text-2xs text-ink-muted">{c.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Revenue-share donut with a total in the centre and a % legend beside it.
 *  Top-5 NAMED sellers get their identity colours; unattributed sales keep their
 *  own distinct slice; everyone else folds into "أخرى" — same populations and
 *  colours as the trend chart next to it. */
function StaffShareDonut({ rows, colorOf }: { rows: StaffSalesRow[]; colorOf: (id: string) => string }) {
  const named = rows.filter((r) => r.id !== "__none");
  const unattributed = rows.find((r) => r.id === "__none");
  const top = named.slice(0, 5);
  const otherRev = named.slice(5).reduce((s, r) => s + r.revenue, 0);
  const data = [
    ...top.map((r) => ({ id: r.id, name: r.name, value: Math.round(r.revenue), color: colorOf(r.id) })),
    ...(otherRev > 0 ? [{ id: "__other", name: "أخرى", value: Math.round(otherRev), color: OTHER_COLOR }] : []),
    ...(unattributed && unattributed.revenue > 0 ? [{ id: "__none", name: "غير محدد", value: Math.round(unattributed.revenue), color: UNATTRIBUTED_COLOR }] : []),
  ].filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty text="لا توجد بيانات في هذه الفترة." />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={3} stroke="none">
              {data.map((d) => <Cell key={d.id} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v: number) => money(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-sm font-extrabold tabular-nums text-ink">{money(total)}</p>
            <p className="text-2xs text-ink-subtle">الإجمالي</p>
          </div>
        </div>
      </div>
      <div className="w-full flex-1 space-y-1.5">
        {data.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
            <span className="font-semibold tabular-nums text-ink">{pct(d.value, total)}%</span>
            <span className="w-20 text-end text-2xs tabular-nums text-ink-subtle">{money(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Everything about one seller — opens when their row/podium card is clicked. */
function StaffDetailPanel({ row, color, canProfit, onClose, panelRef }: {
  row: StaffSalesRow; color: string; canProfit: boolean; onClose: () => void; panelRef: React.RefObject<HTMLDivElement>;
}) {
  const maxItem = row.topItems[0]?.revenue || 1;
  const mixTotal = row.servicesRev + row.productsRev;
  const kpis = [
    { icon: Wallet, label: "إجمالي المبيعات", value: money(row.revenue) },
    { icon: Receipt, label: "عدد الفواتير", value: formatNum(row.invoices) },
    { icon: TrendingUp, label: "متوسط الفاتورة", value: money(row.avg) },
    { icon: Users, label: "عدد العملاء", value: formatNum(row.customers) },
    { icon: Package, label: "أصناف مباعة", value: formatNum(row.units) },
    { icon: BadgePercent, label: "خصومات ممنوحة", value: row.discounts > 0 ? money(row.discounts) : "—" },
  ];
  return (
    <div ref={panelRef} className="card animate-fade-in scroll-mt-24 border-brand-300/50 p-4 ring-1 ring-brand-400/20 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <StaffAvatar name={row.name} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold text-ink">{row.name}</p>
          <p className="text-2xs text-ink-muted">
            حصة {row.share.toFixed(1)}% من مبيعات الفترة{canProfit ? <> · صافي الربح <b className={cn("tabular-nums", row.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(row.profit)}</b></> : null}
          </p>
        </div>
        <button onClick={() => { playTap(); onClose(); }} aria-label="إغلاق" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => {
          const I = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-line bg-surface-2/50 p-2.5">
              <p className="flex items-center gap-1.5 text-2xs text-ink-subtle"><I size={13} className="shrink-0 text-brand-500" /> {k.label}</p>
              <p className="mt-1 truncate font-display text-sm font-extrabold tabular-nums text-ink">{k.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Best sellers — relative bars */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><Star size={14} className="text-amber-500" /> أفضل الأصناف مبيعاً</h4>
          {row.topItems.length === 0 ? (
            <p className="text-2xs text-ink-subtle">لا توجد أصناف مسجلة.</p>
          ) : (
            <div className="space-y-2.5">
              {row.topItems.map((it) => (
                <div key={it.name}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-ink" title={it.name}>{it.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{formatNum(it.qty)}× · <b className="text-ink">{money(it.revenue)}</b></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (it.revenue / maxItem) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Services vs products split */}
          <div>
            <h4 className="mb-2 text-sm font-bold text-ink">الخدمات مقابل المنتجات</h4>
            {mixTotal <= 0 ? (
              <p className="text-2xs text-ink-subtle">—</p>
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-sky-500" style={{ width: `${(row.servicesRev / mixTotal) * 100}%` }} />
                  <div className="h-full bg-violet-500" style={{ width: `${(row.productsRev / mixTotal) * 100}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> خدمات: <b className="tabular-nums text-ink">{money(row.servicesRev)}</b> ({pct(row.servicesRev, mixTotal)}%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> منتجات: <b className="tabular-nums text-ink">{money(row.productsRev)}</b> ({pct(row.productsRev, mixTotal)}%)</span>
                </div>
              </>
            )}
          </div>

          {/* Payment mix */}
          <div>
            <h4 className="mb-2 text-sm font-bold text-ink">طرق الدفع</h4>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(row.payMix) as PaymentMethod[]).filter((k) => row.payMix[k] > 0).map((k) => {
                const I = PAY_ICONS[k];
                return (
                  <span key={k} className="chip bg-surface-2 text-xs text-ink">
                    <I size={13} className="me-1 text-brand-500" /> {PAY_AR[k]}: <b className="ms-1 tabular-nums">{money(row.payMix[k])}</b>
                  </span>
                );
              })}
              {(Object.values(row.payMix) as number[]).every((v) => v <= 0) && <span className="text-2xs text-ink-subtle">لا مدفوعات مسجلة (بيع آجل).</span>}
            </div>
          </div>

          {/* Biggest ticket */}
          {row.biggest && (
            <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
              <p className="text-2xs text-ink-subtle">أكبر فاتورة في الفترة</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
                <b className="font-display tabular-nums text-ink">{money(row.biggest.total)}</b>
                <span className="text-ink-muted">· {row.biggest.client}</span>
                <span className="text-2xs text-ink-subtle">{dt(row.biggest.when)}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StaffSalesTab({ rows, trend, canProfit, rangeLabel }: {
  rows: StaffSalesRow[]; trend: StaffTrend; canProfit: boolean; rangeLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<StaffSortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sel, setSel] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Colour/rank maps come from the revenue order among NAMED sellers (props order),
  // NOT the table sort — so medals, avatar colours, donut slices and trend series
  // all agree AND never shuffle. Unattributed sales get a fixed neutral.
  const namedRank = useMemo(() => new Map(rows.filter((r) => r.id !== "__none").map((r, i) => [r.id, i])), [rows]);
  const colorOf = (id: string) =>
    id === "__none" ? UNATTRIBUTED_COLOR
      : id === "__other" ? OTHER_COLOR
        : STAFF_COLORS[(namedRank.get(id) ?? 0) % STAFF_COLORS.length];

  const selRow = sel ? rows.find((r) => r.id === sel) ?? null : null;
  // Drop a selection the moment its row leaves the dataset (range/filter change) —
  // otherwise the panel would silently "reopen" if that seller reappears later.
  useEffect(() => {
    if (sel && !rows.some((r) => r.id === sel)) setSel(null);
  }, [rows, sel]);
  useEffect(() => {
    if (sel && panelRef.current) panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return ql ? rows.filter((r) => r.name.toLowerCase().includes(ql) || r.topItem.toLowerCase().includes(ql)) : rows;
  }, [rows, q]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar") * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => ({
    staff: filtered.length,
    invoices: filtered.reduce((s, r) => s + r.invoices, 0),
    revenue: filtered.reduce((s, r) => s + r.revenue, 0),
    profit: filtered.reduce((s, r) => s + r.profit, 0),
  }), [filtered]);

  const setSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k as StaffSortKey); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  // Granular columns — drive the PRINT document and the Excel export.
  const columns: ReportColumn<StaffSalesRow>[] = [
    { key: "name", header: "الموظف / الكاشير", sortKey: "name", cell: (r) => <span className="font-semibold text-ink">{r.name}</span>, printCell: (r) => r.name },
    { key: "invoices", header: "الفواتير", sortKey: "invoices", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.invoices, cell: (r) => <span className="tabular-nums">{formatNum(r.invoices)}</span>, printCell: (r) => formatNum(r.invoices) },
    { key: "units", header: "الأصناف", sortKey: "units", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.units, cell: (r) => <span className="tabular-nums">{formatNum(r.units)}</span>, printCell: (r) => formatNum(r.units) },
    { key: "customers", header: "العملاء", sortKey: "customers", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.customers, cell: (r) => <span className="tabular-nums">{formatNum(r.customers)}</span>, printCell: (r) => formatNum(r.customers) },
    { key: "topItem", header: "الأكثر مبيعاً", cell: (r) => <span>{r.topItem}</span>, printCell: (r) => (r.topItemRev > 0 ? `${r.topItem} (${money(r.topItemRev)})` : r.topItem) },
    { key: "avg", header: "متوسط الفاتورة", sortKey: "avg", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => Math.round(r.avg), cell: (r) => <span className="tabular-nums">{money(r.avg)}</span>, printCell: (r) => money(r.avg) },
    { key: "share", header: "الحصة %", align: "end", numeric: true, numFmt: "#,##0.0", excelValue: (r) => Number(r.share.toFixed(1)), cell: (r) => <span className="tabular-nums">{r.share.toFixed(1)}%</span>, printCell: (r) => `${r.share.toFixed(1)}%` },
    { key: "revenue", header: "إجمالي المبيعات", sortKey: "revenue", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.revenue, cell: (r) => <span className="font-bold tabular-nums">{money(r.revenue)}</span>, printCell: (r) => money(r.revenue) },
  ];
  if (canProfit) columns.push({ key: "profit", header: "صافي الربح", sortKey: "profit", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.profit, cell: (r) => <span className="tabular-nums">{money(r.profit)}</span>, printCell: (r) => money(r.profit) });

  // Composite on-screen columns — 4 rich cells that read like a leaderboard.
  const screenColumns: ReportColumn<StaffSalesRow>[] = [
    {
      key: "name", header: "الموظف / الكاشير", sortKey: "name",
      cell: (r) => {
        const rk = namedRank.get(r.id);
        const medal = rk !== undefined && rk < 3 ? ["🥇", "🥈", "🥉"][rk] : null;
        return (
          <button onClick={() => { playTap(); setSel(r.id); }} className="group flex w-full items-center gap-2.5 text-start">
            <StaffAvatar name={r.name} color={colorOf(r.id)} size={34} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold text-ink transition group-hover:text-brand-600">
                {medal && <span className="shrink-0">{medal}</span>}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-2xs text-ink-subtle"><Eye size={11} className="shrink-0" /> عرض التفاصيل</span>
            </span>
          </button>
        );
      },
    },
    {
      key: "perf", header: "الأداء", sortKey: "invoices",
      cell: (r) => (
        <div className="text-xs leading-relaxed text-ink-muted tabular-nums">
          <p><b className="text-ink">{formatNum(r.invoices)}</b> فاتورة</p>
          <p>{formatNum(r.units)} صنف · {formatNum(r.customers)} عميل</p>
        </div>
      ),
    },
    {
      key: "top", header: "الأكثر مبيعاً",
      cell: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="truncate text-ink" title={r.topItem}>{r.topItem}</p>
          {r.topItemRev > 0 && <p className="text-2xs tabular-nums text-ink-subtle">{money(r.topItemRev)}</p>}
        </div>
      ),
    },
    {
      key: "fin", header: "المالية", align: "end", sortKey: "revenue",
      cell: (r) => (
        <div className="min-w-[130px] text-end">
          <p className="font-display font-extrabold tabular-nums text-ink">{money(r.revenue)}</p>
          <div className="ms-auto mt-1 flex h-1 w-24 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, r.share)}%` }} />
          </div>
          <p className="mt-1 text-2xs tabular-nums text-ink-subtle">
            متوسط {money(r.avg)}
            {canProfit && <> · <span className={r.profit >= 0 ? "text-success-600" : "text-danger-600"}>{money(r.profit)}</span></>}
          </p>
        </div>
      ),
    },
  ];

  const summaryMetrics: SummaryMetric[] = [
    { label: "عدد الموظفين", value: formatNum(totals.staff) },
    { label: "إجمالي الفواتير", value: formatNum(totals.invoices) },
    { label: "إجمالي المبيعات", value: money(totals.revenue) },
    ...(canProfit ? [{ label: "صافي الربح", value: money(totals.profit) }] : []),
  ];

  const hasTrend = trend.keys.length > 0 && trend.series.some((p) => trend.keys.some((k) => ((p[k.id] as number) ?? 0) > 0));

  return (
    <UniversalReportTable<StaffSalesRow>
      title="تقرير مبيعات الموظفين"
      clinicName={getClinicName()}
      dateRangeLabel={rangeLabel}
      columns={columns}
      screenColumns={screenColumns}
      data={sorted}
      rowKey={(r) => r.id}
      summaryMetrics={summaryMetrics}
      sort={{ key: sortKey, dir: sortDir }}
      onSort={setSort}
      emptyText={rows.length === 0 ? "لا توجد مبيعات في هذه الفترة." : "لا يوجد موظف مطابق لبحثك."}
      exportFileName="doctorvet-staff-sales"
      chart={rows.length > 0 ? (
        <div className="space-y-4">
          <StaffPodium rows={rows} colorOf={colorOf} onSelect={setSel} />
          <StaffInsights rows={rows} />
          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2"><Panel title="توزيع حصص المبيعات" icon={Users}><StaffShareDonut rows={rows} colorOf={colorOf} /></Panel></div>
            <div className="xl:col-span-3">
              <Panel title="مبيعات الموظفين عبر الفترة" icon={TrendingUp}>
                {!hasTrend ? <Empty text="لا توجد بيانات في هذه الفترة." /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trend.series} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
                      <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
                      <Tooltip formatter={(v: number) => money(v)} labelStyle={{ color: "#64748b" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      {trend.keys.map((k, i) => (
                        <Bar key={k.id} dataKey={k.id} stackId="rev" name={k.name} maxBarSize={30}
                          fill={colorOf(k.id)}
                          radius={i === trend.keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            </div>
          </div>
          {selRow && (
            <StaffDetailPanel
              row={selRow}
              color={colorOf(selRow.id)}
              canProfit={canProfit}
              onClose={() => setSel(null)}
              panelRef={panelRef}
            />
          )}
        </div>
      ) : undefined}
      toolbar={
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الموظف أو الصنف…" />
        </div>
      }
    />
  );
}

interface LedgerRow {
  id: string; ref: string; when: string; whenMs: number; client: string; staff: string;
  items: string; method: string; total: number; discount: number; profit: number; refunded: boolean;
}
type LedgerSortKey = "when" | "client" | "staff" | "total" | "discount" | "profit";
type LedgerPreset = "today" | "yesterday" | "7d" | "30d" | "custom";

/** Short date with Western numerals — for the active-window chip. */
const shortDate = (ms: number) => (Number.isFinite(ms)
  ? new Date(ms).toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "short", year: "numeric" })
  : "…");

/** The accountant's ledger: its own historical date-range picker drives a chronological
 *  revenue/profit chart over a searchable, sortable, paginated, CSV-exportable table. */
function LedgerTab({ rows, canProfit }: { rows: LedgerRow[]; canProfit: boolean }) {
  // The two native date inputs ARE the source of truth (always visible). Presets simply
  // fill them; editing an input flips the mode to "custom". Default = last 30 days.
  const [from, setFrom] = useState(() => { const s = startOfDay(new Date()); s.setDate(s.getDate() - 29); return localISO(s); });
  const [to, setTo] = useState(() => localISO(new Date()));
  const [activePreset, setActivePreset] = useState<LedgerPreset>("30d");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<LedgerSortKey>("when");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const fromRef = useRef<HTMLInputElement>(null);

  // The active window: 00:00:00 of From → 23:59:59.999 of To (single day when From = To).
  const { loMs, hiMs } = useMemo(() => ({
    loMs: from ? startOfDay(new Date(from + "T00:00:00")).getTime() : -Infinity,
    hiMs: to ? endOfDay(new Date(to + "T00:00:00")).getTime() : Infinity,
  }), [from, to]);

  // Quick presets fill the date inputs; "custom" just opens the native calendar.
  const applyPreset = (p: LedgerPreset) => {
    const now = new Date();
    const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return localISO(d); };
    if (p === "today") { setFrom(localISO(now)); setTo(localISO(now)); }
    else if (p === "yesterday") { setFrom(back(1)); setTo(back(1)); }
    else if (p === "7d") { setFrom(back(6)); setTo(localISO(now)); }
    else if (p === "30d") { setFrom(back(29)); setTo(localISO(now)); }
    setActivePreset(p);
    // Inputs are always mounted, so this runs within the click gesture → the browser
    // calendar opens immediately (where supported), no NotAllowedError.
    if (p === "custom") { try { fromRef.current?.showPicker?.(); } catch { /* unsupported → click the field */ } }
  };
  const openNativePicker = (el: HTMLInputElement) => { try { el.showPicker?.(); } catch { /* ignore */ } };

  // Date-range filter first (drives both the chart and the table).
  const dateFiltered = useMemo(() => rows.filter((r) => r.whenMs >= loMs && r.whenMs <= hiMs), [rows, loMs, hiMs]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return dateFiltered;
    return dateFiltered.filter((r) => r.ref.toLowerCase().includes(ql) || r.client.toLowerCase().includes(ql));
  }, [dateFiltered, q]);

  // Chronological revenue/profit series, rebuilt from the date-filtered rows (excl. refunds):
  // hourly for a single day, otherwise daily. Reacts instantly to the picker.
  const series = useMemo<Series>(() => {
    const spanLo = Number.isFinite(loMs) ? loMs : (dateFiltered.reduce((m, r) => Math.min(m, r.whenMs), Date.now()));
    const spanHi = Number.isFinite(hiMs) ? hiMs : (dateFiltered.reduce((m, r) => Math.max(m, r.whenMs), Date.now()));
    const hourly = (spanHi - spanLo) <= 86400000 * 1.5;
    const buckets = new Map<string, { label: string; gross: number; net: number; order: number }>();
    if (hourly) {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), gross: 0, net: 0, order: h });
    } else {
      const d = startOfDay(new Date(spanLo));
      for (let i = 0; d.getTime() <= spanHi && i < 400; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, gross: 0, net: 0, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    }
    for (const r of dateFiltered) {
      if (r.refunded) continue;
      const dd = new Date(r.whenMs);
      const key = hourly ? String(Math.floor(dd.getHours() / 2) * 2) : localISO(startOfDay(dd));
      const b = buckets.get(key);
      if (b) { b.gross += r.total; b.net += r.profit; }
    }
    return Array.from(buckets.values()).sort((a, b) => a.order - b.order).map((b) => ({ label: b.label, gross: Math.round(b.gross), net: Math.round(b.net) }));
  }, [dateFiltered, loMs, hiMs]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar") * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => ({
    count: filtered.length,
    gross: filtered.reduce((s, r) => s + r.total, 0),
    discount: filtered.reduce((s, r) => s + r.discount, 0),
    profit: filtered.reduce((s, r) => s + r.profit, 0),
  }), [filtered]);

  const setSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k as LedgerSortKey); setSortDir(k === "when" ? "desc" : "asc"); }
  };

  // Column set drives the screen table, the clean print document, AND the Excel export.
  const columns: ReportColumn<LedgerRow>[] = [
    { key: "when", header: "التاريخ والوقت", sortKey: "when", cell: (r) => <span className="text-ink-muted">{dt(r.when)}</span>, printCell: (r) => dt(r.when) },
    { key: "ref", header: "رقم الفاتورة", cell: (r) => <span className="font-mono text-2xs text-ink-subtle">{r.ref}</span>, printCell: (r) => r.ref },
    { key: "client", header: "الزبون", sortKey: "client", cell: (r) => <span className="font-semibold text-ink">{r.client}</span>, printCell: (r) => r.client },
    { key: "staff", header: "الموظف/الكاشير", sortKey: "staff", cell: (r) => <span className="text-ink-muted">{r.staff}</span>, printCell: (r) => r.staff },
    { key: "items", header: "تفاصيل الحركة", cell: (r) => <span className="text-ink-muted">{r.items}</span>, printCell: (r) => r.items },
    { key: "method", header: "طريقة الدفع", cell: (r) => <span className="chip bg-surface-2 text-2xs text-ink-muted">{r.method}</span>, printCell: (r) => r.method },
    { key: "total", header: "الإجمالي", sortKey: "total", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.total, cell: (r) => <span className="font-bold tabular-nums text-ink">{money(r.total)}</span>, printCell: (r) => money(r.total) },
    { key: "discount", header: "الخصم", sortKey: "discount", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.discount, cell: (r) => <span className="tabular-nums text-warn-600">{r.discount > 0 ? `-${money(r.discount)}` : "—"}</span>, printCell: (r) => (r.discount > 0 ? `-${money(r.discount)}` : "—") },
  ];
  if (canProfit) columns.push({ key: "profit", header: "صافي الربح", sortKey: "profit", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.profit, cell: (r) => <span className={cn("font-semibold tabular-nums", r.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(r.profit)}</span>, printCell: (r) => money(r.profit) });

  // Composite (stacked) columns for the ON-SCREEN table — ~5 columns so it fits a tablet
  // with no horizontal scroll. Print + Excel keep the granular columns above.
  const screenColumns: ReportColumn<LedgerRow>[] = [
    {
      key: "when", header: "التاريخ والوقت", sortKey: "when", cell: (r) => {
        const d = new Date(r.when);
        return (
          <div className="whitespace-nowrap leading-tight">
            <div className="text-ink-muted">{Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "short", year: "numeric" })}</div>
            {!Number.isNaN(d.getTime()) && <div className="text-2xs text-ink-subtle">{d.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
          </div>
        );
      },
    },
    {
      key: "who", header: "الزبون / الفاتورة", sortKey: "client", cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{r.client}</p>
          <p className="truncate font-mono text-2xs text-ink-subtle">{r.ref}</p>
        </div>
      ),
    },
    {
      key: "staffpay", header: "الموظف / الدفع", sortKey: "staff", cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink-muted">{r.staff}</p>
          <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">{r.method}</span>
        </div>
      ),
    },
    { key: "items", header: "تفاصيل الحركة", cell: (r) => <span className="block max-w-[180px] truncate text-ink-muted" title={r.items}>{r.items}</span> },
    {
      key: "fin", header: "المالية", align: "end", sortKey: canProfit ? "profit" : "total", cell: (r) => (
        <div className="text-end tabular-nums">
          {canProfit
            ? <p className={cn("font-bold", r.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(r.profit)}</p>
            : <p className="font-bold text-ink">{money(r.total)}</p>}
          <p className="mt-0.5 text-2xs text-ink-subtle">
            {canProfit
              ? <>الإجمالي: {money(r.total)}{r.discount > 0 ? ` · الخصم: ${money(r.discount)}` : ""}</>
              : (r.discount > 0 ? <>الخصم: {money(r.discount)}</> : "—")}
          </p>
        </div>
      ),
    },
  ];

  const summaryMetrics: SummaryMetric[] = [
    { label: "عدد الحركات", value: formatNum(totals.count) },
    { label: "إجمالي المبيعات", value: money(totals.gross) },
    { label: "إجمالي الخصومات", value: money(totals.discount) },
    ...(canProfit ? [{ label: "صافي الربح", value: money(totals.profit) }] : []),
  ];

  const PRESETS: { id: LedgerPreset; label: string }[] = [
    { id: "today", label: "اليوم" }, { id: "yesterday", label: "أمس" },
    { id: "7d", label: "آخر 7 أيام" }, { id: "30d", label: "آخر 30 يوم" },
    { id: "custom", label: "تاريخ مخصص" },
  ];

  return (
    <div className="space-y-5">
      {/* Interactive date-range picker — presets fill the native inputs; editing = custom */}
      <div className="space-y-2.5 rounded-2xl border border-line bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><CalendarRange size={15} className="text-brand-600" /> الفترة الزمنية للسجل</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p.id)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", activePreset === p.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
            من التاريخ
            <input
              ref={fromRef} type="date" dir="ltr" value={from} max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); setActivePreset("custom"); }}
              onClick={(e) => openNativePicker(e.currentTarget)}
              className="input h-9 cursor-pointer py-0 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
            إلى التاريخ
            <input
              type="date" dir="ltr" value={to} min={from || undefined}
              onChange={(e) => { setTo(e.target.value); setActivePreset("custom"); }}
              onClick={(e) => openNativePicker(e.currentTarget)}
              className="input h-9 cursor-pointer py-0 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
          {/* Arabic-formatted range (Western numerals); click to open the start calendar */}
          <button
            type="button" onClick={() => { setActivePreset("custom"); openNativePicker(fromRef.current!); }}
            className="chip ms-auto bg-brand-50 text-2xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
            title="اختر تاريخاً"
          >
            {shortDate(loMs)} — {shortDate(hiMs)}
          </button>
        </div>
      </div>

      {/* The whole log — screen table + clean print document — via the reusable engine */}
      <UniversalReportTable<LedgerRow>
        title="تقرير المبيعات الشامل — سجل الحركات"
        clinicName={getClinicName()}
        dateRangeLabel={`الفترة: ${shortDate(loMs)} — ${shortDate(hiMs)}`}
        columns={columns}
        screenColumns={screenColumns}
        data={sorted}
        rowKey={(r) => r.id}
        isRowMuted={(r) => r.refunded}
        summaryMetrics={summaryMetrics}
        sort={{ key: sortKey, dir: sortDir }}
        onSort={setSort}
        emptyText={rows.length === 0 ? "لا توجد حركات مالية في هذه الفترة." : "لا توجد حركات مطابقة لبحثك."}
        exportFileName="doctorvet-ledger"
        chart={
          <Panel title="المخطط الزمني للإيرادات والأرباح" icon={TrendingUp}>
            {series.length === 0 ? <Empty text="لا توجد بيانات في هذه الفترة." /> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={52} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={52} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
                  <Tooltip formatter={(v: number) => money(v)} labelStyle={{ color: "#64748b" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="gross" name="الإيرادات" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  {canProfit && <Line yAxisId="right" type="monotone" dataKey="net" name="صافي الربح" stroke="#16a34a" strokeWidth={2.5} dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>
        }
        toolbar={
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم الفاتورة أو اسم الزبون…" />
          </div>
        }
      />
    </div>
  );
}

/* ----------------------------- Primitives ----------------------------- */
function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-ink"><Icon size={17} className="text-brand-600" /> {title}</h3>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof BarChart3; label: string; value: string; tone: "brand" | "success" | "warn" }) {
  const toneCls = tone === "success" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
    : tone === "warn" ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
      : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", toneCls)}><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="text-2xs font-semibold text-ink-subtle">{label}</p>
        <p className="font-display text-lg font-extrabold tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="py-8 text-center text-sm text-ink-subtle">{text}</p>;
