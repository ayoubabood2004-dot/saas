import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn, money } from "@/lib/utils";

/* ============================================================================
 * نسبةُ الراجع بشاشة البيع (المالك، ١٠/١١) — قطعةٌ كسولة بنطاقها المملوك rpct.
 *
 * «بالعادة الراجع يرجع كلّ المبلغ، بس أكو عيادات تريد ترجع جزء من السعر». فالقطعةُ ترجع للمخزن كاملةً بأيّ
 * نسبة والكلفةُ تُعكس كاملة، ويُردّ للزبون نسبةٌ من السعر — والباقي يبقى للعيادة. الحسابُ كلُّه بـSaleBuilder
 * (`lineUnit`: سعرٌ واحد يُجمع ويُطبع ويُرسل)؛ هنا العرضُ وحده: الشريطُ تحت زرّ «راجع»، وملاحظةُ الإرجاع الخالص.
 *
 * وسؤالُ المالك نفسِه («زبون ماخذها بالدين — تنحذف من دفتر ديونه؟») جوابُه من الشِفرة: **الإرجاعُ الخالص من
 * هنا لا يمسّ الديون** — retail_return يكتب سحباً «مرتجع» من الدرج (0132) ولا يعرف فاتورة. والذي ينقص الدين
 * «المرتجع» على الفاتورة نفسِها (return_invoice_items، 0121): الدينُ ينقص أوّلاً ولا نقدَ يخرج إلا بما دفعه
 * فوق ما بقي. والشريطُ القديم كان يقول «يتقاص من حساب الزبون» — فيُصدَّق أن الدينَ نقص. الآن يُقال بالشريط ما
 * يحدث فعلاً، وبالإرجاع الخالص سؤالُ «ماخذها بالدين؟» وزرٌّ يفتح «المرتجع» بالبحث عنه.
 * ==========================================================================*/

/** النسبُ كما سمّاها المالك، والافتراضُ ١٠٠ أوّلاً. */
export const RET_PCTS = [100, 75, 50, 30, 25, 20] as const;

/** تحت زرّ «راجع» ما دام فعّالاً: كم يُردّ للزبون، وما يحدث بالمال. */
export function RetModeBar({ pct, onPick }: { pct: number; onPick: (p: number) => void }) {
  const { t } = useTranslation();
  return (
    <div data-retpctbar className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/15">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("rpct.label")}>
        <span className="text-2xs font-extrabold text-amber-800 dark:text-amber-200">{t("rpct.label")}</span>
        {RET_PCTS.map((p) => (
          <button key={p} type="button" data-retpct={p} aria-pressed={pct === p} onClick={() => onPick(p)}
            className={cn("h-8 rounded-full border px-2.5 text-xs font-extrabold tabular-nums transition",
              pct === p ? "border-amber-500 bg-amber-500 text-white shadow-soft"
                : "border-line bg-surface-1 text-ink-muted hover:border-amber-300 hover:text-amber-700")}>
            {`${p}%`}
          </button>
        ))}
      </div>
      <p data-retpcthow className="text-2xs font-semibold text-amber-800 dark:text-amber-200">{t("rpct.how")}</p>
    </div>
  );
}

/** بالإرجاع الخالص (السلّةُ كلُّها راجع): ما يبقى للعيادة بنسبةٍ أقلّ من ١٠٠، وسؤالُ الدين وطريقُه الصحيح. */
export function RetPureNote({ pct, full, back, onOpenReturns }: { pct: number; full: number; back: number; onOpenReturns?: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-retpurenote className="space-y-2">
      {pct < 100 && (
        <p data-retkeep className="text-2xs font-bold text-warn-800 dark:text-warn-200">
          {t("rpct.keep", { back: money(back), pct, full: money(full) })}
        </p>
      )}
      <div data-retdebt className="flex items-start gap-1.5 rounded-xl bg-surface-1 px-2.5 py-2 text-2xs font-semibold text-ink">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn-600" />
        <span className="min-w-0 flex-1">{t("rpct.debt")}</span>
      </div>
      {onOpenReturns && (
        <button type="button" data-retopen onClick={onOpenReturns}
          className={cn("flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-warn-300 bg-surface-1 text-xs font-extrabold text-warn-800 transition hover:bg-warn-100",
            "dark:border-warn-500/40 dark:text-warn-200")}>
          <RotateCcw size={14} /> {t("rpct.open")}
        </button>
      )}
    </div>
  );
}
