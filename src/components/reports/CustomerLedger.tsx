import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Crown, Search, UserRound, Phone, CalendarClock, ShoppingBag, RotateCcw, Wallet,
  Receipt, TrendingUp, BookUser, PackageCheck, Pencil,
} from "lucide-react";
import type { Invoice, InvoiceItem } from "@/types";
import { Modal } from "@/components/Modal";
import { cn, money, formatNum, formatDate } from "@/lib/utils";
import { dueOf, paidOf } from "@/lib/debt";
import { invoiceNo } from "@/lib/invoicePrint";
import { playTap } from "@/lib/sounds";
import { usePermissions } from "@/hooks/usePermissions";
/* محرّر أسطر الفاتورة نفسه الذي يستعمله التوصيل (0110): عكسٌ كامل للمخزون ثم
 * خصمٌ جديد بمعاملة سيرفر واحدة — فالتعديل من دفتر الزبون متزامن مع المخزون
 * والأسعار حرفياً، لا نسخة ثانية من المنطق. */
import { DeliveryEditDialog } from "@/components/retail/DeliveryEditDialog";

/* ============================================================================
 * سجل العملاء (دفتر الزبائن) — تبويب داخل التقارير.
 * لكل زبون دفتر خاص: كل فواتيره، شنو اشترى بالضبط، شنو رجّع، شكد دفع وشكد
 * باقي عليه — والقائمة مرتّبة ليبيّن أكثر زبون يشتري من العيادة.
 * الترتيب يتبع فترة التقارير الموحّدة؛ دفتر الزبون نفسه يعرض تاريخه الكامل.
 * ==========================================================================*/

/** مفتاح هوية الزبون: الهاتف (أرقام فقط) وإلا الاسم — فاتورة بلا أي منهما = زبون عابر. */
const customerKey = (inv: Invoice): string | null => {
  const phone = (inv.customer_phone ?? "").replace(/\D/g, "");
  if (phone) return `p:${phone}`;
  const name = (inv.customer_name ?? "").trim().toLowerCase();
  return name ? `n:${name}` : null;
};

const isRefunded = (inv: Invoice) => (inv.status ?? "paid") === "refunded";

type CustomerRow = {
  key: string;
  name: string;
  phone: string | null;
  /** أرقام الفترة المحددة — تُرتّب بها القائمة. */
  spend: number;      // مشتريات غير مرجعة
  invoices: number;   // فواتير غير مرجعة
  refunds: number;    // فواتير مرجعة
  refundValue: number;
  units: number;
  lastAt: string;
  /** الدين الحالي (كل الوقت — الدين لا يتقيد بالفترة). */
  due: number;
};

