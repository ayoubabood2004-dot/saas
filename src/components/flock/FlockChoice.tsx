/* ============================================================================
 * اختيارٌ واحدٌ من قليل، بعرض السطر كلّه — بكلّ نوافذ حالة الحقل (نوعُ الزيارة، سريعة/كاملة، مصدرُ النافق، حالُ
 * التحصين ومن أعطاه، سببُ الإغلاق، نوعُ الوجبة). طلبُ المالك (٢٤/١١): «لو اكو تبويبات تصير صغيرة كبرها على حجم
 * الشاشة» — كانت شرائحَ صغيرة بزاوية السطر؛ صارت أزراراً متساوية بارتفاع إصبع تملأ العرض.
 * بلا نصّ: الأسماءُ ممّن يرسمه (نطاقُه)، فلا يحتاج نطاقاً ولا يُسأل عنه حارسُ القاموس.
 * ========================================================================= */
import { cn } from "@/lib/utils";

/** أعمدةٌ بعدد الخيارات — والأربعةُ صفّان بالهاتف (أربعةٌ بعرض ٣٩٠ تقصّ «نفاد/نفوق»). أصنافٌ حرفية ليراها Tailwind. */
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

export function Choice<T extends string | boolean | null>({ value, options, label, onChange, data, disabled }: {
  value: T | ""; options: readonly T[]; label: (k: T) => string; onChange: (k: T) => void;
  /** يُكتب `data-flock-<data>="<الخيار>"` على كلّ زرّ — مقبضُ الفحص والمشي بالمتصفّح. */
  data?: string; disabled?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", COLS[options.length] ?? "grid-cols-2 sm:grid-cols-4")} role="radiogroup">
      {options.map((k) => (
        <button key={String(k)} type="button" role="radio" aria-checked={value === k} disabled={disabled} onClick={() => onChange(k)}
          {...(data ? { [`data-flock-${data}`]: String(k) } : {})}
          className={cn("min-h-11 rounded-xl px-2 py-1.5 text-sm font-bold leading-tight transition disabled:opacity-50",
            value === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
          {label(k)}
        </button>
      ))}
    </div>
  );
}
