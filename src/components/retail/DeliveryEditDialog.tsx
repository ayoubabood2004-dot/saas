import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Plus, Minus, Trash2, Undo2, AlertTriangle, Wallet, PackageOpen,
  ArrowLeft, Send, ShieldAlert,
} from "lucide-react";
import type { Invoice, InvoiceItem, DeliveryOrder, Courier, Product, CompanySection, EditLine } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { round2 } from "@/lib/debt";
import { cn, money, normalizeAr, formatNum } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { sendWhatsApp } from "@/lib/quotas";
import { waNumber } from "@/lib/phone";
import { getDialCode } from "@/lib/settings";
import { invoiceNo } from "@/lib/invoicePrint";

/* ============================================================================
 * DeliveryEditDialog — تعديل طلب توصيل بعد إنشائه.
 *
 * الحاجة من الميدان: الزبون يتصل بعد دقائق من خروج الطلب ليضيف صنفاً أو يغيّر
 * كمية. الحل القديم (إرجاع الفاتورة وإنشاء غيرها) كان يبدّل رقم الفاتورة التي
 * يحملها السواق ويلوّث السجل بفاتورة ملغاة.
 *
 * ثلاث قواعد تحكم هذه الشاشة، وكلها مرئية للطبيب قبل أن يضغط حفظ:
 *   ١) المخزون لا ينزلق: الحاجة الإضافية لكل منتج = (المسحوب الجديد − القديم)،
 *      وتُقاس مقابل رصيد المنتج + مخزون قسمه المشترك. التجاوز يمنع الحفظ هنا
 *      قبل أن يرفضه السيرفر — الطبيب يرى الرقم المتاح لا رسالة خطأ غامضة.
 *   ٢) نقد الزبون لا يُمَس: المدفوع يبقى كما هو، ويُعاد حساب ما يستلمه السواق
 *      (= الإجمالي الجديد − المدفوع) ويُعرض بوضوح قبل الحفظ وبعده.
 *   ٣) السبب اختياري: إلزامه كان يوقف الطبيب عن تعديلٍ يريده الآن ويده على
 *      الهاتف مع الزبون. سجل الحركات يلتقط الفعل نفسه دائماً، ومن أراد
 *      التوثيق فأمامه اختصارٌ بضغطة — تسهيلٌ لا إجبار.
 *
 * والطلب الذي خرج فعلاً حالة خاصة: تحذير صريح + إشعار السواق بواتساب بعد
 * الحفظ، لأن التعديل الذي لا يصل للسواق قبل باب الزبون تعديلٌ فاشل.
 * ==========================================================================*/

/** سطر داخل المحرّر: `src` موجود = سطر قائم بالفاتورة، غائب = صنف مضاف الآن. */
interface Row {
  key: string;
  src?: InvoiceItem;
  product?: Product;
  product_id: string | null;
  name: string;
  barcode: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
  unit_label: string | null;
  /** المسحوب من المخزون لكل وحدة بيع (١ للعلبة، ١/عدد الحبّات للحبّة). */
  perUnit: number;
  removed?: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function DeliveryEditDialog({
  order, invoice, courier, clinicId, onClose, onSaved,
}: {
  order: DeliveryOrder;
  invoice: Invoice;
  courier: Courier | null;
  clinicId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pools, setPools] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(order.status === "out" && !!courier?.phone);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [items, prods, secs] = await Promise.all([
          repo.listInvoiceItems(invoice.id),
          repo.listProducts(clinicId),
          repo.listCompanySections(undefined, clinicId).catch(() => [] as CompanySection[]),
        ]);
        if (!alive) return;
        const byId = new Map(prods.map((p) => [p.id, p]));
        setRows(items.map((it, i) => ({
          key: it.id || `src-${i}`,
          src: it,
          product: it.product_id ? byId.get(it.product_id) : undefined,
          product_id: it.product_id ?? null,
          name: it.name,
          barcode: it.barcode ?? null,
          qty: it.qty,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost,
          unit_label: it.unit_label ?? null,
          // نسبة السحب مأخوذة من السطر نفسه لا مُعاد اشتقاقها: بيع خمس حبّات من
          // علبة عشرين خُزِّن ٠٫٢٥ — وتغيير الكمية لعشر حبّات يجب أن يعطي ٠٫٥.
          perUnit: it.product_id == null ? 0 : (it.qty > 0 && it.stock_qty != null ? it.stock_qty / it.qty : 1),
        })));
        setProducts(prods);
        setPools(new Map(secs.map((s) => [s.id, s.pooled_stock ?? 0])));
      } catch (e) {
        toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [invoice.id, clinicId]);

