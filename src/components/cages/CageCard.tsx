import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Move, Plus, Pencil, Syringe } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";
import { KIND_AR, type Occupant } from "@/components/cage3d/neon";

/* ============================================================================
 * CageCard — القفص الواحد بلوحة الأقفاص المسطّحة.
 *
 * ── قرارات الشكل، ولماذا ─────────────────────────────────────────────────
 * • «اللافتة» عنصرٌ مادي لا رقمٌ عائم: لوح معدني فاتح بمسمارَين، معلّق على
 *   حافة البطاقة العليا من الخارج — كما تُثبَّت لوحات الأقفاص الحقيقية على
 *   أبوابها. الرقم بخط أحادي عريض متباعد الحروف، فيُقرأ من أول لمحة.
 * • الساكن بمنتصف القفص تماماً: صورة كبيرة ثم الاسم تحتها — أول ما تقع عليه
 *   العين. النوع وعدد الأيام سطرٌ خافت لا يزاحم.
 * • الحالة تُقرأ من شكل البطاقة قبل قراءة أي كلمة: الفاضي حدُّه منقّط
 *   وجوفه باهت، والممتلئ حدُّه مصمت بلون نوع الإقامة وشريطُ قمةٍ ملوّن.
 * • «جرعة مستحقّة» شارةٌ كهرمانية تنبض — النبض على الشارة وحدها لا البطاقة،
 *   فغرفةٌ فيها خمس جرعات لا تتحول لومضات مزعجة.
 * ==========================================================================*/

export type CageTone = "free" | "care" | "boarding";

const TONE: Record<CageTone, { border: string; bar: string; ring: string; chip: string }> = {
  free: { border: "", bar: "", ring: "", chip: "" },
  care: {
    border: "border-brand-200 dark:border-brand-500/30",
    bar: "bg-brand-500",
    ring: "ring-brand-300 dark:ring-brand-500/50",
    chip: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  },
  boarding: {
    border: "border-violet-200 dark:border-violet-500/30",
    bar: "bg-violet-500",
    ring: "ring-violet-300 dark:ring-violet-500/50",
    chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
};

/** لافتة رقم القفص — لوحٌ معدني بمسمارين على حافة البطاقة. */
export function Nameplate({ code, editable, onEdit }: { code: string; editable?: boolean; onEdit?: () => void }) {
  return (
    <div className="pointer-events-none absolute -top-4 inset-x-0 z-10 flex justify-center">
      <button
        type="button"
        data-plate={code}
        disabled={!editable}
        // stopPropagation: بلاها كانت الضغطة تتسرب لبطاقة القفص الفاضي تحتها
        // فتفتح نافذة الإسكان خلف نافذة التعديل — نافذتان فوق بعض.
        onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
        className={cn(
          "pointer-events-auto relative rounded-lg border px-5 py-1 shadow-soft",
          "border-slate-300 bg-gradient-to-b from-white to-slate-200",
          "dark:border-slate-500/60 dark:from-slate-500 dark:to-slate-700",
          editable && "cursor-pointer hover:ring-2 hover:ring-brand-400",
        )}
      >
        {/* مسمارا التثبيت — التفصيلة التي تجعلها لوحةً مركّبة لا وساماً مرسوماً */}
        <span className="absolute start-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-400 shadow-inner dark:bg-slate-300/70" />
        <span className="absolute end-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-400 shadow-inner dark:bg-slate-300/70" />
        <span className="font-mono text-sm font-black tracking-[0.18em] text-slate-800 tabular-nums dark:text-white">
          {code}
        </span>
        {editable && <Pencil size={10} className="absolute -end-4 top-1/2 -translate-y-1/2 text-ink-subtle" />}
      </button>
    </div>
  );
}

/** صورة الساكن — صورته الحقيقية، وإن تعذّرت فرمز نوعه. */
function OccupantAvatar({ occ, tone }: { occ: Occupant; tone: CageTone }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn("grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-surface-2 ring-4", TONE[tone].ring)}>
      {occ.photoUrl && !broken ? (
        <img src={occ.photoUrl} alt={occ.name} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="text-4xl leading-none">{occ.emoji}</span>
      )}
    </span>
  );
}

