import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, CalendarDays, Lock, ChevronLeft, Loader2, Stethoscope } from "lucide-react";
import type { Pet, ClinicVisit } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { VISIT_KINDS, visitKindMeta } from "@/lib/visits";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { formatDate, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";
import type { VisitKind } from "@/types";

/**
 * The "الزيارات" panel on the pet passport: opens a new visit (type → intake
 * condition + note) and lists every past/open visit as a card that links to the
 * standalone visit page.
 */
export function VisitsPanel({ pet, visits, canEdit, onChanged }: { pet: Pet; visits: ClinicVisit[]; canEdit: boolean; onChanged: () => void }) {
  const { i18n } = useTranslation();
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

  const reset = () => { setStep(1); setKind("illness"); setCondition("under_treatment"); setNote(""); };
  const close = () => { onClose(); setTimeout(reset, 200); };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const v = await repo.addClinicVisit({
        pet_id: pet.id, kind, status: "open", condition,
        opened_at: new Date().toISOString(), opened_by: user?.full_name ?? null,
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
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">ملاحظة أولية <span className="font-normal text-ink-subtle">(اختياري)</span></div>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الزيارة أو الشكوى…" className="input min-h-[80px] resize-y leading-relaxed" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { playTap(); setStep(1); }} className="text-sm font-bold text-ink-muted hover:text-ink">رجوع</button>
            <Button className="ms-auto" leftIcon={busy ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />} loading={busy} onClick={create}>
              فتح الزيارة
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
