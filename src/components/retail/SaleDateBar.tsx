import { useTranslation } from "react-i18next";
import { CalendarClock, History, X } from "lucide-react";
import { cn, dateLocale } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { BACKDATE_DAYS, checkSaleMoment, saleDayBounds, type SaleDateCode } from "@/lib/saleDate";

/* ============================================================================
 * «تاريخ المبيع» بشاشة البيع (0242) — فاتورةٌ نُسيت تُسجَّل بيومها.
 *
 * الافتراضُ «اليوم» ولا يتغيّر بلا ضغطة. واختيارُ يومٍ سابق يقلب الشريطَ كهرمانيّاً فوق زرّ
 * الإتمام مباشرةً — اليومُ والساعة وأين ينزل المال (تقاريرُ ذاك اليوم وصندوقُه، لا صندوقُ اليوم)
 * — لأن بيعةً لزبونٍ حاضرٍ تُسجَّل أمسَ بالغلط هي «اختفت المادة» بصندوق اليوم.
 * ويظهر للمدير وحده (أو مفتاحِه الحيّ)؛ ويومٌ محفوظٌ بمسودّةٍ بلا صلاحيةٍ الآن يُقال ولا يُخفى.
 * ========================================================================= */

/** نصُّ كلّ رفضٍ — رموزُ saleDate.ts نفسُها، وتلميحاتُ الخادم تُقرأ بـdescribeDbError. */
export function saleDateMessage(code: SaleDateCode | "delivery" | "return" | "role", t: (k: string, d: string) => string): string {
  switch (code) {
    case "sale_at_invalid": return t("sdate.invalid", "اختر يوم المبيع وساعته من جديد.");
    case "sale_day_not_past": return t("sdate.notPast", "تاريخ المبيع لازم يوم قبل اليوم — فاتورة اليوم تنسجّل بدون تاريخ.");
    case "backdate_window": return t("sdate.window", "أقدم يوم يُقبل قبل ٧ أيام — فاتورة أقدم تحتاج قرار صاحب العيادة.");
    case "backdate_not_allowed":
    case "role": return t("sdate.needManager", "تسجيل فاتورة بيوم سابق للمدير — افتح وضع المدير برمزه، أو رجّع التاريخ لليوم.");
    case "backdate_operator_not_allowed": return t("sdate.operator", "مشغّل المنصّة ما يسجّل فواتير بيوم سابق داخل عيادة.");
    case "delivery": return t("sdate.noDelivery", "التوصيل ما ينسجّل بيوم سابق — رجّع التاريخ لليوم أو طفّي التوصيل.");
    case "return": return t("sdate.noReturn", "الإرجاع ينسجّل اليوم دائماً — رجّع التاريخ لليوم أوّلاً.");
  }
}

export function SaleDateBar({ day, time, allowed, blocked, onChange }: {
  /** اليومُ المختار (YYYY-MM-DD محلّياً)، أو null = اليوم. */
  day: string | null;
  time: string;
  /** المديرُ أو مفتاحُه الحيّ (canBackdate). */
  allowed: boolean;
  /** سببٌ يمنع البيعَ بهذا اليوم الآن (توصيل/إرجاع) — يُقال بالشريط نفسه. */
  blocked?: "delivery" | "return" | null;
  onChange: (day: string | null, time: string) => void;
}) {
  const { t } = useTranslation();
  const tt = (k: string, d: string) => t(k, d);
  const { min, max } = saleDayBounds();
  if (!day) {
    if (!allowed) return null;
    return (
      <button type="button" data-saledate="today"
        onClick={() => { playTap(); onChange(max, time); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-1.5 text-2xs font-bold text-ink-subtle transition hover:border-line-strong hover:text-ink">
        <CalendarClock size={13} className="shrink-0" />
        {t("sdate.today", "تاريخ المبيع: اليوم")}
        <span className="text-brand-600">· {t("sdate.pick", "فاتورة نسيتها؟ سجّلها بيومها")}</span>
      </button>
    );
  }
  const check = checkSaleMoment(day, time);
  const at = check.ok ? new Date(check.at) : null;
  const dayTxt = at ? at.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }) : day;
  const problem: string | null = !allowed ? saleDateMessage("role", tt)
    : blocked ? saleDateMessage(blocked, tt)
    : !check.ok ? saleDateMessage(check.code, tt)
    : null;
  return (
    <div data-saledate="past" className={cn("space-y-2 rounded-2xl border-2 p-2.5",
      problem ? "border-danger-300 bg-danger-50 dark:border-danger-500/40 dark:bg-danger-500/10"
              : "border-warn-300 bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10")}>
      <div className="flex items-center gap-2">
        <History size={15} className={cn("shrink-0", problem ? "text-danger-600" : "text-warn-700 dark:text-warn-200")} />
        <span className={cn("min-w-0 flex-1 text-xs font-black", problem ? "text-danger-800 dark:text-danger-200" : "text-warn-800 dark:text-warn-100")}>
          {t("sdate.pastTitle", "فاتورة بيوم سابق")}
        </span>
        <button type="button" data-saledate-clear onClick={() => { playTap(); onChange(null, time); }}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-1 px-2 py-1 text-2xs font-bold text-ink-muted hover:text-ink">
          <X size={12} /> {t("sdate.backToday", "رجّعها لليوم")}
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr),minmax(0,8.5rem)] gap-2">
        <input type="date" data-saledate-day value={day} min={min} max={max}
          onChange={(e) => onChange(e.target.value || null, time)} className="input h-10 text-sm" />
        <input type="time" data-saledate-time value={time}
          onChange={(e) => onChange(day, e.target.value)} className="input h-10 text-sm" />
      </div>
      <p className={cn("text-2xs font-bold leading-relaxed", problem ? "text-danger-700 dark:text-danger-300" : "text-warn-800 dark:text-warn-200")} data-saledate-says>
        {problem ?? t("sdate.lands", { day: dayTxt, defaultValue: "تنسجّل بيوم {{day}} — بتقارير ذاك اليوم وصندوقه، مو بصندوق اليوم. وتنكتب بسجل الحركات «بيوم سابق»." })}
      </p>
      {!problem && (
        <p className="text-2xs text-ink-subtle">{t("sdate.limits", { n: BACKDATE_DAYS, defaultValue: "لحد {{n}} أيام سابقة. بعد الحفظ يرجع التاريخ لليوم تلقائياً." })}</p>
      )}
    </div>
  );
}
