import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Cloud, CloudOff, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { cageStudio, useCageStudio, hydrateCageStudio } from "@/components/cage3d/store";
import { sb } from "@/lib/clinicSync";
import { describeDbError } from "@/lib/errors";
import { cn, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * LayoutSync — سطرٌ واحدٌ يقول الحقيقة عن ترتيب الأقفاص (0219).
 *
 * كان هنا حوارُ تعارض ونافذةُ مقارنة وسجلُّ نسخ وعرضُ «ترتيبٍ محفوظٍ على هذه
 * الحاسبة» — كلُّها لخدمة الرسمة الواحدة، وكلُّها صارت طريقاً للعبور بين العيادات
 * (`docs/cages-plan.md`). الأقفاصُ صارت صفوفاً تُقرأ كأيّ قائمة، فما بقي يُقال:
 * نجيب / نحفظ / محفوظ / **ما انحفظ ولماذا** + «أعد المحاولة». ويُركَّب بالعرضين
 * (اللوحة والمجسّم) — الرفضُ لا يُخفى عمّن يعمل بالمجسّم.
 * ==========================================================================*/

/** جملةُ الرفض كما تُقال للمستخدم: الخادمُ يرسلها جاهزةً (`hint`)، والمرآةُ التجريبية
 *  ترسل اسمَ مفتاحها (`cageErr`) لأنها تُحمَّل قبل القاموس البارد — فتُترجم هنا. */
export function cageErrorText(e: unknown, t: TFunction): string {
  const k = (e as { cageErr?: unknown; vars?: Record<string, string> } | null);
  if (k && typeof k.cageErr === "string") return t(`cages.${k.cageErr}`, k.vars ?? {}) as string;
  return describeDbError(e, t);
}

const rel = (ms: number | null, t: (k: string, d: string, o?: Record<string, unknown>) => string): string => {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return t("cages.justNow", "هسّه");
  const m = Math.round(s / 60);
  if (m < 60) return t("cages.minsAgo", "قبل {{n}} دقيقة", { n: formatNum(m) });
  return t("cages.hrsAgo", "قبل {{n}} ساعة", { n: formatNum(Math.round(m / 60)) });
};

export function LayoutSync({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const s = useCageStudio();
  const [, setTick] = useState(0);

  // «قبل كذا» يشيخ بلا إعادة رسم — دقّةٌ كل نصف دقيقة تكفي.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /* الشاشةُ التي يفتحها المستخدم تقرأ مهما تغيّر ترتيبُ التحميل. والقراءةُ من
     الجداول مباشرة — لا تنتظر إعداداتٍ ولا مرآةَ جهاز. */
  useEffect(() => {
    if (!cageStudio.get().ready) void hydrateCageStudio().catch(() => undefined);
  }, []);

  const retry = () => { playTap(); void cageStudio.reload().catch(() => undefined); };
  const demo = !sb();

  const tone = s.sync === "error" ? "warn" : s.sync === "saved" ? "ok" : "mute";
  return (
    <div
      data-layoutsync={s.sync}
      role={s.sync === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border font-bold",
        compact ? "px-3 py-2 text-2xs" : "mb-4 px-3.5 py-2.5 text-xs",
        tone === "ok" && "border-line bg-surface-1 text-ink-muted",
        tone === "mute" && "border-line bg-surface-2 text-ink-muted",
        tone === "warn" && "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
      )}
    >
      {s.sync === "loading" && <><Loader2 size={15} className="shrink-0 animate-spin" />
        <span>{t("cages.rowsLoading", "نجيب ترتيب الأقفاص…")}</span></>}
      {s.sync === "saving" && <><Loader2 size={15} className="shrink-0 animate-spin" />
        <span>{t("cages.rowsSaving", "نحفظ…")}</span></>}
      {s.sync === "saved" && (demo
        ? <><CloudOff size={15} className="shrink-0" />
            <span>{t("cages.syncOffline", "نسخة تجريبية — الترتيب محفوظ على هذا الجهاز فقط")}</span></>
        : <><Cloud size={15} className="shrink-0 text-success-600" />
            <span>{t("cages.rowsSaved", "محفوظ — كل أجهزة العيادة تشوف نفس الترتيب")}
              {s.savedAt ? <span className="font-normal opacity-80"> · {rel(s.savedAt, t)}</span> : null}</span></>)}
      {s.sync === "error" && (
        <>
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {s.ready ? t("cages.rowsNotSaved", "ما انحفظ — رجّعنا آخر ترتيب محفوظ:") : t("cages.rowsLoadFailed", "ما قدرنا نجيب ترتيب الأقفاص:")}
            <span className="font-normal"> {cageErrorText(s.error, t)}</span>
          </span>
          <button type="button" data-layoutretry onClick={retry}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 text-2xs font-bold text-ink-muted transition hover:text-ink">
            <RotateCw size={13} /> {t("common.retry", "أعد المحاولة")}
          </button>
        </>
      )}
    </div>
  );
}
