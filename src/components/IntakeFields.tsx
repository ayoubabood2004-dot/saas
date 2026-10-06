import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, History, Stethoscope, Activity, Check } from "lucide-react";
import { SymptomPicker } from "@/components/SymptomPicker";
import { cleanSince, onsetDay, MAX_SINCE_DAYS, type IntakeDraft } from "@/lib/intake";
import { formatDate, formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * «معلومات الحالة» بفتح حالة جديدة — ثلاثةُ تبويبات اختيارية:
 *   ١) التاريخ المرضي: شنو صار، وصارلها كم يوم (ويُحسب يومُ البداية).
 *   ٢) التشخيص الأوّلي: حقلُ «سليم / مريض + التشخيص» القائم نفسُه (يُمرَّر هنا).
 *   ٣) العلامات: نفسُ منتقي العلامات بمعالج التشخيص — فما يُؤشَّر هنا يجده الطبيبُ مؤشَّراً.
 * كلُّها اختيارية: الحالةُ تنفتح بلا أيٍّ منها، وكلُّ تبويبٍ يلبس علامةً حين يمتلئ.
 * ========================================================================= */

type Tab = "history" | "dx" | "signs";
const SINCE_CHIPS = [0, 1, 2, 3, 5, 7, 14, 30];

export function IntakeFields({ value, onChange, admittedOn, diagnosisSlot, dxFilled }: {
  value: IntakeDraft;
  onChange: (patch: Partial<IntakeDraft>) => void;
  /** يومُ الدخول — منه يُحسب «بدأت تقريباً». */
  admittedOn: string;
  /** حقلُ التشخيص القائم (HealthStatusField) — يبقى مصدرَه الوحيد. */
  diagnosisSlot: ReactNode;
  dxFilled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("history");
  const since = cleanSince(value.sinceDays);
  const onset = onsetDay(admittedOn, since);
  const filled: Record<Tab, boolean> = {
    history: !!value.history.trim() || since !== null,
    dx: dxFilled,
    signs: value.signs.length > 0,
  };
  const nFilled = Object.values(filled).filter(Boolean).length;
  const sinceLabel = (n: number) =>
    n === 0 ? t("intake.today", "اليوم")
      : n === 7 ? t("intake.week", "أسبوع")
        : n === 14 ? t("intake.twoWeeks", "أسبوعين")
          : n === 30 ? t("intake.month", "شهر")
            : t("intake.nDays", { n: formatNum(n), defaultValue: "{{n}} يوم" });

  const TABS: { id: Tab; label: string; icon: typeof History }[] = [
    { id: "history", label: t("intake.tabHistory", "التاريخ المرضي"), icon: History },
    { id: "dx", label: t("intake.tabDx", "التشخيص الأولي"), icon: Stethoscope },
    { id: "signs", label: t("intake.tabSigns", "العلامات"), icon: Activity },
  ];

  return (
    <section data-intake className="rounded-2xl border border-brand-200/70 bg-brand-50/30 p-3 dark:border-brand-500/25 dark:bg-brand-500/5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white"><ClipboardList size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{t("intake.title", "معلومات الحالة")} <span className="text-2xs font-semibold text-ink-subtle">· {t("intake.optional", "اختياري")}</span></p>
          <p className="text-2xs text-ink-subtle">{t("intake.sub", "تنحفظ بملف الحيوان، وتنتقل لأول زيارة أو طبلة تنفتح له.")}</p>
        </div>
        {nFilled > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-2xs font-black text-white tabular-nums">{formatNum(nFilled)}/{formatNum(3)}</span>}
      </div>

      <div role="tablist" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map((x) => {
          const Icon = x.icon;
          const on = tab === x.id;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={on} data-intake-tab={x.id}
              onClick={() => { playTap(); setTab(x.id); }}
              className={cn("relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition",
                on ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{x.label}</span>
              {filled[x.id] && <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success-500 text-white"><Check size={10} strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>

      {tab === "history" && (
        <div className="space-y-3" data-intake-panel="history">
          <div>
            <label className="label">{t("intake.whatHappened", "شنو صار؟")}</label>
            <textarea data-intake-history className="input min-h-20 resize-y leading-relaxed" value={value.history}
              onChange={(e) => onChange({ history: e.target.value })}
              placeholder={t("intake.historyPh", "مثلاً: يستفرغ من يومين، ما ياكل، أخذ دوا من صيدلية…")} />
          </div>
          <div>
            <label className="label">{t("intake.since", "صارلها كم يوم؟")}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {SINCE_CHIPS.map((n) => (
                <button key={n} type="button" data-intake-since={n} onClick={() => { playTap(); onChange({ sinceDays: since === n ? null : n }); }}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition",
                    since === n ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
                  {sinceLabel(n)}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-2xs font-bold text-ink-subtle">
                <input type="number" inputMode="numeric" min={0} max={MAX_SINCE_DAYS} data-intake-days
                  value={since ?? ""} onChange={(e) => onChange({ sinceDays: cleanSince(e.target.value) })}
                  className="input h-9 w-20 text-center tabular-nums" dir="ltr" aria-label={t("intake.daysInput", "عدد الأيام")} />
                {t("intake.daysWord", "يوم")}
              </label>
            </div>
            {onset && (
              <p className="mt-1.5 text-2xs font-semibold text-ink-muted" data-intake-onset>
                {since === 0 ? t("intake.onsetToday", "بدأت اليوم") : t("intake.onset", { date: formatDate(onset, i18n.language), defaultValue: "بدأت تقريباً {{date}}" })}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "dx" && <div data-intake-panel="dx">{diagnosisSlot}</div>}

      {tab === "signs" && (
        <div data-intake-panel="signs">
          <SymptomPicker value={value.signs} onChange={(signs) => onChange({ signs })}
            qualifiers={value.qualifiers} onQualifiersChange={(qualifiers) => onChange({ qualifiers })} />
        </div>
      )}
    </section>
  );
}