  const live = rows.filter((r) => !r.removed && r.qty > 0);

  /* ---- الحساب: المدفوع ثابت، والباقي يتبع الأصناف --------------------------- */
  const oldTotal = round2(Number(invoice.total) || 0);
  const discount = Math.max(0, Number(invoice.discount) || 0);
  const paid = round2(Number(invoice.amount_paid) || 0);
  const subtotal = round2(live.reduce((s, r) => s + r.qty * r.unit_price, 0));
  const newTotal = Math.max(0, round2(subtotal - discount));
  const diff = round2(newTotal - oldTotal);
  const newCod = Math.max(0, round2(newTotal - paid));
  const overpaid = Math.max(0, round2(paid - newTotal));

  /* ---- حارس المخزون: الحاجة الإضافية لكل منتج مقابل المتاح فعلاً ------------ */
  const shortages = useMemo(() => {
    const need = new Map<string, number>();
    for (const r of rows) {
      if (!r.product_id) continue;
      const before = r.src ? Number(r.src.stock_qty ?? r.src.qty) || 0 : 0;
      const after = r.removed ? 0 : r3(r.qty * r.perUnit);
      need.set(r.product_id, r3((need.get(r.product_id) ?? 0) + (after - before)));
    }
    const out: { name: string; avail: number }[] = [];
    for (const [pid, extra] of need) {
      if (extra <= 0.0005) continue;
      const p = products.find((x) => x.id === pid);
      if (!p) continue;
      const avail = r3((p.stock || 0) + (p.section_id ? (pools.get(p.section_id) ?? 0) : 0));
      if (extra > avail + 0.0005) out.push({ name: p.name, avail });
    }
    return out;
  }, [rows, products, pools]);

  const changed = useMemo(() => {
    if (rows.some((r) => !r.src || r.removed)) return true;
    return rows.some((r) => r.src && (r.qty !== r.src.qty || round2(r.unit_price) !== round2(r.src.unit_price)));
  }, [rows]);

  /* ---- بحث المنتجات للإضافة ------------------------------------------------ */
  const results = useMemo(() => {
    const s = normalizeAr(q.trim().toLowerCase());
    if (!s) return [];
    return products
      .filter((p) => normalizeAr(p.name.toLowerCase()).includes(s) || (p.barcode ?? "").includes(q.trim()))
      .slice(0, 8);
  }, [q, products]);

  const addProduct = (p: Product) => {
    playTap();
    setQ("");
    // صنف موجود أصلاً بنفس وحدة البيع → زيادة كميته بدل سطر مكرر يربك السواق.
    const same = rows.find((r) => r.product_id === p.id && !r.removed && r.perUnit === 1);
    if (same) { setRows((rs) => rs.map((r) => (r.key === same.key ? { ...r, qty: r.qty + 1 } : r))); return; }
    setRows((rs) => [...rs, {
      key: `new-${p.id}-${rs.length}`,
      product: p, product_id: p.id, name: p.name, barcode: p.barcode ?? null,
      qty: 1, unit_price: p.sell_price, unit_cost: p.purchase_price, unit_label: null, perUnit: 1,
    }]);
  };

  /** بيع بالحبّة لسطر مضاف: السعر والكلفة والسحب كلها تتبع الوحدة معاً. */
  const setUnit = (key: string, sub: boolean) => {
    playTap();
    setRows((rs) => rs.map((r) => {
      if (r.key !== key || !r.product) return r;
      const upb = r.product.units_per_box ?? 0;
      if (sub && upb > 0) {
        return {
          ...r, perUnit: 1 / upb, unit_label: r.product.sub_unit_name || t("retail.unitSingle", "حبة"),
          unit_price: r.product.sub_unit_price ?? 0,
          unit_cost: round2((r.product.purchase_price || 0) / upb),
        };
      }
      return { ...r, perUnit: 1, unit_label: null, unit_price: r.product.sell_price, unit_cost: r.product.purchase_price };
    }));
  };

