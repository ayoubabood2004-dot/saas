import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, CalendarDays, Lock, ChevronLeft, Loader2, Stethoscope, History, AlertTriangle } from "lucide-react";
import type { Pet, ClinicVisit } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { VISIT_KINDS, visitKindMeta } from "@/lib/visits";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { formatDate, localISO, cn } from "@/lib/utils";
import { pastMoment, recordedLater, clockOf24, EARLIEST_DAY, VISIT_LATE_GAP_MS } from "@/lib/backdate";
import { playTap, playSuccess } from "@/lib/sounds";
import type { VisitKind } from "@/types";

/**
 * The "الزيارات" panel on the pet passport: opens a new visit (type → intake
 * condition + note) and lists every past/open visit as a card that links to the
 * standalone visit page.
 */
export function VisitsPanel({ pet, visits, canEdit, onChanged }: { pet: Pet; visits: ClinicVisit[]; canEdit: boolean; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [openDialog, setOpenDialog] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">الزيارات</h3>
          <p className="text-xs text-ink-subtle">افتح زيارة جديدة لكل مرة يجي بيها الحيوان — كل زيارة سجلّ مستقل يُراجَع في أي وقت.</p>
        </div>
        {canEdit && (
          <button className="btn-primary py-2 px-4 text-sm" onClick={() => { playTap(); setOpenDialog(true); }}>
            <Plus size={16} /> زيارة جديدة
          </button>
        )}
      </div>

      {visits.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-ink-subtle">
          <CalendarDays size={28} className="mb-2 opacity-40" />
          لا توجد زيارات بعد — افتح أول زيارة لهذا الحيوان.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visits.map((v) => {
            const k = visitKindMeta(v.kind);
            const KIcon = k.icon;
            const ended = v.status === "ended";
            const out = ended && v.outcome ? OUTCOMES.find((o) => o.id === v.outcome) : null;
            return (
              <button
                key={v.id} type="button"
                onClick={() => { playTap(); navigate(`/pet/${pet.id}/visit/${v.id}`); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-brand-300 hover:shadow-card"
              >
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", k.tile)}><KIcon size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-ink">
                    {k.label}
                    {!ended && <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300"><span className="h-1.5 w-1.5 rounded-full bg-success-500" /> مفتوحة</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-subtle">
                    <CalendarDays size={11} /> {formatDate(v.opened_at, i18n.language)}
                    {recordedLater(v.opened_at, v.created_at, VISIT_LATE_GAP_MS) && (
                      <span data-visit-later className="inline-flex shrink-0 items-center gap-0.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-muted"
                        title={v.created_at ? t("visitOpen.recordedOn", { date: formatDate(v.created_at, i18n.language), defaultValue: "انكتبت بالسستم {{date}}" }) : undefined}>
                        <History size={10} /> {t("visitOpen.later", "سُجّلت لاحقاً")}
                      </span>
                    )}
                    {v.summary && <span className="truncate">· {v.summary}</span>}
                  </div>
                </div>
                {ended ? (
                  out ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-bold text-ink-muted"><GlyphMark name={out.id} size={13} className={glyphToneText(glyphTone(out.id) ?? "blue")} /> {out.label}</span>
                      : <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-bold text-ink-muted"><Lock size={11} className="inline" /> منتهية</span>
                ) : null}
                <ChevronLeft size={18} className="shrink-0 text-ink-subtle rtl:rotate-0" />
              </button>
            );
          })}
        </div>
      )}

      <OpenVisitDialog open={openDialog} onClose={() => setOpenDialog(false)} pet={pet} onOpened={onChanged} />
    </div>
  );
}

/* --------------------------- Open-visit dialog ---------------------------- */
function OpenVisitDialog({ open, onClose, pet, onOpened }: { open: boolean; onClose: () => void; pet: Pet; onOpened: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<VisitKind>("illness");
  const [condition, setCondition] = useState<string>("under_treatment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** متى جاء الحيوان: «هسّة» أو يومٌ ووقتٌ سابقان (ورق، سستم سابق) — والخطةُ تبدأ منه. */
  const [past, setPast] = useState(false);
  const [pastDay, setPastDay] = useState("");
  const [pastTime, setPastTime] = useState(() => clockOf24(new Date().toISOString()));
  const { t } = useTranslation();
  const today = localISO(new Date());
  const pastAt = past ? pastMoment(pastDay, pastTime) : null;
  const beforeBirth = past && !!pet.dob && !!pastDay && pastDay < pet.dob.slice(0, 10);
  const pastBad = past && (!pastAt || beforeBirth);

  const reset = () => { setStep(1); setKind("illness"); setCondition("under_treatment"); setNote(""); setPast(false); setPastDay(""); setPastTime(clockOf24(new Date().toISOString())); };
  const close = () => { onClose(); setTimeout(reset, 200); };

  const create = async () => {
    if (busy || pastBad) return;
    setBusy(true);
    try {
      const v = await repo.addClinicVisit({
        pet_id: pet.id, kind, status: "open", condition,
        opened_at: pastAt ?? new Date().toISOString(), opened_by: user?.full_name ?? null,
      });
      if (note.trim()) {
        await repo.addPetNote({ pet_id: pet.id, note_text: note.trim(), author_id: user?.id ?? null, author_name: user?.full_name ?? null, visit_id: v.id });
      }
      playSuccess();
      onOpened();
      close();
      navigate(`/pet/${pet.id}/visit/${v.id}`);
    } catch (e) {
      toast.error("تعذّر فتح الزيارة", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title="فتح زيارة جديدة">
      {step === 1 ? (
        <div className="space-y-3">
          <div className="text-xs font-bold text-ink-muted">نوع الزيارة</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VISIT_KINDS.map((k) => {
              const KIcon = k.icon;
              const on = kind === k.id;
              return (
                <button key={k.id} type="button" onClick={() => { playTap(); setKind(k.id); }}
                  className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition", on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                  <span className={cn("grid h-10 w-10 place-items-center rounded-xl", k.tile)}><KIcon size={20} /></span>
                  <span className="text-2xs font-bold text-ink">{k.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end pt-1">
            <Button rightIcon={<ChevronLeft size={16} className="rtl:block ltr:hidden" />} onClick={() => { playTap(); setStep(2); }}>التالي</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-bold text-ink-muted">وضع الحالة عند الدخول</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OUTCOMES.map((o) => {
                const on = condition === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => { playTap(); setCondition(o.id); }}
                    className={cn("flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center transition", on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                    <GlyphMark name={o.id} size={26} className={glyphToneText(glyphTone(o.id) ?? "blue")} />
                    <span className="text-2xs font-bold text-ink">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div data-visit-when>
            <div className="mb-2 text-xs font-bold text-ink-muted">{t("visitOpen.when", "متى جاكم؟")}</div>
            <div className="inline-flex w-full items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
              {([false, true] as const).map((v) => (
                <button key={String(v)} type="button" data-visit-past={v ? "1" : "0"} onClick={() => { playTap(); setPast(v); }}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    past === v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
                  {v ? <History size={15} /> : <CalendarDays size={15} />}
                  {v ? t("visitOpen.past", "بتاريخ سابق") : t("visitOpen.now", "هسّة")}
                </button>
              ))}
            </div>
            {past && (
              <div className="mt-2 space-y-2 rounded-2xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-2xs font-bold text-ink-muted">{t("visitOpen.day", "اليوم")}</span>
                    <input type="date" data-visit-day value={pastDay} min={EARLIEST_DAY} max={today} onChange={(e) => setPastDay(e.target.value)}
                      className="input h-11 w-full tabular-nums [color-scheme:light] dark:[color-scheme:dark]" dir="ltr" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-bold text-ink-muted">{t("visitOpen.time", "الساعة")}</span>
                    <input type="time" data-visit-time value={pastTime} onChange={(e) => setPastTime(e.target.value)}
                      className="input h-11 w-full tabular-nums [color-scheme:light] dark:[color-scheme:dark]" dir="ltr" />
                  </label>
                </div>
                {pastDay && pastBad ? (
                  <p className="flex items-center gap-1.5 text-2xs font-bold text-danger-600 dark:text-danger-400" data-visit-bad>
                    <AlertTriangle size={12} className="shrink-0" />
                    {beforeBirth ? t("visitOpen.beforeBirth", "قبل ميلاد الحيوان — تأكد من السنة") : t("visitOpen.badMoment", "التاريخ لازم يكون قبل هسّة وصحيح")}
                  </p>
                ) : (
                  <p className="text-2xs leading-relaxed text-ink-subtle">{t("visitOpen.pastHint", "خطة العلاج تبدي من هذا التاريخ، وبعدها تحدد الجرعات الي انطت بأيامها.")}</p>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">ملاحظة أولية <span className="font-normal text-ink-subtle">(اختياري)</span></div>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الزيارة أو الشكوى…" className="input min-h-[80px] resize-y leading-relaxed" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { playTap(); setStep(1); }} className="text-sm font-bold text-ink-muted hover:text-ink">رجوع</button>
            <Button className="ms-auto" leftIcon={busy ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />} loading={busy} disabled={pastBad} onClick={create}>
              فتح الزيارة
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
