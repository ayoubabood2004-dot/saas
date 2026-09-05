// ============================================================================
// كشفُ حسابِ شركةِ التوصيل — «شنو راح معها، وشكد مطلوبٌ منها».
//
// ── لماذا يجلب بياناته بنفسه ────────────────────────────────────────────────
// لوحةُ التوصيل تستلم `invoices` كلقطةِ صفحةٍ = آخرُ خمسةَ عشرَ يوماً + كلُّ
// دَينٍ مفتوح (0150). فطلبٌ **حُصِّل** قبل شهرين فاتورتُه ليست باللقطة، ولو
// بنينا الكشفَ عليها لسقط من التاريخ بصمتٍ وبدا الكشفُ تامّاً. والتحصيلُ من
// الشركات يصير بعد فتراتٍ طويلة — فالكشفُ يمشي على **معرّفاتِ طلبات الشركة
// نفسِها**: يجلب فواتيرَها وسطورَها عند الفتح، ويرمي الخطأ بدل قائمةٍ ناقصة.
//
// ── وما الذي يكتب هنا ───────────────────────────────────────────────────────
// **لا حذفَ إطلاقاً.** كتابتان فقط، كلتاهما عبر دالّةِ قاعدةٍ مُعرِّفة:
//   • «تحصيل» → يفتح نافذةَ التحصيل القائمة (`courier_settle`، بلا تغييرِ حرف).
//   • «فكّ التحصيل» → `courier_unsettle` (0157): يردّ المبلغَ ويعيد الطلبَ
//     للذمّة، ويسِمُ صفَّ التحصيل مفكوكاً — ولا يمحوه. فتحصيلٌ سُجِّل بالغلط
//     يُصحَّح بالفكّ لا بتزوير رقمٍ آخر يوازنه.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, HandCoins, ListOrdered, RefreshCw, Undo2 } from "lucide-react";
import type { Courier, CourierSettlement, DeliveryOrder, Invoice, InvoiceItem } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { withTimeout, describeDbError } from "@/lib/errors";
import { usePermissions } from "@/hooks/usePermissions";
import { money, formatNum, formatDate, cn } from "@/lib/utils";
import { invoiceNo } from "@/lib/invoicePrint";
import { courierTotals, itemsFromInvoices, orderRows, type LedgerItemRow } from "@/lib/courierLedger";

type View = "items" | "orders";

