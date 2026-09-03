import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Bike, Search, Phone, MapPin, Printer, CheckCircle2, Undo2, Send, Users,
  PackageOpen, Wallet, Clock, Plus, Pencil, Archive, X, HandCoins, ReceiptText,
  PencilLine, Repeat2, Building2, Banknote, CreditCard, ArrowLeftRight, History,
} from "lucide-react";
import type { Invoice, Courier, DeliveryOrder, CourierSettlement, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { useBranchState, matchesBranch } from "@/lib/branchStore";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Modal } from "@/components/Modal";
import { DeliveryEditDialog } from "./DeliveryEditDialog";
import { CourierSwapDialog } from "./CourierSwapDialog";
import { Button, Badge, useToast } from "@/components/ui";
import { openDeliverySlip } from "@/lib/deliveryPrint";
import { invoiceNo } from "@/lib/invoicePrint";
import { dueOf, round2 } from "@/lib/debt";
import { cn, formatNum, money, localISO, formatDate, searchable } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

/* ============================================================================
 * DeliveryPanel — التوصيل (الدفع عند الاستلام).
 *
 * The full COD lifecycle on one board:
 *   قيد التجهيز → بالطريق (grouped per courier, with per-courier cash expected
 *   and one-tap bulk settlement) → مستلم / راجع (history).
 *
 * Money truth: an order's cash enters the system ONLY when "استلمنا الفلوس" is
 * tapped — that settles the wrapped invoice via the existing settle machinery
 * (stamped with the actual collection time). A returned order refunds the
 * invoice (pooled-stock-aware restock). No new money paths.
 *
 * شركاتُ التوصيل (0148): الشركةُ تسلّم الزبونَ اليوم وتحاسب بعد حين. فطلبُها
 * يصير «مسلَّماً» بلا نقد، ويبقى مبلغُه **بذمّة الشركة** حتى يُحصَّل — كاملاً
 * أو على دفعات — من بطاقتها هنا، والتحصيلُ يوزَّع على الطلبات الأقدم فالأقدم
 * عبر نفس تسديد الفواتير (courier_settle).
 * ==========================================================================*/

