import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Bike, Search, Phone, MapPin, Printer, CheckCircle2, Undo2, Send, Users,
  PackageOpen, Wallet, Clock, Plus, Pencil, Archive, X, HandCoins, ReceiptText,
} from "lucide-react";
import type { Invoice, Courier, DeliveryOrder } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Badge, useToast } from "@/components/ui";
import { openDeliverySlip } from "@/lib/deliveryPrint";
import { invoiceNo } from "@/lib/invoicePrint";
import { dueOf, round2 } from "@/lib/debt";
import { cn, formatNum, money, localISO } from "@/lib/utils";
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
 * ==========================================================================*/

const timeAgo = (iso: string): string => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${formatNum(mins)} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${formatNum(h)} س`;
  return `${formatNum(Math.floor(h / 24))} يوم`;
};

export function DeliveryPanel({ invoices, clinicId, onChanged }: { invoices: Invoice[]; clinicId?: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [couriersOpen, setCouriersOpen] = useState(false);
  const [assigning, setAssigning] = useState<DeliveryOrder | null>(null);

  const load = async () => {
    try {
      const [o, c] = await Promise.all([repo.listDeliveryOrders(clinicId), repo.listCouriers(clinicId)]);
      setOrders(o);
      setCouriers(c);
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

  /* ---- The three money moves — all built on the proven invoice machinery ---- */
  const deliver = async (o: DeliveryOrder) => {
    if (busyId) return;
    setBusyId(o.id);
    try {
      const inv = invoiceOf(o.invoice_id);
      const due = inv ? dueOf(inv) : o.cod_amount;
      // Settle FIRST (idempotent: due 0 → nothing to add), then flip the order —
      // a failure in between leaves a re-tappable "out" order, never lost money.
      if (due > 0.009) await repo.settleInvoice(o.invoice_id, due, "cash");
      await repo.updateDeliveryOrder(o.id, { status: "delivered", delivered_at: new Date().toISOString() });
      playSuccess();
      toast.success(t("retail.deliveryDone", { n: money(o.cod_amount), defaultValue: "تم الاستلام — دخل {{n}} للصندوق" }));
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

  /** Bulk hand-over: the courier came back — settle EVERY order he carries. */
  const settleCourier = async (courierId: string | null, list: DeliveryOrder[]) => {
    const sum = round2(list.reduce((s, o) => s + o.cod_amount, 0));
    const cName = courierOf(courierId)?.name ?? t("retail.deliveryNoCourierShort", "بدون سائق");
    if (!window.confirm(t("retail.deliverySettleAllConfirm", { name: cName, n: list.length, sum: money(sum), defaultValue: "استلام {{sum}} من {{name}} عن {{n}} طلبات وتسجيلها كلها مستلمة؟" }))) return;
    for (const o of list) await deliver(o);
  };

  /* ---- Derived views ---- */
  const ql = q.trim().toLowerCase();
  const match = (o: DeliveryOrder) =>
    !ql ||
    (o.customer_name ?? "").toLowerCase().includes(ql) ||
    (o.customer_phone ?? "").includes(ql) ||
    (o.address ?? "").toLowerCase().includes(ql) ||
    (courierOf(o.courier_id)?.name ?? "").toLowerCase().includes(ql);

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

  const inTransit = round2(out.reduce((s, o) => s + o.cod_amount, 0));
  const today = localISO();
  const receivedToday = round2(orders.filter((o) => o.status === "delivered" && (o.delivered_at ?? "").slice(0, 10) === today).reduce((s, o) => s + o.cod_amount, 0));
  const returnedToday = orders.filter((o) => o.status === "returned" && (o.returned_at ?? "").slice(0, 10) === today).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={PackageOpen} tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" label={t("retail.deliveryPreparing", "قيد التجهيز")} value={formatNum(preparing.length)} />
        <Kpi icon={Bike} tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" label={t("retail.deliveryInTransit", "فلوس بالطريق")} value={money(inTransit)} sub={t("retail.deliveryOutCount", { n: out.length, defaultValue: "{{n}} طلب بالطريق" })} />
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
                  const sum = round2(list.reduce((s, o) => s + o.cod_amount, 0));
                  return (
                    <div key={cid ?? "none"} className="overflow-hidden rounded-2xl border border-sky-200 dark:border-sky-500/30">
                      <div className="flex flex-wrap items-center gap-2 bg-sky-50/70 px-3.5 py-2.5 dark:bg-sky-500/10">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-600 text-white"><Bike size={16} /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{c?.name ?? t("retail.deliveryNoCourierShort", "بدون سائق")}</p>
                          {c?.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}
                        </div>
                        <div className="ms-auto flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">{money(sum)}</span>
                          <Button size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={() => void settleCourier(cid, list)}>
                            {t("retail.deliverySettleAll", { n: list.length, defaultValue: "استلام الكل ({{n}})" })}
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 p-2.5 lg:grid-cols-2">
                        {list.map((o) => (
                          <OrderCard key={o.id} o={o} no={orderNo(o)} courier={c} busy={busyId === o.id}
                            actions={
                              <>
                                <Button size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={() => void deliver(o)}>{t("retail.deliveryReceived", "استلمنا الفلوس")}</Button>
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
                {doneList.map((o) => (
                  <div key={o.id} className="card flex flex-wrap items-center gap-2.5 p-2.5 text-sm">
                    {o.status === "delivered"
                      ? <Badge tone="success"><CheckCircle2 size={12} /> {t("retail.deliveryStatusDone", "مستلم")}</Badge>
                      : <Badge tone="danger"><Undo2 size={12} /> {t("retail.deliveryStatusReturned", "راجع")}</Badge>}
                    <span className="font-bold text-ink">{o.customer_name ?? "—"}</span>
                    <span className="text-2xs text-ink-subtle">#{orderNo(o)}</span>
                    {courierOf(o.courier_id) && <span className="text-2xs text-ink-subtle">🛵 {courierOf(o.courier_id)!.name}</span>}
                    <span className="ms-auto font-bold tabular-nums text-ink-muted">{money(o.cod_amount)}</span>
                    <span className="text-2xs text-ink-subtle"><Clock size={11} className="inline" /> {timeAgo(o.delivered_at ?? o.returned_at ?? o.created_at)}</span>
                  </div>
                ))}
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
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Bike size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                  {c.phone && <span className="block text-xs text-ink-subtle" dir="ltr">{c.phone}</span>}
                </span>
              </button>
            ))}
            <Button variant="secondary" className="w-full" leftIcon={<Users size={15} />} onClick={() => { setAssigning(null); setCouriersOpen(true); }}>{t("retail.couriersBtn", "سجل السواق")}</Button>
          </div>
        </Modal>
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
        {o.address && <span className="flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0" /> <span className="truncate">{o.address}</span></span>}
        <span className="flex items-center gap-1 text-ink-subtle"><Clock size={11} /> {timeAgo(o.dispatched_at ?? o.created_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-xs">
        <span className="flex items-center gap-1 font-bold text-sky-700 dark:text-sky-300"><Wallet size={13} /> {t("retail.deliveryCourierOwes", "يُسلِّم السائق للعيادة")} {money(o.cod_amount)}</span>
        {o.delivery_fee > 0 && !o.fee_to_clinic && <span className="text-ink-subtle">{t("retail.deliveryCollectPlusFee", { n: money(collect), defaultValue: "يُحصَّل من الزبون {{n}} (مع الأجرة)" })}</span>}
        {o.prepaid > 0 && <span className="text-success-600">{t("retail.deliveryPrepaidChip", { n: money(o.prepaid), defaultValue: "مقدّم {{n}}" })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </motion.div>
  );
}

/** سجل السواق — add / edit / archive the clinic's couriers. */
function CouriersModal({ open, couriers, clinicId, onClose, onChanged }: { open: boolean; couriers: Courier[]; clinicId?: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => { if (open) { setName(""); setPhone(""); setEditing(null); } }, [open]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (editing) await repo.updateCourier(editing.id, { name: name.trim(), phone: phone.trim() || null });
      else await repo.createCourier({ name: name.trim(), phone: phone.trim() || null, note: null, active: true, clinic_id: clinicId ?? null });
      playSuccess();
      setName(""); setPhone(""); setEditing(null);
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
        <div className="flex gap-2">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("retail.courierNamePh", "اسم السائق أو شركة التوصيل")} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <input className="input w-36" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx…" onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <Button loading={busy} disabled={!name.trim()} leftIcon={editing ? <Pencil size={15} /> : <Plus size={15} />} onClick={() => void save()}>
            {editing ? t("common.save", "حفظ") : t("common.add", "إضافة")}
          </Button>
        </div>
        {editing && (
          <button onClick={() => { setEditing(null); setName(""); setPhone(""); }} className="text-2xs font-semibold text-ink-subtle underline">{t("retail.courierCancelEdit", "إلغاء التعديل")}</button>
        )}
        {shown.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-ink-subtle">{t("retail.deliveryNoCouriersYet", "لا يوجد سواق بعد — أضفهم من «سجل السواق».")}</p>
        ) : (
          <div className="max-h-[46vh] space-y-1.5 overflow-y-auto pe-1">
            {shown.map((c) => (
              <div key={c.id} className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2.5", !c.active && "opacity-60")}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Bike size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{c.name} {!c.active && <span className="text-2xs font-normal text-ink-subtle">({t("retail.courierArchived", "مؤرشف")})</span>}</p>
                  {c.phone && <p className="text-2xs text-ink-subtle" dir="ltr">{c.phone}</p>}
                </div>
                <button onClick={() => { playTap(); setEditing(c); setName(c.name); setPhone(c.phone ?? ""); }} aria-label={t("common.edit", "تعديل")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={14} /></button>
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
