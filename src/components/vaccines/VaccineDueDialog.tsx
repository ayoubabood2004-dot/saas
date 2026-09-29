import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import type { Vaccination } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Dialog, useToast } from "@/components/ui";
import { cn, formatDate, localISO } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { addDays, statusForDue, validDue } from "@/lib/vaccineDue";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/**
 * تعديلُ موعد اللقاح — من العلامة الحمراء بملفّ الحيوان، أو من سطر الجرعة بتبويب اللقاحات.
 *
 * الطبيبُ يؤجّل (الحيوانُ مريض، المالكُ مسافر) أو يقدّم، والحالةُ تتبع التاريخ: موعدٌ قادم
 * يرجع «مجدول» فتنطفئ الحمراء، وموعدٌ فات يبقى «متأخر». والحفظُ يُسمع: رفضُ الخادم أو
 * لقاحٌ انعطى من جهازٍ ثانٍ يُقال ولا تُغلق النافذةُ على «تمّ» كاذبة.
 */
export function VaccineDueDialog({ vaccine, petName, onClose, onSaved }: {
  vaccine: Vaccination | null;
  petName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (vaccine) setDate((vaccine.due_date ?? today).slice(0, 10));
  }, [vaccine, today]);

  if (!vaccine) return null;
  const current = vaccine.due_date?.slice(0, 10) ?? null;
  const ok = validDue(date, today);
  const changed = date !== current;
  const willBe = ok ? statusForDue(date, today) : null;

  const save = async () => {
    if (!ok || !changed || busy) return;
    setBusy(true);
    try {
      await repo.rescheduleVaccination(vaccine.id, date, statusForDue(date, today));
      playSuccess();
      toast.success(t("vxdue.saved", { name: vaccine.name, date: formatDate(date, i18n.language), defaultValue: "موعد {{name}} صار {{date}}" }));
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const base = current && current >= today ? current : today;
  const quick: { label: string; iso: string }[] = [
    { label: t("vxdue.week", "بعد أسبوع"), iso: addDays(base, 7) },
    { label: t("vxdue.twoWeeks", "بعد أسبوعين"), iso: addDays(base, 14) },
    { label: t("vxdue.month", "بعد شهر"), iso: addDays(base, 30) },
  ];

  return (
    <Dialog open={!!vaccine} onClose={onClose} size="sm"
      title={t("vxdue.title", "تعديل موعد اللقاح")}
      description={petName ? `${vaccine.name} · ${petName}` : vaccine.name}
      footer={
        <div className="flex w-full flex-wrap gap-2">
          <Button onClick={() => void save()} loading={busy} disabled={!ok || !changed} data-vxdue-save>
            {t("vxdue.save", "احفظ الموعد")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "إلغاء")}</Button>
        </div>
      }>
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <CalendarClock size={16} className="shrink-0 text-brand-600" />
          {current
            ? t("vxdue.current", { date: formatDate(current, i18n.language), defaultValue: "الموعد الحالي: {{date}}" })
            : t("vxdue.noCurrent", "ما إله موعد مسجّل")}
        </p>
        <input type="date" dir="ltr" value={date} data-vxdue-date
          onChange={(e) => setDate(e.target.value)}
          className="input w-full text-base [color-scheme:light] dark:[color-scheme:dark]" style={{ minHeight: 48 }} />
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => { playTap(); setDate(q.iso); }}
              className={cn("rounded-full border px-3 text-xs font-bold transition",
                date === q.iso ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "border-line bg-surface-2 text-ink-muted hover:border-brand-300 hover:text-ink")}
              style={{ minHeight: 40 }}>
              {q.label}
            </button>
          ))}
        </div>
        {!ok && date && (
          <p className="text-xs font-bold text-danger-600 dark:text-danger-400">{t("vxdue.bad", "التاريخ مو صحيح — اختاره من التقويم")}</p>
        )}
        {ok && changed && willBe === "overdue" && (
          <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
            {t("vxdue.past", "هذا التاريخ فات — راح يبقى اللقاح متأخر (أحمر).")}
          </p>
        )}
        {ok && changed && willBe === "scheduled" && vaccine.status === "overdue" && (
          <p className="rounded-xl bg-success-50 px-3 py-2 text-xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">
            {t("vxdue.clears", "بعد الحفظ تنطفي العلامة الحمرة — اللقاح يرجع مجدول بموعده الجديد.")}
          </p>
        )}
      </div>
    </Dialog>
  );
}
