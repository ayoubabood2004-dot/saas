import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { DollarSign } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";

/* ============================================================================
 * فاتورةٌ بمجموعين (0283) بشاشة البيع — قطعةٌ كسولة بنطاقها المملوك mxp (نطاقُ «retail» حارٌّ يدفعه الإقلاع).
 *
 * بلاغُ المالك (٢٠/١١): «أريد تسعيرين بنفس الوقت — مو الدولار والعراقي نفس الرقم». فسطرُ الدولار لا يُحوَّل لدينار: سطورُ الدولار
 * تُجمع بالدولار بصندوقٍ وحدها — خصمُها بالدولار، وما يُدفع منها بالدولار (جزءٌ مسموح)، والباقي دَينٌ بالدولار يُسدَّد بعدها بسعر يومه.
 * الحسابُ بـSaleBuilder (سنتاتٌ صحيحة كما يحسبها usd_checkout)؛ هنا العرضُ وما يُقال وحده.
 * ==========================================================================*/

/** «12.50» ⇒ ١٢٥٠ سنتاً؛ وما لا يُقرأ رقماً null (الخانةُ تقوله لا تُخمّن). الفارغُ صفر. */
export function usdCentsIn(s: string): number | null {
  const v = s.trim().replace(/[$\s,]/g, "").replace(/\u066B/g, ".");
  if (v === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}
export const usdOf = (c: number): string => `$${(c / 100).toFixed(2)}`;

/** ما تقوله شاشةُ البيع قبل البيعة (النطاقُ المملوك لا يُقرأ خارج صاحبه — تُنادى بـimport()). */
export const mixedSay = (k: "delivery" | "backdate" | "bad" | "debtName" | "notReady"): string => i18n.t(`mxp.say.${k}`);

export type UsdMethod = "cash" | "card" | "transfer";

/** صندوقُ الدولار تحت مجموع الدينار: المجموعُ والخصمُ وما يُدفع الآن والباقي دَيناً — كلُّه بالدولار. */
export function UsdPayBox({ subC, discC, totalC, paidC, debtC, disc, onDisc, paid, onPaid, method, onMethod, rate, nameMissing }: {
  subC: number; discC: number; totalC: number; paidC: number; debtC: number;
  disc: string; onDisc: (v: string) => void;
  /** null = يدفع كلَّه (الافتراض). */
  paid: string | null; onPaid: (v: string | null) => void;
  method: UsdMethod; onMethod: (m: UsdMethod) => void;
  /** سعرُ صرف اليوم كما يعرفه الجهاز (للتذكير وحده — المجموعُ بالدولار لا يتغيّر به). */
  rate: number | null;
  nameMissing: boolean;
}) {
  const { t } = useTranslation();
  const discBad = usdCentsIn(disc) == null;
  const paidBad = paid != null && usdCentsIn(paid) == null;
  const methods: UsdMethod[] = ["cash", "card", "transfer"];
  return (
    <div data-usdbox className="space-y-2 rounded-2xl border border-success-200 bg-success-50/60 p-3 text-sm dark:border-success-500/30 dark:bg-success-500/10">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-bold text-success-800 dark:text-success-200"><DollarSign size={14} /> {t("mxp.title")}</span>
        <span className="tabular-nums text-ink-muted" dir="ltr">{usdOf(subC)}</span>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{t("mxp.disc")}</span>
        <input data-usddisc className={cn("input h-8 w-24 text-end tabular-nums", discBad && "border-danger-400")} dir="ltr" inputMode="decimal" placeholder="0.00"
          value={disc} onChange={(e) => onDisc(e.target.value)} />
      </label>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-ink">{t("mxp.total")}</span>
        <span data-usdtotal className="font-display text-xl font-extrabold tabular-nums text-ink" dir="ltr">{usdOf(totalC)}</span>
      </div>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label={t("mxp.method")}>
        {methods.map((m) => (
          <button key={m} type="button" data-usdmethod={m} aria-pressed={method === m} onClick={() => onMethod(m)}
            className={cn("h-8 rounded-lg border text-2xs font-extrabold transition",
              method === m ? "border-success-500 bg-success-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
            {t(`mxp.m.${m}`)}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{t("mxp.paid")}</span>
        <span className="flex items-center gap-1">
          <button type="button" data-usdpaidall onClick={() => onPaid(null)} className={cn("h-8 rounded-lg px-2 text-2xs font-bold", paid == null ? "bg-success-600 text-white" : "bg-surface-2 text-ink-muted")}>{t("mxp.all")}</button>
          <button type="button" data-usdpaidnone onClick={() => onPaid("0")} className={cn("h-8 rounded-lg px-2 text-2xs font-bold", paid != null && usdCentsIn(paid) === 0 ? "bg-warn-600 text-white" : "bg-surface-2 text-ink-muted")}>{t("mxp.none")}</button>
          <input data-usdpaid className={cn("input h-8 w-24 text-end tabular-nums", paidBad && "border-danger-400")} dir="ltr" inputMode="decimal"
            value={paid ?? (totalC / 100).toFixed(2)} onChange={(e) => onPaid(e.target.value)} />
        </span>
      </label>
      {(discBad || paidBad) && <p data-usdbad className="text-2xs font-bold text-danger-600">{t("mxp.say.bad")}</p>}
      {!discBad && !paidBad && (discC > 0 || paid != null) && (
        <p data-usdread className="text-2xs text-ink-subtle">{t("mxp.read", { disc: usdOf(discC), paid: usdOf(paidC) })}</p>
      )}
      {debtC > 0 && (
        <div data-usddebt className="flex items-center justify-between rounded-lg bg-warn-50 px-2 py-1 text-xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">
          <span>{t("mxp.debt")}</span><span className="tabular-nums" dir="ltr">{usdOf(debtC)}</span>
        </div>
      )}
      {debtC > 0 && nameMissing && <p className="text-2xs font-semibold text-danger-600">{t("mxp.say.debtName")}</p>}
      <p className="text-2xs text-ink-subtle">{rate ? t("mxp.rate", { rate: formatNum(rate) }) : t("mxp.noRate")}</p>
    </div>
  );
}

/** «تمّ البيع»: فاتورةُ الدولار المربوطة — مجموعُها وما دُفع منها وما بقي دَيناً بالدولار. */
export function UsdDoneNote({ no, totalC, paidC }: { no: string; totalC: number; paidC: number }) {
  const { t } = useTranslation();
  const debt = Math.max(0, totalC - paidC);
  return (
    <div data-usddone className="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-sm dark:border-success-500/30 dark:bg-success-500/10">
      <div className="flex items-center justify-between font-bold text-success-800 dark:text-success-200">
        <span className="flex items-center gap-1.5"><DollarSign size={14} /> {t("mxp.doneTitle", { no })}</span>
        <span className="font-display text-lg tabular-nums" dir="ltr">{usdOf(totalC)}</span>
      </div>
      <p className="mt-0.5 text-2xs text-ink-subtle">
        {debt > 0 ? t("mxp.doneDebt", { paid: usdOf(paidC), debt: usdOf(debt) }) : t("mxp.donePaid")}
      </p>
    </div>
  );
}
