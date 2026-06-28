import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IdCard, Syringe, FileText, Images, QrCode as QrIcon, ArrowLeft, ArrowRight,
  Plus, Check, Clock, AlertCircle, ChevronDown, Printer, ShieldAlert, Pill, Trash2, BedDouble, Camera,
  Share2, Copy, Globe, PawPrint, Repeat, Columns2, X, Calendar,
  Utensils, Fingerprint, Cake, Heart, Scissors, Users, UserPlus, Phone, Mail, Pencil,
  Scale, Sparkles, Loader2, NotebookPen, CalendarClock, FileSignature,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, TreatmentEntry, Admission, FoodType, DietPlan, Appointment, Reminder, MedicalAssessment, PatientCondition } from "@/types";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { OwnerCard } from "@/components/OwnerCard";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { buildUpcomingEvents } from "@/lib/events";
import { WeightChart } from "@/components/WeightChart";
import { HealthSnapshot } from "@/components/HealthSnapshot";
import { PetSalesWidget } from "@/components/PetSalesWidget";
import { HealthCurve, type CurvePoint, Button, useToast, ProgressRing } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import { Modal } from "@/components/Modal";
import { ageFromDOB, daysUntil, uid, formatDate, formatTime, formatHM, cn } from "@/lib/utils";
import { prepareUpload } from "@/lib/image";
import { withTimeout, describeUploadError } from "@/lib/errors";
import { playSuccess, playScan, playTap, playWarning } from "@/lib/sounds";
import { ImageLightbox } from "@/components/ImageLightbox";
import { MedicalEntry, DoctorSelect, DOCTOR_NAMES, type MedicalDraft } from "@/components/MedicalEntry";
import { ConsentForms } from "@/components/ConsentForms";
import { addClinicMed, medicationDisplay } from "@/lib/meds";
import { breedLabel } from "@/lib/breeds";
import { vaccineScientific } from "@/lib/vaccines";
import { useAuth } from "@/contexts/AuthContext";
import { Stethoscope, SlidersHorizontal, ShoppingCart } from "lucide-react";
import { RangesEditor } from "@/components/RangesEditor";

type Tab = "diet" | "vaccines" | "history" | "treatment" | "media" | "qr";
/** Each section carries its own colour identity (matched to the events-feed category colours). */
const TABS: { id: Tab; icon: typeof IdCard; fill: string; text: string }[] = [
  { id: "diet", icon: Utensils, fill: "bg-success-100 dark:bg-success-500/20", text: "text-success-700 dark:text-success-200" },
  { id: "vaccines", icon: Syringe, fill: "bg-violet-100 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-200" },
  { id: "history", icon: FileText, fill: "bg-sky-100 dark:bg-sky-500/20", text: "text-sky-700 dark:text-sky-200" },
  { id: "treatment", icon: Pill, fill: "bg-danger-100 dark:bg-danger-500/20", text: "text-danger-700 dark:text-danger-200" },
  { id: "media", icon: Images, fill: "bg-accent-100 dark:bg-accent-500/20", text: "text-accent-700 dark:text-accent-200" },
  { id: "qr", icon: QrIcon, fill: "bg-brand-100 dark:bg-brand-500/20", text: "text-brand-700 dark:text-brand-200" },
];

/** Map a feed event category to the tab that shows its detail. */
const EVENT_TAB: Partial<Record<string, Tab>> = { vaccine: "vaccines", medication: "treatment", feeding: "diet", recheck: "history" };

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">{icon}{children}</span>;
}

