import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellRing, Cake, Syringe, Bug, Send } from "lucide-react";
import type { Pet, Vaccination } from "@/types";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { computeReminderRows, type ReminderRow, type ReminderType, type CampaignPrefill } from "@/lib/reminders";
import { indexMarks, isDone, serverSentDay } from "@/lib/reminderMarks";
import type { ReminderMark } from "@/types";

const TYPE_STYLE: Record<ReminderType, { icon: typeof Cake; chip: string }> = {
  birthday: { icon: Cake, chip: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300" },
  vaccine: { icon: Syringe, chip: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  deworming: { icon: Bug, chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

/**
 * Dashboard CRM widget — actionable reminders (🎂 birthdays, 💉 vaccinations,
 * 🐛 deworming) due soon. "تجهيز الإرسال" hands the client + reminder type to the
 * WhatsApp Campaigns page via router state, where the message is drafted and the
 * client pre-selected — instead of firing a raw WhatsApp link from here.
 */
export function RemindersWidget({ pets }: { pets: Pet[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  /** «تم التذكير» من مركز التذكيرات — فلا تبقى اللوحةُ تصرخ «متأخر» عن تذكيرٍ خلص.
   *  null = لم تصل بعد: لا صفَّ يُعرض قبلها، وإلا عُرض «تمّ» متأخراً بزرّ إرسالٍ لحظاتِ التحميل. */
  const [marks, setMarks] = useState<ReminderMark[] | null>(null);
  /** فشلت قراءةُ العلامات: لا تُعرض صفوفٌ «تمّ» أو «أُرسلت» حمراءَ — يُقال الفشل بزرّ إعادة. */
  const [marksErr, setMarksErr] = useState(false);
  const [retryN, setRetryN] = useState(0);

  // Self-contained fetch (same repo + effect pattern as the rest of the app), so
  // the parent dashboard's load stays untouched.
  useEffect(() => {
    let alive = true;
    const ids = pets.map((p) => p.id);
    if (ids.length === 0) { setVaccinations([]); return; }
    repo.listAllVaccinations(ids)
      .then((v) => { if (alive) setVaccinations(v); })
      .catch(() => { /* graceful: birthdays still render from pets */ });
    repo.listReminderMarks()
      .then((m) => { if (alive) { setMarks(m); setMarksErr(false); } })
      // بلعُ الفشل كان يعرض ما «تمّ» متأخراً فيُعاد إرسالُه — القائمةُ الناقصة أسوأ من الخطأ.
      .catch(() => { if (alive) setMarksErr(true); });
    return () => { alive = false; };
  }, [pets, retryN]);

  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);
  const rows = useMemo(() => {
    if (!marks) return [];
    const idx = indexMarks(marks);
    // ما «تمّ» وما «أُرسلت» خرجا من المتأخرة بمركز التذكيرات — فيخرجان من هنا أيضاً،
    // وإلا دعت اللوحةُ لرسالةٍ ثانيةٍ لنفس الصاحب.
    return computeReminderRows(pets, vaccinations, Date.now())
      .filter((r) => !isDone(idx, r.id, r.date) && !serverSentDay(idx, r.id, r.date)).slice(0, 6);
  }, [pets, vaccinations, marks]);

  const whenLabel = (inDays: number) =>
    inDays < 0 ? `${t("remind.overdue", "متأخّر")} ${-inDays} ${t("remind.day", "يوم")}`
      : inDays === 0 ? t("remind.today", "اليوم")
        : inDays === 1 ? t("remind.tomorrow", "غداً")
          : `${t("remind.inDays", "خلال")} ${inDays} ${t("remind.day", "يوم")}`;

  const prepare = (row: ReminderRow) => {
    playTap();
    const state: CampaignPrefill = {
      targetPetId: row.petId,
      targetPetName: row.petName,
      targetOwnerName: row.ownerName,
      reminderType: row.type,
      // هويّةُ التذكير تذهب مع الإرسال: بلاها تُسجَّل الرسالةُ `manual` ولا تُكتب «أُرسلت»،
      // فيبقى التذكيرُ أحمرَ على كلّ جهاز — نفسُ الشكوى من بابٍ ثانٍ.
      reminderRowId: row.id, reminderDate: row.date, reminderKind: row.type,
    };
    navigate("/campaigns", { state });
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 bg-gradient-to-br from-brand-500/15 to-success-500/10 px-4 py-3.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft"><BellRing size={17} /></span>
        <h3 className="font-display font-bold text-ink">{t("remind.title", "التذكيرات القادمة")}</h3>
        {!marksErr && rows.length > 0 && <span className="chip ms-auto bg-brand-50 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 tabular-nums">{rows.length}</span>}
      </div>

      {marksErr ? (
        <div data-remwidgeterr className="px-4 py-5 text-center">
          <p className="text-sm font-semibold text-danger-600 dark:text-danger-400">{t("rem.loadFailed", "تعذّر تحميل التذكيرات — المشكلة بالاتصال ولا تذكير ضاع. أعد المحاولة قبل ما ترسل.")}</p>
          <button type="button" data-remwidgetretry onClick={() => { playTap(); setMarksErr(false); setMarks(null); setRetryN((n) => n + 1); }}
            className="mt-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-3">{t("common.retry")}</button>
        </div>
      ) : !marks && pets.length > 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-subtle">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-subtle">{t("remind.empty", "لا توجد تذكيرات قريبة.")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const pet = petById.get(row.petId);
            const Icon = TYPE_STYLE[row.type].icon;
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                {pet ? <PetAvatar pet={pet} size={38} photoFallback /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-subtle"><Icon size={17} /></span>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    {row.petName}
                    <span className={cn("chip shrink-0 inline-flex items-center gap-1 text-2xs font-medium", TYPE_STYLE[row.type].chip)}>
                      <Icon size={11} />
                      {row.type === "birthday" ? t("remind.birthday", "عيد ميلاد") : row.type === "deworming" ? t("remind.deworming", "ديدان") : t("remind.vaccine", "تطعيم")}
                    </span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {row.ownerName || "—"} · <span className={cn("font-medium", row.inDays < 0 ? "text-danger-600" : row.inDays <= 1 ? "text-brand-600" : "text-ink-muted")}>{whenLabel(row.inDays)}</span>
                    {row.detail ? <span> · {row.detail}</span> : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => prepare(row)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-success-700"
                >
                  <Send size={13} /> {t("remind.prepare", "تجهيز الإرسال")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
