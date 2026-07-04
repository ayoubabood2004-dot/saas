import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeartPulse, Heart } from "lucide-react";
import type { Pet } from "@/types";
import { opsStore } from "@/lib/opsStore";
import { repo } from "@/lib/repo";
import { Dialog, useToast } from "@/components/ui";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/** What the dialog needs to know about the discharge being tagged. */
export interface OutcomeTarget {
  admissionId: string;
  pet: Pet;
}

/* ============================================================================
 * OutcomeDialog — "كيف غادر الحيوان؟" asked right after a case is discharged
 * (drag to مكتملة in the calendar, or the record's presence bar). Two clear
 * choices; skipping keeps the outcome unspecified and can be set later.
 *
 * A fatal outcome also marks the PET itself deceased, which respectfully
 * silences birthday greetings/reminders for it everywhere. Writes go through
 * opsStore so every open surface updates instantly.
 * ==========================================================================*/
export function OutcomeDialog({ target, onClose }: { target: OutcomeTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (outcome: "recovered" | "deceased") => {
    if (!target || busy) return;
    playTap();
    setBusy(true);
    try {
      await opsStore.patch(target.admissionId, { outcome });
      if (outcome === "deceased") {
        // Mirror onto the pet so greetings/reminders go quiet. Optimistic in the
        // shared cache; the server write may be blocked for owner-shared pets
        // (their row belongs to the owner) — the admission outcome still holds.
        opsStore.upsertPet({ ...target.pet, deceased: true });
        try { await repo.updatePet(target.pet.id, { deceased: true }); } catch { /* shared pet — outcome recorded on the case */ }
      }
      playSuccess();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(t("outcome.saveFail", "تعذّر حفظ الحالة، حاول مجدداً."), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={t("outcome.title", { name: target?.pet.name ?? "", defaultValue: "كيف غادر {{name}}؟" })}
    >
      <p className="mb-4 text-sm text-ink-muted">{t("outcome.sub", "سجّل مصير الحالة عند الخروج — يظهر على البطاقة وفي السجل.")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => void pick("recovered")}
          disabled={busy}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-success-200 bg-success-50 p-5 text-center transition hover:border-success-400 hover:shadow-card active:scale-[0.98] disabled:opacity-60 dark:border-success-500/30 dark:bg-success-500/10"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-300"><HeartPulse size={24} /></span>
          <span className="font-display text-base font-extrabold text-success-700 dark:text-success-300">{t("outcome.recovered", "عايش — تعافى")}</span>
          <span className="text-2xs text-ink-muted">{t("outcome.recoveredSub", "غادر العيادة بصحة جيدة")}</span>
        </button>
        <button
          onClick={() => void pick("deceased")}
          disabled={busy}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-line bg-surface-2 p-5 text-center transition hover:border-ink-subtle hover:shadow-card active:scale-[0.98] disabled:opacity-60"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-ink-muted dark:bg-surface-1"><Heart size={24} /></span>
          <span className="font-display text-base font-extrabold text-ink">{t("outcome.deceased", "متوفى")}</span>
          <span className="text-2xs text-ink-muted">{t("outcome.deceasedSub", "تُوقف تهاني أعياد الميلاد تلقائياً")}</span>
        </button>
      </div>
      <button
        onClick={() => { playTap(); onClose(); }}
        className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
      >
        {t("outcome.later", "تحديد لاحقاً")}
      </button>
    </Dialog>
  );
}
