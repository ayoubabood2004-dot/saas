import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  AreaChart, Area, Line, ComposedChart, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, Wallet, Banknote, CreditCard, ArrowLeftRight, Receipt, TrendingUp,
  Stethoscope, Package, Trophy, Snail, PawPrint, Lock, Download, CalendarRange,
  Crown, Star, ShieldAlert, Trash2, LogIn, FlaskConical, Pill, Users, Clock,
  ScrollText, Search, Eye, X, BadgePercent, SlidersHorizontal, ChevronDown,
  ChevronLeft, LayoutDashboard, History,
} from "lucide-react";
import { playTap } from "@/lib/sounds";
import type { Pet, Invoice, InvoiceItem, Product, MedicalVisit, PaymentMethod, Species, MediaItem, TreatmentEntry, AuditEntry, LoginEvent } from "@/types";
import { type StaffMember } from "@/lib/staff";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { loadAnalyticsSnap, analyticsKey, type AnalyticsSnap } from "@/lib/prefetchData";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast, Skeleton } from "@/components/ui";
import { money, formatNum, cn, dateLocale } from "@/lib/utils";
import { dueOf, isDebt, paidOf } from "@/lib/debt";
import { invoiceNo } from "@/lib/invoicePrint";
import { getClinicName } from "@/lib/settings";
import { UniversalReportTable, type ReportColumn, type SummaryMetric } from "@/components/reports/UniversalReportTable";

/* ============================================================================
 * Reports & Analytics hub (التقارير والإحصائيات) — admin-only, clinic-scoped.
 *
 * Interaction model: "answer first, details on demand".
 *  - ONE unified period bar (presets + always-visible inputs + readable window
 *    chip) drives EVERY tab — including the ledger, which used to carry its
 *    own competing picker.
 *  - Advanced, rarely-used filters (shift time window, yesterday comparison)
 *    live behind a collapsible "advanced options" button that shows a count
 *    badge whenever something in it is active — never an invisible filter.
 *  - The default tab is an Overview that answers the daily questions (sales,
 *    profit, transactions, debts) with zero clicks, then offers labeled
 *    report cards that jump into the detailed tabs.
 *  - Tab labels are never reduced to bare icons: on narrow screens the strip
 *    scrolls horizontally instead of dropping text.
 *
 * All data comes through the existing repo (dual-adapter); every aggregation
 * is memoised so re-renders stay cheap. Money/percentages use Western
 * numerals; every string is bilingual via i18n.
 * ==========================================================================*/

type RangeKey = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
type TabKey = "overview" | "money" | "ledger" | "staff" | "best" | "clinical" | "audit";

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

/** Lab/imaging media kinds counted in the clinical report. */
const CLINICAL_MEDIA_KINDS = ["lab", "xray", "ultrasound"] as const;