const timeAgo = (iso: string): string => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${formatNum(mins)} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${formatNum(h)} س`;
  return `${formatNum(Math.floor(h / 24))} يوم`;
};

const isCompany = (c?: Courier | null) => c?.kind === "company";

export function DeliveryPanel({ invoices, clinicId, onChanged }: { invoices: Invoice[]; clinicId?: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  // تعديل بنود الفاتورة صار للمدير على الخادم (0113) — والزرّ يتبعه، وإلا
  // ضغطه الموظف فرجع بخطأ صلاحية بلا سبب مفهوم.
  const canEditLines = usePermissions().can("deleteInvoices");
  // Branch lens (multi-branch clinics): the board shows the active branch's
  // orders plus unassigned ones — same rule as the Master calendar.
  const { branches, active: activeBranch } = useBranchState(user?.clinic_id ?? user?.id ?? clinicId);
  const [allOrders, setAllOrders] = useState<DeliveryOrder[]>([]);
  const orders = useMemo(
    () => (activeBranch === "all" || branches.length < 2
      ? allOrders
      : allOrders.filter((o) => matchesBranch(o.branch_id, activeBranch, branches))),
    [allOrders, activeBranch, branches],
  );
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [settlements, setSettlements] = useState<CourierSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [couriersOpen, setCouriersOpen] = useState(false);
  const [assigning, setAssigning] = useState<DeliveryOrder | null>(null);
  // التعديل بعد البيع: الزبون يتصل بعد دقائق ليضيف صنفاً. متاح للطلب قيد
  // التجهيز أو بالطريق فقط — الطلب المستلم سجلٌّ مالي مغلق، وتعديله إرجاعٌ جديد.
  const [editing, setEditing] = useState<DeliveryOrder | null>(null);
  // تبديل السائق: ضغطة غلطٍ بقائمة أسماءٍ متجاورة كانت تكلّف إرجاع الطلب
  // وإعادة بيعه. اسم الحامل ليس رقماً بالحساب، فيُبدَّل وحده بلا مساس بالمال.
  const [swapping, setSwapping] = useState<DeliveryOrder | null>(null);
  /* شركات التوصيل: تحصيلٌ وسجلّ. */
  const [collectFor, setCollectFor] = useState<Courier | null>(null);
  const [ledgerFor, setLedgerFor] = useState<Courier | null>(null);

  const load = async () => {
    try {
      const [o, c] = await Promise.all([repo.listDeliveryOrders(clinicId), repo.listCouriers(clinicId)]);
      setAllOrders(o);
      setCouriers(c);
      // سجلُّ التحصيلات: قاعدةٌ قبل 0148 ترجع خطأً — لا يُسقط اللوحة كلها.
      try { setSettlements(await repo.listCourierSettlements()); } catch { setSettlements([]); }
    } catch { /* keep whatever we had */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicId]);

  const invoiceOf = useMemo(() => {
    const m = new Map(invoices.map((i) => [i.id, i]));
    return (id: string) => m.get(id);
  }, [invoices]);
  const courierOf = (id?: string | null) => (id ? couriers.find((c) => c.id === id) ?? null : null);
  const orderNo = (o: DeliveryOrder) => invoiceNo(o.invoice_id);
  /** ما زال مبلغُ الطلب بذمّة حامله: مسلَّمٌ للزبون ولم يُحصَّل بعد. */
  const uncollected = (o: DeliveryOrder) => o.status === "delivered" && !o.collected_at;
  const orderDue = (o: DeliveryOrder) => { const inv = invoiceOf(o.invoice_id); return inv ? dueOf(inv) : o.cod_amount; };

  /* ---- The three money moves — all built on the proven invoice machinery ---- */
  const deliver = async (o: DeliveryOrder) => {
    if (busyId) return;
    setBusyId(o.id);
    try {
      const c = courierOf(o.courier_id);
      const now = new Date().toISOString();
      if (isCompany(c)) {
        // شركة: وصل للزبون، والفلوس بذمّة الشركة — لا تسديد الآن.
        await repo.updateDeliveryOrder(o.id, { status: "delivered", delivered_at: now, collected_at: null });
        playSuccess();
        toast.success(t("retail.deliveryDoneCompany", { n: money(o.cod_amount), name: c?.name ?? "", defaultValue: "وصل للزبون — {{n}} بذمّة {{name}} تُحصَّل لاحقاً" }));
      } else {
        const inv = invoiceOf(o.invoice_id);
        const due = inv ? dueOf(inv) : o.cod_amount;
        // Settle FIRST (idempotent: due 0 → nothing to add), then flip the order —
        // a failure in between leaves a re-tappable "out" order, never lost money.
        if (due > 0.009) await repo.settleInvoice(o.invoice_id, due, "cash");
        await repo.updateDeliveryOrder(o.id, { status: "delivered", delivered_at: now, collected_at: now });
        playSuccess();
        toast.success(t("retail.deliveryDone", { n: money(o.cod_amount), defaultValue: "تم الاستلام — دخل {{n}} للصندوق" }));
      }
      await load();
      onChanged();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusyId(null); }
  };

  const returnOrder = async (o: DeliveryOrder) => {
    if (busyId) return;
    if (!window.confirm(t("retail.deliveryReturnConfirm", { name: o.customer_name ?? "", defaultValue: "إرجاع طلب \"{{name}}\"؟ الفاتورة ستُلغى والبضاعة ترجع للمخزون." }))) return;
    setBusyId(o.id);
    try {
      await repo.refundInvoice(o.invoice_id);
      await repo.updateDeliveryOrder(o.id, { status: "returned", returned_at: new Date().toISOString() });
      playSuccess();
      await load();
      onChanged();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusyId(null); }
  };

  const dispatch = async (o: DeliveryOrder, courierId: string) => {
    if (busyId) return;
    setBusyId(o.id);
    try {
      await repo.updateDeliveryOrder(o.id, { courier_id: courierId, status: "out", dispatched_at: new Date().toISOString() });
      playSuccess();
      setAssigning(null);
      await load();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusyId(null); }
  };

  /** فتح محرّر الأصناف — بلا الفاتورة نفسها لا معنى للتعديل، فنقولها صراحةً. */
  const openEdit = (o: DeliveryOrder) => {
    playTap();
    if (!invoiceOf(o.invoice_id)) {
      playWarning();
      toast.error(t("retail.dEditNoInvoice", "تعذّر فتح فاتورة هذا الطلب — حدّث الصفحة وأعد المحاولة."));
      return;
    }
    setEditing(o);
  };

  /** Bulk hand-over: the courier came back — settle EVERY order he carries. */
  const settleCourier = async (courierId: string | null, list: DeliveryOrder[]) => {
    const sum = round2(list.reduce((s, o) => s + o.cod_amount, 0));
    const c = courierOf(courierId);
    const cName = c?.name ?? t("retail.deliveryNoCourierShort", "بدون سائق");
    const msg = isCompany(c)
      ? t("retail.deliverAllCompanyConfirm", { name: cName, n: list.length, defaultValue: "تسجيل {{n}} طلبات مع {{name}} مسلَّمة للزبائن؟ المبالغ تبقى بذمّة الشركة حتى التحصيل." })
      : t("retail.deliverySettleAllConfirm", { name: cName, n: list.length, sum: money(sum), defaultValue: "استلام {{sum}} من {{name}} عن {{n}} طلبات وتسجيلها كلها مستلمة؟" });
    if (!window.confirm(msg)) return;
    for (const o of list) await deliver(o);
  };

  /* ---- Derived views ---- */
  const ql = searchable(q.trim());
  const match = (o: DeliveryOrder) =>
    !ql ||
    searchable(o.customer_name ?? "").includes(ql) ||
    (o.customer_phone ?? "").includes(q.trim()) ||
    searchable(o.zone ?? "").includes(ql) ||
    searchable(o.address ?? "").includes(ql) ||
    searchable(courierOf(o.courier_id)?.name ?? "").includes(ql);

  const preparing = orders.filter((o) => o.status === "preparing" && match(o));
  const out = orders.filter((o) => o.status === "out" && match(o));
  const doneList = orders
    .filter((o) => (o.status === "delivered" || o.status === "returned") && match(o))
    .sort((a, b) => (b.delivered_at ?? b.returned_at ?? b.created_at).localeCompare(a.delivered_at ?? a.returned_at ?? a.created_at))
    .slice(0, 20);

  // بالطريق grouped per courier — the reconciliation view.
  const outByCourier = useMemo(() => {
    const m = new Map<string | null, DeliveryOrder[]>();
    for (const o of out) {
      const k = o.courier_id ?? null;
      const arr = m.get(k);
      if (arr) arr.push(o); else m.set(k, [o]);
    }
    return [...m.entries()];
  }, [out]);

  /* شركاتُ التوصيل: كلُّ شركةٍ نشطة، أو مؤرشفة ما زال عليها ذمّة. */
  const companies = useMemo(() => {
    const rows = couriers.filter(isCompany).map((c) => {
      const open = allOrders.filter((o) => o.courier_id === c.id && uncollected(o));
      const owed = round2(open.reduce((s, o) => s + orderDue(o), 0));
      const last = settlements.find((s) => s.courier_id === c.id) ?? null;
      return { c, open, owed, last };
    });
    return rows.filter((r) => r.c.active || r.owed > 0.009).sort((a, b) => b.owed - a.owed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couriers, allOrders, settlements, invoices]);
  const companiesOwed = round2(companies.reduce((s, r) => s + r.owed, 0));

  const inTransit = round2(out.reduce((s, o) => s + o.cod_amount, 0));
  const today = localISO();
  const receivedToday = round2(orders.filter((o) => o.status === "delivered" && (o.collected_at ?? o.delivered_at ?? "").slice(0, 10) === today && !!(o.collected_at ?? true)).reduce((s, o) => s + o.cod_amount, 0));
  const returnedToday = orders.filter((o) => o.status === "returned" && (o.returned_at ?? "").slice(0, 10) === today).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className={cn("grid grid-cols-2 gap-3", companies.length > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <Kpi icon={PackageOpen} tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" label={t("retail.deliveryPreparing", "قيد التجهيز")} value={formatNum(preparing.length)} />
        <Kpi icon={Bike} tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" label={t("retail.deliveryInTransit", "فلوس بالطريق")} value={money(inTransit)} sub={t("retail.deliveryOutCount", { n: out.length, defaultValue: "{{n}} طلب بالطريق" })} />
        {companies.length > 0 && (
          <Kpi icon={Building2} tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" label={t("retail.companiesOwed", "بذمّة الشركات")} value={money(companiesOwed)} />
        )}
        <Kpi icon={HandCoins} tone="bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300" label={t("retail.deliveryReceivedToday", "استُلم اليوم")} value={money(receivedToday)} />
        <Kpi icon={Undo2} tone="bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" label={t("retail.deliveryReturnedToday", "راجع اليوم")} value={formatNum(returnedToday)} />
      </div>

      {/* Search + couriers registry */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("retail.deliverySearchPh", "ابحث: زبون، هاتف، عنوان أو سائق…")} />
        </div>
        <Button variant="secondary" leftIcon={<Users size={16} />} onClick={() => { playTap(); setCouriersOpen(true); }}>{t("retail.couriersBtn", "سجل السواق")}</Button>
      </div>

      {/* شركات التوصيل — الذمّة والتحصيل والسجل */}
      {companies.length > 0 && (
        <section data-companies>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><Building2 size={16} className="text-violet-600" /> {t("retail.companiesTitle", "شركات التوصيل")}</h3>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {companies.map(({ c, open, owed, last }) => (
              <div key={c.id} data-company={c.id} className={cn("card space-y-2 p-3", !c.active && "opacity-70")}>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Building2 size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{c.name} {!c.active && <span className="text-2xs font-normal text-ink-subtle">({t("retail.courierArchived", "مؤرشف")})</span>}</p>
                    {c.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}
                  </div>
                  <div className="text-end">
                    <p className={cn("font-display text-lg font-extrabold tabular-nums", owed > 0.009 ? "text-violet-700 dark:text-violet-300" : "text-ink-subtle")}>{money(owed)}</p>
                    <p className="text-2xs text-ink-subtle">{t("retail.companyOpenN", { n: open.length, defaultValue: "{{n}} طلب بالذمّة" })}</p>
                  </div>
                </div>
                {last && (
                  <p className="text-2xs text-ink-subtle">
                    {t("retail.companyLast", { n: money(last.amount), when: formatDate(last.created_at, i18n.language), defaultValue: "آخر تحصيل {{n}} بتاريخ {{when}}" })}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" data-collectbtn disabled={owed <= 0.009} leftIcon={<HandCoins size={14} />} onClick={() => { playTap(); setCollectFor(c); }}>{t("retail.collectBtn", "تحصيل")}</Button>
                  <Button size="sm" variant="secondary" data-ledgerbtn leftIcon={<History size={14} />} onClick={() => { playTap(); setLedgerFor(c); }}>{t("retail.ledgerBtn", "السجل")}</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="card p-10 text-center text-ink-subtle">{t("common.loading", "جارٍ التحميل…")}</div>
      ) : orders.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-500/15"><Bike size={26} /></span>
          <p className="max-w-md text-ink-subtle">{t("retail.deliveryEmpty", "لا توجد طلبات توصيل بعد. من شاشة البيع اختر «🛵 توصيل» — المخزون ينخصم فوراً، والفلوس تدخل السستم فقط عندما يرجع السائق ويسلّمها.")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* قيد التجهيز */}
          {preparing.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><PackageOpen size={16} className="text-amber-600" /> {t("retail.deliveryPreparing", "قيد التجهيز")} <span className="chip bg-amber-100 text-2xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{formatNum(preparing.length)}</span></h3>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-2.5 lg:grid-cols-2">
                {preparing.map((o) => (
                  <OrderCard key={o.id} o={o} no={orderNo(o)} courier={courierOf(o.courier_id)} busy={busyId === o.id}
                    actions={
                      <>
                        <Button size="sm" leftIcon={<Send size={14} />} onClick={() => { playTap(); setAssigning(o); }}>{t("retail.deliveryDispatch", "إرسال مع سائق")}</Button>
                        {canEditLines && <Button size="sm" variant="secondary" leftIcon={<PencilLine size={14} />} onClick={() => openEdit(o)}>{t("retail.dEditBtn", "تعديل الطلب")}</Button>}
                        <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} onClick={() => returnOrder(o)}>{t("retail.deliveryCancel", "إلغاء الطلب")}</Button>
                      </>
                    } />
                ))}
              </motion.div>
            </section>
          )}

          {/* بالطريق — grouped per courier with bulk settlement */}
          {out.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><Bike size={16} className="text-sky-600" /> {t("retail.deliveryOut", "بالطريق")} <span className="chip bg-sky-100 text-2xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{formatNum(out.length)}</span></h3>
              <div className="space-y-3">
                {outByCourier.map(([cid, list]) => {
                  const c = courierOf(cid);
                  const company = isCompany(c);
                  const sum = round2(list.reduce((s, o) => s + o.cod_amount, 0));
                  return (
                    <div key={cid ?? "none"} className={cn("overflow-hidden rounded-2xl border", company ? "border-violet-200 dark:border-violet-500/30" : "border-sky-200 dark:border-sky-500/30")}>
                      <div className={cn("flex flex-wrap items-center gap-2 px-3.5 py-2.5", company ? "bg-violet-50/70 dark:bg-violet-500/10" : "bg-sky-50/70 dark:bg-sky-500/10")}>
                        <span className={cn("grid h-8 w-8 place-items-center rounded-xl text-white", company ? "bg-violet-600" : "bg-sky-600")}>{company ? <Building2 size={16} /> : <Bike size={16} />}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{c?.name ?? t("retail.deliveryNoCourierShort", "بدون سائق")}</p>
                          {c?.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}
                        </div>
                        <div className="ms-auto flex items-center gap-2">
                          <span className={cn("text-sm font-bold tabular-nums", company ? "text-violet-700 dark:text-violet-300" : "text-sky-700 dark:text-sky-300")}>{money(sum)}</span>
                          <Button size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={() => void settleCourier(cid, list)}>
                            {company
                              ? t("retail.deliverAllCompany", { n: list.length, defaultValue: "وصلت كلها للزبائن ({{n}})" })
                              : t("retail.deliverySettleAll", { n: list.length, defaultValue: "استلام الكل ({{n}})" })}
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 p-2.5 lg:grid-cols-2">
                        {list.map((o) => (
                          <OrderCard key={o.id} o={o} no={orderNo(o)} courier={c} busy={busyId === o.id}
                            actions={
                              <>
                                <Button size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={() => void deliver(o)}>
                                  {company ? t("retail.deliveredToCustomer", "وصل للزبون") : t("retail.deliveryReceived", "استلمنا الفلوس")}
                                </Button>
                                <Button size="sm" variant="secondary" data-cswapbtn leftIcon={<Repeat2 size={14} />} onClick={() => { playTap(); setSwapping(o); }}>{t("retail.swapBtn", "تبديل السائق")}</Button>
                                {canEditLines && <Button size="sm" variant="secondary" leftIcon={<PencilLine size={14} />} onClick={() => openEdit(o)}>{t("retail.dEditBtn", "تعديل الطلب")}</Button>}
                                <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} onClick={() => void returnOrder(o)}>{t("retail.deliveryReturned", "الطلب رجع")}</Button>
                              </>
                            } />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* السجل — delivered / returned */}
          {doneList.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><ReceiptText size={16} className="text-ink-subtle" /> {t("retail.deliveryHistory", "آخر الطلبات المكتملة")}</h3>
              <div className="space-y-1.5">
                {doneList.map((o) => {
                  const c = courierOf(o.courier_id);
                  return (
                    <div key={o.id} className="card flex flex-wrap items-center gap-2.5 p-2.5 text-sm">
                      {o.status === "delivered"
                        ? (uncollected(o)
                          ? <Badge tone="warn"><Building2 size={12} /> {t("retail.owedChip", "بذمّة الشركة")}</Badge>
                          : <Badge tone="success"><CheckCircle2 size={12} /> {t("retail.deliveryStatusDone", "مستلم")}</Badge>)
                        : <Badge tone="danger"><Undo2 size={12} /> {t("retail.deliveryStatusReturned", "راجع")}</Badge>}
                      <span className="font-bold text-ink">{o.customer_name ?? "—"}</span>
                      <span className="text-2xs text-ink-subtle">#{orderNo(o)}</span>
                      {c && <span className="text-2xs text-ink-subtle">{isCompany(c) ? "🏢" : "🛵"} {c.name}</span>}
                      <span className="ms-auto font-bold tabular-nums text-ink-muted">{money(o.cod_amount)}</span>
                      <span className="text-2xs text-ink-subtle"><Clock size={11} className="inline" /> {timeAgo(o.delivered_at ?? o.returned_at ?? o.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Assign courier to a preparing order */}
      {assigning && (
        <Modal open onClose={() => setAssigning(null)} title={t("retail.deliveryPickCourier", "اختر السائق")}>
          <div className="space-y-2">
            {couriers.filter((c) => c.active).length === 0 && (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-subtle">{t("retail.deliveryNoCouriersYet", "لا يوجد سواق بعد — أضفهم من «سجل السواق».")}</p>
            )}
            {couriers.filter((c) => c.active).map((c) => (
              <button key={c.id} onClick={() => void dispatch(assigning, c.id)} disabled={busyId === assigning.id}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-sky-300 hover:bg-surface-2">
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl", isCompany(c) ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300")}>{isCompany(c) ? <Building2 size={18} /> : <Bike size={18} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                  {c.phone && <span className="block text-xs text-ink-subtle" dir="ltr">{c.phone}</span>}
                </span>
                {isCompany(c) && <span className="chip bg-violet-100 text-2xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{t("retail.courierKindCompany", "شركة")}</span>}
              </button>
            ))}
            <Button variant="secondary" className="w-full" leftIcon={<Users size={15} />} onClick={() => { setAssigning(null); setCouriersOpen(true); }}>{t("retail.couriersBtn", "سجل السواق")}</Button>
          </div>
        </Modal>
      )}

      {/* تعديل أصناف طلب قائم — الفاتورة نفسها تُعدَّل ذرّياً بلا إرجاع وإعادة بيع */}
      {editing && invoiceOf(editing.invoice_id) && (
        <DeliveryEditDialog
          order={editing}
          invoice={invoiceOf(editing.invoice_id)!}
          courier={courierOf(editing.courier_id)}
          clinicId={clinicId}
          onClose={() => setEditing(null)}
          onSaved={() => { void load(); onChanged(); }}
        />
      )}

      {/* تبديل سائق طلبٍ خرج — حقلٌ واحد يتغيّر، وما عداه إبلاغٌ وطباعة */}
      {swapping && (
        <CourierSwapDialog
          order={swapping}
          couriers={couriers}
          current={courierOf(swapping.courier_id)}
          onClose={() => setSwapping(null)}
          onSaved={() => { void load(); onChanged(); }}
        />
      )}

      {/* تحصيلٌ من شركة — كامل أو جزئي */}
      {collectFor && (
        <CollectDialog
          courier={collectFor}
          owed={companies.find((r) => r.c.id === collectFor.id)?.owed ?? 0}
          openCount={companies.find((r) => r.c.id === collectFor.id)?.open.length ?? 0}
          onClose={() => setCollectFor(null)}
          onDone={() => { setCollectFor(null); void load(); onChanged(); }}
        />
      )}

      {/* سجلُّ الشركة — الطلبات بالذمّة والتحصيلات */}
      {ledgerFor && (
        <LedgerModal
          courier={ledgerFor}
          open={allOrders.filter((o) => o.courier_id === ledgerFor.id && uncollected(o))}
          dueOfOrder={orderDue}
          orderNo={orderNo}
          settlements={settlements.filter((s) => s.courier_id === ledgerFor.id)}
          onClose={() => setLedgerFor(null)}
          onCollect={() => { const c = ledgerFor; setLedgerFor(null); setCollectFor(c); }}
        />
      )}

      {/* Couriers registry */}
      <CouriersModal open={couriersOpen} couriers={couriers} clinicId={clinicId} onClose={() => setCouriersOpen(false)} onChanged={load} />
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, sub }: { icon: typeof Bike; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone)}><Icon size={18} /></span>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-extrabold leading-tight text-ink tabular-nums">{value}</p>
        <p className="truncate text-2xs text-ink-subtle">{label}{sub ? ` · ${sub}` : ""}</p>
      </div>
    </div>
  );
}

/** One delivery order card — customer, place, amounts, slip print + actions. */
function OrderCard({ o, no, courier, busy, actions }: { o: DeliveryOrder; no: string; courier: Courier | null; busy: boolean; actions: React.ReactNode }) {
  const { t } = useTranslation();
  const collect = round2(o.cod_amount + (o.fee_to_clinic ? 0 : o.delivery_fee));
  const company = isCompany(courier);
  return (
    <motion.div variants={staggerItem} className={cn("card space-y-2 p-3", busy && "opacity-60")}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{o.customer_name ?? "—"}</p>
        <span className="text-2xs text-ink-subtle">#{no}</span>
        <button onClick={() => { playTap(); openDeliverySlip(o, courier, no); }} aria-label={t("retail.deliverySlip", "وصل التوصيل")} title={t("retail.deliverySlip", "وصل التوصيل")}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600">
          <Printer size={15} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        {o.customer_phone && <span className="flex items-center gap-1"><Phone size={12} /> <bdo dir="ltr">{o.customer_phone}</bdo></span>}
        {o.zone && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-2xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">📍 {o.zone}</span>}
        {o.address && <span className="flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0" /> <span className="truncate">{o.address}</span></span>}
        <span className="flex items-center gap-1 text-ink-subtle"><Clock size={11} /> {timeAgo(o.dispatched_at ?? o.created_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-xs">
        <span className={cn("flex items-center gap-1 font-bold", company ? "text-violet-700 dark:text-violet-300" : "text-sky-700 dark:text-sky-300")}>
          <Wallet size={13} /> {company ? t("retail.deliveryCompanyOwes", "بذمّة الشركة للعيادة") : t("retail.deliveryCourierOwes", "يُسلِّم السائق للعيادة")} {money(o.cod_amount)}
        </span>
        {o.delivery_fee > 0 && !o.fee_to_clinic && <span className="text-ink-subtle">{t("retail.deliveryCollectPlusFee", { n: money(collect), defaultValue: "يُحصَّل من الزبون {{n}} (مع الأجرة)" })}</span>}
        {o.prepaid > 0 && <span className="text-success-600">{t("retail.deliveryPrepaidChip", { n: money(o.prepaid), defaultValue: "مقدّم {{n}}" })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </motion.div>
  );
}

/** تحصيلٌ من شركة توصيل: المبلغ كاملاً أو جزءٌ منه، والطريقة، وملاحظة. */
function CollectDialog({ courier, owed, openCount, onClose, onDone }: { courier: Courier; owed: number; openCount: number; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [amount, setAmount] = useState(String(Math.round(owed)));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(amount) || 0;
  const partial = n > 0 && n < owed - 0.009;

  const go = async () => {
    if (busy || n <= 0) return;
    setBusy(true);
    try {
      const r = await repo.settleCourier(courier.id, Math.min(n, owed), method, note);
      playSuccess();
      toast.success(
        r.remaining_owed > 0.009
          ? t("retail.collectDoneRemain", { n: money(r.settled), rest: money(r.remaining_owed), defaultValue: "انحصّل {{n}} — باقي بالذمّة {{rest}}" })
          : t("retail.collectDone", { n: money(r.settled), defaultValue: "انحصّل {{n}} — الذمّة صارت صفر" }),
        r.unallocated > 0.009 ? t("retail.collectOver", { n: money(r.unallocated), defaultValue: "{{n}} فوق الذمّة ما انسجّلت — الذمّة كانت أقل" }) : undefined,
      );
      onDone();
    } catch (e) {
      playWarning();
      const m = String((e as Error).message ?? e);
      toast.error(m.includes("nothing to collect") ? t("retail.collectNothing", "ماكو شي بالذمّة يتحصّل") : describeDbError(e, t), m);
    } finally { setBusy(false); }
  };

  const methods: { v: PaymentMethod; icon: typeof Banknote; label: string }[] = [
    { v: "cash", icon: Banknote, label: t("retail.payCash", "نقدي") },
    { v: "card", icon: CreditCard, label: t("retail.payCard", "بطاقة ائتمان") },
    { v: "transfer", icon: ArrowLeftRight, label: t("retail.payTransfer", "حوالة بنكية") },
  ];

  return (
    <Modal open onClose={onClose} title={t("retail.collectTitle", { name: courier.name, defaultValue: "تحصيل من {{name}}" })}>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-sm dark:bg-violet-500/10">
          <span className="text-ink-muted">{t("retail.collectOwed", { n: openCount, defaultValue: "بالذمّة عن {{n}} طلب" })}</span>
          <span className="font-display text-lg font-extrabold tabular-nums text-violet-700 dark:text-violet-300">{money(owed)}</span>
        </div>
        <div>
          <label className="label">{t("retail.collectAmount", "المبلغ المستلم")}</label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="1" inputMode="numeric" data-collectamount className="input flex-1 text-end text-lg font-bold tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={() => { playTap(); setAmount(String(Math.round(owed))); }}>{t("retail.collectAll", "كامل الذمّة")}</Button>
          </div>
          {partial && <p className="mt-1 text-2xs text-ink-subtle">{t("retail.collectPartialHint", "تحصيل جزئي — يسدّد الطلبات الأقدم أولاً، والباقي يبقى بالذمّة.")}</p>}
          {n > owed + 0.009 && <p className="mt-1 text-2xs font-semibold text-warn-700">{t("retail.collectOverHint", "أكثر من الذمّة — ينسجّل مقدار الذمّة فقط.")}</p>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {methods.map((m) => (
            <button key={m.v} type="button" onClick={() => { playTap(); setMethod(m.v); }}
              className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition",
                method === m.v ? "border-violet-500 bg-violet-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:text-ink")}>
              <m.icon size={14} /> {m.label}
            </button>
          ))}
        </div>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t("retail.collectNote", "ملاحظة (رقم الحوالة، اسم المندوب…)")} />
        <Button className="w-full" size="lg" data-collectgo loading={busy} disabled={n <= 0 || owed <= 0.009} leftIcon={<HandCoins size={18} />} onClick={() => void go()}>
          {t("retail.collectGo", { n: money(Math.min(n, owed)), defaultValue: "تسجيل تحصيل {{n}}" })}
        </Button>
      </div>
    </Modal>
  );
}

/** سجلُّ شركة: ما بالذمّة طلباً طلباً، وما حُصِّل دفعةً دفعة. */
function LedgerModal({ courier, open, dueOfOrder, orderNo, settlements, onClose, onCollect }: {
  courier: Courier; open: DeliveryOrder[]; dueOfOrder: (o: DeliveryOrder) => number; orderNo: (o: DeliveryOrder) => string;
  settlements: CourierSettlement[]; onClose: () => void; onCollect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const owed = round2(open.reduce((s, o) => s + dueOfOrder(o), 0));
  const sorted = open.slice().sort((a, b) => (a.delivered_at ?? a.created_at).localeCompare(b.delivered_at ?? b.created_at));
  return (
    <Modal open onClose={onClose} title={t("retail.ledgerTitle", { name: courier.name, defaultValue: "سجل {{name}}" })}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-500/10">
          <span className="text-sm text-ink-muted">{t("retail.companiesOwed", "بذمّة الشركات")}</span>
          <span className="font-display text-lg font-extrabold tabular-nums text-violet-700 dark:text-violet-300">{money(owed)}</span>
          {owed > 0.009 && <Button size="sm" leftIcon={<HandCoins size={14} />} onClick={onCollect}>{t("retail.collectBtn", "تحصيل")}</Button>}
        </div>
        <section>
          <h4 className="mb-1.5 text-xs font-extrabold text-ink">{t("retail.ledgerOpen", "طلبات بالذمّة (الأقدم يُسدَّد أولاً)")}</h4>
          {sorted.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-3 text-center text-xs text-ink-subtle">{t("retail.ledgerNoOpen", "ماكو طلبات بالذمّة.")}</p>
          ) : (
            <div className="max-h-52 space-y-1 overflow-y-auto pe-1">
              {sorted.map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{o.customer_name ?? "—"} <span className="font-normal text-ink-subtle">#{orderNo(o)}</span></span>
                  <span className="text-2xs text-ink-subtle">{formatDate(o.delivered_at ?? o.created_at, i18n.language)}</span>
                  <span className="shrink-0 font-bold tabular-nums text-violet-700 dark:text-violet-300">{money(dueOfOrder(o))}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <h4 className="mb-1.5 text-xs font-extrabold text-ink">{t("retail.ledgerSettlements", "التحصيلات")}</h4>
          {settlements.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-3 text-center text-xs text-ink-subtle">{t("retail.ledgerNoSettlements", "ما انحصّل شي بعد.")}</p>
          ) : (
            <div className="max-h-52 space-y-1 overflow-y-auto pe-1">
              {settlements.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 text-xs">
                  <span className="font-bold tabular-nums text-success-700 dark:text-success-300">{money(s.amount)}</span>
                  <span className="text-2xs text-ink-subtle">{t(`retail.pay${s.method === "cash" ? "Cash" : s.method === "card" ? "Card" : "Transfer"}`, s.method)}</span>
                  <span className="text-2xs text-ink-subtle">{t("retail.ledgerOrdersN", { n: s.allocations.length, defaultValue: "{{n}} طلب" })}</span>
                  {s.note && <span className="min-w-0 flex-1 truncate italic text-ink-muted">{s.note}</span>}
                  <span className="ms-auto text-2xs text-ink-subtle">{formatDate(s.created_at, i18n.language)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** سجل السواق — add / edit / archive the clinic's couriers. */
function CouriersModal({ open, couriers, clinicId, onClose, onChanged }: { open: boolean; couriers: Courier[]; clinicId?: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"driver" | "company">("driver");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => { if (open) { setName(""); setPhone(""); setKind("driver"); setEditing(null); } }, [open]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (editing) await repo.updateCourier(editing.id, { name: name.trim(), phone: phone.trim() || null, kind });
      else await repo.createCourier({ name: name.trim(), phone: phone.trim() || null, note: null, kind, active: true, clinic_id: clinicId ?? null });
      playSuccess();
      setName(""); setPhone(""); setKind("driver"); setEditing(null);
      onChanged();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };
  const setActive = async (c: Courier, active: boolean) => {
    try { await repo.updateCourier(c.id, { active }); playTap(); onChanged(); }
    catch (e) { toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
  };

  const shown = couriers.filter((c) => (showArchived ? true : c.active));
  return (
    <Modal open={open} onClose={onClose} title={t("retail.couriersTitle", "سجل السواق")}>
      <div className="space-y-3">
        {/* سائق أو شركة — الفرق كلُّه بالمال: السائق يسلّم فوراً، والشركة تحاسب لاحقاً */}
        <div data-courierkind className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {([
            { v: "driver", icon: Bike, label: t("retail.courierKindDriver", "سائق — يسلّم الفلوس فوراً") },
            { v: "company", icon: Building2, label: t("retail.courierKindCompany", "شركة توصيل — تحاسب لاحقاً") },
          ] as const).map((o) => (
            <button key={o.v} type="button" onClick={() => { playTap(); setKind(o.v); }}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
                kind === o.v ? (o.v === "company" ? "bg-violet-600 text-white shadow-soft" : "bg-sky-600 text-white shadow-soft") : "text-ink-muted hover:text-ink")}>
              <o.icon size={14} /> {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "company" ? t("retail.companyNamePh", "اسم شركة التوصيل") : t("retail.courierNamePh", "اسم السائق أو شركة التوصيل")} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <input className="input w-36" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx…" onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <Button loading={busy} disabled={!name.trim()} leftIcon={editing ? <Pencil size={15} /> : <Plus size={15} />} onClick={() => void save()}>
            {editing ? t("common.save", "حفظ") : t("common.add", "إضافة")}
          </Button>
        </div>
        {editing && (
          <button onClick={() => { setEditing(null); setName(""); setPhone(""); setKind("driver"); }} className="text-2xs font-semibold text-ink-subtle underline">{t("retail.courierCancelEdit", "إلغاء التعديل")}</button>
        )}
        {shown.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-ink-subtle">{t("retail.deliveryNoCouriersYet", "لا يوجد سواق بعد — أضفهم من «سجل السواق».")}</p>
        ) : (
          <div className="max-h-[46vh] space-y-1.5 overflow-y-auto pe-1">
            {shown.map((c) => (
              <div key={c.id} className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2.5", !c.active && "opacity-60")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", isCompany(c) ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300")}>{isCompany(c) ? <Building2 size={16} /> : <Bike size={16} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {c.name}
                    {isCompany(c) && <span className="ms-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-2xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{t("retail.courierKindCompany", "شركة توصيل — تحاسب لاحقاً").split(" — ")[0]}</span>}
                    {!c.active && <span className="text-2xs font-normal text-ink-subtle"> ({t("retail.courierArchived", "مؤرشف")})</span>}
                  </p>
                  {c.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}
                </div>
                <button onClick={() => { playTap(); setEditing(c); setName(c.name); setPhone(c.phone ?? ""); setKind(isCompany(c) ? "company" : "driver"); }} aria-label={t("common.edit", "تعديل")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={14} /></button>
                {c.active
                  ? <button onClick={() => void setActive(c, false)} aria-label={t("retail.courierArchive", "أرشفة")} title={t("retail.courierArchive", "أرشفة")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Archive size={14} /></button>
                  : <button onClick={() => void setActive(c, true)} aria-label={t("retail.courierRestore", "استرجاع")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-success-50 hover:text-success-600"><X size={14} className="rotate-45" /></button>}
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-2xs font-semibold text-ink-subtle">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-sky-600" />
          {t("retail.courierShowArchived", "إظهار المؤرشفين")}
        </label>
      </div>
    </Modal>
  );
}
