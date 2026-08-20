import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, Check, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { cn, formatNum } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * QtyPad — لوحة أرقام الكمية.
 *
 * البيع بالجملة الصغيرة (عشرون قطعة من صنف واحد) كان يكلّف الطبيب إمّا عشرين
 * مسحة أو عشرين ضغطة على «+». لوحة الأرقام تحوّله لضغطتين — وهي المدخل
 * **اللمسي** للفكرة نفسها التي يعطيها المضاعِف بالكيبورد، فالآيباد بلا كيبورد
 * لا يبقى بلا حلّ.
 *
 * تُستعمل بوجهين: ضبط كمية سطر قائم، أو تسليح مضاعِف قبل المسح. الفرق نصٌّ
 * فقط — الحساب واحد فلا يفترق سلوكان.
 *
 * الأهداف ٥٦px (فوق معيار WCAG 2.5.5 بكثير): الكاشير يضغط واقفاً ومستعجلاً،
 * وضغطة خاطئة هنا تعني كمية خاطئة بالفاتورة والمخزون معاً.
 * ==========================================================================*/

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function QtyPad({
  open, title, hint, initial, max, quick = [5, 10, 12, 20, 50], submitLabel, onClose, onSubmit,
}: {
  open: boolean;
  title: string;
  /** سطر توضيحي تحت العنوان (اسم الصنف مثلاً). */
  hint?: string;
  initial?: number;
  /** السقف المتاح (المخزون). Infinity = بلا سقف. */
  max?: number;
  quick?: number[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (n: number) => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");

  // كل فتحة تبدأ من الصفر بشاشة فارغة تعرض الكمية الحالية باهتة: الكتابة فوق
  // رقم موجود كانت تنتج ٢٠٣ حين أراد الطبيب ٢٠ ثم ٣.
  useEffect(() => { if (open) setRaw(""); }, [open]);

  const cap = max == null || !Number.isFinite(max) ? Infinity : Math.max(0, Math.floor(max));
  const typed = raw === "" ? (initial ?? 0) : Number(raw);
  const over = typed > cap;
  const value = Math.min(typed, cap);

  const press = (k: string) => {
    playTap();
    setRaw((r) => (r + k).replace(/^0+(?=\d)/, "").slice(0, 5));
  };
  const submit = () => {
    if (value <= 0) { playWarning(); return; }
    onSubmit(value);
  };

  // مفاتيح الكيبورد تعمل داخل اللوحة أيضاً — من عنده كيبورد لا يُجبر على اللمس.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); setRaw((r) => r.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, raw, cap, initial]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3" data-qtypad>
        {hint && <p className="truncate text-sm text-ink-subtle">{hint}</p>}

        {/* الشاشة */}
        <div className={cn(
          "flex items-baseline justify-center gap-2 rounded-2xl border-2 px-4 py-3",
          over ? "border-danger-300 bg-danger-50 dark:border-danger-500/40 dark:bg-danger-500/10" : "border-line bg-surface-2",
        )}>
          <span data-qtypadval className={cn("font-display text-4xl font-extrabold tabular-nums", raw === "" ? "text-ink-subtle" : "text-ink")}>
            {formatNum(value)}
          </span>
          {Number.isFinite(cap) && (
            <span className="text-2xs font-bold text-ink-subtle">{t("retail.qtyPadMax", { n: formatNum(cap), defaultValue: "المتوفّر {{n}}" })}</span>
          )}
        </div>
        {over && (
          <p className="rounded-xl bg-danger-50 px-3 py-1.5 text-2xs font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
            {t("retail.qtyPadClamped", { n: formatNum(cap), defaultValue: "المخزون لا يكفي — ستُضاف {{n}} فقط" })}
          </p>
        )}

        {/* اختصارات الكميات الشائعة — الطريق الأقصر لأكثر الحالات تكراراً */}
        <div className="flex flex-wrap gap-1.5">
          {quick.map((n) => (
            <button key={n} data-qtyquick onClick={() => { playTap(); setRaw(String(n)); }}
              className="min-w-[3.25rem] rounded-xl bg-surface-2 px-3 py-2 text-sm font-extrabold tabular-nums text-ink-muted transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/15">
              ×{formatNum(n)}
            </button>
          ))}
        </div>

        {/* لوحة الأرقام */}
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.slice(0, 9).map((k) => (
            <button key={k} data-qtykey={k} onClick={() => press(k)}
              className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-xl font-extrabold text-ink transition hover:bg-surface-2 active:bg-surface-3">
              {formatNum(Number(k))}
            </button>
          ))}
          <button data-qtyclear onClick={() => { playTap(); setRaw(""); }}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition hover:bg-surface-2">
            <X size={20} />
          </button>
          <button data-qtykey="0" onClick={() => press("0")}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-xl font-extrabold text-ink transition hover:bg-surface-2 active:bg-surface-3">
            {formatNum(0)}
          </button>
          <button data-qtyback onClick={() => { playTap(); setRaw((r) => r.slice(0, -1)); }}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition hover:bg-surface-2">
            <Delete size={20} className="rtl:rotate-180" />
          </button>
        </div>

        <Button data-qtydone className="w-full" style={{ minHeight: 52 }} leftIcon={<Check size={18} />} disabled={value <= 0} onClick={submit}>
          {submitLabel ?? t("common.done", "تم")}
        </Button>
      </div>
    </Modal>
  );
}