const PIE = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2", "#7c3aed", "#64748b"];
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
const isAr = () => i18next.language === "ar";
/** minutes-of-day → "h:mm ص/م" (12-hour, Western numerals) — for shift labels. */
const fmtMins = (mins: number) => {
  const h = Math.floor(mins / 60) % 24; const mi = mins % 60;
  const period = h < 12 ? (isAr() ? "ص" : "AM") : (isAr() ? "م" : "PM");
  const h12 = h % 12 || 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${period}`;
};
/** Whole-hour 12-hour label for chart axes (e.g. "8 ص", "2 م"). */
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? (isAr() ? "ص" : "AM") : (isAr() ? "م" : "PM")}`;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Date-time in 12-hour clock with Western numerals — audit/login logs & tickets. */
const dt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString(dateLocale(), { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};
/** Short date with Western numerals — for the active-window chip. */
const shortDate = (ms: number) => (Number.isFinite(ms)
  ? new Date(ms).toLocaleDateString(dateLocale(), { day: "2-digit", month: "short", year: "numeric" })
  : "…");

export function AnalyticsHub() {
  const { t } = useTranslation();
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

  // ---- Unified period: the two date inputs ARE the source of truth (always filled).
  //      Presets simply fill them; editing an input flips the preset to "custom".
  const [from, setFrom] = useState(() => localISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => localISO(new Date()));
  const [preset, setPreset] = useState<RangeKey>("month");
  const fromRef = useRef<HTMLInputElement>(null);

  // ---- Advanced options (collapsed by default; badge shows how many are active).
  const [advOpen, setAdvOpen] = useState(false);
  // Shift-based reporting: an optional time-of-day window (HH:mm) applied on top of
  // the date range. Blank = inactive. Local wall-clock is used consistently so the
  // window means the same thing regardless of the stored timestamp's UTC offset.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Optional yesterday comparison — adds a "yesterday's numbers" strip to المال tab.
  const [compareYesterday, setCompareYesterday] = useState(false);

  const [tab, setTab] = useState<TabKey>("overview");

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

  const applyPreset = (p: RangeKey) => {
    playTap();
    const now = new Date();
    const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return localISO(d); };
    if (p === "today") { setFrom(localISO(now)); setTo(localISO(now)); }
    else if (p === "yesterday") { setFrom(back(1)); setTo(back(1)); }
    else if (p === "week") { setFrom(back(6)); setTo(localISO(now)); }
    else if (p === "month") { setFrom(localISO(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(localISO(now)); }
    else if (p === "lastMonth") {
      setFrom(localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setTo(localISO(new Date(now.getFullYear(), now.getMonth(), 0)));
    }
    setPreset(p);
    // Inputs are always mounted, so this runs within the click gesture → the browser
    // calendar opens immediately (where supported), no NotAllowedError.
    if (p === "custom") { try { fromRef.current?.showPicker?.(); } catch { /* unsupported → click the field */ } }
  };
  const openNativePicker = (el: HTMLInputElement) => { try { el.showPicker?.(); } catch { /* ignore */ } };

  // The active window: 00:00:00 of From → 23:59:59.999 of To (single day when From = To).
  const { lo, hi } = useMemo(() => ({
    lo: startOfDay(new Date(from + "T00:00:00")).getTime(),
    hi: endOfDay(new Date(to + "T00:00:00")).getTime(),
  }), [from, to]);

  // Shift window (minutes-of-day). Blank → null; window inactive when both null.
  const startMin = useMemo(() => parseHM(startTime), [startTime]);
  const endMin = useMemo(() => parseHM(endTime), [endTime]);
  const timeActive = startMin !== null || endMin !== null;
  const advActiveCount = (timeActive ? 1 : 0) + (compareYesterday ? 1 : 0);
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
  const invInRange = useMemo(() => invoices.filter((i) => { const tm = new Date(i.created_at).getTime(); return tm >= lo && tm <= hi && tsOk(i.created_at); }), [invoices, lo, hi, tsOk]);
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
  // The ledger follows the SAME unified period + shift window as every other tab.
  const ledger = useMemo<LedgerRow[]>(() => invInRange.map((inv) => {
    const its = itemsByInvoice.get(inv.id) ?? [];
    const summary = its.length
      ? its.slice(0, 3).map((it) => (it.qty && it.qty > 1 ? `${it.name}×${formatNum(it.qty)}` : it.name)).join("، ") + (its.length > 3 ? ` +${formatNum(its.length - 3)}` : "")
      : "—";
    const refunded = (inv.status ?? "paid") === "refunded";
    const legs = paymentsOf(inv);
    const method = refunded ? t("rpt.pay.refunded", "مُرجعة")
      : legs.length > 1 ? t("rpt.pay.split", "دفع مجزأ")
        : legs.length === 1 ? t(`rpt.pay.${legs[0].method}`, legs[0].method)
          : t("rpt.pay.credit", "آجل");
    return {
      id: inv.id, ref: invoiceNo(inv.id), when: inv.created_at, whenMs: new Date(inv.created_at).getTime(),
      client: (inv.customer_name ?? "").trim() || t("rpt.walkIn", "عميل نقدي"),
      staff: (inv.staff_id && staffById.get(inv.staff_id)) || "—",
      items: summary, method,
      total: inv.total, discount: inv.discount ?? 0, profit: inv.profit ?? 0, refunded,
    };
  }).sort((a, b) => b.whenMs - a.whenMs), [invInRange, itemsByInvoice, staffById, t]);

  // ---- Money: cash-drawer Z-report ----
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

  // Yesterday's numbers (only computed while the comparison is switched on).
  const yesterday = useMemo(() => {
    if (!compareYesterday) return null;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yLo = startOfDay(y).getTime(); const yHi = endOfDay(y).getTime();
    let gross = 0; let tx = 0; let net = 0;
    for (const i of invoices) {
      if ((i.status ?? "paid") === "refunded") continue;
      const tm = new Date(i.created_at).getTime();
      if (tm < yLo || tm > yHi || !tsOk(i.created_at)) continue;
      gross += i.total; tx += 1; net += i.profit ?? 0;
    }
    return { gross, tx, net, dateMs: yLo };
  }, [compareYesterday, invoices, tsOk]);

  // Time series: hourly when the range is a single day, otherwise daily — gross + net.
  const series = useMemo(() => {
    const hourly = (hi - lo) <= 86400000 * 1.5;
    const buckets = new Map<string, { label: string; gross: number; net: number; order: number }>();
    if (hourly) {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), gross: 0, net: 0, order: h });
    } else {
      const d = startOfDay(new Date(lo));
      for (let i = 0; d.getTime() <= hi && i < 400; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, gross: 0, net: 0, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    }
    for (const inv of paid) {
      const dd = new Date(inv.created_at);
      const key = hourly ? String(Math.floor(dd.getHours() / 2) * 2) : localISO(startOfDay(dd));
      const b = buckets.get(key);
      if (b) { b.gross += inv.total; b.net += inv.profit ?? 0; }
    }
    return Array.from(buckets.values()).sort((a, b) => a.order - b.order)
      .map((b) => ({ label: b.label, gross: Math.round(b.gross), net: Math.round(b.net) }));
  }, [paid, lo, hi]);

  const paymentPie = useMemo(() => {
    const m = { cash: 0, card: 0, transfer: 0 } as Record<PaymentMethod, number>;
    for (const i of paid) for (const p of paymentsOf(i)) if (m[p.method] !== undefined) m[p.method] += p.amount;
    return (["cash", "card", "transfer"] as PaymentMethod[]).map((k) => ({ name: t(`rpt.pay.${k}`, k), value: Math.round(m[k]) })).filter((d) => d.value > 0);
  }, [paid, t]);

  // ---- Money: revenue & profit ----
  const revenue = useMemo(() => {
    const gross = paid.reduce((s, i) => s + i.total, 0);
    const cogs = paid.reduce((s, i) => s + (i.cost_total ?? 0), 0);
    const net = paid.reduce((s, i) => s + (i.profit ?? 0), 0);
    let services = 0; let productsRev = 0;
    for (const it of itemsInRange) { if (it.product_id) productsRev += it.line_total; else services += it.line_total; }
    return { gross, cogs, net, margin: pct(net, gross), services, products: productsRev };
  }, [paid, itemsInRange]);

  const categoryData = useMemo(() => [
    { name: t("rpt.catProducts", "المنتجات والصيدلية"), value: Math.round(revenue.products) },
    { name: t("rpt.catServices", "الخدمات"), value: Math.round(revenue.services) },
  ].filter((d) => d.value > 0), [revenue, t]);

  const staffPerf = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits) {
      const tm = new Date((v.visit_date || "") + "T00:00:00").getTime();
      if (Number.isNaN(tm) || tm < lo || tm > hi) continue;
      const doc = (v.doctor_name || "").trim() || t("rpt.unassigned", "غير محدد");
      m.set(doc, (m.get(doc) ?? 0) + 1);
    }
    return Array.from(m, ([doctor, count]) => ({ doctor, count })).sort((a, b) => b.count - a.count);
  }, [visits, lo, hi, t]);

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
          id: key, name: key === "__none" ? t("rpt.unassigned", "غير محدد") : (staffById.get(key) || t("rpt.unassigned", "غير محدد")),
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
      if (!a.biggest || inv.total > a.biggest.total) a.biggest = { total: inv.total, client: (inv.customer_name ?? "").trim() || t("rpt.walkIn", "عميل نقدي"), when: inv.created_at };
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
  }, [paid, itemsByInvoice, staffById, t]);

  // Per-seller revenue over time (stacked). Series are keyed by staff ID (never by
  // display name — names can collide); top-4 named sellers get their own series,
  // unattributed sales keep a distinct "غير محدد" series, the rest fold into "أخرى".
  // Granularity adapts: 2h buckets for a single day, daily up to ~6 months, monthly
  // beyond — so long custom ranges aggregate instead of silently dropping days.
  const staffTrend = useMemo<StaffTrend>(() => {
    const named = staffSales.filter((s) => s.id !== "__none");
    const top = named.slice(0, 4);
    const topIds = new Set(top.map((s) => s.id));
    const spanDays = (hi - lo) / 86400000;
    const mode: "hour" | "day" | "month" = spanDays <= 1.5 ? "hour" : spanDays <= 190 ? "day" : "month";
    const buckets = new Map<string, Record<string, number | string>>();
    if (mode === "hour") {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), order: h });
    } else if (mode === "day") {
      const d = startOfDay(new Date(lo));
      for (let i = 0; d.getTime() <= hi && i < 200; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    } else {
      const d = new Date(lo); d.setDate(1); d.setHours(0, 0, 0, 0);
      for (let i = 0; d.getTime() <= hi && i < 60; i++) {
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
    const seriesArr = Array.from(buckets.values()).sort((a, b) => (a.order as number) - (b.order as number));
    const keys = [
      ...top.map((s) => ({ id: s.id, name: s.name })),
      ...(hasOther ? [{ id: "__other", name: t("rpt.others", "أخرى") }] : []),
      ...(hasNone ? [{ id: "__none", name: t("rpt.unassigned", "غير محدد") }] : []),
    ];
    return { series: seriesArr, keys };
  }, [staffSales, paid, lo, hi, t]);

  // ---- Best & sales: movers, species, VIP clients, top services ----
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
      const tm = new Date((v.visit_date || "") + "T00:00:00").getTime();
      if (Number.isNaN(tm) || tm < lo || tm > hi) continue;
      const s = (v.pet_id && sp.get(v.pet_id)) || "other";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m, ([s, count]) => ({ name: t(`pet.species.${s}`, s), count })).sort((a, b) => b.count - a.count);
  }, [visits, pets, lo, hi, t]);

  const topClients = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; total: number; visits: number }>();
    for (const i of paid) {
      const phone = (i.customer_phone ?? "").trim();
      const name = (i.customer_name ?? "").trim();
      if (!phone && !name) continue; // skip anonymous walk-ins
      const key = (phone || name).toLowerCase();
      const cur = m.get(key) ?? { name: name || t("rpt.clientFallback", "عميل"), phone, total: 0, visits: 0 };
      cur.total += i.total; cur.visits += 1;
      if (!cur.name && name) cur.name = name;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [paid, t]);

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

  // ---- Audit & security ----
  const staffByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) if (s.userId) m.set(s.userId, s.name);
    return m;
  }, [staff]);

  const deletedInvoices = useMemo(() => {
    return audit
      .filter((a) => a.entity === "invoices" && a.action === "DELETE")
      .filter((a) => { const tm = new Date(a.created_at).getTime(); return tm >= lo && tm <= hi && tsOk(a.created_at); })
      .map((a) => {
        const d = (a.details ?? {}) as { id?: string; total?: number; customer_name?: string | null; created_at?: string };
        return {
          id: String(a.id),
          invoiceId: d.id ?? a.entity_id ?? "—",
          total: typeof d.total === "number" ? d.total : null,
          customer: (d.customer_name ?? "").trim() || t("rpt.unregisteredClient", "عميل غير مسجّل"),
          by: (a.actor && staffByUser.get(a.actor)) || "—",
          when: a.created_at,
        };
      });
  }, [audit, lo, hi, staffByUser, tsOk, t]);

  const loginsInRange = useMemo(() => {
    return logins
      .filter((l) => { const tm = new Date(l.created_at).getTime(); return tm >= lo && tm <= hi && tsOk(l.created_at); })
      .map((l) => ({ id: String(l.id), who: (l.name ?? "").trim() || (l.email ?? "").trim() || t("rpt.user", "مستخدم"), email: (l.email ?? "").trim(), when: l.created_at }))
      .slice(0, 100);
  }, [logins, lo, hi, tsOk, t]);

  // ---- Clinical & medical ----
  const labXray = useMemo(() => {
    const m = new Map<string, number>();
    for (const md of media) {
      if (!(CLINICAL_MEDIA_KINDS as readonly string[]).includes(md.kind)) continue;
      const tm = new Date(md.created_at).getTime();
      if (Number.isNaN(tm) || tm < lo || tm > hi || !tsOk(md.created_at)) continue;
      m.set(md.kind, (m.get(md.kind) ?? 0) + 1);
    }
    const rows = CLINICAL_MEDIA_KINDS.map((k) => ({ name: t(`rpt.media.${k}`, k), count: m.get(k) ?? 0 }));
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { rows, total };
  }, [media, lo, hi, tsOk, t]);

  const dispensedMeds = useMemo(() => {
    const m = new Map<string, { name: string; count: number; given: number }>();
    for (const tr of treatments) {
      const ts = new Date((tr.day || "") + "T00:00:00").getTime();
      if (Number.isNaN(ts) || ts < lo || ts > hi) continue;
      // Treatments carry their own HH:mm administration time — honor the shift window.
      if (timeActive) { const tm = parseHM(tr.time); if (tm === null || !inWindow(tm)) continue; }
      const key = tr.medication.trim().toLowerCase();
      const cur = m.get(key) ?? { name: tr.medication, count: 0, given: 0 };
      cur.count += 1; if (tr.administered_at) cur.given += 1; m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [treatments, lo, hi, timeActive, inWindow]);

  // ---- CSV export (money tab) — exports exactly the summary that tab shows ----
  const exportCSV = () => {
    const rows: string[][] = [
      [t("rpt.csv.title", "تقرير doctorVet"), new Date().toLocaleDateString("en-GB")],
      [],
      [t("rpt.csv.gross", "إجمالي المبيعات"), String(Math.round(zReport.gross))],
      [t("rpt.csv.net", "صافي الربح"), String(Math.round(revenue.net))],
      [t("rpt.csv.cogs", "تكلفة البضاعة"), String(Math.round(revenue.cogs))],
      [t("rpt.csv.txCount", "عدد العمليات"), String(zReport.txCount)],
      [],
      [t("rpt.csv.method", "طريقة الدفع"), t("rpt.csv.amount", "المبلغ"), t("rpt.csv.txCount", "عدد العمليات")],
      ...(["cash", "card", "transfer"] as PaymentMethod[]).map((k) => [t(`rpt.pay.${k}`, k), String(Math.round(zReport.byMethod[k].total)), String(zReport.byMethod[k].count)]),
      [],
      [t("rpt.csv.topSellers", "الأكثر مبيعاً"), t("rpt.csv.qty", "الكمية"), t("rpt.csv.revenue", "الإيراد")],
      ...movers.top.map((p) => [p.name, String(p.qty), String(Math.round(p.revenue))]),
    ];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `doctorvet-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("rpt.csv.done", "تم تصدير الملف"), "CSV");
    void repo.logClientEvent("report.csv", {}); // activity trail
  };

  const TABS: { id: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: t("rpt.tab.overview", "نظرة عامة"), icon: LayoutDashboard },
    { id: "money", label: t("rpt.tab.money", "المال والصندوق"), icon: Wallet },
    { id: "ledger", label: t("rpt.tab.ledger", "سجل الحركات"), icon: ScrollText },
    { id: "staff", label: t("rpt.tab.staff", "الموظفون"), icon: Users },
    { id: "best", label: t("rpt.tab.best", "الأفضل والمبيعات"), icon: Crown },
    { id: "clinical", label: t("rpt.tab.clinical", "التقارير الطبية"), icon: Stethoscope },
    { id: "audit", label: t("rpt.tab.audit", "المراقبة والنشاط"), icon: ShieldAlert },
  ];
  const RANGES: { id: RangeKey; label: string }[] = [
    { id: "today", label: t("rpt.range.today", "اليوم") },
    { id: "yesterday", label: t("rpt.range.yesterday", "أمس") },
    { id: "week", label: t("rpt.range.week", "هذا الأسبوع") },
    { id: "month", label: t("rpt.range.month", "هذا الشهر") },
    { id: "lastMonth", label: t("rpt.range.lastMonth", "الشهر الماضي") },
    { id: "custom", label: t("rpt.range.custom", "مخصّص") },
  ];

  const rangeLabel = t("rpt.rangeLabel", { from: shortDate(lo), to: shortDate(hi), defaultValue: "الفترة: {{from}} — {{to}}" });

  // Defense-in-depth: the nav link is already gated, but block direct-URL access too.
  if (!can("viewReports")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("rpt.noAccess", "ليس لديك صلاحية الاطّلاع على التقارير. تواصل مع مدير العيادة.")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><BarChart3 size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("rpt.title", "التقارير والإحصائيات")}</h1>
          <p className="text-sm text-ink-subtle">{t("rpt.subtitle", "لوحة تحليلية شاملة لأداء العيادة المالي والتشغيلي.")}</p>
        </div>
      </div>

      {/* Unified period bar — ONE source of truth for every tab */}
      <div className="mb-4 space-y-2.5 rounded-2xl border border-line bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><CalendarRange size={15} className="text-brand-600" /> {t("rpt.period", "الفترة")}</span>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => applyPreset(r.id)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", preset === r.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { playTap(); setAdvOpen((o) => !o); }}
            aria-expanded={advOpen}
            className={cn(
              "ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              advOpen || advActiveCount > 0 ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-surface-2 text-ink-muted hover:text-ink",
            )}
          >
            <SlidersHorizontal size={14} />
            {t("rpt.advanced", "خيارات متقدمة")}
            {advActiveCount > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{formatNum(advActiveCount)}</span>}
            <ChevronDown size={14} className={cn("transition-transform", advOpen && "rotate-180")} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
            {t("rpt.fromDate", "من التاريخ")}
            <input
              ref={fromRef} type="date" dir="ltr" value={from} max={to || undefined}
              onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setPreset("custom"); } }}
              onClick={(e) => openNativePicker(e.currentTarget)}
              className="input h-9 cursor-pointer py-0 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
            {t("rpt.toDate", "إلى التاريخ")}
            <input
              type="date" dir="ltr" value={to} min={from || undefined}
              onChange={(e) => { if (e.target.value) { setTo(e.target.value); setPreset("custom"); } }}
              onClick={(e) => openNativePicker(e.currentTarget)}
              className="input h-9 cursor-pointer py-0 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
          {/* Readable active window (Western numerals); click to open the start calendar */}
          <button
            type="button" onClick={() => { setPreset("custom"); if (fromRef.current) openNativePicker(fromRef.current); }}
            className="chip ms-auto bg-brand-50 text-2xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
            title={t("rpt.pickDate", "اختر تاريخاً")}
          >
            {shortDate(lo)} — {shortDate(hi)}
          </button>
        </div>

        {/* Advanced options — collapsed by default; a badge on the button marks active filters */}
        {advOpen && (
          <div className="space-y-3 rounded-xl border border-dashed border-line bg-surface-2/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Clock size={14} className="text-brand-600" /> {t("rpt.shiftFilter", "تصفية حسب نوبة العمل")}</span>
              <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
                {t("rpt.shiftStart", "وقت البدء")}
                <input type="time" dir="ltr" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input h-8 w-28 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
                {t("rpt.shiftEnd", "وقت الانتهاء")}
                <input type="time" dir="ltr" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input h-8 w-28 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
              </label>
              {timeActive ? (
                <>
                  <span className="chip bg-brand-50 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {t("rpt.shiftWindow", "النافذة")}: {fmtMins(startMin ?? 0)} — {fmtMins(endMin ?? 1439)}
                  </span>
                  <button onClick={() => { setStartTime(""); setEndTime(""); }} className="chip bg-surface-2 text-2xs font-semibold text-ink-muted transition hover:text-danger-600">✕ {t("rpt.shiftClear", "مسح الوقت")}</button>
                </>
              ) : (
                <span className="text-2xs text-ink-subtle">{t("rpt.shiftHint", "اتركه فارغاً لعرض اليوم كاملاً.")}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
              <button
                role="switch" aria-checked={compareYesterday}
                onClick={() => { playTap(); setCompareYesterday((v) => !v); }}
                className="flex items-center gap-2 text-xs font-bold text-ink-muted transition hover:text-ink"
              >
                <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", compareYesterday ? "bg-brand-600" : "border border-line bg-surface-3")}>
                  <span className={cn("absolute start-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", compareYesterday && "translate-x-4 rtl:-translate-x-4")} />
                </span>
                <History size={14} className="text-brand-600" /> {t("rpt.cmpToggle", "مقارنة بيوم أمس")}
              </button>
              <span className="text-2xs text-ink-subtle">{t("rpt.cmpHint", "يعرض شريطاً بأرقام أمس داخل تبويب «المال والصندوق» للمقارنة السريعة.")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs — labels always visible; the strip scrolls sideways on narrow screens */}
      <div className="mb-5 flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              onClick={() => { playTap(); setTab(tb.id); }}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition",
                tab === tb.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink",
              )}
            >
              <Icon size={16} /> <span>{tb.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : (
        <>
          {tab === "overview" && (
            <OverviewTab
              z={zReport} revenue={revenue} receivables={receivables} series={series}
              staffSales={staffSales} movers={movers} topClients={topClients}
              ledgerCount={ledger.length} labXrayTotal={labXray.total} deletedCount={deletedInvoices.length}
              canProfit={canProfit} onGo={(k) => { playTap(); setTab(k); }}
            />
          )}
          {tab === "money" && (
            <MoneyTab
              z={zReport} receivables={receivables} series={series} paymentPie={paymentPie}
              revenue={revenue} categoryData={categoryData} staffPerf={staffPerf}
              canProfit={canProfit} yesterday={yesterday} isToday={preset === "today"} onExportCSV={exportCSV}
            />
          )}
          {tab === "ledger" && <LedgerTab rows={ledger} canProfit={canProfit} loMs={lo} hiMs={hi} rangeLabel={rangeLabel} />}
          {tab === "staff" && <StaffSalesTab rows={staffSales} trend={staffTrend} canProfit={canProfit} rangeLabel={rangeLabel} />}
          {tab === "best" && <BestTab clients={topClients} services={topServices} movers={movers} species={speciesActivity} />}
          {tab === "clinical" && <ClinicalTab labXray={labXray} meds={dispensedMeds} />}
          {tab === "audit" && <AuditTab deleted={deletedInvoices} logins={loginsInRange} />}
        </>
      )}
    </div>
  );
}

/* ----------------------------- Overview (نظرة عامة) ----------------------------- */
interface ZReport { byMethod: Record<PaymentMethod, { total: number; count: number }>; gross: number; pending: number; txCount: number; refundCount: number; refundTotal: number }
type Series = { label: string; gross: number; net: number }[];
interface RevenueSummary { gross: number; cogs: number; net: number; margin: number; services: number; products: number }

function OverviewTab({ z, revenue, receivables, series, staffSales, movers, topClients, ledgerCount, labXrayTotal, deletedCount, canProfit, onGo }: {
  z: ZReport; revenue: RevenueSummary; receivables: Invoice[]; series: Series;
  staffSales: StaffSalesRow[]; movers: { top: { name: string; qty: number; revenue: number }[]; slow: { name: string; qty: number }[] };
  topClients: { name: string; phone: string; total: number; visits: number }[];
  ledgerCount: number; labXrayTotal: number; deletedCount: number;
  canProfit: boolean; onGo: (tab: TabKey) => void;
}) {
  const { t } = useTranslation();
  const debtsDue = receivables.reduce((s, i) => s + dueOf(i), 0);
  const star = staffSales.find((r) => r.id !== "__none") ?? null;
  const topItem = movers.top[0] ?? null;

  // Labeled report cards — each explains itself and shows a live headline number.
  const cards: { id: TabKey; icon: typeof BarChart3; title: string; desc: string; stat: string; sub: string }[] = [
    {
      id: "money", icon: Wallet,
      title: t("rpt.tab.money", "المال والصندوق"),
      desc: t("rpt.card.money", "إغلاق الصندوق، طرق الدفع، الديون، والإيراد مقابل الربح."),
      stat: money(z.gross), sub: t("rpt.cardSub.money", "مبيعات الفترة"),
    },
    {
      id: "ledger", icon: ScrollText,
      title: t("rpt.tab.ledger", "سجل الحركات"),
      desc: t("rpt.card.ledger", "كل فاتورة وحركة مالية — بحث وفرز وطباعة وتصدير."),
      stat: formatNum(ledgerCount), sub: t("rpt.cardSub.ledger", "حركة في الفترة"),
    },
    {
      id: "staff", icon: Users,
      title: t("rpt.tab.staff", "الموظفون"),
      desc: t("rpt.card.staff", "لوحة شرف البائعين وملف أداء كامل لكل موظف."),
      stat: star?.name ?? "—", sub: t("rpt.cardSub.staff", "نجم الفترة"),
    },
    {
      id: "best", icon: Crown,
      title: t("rpt.tab.best", "الأفضل والمبيعات"),
      desc: t("rpt.card.best", "أفضل الزبائن والخدمات، والأصناف الأكثر والأقل مبيعاً."),
      stat: topClients[0]?.name ?? "—", sub: t("rpt.cardSub.best", "أفضل زبون"),
    },
    {
      id: "clinical", icon: Stethoscope,
      title: t("rpt.tab.clinical", "التقارير الطبية"),
      desc: t("rpt.card.clinical", "الأشعة والتحاليل والأدوية المصروفة خلال الفترة."),
      stat: formatNum(labXrayTotal), sub: t("rpt.cardSub.clinical", "فحص وتصوير"),
    },
    {
      id: "audit", icon: ShieldAlert,
      title: t("rpt.tab.audit", "المراقبة والنشاط"),
      desc: t("rpt.card.audit", "سجل أمني: الفواتير المحذوفة وعمليات الدخول."),
      stat: formatNum(deletedCount), sub: t("rpt.cardSub.audit", "فاتورة محذوفة"),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Instant answers — the four questions every manager opens this page to ask */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={TrendingUp} tone="brand" label={t("rpt.kpi.sales", "إجمالي المبيعات")} value={money(z.gross)} />
        <Kpi icon={Receipt} tone="brand" label={t("rpt.kpi.tx", "عدد العمليات")} value={formatNum(z.txCount)} />
        {canProfit && <Kpi icon={Wallet} tone="success" label={t("rpt.kpi.net", { margin: formatNum(revenue.margin), defaultValue: "صافي الربح · {{margin}}%" })} value={money(revenue.net)} />}
        <Kpi icon={BadgePercent} tone="warn" label={t("rpt.kpi.debts", "الديون المعلّقة")} value={money(debtsDue)} />
      </div>

      {/* Sales trend over the period */}
      <Panel title={t("rpt.salesTrend", "حركة المبيعات خلال الفترة")} icon={BarChart3}>
        {series.length === 0 ? <Empty text={t("rpt.emptyPeriod", "لا توجد بيانات في هذه الفترة.")} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gOverview" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
              <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip formatter={(v: number) => money(v)} labelStyle={{ color: "#64748b" }} />
              <Area type="monotone" dataKey="gross" name={t("rpt.seriesSales", "المبيعات")} stroke="#2563eb" strokeWidth={2} fill="url(#gOverview)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {topItem && (
          <p className="mt-2 text-2xs text-ink-subtle">
            ⭐ {t("rpt.topItemLine", { name: topItem.name, n: formatNum(topItem.qty), defaultValue: "الأكثر مبيعاً في الفترة: {{name}} ({{n}} قطعة)" })}
          </p>
        )}
      </Panel>

      {/* Detailed reports — labeled cards that explain where each tab leads */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-extrabold text-ink"><LayoutDashboard size={16} className="text-brand-600" /> {t("rpt.detailedReports", "التقارير التفصيلية")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => onGo(c.id)}
                className="card group flex items-start gap-3 p-4 text-start transition hover:border-brand-300 hover:shadow-raised"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/15 dark:text-brand-300"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-display text-sm font-extrabold text-ink transition group-hover:text-brand-600">
                    <span className="truncate">{c.title}</span>
                    <ChevronLeft size={14} className="shrink-0 text-ink-subtle transition group-hover:text-brand-600 ltr:rotate-180" />
                  </span>
                  <span className="mt-0.5 block text-2xs leading-relaxed text-ink-subtle">{c.desc}</span>
                  <span className="mt-2 flex items-baseline gap-1.5">
                    <span className="truncate font-display text-sm font-extrabold tabular-nums text-ink">{c.stat}</span>
                    <span className="shrink-0 text-2xs text-ink-subtle">{c.sub}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Money (المال والصندوق) ----------------------------- */
/** Signed percentage change vs yesterday — null when yesterday had nothing. */
const deltaPct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function CmpCell({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-3">
      <p className="text-2xs text-ink-subtle">{label}</p>
      <p className="mt-0.5 font-display text-base font-extrabold tabular-nums text-ink">{value}</p>
      {delta !== null && (
        <p className={cn("mt-0.5 text-2xs font-bold tabular-nums", delta > 0 ? "text-success-600" : delta < 0 ? "text-danger-600" : "text-ink-subtle")}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {formatNum(Math.abs(Math.round(delta)))}% {t("rpt.cmpVsYesterday", "عن أمس")}
        </p>
      )}
    </div>
  );
}

function MoneyTab({ z, receivables, series, paymentPie, revenue, categoryData, staffPerf, canProfit, yesterday, isToday, onExportCSV }: {
  z: ZReport; receivables: Invoice[]; series: Series; paymentPie: { name: string; value: number }[];
  revenue: RevenueSummary; categoryData: { name: string; value: number }[];
  staffPerf: { doctor: string; count: number }[];
  canProfit: boolean;
  yesterday: { gross: number; tx: number; net: number; dateMs: number } | null;
  isToday: boolean;
  onExportCSV: () => void;
}) {
  const { t } = useTranslation();
  const methods: PaymentMethod[] = ["cash", "card", "transfer"];
  return (
    <div className="space-y-5">
      {/* KPIs + the tab's own export (exports exactly this summary) */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-3">
          <Kpi icon={TrendingUp} tone="brand" label={t("rpt.kpi.gross", "إجمالي الإيرادات")} value={money(revenue.gross)} />
          {canProfit ? (
            <>
              <Kpi icon={Package} tone="warn" label={t("rpt.kpi.cogs", "تكلفة البضاعة المباعة")} value={money(revenue.cogs)} />
              <Kpi icon={Wallet} tone="success" label={t("rpt.kpi.net", { margin: formatNum(revenue.margin), defaultValue: "صافي الربح · {{margin}}%" })} value={money(revenue.net)} />
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/50 p-4 text-sm text-ink-subtle sm:col-span-2">
              <Lock size={18} /> {t("rpt.profitLocked", "بيانات الأرباح والتكلفة متاحة لمن يملك صلاحية «الاطّلاع على الأرباح».")}
            </div>
          )}
        </div>
        <button onClick={onExportCSV} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2 text-sm font-semibold text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
          <Download size={15} /> {t("rpt.exportCSV", "تصدير CSV")}
        </button>
      </div>

      {/* Yesterday comparison — switched on from the advanced options */}
      {yesterday && (
        <div className="card border-brand-200/60 bg-brand-50/30 p-4 dark:border-brand-500/25 dark:bg-brand-500/10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><History size={15} /></span>
            <h3 className="font-display text-sm font-extrabold text-ink">{t("rpt.cmpTitle", "أرقام يوم أمس")}</h3>
            <span className="chip bg-surface-1 text-2xs font-semibold text-ink-muted">{shortDate(yesterday.dateMs)}</span>
            <span className="ms-auto text-2xs text-ink-subtle">
              {isToday
                ? t("rpt.cmpDeltaOn", "النسب تقارن اليوم الحالي بيوم أمس.")
                : t("rpt.cmpDeltaOff", "اختر «اليوم» من شريط الفترة لعرض نسب المقارنة.")}
            </span>
          </div>
          <div className={cn("grid grid-cols-2 gap-3", canProfit && "sm:grid-cols-3")}>
            <CmpCell label={t("rpt.cmpSales", "مبيعات أمس")} value={money(yesterday.gross)} delta={isToday ? deltaPct(z.gross, yesterday.gross) : null} />
            <CmpCell label={t("rpt.cmpTx", "عمليات أمس")} value={formatNum(yesterday.tx)} delta={isToday ? deltaPct(z.txCount, yesterday.tx) : null} />
            {canProfit && <CmpCell label={t("rpt.cmpNet", "صافي ربح أمس")} value={money(yesterday.net)} delta={isToday ? deltaPct(revenue.net, yesterday.net) : null} />}
          </div>
        </div>
      )}

      {/* Revenue vs net profit over the period */}
      <Panel title={canProfit ? t("rpt.revVsNet", "الإيرادات مقابل صافي الربح") : t("rpt.revOverPeriod", "الإيرادات خلال الفترة")} icon={TrendingUp}>
        {series.length === 0 ? <Empty text={t("rpt.emptyPeriod", "لا توجد بيانات في هذه الفترة.")} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
              <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="gross" name={t("rpt.seriesRevenue", "الإيرادات")} fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={36} />
              {canProfit && <Line type="monotone" dataKey="net" name={t("rpt.seriesNet", "صافي الربح")} stroke="#16a34a" strokeWidth={2.5} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Z-Report */}
        <Panel title={t("rpt.zTitle", "إغلاق الصندوق (Z-Report)")} icon={Wallet}>
          <div className="mb-4 rounded-2xl bg-brand-grad p-4 text-white shadow-soft">
            <p className="text-xs font-semibold opacity-90">{t("rpt.zGross", "إجمالي المبيعات للفترة")}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums">{money(z.gross)}</p>
            <p className="mt-1 text-xs opacity-90">{t("rpt.zTx", { n: formatNum(z.txCount), defaultValue: "{{n}} عملية بيع" })}</p>
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
                    <p className="text-sm font-semibold text-ink">{t(`rpt.pay.${m}`, m)}</p>
                    <p className="text-2xs text-ink-subtle">{t("rpt.methodLine", { n: formatNum(row.count), p: pct(row.total, z.gross), defaultValue: "{{n}} عملية · {{p}}%" })}</p>
                  </div>
                  <p className="font-display font-bold tabular-nums text-ink">{money(row.total)}</p>
                </div>
              );
            })}
            {z.refundCount > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-danger-200 bg-danger-50/50 p-3 text-sm dark:border-danger-500/30 dark:bg-danger-500/10">
                <span className="font-semibold text-danger-700 dark:text-danger-300">{t("rpt.refunds", { n: formatNum(z.refundCount), defaultValue: "مرتجعات ({{n}})" })}</span>
                <span className="font-display font-bold tabular-nums text-danger-700 dark:text-danger-300">− {money(z.refundTotal)}</span>
              </div>
            )}
          </div>
        </Panel>

        {/* Receivables — outstanding credit / debts (سجل الديون) */}
        <Panel title={t("rpt.debtsTitle", "الذمم / الديون الآجلة")} icon={Receipt}>
          {receivables.length === 0 ? (
            <div className="grid place-items-center py-10 text-center">
              <Receipt size={28} className="mb-2 text-ink-subtle/40" />
              <p className="text-sm text-ink-subtle">{t("rpt.debtsEmpty", "لا توجد ديون معلّقة — كل المبيعات مسدّدة بالكامل.")}</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between rounded-xl bg-warn-50 px-3 py-2 text-sm dark:bg-warn-500/10">
                <span className="font-semibold text-warn-700 dark:text-warn-300">{t("rpt.debtsTotal", "إجمالي المتبقّي على العملاء")}</span>
                <span className="font-display font-bold tabular-nums text-warn-700 dark:text-warn-300">{money(receivables.reduce((s, i) => s + dueOf(i), 0))}</span>
              </div>
              <ul className="space-y-1.5">
                {receivables.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{i.customer_name || t("rpt.unregisteredClient", "عميل غير مسجّل")}</p>
                      <p className="text-2xs text-ink-subtle">{t("rpt.paidOfTotal", { paid: money(paidOf(i)), total: money(i.total), defaultValue: "مدفوع {{paid}} من {{total}}" })}</p>
                    </div>
                    <span className="font-display font-bold tabular-nums text-warn-600">{money(dueOf(i))}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("rpt.byCategory", "الإيرادات حسب الفئة")} icon={BarChart3}>
          {categoryData.length === 0 ? <Empty text={t("rpt.emptySales", "لا توجد مبيعات في هذه الفترة.")} /> : (
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

        <Panel title={t("rpt.staffVisits", "أداء الكادر (عدد الزيارات)")} icon={Stethoscope}>
          <p className="mb-2 text-2xs text-ink-subtle">{t("rpt.staffVisitsHint", "يُحتسب بعدد الاستشارات المسجّلة لكل طبيب (الإيراد غير مرتبط بطبيب في النظام).")}</p>
          {staffPerf.length === 0 ? <Empty text={t("rpt.emptyVisits", "لا توجد زيارات مسجّلة في هذه الفترة.")} /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-2xs text-ink-subtle"><th className="pb-2 text-start font-semibold">{t("rpt.doctor", "الطبيب")}</th><th className="pb-2 text-end font-semibold">{t("rpt.visits", "الزيارات")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {staffPerf.map((s) => (
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

/* ----------------------------- Best & sales (الأفضل والمبيعات) ----------------------------- */
function BestTab({ clients, services, movers, species }: {
  clients: { name: string; phone: string; total: number; visits: number }[];
  services: { name: string; count: number; revenue: number }[];
  movers: { top: { name: string; qty: number; revenue: number }[]; slow: { name: string; qty: number }[] };
  species: { name: string; count: number }[];
}) {
  const { t } = useTranslation();
  const maxSvc = services[0]?.count || 1;
  const maxQty = movers.top[0]?.qty ?? 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("rpt.topClients", "أفضل 10 زبائن (الأعلى إنفاقاً)")} icon={Crown}>
          {clients.length === 0 ? <Empty text={t("rpt.emptyClients", "لا توجد مبيعات لعملاء مسجّلين في هذه الفترة.")} /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-2xs text-ink-subtle">
                <th className="pb-2 text-start font-semibold">#</th>
                <th className="pb-2 text-start font-semibold">{t("rpt.client", "الزبون")}</th>
                <th className="pb-2 text-center font-semibold">{t("rpt.visits", "الزيارات")}</th>
                <th className="pb-2 text-end font-semibold">{t("rpt.totalSpend", "إجمالي الإنفاق")}</th>
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

        <Panel title={t("rpt.topServices", "أفضل 10 خدمات (الأكثر طلباً)")} icon={Star}>
          {services.length === 0 ? <Empty text={t("rpt.emptyServices", "لا توجد خدمات مفوترة في هذه الفترة.")} /> : (
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("rpt.topMovers", "الأكثر مبيعاً")} icon={Trophy}>
          {movers.top.length === 0 ? <Empty text={t("rpt.emptySales", "لا توجد مبيعات في هذه الفترة.")} /> : (
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

        <Panel title={t("rpt.slowMovers", "الأقل مبيعاً")} icon={Snail}>
          {movers.slow.length === 0 ? <Empty text={t("rpt.emptyProducts", "لا توجد منتجات بعد.")} /> : (
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

      <Panel title={t("rpt.speciesActivity", "النشاط حسب نوع الحيوان (عدد الزيارات)")} icon={PawPrint}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rpt.speciesHint", "توزيع الزيارات حسب النوع — المبيعات في النظام غير مرتبطة بنوع الحيوان.")}</p>
        {species.length === 0 ? <Empty text={t("rpt.emptyVisits", "لا توجد زيارات مسجّلة في هذه الفترة.")} /> : (
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

/* ----------------------------- Clinical & Medical (التقارير الطبية) ----------------------------- */
function ClinicalTab({ labXray, meds }: {
  labXray: { rows: { name: string; count: number }[]; total: number };
  meds: { name: string; count: number; given: number }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <Panel title={t("rpt.labTitle", "تقرير الأشعة والتحاليل")} icon={FlaskConical}>
        <div className="grid gap-3 sm:grid-cols-3">
          {labXray.rows.map((r) => (
            <div key={r.name} className="rounded-2xl border border-line bg-surface-1 p-4 text-center">
              <p className="font-display text-3xl font-extrabold tabular-nums text-ink">{formatNum(r.count)}</p>
              <p className="mt-1 text-xs text-ink-muted">{r.name}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-ink-subtle">{t("rpt.labTotal", "الإجمالي خلال الفترة")}: <span className="font-bold tabular-nums text-ink">{formatNum(labXray.total)}</span> {t("rpt.labUnit", "طلب")}</p>
      </Panel>

      <Panel title={t("rpt.medsTitle", "تقرير الأدوية المصروفة")} icon={Pill}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rpt.medsHint", "عدد مرات صرف كل دواء خلال الفترة، وكم منها أُعطي فعلاً (مقابل المُخطّط).")}</p>
        {meds.length === 0 ? <Empty text={t("rpt.emptyMeds", "لا توجد أدوية مصروفة في هذه الفترة.")} /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-2xs text-ink-subtle">
              <th className="pb-2 text-start font-semibold">{t("rpt.medName", "الدواء")}</th>
              <th className="pb-2 text-center font-semibold">{t("rpt.medCount", "عدد مرات الصرف")}</th>
              <th className="pb-2 text-end font-semibold">{t("rpt.medGiven", "منها أُعطيت فعلاً")}</th>
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

/* ----------------------------- Audit & Security (المراقبة والنشاط) ----------------------------- */
function AuditTab({ deleted, logins }: {
  deleted: { id: string; invoiceId: string; total: number | null; customer: string; by: string; when: string }[];
  logins: { id: string; who: string; email: string; when: string }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={t("rpt.deletedTitle", "الفواتير المحذوفة")} icon={Trash2}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rpt.deletedHint", "سجلّ أمني بالفواتير التي حُذفت نهائياً ومَن قام بذلك.")}</p>
        {deleted.length === 0 ? <Empty text={t("rpt.emptyDeleted", "لا توجد فواتير محذوفة في هذه الفترة.")} /> : (
          <ul className="space-y-1.5">
            {deleted.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-danger-200 bg-danger-50/40 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{d.customer}{d.total != null ? ` · ${money(d.total)}` : ""}</p>
                  <p className="text-2xs text-ink-subtle">{t("rpt.deletedBy", "بواسطة")} {d.by} · <span dir="ltr">{dt(d.when)}</span></p>
                </div>
                <Trash2 size={15} className="shrink-0 text-danger-500" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("rpt.loginsTitle", "سجلّ دخول المستخدمين")} icon={LogIn}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rpt.loginsHint", "آخر عمليات تسجيل الدخول إلى النظام.")}</p>
        {logins.length === 0 ? <Empty text={t("rpt.emptyLogins", "لا توجد عمليات دخول مسجّلة في هذه الفترة.")} /> : (
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
  const { t } = useTranslation();
  const named = rows.filter((r) => r.id !== "__none").slice(0, 3);
  if (named.length === 0) return null;
  const TONES = [
    { label: t("rpt.place1", "المركز الأول"), medal: "🥇", ring: "border-amber-400/60 ring-1 ring-amber-400/30", grad: "from-amber-400/15", bar: "#f59e0b", order: "order-1 md:order-2", lift: "md:-mt-2" },
    { label: t("rpt.place2", "المركز الثاني"), medal: "🥈", ring: "border-slate-400/50", grad: "from-slate-400/10", bar: "#94a3b8", order: "order-2 md:order-1", lift: "" },
    { label: t("rpt.place3", "المركز الثالث"), medal: "🥉", ring: "border-orange-400/50", grad: "from-orange-400/10", bar: "#fb923c", order: "order-3", lift: "" },
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
              <span>{t("rpt.nInvoices", { n: formatNum(r.invoices), defaultValue: "{{n}} فاتورة" })}</span>·<span>{t("rpt.shareOf", { p: r.share.toFixed(0), defaultValue: "حصة {{p}}%" })}</span>·<span>{t("rpt.nClients", { n: formatNum(r.customers), defaultValue: "{{n}} عميل" })}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.share)}%`, background: tone.bar }} />
            </div>
            {r.topItem !== "—" && <p className="mt-2 truncate text-2xs text-ink-subtle">⭐ {t("rpt.bestSeller", "الأكثر مبيعاً")}: {r.topItem}</p>}
          </button>
        );
      })}
    </div>
  );
}

