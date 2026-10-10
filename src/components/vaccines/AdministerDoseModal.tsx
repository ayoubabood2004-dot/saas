import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, NotebookPen, Stethoscope, Syringe, CalendarX } from "lucide-react";
import type { Vaccination } from "@/types";
import { repo } from "@/lib/repo";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { BOOSTERS, DoctorSelect } from "@/components/MedicalEntry";
import { cn, formatDate, localISO } from "@/lib/utils";
import { addInterval } from "@/lib/backdate";
import { statusForDue, validDue } from "@/lib/vaccineDue";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { laterPending, suggestNext, type VaxInterval } from "@/lib/vaxNext";

/* ============================================================================
 * إعطاءُ جرعةٍ مجدولة — **ويسأل عن الجاية** (vaxNext.ts يشرح القياس).
 *
 * كانت النافذةُ تقلب الجرعةَ «معطاة» وتسكت: التكرارُ الذي اختاره الطبيبُ عند الإضافة يقف
 * عند أوّل معزّز، والكادرُ يضيف اللقاحَ من جديد ليحصل على موعد فتتكرّر الجرعةُ بالسجلّ.
 * الآن الحفظُ يحتاج جواباً **من الطبيب**: مدّةٌ جاهزة (★ على الأقرب لما سبق — علامةٌ لا اختيار)، أو
 * تاريخٌ آخر، أو «ماكو جرعة جاية» صريحة. وجرعةٌ لاحقةٌ محجوزةٌ أصلاً تُقال ولا تُكرَّر.
 * مشتركةٌ بين ملفّ الحيوان وتقويم الاستقبال — نسختان من «اسأل عن الجاية» تنحرفان. والأبُ يركّبها
 * بمفتاح الجرعة (`key`): حفظٌ عالقٌ لجرعةٍ أُغلقت لا يكتب بحالة الجرعة التي فُتحت بعدها.
 * ========================================================================= */

type Choice = { kind: "preset"; iv: VaxInterval } | { kind: "date"; due: string } | { kind: "none" };

