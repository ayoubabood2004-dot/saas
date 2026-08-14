import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlarmClockPlus, CalendarDays, Check } from "lucide-react";
import type { Pet } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { cn, formatNum } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * تذكير حر لهذا الحيوان — نفس نمط «موعد الجرعة القادمة» بإضافة اللقاح:
 * رقائق مدد جاهزة (أسبوع… سنة) أو تاريخ مخصص، والفرق أن النص حر بالكامل —
 * الدكتور يكتب أي شي («قص أظافر»، «فحص السكر»، «تغيير الضماد»…).
 *
 * «ما يضيع أي تذكير» ليس شعاراً هنا بل ثلاثة قرارات ملموسة:
 *   ١) الحفظ ينتظر القاعدة فعلاً (await) — لا إغلاق متفائل ثم فشل صامت
 *      بالخلفية. لو فشل، النافذة تبقى مفتوحة والنص محفوظ والسبب معروض.
 *   ٢) يُخزَّن بجدول reminders نفسه الذي يقرأه مركز التذكيرات — لا قناة
 *      موازية تُنسى. فيطلع بمركز التذكيرات باسم الحيوان ورقم صاحبه وزر
 *      الواتساب، وبسجل الحيوان نفسه.
 *   ٣) الماضي مرفوض من الباب: تذكير بتاريخ فات لن يُنبّه أحداً أبداً،
 *      فالأنزه رفضه بوضوح لا قبوله بصمت.
 * ========================================================================== */

interface Span { key: string; def: string; days?: number; months?: number; years?: number }
const SPANS: Span[] = [
  { key: "petrem.s1w", def: "أسبوع", days: 7 },
  { key: "petrem.s2w", def: "أسبوعان", days: 14 },
  { key: "petrem.s3w", def: "3 أسابيع", days: 21 },
  { key: "petrem.s1m", def: "شهر", months: 1 },
  { key: "petrem.s2m", def: "شهران", months: 2 },
  { key: "petrem.s3m", def: "3 أشهر", months: 3 },
  { key: "petrem.s6m", def: "6 أشهر", months: 6 },
  { key: "petrem.s1y", def: "سنة", years: 1 },
];

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** اليوم + المدّة، بحساب تقويمي (الشهر شهر حقيقي لا ٣٠ يوماً). */
function addToToday(s: Span): string {
  const d = new Date();
  if (s.days) d.setDate(d.getDate() + s.days);
  if (s.months) d.setMonth(d.getMonth() + s.months);
  if (s.years) d.setFullYear(d.getFullYear() + s.years);
  return isoDay(d);
}

const daysFromToday = (iso: string): number => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00").getTime() - t.getTime()) / 86400000);
};