export function CustomersTab({ invoices, items, inRange, rangeLabel, canProfit, clinicId, onChanged }: {
  /** كل الفواتير (التاريخ الكامل) — يغذّي دفتر الزبون وديونه. */
  invoices: Invoice[];
  /** كل أسطر الفواتير — «شنو اشترى بالضبط». */
  items: InvoiceItem[];
  /** فواتير الفترة المحددة — تغذّي الترتيب والأرقام أعلاه. */
  inRange: Invoice[];
  rangeLabel: string;
  canProfit: boolean;
  clinicId?: string;
  /** يُستدعى بعد تعديل فاتورة — التقارير تعيد الجلب فتصدق كل الأرقام. */
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // دين كل زبون عبر كل التاريخ (فواتير غير مرجعة وعليها متبقٍّ).
  const dueByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of invoices) {
      const k = customerKey(inv);
      if (!k || isRefunded(inv)) continue;
      const d = dueOf(inv);
      if (d > 0) m.set(k, (m.get(k) ?? 0) + d);
    }
    return m;
  }, [invoices]);

  const { rows, walkIns } = useMemo(() => {
    const m = new Map<string, CustomerRow>();
    let walkIns = 0;
    for (const inv of inRange) {
      const k = customerKey(inv);
      if (!k) { walkIns++; continue; }
      let r = m.get(k);
      if (!r) {
        r = { key: k, name: "", phone: null, spend: 0, invoices: 0, refunds: 0, refundValue: 0, units: 0, lastAt: "", due: dueByKey.get(k) ?? 0 };
        m.set(k, r);
      }
      if (isRefunded(inv)) { r.refunds++; r.refundValue += inv.total; }
      else { r.invoices++; r.spend += inv.total; r.units += inv.item_count || 0; }
      if ((inv.created_at || "") > r.lastAt) {
        r.lastAt = inv.created_at || "";
        if (inv.customer_name?.trim()) r.name = inv.customer_name.trim();
        if (inv.customer_phone?.trim()) r.phone = inv.customer_phone.trim();
      }
      if (!r.name && inv.customer_name?.trim()) r.name = inv.customer_name.trim();
      if (!r.phone && inv.customer_phone?.trim()) r.phone = inv.customer_phone.trim();
    }
    for (const r of m.values()) if (!r.name) r.name = r.phone ?? "—";
    return { rows: [...m.values()].sort((a, b) => (b.spend - a.spend) || b.lastAt.localeCompare(a.lastAt)), walkIns };
  }, [inRange, dueByKey]);

  const totals = useMemo(() => ({
    customers: rows.length,
    spend: rows.reduce((s, r) => s + r.spend, 0),
    due: [...dueByKey.values()].reduce((s, v) => s + v, 0),
  }), [rows, dueByKey]);
  const top = rows[0];

  const ql = q.trim().toLowerCase();
  const shown = ql ? rows.filter((r) => r.name.toLowerCase().includes(ql) || (r.phone ?? "").includes(ql)) : rows;

  return (
    <div className="space-y-4">
      {/* خلاصة الفترة */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={UserRound} tone="brand" label={t("rpt.cust.kCustomers", "زبائن الفترة")} value={formatNum(totals.customers)} />
        <Kpi icon={Crown} tone="warn" label={t("rpt.cust.kTop", "أكثر زبون شراءً")} value={top ? top.name : "—"} sub={top ? money(top.spend) : undefined} />
        <Kpi icon={ShoppingBag} tone="success" label={t("rpt.cust.kSpend", "مشترياتهم بالفترة")} value={money(totals.spend)} />
        <Kpi icon={Wallet} tone={totals.due > 0 ? "danger" : "success"} label={t("rpt.cust.kDue", "ديونهم الحالية")} value={money(totals.due)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rpt.cust.search", "ابحث باسم الزبون أو هاتفه…")} />
        </div>
        <span className="chip bg-surface-2 text-2xs text-ink-muted">{rangeLabel}</span>
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><BookUser size={26} /></span>
          <p className="text-ink-subtle">{rows.length === 0 ? t("rpt.cust.empty", "لا توجد مبيعات باسم زبون في هذه الفترة — الفواتير المسجّلة باسم وهاتف تظهر هنا.") : t("rpt.noMatch", "لا نتائج مطابقة.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const rank = rows.indexOf(r) + 1;
            return (
              <button key={r.key} onClick={() => { playTap(); setOpenKey(r.key); }} className="card flex w-full flex-wrap items-center gap-3 p-3.5 text-start transition hover:shadow-raised">
                <span className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-extrabold tabular-nums",
                  rank === 1 ? "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300"
                    : rank <= 3 ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "bg-surface-2 text-ink-muted",
                )}>
                  {rank === 1 ? <Crown size={18} /> : formatNum(rank)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-ink">{r.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
                    {r.phone && <span className="flex items-center gap-1 font-mono" dir="ltr"><Phone size={11} /> {r.phone}</span>}
                    <span className="flex items-center gap-1"><Receipt size={11} /> {t("rpt.cust.invN", { n: formatNum(r.invoices), defaultValue: "{{n}} فاتورة" })}</span>
                    {r.refunds > 0 && <span className="chip bg-danger-50 text-2xs font-semibold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"><RotateCcw size={10} /> {t("rpt.cust.refN", { n: formatNum(r.refunds), defaultValue: "{{n}} مرجعة" })}</span>}
                    {r.due > 0 && <span className="chip bg-warn-50 text-2xs font-semibold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"><Wallet size={10} /> {t("rpt.cust.dueChip", { v: money(r.due), defaultValue: "دين {{v}}" })}</span>}
                    {r.lastAt && <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(r.lastAt, i18n.language)}</span>}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-base font-extrabold text-ink tabular-nums">{money(r.spend)}</p>
                  <p className="text-2xs text-ink-subtle">{t("rpt.cust.unitsN", { n: formatNum(r.units), defaultValue: "{{n}} قطعة" })}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {walkIns > 0 && (
        <p className="text-center text-2xs text-ink-subtle">{t("rpt.cust.walkIns", { n: formatNum(walkIns), defaultValue: "+{{n}} فاتورة بلا اسم زبون (بيع نقدي عابر) خارج هذا السجل — سجّل اسم الزبون عند البيع ليدخل دفتره." })}</p>
      )}

      <CustomerBookModal
        openKey={openKey}
        invoices={invoices}
        items={items}
        canProfit={canProfit}
        clinicId={clinicId}
        onChanged={onChanged}
        onClose={() => setOpenKey(null)}
      />
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, sub }: { icon: typeof Wallet; tone: "brand" | "success" | "warn" | "danger"; label: string; value: string; sub?: string }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300",
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
    danger: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300",
  } as const;
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="truncate text-2xs font-semibold text-ink-subtle">{label}</p>
        <p className="truncate text-base font-extrabold text-ink tabular-nums">{value}</p>
        {sub && <p className="truncate text-2xs font-bold text-ink-muted tabular-nums">{sub}</p>}
      </div>
    </div>
  );
}

