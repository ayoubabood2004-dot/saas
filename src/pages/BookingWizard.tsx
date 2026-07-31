import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Stethoscope, Syringe, Scissors, Video, Home, Check, ArrowLeft, ArrowRight, Sun, Sunset, CalendarClock, Building2, MapPin, HeartHandshake, Search, Zap } from "lucide-react";
import type { Pet, ServiceType, ClinicInfo, PublicStaff } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { SERVICES, SLOT_MINUTES, CLINIC_OPEN_HOUR, CLINIC_CLOSE_HOUR } from "@/lib/clinic";
import { generateSlots, formatTime, dateLocale, localISO } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { Button, Card, SuccessDialog, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { getCached, setCached } from "@/lib/swrCache";

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
  // Real clinics + the chosen clinic's REAL team (no more hardcoded demo doctors).
  const [clinics, setClinics] = useState<ClinicInfo[]>([]);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<PublicStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [doctor, setDoctor] = useState<{ id: string; name: string; specialty?: string | null } | null>(null);
  const [dayOffset, setDayOffset] = useState(1);
  const [slot, setSlot] = useState<string | null>(null);
  // Busy times per doctor over the whole horizon — ONE fetch powers the
  // «أقرب موعد» badges, the per-day free counts and the slot grid.
  const [busy, setBusy] = useState<Record<string, string[]>>({});
  const [clinicQuery, setClinicQuery] = useState("");
  const [clinicFilter, setClinicFilter] = useState<"all" | "mine">("all");
  const [symptoms, setSymptoms] = useState("");
  const [done, setDone] = useState(false);

  const lang = i18n.language === "ar" ? dateLocale() : "en-US";
  const Next = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (user) repo.listPets(user.id).then(setPets).catch(() => setPets([]));
  }, [user]);

  // Clinics that have treated this owner's pets — surfaced first, badged.
  const myClinicIds = new Set(pets.map((p) => p.clinic_id).filter(Boolean) as string[]);

  useEffect(() => {
    // دليل العيادات: كاش لحظي + تحديث خفي — الخطوة ٣ تفتح جاهزة
    const cached = getCached<ClinicInfo[]>("clinic_directory");
    if (cached) setClinics(cached);
    let alive = true;
    repo.listClinicDirectory()
      .then((dir) => { setCached("clinic_directory", dir); if (alive) setClinics(dir); })
      .catch(() => { if (alive && !cached) setClinics([]); });
    return () => { alive = false; };
  }, []);

  // Directory rows: my-pets' clinics first; a pet clinic missing from the
  // directory (pre-migration backend) still gets a bookable placeholder row.
  const clinicRows: (ClinicInfo & { mine: boolean })[] = [
    ...clinics.map((c) => ({ ...c, mine: myClinicIds.has(c.id) })),
    ...[...myClinicIds]
      .filter((id) => !clinics.some((c) => c.id === id))
      .map((id) => ({ id, name: t("booking.yourPetsClinic", "عيادة حيواناتك"), city: null, phone: null, mine: true })),
  ].sort((a, b) => Number(b.mine) - Number(a.mine));

  const q = clinicQuery.trim().toLowerCase();
  const visibleClinics = clinicRows.filter(
    (c) => (clinicFilter === "all" || c.mine) && (!q || c.name.toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q)),
  );

  /** Booking horizon (days ahead) shown in the date strip + scanned for «أقرب موعد». */
  const HORIZON = 12;
  const dayISOFor = (off: number) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    return localISO(d); // local calendar — evenings must not flip to tomorrow via UTC
  };
  const slotsForDay = (off: number) => generateSlots(dayISOFor(off), CLINIC_OPEN_HOUR, CLINIC_CLOSE_HOUR, SLOT_MINUTES);
  const busySetOf = (docId: string) => new Set(busy[docId] ?? []);
  /** First free slot for a doctor across the horizon (drives the badge + quick-book). */
  const nextFreeFor = (docId: string): string | null => {
    const b = busySetOf(docId);
    for (let off = 1; off <= HORIZON; off++) {
      for (const s of slotsForDay(off)) if (!b.has(s)) return s;
    }
    return null;
  };
  const freeCountForDay = (docId: string, off: number) => {
    const b = busySetOf(docId);
    return slotsForDay(off).filter((s) => !b.has(s)).length;
  };

  const pickClinic = (id: string) => {
    setClinicId(id);
    setDoctor(null);
    setSlot(null);
    // كادر العيادة: يظهر لحظياً من الكاش (إن سبق فتحه) والتحديث يلحقه بالخفاء
    const cachedStaff = getCached<PublicStaff[]>(`clinic_staff_${id}`);
    if (cachedStaff) { setStaffList(cachedStaff); setStaffLoading(false); } else setStaffLoading(true);
    repo.listClinicStaffPublic(id)
      .then(async (list) => {
        const bookable = list.filter((s) => s.role === "veterinarian" || s.role === "manager");
        setCached(`clinic_staff_${id}`, bookable);
        setStaffList(bookable);
        // One availability sweep for the whole roster (plus the any-doctor key).
        const from = `${dayISOFor(1)}T00:00:00`;
        const to = `${dayISOFor(HORIZON)}T23:59:59`;
        const ids = [...bookable.map((s) => s.id), `any:${id}`];
        setBusy(await repo.listDoctorBusySlots(ids, from, to).catch(() => ({})));
      })
      .catch(() => { if (!cachedStaff) setStaffList([]); })
      .finally(() => setStaffLoading(false));
  };

  /** One-tap quick booking: jump straight to the doctor's nearest free slot. */
  const quickBook = (d: { id: string; name: string; specialty?: string | null }) => {
    const s = nextFreeFor(d.id);
    if (!s) return;
    playTap();
    setDoctor(d);
    const off = Math.max(1, Math.round((new Date(localISO(new Date(s))).getTime() - new Date(dayISOFor(0)).getTime()) / 864e5));
    setDayOffset(off);
    setSlot(s);
  };

  useEffect(() => {
    if (petId && step === 1) setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayISO = dayISOFor(dayOffset);

  // Slot grid derives straight from the availability sweep — no per-slot queries.
  const takenSlots = new Set<string>(doctor ? (busy[doctor.id] ?? []).filter((s) => localISO(new Date(s)) === dayISO) : []);

  const pet = pets.find((p) => p.id === petId);

  const book = async () => {
    if (!user || !pet || !service || !clinicId || !doctor || !slot || booking) return;
    setBooking(true);
    try {
      // Final clash re-check via the availability RPC — works for owners too,
      // where direct appointment reads are (rightly) blocked by RLS.
      const clash = await repo.listDoctorBusySlots([doctor.id], slot, slot).catch(() => ({} as Record<string, string[]>));
      if ((clash[doctor.id] ?? []).length > 0 || (await repo.slotTaken(doctor.id, slot).catch(() => false))) {
        playWarning();
        setSlot(null);
        return;
      }
      await repo.createAppointment({
        pet_id: pet.id,
        owner_id: user.id,
        clinic_id: clinicId, // the booking lands in THIS clinic's reception
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

  const canNext = (step === 1 && !!petId) || (step === 2 && !!service) || (step === 3 && !!clinicId && !!doctor && !!slot);

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

          {/* Step 3: clinic + doctor + time */}
          {step === 3 && service && (
            <div className="space-y-6">
              {/* Which clinic? — real clinics; the ones treating your pets come first */}
              <div>
                <h2 className="mb-3 font-display font-bold text-ink">{t("booking.selectClinic", "اختر العيادة")}</h2>

                {/* بحث + فلترة: كل العيادات / عيادات حيواناتي */}
                {clinicRows.length > 1 && (
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                      <input
                        className="input ps-9"
                        value={clinicQuery}
                        onChange={(e) => setClinicQuery(e.target.value)}
                        placeholder={t("booking.searchClinic", "دور بالاسم أو المدينة…")}
                      />
                    </div>
                    {myClinicIds.size > 0 && (
                      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
                        {(["all", "mine"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => { playTap(); setClinicFilter(f); }}
                            className={cn(
                              "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:flex-none",
                              clinicFilter === f ? "bg-white text-brand-700 shadow-card dark:bg-surface-1 dark:text-brand-300" : "text-ink-muted hover:text-ink",
                            )}
                          >
                            {f === "all" ? t("booking.allClinics", "كل العيادات") : t("booking.mineOnly", "عيادات حيواناتي")}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {clinicRows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-subtle">{t("booking.noClinics", "ماكو عيادات متاحة للحجز بعد.")}</p>
                ) : visibleClinics.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-subtle">{t("booking.noMatch", "ماكو نتيجة مطابقة — جرب كلمة ثانية.")}</p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {visibleClinics.map((c) => {
                      const sel = clinicId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => { playTap(); pickClinic(c.id); }}
                          className={cn("card flex items-center gap-3 p-3.5 text-start transition hover:-translate-y-0.5 hover:shadow-card", sel && "ring-2 ring-brand-400")}
                        >
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                            <Building2 size={22} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{c.name}</p>
                            <p className="flex items-center gap-2 text-xs text-ink-muted">
                              {c.city && <span className="flex items-center gap-0.5"><MapPin size={11} /> {c.city}</span>}
                              {c.mine && (
                                <span className="flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                                  <HeartHandshake size={11} /> {t("booking.myClinicBadge", "تعالج حيواناتك")}
                                </span>
                              )}
                            </p>
                          </div>
                          {sel ? (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Check size={14} /></span>
                          ) : (
                            <span className="h-6 w-6 shrink-0 rounded-full border-2 border-line-strong" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* The chosen clinic's REAL team */}
              {clinicId && (
                <div>
                  <h2 className="mb-3 font-display font-bold text-ink">{t("booking.selectDoctor")}</h2>
                  {staffLoading ? (
                    <p className="text-sm text-ink-subtle">{t("common.loading", "لحظة…")}</p>
                  ) : staffList.length === 0 ? (
                    <button
                      onClick={() => { playTap(); setDoctor({ id: `any:${clinicId}`, name: t("booking.anyDoctor", "أي طبيب متاح") }); setSlot(null); }}
                      className={cn("card flex w-full items-center gap-3 p-3.5 text-start transition hover:-translate-y-0.5 hover:shadow-card", doctor?.id === `any:${clinicId}` && "ring-2 ring-brand-400")}
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-grad text-white shadow-soft"><Stethoscope size={20} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{t("booking.anyDoctor", "أي طبيب متاح")}</p>
                        <p className="text-xs text-ink-muted">{t("booking.noStaffHint", "هذه العيادة لم تنشر كادرها بعد — احجز والعيادة تحدد لك الطبيب.")}</p>
                      </div>
                      {doctor?.id === `any:${clinicId}` && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Check size={14} /></span>}
                    </button>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {staffList.map((d) => {
                        const sel = doctor?.id === d.id;
                        const nf = nextFreeFor(d.id);
                        return (
                          <button
                            key={d.id}
                            onClick={() => { playTap(); setDoctor({ id: d.id, name: d.name, specialty: d.specialty }); setSlot(null); }}
                            className={cn("card flex flex-col gap-2.5 p-3.5 text-start transition hover:-translate-y-0.5 hover:shadow-card", sel && "ring-2 ring-brand-400")}
                          >
                            <span className="flex w-full items-center gap-3">
                              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-grad font-display text-sm font-bold text-white shadow-soft">
                                {initials(d.name)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-ink">{d.name}</span>
                                <span className="block truncate text-xs text-ink-muted">{d.specialty || t("booking.vet", "طبيب بيطري")}</span>
                              </span>
                              {sel ? (
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Check size={14} /></span>
                              ) : (
                                <span className="h-6 w-6 shrink-0 rounded-full border-2 border-line-strong" />
                              )}
                            </span>
                            {/* أقرب موعد متاح + حجز سريع بضغطة */}
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className={cn("flex items-center gap-1 text-xs font-medium tabular-nums", nf ? "text-success-700 dark:text-success-300" : "text-ink-subtle")}>
                                <CalendarClock size={13} />
                                {nf
                                  ? t("booking.nextFree", {
                                      when: `${new Date(nf).toLocaleDateString(lang, { weekday: "long" })} ${formatTime(nf, i18n.language)}`,
                                      defaultValue: "أقرب موعد: {{when}}",
                                    })
                                  : t("booking.fullyBooked", "محجوز بالكامل هالفترة")}
                              </span>
                              {nf && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); quickBook(d); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); quickBook(d); } }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                                >
                                  <Zap size={12} /> {t("booking.quickBook", "احجز أقرب موعد")}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {doctor && (
                <>
                  {/* Date strip */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-ink-muted"><CalendarClock size={16} /> {t("booking.selectDay")}</h3>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {Array.from({ length: HORIZON }, (_, i) => i + 1).map((off) => {
                        const d = new Date();
                        d.setDate(d.getDate() + off);
                        const active = off === dayOffset;
                        const free = freeCountForDay(doctor.id, off);
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
                            {/* كم وقت فاضي باليوم — يوجه الزبون لليوم الأنسب بلمحة */}
                            <span className={cn(
                              "mt-0.5 rounded-full px-1.5 text-2xs font-semibold tabular-nums",
                              active ? "bg-white/20 text-white" : free === 0 ? "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
                            )}>
                              {free === 0 ? t("booking.dayFull", "ممتلئ") : t("booking.dayFree", { n: free, defaultValue: "{{n}} متاح" })}
                            </span>
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
                  <Row label={t("booking.clinic", "العيادة")} value={clinicRows.find((c) => c.id === clinicId)?.name ?? "—"} />
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