  const setQty = (key: string, qty: number) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, qty: Math.max(0, Math.round(qty * 1000) / 1000) } : r)));
  const toggleRemove = (key: string) => {
    playTap();
    setRows((rs) => rs.flatMap((r) => {
      if (r.key !== key) return [r];
      // سطر مضاف الآن يُحذف نهائياً؛ سطر قائم يُعلَّم فقط ليبقى التراجع ممكناً.
      return r.src ? [{ ...r, removed: !r.removed }] : [];
    }));
  };

  /* ---- الحفظ --------------------------------------------------------------- */
  const save = async () => {
    if (saving) return;
    if (!live.length) { playWarning(); toast.error(t("retail.dEditEmpty", "لا يمكن حفظ طلب بلا أصناف — استخدم «إلغاء الطلب» بدل ذلك.")); return; }
    if (shortages.length) { playWarning(); toast.error(t("retail.dEditStockShort", { name: shortages[0].name, n: formatNum(shortages[0].avail), defaultValue: "المتوفر من {{name}}: {{n}} فقط" })); return; }

    setSaving(true);
    try {
      const lines: EditLine[] = live.map((r) => ({
        id: r.src?.id,
        product_id: r.product_id,
        name: r.name,
        barcode: r.barcode,
        qty: r.qty,
        unit_price: round2(r.unit_price),
        unit_cost: round2(r.unit_cost),
        unit_label: r.unit_label,
        stock_qty: r.product_id ? r3(r.qty * r.perUnit) : 0,
      }));
      const inv = await repo.editInvoiceLines(invoice.id, lines, reason.trim() || null);
      playSuccess();
      toast.success(t("retail.dEditSaved", { n: money(Math.max(0, round2((Number(inv.total) || newTotal) - paid))), defaultValue: "تم التعديل — يستلم السائق {{n}}" }));
      // الإشعار بعد نجاح الحفظ فقط: رسالة عن تعديل لم يُحفظ أسوأ من لا رسالة.
      if (notify && courier?.phone) {
        try {
          await sendWhatsApp({
            phone: waNumber(courier.phone, getDialCode()),
            text: t("retail.dEditWaMsg", {
              no: invoiceNo(order.invoice_id),
              customer: order.customer_name ?? "",
              items: live.map((r) => `• ${r.name}${r.unit_label ? ` (${r.unit_label})` : ""} ×${formatNum(r.qty)}`).join("\n"),
              n: money(Math.max(0, round2((Number(inv.total) || newTotal) - paid))),
            }), // النص بمفتاح ar/en وحده — بلا نسخة صلبة تتخلّف عن الترجمة
            ownerName: order.customer_name ?? null,
            ownerPhone: order.customer_phone ?? null,
            kind: "manual",
          });
        } catch { /* الحصة أو نافذة منبثقة محجوبة — التعديل محفوظ على أي حال */ }
      }
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="wide" title={t("retail.dEditTitle", "تعديل طلب التوصيل")}>
      <div className="space-y-3.5" data-dedit>
        {/* الطلب خرج فعلاً — تحذير قبل أي ضغطة، لا بعدها */}
        {order.status === "out" && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-amber-800 dark:text-amber-200">
              {t("retail.dEditOutWarn", { name: courier?.name ?? t("retail.deliveryNoCourierShort", "بدون سائق"), defaultValue: "الطلب بالطريق مع {{name}} — التعديل الذي لا يصل للسائق قبل باب الزبون تعديلٌ فاشل. أبلغه فوراً." })}
            </p>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-ink-subtle">{t("common.loading", "جارٍ التحميل…")}</div>
        ) : (
          <>
            {/* أصناف الطلب */}
            <div>
              <h3 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-ink">
                <PackageOpen size={15} className="text-brand-600" /> {t("retail.dEditCurrent", "أصناف الطلب")}
                <span className="chip bg-surface-2 text-2xs font-bold text-ink-muted">{formatNum(live.length)}</span>
              </h3>
              <div className="space-y-1.5">
                {rows.map((r) => {
                  const isNew = !r.src;
                  const qtyChanged = !!r.src && r.qty !== r.src.qty;
                  const hasSub = !!r.product?.has_sub_unit && !!r.product?.units_per_box && (r.product.units_per_box ?? 0) > 0;
                  return (
                    <div key={r.key} data-dline
                      className={cn("flex flex-wrap items-center gap-2 rounded-2xl border p-2.5",
                        r.removed ? "border-danger-200 bg-danger-50/60 opacity-70 dark:border-danger-500/30 dark:bg-danger-500/10"
                          : isNew ? "border-success-300 bg-success-50/60 dark:border-success-500/30 dark:bg-success-500/10"
                            : "border-line bg-surface-1")}>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-bold text-ink", r.removed && "line-through")}>
                          {r.name}
                          {r.unit_label && <span className="ms-1.5 text-2xs font-normal text-ink-subtle">({r.unit_label})</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                          <span className="tabular-nums">{money(r.unit_price)}</span>
                          {isNew && <span className="chip bg-success-100 text-[10px] font-bold text-success-700 dark:bg-success-500/20 dark:text-success-300">{t("retail.dEditNew", "جديد")}</span>}
                          {qtyChanged && !r.removed && <span className="chip bg-amber-100 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{formatNum(r.src!.qty)} ← {formatNum(r.qty)}</span>}
                          {r.removed && <span className="chip bg-danger-100 text-[10px] font-bold text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">{t("retail.dEditRemoved", "محذوف")}</span>}
                          {!r.product_id && <span className="chip bg-surface-2 text-[10px] font-bold text-ink-muted">{t("retail.dEditServiceTag", "بلا مخزون")}</span>}
                        </p>
                        {/* وحدة البيع للأصناف المضافة: السعر والسحب يتبعانها معاً */}
                        {isNew && hasSub && !r.removed && (
                          <div className="mt-1 flex items-center gap-1">
                            <button onClick={() => setUnit(r.key, false)} className={cn("rounded-lg px-2 py-0.5 text-2xs font-bold transition", r.perUnit === 1 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>{t("retail.unitBox", "علبة")}</button>
                            <button onClick={() => setUnit(r.key, true)} className={cn("rounded-lg px-2 py-0.5 text-2xs font-bold transition", r.perUnit !== 1 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>{r.product?.sub_unit_name || t("retail.unitSingle", "حبة")}</button>
                          </div>
                        )}
                      </div>

                      {!r.removed && (
                        <>
                          {/* أهداف لمس ٤٤px — تعديل كمية بالغلط هنا يعني مخزوناً غلط */}
                          <div className="flex items-center gap-1">
                            <button data-dminus onClick={() => { playTap(); setQty(r.key, r.qty - 1); }} disabled={r.qty <= 1}
                              className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3 disabled:opacity-40"><Minus size={17} /></button>
                            <input data-dqty inputMode="decimal" value={r.qty}
                              onChange={(e) => setQty(r.key, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                              className="h-11 w-14 rounded-xl border border-line bg-surface-1 text-center text-base font-bold tabular-nums text-ink" />
                            <button data-dplus onClick={() => { playTap(); setQty(r.key, r.qty + 1); }}
                              className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Plus size={17} /></button>
                          </div>
                          <span className="w-24 shrink-0 whitespace-nowrap text-end text-sm font-extrabold tabular-nums text-ink">{money(r.qty * r.unit_price)}</span>
                        </>
                      )}
                      <button data-dremove onClick={() => toggleRemove(r.key)} aria-label={r.removed ? t("retail.dEditUndo", "تراجع") : t("common.delete", "حذف")}
                        className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl transition",
                          r.removed ? "text-ink-muted hover:bg-surface-2" : "text-ink-subtle hover:bg-danger-50 hover:text-danger-600")}>
                        {r.removed ? <Undo2 size={17} /> : <Trash2 size={17} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* إضافة صنف */}
            <div>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input data-dsearch className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={t("retail.dEditSearchPh", "أضف صنفاً — ابحث بالاسم أو الباركود…")} />
              </div>
              {q.trim() && (
                <div className="mt-1.5 space-y-1 rounded-2xl border border-line bg-surface-1 p-1.5">
                  {results.length === 0 ? (
                    <p className="p-2 text-center text-xs text-ink-subtle">{t("retail.dEditNoResults", "لا نتائج")}</p>
                  ) : results.map((p) => {
                    const avail = r3((p.stock || 0) + (p.section_id ? (pools.get(p.section_id) ?? 0) : 0));
                    return (
                      <button key={p.id} data-dadd onClick={() => addProduct(p)}
                        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-start transition hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                          <span className="block text-2xs text-ink-subtle">{money(p.sell_price)} · {t("retail.dEditAvail", { n: formatNum(avail), defaultValue: "متوفر {{n}}" })}</span>
                        </span>
                        <Plus size={16} className="shrink-0 text-brand-600" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* نقص مخزون: يُمنع الحفظ ويُعرض المتاح فعلاً */}
            {shortages.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-danger-300 bg-danger-50 p-3 text-sm dark:border-danger-500/40 dark:bg-danger-500/10">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger-600" />
                <div className="text-danger-800 dark:text-danger-200">
                  {shortages.map((s) => (
                    <p key={s.name}>{t("retail.dEditStockShort", { name: s.name, n: formatNum(s.avail), defaultValue: "المتوفر من {{name}}: {{n}} فقط" })}</p>
                  ))}
                </div>
              </div>
            )}

            {/* الأثر المالي — الأرقام قبل الضغط لا بعده */}
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <span className="text-ink-muted">{t("retail.dEditOldTotal", "الإجمالي قبل")} <b className="tabular-nums text-ink">{money(oldTotal)}</b></span>
                <ArrowLeft size={14} className="text-ink-subtle rtl:rotate-180" />
                <span className="text-ink-muted">{t("retail.dEditNewTotal", "بعد")} <b data-dnewtotal className="tabular-nums text-ink">{money(newTotal)}</b></span>
                {Math.abs(diff) > 0.005 && (
                  <span className={cn("chip text-2xs font-bold", diff > 0 ? "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300" : "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300")}>
                    {diff > 0 ? "+" : "−"}{money(Math.abs(diff))}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2 text-sm">
                <span className="flex items-center gap-1.5 font-bold text-sky-700 dark:text-sky-300">
                  <Wallet size={15} /> {t("retail.dEditNewCollect", "يستلم السائق الآن")} <b data-dnewcod className="tabular-nums">{money(newCod)}</b>
                </span>
                {paid > 0.005 && <span className="text-2xs text-ink-subtle">{t("retail.dEditPaidNote", { n: money(paid), defaultValue: "المدفوع {{n}} لا يتغيّر" })}</span>}
              </div>
              {overpaid > 0.005 && (
                <p className="mt-2 rounded-xl bg-amber-100 px-2.5 py-1.5 text-2xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  {t("retail.dEditOverpaid", { n: money(overpaid), defaultValue: "المدفوع أكبر من الإجمالي الجديد — للزبون فائض {{n}} يُعاد له نقداً." })}
                </p>
              )}
            </div>

            {/* السبب — اختياري. الإلزام كان يوقف الطبيب عن تعديلٍ يريده الآن
                ويده على الهاتف مع الزبون؛ وسجل الحركات يلتقط الفعل نفسه على
                أي حال. من أراد التوثيق فأمامه ضغطة واحدة. */}
            <div>
              <label className="mb-1 block text-xs font-bold text-ink">{t("retail.dEditReason", "سبب التعديل (اختياري)")}</label>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {[
                  t("retail.dEditReasonQ1", "الزبون أضاف صنفاً"),
                  t("retail.dEditReasonQ2", "الزبون غيّر الكمية"),
                  t("retail.dEditReasonQ3", "الزبون ألغى صنفاً"),
                  t("retail.dEditReasonQ4", "تصحيح غلط بالطلب"),
                ].map((q) => (
                  <button key={q} type="button" data-dreasonq
                    onClick={() => { playTap(); setReason((r) => (r.trim() === q ? "" : q)); }}
                    className={cn("rounded-xl px-2.5 py-1.5 text-2xs font-bold transition",
                      reason.trim() === q ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                    {q}
                  </button>
                ))}
              </div>
              <input data-dreason className="input"
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t("retail.dEditReasonPh", "أو اكتب سبباً خاصاً — اختياري")} />
              <p className="mt-1 text-2xs text-ink-subtle">{t("retail.dEditReasonHint", "إن كتبته يُختم داخل الفاتورة ويظهر بطباعتها. التعديل نفسه مسجَّل بسجل الحركات دائماً.")}</p>
            </div>

            {/* إبلاغ السائق */}
            {order.status === "out" && courier?.phone && (
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-surface-1 p-2.5 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                <Send size={14} className="text-sky-600" />
                <span className="text-ink">{t("retail.dEditNotify", { name: courier.name, defaultValue: "إبلاغ {{name}} بواتساب بعد الحفظ" })}</span>
              </label>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button className="flex-1" style={{ minHeight: 48 }} loading={saving} disabled={!changed || shortages.length > 0} onClick={() => void save()}>
                {t("retail.dEditSave", "حفظ التعديل")}
              </Button>
              <Button variant="secondary" style={{ minHeight: 48 }} onClick={onClose}>{t("common.cancel", "إلغاء")}</Button>
            </div>
            {!changed && <p className="text-center text-2xs text-ink-subtle">{t("retail.dEditNoChanges", "لا تغييرات بعد")}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