export const CageCard = memo(function CageCard({
  code, occ, carrying, dimmed, highlighted, editable, level,
  onTapFree, onOpenFile, onStartMove, onEditCage,
}: {
  code: string;
  /** يُمرَّر فقط حين تحمل الخلية قفصين فوق بعض: 0 أرضي · 1 علوي. */
  level?: 0 | 1;
  occ: Occupant | null;
  /** وضع النقل نشط: الفاضي يصير هدفاً نابضاً، والممتلئ يخفت. */
  carrying: boolean;
  /** بحثٌ نشط وهذه البطاقة ليست من نتائجه. */
  dimmed: boolean;
  /** بحثٌ نشط وهذه البطاقة من نتائجه. */
  highlighted: boolean;
  editable: boolean;
  onTapFree: () => void;
  onOpenFile: () => void;
  onStartMove: () => void;
  onEditCage: () => void;
}) {
  const { t } = useTranslation();
  const tone: CageTone = occ ? (occ.status === "care" ? "care" : "boarding") : "free";
  const free = !occ;
  const dropTarget = carrying && free;

  return (
    <div
      data-cage={code}
      data-occupied={occ ? "1" : "0"}
      onClick={free ? onTapFree : undefined}
      className={cn(
        "relative flex min-h-[236px] flex-col rounded-3xl border bg-surface-1 px-4 pb-4 pt-9 text-center transition",
        free
          ? "cursor-pointer border-2 border-dashed border-line-strong bg-surface-2/40 hover:border-brand-300 hover:bg-brand-50/30 dark:hover:bg-brand-500/5"
          : cn("shadow-soft", TONE[tone].border),
        dropTarget && "animate-pulse cursor-pointer border-brand-400 ring-2 ring-brand-400/70",
        carrying && !free && "opacity-45",
        dimmed && "opacity-30",
        highlighted && "ring-2 ring-warn-400",
      )}
    >
      {/* شريط القمة الملوّن — حالة القفص تُلمح قبل أن تُقرأ */}
      {!free && <span className={cn("absolute inset-x-8 top-0 h-1 rounded-b-full", TONE[tone].bar)} />}

      <Nameplate code={code} editable={editable} onEdit={onEditCage} />

      {/* قفصان فوق بعض: شارة الطابق تربط البطاقتين المتجاورتين بخليتهما */}
      {level != null && (
        <span data-cagelevel={level}
          className={cn("absolute -top-2 start-2 z-10 rounded-full px-2 py-0.5 text-2xs font-extrabold shadow-soft",
            level === 1 ? "bg-warn-100 text-warn-800 dark:bg-warn-500/25 dark:text-warn-200"
              : "bg-surface-2 text-ink-muted")}>
          {level === 1 ? t("cages.upper", "⬆ علوي") : t("cages.lower", "⬇ أرضي")}
        </span>
      )}

      {occ ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <OccupantAvatar occ={occ} tone={tone} />
            <p className="max-w-full truncate font-display text-lg font-extrabold leading-tight text-ink">{occ.name}</p>
            <p className="text-xs text-ink-subtle">
              {occ.speciesAr} · {t("cages.dayN", { n: formatNum(occ.days), defaultValue: "اليوم {{n}}" })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className={cn("chip text-2xs font-bold", TONE[tone].chip)}>{KIND_AR[occ.status]}</span>
              {occ.doseDue && (
                <span className="chip inline-flex animate-pulse items-center gap-1 bg-warn-50 text-2xs font-extrabold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
                  <Syringe size={11} /> {t("cages.doseDue", "جرعة مستحقّة")}
                </span>
              )}
            </div>
          </div>

          {/* الأفعال ظاهرة دائماً — الآيباد ما عنده تحويم */}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button" data-cagefile={code}
              onClick={(e) => { e.stopPropagation(); onOpenFile(); }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-xs font-bold text-ink-muted transition hover:bg-surface-3 hover:text-ink"
            >
              <FileText size={14} /> {t("cages.file", "الملف")}
            </button>
            <button
              type="button" data-cagemove={code}
              onClick={(e) => { e.stopPropagation(); onStartMove(); }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-xs font-bold text-ink-muted transition hover:bg-surface-3 hover:text-ink"
            >
              <Move size={14} /> {t("cages.move", "نقل")}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-ink-subtle">
          <span className={cn(
            "grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-line-strong transition",
            dropTarget && "border-brand-400 text-brand-500",
          )}>
            <Plus size={22} />
          </span>
          <p className="text-sm font-bold">
            {dropTarget ? t("cages.dropHere", "انقله هنا") : t("cages.freeCage", "قفص متاح")}
          </p>
          {!dropTarget && <p className="text-2xs">{t("cages.tapToAdmit", "اضغط لإسكان حيوان")}</p>}
        </div>
      )}
    </div>
  );
});