/** Pet photo + name + breed + allergy — horizontal (mobile header) or premium gradient hero card (desktop rail). */
function ProfileHead({ pet, onPhoto, variant }: { pet: Pet; onPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void; variant: "row" | "card" }) {
  const { t, i18n } = useTranslation();
  const age = ageFromDOB(pet.dob);
  const photo = (size: number, ring?: boolean) => (
    <label className={cn("relative cursor-pointer shrink-0 no-print", ring && "rounded-full ring-4 ring-surface-1")} title={t("passport.changePhoto")}>
      <PetAvatar pet={pet} size={size} photoFallback />
      <span className="absolute -bottom-1 -end-1 grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white shadow-soft">
        <Camera size={15} />
      </span>
      <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
    </label>
  );
  const speciesBreed = `${t(`pet.species.${pet.species}`)}${pet.breed ? ` · ${breedLabel(pet.breed, i18n.language)}` : ""}`;
  const allergy = pet.allergies && pet.allergies.length > 0 ? (
    <span className="chip animate-pulse-ring bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200">
      <ShieldAlert size={14} /> {t("pet.allergies")}: {pet.allergies.join(", ")}
    </span>
  ) : null;

  if (variant === "card") {
    const sexSym = pet.sex === "male" ? "♂" : pet.sex === "female" ? "♀" : "•";
    const sexColor = pet.sex === "male" ? "text-brand-600" : pet.sex === "female" ? "text-accent-600" : "text-ink-subtle";
    return (
      <div className="card relative overflow-hidden p-0">
        <div className="h-20 bg-brand-grad" />
        <div className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
          {photo(88, true)}
          <h1 className="mt-2.5 font-display text-xl font-extrabold text-ink">{pet.name}</h1>
          <p className="text-sm text-ink-muted">{speciesBreed}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {age && <Chip icon={<Cake size={12} className="text-brand-500" />}>{age.years > 0 ? `${age.years}${t("pet.yShort", "y")} ` : ""}{age.months}{t("pet.mShort", "m")}</Chip>}
            {pet.current_weight_kg != null && <Chip icon={<Scale size={12} className="text-brand-500" />}>{pet.current_weight_kg} {t("common.kg")}</Chip>}
            <Chip><span className={cn("text-sm font-bold leading-none", sexColor)}>{sexSym}</span> {t(`pet.sex.${pet.sex}`)}</Chip>
          </div>
          {allergy && <div className="mt-3">{allergy}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      {photo(84)}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold text-ink">{pet.name}</h1>
        <p className="text-ink-muted">{speciesBreed}{age ? ` · ${t("pet.ageValue", { years: age.years, months: age.months })}` : ""}</p>
        {allergy && <div className="mt-1">{allergy}</div>}
      </div>
    </div>
  );
}

const WELLNESS_COLOR: Record<"excellent" | "good" | "fair" | "attention", string> = {
  excellent: "#16a34a",
  good: "#1266d8",
  fair: "#f59e0b",
  attention: "#ef4444",
};

/** A synthesized at-a-glance health score from vaccination coverage, overdue items and treatment status. */
function WellnessCard({ vaccines, admissions }: { vaccines: Vaccination[]; admissions: Admission[] }) {
  const { t } = useTranslation();
  // Future "scheduled" boosters are plans, not gaps — exclude them from coverage.
  const counted = vaccines.filter((v) => v.status !== "scheduled");
  const total = counted.length;
  const done = counted.filter((v) => v.status === "administered").length;
  const vaccPct = total ? Math.round((done / total) * 100) : 100;
  const overdue = vaccines.filter((v) => v.status === "overdue").length;
  const activeTx = admissions.some((a) => a.kind === "treatment" && a.status === "active");

  let score = 100 - Math.round((100 - vaccPct) * 0.4) - overdue * 22 - (activeTx ? 12 : 0);
  score = Math.max(8, Math.min(100, score));
  const band = score >= 85 ? "excellent" : score >= 65 ? "good" : score >= 45 ? "fair" : "attention";
  const color = WELLNESS_COLOR[band];
  const hint = overdue > 0
    ? t("wellness.overdue", { count: overdue, defaultValue: "{{count}} preventive item(s) overdue" })
    : activeTx
      ? t("wellness.treating", "Under active treatment")
      : t("wellness.ontrack", "Preventive care on track");

  return (
    <div className="card relative overflow-hidden p-5">
      <div aria-hidden className="pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full blur-2xl" style={{ background: color, opacity: 0.13 }} />
      <div className="relative mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-brand-600" />
        <h3 className="text-sm font-bold text-ink">{t("wellness.title", "Wellness index")}</h3>
      </div>
      <div className="relative flex items-center gap-4">
        <ProgressRing value={score} max={100} size={92} stroke={9} color={color} centerTop={<span className="font-display text-xl font-extrabold text-ink">{score}</span>} />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold" style={{ color }}>{t(`wellness.${band}`)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
        </div>
      </div>
    </div>
  );
}

/** Persist a batch from the unified Medical Entry workflow: vaccinations → vaccination
 *  record (administered + booster due), medications → today's treatment-sheet rows.
 *  Throws on failure so the caller keeps the draft. Shared by the record header button
 *  and the Treatment/Vaccinations tab "Add" actions. */
async function persistMedicalDrafts(petId: string, doctorName: string | undefined, entries: MedicalDraft[], assessment?: MedicalAssessment) {
  const ROUTE_LABEL: Record<string, string> = { injection: "Injection", tablet: "Tablet", liquid: "Syrup" };
  const now = new Date();
  const nowISO = now.toISOString();
  const today = nowISO.slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5);
  for (const e of entries) {
    if (e.kind === "vaccination") {
      // The dose given today.
      await repo.addVaccination({
        pet_id: petId, name: e.name, status: "administered",
        administered_at: nowISO, due_date: null,
        lot_number: e.lot, administered_by: doctorName,
      });
      // A scheduled booster becomes its own pending item — actioned later via "Administer booster".
      if (e.nextDue) {
        await repo.addVaccination({
          pet_id: petId, name: e.name, status: "scheduled",
          administered_at: null, due_date: e.nextDue,
        });
      }
    } else {
      await repo.addTreatment({
        pet_id: petId, day: today, medication: e.name, time: hhmm, amount: e.dosage,
        administered_at: nowISO, administered_by: doctorName, doctor: doctorName,
        // The doctor's note for this drug shows on the treatment card; falls back to route · family.
        observations: e.note?.trim() || `${ROUTE_LABEL[e.route]} · ${e.family}`,
      });
    }
  }
  // The doctor's condition triage + clinical notes become a permanent consultation
  // record in the patient's file (shown in the History tab).
  if (assessment && (assessment.condition || assessment.notes.trim())) {
    const names = entries.map((e) => e.name);
    await repo.addVisit({
      pet_id: petId,
      clinic_name: "",
      doctor_name: doctorName ?? "",
      visit_date: today,
      assessment: names.length ? names.join(" · ") : "Clinical assessment",
      notes: assessment.notes.trim() || undefined,
      condition: assessment.condition ?? null,
      treatments: names.length ? names : undefined,
    });
  }
}

export function PetPassport() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const initialTab = (params.get("tab") as Tab) || "diet";
  const [pet, setPet] = useState<Pet | null>(null);
  const [tab, setTab] = useState<Tab>(TABS.some((x) => x.id === initialTab) ? initialTab : "diet");
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [vaccines, setVaccines] = useState<Vaccination[]>([]);
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const { user } = useAuth();
  const toast = useToast();
  // Owners may view their pet's health record but not modify clinical data.
  const canEditClinical = user?.role !== "owner";
  const isOwner = user?.role === "owner";
  const [medOpen, setMedOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const Back = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (typeof window === "undefined") return; // browser-only (defensive)
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f || !petId) return;
    try {
      // Compress the avatar (small thumbnail) via the same robust pipeline as the
      // media vault — no raw FileReader, so it can't crash on limited webviews.
      const prepared = await prepareUpload(f, { maxDim: 512, quality: 0.8 });
      await repo.updatePet(petId, { photo_url: prepared.dataUrl });
      void reload();
    } catch (err) {
      playWarning();
      const detail = err instanceof Error && err.name !== "FileTooLargeError" ? err.message : undefined;
      toast.error(describeUploadError(err, t), detail);
    }
  };

  const reload = async () => {
    if (!petId) return;
    const [p, w, v, h, m, tx, adm, apt, rem] = await Promise.all([
      repo.getPet(petId),
      repo.listWeights(petId),
      repo.listVaccinations(petId),
      repo.listVisits(petId),
      repo.listMedia(petId),
      repo.listTreatments(petId),
      repo.listAdmissionsForPet(petId),
      repo.listAppointmentsForPet(petId),
      repo.listReminders(),
    ]);
    setPet(p ?? null);
    setWeights(w);
    setVaccines(v);
    setVisits(h);
    setMedia(m);
    setTreatments(tx);
    setAdmissions(adm);
    setAppointments(apt);
    setReminders(rem.filter((r) => r.pet_id === petId));
  };

  // Persist a batch from the unified Medical Entry: vaccinations → vaccination
  // record, medications → treatment sheet. Rejects so the component keeps the
  // draft if anything fails. Then refreshes the record.
  const commitMedical = async (entries: MedicalDraft[], assessment: MedicalAssessment, attendingDoctor?: string) => {
    if (!petId) return;
    await persistMedicalDrafts(petId, attendingDoctor ?? user?.full_name, entries, assessment);
    await reload();
    setMedOpen(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (!pet) return <div className="mx-auto max-w-3xl px-4 py-10 text-ink-subtle">{t("common.loading")}</div>;

  // Per-pet activity rail: this pet's upcoming appointments, vaccines, treatment-due, feeds & reminders.
  const petEvents = buildUpcomingEvents({
    now: Date.now(),
    pets: [pet],
    appointments,
    vaccinations: vaccines,
    admissions,
    reminders,
    includeFeeding: true,
    includeOps: canEditClinical,
    labels: { service: (s) => t(`service.${s}`), medicationDue: t("dash.txDue", "Treatment due"), waiting: t("dash.waitingRoom", "Waiting") },
  });

  // Smart status cues shown as badges on the tab strip.
  const treatmentDue = petEvents.some((e) => e.category === "medication" && e.urgent);
  const vaccineOverdue = vaccines.some((v) => v.status === "overdue");
  const tabBadge: Record<Tab, { dot?: boolean; count?: number }> = {
    diet: {},
    history: {},
    qr: {},
    vaccines: { dot: vaccineOverdue },
    treatment: { dot: treatmentDue },
    media: { count: media.length || undefined },
  };

  return (
    <div className="relative isolate mx-auto max-w-7xl px-4 py-6">
      {/* Ambient aurora canvas — soft brand-tinted glow behind the floating panels */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden no-print">
        <div className="absolute -start-24 -top-12 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-500/10" />
        <div className="absolute end-0 top-44 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute bottom-0 start-1/3 h-72 w-72 rounded-full bg-accent-400/10 blur-3xl dark:bg-accent-500/10" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 no-print">
        <button className="btn-ghost px-2 py-1 text-sm" onClick={() => navigate(-1)}>
          <Back size={18} /> {t("common.back")}
        </button>
        {/* Staff actions: unified medical entry + the POS bridge (pre-fills this client). */}
        {!isOwner && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Syringe size={16} />}
              onClick={() => { playTap(); setMedOpen(true); }}
            >
              {t("passport.medicalEntry", "Medical entry")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FileSignature size={16} />}
              onClick={() => { playTap(); setConsentOpen(true); }}
            >
              {t("consent.title", "Consent forms")}
            </Button>
            <Button
              size="sm"
              leftIcon={<ShoppingCart size={16} />}
              onClick={() => {
                playTap();
                const q = new URLSearchParams();
                if (pet.owner_name) q.set("customer", pet.owner_name);
                if (pet.owner_phone) q.set("phone", pet.owner_phone);
                if (pet.name) q.set("pet", pet.name);
                navigate(`/retail?${q.toString()}`);
              }}
            >
              {t("retail.sellItems", "Sell items")}
            </Button>
          </div>
        )}
      </div>

      {/* Unified Medication + Vaccination entry, scoped to this patient's species */}
      <Modal open={medOpen} onClose={() => setMedOpen(false)} title={t("passport.medicalEntryTitle", "Medical entry — {{name}}", { name: pet.name })}>
        <MedicalEntry species={pet.species} onCommit={commitMedical} defaultDoctor={user?.full_name} />
      </Modal>

      {/* Legal consent forms (operation / anesthesia / treatment) — bilingual, printable */}
      <ConsentForms open={consentOpen} onClose={() => setConsentOpen(false)} pet={pet} />

      {/* Mobile/tablet header + snapshot (on desktop these live inside the rails) */}
      <div className="mb-5 lg:hidden">
        <ProfileHead pet={pet} onPhoto={onPhoto} variant="row" />
      </div>
      <div className="mb-6 lg:hidden">
        <HealthSnapshot pet={pet} vaccines={vaccines} weights={weights} admissions={admissions} />
      </div>

      {isOwner && (
        <div className="mb-6 rounded-2xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{t("passport.ownerViewOnly")}</div>
      )}

      {/* 3-column pet workspace: identity rail · tabbed detail · activity rail */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left rail — profile + identity (the reference's "Pet Profile" column) */}
        <aside className="order-2 space-y-4 lg:order-1 lg:col-span-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pe-1 lg:[scrollbar-width:thin]">
          <div className="hidden lg:block"><ProfileHead pet={pet} onPhoto={onPhoto} variant="card" /></div>
          <IdentityTab pet={pet} weights={weights} onChanged={reload} canEdit={canEditClinical} isOwner={isOwner} />
        </aside>

        {/* Center — tabbed clinical detail */}
        <main className="order-1 min-w-0 lg:order-2 lg:col-span-6">
          <div className="relative mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1.5 no-print [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ id, icon: Icon, fill, text }) => {
              const active = tab === id;
              const badge = tabBadge[id];
              return (
                <button
                  key={id}
                  onClick={() => { setTab(id); playTap(); }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-w-[64px] flex-1 flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold transition-colors",
                    active ? text : "text-ink-muted hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="passport-tab"
                      className={cn("absolute inset-0 rounded-xl shadow-card", fill)}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex flex-col items-center gap-1">
                    <motion.span animate={{ scale: active ? 1.14 : 1, y: active ? -1 : 0 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
                      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                    </motion.span>
                    <span className="text-center leading-tight">{t(`passport.tabs.${id}`)}</span>
                  </span>
                  {(badge.dot || badge.count != null) && (
                    <span className="absolute end-2 top-1.5 z-20">
                      {badge.count != null ? (
                        <span className="grid h-[15px] min-w-[15px] place-items-center rounded-full bg-ink px-1 text-[9px] font-bold leading-none text-surface-1">{badge.count}</span>
                      ) : (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger-500 ring-2 ring-surface-2" />
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "diet" && <DietTab pet={pet} onChanged={reload} canEdit={canEditClinical || isOwner} />}
              {tab === "vaccines" && <VaccinesTab pet={pet} vaccines={vaccines} onChanged={reload} canEdit={canEditClinical} isOwner={isOwner} />}
              {tab === "history" && <HistoryTab visits={visits} admissions={admissions} treatments={treatments} isOwner={isOwner} />}
              {tab === "treatment" && <TreatmentTab pet={pet} treatments={treatments} admissions={admissions} onChanged={reload} canEdit={canEditClinical} isOwner={isOwner} />}
              {tab === "media" && <MediaTab pet={pet} media={media} onChanged={reload} canEdit={canEditClinical} />}
              {tab === "qr" && <QrTab pet={pet} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right rail — stats + activity (reference's right column) */}
        <aside className="order-3 space-y-4 lg:col-span-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pe-1 lg:[scrollbar-width:thin]">
          <WellnessCard vaccines={vaccines} admissions={admissions} />
          <div className="hidden lg:block"><HealthSnapshot pet={pet} vaccines={vaccines} weights={weights} admissions={admissions} stack /></div>
          <UpcomingEvents
            events={petEvents}
            reminders={reminders}
            scope={{ ownerId: isOwner ? (pet.owner_id ?? null) : null }}
            pets={[pet]}
            now={Date.now()}
            max={5}
            onChanged={reload}
            onEventClick={(e) => { const tgt = EVENT_TAB[e.category]; if (tgt) { setTab(tgt); playTap(); } }}
          />

          {/* Mini sales history (clinic staff only — financial overview for this pet's owner) */}
          {!isOwner && <PetSalesWidget pet={pet} />}

          {media.length > 0 && (
            <div className="card p-4 no-print">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><Images size={16} className="text-brand-600" /> {t("passport.tabs.media")}</h3>
                <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => { playTap(); setTab("media"); }}>{t("media.all", "All")}</button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {media.slice(0, 6).map((m) => (
                  <button key={m.id} onClick={() => { playTap(); setTab("media"); }} className="aspect-square overflow-hidden rounded-lg bg-surface-2">
                    {/(photo|xray|ultrasound)/.test(m.kind) ? (
                      <img src={m.url} alt={m.caption || ""} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-ink-subtle"><FileText size={18} /></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------------- Identity ---------------- */
function IdentityTab({ pet, weights, onChanged, canEdit, isOwner }: { pet: Pet; weights: WeightLog[]; onChanged: () => void; canEdit: boolean; isOwner: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rangesOpen, setRangesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [weight, setWeight] = useState("");

  const canEditProfile = canEdit || isOwner;
  const shared = pet.shared_with_clinic !== false;
  const toggleShared = async () => {
    await repo.updatePet(pet.id, { shared_with_clinic: !shared });
    playSuccess();
    onChanged();
  };

  const rows: [string, string][] = [
    [t("pet.serial"), pet.serial],
    [t("pet.microchip"), pet.microchip_id || "—"],
    [t("pet.sexLabel"), t(`pet.sex.${pet.sex}`)],
    [t("pet.color"), pet.color || "—"],
    [t("pet.weight"), pet.current_weight_kg ? `${pet.current_weight_kg} ${t("common.kg")}` : "—"],
  ];

  const age = ageFromDOB(pet.dob);
  const neuter = pet.neuter_status ?? "unknown";
  const importantDates = [
    { key: "bd", icon: <Cake size={16} className="text-brand-600" />, label: t("dates.birthday"), value: pet.dob ? fullDate(pet.dob, i18n.language) : "—", sub: age ? ageLabel(age, t) : undefined },
    { key: "ad", icon: <Heart size={16} className="text-accent-500" />, label: t("dates.adopted"), value: pet.adopted_on ? fullDate(pet.adopted_on, i18n.language) : "—", sub: undefined as string | undefined },
    { key: "nt", icon: <Scissors size={16} className="text-sky-500" />, label: t("dates.neuter"), value: t(`dates.neuterValues.${neuter}`), sub: undefined as string | undefined },
  ];
  const contacts = pet.contacts ?? [];
  const removeContact = async (id: string) => {
    await repo.updatePet(pet.id, { contacts: contacts.filter((c) => c.id !== id) });
    playTap();
    onChanged();
  };

  const save = async () => {
    if (!weight) return;
    await repo.addWeight(pet.id, Number(weight));
    playSuccess();
    setWeight("");
    setOpen(false);
    onChanged();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Owner details — prominent for clinic staff working the case (copy-to-clipboard). */}
      {!isOwner && <OwnerCard pet={pet} />}

      {/* Appearance & distinctive markings */}
      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-ink"><Fingerprint size={18} className="text-brand-600" /> {t("pet.markings")}</h3>
          {canEditProfile && (
            <button onClick={() => { playTap(); setProfileOpen(true); }} aria-label={t("common.edit")} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
              <Pencil size={15} />
            </button>
          )}
        </div>
        {pet.distinctive_markings ? (
          <p className="text-sm leading-relaxed text-ink-muted">{pet.distinctive_markings}</p>
        ) : (
          <button onClick={() => canEditProfile && setProfileOpen(true)} disabled={!canEditProfile} className="text-sm text-ink-subtle enabled:hover:text-brand-600">
            {canEditProfile ? t("pet.addMarkings") : "—"}
          </button>
        )}
      </div>

      {/* Basic identity facts */}
      <div className="card p-5">
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="font-medium text-ink text-end">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Important dates */}
      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-ink"><Calendar size={18} className="text-brand-600" /> {t("dates.title")}</h3>
        <div className="space-y-2">
          {importantDates.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2">{d.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-subtle">{d.label}</p>
                <p className="font-medium text-ink">
                  {d.value}
                  {d.sub && <span className="ms-2 text-xs font-normal text-ink-muted">{d.sub}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Caretakers / authorized contacts */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-ink"><Users size={18} className="text-brand-600" /> {t("contacts.title")}</h3>
          {canEditProfile && (
            <button className="btn-secondary py-1.5 px-3 text-sm" onClick={() => { playTap(); setContactOpen(true); }}>
              <UserPlus size={15} /> {t("contacts.add")}
            </button>
          )}
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t("contacts.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-grad font-display text-sm font-bold text-white">{petInitials(c.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {c.name}
                    {c.role && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{c.role}</span>}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                    {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-brand-600"><Phone size={11} /> {c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail size={11} /> {c.email}</a>}
                  </div>
                </div>
                {canEditProfile && (
                  <button onClick={() => removeContact(c.id)} aria-label={t("common.delete")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15">
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Doctor-only: per-animal normal reading ranges */}
      {canEdit && (
        <button className="card w-full p-4 flex items-center justify-between text-start hover:shadow-soft" onClick={() => setRangesOpen(true)}>
          <span className="flex items-center gap-2 font-medium text-ink"><SlidersHorizontal size={18} className="text-brand-600" /> {t("reading.editRanges")}</span>
          <Plus size={16} className="text-ink-subtle" />
        </button>
      )}
      {canEdit && (
        <RangesEditor open={rangesOpen} petId={pet.id} species={pet.species} petName={pet.name} onClose={() => setRangesOpen(false)} />
      )}

      {/* Owner-controlled: which animals are allowed/shared at clinics */}
      {isOwner && (
        <div className="card p-4 flex items-center justify-between">
          <span className="font-medium text-ink">{t("passport.sharedWithClinic")}</span>
          <button className={`chip ${shared ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-ink-muted"}`} onClick={toggleShared}>
            {shared ? <Check size={15} /> : <ShieldAlert size={15} />}
            {shared ? t("passport.sharedOn") : t("passport.sharedOff")}
          </button>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-ink">{t("passport.weightChart")}</h3>
          {canEdit && (
            <button className="btn-secondary py-1.5 px-3 text-sm" onClick={() => setOpen(true)}>
              <Plus size={16} /> {t("passport.addWeight")}
            </button>
          )}
        </div>
        {weights.length >= 2 ? (
          <HealthCurve
            data={[...weights]
              .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
              .map<CurvePoint>((w) => ({ label: formatDate(w.measured_at, i18n.language), value: w.weight_kg }))}
            unit={` ${t("common.kg")}`}
            height={180}
          />
        ) : weights.length === 1 ? (
          <WeightChart logs={weights} />
        ) : (
          <p className="text-ink-subtle text-sm">{t("passport.noWeights")}</p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("passport.addWeight")}>
        <label className="label">{t("pet.weight")} ({t("common.kg")})</label>
        <input type="number" step="0.1" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
        <button className="btn-primary w-full mt-4" onClick={save}>{t("common.save")}</button>
      </Modal>

      <ProfileEditModal open={profileOpen} pet={pet} onClose={() => setProfileOpen(false)} onSaved={onChanged} />
      <ContactModal open={contactOpen} pet={pet} onClose={() => setContactOpen(false)} onSaved={onChanged} />
    </div>
  );
}

/* ---------------- Identity helpers + modals ---------------- */
function petInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function fullDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long", year: "numeric" });
}
function ageLabel(age: { years: number; months: number }, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (age.years <= 0 && age.months <= 0) return t("pet.newborn", { defaultValue: "Newborn" });
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${t(age.years === 1 ? "pet.yearOne" : "pet.yearMany")}`);
  if (age.months > 0) parts.push(`${age.months} ${t(age.months === 1 ? "pet.monthOne" : "pet.monthMany")}`);
  return parts.join(" ");
}
/** Format a stored age-in-months snapshot for a visit (null when none recorded). */
function ageMonthsLabel(total: number | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (total == null) return null;
  return ageLabel({ years: Math.floor(total / 12), months: total % 12 }, t);
}

const NEUTER_OPTIONS: Array<Pet["neuter_status"]> = ["intact", "neutered", "unknown"];

function ProfileEditModal({ open, pet, onClose, onSaved }: { open: boolean; pet: Pet; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [markings, setMarkings] = useState(pet.distinctive_markings ?? "");
  const [adopted, setAdopted] = useState(pet.adopted_on ?? "");
  const [neuter, setNeuter] = useState<Pet["neuter_status"]>(pet.neuter_status ?? "unknown");

  useEffect(() => {
    if (open) {
      setMarkings(pet.distinctive_markings ?? "");
      setAdopted(pet.adopted_on ?? "");
      setNeuter(pet.neuter_status ?? "unknown");
    }
  }, [open, pet]);

  const save = async () => {
    await repo.updatePet(pet.id, {
      distinctive_markings: markings.trim() || undefined,
      adopted_on: adopted || null,
      neuter_status: neuter,
    });
    playSuccess();
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("pet.editProfile")}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("pet.markings")}</label>
          <textarea className="input min-h-[88px]" value={markings} onChange={(e) => setMarkings(e.target.value)} placeholder={t("pet.markingsPlaceholder")} autoFocus />
        </div>
        <div>
          <label className="label">{t("dates.adopted")}</label>
          <input type="date" className="input" value={adopted} onChange={(e) => setAdopted(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("dates.neuter")}</label>
          <div className="flex gap-2">
            {NEUTER_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setNeuter(n)}
                className={cn(
                  "flex-1 rounded-xl border py-2 text-sm font-semibold transition",
                  neuter === n ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2",
                )}
              >
                {t(`dates.neuterValues.${n}`)}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={save}>{t("common.save")}</Button>
      </div>
    </Modal>
  );
}

const CONTACT_ROLES = ["Owner", "Co-owner", "Emergency", "Caretaker", "Walker"];

function ContactModal({ open, pet, onClose, onSaved }: { open: boolean; pet: Pet; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [role, setRole] = useState(CONTACT_ROLES[2]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => { if (open) { setName(""); setRole(CONTACT_ROLES[2]); setPhone(""); setEmail(""); } }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    const contacts = [...(pet.contacts ?? []), { id: uid("ct"), name: name.trim(), role, phone: phone.trim() || undefined, email: email.trim() || undefined }];
    await repo.updatePet(pet.id, { contacts });
    playSuccess();
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("contacts.add")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("contacts.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("contacts.role")}</label>
          <div className="flex flex-wrap gap-2">
            {CONTACT_ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  role === r ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2",
                )}
              >
                {t(`contacts.roles.${r}`, { defaultValue: r })}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t("phone.number")}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </div>
        <div>
          <label className="label">{t("contacts.email")}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>{t("common.save")}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Diet / Nutrition ---------------- */
const FOOD_TYPES: { id: FoodType; emoji: string }[] = [
  { id: "dry", emoji: "🥣" },
  { id: "wet", emoji: "🥫" },
  { id: "home", emoji: "🍲" },
  { id: "raw", emoji: "🥩" },
  { id: "mixed", emoji: "🍽️" },
  { id: "prescription", emoji: "💊" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-line-strong")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "start-[22px]" : "start-0.5")} />
    </button>
  );
}

function DietTab({ pet, onChanged, canEdit }: { pet: Pet; onChanged: () => void; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);

  const diet = pet.diet ?? {};
  const schedule = diet.schedule ?? [];
  const foodType = FOOD_TYPES.find((f) => f.id === diet.food_type);
  const hasDiet = !!(diet.food_type || diet.brand || diet.daily_amount || diet.notes || schedule.length || (diet.food_allergies?.length));

  const saveDiet = async (patch: Partial<DietPlan>) => {
    await repo.updatePet(pet.id, { diet: { ...diet, ...patch } });
    onChanged();
  };
  const toggleMeal = async (id: string) => {
    playTap();
    await saveDiet({ schedule: schedule.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)) });
  };
  const removeMeal = async (id: string) => { await saveDiet({ schedule: schedule.filter((m) => m.id !== id) }); };

  return (
    <div className="space-y-4 animate-fade-in">
      {diet.therapeutic && (
        <div className="flex items-start gap-3 rounded-2xl border border-warn-200 bg-warn-50 p-4 dark:border-warn-500/30 dark:bg-warn-500/10">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300"><Pill size={18} /></span>
          <div className="min-w-0">
            <p className="font-semibold text-warn-800 dark:text-warn-200">{t("diet.therapeutic")}</p>
            {diet.therapeutic_reason && <p className="text-sm text-warn-700/90 dark:text-warn-300/90">{diet.therapeutic_reason}</p>}
          </div>
        </div>
      )}

      {/* Current diet */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-ink"><Utensils size={18} className="text-brand-600" /> {t("diet.current")}</h3>
          {canEdit && (
            <button onClick={() => { playTap(); setEditOpen(true); }} aria-label={t("common.edit")} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600"><Pencil size={15} /></button>
          )}
        </div>
        {hasDiet ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">{foodType?.emoji ?? "🍽️"}</span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{diet.brand || (foodType ? t(`diet.foodTypes.${foodType.id}`) : t("diet.noBrand"))}</p>
                <p className="text-sm text-ink-muted">
                  {foodType ? t(`diet.foodTypes.${foodType.id}`) : ""}
                  {diet.daily_amount ? `${foodType ? " · " : ""}${diet.daily_amount}` : ""}
                </p>
              </div>
            </div>
            {diet.notes && <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-muted">{diet.notes}</p>}
          </div>
        ) : (
          <div className="py-2 text-center">
            <p className="text-sm text-ink-subtle">{t("diet.empty")}</p>
            {canEdit && <Button variant="secondary" size="sm" className="mt-3" leftIcon={<Plus size={15} />} onClick={() => setEditOpen(true)}>{t("diet.addPlan")}</Button>}
          </div>
        )}
      </div>

      {/* Food allergies */}
      {hasDiet && (
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-ink"><AlertCircle size={18} className="text-danger-600" /> {t("diet.foodAllergies")}</h3>
          {(diet.food_allergies?.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-subtle">{t("diet.noAllergies")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {diet.food_allergies!.map((a) => (
                <span key={a} className="rounded-full bg-danger-50 px-3 py-1 text-sm font-medium text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{a}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feeding schedule */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-ink"><Clock size={18} className="text-brand-600" /> {t("diet.schedule")}</h3>
          {canEdit && (
            <button className="btn-secondary py-1.5 px-3 text-sm" onClick={() => { playTap(); setMealOpen(true); }}><Plus size={15} /> {t("diet.addMeal")}</button>
          )}
        </div>
        {schedule.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t("diet.noSchedule")}</p>
        ) : (
          <ul className="space-y-2">
            {schedule.map((m) => (
              <li key={m.id} className={cn("flex items-center gap-3 rounded-2xl border border-line p-3 transition", m.enabled ? "bg-surface-1" : "bg-surface-2 opacity-60")}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Utensils size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{m.label}</p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Clock size={11} /> {formatHM(m.time, i18n.language)} · {t(`diet.freq.${m.frequency || "everyday"}`, { defaultValue: m.frequency || "everyday" })}</p>
                </div>
                {canEdit ? (
                  <>
                    <Toggle on={m.enabled} onClick={() => toggleMeal(m.id)} />
                    <button onClick={() => removeMeal(m.id)} aria-label={t("common.delete")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15"><X size={15} /></button>
                  </>
                ) : (
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", m.enabled ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-subtle")}>{m.enabled ? t("diet.on") : t("diet.off")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DietEditModal open={editOpen} pet={pet} onClose={() => setEditOpen(false)} onSaved={onChanged} />
      <MealModal open={mealOpen} onClose={() => setMealOpen(false)} onAdd={async (label, time) => {
        await saveDiet({ schedule: [...schedule, { id: uid("ft"), label, time, frequency: "everyday", enabled: true }] });
        toast.success(t("diet.mealAdded", { defaultValue: "Meal added" }));
      }} />
    </div>
  );
}

function DietEditModal({ open, pet, onClose, onSaved }: { open: boolean; pet: Pet; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [foodType, setFoodType] = useState<FoodType | undefined>(pet.diet?.food_type);
  const [brand, setBrand] = useState(pet.diet?.brand ?? "");
  const [amount, setAmount] = useState(pet.diet?.daily_amount ?? "");
  const [therapeutic, setTherapeutic] = useState(!!pet.diet?.therapeutic);
  const [reason, setReason] = useState(pet.diet?.therapeutic_reason ?? "");
  const [allergies, setAllergies] = useState<string[]>(pet.diet?.food_allergies ?? []);
  const [allergyInput, setAllergyInput] = useState("");
  const [notes, setNotes] = useState(pet.diet?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    const d = pet.diet ?? {};
    setFoodType(d.food_type); setBrand(d.brand ?? ""); setAmount(d.daily_amount ?? "");
    setTherapeutic(!!d.therapeutic); setReason(d.therapeutic_reason ?? "");
    setAllergies(d.food_allergies ?? []); setAllergyInput(""); setNotes(d.notes ?? "");
  }, [open, pet]);

  const addAllergy = () => { const a = allergyInput.trim(); if (a && !allergies.includes(a)) setAllergies([...allergies, a]); setAllergyInput(""); };

  const save = async () => {
    await repo.updatePet(pet.id, {
      diet: {
        ...(pet.diet ?? {}),
        food_type: foodType,
        brand: brand.trim() || undefined,
        daily_amount: amount.trim() || undefined,
        therapeutic,
        therapeutic_reason: therapeutic ? (reason.trim() || undefined) : undefined,
        food_allergies: allergies,
        notes: notes.trim() || undefined,
      },
    });
    playSuccess();
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("diet.editTitle")}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("diet.foodType")}</label>
          <div className="grid grid-cols-3 gap-2">
            {FOOD_TYPES.map((f) => (
              <button key={f.id} onClick={() => setFoodType(f.id)} className={cn("flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition", foodType === f.id ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2")}>
                <span className="text-xl">{f.emoji}</span>
                {t(`diet.foodTypes.${f.id}`)}
              </button>
            ))}
          </div>
        </div>
        <div><label className="label">{t("diet.brand")}</label><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("diet.brandPlaceholder")} /></div>
        <div><label className="label">{t("diet.dailyAmount")}</label><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("diet.amountPlaceholder")} /></div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <div className="min-w-0"><p className="font-medium text-ink">{t("diet.therapeutic")}</p><p className="text-xs text-ink-subtle">{t("diet.therapeuticHint")}</p></div>
          <Toggle on={therapeutic} onClick={() => setTherapeutic((v) => !v)} />
        </div>
        {therapeutic && <div><label className="label">{t("diet.therapeuticReason")}</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
        <div>
          <label className="label">{t("diet.foodAllergies")}</label>
          <div className="flex gap-2">
            <input className="input flex-1" value={allergyInput} onChange={(e) => setAllergyInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAllergy(); } }} placeholder={t("diet.allergyPlaceholder")} />
            <Button variant="secondary" onClick={addAllergy}>{t("common.add")}</Button>
          </div>
          {allergies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {allergies.map((a) => (
                <span key={a} className="flex items-center gap-1 rounded-full bg-danger-50 px-3 py-1 text-sm font-medium text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
                  {a}<button onClick={() => setAllergies(allergies.filter((x) => x !== a))} aria-label={t("common.delete")}><X size={13} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div><label className="label">{t("diet.notes")}</label><textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <Button className="w-full" onClick={save}>{t("common.save")}</Button>
      </div>
    </Modal>
  );
}

function MealModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (label: string, time: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("08:00");
  useEffect(() => { if (open) { setLabel(""); setTime("08:00"); } }, [open]);
  const presets = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const save = async () => { if (!label.trim()) return; await onAdd(label.trim(), time); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title={t("diet.addMeal")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("diet.mealLabel")}</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
          <div className="mt-2 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} onClick={() => setLabel(t(`diet.meals.${p}`, { defaultValue: p }))} className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:bg-surface-2">{t(`diet.meals.${p}`, { defaultValue: p })}</button>
            ))}
          </div>
        </div>
        <div><label className="label">{t("diet.time")}</label><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <Button className="w-full" onClick={save} disabled={!label.trim()}>{t("common.add")}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Vaccinations ---------------- */
function VaccinesTab({ pet, vaccines, onChanged, canEdit, isOwner }: { pet: Pet; vaccines: Vaccination[]; onChanged: () => void; canEdit: boolean; isOwner: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [administer, setAdminister] = useState<Vaccination | null>(null);

  const sorted = [...vaccines].sort((a, b) => {
    const ad = a.administered_at || a.due_date || "";
    const bd = b.administered_at || b.due_date || "";
    return bd.localeCompare(ad);
  });

  // The new species-aware vaccination workflow (booster scheduler) commits here,
  // then refreshes the timeline immediately via onChanged().
  const commit = async (entries: MedicalDraft[], assessment: MedicalAssessment, attendingDoctor?: string) => {
    await persistMedicalDrafts(pet.id, attendingDoctor ?? user?.full_name, entries, assessment);
    onChanged();
    setOpen(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-ink">{t("passport.vaccineTimeline")}</h3>
        {canEdit && (
          <button className="btn-secondary py-1.5 px-3 text-sm" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t("passport.addVaccine")}
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="card p-6 text-center text-ink-subtle">{t("passport.noVaccines")}</div>
      ) : (
        <ol className="relative border-s-2 border-line ms-3 space-y-4">
          {sorted.map((v) => {
            const done = v.status === "administered";
            const overdue = v.status === "overdue";
            const pending = !done; // scheduled or overdue — an actionable future/late booster
            const days = v.due_date ? daysUntil(v.due_date) : null;
            const Icon = done ? Check : overdue ? AlertCircle : Clock;
            const color = done ? "bg-success-500" : overdue ? "bg-danger-500" : "bg-warn-500";
            return (
              <li key={v.id} className="ms-6">
                <span className={`absolute -start-[11px] grid place-items-center w-5 h-5 rounded-full text-white ${color}`}>
                  <Icon size={12} strokeWidth={3} />
                </span>
                <div className={cn("card p-4", pending && "border-dashed", overdue && "border-danger-300 dark:border-danger-500/40")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{isOwner ? vaccineScientific(v.name) : v.name}</p>
                    <span
                      className={`chip text-xs ${done ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200" : overdue ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200" : "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200"}`}
                    >
                      {done ? t("passport.administered") : overdue ? t("passport.overdue") : t("passport.pending", "Pending")}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    {done
                      ? (v.administered_at ? t("passport.givenOn", { date: formatDate(v.administered_at.slice(0, 10), i18n.language), defaultValue: "Given {{date}}" }) : "")
                      : (v.due_date ? `${t("passport.dueOn", { date: formatDate(v.due_date, i18n.language), defaultValue: "Due {{date}}" })}${days !== null && days >= 0 ? ` · ${t("passport.dueIn", { days })}` : ""}` : "")}
                    {v.doses_total ? ` · ${t("passport.dose", { n: v.dose_number, total: v.doses_total })}` : ""}
                    {v.administered_by ? ` · ${t("passport.by", { who: v.administered_by })}` : ""}
                  </p>
                  {v.notes && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-muted">
                      <NotebookPen size={12} className="mt-0.5 shrink-0 text-brand-600" /> {v.notes}
                    </p>
                  )}
                  {pending && canEdit && (
                    <button onClick={() => setAdminister(v)} className="btn-primary mt-3 w-full py-1.5 text-sm">
                      <Syringe size={15} /> {t("passport.administerBooster", "Administer booster")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("passport.addVaccine")}>
        <MedicalEntry species={pet.species} initialMode="vaccination" lockMode onCommit={commit} defaultDoctor={user?.full_name} />
      </Modal>

      <AdministerBoosterModal vaccine={administer} defaultDoctor={user?.full_name} onClose={() => setAdminister(null)} onDone={() => { setAdminister(null); onChanged(); }} />
    </div>
  );
}

/** datetime-local default value (local wall-clock, minute precision). */
function nowLocalDT(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Confirm Administration — converts a pending booster into a completed dose,
 *  capturing the attending doctor, a visit-specific clinical note and the date/time.
 *  Nothing is auto-completed: status only changes to "administered" on Confirm. */
function AdministerBoosterModal({ vaccine, defaultDoctor, onClose, onDone }: { vaccine: Vaccination | null; defaultDoctor?: string; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [doctor, setDoctor] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  // Fresh form each time a booster opens: default doctor = signed-in vet, time = now.
  useEffect(() => {
    if (!vaccine) return;
    setDoctor(defaultDoctor && DOCTOR_NAMES.includes(defaultDoctor) ? defaultDoctor : DOCTOR_NAMES[0] ?? "");
    setNotes("");
    setWhen(nowLocalDT());
  }, [vaccine, defaultDoctor]);

  const confirm = async () => {
    // Guard against re-administering a dose that's already been recorded (e.g. a
    // stale modal in a concurrent session).
    if (!vaccine || busy || vaccine.status === "administered") return;
    setBusy(true);
    try {
      const administeredISO = when ? new Date(when).toISOString() : new Date().toISOString();
      await repo.updateVaccination(vaccine.id, {
        status: "administered",
        administered_at: administeredISO,
        administered_by: doctor || undefined,
        notes: notes.trim() || undefined,
        due_date: null,
      });
      playSuccess();
      toast.success(t("passport.boosterGiven", "Booster recorded"));
      onDone();
    } catch (e) {
      toast.error(t("passport.boosterError", "Couldn't save — please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!vaccine} onClose={onClose} title={t("passport.confirmAdminTitle", "Confirm administration")}>
      {vaccine && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"><Syringe size={19} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{vaccine.name}</p>
              {vaccine.due_date && (
                <p className="truncate text-xs text-ink-muted">{t("passport.scheduledFor", { date: formatDate(vaccine.due_date, i18n.language), defaultValue: "Scheduled for {{date}}" })}</p>
              )}
            </div>
          </div>

          {/* Attending doctor */}
          <div>
            <label className="label flex items-center gap-1.5"><Stethoscope size={14} className="text-brand-600" /> {t("medentry.attendingDoctor", "Attending doctor")}</label>
            <DoctorSelect value={doctor} onChange={setDoctor} />
          </div>

          {/* Date & time */}
          <div>
            <label className="label flex items-center gap-1.5"><CalendarClock size={14} className="text-brand-600" /> {t("passport.dateTime", "Date & time")}</label>
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>

          {/* Clinical notes for this booster visit */}
          <div>
            <label className="label flex items-center gap-1.5"><NotebookPen size={14} className="text-brand-600" /> {t("medentry.clinicalNotes", "Clinical notes")}</label>
            <textarea rows={3} className="input min-h-[80px] resize-y leading-relaxed" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("passport.boosterNotesPlaceholder", "Observations during this booster visit…")} />
          </div>

          <Button size="lg" className="w-full" loading={busy} leftIcon={<Check size={18} />} onClick={confirm}>
            {t("passport.confirmSave", "Confirm & save")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Complete medical history ---------------- */
const CONDITION_BADGE: Record<PatientCondition, { key: string; def: string; cls: string }> = {
  excellent: { key: "medentry.excellent", def: "Excellent", cls: "bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-200" },
  good: { key: "medentry.good", def: "Good", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200" },
  critical: { key: "medentry.critical", def: "Critical", cls: "bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-200" },
};
function ConditionBadge({ condition }: { condition: PatientCondition }) {
  const { t } = useTranslation();
  const c = CONDITION_BADGE[condition];
  return <span className={cn("chip shrink-0 text-2xs font-semibold", c.cls)}>{t(c.key, c.def)}</span>;
}

function HistoryTab({ visits, admissions, treatments, isOwner }: { visits: MedicalVisit[]; admissions: Admission[]; treatments: TreatmentEntry[]; isOwner: boolean }) {
  const { t, i18n } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  const empty = visits.length === 0 && admissions.length === 0 && treatments.length === 0;
  if (empty) return <div className="card p-6 text-center text-ink-subtle animate-fade-in">{t("passport.noVisits")}</div>;

  // Treatments grouped by day, newest first.
  const txDays = Array.from(new Set(treatments.map((tx) => tx.day))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* All times at the clinic */}
      {admissions.length > 0 && (
        <section>
          <h3 className="font-bold text-ink mb-2 flex items-center gap-2"><BedDouble size={16} /> {t("passport.clinicVisits")}</h3>
          <div className="space-y-2">
            {admissions.map((a) => (
              <div key={a.id} className="card p-3 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.kind === "boarding" ? "bg-purple-500" : "bg-brand-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {a.kind === "boarding" ? t("passport.kindBoarding") : t("passport.kindTreatment")}
                    {a.reason ? ` — ${a.reason}` : ""}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(a.admitted_on, i18n.language)}
                    {a.discharged_on ? ` → ${formatDate(a.discharged_on, i18n.language)}` : ` · ${t("passport.ongoing")}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Consultations (SOAP) */}
      {visits.length > 0 && (
        <section>
          <h3 className="font-bold text-ink mb-2 flex items-center gap-2"><FileText size={16} /> {t("passport.consultations")}</h3>
          <div className="space-y-3">
            {visits.map((v) => {
              const expanded = openId === v.id;
              return (
                <div key={v.id} className="card overflow-hidden">
                  <button className="w-full flex items-center justify-between p-4 text-start" onClick={() => setOpenId(expanded ? null : v.id)}>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-ink">
                        <span className="truncate">{v.assessment}</span>
                        {v.condition && <ConditionBadge condition={v.condition} />}
                      </p>
                      <p className="text-xs text-ink-muted">{[v.visit_date, ageMonthsLabel(v.patient_age_months, t), v.clinic_name, v.doctor_name].filter(Boolean).join(" · ")}</p>
                    </div>
                    <ChevronDown size={20} className={`text-ink-subtle transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 text-sm border-t border-line pt-3">
                      {v.subjective && <Field label="S" value={v.subjective} />}
                      {v.objective && <Field label="O" value={v.objective} />}
                      <Field label={t("passport.diagnosis")} value={v.assessment} />
                      {v.plan && <Field label={t("passport.prescription")} value={v.plan} />}
                      {v.treatments && v.treatments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-ink-muted mb-1">{t("passport.treatments")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {v.treatments.map((tr) => (
                              <span key={tr} className="chip bg-sky-50 text-sky-700 text-xs">{medicationDisplay(tr, v.visit_date, isOwner)}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {v.notes && <Field label={t("passport.advice")} value={v.notes} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All previous treatments */}
      {txDays.length > 0 && (
        <section>
          <h3 className="font-bold text-ink mb-2 flex items-center gap-2"><Pill size={16} /> {t("passport.treatmentsHistory")}</h3>
          <div className="space-y-2">
            {txDays.map((d) => (
              <div key={d} className="card p-3">
                <p className="text-xs font-semibold text-brand-700 mb-1.5">{formatDate(d, i18n.language)}</p>
                <div className="space-y-1">
                  {treatments.filter((tx) => tx.day === d).map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{medicationDisplay(tx.medication, tx.day, isOwner)}</span>
                      <span className="text-xs text-ink-subtle">{formatHM(tx.time, i18n.language)}{tx.amount ? ` · ${tx.amount}` : ""}{tx.doctor ? ` · ${tx.doctor}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

/* ---------------- Treatment sheet (multi-day) ---------------- */
function nowHM(): string {
  return new Date().toTimeString().slice(0, 5);
}

function TreatmentTab({ pet, treatments, admissions, onChanged, canEdit, isOwner }: { pet: Pet; treatments: TreatmentEntry[]; admissions: Admission[]; onChanged: () => void; canEdit: boolean; isOwner: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const activeTreatment = admissions.find((a) => a.kind === "treatment" && a.status === "active");
  const activeBoarding = admissions.find((a) => a.kind === "boarding" && a.status === "active");
  // Owners can't modify clinical data at all; clinic staff can once admitted to the daily case record.
  const locked = !canEdit || !activeTreatment;

  const readmit = async (kind: "treatment" | "boarding") => {
    await repo.addAdmission({ pet_id: pet.id, kind, status: "active", admitted_on: today });
    playSuccess();
    onChanged();
  };
  const days = Array.from(new Set(treatments.map((tx) => tx.day))).sort((a, b) => b.localeCompare(a));

  // The new cascading medication workflow (family → drug → route → dosage) commits
  // here as today's administered doses, then refreshes the flowsheet via onChanged().
  const commit = async (entries: MedicalDraft[], assessment: MedicalAssessment, attendingDoctor?: string) => {
    await persistMedicalDrafts(pet.id, attendingDoctor ?? user?.full_name, entries, assessment);
    onChanged();
    setOpen(false);
  };

  const remove = async (id: string) => {
    await repo.deleteTreatment(id);
    onChanged();
  };

  const doctorsForDay = (d: string) =>
    Array.from(new Set(treatments.filter((tx) => tx.day === d && tx.doctor).map((tx) => tx.doctor as string)));

  // Flowsheet task state: given / overdue / due-later / missed / scheduled.
  const currentHM = nowHM();
  const statusOf = (tx: TreatmentEntry): "given" | "overdue" | "due" | "missed" | "scheduled" => {
    if (tx.administered_at) return "given";
    if (tx.day < today) return "missed";
    if (tx.day > today) return "scheduled";
    return tx.time <= currentHM ? "overdue" : "due";
  };
  const markGiven = async (id: string, given: boolean) => {
    await repo.setTreatmentGiven(id, given, user?.full_name);
    if (given) playSuccess();
    onChanged();
  };
  // Repeat the same medication as a fresh dose (today, auto-timed to now) without re-selecting it.
  const repeatTreatment = async (tx: TreatmentEntry) => {
    addClinicMed(tx.medication);
    await repo.addTreatment({
      pet_id: pet.id,
      day: today,
      doctor: tx.doctor || (user?.role === "doctor" ? user.full_name : undefined),
      medication: tx.medication,
      time: nowHM(),
      amount: tx.amount,
      observations: undefined,
    });
    playSuccess();
    onChanged();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-ink">{t("treatment.title")}</h3>
          <p className="text-xs text-ink-subtle">{t("treatment.subtitle")}</p>
        </div>
        {canEdit && (
          <button className="btn-secondary py-1.5 px-3 text-sm" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t("treatment.add")}
          </button>
        )}
      </div>

      {/* Admission status + re-admit controls */}
      <div className="card p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {activeTreatment ? (
            <span className="chip bg-brand-50 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <Stethoscope size={13} /> {t("treatment.inTreatment")} · {t("treatment.since", { date: formatDate(activeTreatment.admitted_on, i18n.language) })}
            </span>
          ) : activeBoarding ? (
            <span className="chip bg-sky-50 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              <BedDouble size={13} /> {t("treatment.boardingStatus")}{activeBoarding.cage ? ` · ${activeBoarding.cage}` : ""}
            </span>
          ) : (
            <span className="chip bg-surface-2 text-ink-muted text-xs">{t("treatment.notAdmitted")}</span>
          )}
          {canEdit && (
            <div className="flex gap-2">
              {!activeTreatment && (
                <button className="btn-primary py-1.5 px-3 text-xs" onClick={() => readmit("treatment")}>
                  <Stethoscope size={14} /> {t("treatment.readmitTreatment")}
                </button>
              )}
              {!activeBoarding && (
                <button className="btn-ghost bg-sky-50 px-3 py-1.5 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" onClick={() => readmit("boarding")}>
                  <BedDouble size={14} /> {t("treatment.readmitBoarding")}
                </button>
              )}
            </div>
          )}
        </div>
        {canEdit && locked && <p className="mt-2 text-xs text-warn-600">{t("treatment.locked")}</p>}
      </div>

      {days.length === 0 ? (
        <div className="card p-6 text-center text-ink-subtle">{t("treatment.none")}</div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const docs = doctorsForDay(d);
            const dayTx = treatments.filter((tx) => tx.day === d);
            const givenCount = dayTx.filter((tx) => tx.administered_at).length;
            const allGiven = givenCount === dayTx.length;
            return (
              <div key={d} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-50 px-4 py-2.5 dark:bg-brand-500/10">
                  <span className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                    <Pill size={15} /> {formatDate(d, i18n.language)}
                    <span className={cn("chip text-[11px]", allGiven ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200" : "bg-surface-1 text-ink-muted")}>
                      {allGiven && <Check size={11} />} {t("treatment.progress", { given: givenCount, total: dayTx.length })}
                    </span>
                  </span>
                  {docs.length > 0 && (
                    <span className="chip bg-surface-1 text-[11px] text-brand-700 dark:text-brand-300">
                      <Stethoscope size={12} /> {docs.join(" · ")}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {dayTx.map((tx) => {
                    const status = statusOf(tx);
                    const given = status === "given";
                    const dotColor =
                      status === "given" ? "bg-success-500" : status === "overdue" ? "bg-warn-500" : status === "missed" ? "bg-danger-400" : "bg-ink-subtle";
                    const SIcon = given ? Check : status === "overdue" || status === "missed" ? AlertCircle : Clock;
                    return (
                      <div key={tx.id} className={cn("flex items-start gap-3 p-4 transition-colors", status === "overdue" && !locked && "bg-warn-50/50 dark:bg-warn-500/5")}>
                        {/* Status rail */}
                        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white", dotColor)}>
                          <SIcon size={14} strokeWidth={2.5} />
                        </span>
                        {/* Medication (left) + daily note (right) */}
                        <div className="grid flex-1 gap-2 sm:grid-cols-2 sm:gap-4">
                          <div>
                            <p className={cn("font-semibold", given ? "text-ink-muted line-through decoration-success-500/40" : "text-ink")}>
                              {medicationDisplay(tx.medication, tx.day, isOwner)}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="chip bg-sky-50 text-[11px] text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Clock size={11} /> {formatHM(tx.time, i18n.language)}</span>
                              {tx.amount && <span className="chip bg-surface-2 text-[11px] text-ink-muted">{tx.amount}</span>}
                              {status === "overdue" && (
                                <span className="chip bg-warn-50 text-[11px] text-warn-700 dark:bg-warn-500/15 dark:text-warn-200"><AlertCircle size={11} /> {t("treatment.overdue", "Overdue")}</span>
                              )}
                              {status === "missed" && (
                                <span className="chip bg-danger-50 text-[11px] text-danger-700 dark:bg-danger-500/15 dark:text-danger-200">{t("treatment.missed", "Not given")}</span>
                              )}
                            </p>
                            {given && tx.administered_at && (
                              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-success-600">
                                <Check size={12} /> {t("treatment.givenAt", { time: formatTime(tx.administered_at, i18n.language), defaultValue: "Given {{time}}" })}
                                {tx.administered_by ? ` · ${tx.administered_by.split(" ").slice(-1)}` : ""}
                              </p>
                            )}
                          </div>
                          <div className="sm:border-s sm:border-line sm:ps-4">
                            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-subtle">{t("treatment.noteColumn")}</p>
                            <p className="text-sm text-ink-muted">{tx.observations || "—"}</p>
                          </div>
                        </div>
                        {/* Actions */}
                        {!locked && (
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {given ? (
                              <button onClick={() => markGiven(tx.id, false)} className="text-[11px] text-ink-subtle underline transition hover:text-ink">{t("treatment.undo", "Undo")}</button>
                            ) : (
                              <button onClick={() => markGiven(tx.id, true)} className="inline-flex items-center gap-1 rounded-full bg-success-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-success-600 active:scale-95">
                                <Check size={13} /> {t("treatment.markGiven", "Give")}
                              </button>
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => repeatTreatment(tx)}
                                title={t("treatment.repeatHint", "Schedule this medication again now")}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                              >
                                <Repeat size={12} /> {t("treatment.repeat", "Repeat")}
                              </button>
                              <button className="rounded-full p-1 text-ink-subtle transition hover:text-danger-500" onClick={() => remove(tx.id)} aria-label={t("treatment.delete")}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("treatment.addTitle")}>
        <MedicalEntry species={pet.species} initialMode="medication" lockMode onCommit={commit} defaultDoctor={user?.full_name} />
      </Modal>
    </div>
  );
}

/* ---------------- Media vault ---------------- */
const KIND_TONE: Record<string, string> = {
  photo: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  xray: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  ultrasound: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  lab: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200",
  document: "bg-surface-2 text-ink-muted",
};
const isPdfItem = (m: MediaItem) => m.url.startsWith("data:application/pdf") || m.url.endsWith(".pdf") || !!m.caption?.toLowerCase().endsWith(".pdf");

function MediaTab({ pet, media, onChanged, canEdit }: { pet: Pet; media: MediaItem[]; onChanged: () => void; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [zoom, setZoom] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<"all" | MediaItem["kind"]>("all");
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<MediaItem["kind"] | null>(null);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: MediaItem["kind"]) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after an error
    if (!file || uploadingKind) return;
    setUploadingKind(kind);
    try {
      // 1) Compress on the client so the upload stays small and the app fast.
      //    Clinical images (X-ray/ultrasound/lab) keep more resolution so vets can
      //    zoom into fine detail in the viewer; everyday photos stay lighter.
      const prepared = await prepareUpload(file, { maxDim: kind === "photo" ? 1600 : 2400 });
      // 2) Upload to storage + permanently link it to this pet (FK pet_id). The
      //    20s timeout means a dropped network fails fast instead of spinning.
      await withTimeout(repo.uploadMedia(pet.id, prepared, kind, file.name), 20000);
      playSuccess();
      toast.success(t("media.uploaded", "Image added to the vault"));
      onChanged();
    } catch (err) {
      playWarning();
      const detail = err instanceof Error && err.name !== "FileTooLargeError" && err.name !== "TimeoutError" ? err.message : undefined;
      toast.error(describeUploadError(err, t), detail);
    } finally {
      setUploadingKind(null);
    }
  };

  const kinds: MediaItem["kind"][] = canEdit ? ["photo", "xray", "ultrasound", "lab"] : ["photo"];
  const availableKinds = Array.from(new Set(media.map((m) => m.kind)));
  const shown = filter === "all" ? media : media.filter((m) => m.kind === filter);
  const imageCount = media.filter((m) => !isPdfItem(m)).length;

  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const exitCompare = () => { setCompareMode(false); setSelected([]); };
  const selectedItems = media.filter((m) => selected.includes(m.id) && !isPdfItem(m)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-ink">{t("passport.mediaTitle")}</h3>
        {imageCount >= 2 && (
          <Button variant={compareMode ? "primary" : "secondary"} size="sm" leftIcon={<Columns2 size={15} />} onClick={() => { playTap(); compareMode ? exitCompare() : setCompareMode(true); }}>
            {compareMode ? t("media.compareDone", "Done") : t("media.compare", "Compare")}
          </Button>
        )}
      </div>

      {compareMode && <p className="text-xs text-ink-subtle">{t("media.compareHint", "Select photos to compare side by side over time.")}</p>}

      {/* Upload buttons — the active kind shows a spinner; all lock during an upload. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kinds.map((k) => {
          const busy = uploadingKind === k;
          const disabled = uploadingKind !== null;
          return (
            <label key={k} className={cn("btn-secondary flex-col py-3 text-xs", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {busy ? t("media.uploading", "Uploading…") : t(`media.kind.${k}`)}
              <input type="file" accept={k === "lab" ? "image/*,application/pdf" : "image/*"} className="hidden" disabled={disabled} onChange={(e) => onUpload(e, k)} />
            </label>
          );
        })}
      </div>

      {/* Kind filter */}
      {media.length > 0 && availableKinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {(["all", ...availableKinds] as const).map((k) => (
            <button
              key={k}
              onClick={() => { playTap(); setFilter(k as typeof filter); }}
              className={cn(
                "chip text-xs transition",
                filter === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink",
              )}
            >
              {k === "all" ? t("media.all", "All") : t(`media.kind.${k}`)}
            </button>
          ))}
        </div>
      )}

      {media.length === 0 ? (
        <div className="card p-6 text-center text-ink-subtle">{t("passport.noMedia")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((m) => {
            const isPdf = isPdfItem(m);
            const sel = selected.includes(m.id);
            const selectable = compareMode && !isPdf;
            return (
              <div key={m.id} className={cn("card overflow-hidden transition", sel && "ring-2 ring-brand-500")}>
                <div className="relative">
                  {isPdf ? (
                    <a href={m.url} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center bg-surface-2 text-ink-subtle">
                      <FileText size={32} />
                    </a>
                  ) : (
                    <button
                      className="block w-full"
                      onClick={() => { playTap(); selectable ? toggleSel(m.id) : setZoom(m); }}
                      aria-label={m.caption}
                    >
                      <img src={m.url} alt={m.caption} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition hover:opacity-90" />
                    </button>
                  )}
                  {selectable && (
                    <span className={cn("absolute end-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 transition", sel ? "border-brand-600 bg-brand-600 text-white" : "border-white/80 bg-black/30 text-transparent")}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn("chip text-[10px]", KIND_TONE[m.kind] ?? KIND_TONE.document)}>{t(`media.kind.${m.kind}`)}</span>
                    <span className="flex items-center gap-1 text-[10px] text-ink-subtle"><Calendar size={10} /> {formatDate(m.created_at, i18n.language)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-muted">{m.caption}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare action bar */}
      <AnimatePresence>
        {compareMode && selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-1/95 px-4 py-3 shadow-raised backdrop-blur no-print"
          >
            <span className="text-sm font-medium text-ink">{t("media.selected", { n: selectedItems.length, defaultValue: "{{n}} selected" })}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>{t("common.clear", "Clear")}</Button>
              <Button size="sm" leftIcon={<Columns2 size={15} />} disabled={selectedItems.length < 2} onClick={() => { playTap(); setComparing(true); }}>{t("media.compare", "Compare")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {zoom && <ImageLightbox src={zoom.url} caption={`${t(`media.kind.${zoom.kind}`)} · ${zoom.caption ?? ""}`} onClose={() => setZoom(null)} />}
      {comparing && <PhotoCompare items={selectedItems} lang={i18n.language} title={t("media.comparison", "Comparison")} onClose={() => setComparing(false)} />}
    </div>
  );
}

/** Side-by-side chronological photo comparison (track progress over time). */
function PhotoCompare({ items, lang, title, onClose }: { items: MediaItem[]; lang: string; title: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm no-print" onClick={onClose}>
      <div className="flex items-center justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-center gap-2 font-display font-bold"><Columns2 size={18} /> {title}</span>
        <button className="rounded-full p-2 hover:bg-white/15" onClick={onClose} aria-label="close"><X size={22} /></button>
      </div>
      <div className="flex flex-1 items-stretch gap-4 overflow-x-auto p-4" onClick={(e) => e.stopPropagation()}>
        {items.map((m, i) => (
          <figure key={m.id} className="flex min-w-[260px] flex-1 flex-col">
            <div className="relative grid flex-1 place-items-center overflow-hidden rounded-2xl bg-white/5">
              <img src={m.url} alt={m.caption} className="max-h-full max-w-full object-contain" />
              <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{i + 1}</span>
            </div>
            <figcaption className="mt-2 text-center text-white">
              <p className="text-sm font-semibold">{formatDate(m.created_at, lang)}</p>
              <p className="truncate text-xs text-white/70">{m.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- QR passport ---------------- */
function QrTab({ pet }: { pet: Pet }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  useEffect(() => {
    playScan();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pet.passport_token);
      toast.success(t("qr.copied", "Passport code copied"));
    } catch {
      toast.error(t("qr.copyFail", "Couldn't copy"));
    }
  };

  const share = async () => {
    const data = {
      title: `${pet.name} · ${t("app.name")}`,
      text: t("qr.shareText", { name: pet.name, code: pet.passport_token, defaultValue: "{{name}}'s doctorVet passport — scan to view the full medical record at any clinic. Code: {{code}}" }),
    };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* dismissed */ }
    } else {
      void copy();
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Passport card */}
      <div className="print-area mx-auto max-w-sm overflow-hidden rounded-3xl border border-line bg-surface-1 shadow-raised">
        {/* Header band */}
        <div className="relative overflow-hidden bg-brand-grad p-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-xl" />
          <PawPrint className="pointer-events-none absolute -bottom-5 right-3 text-white/10" size={72} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                <PawPrint size={20} />
              </span>
              <div>
                <p className="font-display text-sm font-extrabold uppercase tracking-wider">{t("app.name")}</p>
                <p className="text-[11px] text-white/80">{t("qr.universal", "Universal Pet Passport")}</p>
              </div>
            </div>
            <Globe size={20} className="text-white/70" />
          </div>
        </div>

        {/* Identity strip */}
        <div className="flex items-center gap-3 border-b border-line p-4">
          <PetAvatar pet={pet} size={56} photoFallback />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold tracking-tighter2 text-ink">{pet.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {t(`pet.species.${pet.species}`)}{pet.breed ? ` · ${breedLabel(pet.breed, i18n.language)}` : ""}
            </p>
          </div>
          <div className="text-end">
            <p className="text-[10px] uppercase tracking-wider text-ink-subtle">{t("pet.serial")}</p>
            <p className="font-display text-lg font-extrabold text-brand-700 dark:text-brand-300">#{pet.serial}</p>
          </div>
        </div>

        {/* QR */}
        <div className="flex flex-col items-center p-5">
          <div className="rounded-2xl bg-white p-3 shadow-inner-line">
            <QrCode value={pet.passport_token} size={196} />
          </div>
          <p className="mt-3 max-w-xs text-center text-sm text-ink-muted">{t("qr.subtitle", { name: pet.name })}</p>
          <span className="mt-2 chip bg-brand-50 font-mono text-xs tracking-wider text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {pet.passport_token}
          </span>
          {pet.allergies && pet.allergies.length > 0 && (
            <span className="mt-3 chip bg-danger-50 text-xs text-danger-700 dark:bg-danger-500/15 dark:text-danger-200">
              <ShieldAlert size={13} /> {t("pet.allergies")}: {pet.allergies.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="no-print flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" leftIcon={<Printer size={16} />} onClick={() => window.print()}>{t("common.print")}</Button>
        <Button variant="secondary" size="sm" leftIcon={<Share2 size={16} />} onClick={share}>{t("qr.share", "Share")}</Button>
        <Button variant="ghost" size="sm" leftIcon={<Copy size={16} />} onClick={copy}>{t("qr.copy", "Copy code")}</Button>
      </div>
    </div>
  );
}
