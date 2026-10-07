import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Hash, AlertTriangle } from "lucide-react";
import type { DeliveryOrder } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { cleanRef, refTwin, MAX_REF_LEN } from "@/lib/deliverySearch";
import { invoiceNo } from "@/lib/invoiceNo";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * رقمُ الطلب بعد البيع (0225) — الشركةُ كثيراً ما تعطي رقمَها عند الاستلام لا
 * عند البيع، فلولا هذا الباب لبقي الحقلُ فارغاً بأغلب الطلبات.
 *
 * • يُكتب بنداءٍ مستقلّ (`updateDeliveryOrder` بالرقم وحده): الرقمُ مسموحٌ لكلّ
 *   الكادر، وإرسالُ الطلب لشركةٍ للمدير — رقمٌ محمولٌ مع الإرسال يسقط بسقوطه.
 * • والتكرارُ يُقال ولا يُمنع (لا فريدَ بالقاعدة): طلبٌ آخر لنفس الحامل بنفس
 *   الرقم يُسمّى باسمه ورقمِ فاتورته، والحفظُ يبقى بيد من يعرف.
 * • والماسحُ يعمل هنا بلا تدخّل: لا ماسحَ عامّاً بتبويب التوصيل، فالبوليصةُ
 *   تُكتب بالحقل وEnter يحفظ.
 * ========================================================================= */

export function OrderRefDialog({ order, orders, onClose, onSaved }: {
  order: DeliveryOrder;
  /** طلباتُ العيادة كلُّها — لتنبيه التكرار. */
  orders: DeliveryOrder[];
  onClose: () => void;
  onSaved: (o: DeliveryOrder) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [v, setV] = useState(order.courier_ref ?? "");
  const [busy, setBusy] = useState(false);
  const next = cleanRef(v);
  const twin = refTwin(orders, order, next);
  const unchanged = next === (order.courier_ref ?? null);

  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const o = await repo.updateDeliveryOrder(order.id, { courier_ref: value });
      playSuccess();
      toast.success(value
        ? t("retail.dRefSaved", { ref: value, defaultValue: "انحفظ رقم الطلب {{ref}}" })
        : t("retail.dRefCleared", "انمسح رقم الطلب"));
      onSaved(o ?? { ...order, courier_ref: value });
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={t("retail.dRefTitle", { name: order.customer_name || "—", defaultValue: "رقم الطلب — {{name}}" })}>
      <form className="space-y-3" data-drefdialog onSubmit={(e) => { e.preventDefault(); if (!unchanged) void save(next); }}>
        <p className="text-2xs text-ink-subtle">
          {t("retail.dRefHelp", { inv: invoiceNo(order.invoice_id), defaultValue: "رقم طلب شركة التوصيل (البوليصة) أو أي رقم تتابع بيه الطلب. فاتورته: {{inv}}" })}
        </p>
        <label className="flex items-center gap-2">
          <Hash size={16} className="shrink-0 text-sky-600" />
          {/* التركيزُ يحدّد الرقمَ القائم: مسحةٌ أو كتابةٌ **تستبدله** لا تُلصق به — كانت
              البوليصةُ الجديدة تُضاف لذيل القديمة وEnter يحفظ الاثنين رقماً واحداً. */}
          <input className="input flex-1 font-mono" dir="ltr" autoFocus maxLength={MAX_REF_LEN} data-drefinput
            onFocus={(e) => e.currentTarget.select()}
            value={v} onChange={(e) => setV(e.target.value)} placeholder={t("retail.dRefPh", "رقم الطلب (اختياري)")} />
        </label>
        {twin && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warn-50 px-2.5 py-1.5 text-2xs font-semibold text-warn-800 dark:bg-warn-500/10 dark:text-warn-200" data-dreftwin>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {t("retail.dRefTwin", { name: twin.customer_name || "—", inv: invoiceNo(twin.invoice_id), defaultValue: "نفس الرقم مسجّل على طلب {{name}} ({{inv}}) — تأكّد قبل الحفظ." })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="flex-1" loading={busy} disabled={unchanged} data-drefsave>{t("common.save", "حفظ")}</Button>
          {order.courier_ref && (
            <Button type="button" variant="secondary" disabled={busy} data-drefclear onClick={() => void save(null)}>{t("retail.dRefClear", "مسح الرقم")}</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
