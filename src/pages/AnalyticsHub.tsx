import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  BarChart3, Wallet, Banknote, CreditCard, ArrowLeftRight, Receipt, TrendingUp,
  Stethoscope, Package, Trophy, Snail, PawPrint, Lock, Download, FileText, CalendarRange,
} from "lucide-react";
import type { Pet, Invoice, InvoiceItem, Product, MedicalVisit, PaymentMethod, Species } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast, Skeleton } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";

/* ============================================================================
 * Reports & Analytics hub (التقارير والإحصائيات) — admin-only, clinic-scoped.
 * All data comes through the existing repo (dual-adapter); every aggregation is
 * memoised so re-renders stay cheap. Money/percentages use Western numerals.
 * ==========================================================================*/

type RangeKey = "today" | "week" | "month" | "custom";
type TabKey = "ops" | "revenue" | "sales";

const PIE = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2", "#7c3aed", "#64748b"];
const SPECIES_AR: Record<string, string> = { dog: "كلاب", cat: "قطط", horse: "خيول", cow: "أبقار", bird: "طيور", rabbit: "أرانب", other: "أخرى" };
const PAY_AR: Record<PaymentMethod, string> = { cash: "نقداً", card: "بطاقة", transfer: "تحويل" };
const PAY_ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight };

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

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

  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
        const vis = await repo.listAllVisits(pp.map((p) => p.id));
        if (alive) setVisits(vis);
      } catch { /* empty states cover it */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.clinic_id, user?.id]);

  const { lo, hi } = useMemo(() => rangeBounds(range, from, to), [range, from, to]);

  // Invoices in range (and the paid subset used for revenue/profit math).
  const invInRange = useMemo(() => invoices.filter((i) => { const t = new Date(i.created_at).getTime(); return t >= lo && t <= hi; }), [invoices, lo, hi]);
  const paid = useMemo(() => invInRange.filter((i) => (i.status ?? "paid") !== "refunded"), [invInRange]);
  const inRangeInvoiceIds = useMemo(() => new Set(paid.map((i) => i.id)), [paid]);
  const itemsInRange = useMemo(() => items.filter((it) => inRangeInvoiceIds.has(it.invoice_id)), [items, inRangeInvoiceIds]);

  // ---- Module 1: Daily Operations ----
  const zReport = useMemo(() => {
    const byMethod: Record<PaymentMethod, { total: number; count: number }> = {
      cash: { total: 0, count: 0 }, card: { total: 0, count: 0 }, transfer: { total: 0, count: 0 },
    };
    let gross = 0; let pending = 0;
    for (const i of paid) {
      gross += i.total;
      if (i.payment_method && byMethod[i.payment_method]) { byMethod[i.payment_method].total += i.total; byMethod[i.payment_method].count += 1; }
      else pending += i.total;
    }
    const refunds = invInRange.filter((i) => (i.status ?? "paid") === "refunded");
    const refundTotal = refunds.reduce((s, i) => s + i.total, 0);
    return { byMethod, gross, pending, txCount: paid.length, refundCount: refunds.length, refundTotal };
  }, [paid, invInRange]);

  const receivables = useMemo(() => paid.filter((i) => !i.payment_method), [paid]);

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
          {tab === "ops" && <OpsTab z={zReport} receivables={receivables} />}
          {tab === "revenue" && <RevenueTab revenue={revenue} categoryData={categoryData} staff={staffPerf} canProfit={canProfit} />}
          {tab === "sales" && <SalesTab movers={movers} species={speciesActivity} />}
        </>
      )}
    </div>
  );
}

/* ----------------------------- Module 1 ----------------------------- */
interface ZReport { byMethod: Record<PaymentMethod, { total: number; count: number }>; gross: number; pending: number; txCount: number; refundCount: number; refundTotal: number }
function OpsTab({ z, receivables }: { z: ZReport; receivables: Invoice[] }) {
  const methods: PaymentMethod[] = ["cash", "card", "transfer"];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Z-Report */}
      <Panel title="إغلاق الصندوق (Z-Report)" icon={Wallet}>
        <div className="mb-4 rounded-2xl bg-brand-grad p-4 text-white shadow-soft">
          <p className="text-xs font-semibold opacity-90">إجمالي المبيعات للفترة</p>
          <p className="font-display text-3xl font-extrabold tabular-nums">{money(z.gross)}</p>
          <p className="mt-1 text-xs opacity-90">{formatNum(z.txCount)} عملية بيع</p>
        </div>
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

      {/* Receivables */}
      <Panel title="الذمم / الفواتير المعلّقة" icon={Receipt}>
        {receivables.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <Receipt size={28} className="mb-2 text-ink-subtle/40" />
            <p className="text-sm text-ink-subtle">لا توجد فواتير معلّقة — كل المبيعات مدفوعة عند البيع.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {receivables.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{i.customer_name || "عميل غير مسجّل"}</p>
                  <p className="text-2xs text-ink-subtle" dir="ltr">{new Date(i.created_at).toLocaleDateString("en-GB")}</p>
                </div>
                <span className="font-display font-bold tabular-nums text-warn-600">{money(i.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------- Module 2 ----------------------------- */
function RevenueTab({ revenue, categoryData, staff, canProfit }: {
  revenue: { gross: number; cogs: number; net: number; margin: number; services: number; products: number };
  categoryData: { name: string; value: number }[];
  staff: { doctor: string; count: number }[];
  canProfit: boolean;
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