/* ============================================================================
 * دفتر الزبون — تاريخه الكامل (لا يتقيد بفترة التقارير): أرقامه الإجمالية،
 * أكثر شي يشتريه، وكل معاملة معاملة بحالتها (مدفوعة/عليها دين/مرجعة).
 * ==========================================================================*/
function CustomerBookModal({ openKey, invoices, items, canProfit, clinicId, onChanged, onClose }: {
  openKey: string | null; invoices: Invoice[]; items: InvoiceItem[]; canProfit: boolean; clinicId?: string; onChanged?: () => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { can } = usePermissions();
  /* تعديل فاتورة من الدفتر — نفس صلاحية تصحيح الفواتير بشاشة المبيعات. */
  const canEdit = can("deleteInvoices");
  const [editInv, setEditInv] = useState<Invoice | null>(null);

  const book = useMemo(() => {
    if (!openKey) return null;
    const mine = invoices
      .filter((inv) => customerKey(inv) === openKey)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (!mine.length) return null;
    const ids = new Set(mine.map((i) => i.id));
    const myItems = items.filter((it) => ids.has(it.invoice_id));
    const itemsByInv = new Map<string, InvoiceItem[]>();
    for (const it of myItems) { const a = itemsByInv.get(it.invoice_id) ?? []; a.push(it); itemsByInv.set(it.invoice_id, a); }

    const sales = mine.filter((i) => !isRefunded(i));
    const refunds = mine.filter(isRefunded);
    // أكثر المنتجات شراءً — من الفواتير غير المرجعة فقط.
    const saleIds = new Set(sales.map((i) => i.id));
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of myItems) {
      if (!saleIds.has(it.invoice_id)) continue;
      const k = it.name;
      const p = byProduct.get(k) ?? { name: it.name, qty: 0, revenue: 0 };
      p.qty += it.qty || 0;
      p.revenue += it.line_total || 0;
      byProduct.set(k, p);
    }
    const topItems = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const latest = mine[0];
    const name = sales.concat(refunds).map((i) => i.customer_name?.trim()).find(Boolean) ?? "—";
    const phone = sales.concat(refunds).map((i) => i.customer_phone?.trim()).find(Boolean) ?? null;
    return {
      name, phone,
      firstAt: mine[mine.length - 1].created_at,
      lastAt: latest.created_at,
      spend: sales.reduce((s, i) => s + i.total, 0),
      paid: sales.reduce((s, i) => s + paidOf(i), 0),
      due: sales.reduce((s, i) => s + dueOf(i), 0),
      profit: sales.reduce((s, i) => s + (i.profit || 0), 0),
      units: sales.reduce((s, i) => s + (i.item_count || 0), 0),
      refundCount: refunds.length,
      refundValue: refunds.reduce((s, i) => s + i.total, 0),
      invoices: mine, itemsByInv, topItems,
      maxTopRevenue: topItems[0]?.revenue || 1,
    };
  }, [openKey, invoices, items]);

  if (!book) return null;

  return (
    <Modal open={!!openKey} onClose={onClose} size="full" title={t("rpt.cust.bookTitle", { name: book.name, defaultValue: "دفتر الزبون — {{name}}" })}>
      <div className="space-y-4">
        {/* هوية الزبون */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><UserRound size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-ink">{book.name}</p>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
              {book.phone && <span className="flex items-center gap-1 font-mono" dir="ltr"><Phone size={11} /> {book.phone}</span>}
              <span className="flex items-center gap-1"><CalendarClock size={11} /> {t("rpt.cust.since", { d: formatDate(book.firstAt, i18n.language), defaultValue: "زبون منذ {{d}}" })}</span>
              <span>{t("rpt.cust.lastBuy", { d: formatDate(book.lastAt, i18n.language), defaultValue: "آخر شراء {{d}}" })}</span>
            </p>
          </div>
        </div>

        {/* أرقامه الإجمالية — كل التاريخ */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <BookStat label={t("rpt.cust.bSpend", "إجمالي مشترياته")} value={money(book.spend)} tone="text-ink" />
          <BookStat label={t("rpt.cust.bPaid", "المدفوع")} value={money(book.paid)} tone="text-success-600 dark:text-success-400" />
          <BookStat label={t("rpt.cust.bDue", "الدين عليه")} value={money(book.due)} tone={book.due > 0 ? "text-danger-600 dark:text-danger-400" : "text-ink"} />
          <BookStat label={t("rpt.cust.bRefunds", "المرتجع")} value={`${money(book.refundValue)} · ${formatNum(book.refundCount)}`} tone="text-ink" />
          {canProfit
            ? <BookStat label={t("rpt.cust.bProfit", "الربح منه")} value={money(book.profit)} tone="text-brand-600 dark:text-brand-300" />
            : <BookStat label={t("rpt.cust.bUnits", "القطع المشتراة")} value={formatNum(book.units)} tone="text-ink" />}
        </div>

        {/* أكثر شي يشتريه */}
        {book.topItems.length > 0 && (
          <div className="rounded-2xl border border-line p-3.5">
            <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-ink"><TrendingUp size={15} className="text-brand-600" /> {t("rpt.cust.topItems", "أكثر ما يشتريه")}</p>
            <div className="space-y-1.5">
              {book.topItems.map((it) => (
                <div key={it.name} className="flex items-center gap-2.5 text-xs">
                  <span className="w-40 truncate font-semibold text-ink sm:w-56">{it.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, Math.round((it.revenue / book.maxTopRevenue) * 100))}%` }} />
                  </span>
                  <span className="w-14 text-end text-ink-muted tabular-nums">×{formatNum(it.qty)}</span>
                  <span className="w-24 text-end font-bold text-ink tabular-nums">{money(it.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* كل المعاملات — فاتورة فاتورة */}
        <div className="overflow-hidden rounded-2xl border border-line">
          <p className="flex items-center gap-1.5 bg-surface-2 p-2.5 text-xs font-bold text-ink-muted"><Receipt size={13} /> {t("rpt.cust.allTx", { n: formatNum(book.invoices.length), defaultValue: "كل المعاملات ({{n}})" })}</p>
          {book.invoices.map((inv) => {
            const its = book.itemsByInv.get(inv.id) ?? [];
            const summary = its.length
              ? its.slice(0, 4).map((it) => (it.qty && it.qty > 1 ? `${it.name}×${formatNum(it.qty)}` : it.name)).join("، ") + (its.length > 4 ? ` +${formatNum(its.length - 4)}` : "")
              : "—";
            const refunded = isRefunded(inv);
            const due = refunded ? 0 : dueOf(inv);
            return (
              <div key={inv.id} className={cn("border-t border-line p-3", refunded && "bg-danger-50/40 dark:bg-danger-500/5")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", refunded ? "bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-300" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300")}>
                    {refunded ? <RotateCcw size={14} /> : <PackageCheck size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-ink">
                      {formatDate(inv.created_at, i18n.language)}
                      <span className="chip bg-surface-2 font-mono text-2xs text-ink-muted">{invoiceNo(inv.id)}</span>
                      {/* صياغة محايدة: الإرجاع قد يكون تصحيح غلط بالكاشير لا بضاعة
                          رجعت فعلاً — الجملة القديمة كانت تتّهم الزبون بلا دليل. */}
                      {refunded && <span className="chip bg-danger-100 text-2xs font-bold text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">{t("rpt.cust.refunded", "مرجعة — أُلغيت واسترجع مخزونها")}</span>}
                      {!refunded && due > 0 && <span className="chip bg-warn-100 text-2xs font-bold text-warn-700 dark:bg-warn-500/20 dark:text-warn-300">{t("rpt.cust.dueChip", { v: money(due), defaultValue: "دين {{v}}" })}</span>}
                    </p>
                    <p className="truncate text-2xs text-ink-subtle">{summary}</p>
                  </div>
                  <div className="text-end">
                    <p className={cn("text-sm font-extrabold tabular-nums", refunded ? "text-danger-600 line-through dark:text-danger-400" : "text-ink")}>{money(inv.total)}</p>
                    {!refunded && due > 0 && <p className="text-2xs text-ink-subtle tabular-nums">{t("rpt.cust.paidOf", { v: money(paidOf(inv)), defaultValue: "دفع {{v}}" })}</p>}
                  </div>
                  {/* تعديل الفاتورة: كمية غلط، صنف زايد، سعر غلط — يتصحّح هنا
                      بمزامنة مخزون كاملة بدل «إرجاع» يلوّث سجل الزبون. */}
                  {!refunded && canEdit && (
                    <button
                      type="button"
                      data-custedit={inv.id}
                      onClick={() => { playTap(); setEditInv(inv); }}
                      title={t("rpt.cust.editInv", "تعديل الفاتورة — المخزون والأسعار تتزامن تلقائياً")}
                      aria-label={t("rpt.cust.editInv", "تعديل الفاتورة — المخزون والأسعار تتزامن تلقائياً")}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editInv && (
        <DeliveryEditDialog
          order={null}
          invoice={editInv}
          courier={null}
          clinicId={clinicId}
          onClose={() => setEditInv(null)}
          onSaved={() => { setEditInv(null); onChanged?.(); }}
        />
      )}
    </Modal>
  );
}

function BookStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line p-3 text-center">
      <p className="text-2xs font-semibold text-ink-subtle">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-extrabold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