/** datetime-local بقيمة الآن (ساعةُ الجهاز، بالدقيقة). */
function nowLocalDT(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdministerDoseModal({ vaccine, series, defaultDoctor, onClose, onSaved }: {
  /** الجرعةُ المجدولة المفتوحة (null = مغلقة). */
  vaccine: Vaccination | null;
  /** كلُّ لقاحات هذا الحيوان — منها تُقترح المدّة وتُعرف الجاية المحجوزة. */
  series: readonly Vaccination[];
  defaultDoctor?: string;
  /** إغلاقُ النافذة وحده. */
  onClose: () => void;
  /** أيُّ كتابةٍ حصلت (أو تبيّن أنها انعطت من جهازٍ ثانٍ): الأبُ يعيد التحميل — **حتى لو أُغلقت
   *  النافذةُ قبل وصول الجواب**، وإلا بقيت الجرعةُ «معلّقة» بالشاشة وهي معطاةٌ بالقاعدة. */
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [doctor, setDoctor] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [customDue, setCustomDue] = useState("");
  /** الخطوةُ الأولى نجحت والثانية (حجزُ الجاية) فشلت: إعادةُ المحاولة تحجز وحدها، لا تعطي مرّتين. */
  const [givenDone, setGivenDone] = useState(false);
  /** النافذةُ ما زالت مركَّبة — حفظٌ يرجع بعد إغلاقها يحدّث الأبَ ولا يلمس حالتها ولا يغلق غيرها. */
  const alive = useRef(true);
  // يُرفع عند كلّ تركيب لا عند الإنشاء وحده: الوضعُ الصارم يركّب ويفكّ ويركّب، وعلَمٌ لا يُرفع
  // ثانيةً كان يُبقي النافذةَ مفتوحةً بعد حفظٍ ناجح (أمسكه الفحصُ الحيّ).
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const picked = when ? new Date(when) : new Date();
  const givenDay = localISO(Number.isNaN(picked.getTime()) ? new Date() : picked);
  const todayISO = localISO(new Date());
  const suggestion = useMemo(() => (vaccine ? suggestNext(series, vaccine, givenDay) : null), [series, vaccine, givenDay]);
  const already = useMemo(() => (vaccine ? laterPending(series, vaccine, givenDay) : null), [series, vaccine, givenDay]);

  // نموذجٌ جديد لكلّ جرعة: الطبيبُ الداخل، والآن، **وبلا اختيارٍ مسبق** — الاقتراحُ ★ والجوابُ للطبيب.
  useEffect(() => {
    if (!vaccine) return;
    setDoctor(defaultDoctor ?? "");
    setNotes("");
    setWhen(nowLocalDT());
    setCustomDue("");
    setGivenDone(false);
    setChoice(null);
  }, [vaccine?.id, defaultDoctor]);

  /** موعدُ الجاية من الاختيار ويوم الإعطاء (تغييرُ اليوم يحرّك المدّة معه). */
  const nextDue: string | null = !choice || choice.kind === "none" ? null
    : choice.kind === "preset" ? addInterval(givenDay, choice.iv)
    : choice.due;
  // بعد يوم الإعطاء، وبسقف «غيّر الموعد» نفسه (٥ سنوات): سنةٌ مكتوبةٌ غلط (٢٢٠٧) موعدٌ لا يُذكَّر به أبداً.
  const dueBad = !!nextDue && (nextDue <= givenDay || !validDue(nextDue, todayISO));
  const longDate = (d: string) => formatDate(d, i18n.language, true);
  const answered = !!already || (!!choice && (choice.kind !== "date" || (!!choice.due && !dueBad)));

  const confirm = async () => {
    if (!vaccine || busy || !answered) return;
    setBusy(true);
    try {
      if (!givenDone) {
        await repo.administerVaccination(vaccine.id, {
          administered_at: givenDay,
          administered_by: doctor || undefined,
          notes: notes.trim() || undefined,
        });
        setGivenDone(true);
      }
    } catch (e) {
      playWarning();
      const code = (e as { code?: string } | null)?.code;
      if (code === "no_row_updated") {
        // انعطت من جهازٍ ثانٍ (أو حُذفت): لا نعطيها مرّتين — نقول ونحدّث.
        toast.error(t("passport.next.goneTitle", "هالجرعة انسجلت قبل — حدّثنا السجلّ"));
        onSaved();
        if (alive.current) onClose();
      } else {
        toast.error(t("passport.boosterError", "تعذّر الحفظ — حاول مرة أخرى."), describeDbError(e, t));
      }
      if (alive.current) setBusy(false);
      return;
    }
    try {
      if (!already && nextDue && !dueBad) {
        await repo.addVaccination({
          pet_id: vaccine.pet_id, name: vaccine.name, status: statusForDue(nextDue, todayISO),
          administered_at: null, due_date: nextDue,
        });
      }
      playSuccess();
      toast.success(t("passport.boosterGiven", "تم تسجيل الجرعة"),
        already ? t("passport.next.keptExisting", { date: longDate(already.due_date!), defaultValue: "الجاية محجوزة أصلاً: {{date}}" })
          : nextDue ? t("passport.next.scheduled", { date: longDate(nextDue), defaultValue: "الجرعة الجاية: {{date}}" })
            : t("passport.next.noneDone", "بلا جرعة جاية"));
      onSaved();
      if (alive.current) onClose();
    } catch (e) {
      // الجرعةُ انحفظت والموعدُ لا: النافذةُ تبقى والزرُّ يحجز وحده، والأبُ يحدّث (الجرعةُ معطاةٌ فعلاً).
      playWarning();
      toast.error(t("passport.next.scheduleFailed", "انعطت الجرعة، بس ما انحجز الموعد الجاي — اضغط «احجز الموعد»"), describeDbError(e, t));
      onSaved();
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  /** الإغلاقُ أثناء الحفظ ممنوع؛ وبعد إعطاءٍ بلا حجز يحدّث الأبَ (لا تبقى الجرعةُ «معلّقة» بالشاشة). */
  const close = () => { if (busy) return; if (givenDone) onSaved(); onClose(); };

  const chip = (active: boolean) => cn(
    "rounded-xl border px-3 py-1.5 text-xs font-bold transition active:scale-95",
    active ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-ink",
  );
  const sameAsSuggested = (iv: VaxInterval) => suggestion?.interval.key === iv.key;
  /** اسمُ المدّة المعروض — من قائمة نموذج الإضافة نفسها. */
  const label = (key: string) => { const b = BOOSTERS.find((x) => x.key === key); return b ? t(b.key, b.def) : key; };

  return (
    <Modal open={!!vaccine} onClose={close} dismissible={!busy} title={t("passport.confirmAdminTitle", "تأكيد الإعطاء")}>
      {vaccine && (
        <div className="space-y-4" data-administer-dose={vaccine.id}>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"><Syringe size={19} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{vaccine.name}</p>
              {vaccine.due_date && (
                <p className="truncate text-xs text-ink-muted">{t("passport.scheduledFor", { date: longDate(vaccine.due_date), defaultValue: "مجدولة في {{date}}" })}</p>
              )}
            </div>
          </div>

          {!givenDone && (
            <>
              <div>
                <label className="label flex items-center gap-1.5"><Stethoscope size={14} className="text-brand-600" /> {t("medentry.attendingDoctor", "الطبيب المعالج")}</label>
                <DoctorSelect value={doctor} onChange={setDoctor} />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><CalendarClock size={14} className="text-brand-600" /> {t("passport.dateTime", "التاريخ والوقت")}</label>
                <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><NotebookPen size={14} className="text-brand-600" /> {t("medentry.clinicalNotes", "ملاحظات سريرية")}</label>
                <textarea rows={2} className="input min-h-[64px] resize-y leading-relaxed" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("passport.boosterNotesPlaceholder", "ملاحظات أثناء زيارة الجرعة المعزّزة…")} />
              </div>
            </>
          )}

          {/* ── الجرعةُ الجاية: سؤالٌ لا يُتخطّى ── */}
          <div className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-500/30 dark:bg-brand-500/5" data-next-dose>
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><CalendarClock size={15} className="text-brand-600" /> {t("passport.next.title", "شوكت الجرعة الجاية؟")}</p>
            {already ? (
              <p className="text-xs font-semibold text-ink-muted" data-next-existing>
                {t("passport.next.existing", { date: longDate(already.due_date!), defaultValue: "الجاية محجوزة أصلاً بتاريخ {{date}} — ما نكرّرها." })}
              </p>
            ) : (
              <>
                {suggestion && (
                  <p className="text-2xs text-ink-subtle" data-next-suggested>
                    {t("passport.next.suggestedPreset", { label: label(suggestion.interval.key), defaultValue: "★ نفس المدّة السابقة ({{label}}) — اختار إذا تنطبق" })}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {BOOSTERS.map((iv) => {
                    const active = choice?.kind === "preset" && choice.iv.key === iv.key;
                    return (
                      <button key={iv.key} type="button" className={chip(active)} data-next-preset={iv.key} aria-pressed={active}
                        onClick={() => { playTap(); setChoice({ kind: "preset", iv }); }}>
                        {label(iv.key)}{sameAsSuggested(iv) ? " ★" : ""}
                      </button>
                    );
                  })}
                  <button type="button" className={chip(choice?.kind === "none")} data-next-none aria-pressed={choice?.kind === "none"}
                    onClick={() => { playTap(); setChoice({ kind: "none" }); }}>
                    <CalendarX size={12} className="me-1 inline" /> {t("passport.next.none", "ماكو جرعة جاية")}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-ink-muted">{t("passport.next.orDate", "أو تاريخ ثاني:")}</span>
                  <input type="date" className={cn("input h-9 flex-1 text-sm", choice?.kind === "date" && "border-brand-500")} min={addInterval(givenDay, { days: 1 })} max={addInterval(todayISO, { years: 5 })}
                    value={customDue} data-next-date
                    onChange={(e) => { setCustomDue(e.target.value); setChoice(e.target.value ? { kind: "date", due: e.target.value } : null); }} />
                </div>
                {nextDue && !dueBad && (
                  <p className="text-xs font-bold text-success-700 dark:text-success-300" data-next-due={nextDue}>
                    {t("passport.next.willBe", { date: longDate(nextDue), defaultValue: "الجاية: {{date}}" })}
                  </p>
                )}
                {dueBad && <p className="text-xs font-semibold text-danger-600">{t("passport.next.mustBeAfter", "موعد الجاية لازم بعد يوم الإعطاء، وخلال ٥ سنوات.")}</p>}
                {!choice && <p className="text-xs font-semibold text-warn-700 dark:text-warn-200" data-next-ask>{t("passport.next.ask", "اختار موعد الجاية، أو «ماكو جرعة جاية» إذا هاي آخر جرعة.")}</p>}
              </>
            )}
          </div>

          <Button size="lg" className="w-full" loading={busy} disabled={!answered} leftIcon={<Check size={18} />} onClick={() => void confirm()} data-administer-confirm>
            {givenDone ? t("passport.next.bookOnly", "احجز الموعد") : t("passport.confirmSave", "تأكيد وحفظ")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
