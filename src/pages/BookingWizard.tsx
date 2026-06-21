import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Stethoscope, Syringe, Scissors, Video, Home, Check, ArrowLeft, ArrowRight, Sun, Sunset, CalendarClock } from "lucide-react";
import type { Pet, ServiceType, Doctor } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { doctorsForService, SERVICES, SLOT_MINUTES, CLINIC_OPEN_HOUR, CLINIC_CLOSE_HOUR } from "@/lib/clinic";
import { generateSlots, formatTime } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { Button, Card, SuccessDialog, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";

const SERVICE_ICON: Record<ServiceType, typeof Stethoscope> = {
  consultation: Stethoscope,
  vaccination: Syringe,
  surgery: Scissors,
  telehealth: Video,
  home: Home,
};

function initials(name: string) {
  return name.replace(/^Dr\.?\s*/i, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function BookingWizard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [booking, setBooking] = useState(false);
  const [step, setStep] = useState(1);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<string | null>(params.get("pet"));
  const [service, setService] = useState<ServiceType | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [dayOffset, setDayOffset] = useState(1);
  const [slot, setSlot] = useState<string | null>(null);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [symptoms, setSymptoms] = useState("");
  const [done, setDone] = useState(false);

  const lang = i18n.language === "ar" ? "ar-EG-u-nu-latn" : "en-US";
  const Next = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (user) repo.listPets(user.id).then(setPets).catch(() => setPets([]));
  }, [user]);

  useEffect(() => {
    if (petId && step === 1) setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  })();

  useEffect(() => {
    if (!doctor) return;
    const slots = generateSlots(dayISO, CLINIC_OPEN_HOUR, CLINIC_CLOSE_HOUR, SLOT_MINUTES);
    Promise.all(slots.map((s) => repo.slotTaken(doctor.id, s)))
      .then((res) => setTakenSlots(new Set(slots.filter((_, i) => res[i]))))
      .catch(() => setTakenSlots(new Set())); // booking re-checks the slot before confirming
  }, [doctor, dayISO]);

  const pet = pets.find((p) => p.id === petId);

  const book = async () => {
    if (!user || !pet || !service || !doctor || !slot || booking) return;
    setBooking(true);
    try {
      if (await repo.slotTaken(doctor.id, slot)) {
        playWarning();
        setSlot(null);
        return;
      }
      await repo.createAppointment({
        pet_id: pet.id,
        owner_id: user.id,
        doctor_id: doctor.id,
        doctor_name: doctor.name,
        service,
        status: "requested",
        scheduled_at: slot,
        duration_min: SLOT_MINUTES,
        symptoms: symptoms.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      toast.error(t("records.saveError", "Couldn't save. Please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      setBooking(false);
    }
  };

  const slots = doctor ? generateSlots(dayISO, CLINIC_OPEN_HOUR, CLINIC_CLOSE_HOUR, SLOT_MINUTES) : [];
  const freeSlots = slots.filter((s) => !takenSlots.has(s));
  const morning = freeSlots.filter((s) => new Date(s).getHours() < 12);
  const afternoon = freeSlots.filter((s) => new Date(s).getHours() >= 12);

  const steps = [
    t("booking.stPet", "Pet"),
    t("booking.stService", "Service"),
    t("booking.stTime", "Time"),
    t("booking.stConfirm", "Confirm"),
  ];

  const canNext = (step === 1 && !!petId) || (step === 2 && !!service) || (step === 3 && !!doctor && !!slot);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">{t("booking.title")}</h1>

      {/* Stepper */}
      <div className="mt-5 mb-7 flex items-center">
        {steps.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const completed = n < step;
          return (
            <div key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-all",
                    completed ? "bg-brand-600 text-white" : active ? "bg-brand-600 text-white shadow-glow" : "bg-surface-2 text-ink-subtle",
                  )}
                >
                  {completed ? <Check size={16} /> : n}
                </div>
                <span className={cn("text-xs font-medium", active ? "text-ink" : "text-ink-subtle")}>{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full bg-brand-500" initial={false} animate={{ width: completed ? "100%" : "0%" }} transition={{ duration: 0.3 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          {/* Step 1: pet */}
          {step === 1 && (
            <div>
              <h2 className="mb-3 font-display font-bold text-ink">{t("booking.selectPet")}</h2>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {pets.map((p) => (
                  <motion.button
                    key={p.id}
                    variants={staggerItem}
                    onClick={() => { playTap(); setPetId(p.id); setStep(2); }}
                    className={cn("card flex flex-col items-center gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-card", petId === p.id && "ring-2 ring-brand-400")}
                  >
                    <PetAvatar pet={p} size={72} />
                    <span className="font-semibold text-ink">{p.name}</span>
                    <span className="text-xs text-ink-muted">{t(`pet.species.${p.species}`)}</span>
                  </motion.button>
                ))}
              </motion.div>
            </div>
          )}

          {/* Step 2: service */}
          {step === 2 && (
            <div>
              <h2 className="mb-3 font-display font-bold text-ink">{t("booking.selectService")}</h2>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 gap-3">
                {SERVICES.map((s) => {
                  const Icon = SERVICE_ICON[s];
                  const sel = service === s;
                  return (
                    <motion.button
                      key={s}
                      variants={staggerItem}
                      onClick={() => { playTap(); setService(s); setDoctor(null); setSlot(null); setStep(3); }}
                      className={cn("card flex flex-col items-center gap-2.5 p-5 transition hover:-translate-y-0.5 hover:shadow-card", sel && "ring-2 ring-brand-400")}
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        <Icon size={26} />
                      </span>
                      <span className="font-semibold text-ink">{t(`service.${s}`)}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>
          )}

          {/* Step 3: doctor + time */}
          {step === 3 && service && (
            <div className="space-y-6">
              <div>
                <h2 className="mb-3 font-display font-bold text-ink">{t("booking.selectDoctor")}</h2>
                {doctorsForService(service).length === 0 ? (
                  <p className="text-ink-subtle">{t("booking.noDoctors")}</p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {doctorsForService(service).map((d) => {
                      const sel = doctor?.id === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => { playTap(); setDoctor(d); setSlot(null); }}
                          className={cn("card flex items-center gap-3 p-3.5 text-start transition hover:-translate-y-0.5 hover:shadow-card", sel && "ring-2 ring-brand-400")}
                        >
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-grad font-display text-sm font-bold text-white shadow-soft">
                            {initials(d.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{d.name}</p>
                            <p className="truncate text-xs text-ink-muted">{d.specialty}</p>
                          </div>
                          {sel ? (
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white"><Check size={14} /></span>
                          ) : (
                            <span className="h-6 w-6 rounded-full border-2 border-line-strong" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {doctor && (
                <>
                  {/* Date strip */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-ink-muted"><CalendarClock size={16} /> {t("booking.selectDay")}</h3>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((off) => {
                        const d = new Date();
                        d.setDate(d.getDate() + off);
                        const active = off === dayOffset;
                        return (
                          <button
                            key={off}
                            onClick={() => { playTap(); setDayOffset(off); setSlot(null); }}
                            className={cn(
                              "flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3.5 py-2.5 transition",
                              active ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:border-brand-200 hover:text-ink",
                            )}
                          >
                            <span className="text-xs font-medium opacity-80">{d.toLocaleDateString(lang, { weekday: "short" })}</span>
                            <span className="font-display text-lg font-bold leading-none">{d.getDate()}</span>
                            <span className="text-2xs opacity-80">{d.toLocaleDateString(lang, { month: "short" })}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time slots */}
                  <div>
                    <h3 className="mb-2 font-semibold text-ink-muted">{t("booking.selectTime")}</h3>
                    {freeSlots.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-subtle">{t("booking.noSlots")}</div>
                    ) : (
                      <div className="space-y-4">
                        <SlotGroup icon={<Sun size={15} />} label={t("booking.morning", "Morning")} slots={morning} selected={slot} onPick={setSlot} lang={i18n.language} />
                        <SlotGroup icon={<Sunset size={15} />} label={t("booking.afternoon", "Afternoon")} slots={afternoon} selected={slot} onPick={setSlot} lang={i18n.language} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: confirm */}
          {step === 4 && (
            <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-4">
              <Card padded>
                <div className="flex items-center gap-3">
                  {pet && <PetAvatar pet={pet} size={52} />}
                  <div>
                    <p className="font-display font-bold text-ink">{pet?.name}</p>
                    <p className="text-sm text-ink-muted">{service && t(`service.${service}`)}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                  <Row label={t("booking.doctor", "Doctor")} value={doctor?.name ?? "—"} />
                  <Row label={t("booking.date", "Date")} value={slot ? new Date(slot).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" }) : "—"} />
                  <Row label={t("booking.time", "Time")} value={slot ? formatTime(slot, i18n.language) : "—"} />
                </div>
              </Card>
              <div>
                <label className="label">{t("booking.symptoms")}</label>
                <textarea className="input min-h-24" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder={t("booking.symptomsPlaceholder")} />
              </div>
              <Button className="w-full" size="lg" onClick={book} loading={booking}>{t("booking.confirm")}</Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Nav */}
      <div className="mt-8 flex justify-between">
        <Button variant="ghost" leftIcon={<Prev size={18} />} onClick={() => (step === 1 ? navigate("/") : setStep(step - 1))}>
          {t("common.back")}
        </Button>
        {step < 4 && (
          <Button rightIcon={<Next size={18} />} disabled={!canNext} onClick={() => setStep(step + 1)}>
            {t("common.next")}
          </Button>
        )}
      </div>

      <SuccessDialog
        open={done}
        onClose={() => navigate("/")}
        title={t("booking.booked")}
        message={t("booking.bookedHint")}
        actionLabel={t("booking.viewAppointments")}
        onAction={() => navigate("/")}
      />
    </div>
  );
}

function SlotGroup({ icon, label, slots, selected, onPick, lang }: { icon: React.ReactNode; label: string; slots: string[]; selected: string | null; onPick: (s: string) => void; lang: string }) {
  if (slots.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{icon} {label}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((s) => {
          const sel = selected === s;
          return (
            <button
              key={s}
              onClick={() => { playTap(); onPick(s); }}
              className={cn(
                "rounded-xl py-2.5 text-sm font-medium transition",
                sel ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink hover:border-brand-300",
              )}
            >
              {formatTime(s, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-end font-semibold text-ink">{value}</span>
    </div>
  );
}