export function PetReminderModal({ open, onClose, pet, onSaved }: {
  open: boolean;
  onClose: () => void;
  pet: Pet;
  onSaved: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // كل فتح يبدأ صفحة جديدة — تذكير الأمس لا يتسرّب لحيوان اليوم.
  useEffect(() => {
    if (!open) return;
    setTitle(""); setDate(null); setBusy(false);
    const id = window.setTimeout(() => titleRef.current?.focus(), 180);
    return () => window.clearTimeout(id);
  }, [open]);

  const isCustom = !!date && !SPANS.some((s) => addToToday(s) === date);
  const inDays = date ? daysFromToday(date) : null;

  const preview = useMemo(() => {
    if (!date) return null;
    const label = new Date(date + "T00:00:00").toLocaleDateString(
      i18n.language === "ar" ? "ar-EG-u-nu-latn" : "en-GB",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    );
    if (inDays === 0) return t("petrem.today", { d: label, defaultValue: "اليوم — {{d}}" });
    if (inDays === 1) return t("petrem.tomorrow", { d: label, defaultValue: "باچر — {{d}}" });
    return t("petrem.onDate", { d: label, n: formatNum(inDays ?? 0), defaultValue: "{{d}} — بعد {{n}} يوم" });
  }, [date, inDays, i18n.language, t]);

  const save = async () => {
    const clean = title.trim();
    if (!clean) { playWarning(); toast.error(t("petrem.needTitle", "اكتب نص التذكير أولاً.")); titleRef.current?.focus(); return; }
    if (!date) { playWarning(); toast.error(t("petrem.needDate", "اختر موعد التذكير — رقاقة جاهزة أو تاريخاً مخصصاً.")); return; }
    if ((inDays ?? 0) < 0) { playWarning(); toast.error(t("petrem.pastDate", "التاريخ فات — تذكير بالماضي ما راح ينبّه أحداً.")); return; }
    if (busy) return;
    setBusy(true);
    try {
      // ننتظر القاعدة فعلاً: النافذة لا تنغلق إلا بعد حفظ مؤكد، فلا يضيع
      // تذكير بفشل صامت — ولو فشل يبقى النص مكتوباً والسبب معروضاً.
      await repo.addReminder({
        owner_id: null,               // تذكير عيادة لا تذكير مالك
        pet_id: pet.id,
        pet_name: pet.name,
        category: "reminder",
        title: clean,
        date,
        recurring: "none",
        enabled: true,
      });
      playSuccess();
      toast.success(
        t("petrem.saved", "انحفظ التذكير"),
        t("petrem.savedSub", { name: pet.name, defaultValue: "راح يطلع بتذكيرات {{name}} وبمركز التذكيرات بموعده." }),
      );
      await onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(t("petrem.saveFail", "ما انحفظ التذكير"), describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("petrem.title", { name: pet.name, defaultValue: "تذكير جديد — {{name}}" })}>
      <div className="space-y-4">
        {/* النص حر بالكامل — هذا جوهر الميزة */}
        <div>
          <label className="label">{t("petrem.what", "شنو تريد تتذكّر؟")}</label>
          <input
            ref={titleRef}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
            placeholder={t("petrem.whatPh", "مثلاً: قص أظافر، فحص السكر، تغيير الضماد…")}
            maxLength={200}
          />
        </div>

        {/* رقائق المدد — نفس نمط موعد الجرعة القادمة */}
        <div>
          <label className="label">{t("petrem.when", "متى؟")}</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {SPANS.map((s) => {
              const iso = addToToday(s);
              const active = date === iso;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { playTap(); setDate(active ? null : iso); }}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                    active
                      ? "border-brand-500 bg-brand-600 text-white shadow-soft"
                      : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                  )}
                >
                  {t(s.key, s.def)}
                </button>
              );
            })}
          </div>

          {/* تاريخ مخصص — نفس الحقل الأصيل الموثوق بنمط اللقاح */}
          <label className={cn(
            "group mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-brand-400/40",
            isCustom ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300 hover:bg-surface-2",
          )}>
            <span className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
              isCustom ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-subtle group-hover:text-brand-600",
            )}>
              <CalendarDays size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">{t("petrem.custom", "تاريخ مخصص")}</span>
              <span className="block text-2xs text-ink-subtle">{t("petrem.customHint", "لو المدد الجاهزة ما تناسب")}</span>
            </span>
            <input
              type="date"
              className="input w-40 py-1.5"
              min={isoDay(new Date())}
              value={isCustom ? date! : ""}
              onChange={(e) => { if (e.target.value) { playTap(); setDate(e.target.value); } }}
            />
          </label>
        </div>

        {/* المعاينة: الطبيب يرى اليوم الفعلي قبل الحفظ — لا حفظ على العمياني */}
        {preview && (inDays ?? 0) >= 0 && (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
            <AlarmClockPlus size={16} className="shrink-0" /> {preview}
          </p>
        )}

        <Button className="w-full" size="lg" leftIcon={<Check size={17} />} loading={busy} onClick={save}>
          {t("petrem.save", "احفظ التذكير")}
        </Button>
      </div>
    </Modal>
  );
}
