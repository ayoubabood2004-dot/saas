import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  AreaChart, Area, Line, ComposedChart, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, Wallet, Banknote, CreditCard, ArrowLeftRight, Receipt, TrendingUp,
  Stethoscope, Package, Trophy, Snail, PawPrint, Lock, Download, FileText, CalendarRange,
  Crown, Star, ShieldAlert, Trash2, LogIn, FlaskConical, Pill, Users, Clock,
  ScrollText, Search, ArrowUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Pet, Invoice, InvoiceItem, Product, MedicalVisit, PaymentMethod, Species, MediaItem, TreatmentEntry, AuditEntry, LoginEvent } from "@/types";
import { repo } from "@/lib/repo";
import { listStaff, type StaffMember } from "@/lib/staff";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast, Skeleton } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";
import { dueOf, isDebt, paidOf } from "@/lib/debt";
import { invoiceNo } from "@/lib/invoicePrint";

/* ============================================================================
 * Reports & Analytics hub (التقارير والإحصائيات) — admin-only, clinic-scoped.
 * All data comes through the existing repo (dual-adapter); every aggregation is
 * memoised so re-renders stay cheap. Money/percentages use Western numerals.
 * ==========================================================================*/

type RangeKey = "today" | "week" | "month" | "custom";
type TabKey = "ops" | "revenue" | "sales" | "ledger" | "top" | "audit" | "clinical";

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

  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState<Pet[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [logins, setLogins] = useState<LoginEvent[]>([]);

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
    (async () => {
      try {
        const [pp, inv, it, pr] = await Promise.all([
          repo.listAllPets(clinicId),
          repo.listInvoices(clinicId),
          repo.listAllInvoiceItems(clinicId),
          repo.listProducts(clinicId),
        ]);
        if (!alive) return;
        setPets(pp); setInvoices(inv); setItems(it); setProducts(pr);
        const petIds = pp.map((p) => p.id);
        // Second wave: clinical + audit datasets for the expanded reports (each guarded).
        const [vis, med, tx, st, au, lg] = await Promise.all([
          repo.listAllVisits(petIds),
          repo.listAllMedia(petIds).catch(() => [] as MediaItem[]),
          repo.listAllTreatments(petIds).catch(() => [] as TreatmentEntry[]),
          listStaff().catch(() => [] as StaffMember[]),
          repo.listAuditLog(clinicId).catch(() => [] as AuditEntry[]),
          repo.listLoginEvents(clinicId).catch(() => [] as LoginEvent[]),
        ]);
        if (!alive) return;
        setVisits(vis); setMedia(med); setTreatments(tx); setStaff(st); setAudit(au); setLogins(lg);
      } catch { /* empty states cover it */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
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
  const ledger = useMemo<LedgerRow[]>(() => invInRange.map((inv) => {
    const its = itemsByInvoice.get(inv.id) ?? [];
    const summary = its.length
      ? its.slice(0, 3).map((it) => (it.qty && it.qty > 1 ? `${it.name}×${formatNum(it.qty)}` : it.name)).join("، ") + (its.length > 3 ? ` +${formatNum(its.length - 3)}` : "")
      : "—";
    const refunded = (inv.status ?? "paid") === "refunded";
    const legs = paymentsOf(inv);
    const method = refunded ? "مُرجعة" : legs.length > 1 ? "دفع مجزأ" : legs.length === 1 ? PAY_AR[legs[0].method] : "آجل";
    return {
      id: inv.id, ref: invoiceNo(inv.id), when: inv.created_at,
      client: (inv.customer_name ?? "").trim() || "عميل نقدي",
      staff: (inv.staff_id && staffById.get(inv.staff_id)) || "—",
      items: summary, method,
      total: inv.total, discount: inv.discount ?? 0, profit: inv.profit ?? 0, refunded,
    };
  }).sort((a, b) => b.when.localeCompare(a.when)), [invInRange, itemsByInvoice, staffById]);

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
          {tab === "ledger" && <LedgerTab rows={ledger} series={series} canProfit={canProfit} />}
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
interface LedgerRow {
  id: string; ref: string; when: string; client: string; staff: string;
  items: string; method: string; total: number; discount: number; profit: number; refunded: boolean;
}
type LedgerSortKey = "when" | "client" | "staff" | "total" | "discount" | "profit";

/** The accountant's ledger: a chronological revenue/profit chart over a searchable,
 *  sortable, paginated, CSV-exportable table of every finalized transaction. */
function LedgerTab({ rows, series, canProfit }: { rows: LedgerRow[]; series: Series; canProfit: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<LedgerSortKey>("when");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const PAGE = 25;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => r.ref.toLowerCase().includes(ql) || r.client.toLowerCase().includes(ql));
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE, safePage * PAGE + PAGE);

  const totals = useMemo(() => ({
    count: filtered.length,
    gross: filtered.reduce((s, r) => s + r.total, 0),
    discount: filtered.reduce((s, r) => s + r.discount, 0),
    profit: filtered.reduce((s, r) => s + r.profit, 0),
  }), [filtered]);

  const setSort = (k: LedgerSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "when" ? "desc" : "asc"); }
    setPage(0);
  };

  const exportCSV = () => {
    const header = ["التاريخ والوقت", "رقم الفاتورة", "الزبون", "الموظف/الكاشير", "تفاصيل الحركة", "طريقة الدفع", "الإجمالي", "الخصم"];
    if (canProfit) header.push("صافي الربح");
    const body = sorted.map((r) => {
      const row = [dt(r.when), r.ref, r.client, r.staff, r.items, r.method, String(Math.round(r.total)), String(Math.round(r.discount))];
      if (canProfit) row.push(String(Math.round(r.profit)));
      return row;
    });
    const csv = "﻿" + [header, ...body].map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `doctorvet-ledger-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير سجل الحركات", "CSV");
  };

  const Th = ({ k, label, end }: { k?: LedgerSortKey; label: string; end?: boolean }) => (
    <th className={cn("whitespace-nowrap px-3 py-2 text-2xs font-bold text-ink-muted", end ? "text-end" : "text-start")}>
      {k ? (
        <button onClick={() => setSort(k)} className="inline-flex items-center gap-1 transition hover:text-brand-600">
          {label}<ArrowUpDown size={11} className={sortKey === k ? "text-brand-600" : "opacity-40"} />
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="space-y-5">
      {/* KPIs for the current filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={Receipt} tone="brand" label="عدد الحركات" value={formatNum(totals.count)} />
        <Kpi icon={Wallet} tone="brand" label="إجمالي المبيعات" value={money(totals.gross)} />
        <Kpi icon={ArrowLeftRight} tone="warn" label="إجمالي الخصومات" value={money(totals.discount)} />
        {canProfit && <Kpi icon={TrendingUp} tone="success" label="صافي الربح" value={money(totals.profit)} />}
      </div>

      {/* Chronological revenue vs profit — dual axis */}
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

      {/* Search + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ابحث برقم الفاتورة أو اسم الزبون…" />
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-xl bg-success-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-success-700"><Download size={15} /> تصدير إلى Excel</button>
      </div>

      {/* The accountant's table */}
      {sorted.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-ink-subtle"><ScrollText size={30} className="mb-2 opacity-40" /> {rows.length === 0 ? "لا توجد حركات مالية في هذه الفترة." : "لا توجد حركات مطابقة لبحثك."}</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-line bg-surface-2">
                <tr>
                  <Th k="when" label="التاريخ والوقت" />
                  <Th label="رقم الفاتورة" />
                  <Th k="client" label="الزبون" />
                  <Th k="staff" label="الموظف/الكاشير" />
                  <Th label="تفاصيل الحركة" />
                  <Th label="طريقة الدفع" />
                  <Th k="total" label="الإجمالي" end />
                  <Th k="discount" label="الخصم" end />
                  {canProfit && <Th k="profit" label="صافي الربح" end />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className={cn("border-b border-line/60 transition hover:bg-surface-2/50", r.refunded && "opacity-60")}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{dt(r.when)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-2xs text-ink-subtle">{r.ref}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{r.client}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{r.staff}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-muted" title={r.items}>{r.items}</td>
                    <td className="whitespace-nowrap px-3 py-2.5"><span className="chip bg-surface-2 text-2xs text-ink-muted">{r.method}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-end font-bold tabular-nums text-ink">{money(r.total)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums text-warn-600">{r.discount > 0 ? `-${money(r.discount)}` : "—"}</td>
                    {canProfit && <td className={cn("whitespace-nowrap px-3 py-2.5 text-end font-semibold tabular-nums", r.profit >= 0 ? "text-success-600" : "text-danger-600")}>{money(r.profit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-subtle">
              <span>عرض {formatNum(safePage * PAGE + 1)}–{formatNum(Math.min(sorted.length, (safePage + 1) * PAGE))} من {formatNum(sorted.length)}</span>
              <div className="flex items-center gap-1">
                <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-muted transition hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
                <span className="px-2 font-semibold text-ink">{formatNum(safePage + 1)} / {formatNum(pageCount)}</span>
                <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-muted transition hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}
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
