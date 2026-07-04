import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import type { Pet } from "@/types";
import { opsStore } from "@/lib/opsStore";
import { COLUMN_ORDER, STATUS_META, statusOf, patchForStatus, currentAdmissionFor, type OpStatus } from "@/lib/opsStatus";
import { branchStore } from "@/lib/branchStore";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui";
import { cn, localISO } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * ClinicPresenceBar — "أين هذا الحيوان الآن داخل العيادة؟"
 *
 * One glance answers it, one tap changes it: the four operational statuses
 * (رعاية طبية / فندقة علاجية / فندقة / مكتملة) as pills, with the current one
 * lit in its calendar colour. Selecting another writes through the SAME shared
 * opsStore + patch rules as the التقويم الرئيسي drag-and-drop, so the calendar
 * and this bar are always perfectly in sync — a change here appears there
 * instantly, and vice versa. If the pet isn't checked in at all, picking a
 * status checks it in (creating today's admission on the device's branch).
 * ==========================================================================*/
export function ClinicPresenceBar({ pet }: { pet: Pet }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const todayISO = localISO();

  const [ops, setOps] = useState(() => opsStore.get());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    void opsStore.hydrate(clinicId).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const current = currentAdmissionFor(pet.id, ops.admissions);
  const currentStatus: OpStatus | null = current ? statusOf(current) : null;
  const inClinic = !!current && current.status !== "discharged";

  const move = async (target: OpStatus) => {
    if (busy || target === currentStatus) return;
    // Not checked in and the target is "done" → nothing to discharge.
    if (!inClinic && target === "done") return;
    playTap();
    setBusy(true);
    try {
      if (inClinic && current) {
        // Move the live stay — identical semantics to the calendar's DnD.
        await opsStore.patch(current.id, patchForStatus(target, todayISO));
      } else {
        // Not in the clinic (never admitted, or last stay closed) → check in as a
        // NEW case today, on this device's branch. History stays intact.
        await opsStore.addCase({
          pet_id: pet.id,
          clinic_id: clinicId ?? null,
          branch_id: branchStore.branchForWrite(),
          kind: target === "care" ? "treatment" : target === "careBoarding" ? "treatment_boarding" : "boarding",
          status: "active",
          admitted_on: todayISO,
        }, pet);
      }
      playSuccess();
    } catch (e) {
      playWarning();
      toast.error(t("presence.updateFail", "تعذّر تحديث موقع الحيوان، حاول مجدداً."), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-4 p-4 no-print">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><MapPin size={16} /></span>
        <h3 className="font-display text-sm font-extrabold text-ink">{t("presence.title", "موقعه في العيادة الآن")}</h3>
        <span className={cn(
          "chip text-2xs font-semibold",
          inClinic && currentStatus
            ? STATUS_META[currentStatus].chip
            : "bg-surface-2 text-ink-subtle",
        )}>
          {inClinic && currentStatus
            ? t(STATUS_META[currentStatus].key, STATUS_META[currentStatus].def)
            : currentStatus === "done"
              ? t("presence.left", "غادر العيادة")
              : t("presence.notIn", "غير مسجّل في العيادة حالياً")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLUMN_ORDER.map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const active = currentStatus === s && (s === "done" ? !!current : inClinic);
          const disabled = busy || (s === "done" && !inClinic);
          return (
            <button
              key={s}
              onClick={() => void move(s)}
              disabled={disabled || active}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition",
                active
                  ? cn("border-transparent shadow-card", m.head)
                  : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink",
                disabled && !active && "opacity-45",
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span className="truncate">{t(m.key, m.def)}</span>
              {active && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-2xs text-ink-subtle">
        {t("presence.hint", "اختر حالة لنقل الحيوان — يتحدّث التقويم الرئيسي فوراً.")}
      </p>
    </section>
  );
}
