import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, Clock, UserCheck, DoorOpen, Stethoscope, Plus, Siren, CheckCircle2, ArrowRight } from "lucide-react";
import type { Appointment, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { DOCTORS, SERVICE_COLOR } from "@/lib/clinic";
import { PetAvatar } from "@/components/PetAvatar";
import { Modal } from "@/components/Modal";
import { Button, Badge } from "@/components/ui";
import { formatTime, cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { playSuccess, playWarning, playTap } from "@/lib/sounds";

/** Triage acuity colour language (1 = critical … 5 = routine). */
const TRIAGE: Record<number, { solid: string; chip: string; ring: string }> = {
  1: { solid: "bg-danger-500", chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200", ring: "ring-danger-400" },
  2: { solid: "bg-accent-500", chip: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300", ring: "ring-accent-400" },
  3: { solid: "bg-warn-500", chip: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200", ring: "ring-warn-400" },
  4: { solid: "bg-sky-500", chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", ring: "ring-sky-400" },
  5: { solid: "bg-success-500", chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200", ring: "ring-success-400" },
};
const tri = (a: Appointment) => a.triage_score ?? 3;

export function Reception() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [checkin, setCheckin] = useState<Appointment | null>(null);

  const today = new Date().toISOString();

  const load = async () => {
    const list = await repo.listAppointmentsForDay(today);
    setAppts(list);
    const ids = Array.from(new Set(list.map((a) => a.pet_id)));
    const map: Record<string, Pet> = {};
    await Promise.all(ids.map(async (id) => { const p = await repo.getPet(id); if (p) map[id] = p; }));
    setPets(map);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waiting = appts.filter((a) => a.status === "checked_in" || a.status === "in_room");
  const queue = [...waiting].sort((a, b) => tri(a) - tri(b)); // critical first
  const inRoom = appts.filter((a) => a.status === "in_room").length;
  const done = appts.filter((a) => a.status === "done").length;

  const stats = [
    { icon: CalendarDays, label: t("reception.scheduled", "Scheduled"), value: appts.length, tone: "brand" as const },
    { icon: UserCheck, label: t("reception.waiting"), value: waiting.length, tone: "warn" as const },
    { icon: DoorOpen, label: t("reception.inRoom", "In room"), value: inRoom, tone: "sky" as const },
    { icon: CheckCircle2, label: t("reception.done", "Completed"), value: done, tone: "success" as const },
  ];
  const statTone: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><CalendarDays size={20} /></span>
        <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("reception.title")}</h1>
        <span className="chip ms-2 bg-brand-50 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("reception.today")}</span>
        <Button className="ms-auto" size="sm" leftIcon={<Plus size={16} />} onClick={() => { playTap(); navigate("/new-case"); }}>
          {t("newCase.newCaseBtn")}
        </Button>
      </div>

      {/* Stats strip */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} variants={staggerItem} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-card">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", statTone[s.tone])}><Icon size={18} /></span>
              <div className="min-w-0">
                <p className="font-display text-xl font-extrabold leading-none text-ink">{s.value}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Triage acuity queue */}
      {queue.length > 0 && (
        <div className="card mb-5 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink">
            <Siren size={18} className="text-warn-600" /> {t("reception.triageQueue", "Triage queue")}
            <Badge tone="warn">{queue.length}</Badge>
          </h2>
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
            {queue.map((a) => {
              const cfg = TRIAGE[tri(a)];
              const pet = pets[a.pet_id];
              return (
                <motion.div key={a.id} variants={staggerItem} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5">
                  <span className={cn("h-11 w-1.5 shrink-0 rounded-full", cfg.solid)} />
                  {pet && <PetAvatar pet={pet} size={40} photoFallback />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{pet?.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                      <Clock size={11} /> {formatTime(a.scheduled_at, i18n.language)} · {t(`service.${a.service}`)} · {a.doctor_name.split(" ").slice(-1)}
                    </p>
                  </div>
                  <span className={cn("chip shrink-0 text-xs font-semibold", cfg.chip)}>
                    T{tri(a)} · {t(`triage.${tri(a)}`)}
                  </span>
                  <Button size="sm" variant="secondary" rightIcon={<ArrowRight size={14} />} onClick={() => { playTap(); navigate(`/consult/${a.pet_id}?appt=${a.id}`); }}>
                    {t("consult.open")}
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* Doctor board */}
      {appts.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("reception.noToday")}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOCTORS.map((doc) => {
            const col = appts.filter((a) => a.doctor_id === doc.id);
            return (
              <div key={doc.id} className="card p-3">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-line px-1 pb-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{doc.name}</p>
                    <p className="text-xs text-ink-subtle">{doc.specialty}</p>
                  </div>
                  <span className="chip bg-surface-2 text-2xs text-ink-muted">{col.length}</span>
                </div>
                <div className="min-h-12 space-y-2">
                  {col.length === 0 && <p className="px-1 py-3 text-xs text-ink-subtle">—</p>}
                  {col.map((a) => {
                    const color = SERVICE_COLOR[a.service];
                    const pet = pets[a.pet_id];
                    const arrived = a.status === "checked_in" || a.status === "in_room";
                    const cfg = TRIAGE[tri(a)];
                    return (
                      <div key={a.id} className={cn("rounded-2xl p-2.5 ring-1", arrived ? "bg-surface-1 ring-line" : "bg-surface-2 ring-line")}>
                        <div className="flex items-center gap-2">
                          {pet && <PetAvatar pet={pet} size={36} photoFallback />}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{pet?.name}</p>
                            <p className="flex items-center gap-1 text-[11px] text-ink-muted">
                              <Clock size={11} /> {formatTime(a.scheduled_at, i18n.language)} · {t(`service.${a.service}`)}
                            </p>
                          </div>
                          <span className={cn("h-2.5 w-2.5 rounded-full", color.dot)} />
                        </div>
                        <div className="mt-2">
                          {arrived ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="chip flex-1 justify-center bg-warn-100 text-[11px] text-warn-800 dark:bg-warn-500/20 dark:text-warn-200">
                                  <DoorOpen size={12} /> {t(`status.${a.status}`)}
                                </span>
                                {a.triage_score && (
                                  <span className={cn("chip shrink-0 text-[11px] font-semibold", cfg.chip)}>T{a.triage_score}</span>
                                )}
                              </div>
                              <button className="btn-secondary w-full py-1.5 text-xs" onClick={() => { playTap(); navigate(`/consult/${a.pet_id}?appt=${a.id}`); }}>
                                <Stethoscope size={14} /> {t("consult.open")}
                              </button>
                            </div>
                          ) : (
                            <button className="btn-primary w-full py-1.5 text-xs" onClick={() => { playTap(); setCheckin(a); }}>
                              <UserCheck size={14} /> {t("reception.checkIn")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CheckInModal
        appt={checkin}
        pet={checkin ? pets[checkin.pet_id] : undefined}
        onClose={() => setCheckin(null)}
        onSaved={() => { setCheckin(null); void load(); }}
      />
    </div>
  );
}

function CheckInModal({ appt, pet, onClose, onSaved }: { appt: Appointment | null; pet?: Pet; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState("");
  const [triage, setTriage] = useState(3);

  useEffect(() => {
    if (appt && pet) setWeight(pet.current_weight_kg ? String(pet.current_weight_kg) : "");
    setTriage(3);
  }, [appt, pet]);

  if (!appt) return null;

  const save = async () => {
    if (weight) await repo.addWeight(appt.pet_id, Number(weight));
    await repo.updateAppointment(appt.id, { status: "checked_in", checkin_weight_kg: weight ? Number(weight) : null, triage_score: triage });
    if (triage <= 2) playWarning();
    else playSuccess();
    onSaved();
  };

  return (
    <Modal open={!!appt} onClose={onClose} title={t("reception.checkInTitle", { name: pet?.name ?? "" })}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("reception.currentWeight")} ({t("common.kg")})</label>
          <input type="number" step="0.1" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("reception.triage")}</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => { setTriage(n); playTap(); }}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 font-bold text-white transition",
                  TRIAGE[n].solid,
                  triage === n ? "scale-105 ring-4 ring-offset-2 ring-offset-surface-1 " + TRIAGE[n].ring : "opacity-50 hover:opacity-80",
                )}
              >
                <span className="text-lg leading-none">{n}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs">
            <span className={cn("h-2.5 w-2.5 rounded-full", TRIAGE[triage].solid)} />
            <span className="font-semibold text-ink">{t(`triage.${triage}`)}</span>
            <span className="text-ink-subtle">· {t("reception.triageHint")}</span>
          </p>
        </div>
        <Button className="w-full" onClick={save}>{t("reception.save")}</Button>
      </div>
    </Modal>
  );
}