export function CourierLedger({ courier, orders, settlements, onClose, onCollect }: {
  courier: Courier;
  /** كلُّ طلبات هذه الشركة — تاريخُها كاملاً، لا المفلترةُ بعدسة الفرع. */
  orders: DeliveryOrder[];
  settlements: CourierSettlement[];
  onClose: () => void;
  onCollect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  // فكُّ المال للمدير — نفسُ حارسِ حذف الفواتير وتعديل بنودها.
  const canUnsettle = usePermissions().can("deleteInvoices");
  const [unFor, setUnFor] = useState<CourierSettlement | null>(null);
  const [unReason, setUnReason] = useState("");
  const [unBusy, setUnBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>("items");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const invoiceIds = useMemo(
    () => [...new Set(orders.map((o) => o.invoice_id).filter(Boolean))],
    [orders]);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, its] = await withTimeout(Promise.all([
        repo.listInvoicesByIds(invoiceIds),
        repo.listInvoiceItemsFor(invoiceIds),
      ]), 20000);
      setInvoices(inv);
      setItems(its);
      setFailed(false);
    } catch {
      // كشفٌ ناقصٌ يوم المحاسبة أسوأ من خطأٍ ظاهر: نقولها ونعرض «أعد المحاولة».
      setFailed(true);
      setInvoices(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courier.id]);

  const invoiceById = useMemo(() => {
    const m = new Map((invoices ?? []).map((i) => [i.id, i]));
    return (id: string) => m.get(id);
  }, [invoices]);
  const itemsByInvoice = useMemo(() => {
    const m = new Map<string, InvoiceItem[]>();
    for (const it of items) {
      const arr = m.get(it.invoice_id);
      if (arr) arr.push(it); else m.set(it.invoice_id, [it]);
    }
    return (id: string) => m.get(id) ?? [];
  }, [items]);

  const totals = useMemo(() => courierTotals(orders, invoiceById), [orders, invoiceById]);
  const itemRows = useMemo(() => itemsFromInvoices(invoiceIds, itemsByInvoice), [invoiceIds, itemsByInvoice]);
  const rows = useMemo(() => orderRows(orders, invoiceById), [orders, invoiceById]);

  const goods = itemRows.filter((r) => !r.isService);
  const services = itemRows.filter((r) => r.isService);

  return (
    <Modal open onClose={onClose} size="full"
      title={t("retail.ledgerTitle", { name: courier.name, defaultValue: "سجل {{name}}" })}>
      <div className="space-y-4">

        {/* المجاميع — أول ما يُقرأ يوم المحاسبة */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tot label={t("retail.ledgerTotOwed", "المطلوب الآن")} value={money(totals.owedNow)} tone="violet"
               sub={t("retail.companyOpenN", { n: totals.openOrders, defaultValue: "{{n}} طلب بالذمّة" })} />
          <Tot label={t("retail.ledgerTotCollected", "انحصّل سابقاً")} value={money(totals.collected)} tone="success" />
          <Tot label={t("retail.ledgerTotGoods", "قيمة البضاعة المسلَّمة")} value={money(totals.goodsOut)} tone="sky"
               sub={t("retail.ledgerTotDeliveries", { n: totals.deliveries, defaultValue: "{{n}} توصيلة" })} />
          <Tot label={t("retail.ledgerTotReturned", "راجع")} value={formatNum(totals.returned)} tone="danger" />
        </div>

        {totals.owedNow > 0.009 && (
          <Button className="w-full" leftIcon={<HandCoins size={16} />} onClick={onCollect}>
            {t("retail.collectBtn", "تحصيل")} — {money(totals.owedNow)}
          </Button>
        )}

        {/* مبدّلُ العرض: صنفاً صنفاً، أو طلباً طلباً */}
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-2 p-1" data-ledgerview={view}>
          <ViewBtn active={view === "items"} icon={Boxes} onClick={() => setView("items")}
                   label={t("retail.ledgerByItem", "المنتجات الي راحت")} />
          <ViewBtn active={view === "orders"} icon={ListOrdered} onClick={() => setView("orders")}
                   label={t("retail.ledgerByOrder", "الطلبات")} />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>
        ) : failed ? (
          <div className="card space-y-3 p-6 text-center">
            <p className="text-sm text-ink-muted">
              {t("retail.ledgerFailed", "تعذّر تحميل الكشف. المشكلة بالاتصال ولا شيء ضاع — أعد المحاولة قبل ما تحاسب.")}
            </p>
            <Button leftIcon={<RefreshCw size={16} />} onClick={() => void load()}>{t("common.retry", "إعادة المحاولة")}</Button>
          </div>
        ) : view === "items" ? (
          <ItemsTable goods={goods} services={services} />
        ) : (
          <div className="max-h-[46vh] space-y-1 overflow-y-auto pe-1">
            {rows.length === 0 ? (
              <Empty text={t("retail.ledgerNoOrders", "ماكو طلبات لهذه الشركة.")} />
            ) : rows.map((r) => (
              <div key={r.order.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 text-xs" data-ledgerorder={r.order.id}>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {r.order.customer_name || "—"} <span className="font-normal text-ink-subtle">#{invoiceNo(r.order.invoice_id)}</span>
                </span>
                <StateChip state={r.state} />
                <span className="text-2xs text-ink-subtle">
                  {formatDate(r.order.delivered_at ?? r.order.returned_at ?? r.order.created_at, i18n.language)}
                </span>
                <span className={cn("shrink-0 font-bold tabular-nums",
                  r.state === "owed" ? "text-violet-700 dark:text-violet-300" : "text-ink-subtle")}>{money(r.due)}</span>
              </div>
            ))}
          </div>
        )}

        {/* التحصيلات السابقة */}
        <section>
          <h4 className="mb-1.5 text-xs font-extrabold text-ink">{t("retail.ledgerSettlements", "التحصيلات")}</h4>
          {settlements.length === 0 ? (
            <Empty text={t("retail.ledgerNoSettlements", "ما انحصّل شي بعد.")} />
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto pe-1">
              {settlements.map((s) => {
                const off = !!s.reversed_at;
                return (
                  <div key={s.id} data-settlement={s.id}
                    className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs",
                      off ? "border-line bg-surface-2 opacity-75" : "border-line")}>
                    <span className={cn("font-bold tabular-nums",
                      off ? "text-ink-subtle line-through" : "text-success-700 dark:text-success-300")}>{money(s.amount)}</span>
                    <span className="text-2xs text-ink-subtle">{t(`retail.pay${s.method === "cash" ? "Cash" : s.method === "card" ? "Card" : "Transfer"}`, s.method)}</span>
                    <span className="text-2xs text-ink-subtle">{t("retail.ledgerOrdersN", { n: s.allocations.length, defaultValue: "{{n}} طلب" })}</span>
                    {off && (
                      <span className="rounded-full bg-warn-50 px-2 py-0.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/10 dark:text-warn-300">
                        {t("retail.unsettled", "مفكوك")}{s.reversed_reason ? ` — ${s.reversed_reason}` : ""}
                      </span>
                    )}
                    {s.note && <span className="min-w-0 flex-1 truncate italic text-ink-muted">{s.note}</span>}
                    <span className="ms-auto text-2xs text-ink-subtle">{formatDate(s.created_at, i18n.language)}</span>
                    {!off && canUnsettle && (
                      <button type="button" data-unsettle={s.id} disabled={!!unBusy}
                        onClick={() => setUnFor(s)}
                        className="rounded-lg border border-warn-300 px-2 py-0.5 text-2xs font-bold text-warn-700 transition hover:bg-warn-50 disabled:opacity-50 dark:border-warn-500/40 dark:text-warn-300 dark:hover:bg-warn-500/10">
                        {t("retail.unsettleBtn", "فكّ التحصيل")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* تأكيدُ الفكّ — يقول بالضبط ماذا سيصير قبل أن يصير */}
        {unFor && (
          <div className="rounded-2xl border-2 border-warn-400 bg-warn-50 p-3 dark:border-warn-500/50 dark:bg-warn-500/10" data-unsettle-confirm>
            <p className="mb-1 text-sm font-extrabold text-warn-800 dark:text-warn-200">
              {t("retail.unsettleTitle", "فكّ تحصيل {{n}}؟", { n: money(unFor.amount) })}
            </p>
            <p className="mb-2 text-2xs leading-relaxed text-warn-800 dark:text-warn-200">
              {t("retail.unsettleWhat", { n: unFor.allocations.length, defaultValue: "المبلغ يرجع دَيناً على {{n}} طلب، وترجع بذمّة الشركة. التحصيل ما ينحذف — يبقى بالسجل موسوماً «مفكوك» حتى يبقى التاريخ كامل." })}
            </p>
            <input className="input mb-2 text-xs" value={unReason} onChange={(e) => setUnReason(e.target.value)}
              placeholder={t("retail.unsettleReasonPh", "السبب (اختياري) — مثلاً: انسجّل بالغلط")} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={unBusy === unFor.id} onClick={async () => {
                setUnBusy(unFor.id);
                try {
                  await withTimeout(repo.unsettleCourier(unFor.id, unReason), 12000);
                  toast.success(t("retail.unsettleDone", "انفكّ التحصيل ✓"), t("retail.unsettleDoneSub", "المبلغ رجع بذمّة الشركة، والسجل محفوظ."));
                  setUnFor(null); setUnReason("");
                  void load();
                } catch (e) {
                  toast.error(t("retail.unsettleFail", "تعذّر فكّ التحصيل"), describeDbError(e, t));
                } finally { setUnBusy(null); }
              }}>{t("retail.unsettleConfirm", "إي، فكّه")}</Button>
              <Button size="sm" variant="secondary" onClick={() => { setUnFor(null); setUnReason(""); }}>{t("common.cancel", "إلغاء")}</Button>
            </div>
          </div>
        )}

        <p className="text-2xs leading-relaxed text-ink-subtle">
          {t("retail.ledgerFootnote", "الأسماء والأسعار مأخوذة من الفاتورة وقت البيع — فتبقى صحيحة حتى لو انعاد تسمية المنتج بعدين. والكشف يقرأ الحامل الحالي للطلب، فطلبٌ انتقل لشركة ثانية ينتقل كشفه معها.")}
        </p>
      </div>
    </Modal>
  );
}

function ItemsTable({ goods, services }: { goods: LedgerItemRow[]; services: LedgerItemRow[] }) {
  const { t } = useTranslation();
  if (goods.length === 0 && services.length === 0) {
    return <Empty text={t("retail.ledgerNoItems", "ماكو أصناف بهذا الكشف.")} />;
  }
  const Row = ({ r }: { r: LedgerItemRow }) => (
    <tr className="border-b border-line last:border-0" data-ledgeritem={r.key}>
      <td className="px-2 py-1.5 font-semibold text-ink">{r.name}</td>
      <td className="px-2 py-1.5 font-mono text-2xs text-ink-subtle" dir="ltr">{r.barcode ?? "—"}</td>
      <td className="px-2 py-1.5 text-center tabular-nums">{formatNum(r.qty)}</td>
      <td className="px-2 py-1.5 text-center text-2xs tabular-nums text-ink-subtle">{formatNum(r.orders)}</td>
      <td className="px-2 py-1.5 text-end font-bold tabular-nums text-ink">{money(r.amount)}</td>
    </tr>
  );
  const total = [...goods, ...services].reduce((s, r) => s + r.amount, 0);
  return (
    <div className="max-h-[46vh] overflow-auto rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr className="text-2xs text-ink-subtle">
            <th className="px-2 py-1.5 text-start font-semibold">{t("retail.ledgerItem", "الصنف")}</th>
            <th className="px-2 py-1.5 text-start font-semibold">{t("retail.ledgerBarcode", "الرمز")}</th>
            <th className="px-2 py-1.5 text-center font-semibold">{t("retail.ledgerQty", "الكمية")}</th>
            <th className="px-2 py-1.5 text-center font-semibold">{t("retail.ledgerInOrders", "بكم طلب")}</th>
            <th className="px-2 py-1.5 text-end font-semibold">{t("retail.ledgerAmount", "المبلغ")}</th>
          </tr>
        </thead>
        <tbody>
          {goods.map((r) => <Row key={r.key} r={r} />)}
          {services.length > 0 && (
            <tr className="bg-surface-2"><td colSpan={5} className="px-2 py-1 text-2xs font-bold text-ink-muted">
              {t("retail.ledgerServices", "خدمات وأجور")}
            </td></tr>
          )}
          {services.map((r) => <Row key={r.key} r={r} />)}
        </tbody>
        <tfoot className="sticky bottom-0 bg-surface-2">
          <tr className="text-xs font-extrabold text-ink">
            <td className="px-2 py-1.5" colSpan={4}>{t("retail.ledgerGrandTotal", "المجموع الكلي")}</td>
            <td className="px-2 py-1.5 text-end tabular-nums">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Tot({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  const tones: Record<string, string> = {
    violet: "text-violet-700 dark:text-violet-300",
    success: "text-success-700 dark:text-success-300",
    sky: "text-sky-700 dark:text-sky-300",
    danger: "text-danger-700 dark:text-danger-300",
  };
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-3 py-2">
      <p className="text-2xs text-ink-subtle">{label}</p>
      <p className={cn("font-display text-lg font-extrabold tabular-nums", tones[tone])}>{value}</p>
      {sub && <p className="text-2xs text-ink-subtle">{sub}</p>}
    </div>
  );
}

function ViewBtn({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Boxes; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition",
        active ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted hover:text-ink")}>
      <Icon size={14} /> {label}
    </button>
  );
}

function StateChip({ state }: { state: "owed" | "collected" | "returned" }) {
  const { t } = useTranslation();
  if (state === "returned") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-2xs font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300"><Undo2 size={11} /> {t("retail.ledgerStReturned", "راجع")}</span>;
  }
  if (state === "collected") {
    return <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">{t("retail.ledgerStCollected", "انحصّل")}</span>;
  }
  return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-2xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{t("retail.ledgerStOwed", "بالذمّة")}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-surface-2 p-3 text-center text-xs text-ink-subtle">{text}</p>;
}