/** Auto-computed highlights — the "so what?" of the numbers, at a glance. */
function StaffInsights({ rows }: { rows: StaffSalesRow[] }) {
  const { t } = useTranslation();
  const named = rows.filter((r) => r.id !== "__none");
  const star = named[0] ?? rows[0];
  let bigInv: { total: number; client: string; seller: string } | null = null;
  for (const r of rows) if (r.biggest && (!bigInv || r.biggest.total > bigInv.total)) bigInv = { total: r.biggest.total, client: r.biggest.client, seller: r.name };
  let bestItem: { item: string; rev: number; seller: string } | null = null;
  for (const r of rows) if (r.topItemRev > (bestItem?.rev ?? 0)) bestItem = { item: r.topItem, rev: r.topItemRev, seller: r.name };
  const avgKing = named.filter((r) => r.invoices >= 2).sort((a, b) => b.avg - a.avg)[0] ?? null;
  const cards = [
    star ? { icon: Crown, tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", title: t("rpt.insStar", "نجم الفترة"), line: star.name, sub: t("rpt.insStarSub", { p: star.share.toFixed(0), defaultValue: "{{p}}% من إجمالي المبيعات" }) } : null,
    bigInv ? { icon: Receipt, tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300", title: t("rpt.insBiggest", "أكبر فاتورة"), line: money(bigInv.total), sub: `${bigInv.seller} · ${bigInv.client}` } : null,
    bestItem && bestItem.rev > 0 ? { icon: Star, tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", title: t("rpt.insBestItem", "أفضل صنف"), line: bestItem.item, sub: `${money(bestItem.rev)} · ${bestItem.seller}` } : null,
    avgKing ? { icon: TrendingUp, tone: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300", title: t("rpt.insAvg", "أعلى متوسط فاتورة"), line: money(avgKing.avg), sub: avgKing.name } : null,
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
  const { t } = useTranslation();
  const named = rows.filter((r) => r.id !== "__none");
  const unattributed = rows.find((r) => r.id === "__none");
  const top = named.slice(0, 5);
  const otherRev = named.slice(5).reduce((s, r) => s + r.revenue, 0);
  const data = [
    ...top.map((r) => ({ id: r.id, name: r.name, value: Math.round(r.revenue), color: colorOf(r.id) })),
    ...(otherRev > 0 ? [{ id: "__other", name: t("rpt.others", "أخرى"), value: Math.round(otherRev), color: OTHER_COLOR }] : []),
    ...(unattributed && unattributed.revenue > 0 ? [{ id: "__none", name: t("rpt.unassigned", "غير محدد"), value: Math.round(unattributed.revenue), color: UNATTRIBUTED_COLOR }] : []),
  ].filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty text={t("rpt.emptyPeriod", "لا توجد بيانات في هذه الفترة.")} />;
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
            <p className="text-2xs text-ink-subtle">{t("rpt.total", "الإجمالي")}</p>
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
  const { t } = useTranslation();
  const maxItem = row.topItems[0]?.revenue || 1;
  const mixTotal = row.servicesRev + row.productsRev;
  const kpis = [
    { icon: Wallet, label: t("rpt.kpi.sales", "إجمالي المبيعات"), value: money(row.revenue) },
    { icon: Receipt, label: t("rpt.colInvoices", "عدد الفواتير"), value: formatNum(row.invoices) },
    { icon: TrendingUp, label: t("rpt.colAvg", "متوسط الفاتورة"), value: money(row.avg) },
    { icon: Users, label: t("rpt.colCustomers", "عدد العملاء"), value: formatNum(row.customers) },
    { icon: Package, label: t("rpt.colUnits", "أصناف مباعة"), value: formatNum(row.units) },
    { icon: BadgePercent, label: t("rpt.colDiscounts", "خصومات ممنوحة"), value: row.discounts > 0 ? money(row.discounts) : "—" },
  ];
  return (
    <div ref={panelRef} className="card animate-fade-in scroll-mt-24 border-brand-300/50 p-4 ring-1 ring-brand-400/20 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <StaffAvatar name={row.name} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold text-ink">{row.name}</p>
          <p className="text-2xs text-ink-muted">
            {t("rpt.shareLine", { p: row.share.toFixed(1), defaultValue: "حصة {{p}}% من مبيعات الفترة" })}{canProfit ? <> · {t("rpt.seriesNet", "صافي الربح")} <b className={cn("tabular-nums", row.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(row.profit)}</b></> : null}
          </p>
        </div>
        <button onClick={() => { playTap(); onClose(); }} aria-label={t("common.close", "إغلاق")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
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
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><Star size={14} className="text-amber-500" /> {t("rpt.bestItems", "أفضل الأصناف مبيعاً")}</h4>
          {row.topItems.length === 0 ? (
            <p className="text-2xs text-ink-subtle">{t("rpt.emptyItems", "لا توجد أصناف مسجلة.")}</p>
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
            <h4 className="mb-2 text-sm font-bold text-ink">{t("rpt.svcVsProd", "الخدمات مقابل المنتجات")}</h4>
            {mixTotal <= 0 ? (
              <p className="text-2xs text-ink-subtle">—</p>
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-sky-500" style={{ width: `${(row.servicesRev / mixTotal) * 100}%` }} />
                  <div className="h-full bg-violet-500" style={{ width: `${(row.productsRev / mixTotal) * 100}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> {t("rpt.services", "خدمات")}: <b className="tabular-nums text-ink">{money(row.servicesRev)}</b> ({pct(row.servicesRev, mixTotal)}%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> {t("rpt.products", "منتجات")}: <b className="tabular-nums text-ink">{money(row.productsRev)}</b> ({pct(row.productsRev, mixTotal)}%)</span>
                </div>
              </>
            )}
          </div>

          {/* Payment mix */}
          <div>
            <h4 className="mb-2 text-sm font-bold text-ink">{t("rpt.payMethods", "طرق الدفع")}</h4>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(row.payMix) as PaymentMethod[]).filter((k) => row.payMix[k] > 0).map((k) => {
                const I = PAY_ICONS[k];
                return (
                  <span key={k} className="chip bg-surface-2 text-xs text-ink">
                    <I size={13} className="me-1 text-brand-500" /> {t(`rpt.pay.${k}`, k)}: <b className="ms-1 tabular-nums">{money(row.payMix[k])}</b>
                  </span>
                );
              })}
              {(Object.values(row.payMix) as number[]).every((v) => v <= 0) && <span className="text-2xs text-ink-subtle">{t("rpt.noPayments", "لا مدفوعات مسجلة (بيع آجل).")}</span>}
            </div>
          </div>

          {/* Biggest ticket */}
          {row.biggest && (
            <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
              <p className="text-2xs text-ink-subtle">{t("rpt.biggestTicket", "أكبر فاتورة في الفترة")}</p>
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
  const { t } = useTranslation();
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
      return String(av).localeCompare(String(bv), i18next.language) * dir;
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
    { key: "name", header: t("rpt.colStaff", "الموظف / الكاشير"), sortKey: "name", cell: (r) => <span className="font-semibold text-ink">{r.name}</span>, printCell: (r) => r.name },
    { key: "invoices", header: t("rpt.colInvoicesShort", "الفواتير"), sortKey: "invoices", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.invoices, cell: (r) => <span className="tabular-nums">{formatNum(r.invoices)}</span>, printCell: (r) => formatNum(r.invoices) },
    { key: "units", header: t("rpt.colUnitsShort", "الأصناف"), sortKey: "units", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.units, cell: (r) => <span className="tabular-nums">{formatNum(r.units)}</span>, printCell: (r) => formatNum(r.units) },
    { key: "customers", header: t("rpt.colCustomersShort", "العملاء"), sortKey: "customers", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.customers, cell: (r) => <span className="tabular-nums">{formatNum(r.customers)}</span>, printCell: (r) => formatNum(r.customers) },
    { key: "topItem", header: t("rpt.bestSeller", "الأكثر مبيعاً"), cell: (r) => <span>{r.topItem}</span>, printCell: (r) => (r.topItemRev > 0 ? `${r.topItem} (${money(r.topItemRev)})` : r.topItem) },
    { key: "avg", header: t("rpt.colAvg", "متوسط الفاتورة"), sortKey: "avg", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => Math.round(r.avg), cell: (r) => <span className="tabular-nums">{money(r.avg)}</span>, printCell: (r) => money(r.avg) },
    { key: "share", header: t("rpt.colShare", "الحصة %"), align: "end", numeric: true, numFmt: "#,##0.0", excelValue: (r) => Number(r.share.toFixed(1)), cell: (r) => <span className="tabular-nums">{r.share.toFixed(1)}%</span>, printCell: (r) => `${r.share.toFixed(1)}%` },
    { key: "revenue", header: t("rpt.kpi.sales", "إجمالي المبيعات"), sortKey: "revenue", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.revenue, cell: (r) => <span className="font-bold tabular-nums">{money(r.revenue)}</span>, printCell: (r) => money(r.revenue) },
  ];
  if (canProfit) columns.push({ key: "profit", header: t("rpt.seriesNet", "صافي الربح"), sortKey: "profit", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.profit, cell: (r) => <span className="tabular-nums">{money(r.profit)}</span>, printCell: (r) => money(r.profit) });

  // Composite on-screen columns — 4 rich cells that read like a leaderboard.
  const screenColumns: ReportColumn<StaffSalesRow>[] = [
    {
      key: "name", header: t("rpt.colStaff", "الموظف / الكاشير"), sortKey: "name",
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
              <span className="mt-0.5 flex items-center gap-1 text-2xs text-ink-subtle"><Eye size={11} className="shrink-0" /> {t("rpt.viewDetails", "عرض التفاصيل")}</span>
            </span>
          </button>
        );
      },
    },
    {
      key: "perf", header: t("rpt.colPerf", "الأداء"), sortKey: "invoices",
      cell: (r) => (
        <div className="text-xs leading-relaxed text-ink-muted tabular-nums">
          <p><b className="text-ink">{formatNum(r.invoices)}</b> {t("rpt.invoiceWord", "فاتورة")}</p>
          <p>{formatNum(r.units)} {t("rpt.itemWord", "صنف")} · {formatNum(r.customers)} {t("rpt.clientWord", "عميل")}</p>
        </div>
      ),
    },
    {
      key: "top", header: t("rpt.bestSeller", "الأكثر مبيعاً"),
      cell: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="truncate text-ink" title={r.topItem}>{r.topItem}</p>
          {r.topItemRev > 0 && <p className="text-2xs tabular-nums text-ink-subtle">{money(r.topItemRev)}</p>}
        </div>
      ),
    },
    {
      key: "fin", header: t("rpt.colFin", "المالية"), align: "end", sortKey: "revenue",
      cell: (r) => (
        <div className="min-w-[130px] text-end">
          <p className="font-display font-extrabold tabular-nums text-ink">{money(r.revenue)}</p>
          <div className="ms-auto mt-1 flex h-1 w-24 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, r.share)}%` }} />
          </div>
          <p className="mt-1 text-2xs tabular-nums text-ink-subtle">
            {t("rpt.avgWord", "متوسط")} {money(r.avg)}
            {canProfit && <> · <span className={r.profit >= 0 ? "text-success-600" : "text-danger-600"}>{money(r.profit)}</span></>}
          </p>
        </div>
      ),
    },
  ];

  const summaryMetrics: SummaryMetric[] = [
    { label: t("rpt.sumStaff", "عدد الموظفين"), value: formatNum(totals.staff) },
    { label: t("rpt.sumInvoices", "إجمالي الفواتير"), value: formatNum(totals.invoices) },
    { label: t("rpt.kpi.sales", "إجمالي المبيعات"), value: money(totals.revenue) },
    ...(canProfit ? [{ label: t("rpt.seriesNet", "صافي الربح"), value: money(totals.profit) }] : []),
  ];

  const hasTrend = trend.keys.length > 0 && trend.series.some((p) => trend.keys.some((k) => ((p[k.id] as number) ?? 0) > 0));

  return (
    <UniversalReportTable<StaffSalesRow>
      title={t("rpt.staffReportTitle", "تقرير مبيعات الموظفين")}
      clinicName={getClinicName()}
      dateRangeLabel={rangeLabel}
      columns={columns}
      screenColumns={screenColumns}
      data={sorted}
      rowKey={(r) => r.id}
      summaryMetrics={summaryMetrics}
      sort={{ key: sortKey, dir: sortDir }}
      onSort={setSort}
      emptyText={rows.length === 0 ? t("rpt.emptySales", "لا توجد مبيعات في هذه الفترة.") : t("rpt.noStaffMatch", "لا يوجد موظف مطابق لبحثك.")}
      exportFileName="doctorvet-staff-sales"
      chart={rows.length > 0 ? (
        <div className="space-y-4">
          <StaffPodium rows={rows} colorOf={colorOf} onSelect={setSel} />
          <StaffInsights rows={rows} />
          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2"><Panel title={t("rpt.shareDonut", "توزيع حصص المبيعات")} icon={Users}><StaffShareDonut rows={rows} colorOf={colorOf} /></Panel></div>
            <div className="xl:col-span-3">
              <Panel title={t("rpt.staffOverTime", "مبيعات الموظفين عبر الفترة")} icon={TrendingUp}>
                {!hasTrend ? <Empty text={t("rpt.emptyPeriod", "لا توجد بيانات في هذه الفترة.")} /> : (
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
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rpt.staffSearchPh", "ابحث باسم الموظف أو الصنف…")} />
        </div>
      }
    />
  );
}

/* ----------------------------- Transaction log (سجل الحركات) ----------------------------- */
interface LedgerRow {
  id: string; ref: string; when: string; whenMs: number; client: string; staff: string;
  items: string; method: string; total: number; discount: number; profit: number; refunded: boolean;
}
type LedgerSortKey = "when" | "client" | "staff" | "total" | "discount" | "profit";

/** The accountant's ledger — follows the page's unified period; a chronological
 *  revenue/profit chart over a searchable, sortable, paginated, exportable table. */
function LedgerTab({ rows, canProfit, loMs, hiMs, rangeLabel }: {
  rows: LedgerRow[]; canProfit: boolean; loMs: number; hiMs: number; rangeLabel: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<LedgerSortKey>("when");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => r.ref.toLowerCase().includes(ql) || r.client.toLowerCase().includes(ql));
  }, [rows, q]);

  // Chronological revenue/profit series (excl. refunds): hourly for a single day,
  // otherwise daily. Reacts instantly to the unified period bar.
  const series = useMemo<Series>(() => {
    const hourly = (hiMs - loMs) <= 86400000 * 1.5;
    const buckets = new Map<string, { label: string; gross: number; net: number; order: number }>();
    if (hourly) {
      for (let h = 0; h < 24; h += 2) buckets.set(String(h), { label: hourLabel(h), gross: 0, net: 0, order: h });
    } else {
      const d = startOfDay(new Date(loMs));
      for (let i = 0; d.getTime() <= hiMs && i < 400; i++) {
        buckets.set(localISO(d), { label: `${d.getMonth() + 1}/${d.getDate()}`, gross: 0, net: 0, order: d.getTime() });
        d.setDate(d.getDate() + 1);
      }
    }
    for (const r of rows) {
      if (r.refunded) continue;
      const dd = new Date(r.whenMs);
      const key = hourly ? String(Math.floor(dd.getHours() / 2) * 2) : localISO(startOfDay(dd));
      const b = buckets.get(key);
      if (b) { b.gross += r.total; b.net += r.profit; }
    }
    return Array.from(buckets.values()).sort((a, b) => a.order - b.order).map((b) => ({ label: b.label, gross: Math.round(b.gross), net: Math.round(b.net) }));
  }, [rows, loMs, hiMs]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), i18next.language) * dir;
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
    { key: "when", header: t("rpt.colWhen", "التاريخ والوقت"), sortKey: "when", cell: (r) => <span className="text-ink-muted">{dt(r.when)}</span>, printCell: (r) => dt(r.when) },
    { key: "ref", header: t("rpt.colRef", "رقم الفاتورة"), cell: (r) => <span className="font-mono text-2xs text-ink-subtle">{r.ref}</span>, printCell: (r) => r.ref },
    { key: "client", header: t("rpt.client", "الزبون"), sortKey: "client", cell: (r) => <span className="font-semibold text-ink">{r.client}</span>, printCell: (r) => r.client },
    { key: "staff", header: t("rpt.colStaff", "الموظف / الكاشير"), sortKey: "staff", cell: (r) => <span className="text-ink-muted">{r.staff}</span>, printCell: (r) => r.staff },
    { key: "items", header: t("rpt.colItems", "تفاصيل الحركة"), cell: (r) => <span className="text-ink-muted">{r.items}</span>, printCell: (r) => r.items },
    { key: "method", header: t("rpt.colMethod", "طريقة الدفع"), cell: (r) => <span className="chip bg-surface-2 text-2xs text-ink-muted">{r.method}</span>, printCell: (r) => r.method },
    { key: "total", header: t("rpt.colTotal", "الإجمالي"), sortKey: "total", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.total, cell: (r) => <span className="font-bold tabular-nums text-ink">{money(r.total)}</span>, printCell: (r) => money(r.total) },
    { key: "discount", header: t("rpt.colDiscount", "الخصم"), sortKey: "discount", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.discount, cell: (r) => <span className="tabular-nums text-warn-600">{r.discount > 0 ? `-${money(r.discount)}` : "—"}</span>, printCell: (r) => (r.discount > 0 ? `-${money(r.discount)}` : "—") },
  ];
  if (canProfit) columns.push({ key: "profit", header: t("rpt.seriesNet", "صافي الربح"), sortKey: "profit", align: "end", numeric: true, numFmt: "#,##0", excelValue: (r) => r.profit, cell: (r) => <span className={cn("font-semibold tabular-nums", r.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(r.profit)}</span>, printCell: (r) => money(r.profit) });

  // Composite (stacked) columns for the ON-SCREEN table — ~5 columns so it fits a tablet
  // with no horizontal scroll. Print + Excel keep the granular columns above.
  const screenColumns: ReportColumn<LedgerRow>[] = [
    {
      key: "when", header: t("rpt.colWhen", "التاريخ والوقت"), sortKey: "when", cell: (r) => {
        const d = new Date(r.when);
        return (
          <div className="whitespace-nowrap leading-tight">
            <div className="text-ink-muted">{Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(dateLocale(), { day: "2-digit", month: "short", year: "numeric" })}</div>
            {!Number.isNaN(d.getTime()) && <div className="text-2xs text-ink-subtle">{d.toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
          </div>
        );
      },
    },
    {
      key: "who", header: t("rpt.colWho", "الزبون / الفاتورة"), sortKey: "client", cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{r.client}</p>
          <p className="truncate font-mono text-2xs text-ink-subtle">{r.ref}</p>
        </div>
      ),
    },
    {
      key: "staffpay", header: t("rpt.colStaffPay", "الموظف / الدفع"), sortKey: "staff", cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink-muted">{r.staff}</p>
          <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">{r.method}</span>
        </div>
      ),
    },
    { key: "items", header: t("rpt.colItems", "تفاصيل الحركة"), cell: (r) => <span className="block max-w-[180px] truncate text-ink-muted" title={r.items}>{r.items}</span> },
    {
      key: "fin", header: t("rpt.colFin", "المالية"), align: "end", sortKey: canProfit ? "profit" : "total", cell: (r) => (
        <div className="text-end tabular-nums">
          {canProfit
            ? <p className={cn("font-bold", r.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(r.profit)}</p>
            : <p className="font-bold text-ink">{money(r.total)}</p>}
          <p className="mt-0.5 text-2xs text-ink-subtle">
            {canProfit
              ? <>{t("rpt.colTotal", "الإجمالي")}: {money(r.total)}{r.discount > 0 ? ` · ${t("rpt.colDiscount", "الخصم")}: ${money(r.discount)}` : ""}</>
              : (r.discount > 0 ? <>{t("rpt.colDiscount", "الخصم")}: {money(r.discount)}</> : "—")}
          </p>
        </div>
      ),
    },
  ];

  const summaryMetrics: SummaryMetric[] = [
    { label: t("rpt.sumTx", "عدد الحركات"), value: formatNum(totals.count) },
    { label: t("rpt.kpi.sales", "إجمالي المبيعات"), value: money(totals.gross) },
    { label: t("rpt.sumDiscounts", "إجمالي الخصومات"), value: money(totals.discount) },
    ...(canProfit ? [{ label: t("rpt.seriesNet", "صافي الربح"), value: money(totals.profit) }] : []),
  ];

  return (
    <UniversalReportTable<LedgerRow>
      title={t("rpt.ledgerReportTitle", "تقرير المبيعات الشامل — سجل الحركات")}
      clinicName={getClinicName()}
      dateRangeLabel={rangeLabel}
      columns={columns}
      screenColumns={screenColumns}
      data={sorted}
      rowKey={(r) => r.id}
      isRowMuted={(r) => r.refunded}
      summaryMetrics={summaryMetrics}
      sort={{ key: sortKey, dir: sortDir }}
      onSort={setSort}
      emptyText={rows.length === 0 ? t("rpt.emptyLedger", "لا توجد حركات مالية في هذه الفترة.") : t("rpt.noLedgerMatch", "لا توجد حركات مطابقة لبحثك.")}
      exportFileName="doctorvet-ledger"
      chart={
        <Panel title={t("rpt.ledgerChart", "المخطط الزمني للإيرادات والأرباح")} icon={TrendingUp}>
          {series.length === 0 ? <Empty text={t("rpt.emptyPeriod", "لا توجد بيانات في هذه الفترة.")} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-line" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-subtle" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={52} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={52} stroke="currentColor" className="text-ink-subtle" tickFormatter={(v: number) => formatNum(v)} />
                <Tooltip formatter={(v: number) => money(v)} labelStyle={{ color: "#64748b" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="gross" name={t("rpt.seriesRevenue", "الإيرادات")} fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={34} />
                {canProfit && <Line yAxisId="right" type="monotone" dataKey="net" name={t("rpt.seriesNet", "صافي الربح")} stroke="#16a34a" strokeWidth={2.5} dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>
      }
      toolbar={
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rpt.ledgerSearchPh", "ابحث برقم الفاتورة أو اسم الزبون…")} />
        </div>
      }
    />
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
