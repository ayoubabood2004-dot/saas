import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bike, Search, Check, ShieldCheck, Send, Printer, Users, PackageOpen, Wallet, MapPin,
} from "lucide-react";
import type { Courier, DeliveryOrder } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { openDeliverySlip } from "@/lib/deliveryPrint";
import { invoiceNo } from "@/lib/invoicePrint";
import { cn, money, normalizeAr } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { sendWhatsApp } from "@/lib/quotas";
import { waNumber } from "@/lib/phone";
import { getDialCode } from "@/lib/settings";

/* ============================================================================
 * CourierSwapDialog — تبديل سائق طلبٍ خرج بالفعل.
 *
 * ── الحاجة من الميدان ────────────────────────────────────────────────────
 * قائمة السواق أسماءٌ متجاورة، والطبيب يضغط وهو يكلّم الزبون — فيروح الطلب
 * باسم سائقٍ غير الذي أخذه. الحلّ الوحيد قبل اليوم كان «الطلب رجع» ثم بيعٌ
 * جديد: فاتورةٌ تُلغى، ومخزونٌ يرجع ويُخصم ثانية، ورقمٌ يتبدّل بيد سائقٍ
 * يقف بالباب. ضغطةُ غلطٍ واحدة تكلّف ثلاث عمليات وسجلاً ملوَّثاً.
 *
 * ── لماذا التبديل آمنٌ بطبيعته ───────────────────────────────────────────
 * اسم السائق ليس رقماً بالحساب: الفاتورة والمخزون والمبلغ المستحقّ كلها
 * معلّقة بالطلب لا بحامله. فتبديل `courier_id` وحده ينقل الطلب من قائمة
 * سائقٍ لقائمة سائق، وتتبعه تلقائياً «فلوس بالطريق» لكلٍّ منهما و«استلام
 * الكل» — لأن اللوحة تجمّع بالحقل نفسه. لا مال يتحرّك، ولا سطر يتغيّر،
 * ولا رقم فاتورةٍ يتبدّل بيد أحد.
 *
 * ── وما لا يكفي وحده ─────────────────────────────────────────────────────
 * تبديلٌ لا يعرف به السواق تبديلٌ ناقص: الأول ما زال يحمل الوصل، والثاني
 * لا يعرف أن الطلب صار له. فالشاشة تُبلغ الاثنين بواتساب وتطبع وصلاً باسم
 * الجديد — والثلاثة اختيارات تُرى قبل الضغط لا بعده.
 * ==========================================================================*/

/** خيارات ما بعد الحفظ — كلها اختيارية، وكلها مرئية قبل الضغط. */
interface Opts { tellNew: boolean; tellOld: boolean; print: boolean }

