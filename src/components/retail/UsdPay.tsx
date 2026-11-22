import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { DollarSign, Pencil } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import type { UsdRate } from "@/lib/usdApi";
import { farFrom, rateOfPer100, rateOk } from "@/lib/usdMath";
import { playSuccess, playWarning } from "@/lib/sounds";
import { describeDbError, isNetworkError } from "@/lib/errors";

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
export const mixedSay = (k: "delivery" | "backdate" | "bad" | "debtName" | "notReady" | "usdOnly", name?: string): string => i18n.t(`mxp.say.${k}`, { name });

export type UsdMethod = "cash" | "card" | "transfer";

/** صندوقُ الدولار تحت مجموع الدينار: المجموعُ والخصمُ وما يُدفع الآن والباقي دَيناً — كلُّه بالدولار. */
export function UsdPayBox({ subC, discC, totalC, paidC, debtC, disc, onDisc, paid, onPaid, method, onMethod, rate, nameMissing, onRate }: {
  subC: number; discC: number; totalC: number; paidC: number; debtC: number;
  disc: string; onDisc: (v: string) => void;
  /** null = يدفع كلَّه (الافتراض). */
  paid: string | null; onPaid: (v: string | null) => void;
  method: UsdMethod; onMethod: (m: UsdMethod) => void;
  /** سعرُ صرف اليوم كما يعرفه الجهاز (للتذكير وحده — المجموعُ بالدولار لا يتغيّر به). */
  rate: number | null;
  nameMissing: boolean;
  /** 0286: «غيّر سعر الدولار» من الصندوق نفسِه — الطبيبُ يحدّد سعرَ اليوم من أيّ شاشة (قرارُ المالك ٢١/١١). */
  onRate?: () => void;
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
      <p className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
        <span className="min-w-0 flex-1">{rate ? t("mxp.rate", { rate: formatNum(rate) }) : t("mxp.noRate")}</span>
        {onRate && (
          <button type="button" data-usdrate-edit onClick={onRate} className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline">
            <Pencil size={11} /> {t("mxp.rateEdit")}
          </button>
        )}
      </p>
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

/** 0286: سعرُ الدولار اليوم من شاشة البيع — بلا الإعدادات وبلا المدير (قرارُ المالك ٢١/١١: «يكدر الدكتور يغير سعر الدولار وين ما جان»).
 *  يكتب سطراً جديداً بـclinic_fx_rates (من حدّده ومتى)، وسطورُ الدولار بالسلّة تأخذه (SaleBuilder: onSaved). سعرُ المئة كما يقوله
 *  السوق («150,000»)، وتحته الدولارُ الواحد — خلطُ الاثنين يمسكه حدّا الخادم (١٠٠–١٠٠٬٠٠٠ للدولار). */
const RATE_ERRS = new Set(["usd_rate_bad", "usd_rate_manager", "usd_operator", "usd_disabled"]);
export function UsdRateDialog({ current, onClose, onSaved }: { current: bigint | null; onClose: () => void; onSaved: (r: UsdRate) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [per100, setPer100] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const typed = per100.trim() === "" ? null : rateOfPer100(per100);
  const ok = typed != null && rateOk(typed);
  /* سعرُ اليوم للعيادة كلّها (0286 — بلا مدير): صفرٌ زائدٌ أو ناقص بعيدٌ عن المسجّل بأكثر من ٢٠٪ يُقال ويحتاج ضغطةً ثانية. */
  const [farAck, setFarAck] = useState<string | null>(null);
  const far = ok && current != null && farFrom(typed!, [current]);
  const farPending = far && farAck !== per100.trim();
  const save = async () => {
    if (!ok || busy) return;
    if (farPending) { playWarning(); setFarAck(per100.trim()); return; }
    setBusy(true);
    try {
      const { usdApi } = await import("@/lib/usdApi");   // البابُ كسول (usd-test): لا استيرادَ ثابتاً خارج قطعة الدولار
      const r = await usdApi.setRate(per100, null);
      playSuccess();
      toast.success(t("mxp.rateSaved", { v: formatNum(Number(r.rate1e4) / 100) }));
      onSaved(r);
    } catch (e) {
      playWarning();
      const code = (e as { message?: string } | null)?.message ?? "";
      setErr(RATE_ERRS.has(code) ? t(`mxp.rateErr.${code}`) : isNetworkError(e) ? t("mxp.rateFailed") : describeDbError(e, t));
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={t("mxp.rateTitle")}>
      <form className="space-y-3" data-usdrate-dialog onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="text-sm text-ink-muted">
          {current ? t("mxp.rateNow", { v: formatNum(Number(current) / 100), one: formatNum(Number(current) / 10_000) }) : t("mxp.rateNone")}
        </p>
        <label className="block">
          <span className="label">{t("mxp.rateNew")}</span>
          <input data-usdrate-input autoFocus className={cn("input tabular-nums", per100.trim() !== "" && !ok && "border-danger-400")} dir="ltr" inputMode="decimal"
            placeholder="150,000" value={per100} onChange={(e) => { setPer100(e.target.value); setErr(null); }} />
          {per100.trim() !== "" && (
            <span className={cn("mt-1 block text-xs font-semibold", ok ? "text-ink-muted" : "text-danger-600")}>
              {ok ? t("mxp.rateOne", { v: formatNum(Number(typed) / 10_000) }) : t("mxp.rateBad")}
            </span>
          )}
        </label>
        {far && <p className="rounded-lg bg-warn-50 p-2 text-xs font-semibold text-warn-800 dark:bg-warn-500/10 dark:text-warn-200" role="alert" data-usdrate-far>{t("mxp.rateFar", { cur: formatNum(Number(current) / 100) })}</p>}
        {err && <p className="text-xs font-semibold text-danger-600" role="alert">{err}</p>}
        <p className="text-2xs text-ink-subtle">{t("mxp.rateHint")}</p>
        <Button type="submit" className="w-full" loading={busy} disabled={!ok} data-usdrate-save>{t(far && farAck === per100.trim() ? "mxp.rateFarGo" : "mxp.rateSave")}</Button>
      </form>
    </Modal>
  );
}
