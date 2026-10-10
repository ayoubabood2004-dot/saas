import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Loader2, Pill } from "lucide-react";
import type { Species } from "@/types";
import type { PickedMed } from "@/lib/medIndex";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * MedPicker — منتقي الأدوية الواحد لكلّ شاشةٍ يُختار فيها دواء.
 *
 * كان لكلّ شاشةٍ منتقيها: ورقةُ المعالج بأبوابها (والقصُّ عند ١٢٠)، ونافذةُ الزيارة بحقلِ
 * كتابةٍ يفتح الكيبورد، وورقةُ الطبلة بخمسةِ اقتراحاتٍ من الدليل وحده، ونموذجُ السجلّ
 * بقائمتين إنكليزيّتين، وكلٌّ يكتب الدواءَ بنصٍّ غيرِ نصّ أخيه. فصارت «أدويتي» — قائمةُ
 * العيادة المرتّبة — لا تظهر إلا بواحدة.
 *
 * هذا الملفّ صغيرٌ ويُستورد ثابتاً: الغلاف، و`MedField` (زرٌّ كبير يفتح المنتقي باختيارٍ
 * واحد)، و`useMedPickerOpen` (البيعُ يطفئ الماسحَ وF2 ما دام مفتوحاً)، وتحميلٌ مسبقٌ
 * بالخمول. والورقةُ نفسُها (dnd-kit واللوحة) كسولةٌ بـ`MedPickerSheet`.
 * المضيفُ يحتفظ بكلّ ما بعد الاختيار: الجرعة والطريق والتكرار والأيام والسعر والكمية.
 * ==========================================================================*/

export interface MedPickerProps {
  open: boolean;
  onClose(): void;
  /** multi: الضغطةُ تضيف وتشيل + «تم · n» · single: اختيارٌ ثم يغلق المضيف · manage: الإعدادات. */
  mode: "multi" | "single" | "manage";
  onPick?(m: PickedMed): void;
  onUnpick?(m: PickedMed): void;
  isSelected?(m: PickedMed): boolean;
  species?: Species | null;
  /** offer: [هالمرة بس] [احفظه بأدويتي] · oneOff: [هالمرة بس] وحده · off: بلا كتابة. */
  freeText?: "offer" | "oneOff" | "off";
  /** محرّرُ البروتوكول: ما له جرعةٌ موثّقة وحده — وكلُّه. */
  only?: "dosable";
  stock?: "show" | "hide";
  title?: string;
}

/* ── مفتوحٌ الآن؟ عدّادٌ على مستوى الوحدة — البيعُ يسأله قبل الماسح وF2 ─────────── */
let openCount = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useMedPickerOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openCount > 0, () => false);
}

const loadSheet = () => import("./MedPickerSheet");
const Sheet = lazy(loadSheet);
let prefetched = false;
/** الورقةُ تُجلب بالخمول حين يُرسم مضيفٌ — أوّلُ ضغطةٍ على «أضف دواء» لا تنتظر الشبكة. */
function usePrefetchSheet() {
  useEffect(() => {
    if (prefetched) return;
    prefetched = true;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const go = () => { void loadSheet().catch(() => { prefetched = false; }); };
    if (w.requestIdleCallback) w.requestIdleCallback(go);
    else setTimeout(go, 1200);
  }, []);
}

export function MedPicker(props: MedPickerProps) {
  usePrefetchSheet();
  useEffect(() => {
    if (!props.open) return;
    openCount++;
    emit();
    return () => { openCount--; emit(); };
  }, [props.open]);
  if (!props.open) return null;
  return (
    <Suspense fallback={<SheetLoading />}>
      <Sheet {...props} />
    </Suspense>
  );
}

function SheetLoading() {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/30 no-print" role="status" aria-label={t("common.loading", "جارٍ التحميل…")}>
      <Loader2 size={28} className="animate-spin text-white" />
    </div>,
    document.body,
  );
}

/** زرٌّ كبير: اسمُ الدواء المختار وعائلتُه — يفتح المنتقي باختيارٍ واحد. لا حقلَ كتابة ولا كيبورد. */
export function MedField({ value, onChange, placeholder, className, showFamily = true, ...rest }: {
  value: PickedMed | null;
  onChange(m: PickedMed): void;
  placeholder?: string;
  className?: string;
  /** القيمةُ نصٌّ قديمٌ بلا عائلةٍ معروفة (تعديلُ جرعةٍ قائمة) — لا شارةَ «أخرى» كاذبة. */
  showFamily?: boolean;
} & Omit<MedPickerProps, "open" | "onClose" | "mode" | "onPick">) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-medfield onClick={() => { playTap(); setOpen(true); }}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-start transition",
          value ? "border-brand-300 bg-brand-50/60 dark:bg-brand-500/10" : "border-dashed border-line-strong bg-surface-2 hover:border-brand-300", className)}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><Pill size={18} /></span>
        <span className="min-w-0 flex-1">
          {value ? (
            <>
              <span className="block truncate text-base font-black text-ink">{value.label}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs font-bold text-ink-muted">
                {value.label !== value.name && <span className="truncate" dir="auto">{value.name}</span>}
                {showFamily && <span className="rounded-full bg-surface-1 px-2 py-0.5">{t(`mymeds.fam.${value.family}`)}</span>}
              </span>
            </>
          ) : (
            <span className="block text-sm font-bold text-ink-muted">{placeholder ?? t("mymeds.pickTitle", "اختر الدواء")}</span>
          )}
        </span>
        <ChevronDown size={18} className="shrink-0 text-ink-subtle" />
      </button>
      <MedPicker {...rest} open={open} mode="single" onClose={() => setOpen(false)}
        onPick={(m) => { onChange(m); setOpen(false); }} />
    </>
  );
}