export function CourierSwapDialog({
  order, couriers, current, onClose, onSaved,
}: {
  order: DeliveryOrder;
  couriers: Courier[];
  current: Courier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [opts, setOpts] = useState<Opts>({ tellNew: true, tellOld: true, print: true });

  const no = invoiceNo(order.invoice_id);
  const next = useMemo(() => couriers.find((c) => c.id === pick) ?? null, [couriers, pick]);

  /* المؤرشفون يبقون على الطلبات القديمة ولا يظهرون بالاختيار — إلا الحالي،
   * فإخفاؤه يجعل الطبيب يقارن باسمٍ لا يراه. */
  const options = useMemo(() => {
    const s = normalizeAr(q.trim().toLowerCase());
    return couriers
      .filter((c) => c.active || c.id === current?.id)
      .filter((c) => !s || normalizeAr(c.name.toLowerCase()).includes(s) || (c.phone ?? "").includes(q.trim()));
  }, [couriers, q, current?.id]);

  const REASONS = [
    t("retail.swapReason1", "اختير سائق بالغلط"),
    t("retail.swapReason2", "السائق انشغل بطلب ثاني"),
    t("retail.swapReason3", "المنطقة أقرب للسائق الثاني"),
    t("retail.swapReason4", "السائق ما قدر يوصل"),
  ];

  /* ---- الحفظ: حقلٌ واحد يتغيّر، والباقي إبلاغٌ وطباعة ---------------------- */
  const save = async () => {
    if (saving || !next || next.id === current?.id) return;
    setSaving(true);
    try {
      await repo.updateDeliveryOrder(order.id, { courier_id: next.id });
      /* سجل الحركات يلتقط الصف بعد التعديل، لكنه لا يعرف مَن كان قبله —
       * وهذا بالذات ما يُسأل عنه لاحقاً. فنكتب الاسمين معاً. */
      void repo.logClientEvent("delivery.courierSwap", {
        ref: no,
        from: current?.name ?? null,
        to: next.name,
        customer: order.customer_name ?? null,
        reason: reason.trim() || null,
      });
      playSuccess();
      toast.success(t("retail.swapDone", { name: next.name, defaultValue: "الطلب صار مع {{name}}" }));

      /* الإبلاغ والطباعة بعد نجاح الحفظ فقط: رسالةٌ عن تبديلٍ لم يُحفظ أسوأ
       * من لا رسالة. والجديد أولاً — هو من ينتظر الطلب الآن. */
      const text = (key: string, def: string, c: Courier) => t(key, {
        name: c.name, no, customer: order.customer_name ?? "", zone: order.zone ?? order.address ?? "",
        n: money(order.cod_amount), other: (c.id === next.id ? current?.name : next.name) ?? "",
        defaultValue: def,
      });
      if (opts.tellNew && next.phone) {
        try {
          await sendWhatsApp({
            phone: waNumber(next.phone, getDialCode()),
            text: text("retail.swapWaNew", "طلب #{{no}} صار عندك — الزبون {{customer}} · {{zone}} · تستلم منه {{n}}.", next),
            ownerName: order.customer_name ?? null, ownerPhone: order.customer_phone ?? null, kind: "manual",
          });
        } catch { /* الحصة أو نافذة محجوبة — التبديل محفوظ على أي حال */ }
      }
      if (opts.tellOld && current?.phone) {
        try {
          await sendWhatsApp({
            phone: waNumber(current.phone, getDialCode()),
            text: text("retail.swapWaOld", "طلب #{{no}} ({{customer}}) ما عاد عندك — راح مع {{other}}. لا تحتاج توصله.", current),
            ownerName: order.customer_name ?? null, ownerPhone: order.customer_phone ?? null, kind: "manual",
          });
        } catch { /* نافذة ثانية قد تُحجب — الرسالة الأهم راحت للجديد */ }
      }
      if (opts.print) openDeliverySlip({ ...order, courier_id: next.id }, next, no);

      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setSaving(false); }
  };

  /* ---- إرجاعه لقيد التجهيز: غلطٌ بالإرسال كلّه لا بالاسم وحده ------------- */
  const unassign = async () => {
    if (saving) return;
    if (!window.confirm(t("retail.swapUndoConfirm", "إرجاع الطلب لقيد التجهيز وسحبه من السائق؟ الفاتورة والمخزون لا يتغيّران."))) return;
    setSaving(true);
    try {
      await repo.updateDeliveryOrder(order.id, { courier_id: null, status: "preparing", dispatched_at: null });
      void repo.logClientEvent("delivery.courierUnassign", { ref: no, from: current?.name ?? null, customer: order.customer_name ?? null });
      playSuccess();
      toast.success(t("retail.swapUndone", "رجع لقيد التجهيز — اختر السائق الصحيح وأرسله."));
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={t("retail.swapTitle", "تبديل السائق")}>
      <div className="space-y-3.5" data-cswap>
        {/* الطلب المعني — حتى لا يُبدَّل سائق طلبٍ آخر بالغلط */}
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <PackageOpen size={15} className="shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{order.customer_name ?? "—"}</p>
            <span className="text-2xs text-ink-subtle">#{no}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-muted">
            {(order.zone || order.address) && (
              <span className="flex min-w-0 items-center gap-1"><MapPin size={11} className="shrink-0" /> <span className="truncate">{order.zone || order.address}</span></span>
            )}
            <span className="flex items-center gap-1 font-bold text-sky-700 dark:text-sky-300">
              <Wallet size={12} /> {money(order.cod_amount)}
            </span>
          </div>
        </div>

        {/* الوعد صريحٌ قبل الضغط: هذا تبديل اسمٍ لا إرجاع طلب */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-success-300 bg-success-50 p-3 text-sm dark:border-success-500/40 dark:bg-success-500/10">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-success-600" />
          <p className="text-success-800 dark:text-success-200">
            {t("retail.swapSafe", "الفاتورة والمخزون والمبلغ لا يتغيّر منها شيء — الطلب ينتقل من قائمة سائق لقائمة سائق فقط.")}
          </p>
        </div>

        {/* السائق الحالي ← الجديد */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-ink">{t("retail.swapPickNew", "اختر السائق الصحيح")}</label>
          {couriers.filter((c) => c.active).length > 6 && (
            <div className="relative mb-1.5">
              <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input data-cswapsearch className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t("retail.swapSearchPh", "ابحث باسم السائق أو هاتفه…")} />
            </div>
          )}
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {options.length === 0 && (
              <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-subtle">{t("retail.deliveryNoCouriersYet", "لا يوجد سواق بعد — أضفهم من «سجل السواق».")}</p>
            )}
            {options.map((c) => {
              const isCur = c.id === current?.id;
              const isPick = c.id === pick;
              return (
                <button key={c.id} type="button" data-cswapopt={c.id} disabled={isCur}
                  onClick={() => { playTap(); setPick(c.id); }}
                  className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition",
                    isCur ? "cursor-default border-line bg-surface-2 opacity-70"
                      : isPick ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/30 dark:bg-sky-500/10"
                        : "border-line bg-surface-1 hover:border-sky-300 hover:bg-surface-2")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    isPick ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300")}>
                    {isPick ? <Check size={18} /> : <Bike size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                    {c.phone && <span className="block text-xs text-ink-subtle" dir="ltr">{c.phone}</span>}
                  </span>
                  {isCur && <span className="chip shrink-0 bg-surface-3 text-2xs font-bold text-ink-muted">{t("retail.swapCurrent", "الحالي")}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* السبب — اختياري، وضغطةٌ واحدة تكفيه */}
        <div>
          <label className="mb-1 block text-xs font-bold text-ink">{t("retail.swapReason", "سبب التبديل (اختياري)")}</label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" data-cswapreason
                onClick={() => { playTap(); setReason((cur) => (cur.trim() === r ? "" : r)); }}
                className={cn("rounded-xl px-2.5 py-1.5 text-2xs font-bold transition",
                  reason.trim() === r ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* ما يصل السواق — تبديلٌ لا يعرفون به تبديلٌ ناقص */}
        <div className="space-y-1.5">
          {next?.phone && (
            <Toggle tag="new" checked={opts.tellNew} onChange={(v) => setOpts((o) => ({ ...o, tellNew: v }))}
              icon={<Send size={14} className="text-sky-600" />}
              label={t("retail.swapTellNew", { name: next.name, defaultValue: "إبلاغ {{name}} بواتساب أن الطلب صار عنده" })} />
          )}
          {current?.phone && (
            <Toggle tag="old" checked={opts.tellOld} onChange={(v) => setOpts((o) => ({ ...o, tellOld: v }))}
              icon={<Send size={14} className="text-amber-600" />}
              label={t("retail.swapTellOld", { name: current.name, defaultValue: "إبلاغ {{name}} أن الطلب ما عاد عنده" })} />
          )}
          <Toggle tag="print" checked={opts.print} onChange={(v) => setOpts((o) => ({ ...o, print: v }))}
            icon={<Printer size={14} className="text-ink-muted" />}
            label={t("retail.swapPrint", "اطبع وصلاً جديداً باسم السائق الجديد")} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button className="flex-1" style={{ minHeight: 48 }} loading={saving} disabled={!next || next.id === current?.id}
            leftIcon={<Bike size={16} />} onClick={() => void save()}>
            {next && next.id !== current?.id
              ? t("retail.swapSaveTo", { name: next.name, defaultValue: "بدّله إلى {{name}}" })
              : t("retail.swapSave", "بدّل السائق")}
          </Button>
          <Button variant="secondary" style={{ minHeight: 48 }} onClick={onClose}>{t("common.cancel", "إلغاء")}</Button>
        </div>

        {/* الغلط قد يكون بالإرسال كلّه لا بالاسم — فمخرجٌ ثانٍ بلا إرجاع */}
        {order.status === "out" && (
          <button type="button" data-cswapundo onClick={() => void unassign()} disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-2xs font-bold text-ink-subtle transition hover:bg-surface-2 hover:text-ink">
            <Users size={13} /> {t("retail.swapUndo", "أو أرجعه لقيد التجهيز — بلا سائق")}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** صفُّ اختيارٍ بهدف لمسٍ كامل — المربّع وحده هدفٌ صغير على آيباد بيدٍ مشغولة. */
function Toggle({ tag, checked, onChange, icon, label }: {
  tag: string; checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-surface-1 p-2.5 text-sm">
      <input type="checkbox" data-cswaptoggle={tag} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-sky-600" />
      {icon}
      <span className="min-w-0 flex-1 text-ink">{label}</span>
    </label>
  );
}
