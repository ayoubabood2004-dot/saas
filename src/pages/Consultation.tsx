import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ArrowRight, ShieldAlert, Stethoscope, Search, FileText, Image as ImageIcon, Pill,
  MessageSquare, Activity, ClipboardList, Check, ChevronRight, ChevronLeft, Weight,
  Thermometer, HeartPulse, Wind, Timer, Shield, Droplet, Droplets, FlaskConical, TestTube,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Pet, MedicalVisit, MediaItem } from "@/types";
import { repo } from "@/lib/repo";
import { breedLabel } from "@/lib/breeds";
import { useAuth } from "@/contexts/AuthContext";
import { PetAvatar } from "@/components/PetAvatar";
import { AnatomyMarker } from "@/components/AnatomyMarker";
import { VITAL_KEYS, CBC_KEYS, rangeForPet, isOutOfRangePet, type ReadingKey } from "@/lib/vitals";
import { searchDiagnoses, type DiagnosisCode } from "@/lib/icdvet";
import { playSuccess, playWarning, playTap } from "@/lib/sounds";
import { Button, SuccessDialog, Card, Badge, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type SoapKey = "S" | "O" | "A" | "P";

const COMPLAINTS: { en: string; ar: string }[] = [
  { en: "Vomiting", ar: "قيء" },
  { en: "Diarrhea", ar: "إسهال" },
  { en: "Lethargy", ar: "خمول" },
  { en: "Not eating", ar: "فقدان الشهية" },
  { en: "Limping", ar: "عرج" },
  { en: "Coughing", ar: "سعال" },
  { en: "Itching / scratching", ar: "حكة" },
  { en: "Fever", ar: "حمى" },
  { en: "Wound / injury", ar: "جرح / إصابة" },
  { en: "Eye discharge", ar: "إفراز بالعين" },
];

export function Consultation() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const apptId = params.get("appt");

  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pet, setPet] = useState<Pet | null>(null);
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);

  const [subjective, setSubjective] = useState("");
  const [vitals, setVitals] = useState<Partial<Record<ReadingKey, string>>>({});
  const [assessment, setAssessment] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [plan, setPlan] = useState("");
  const [treatments, setTreatments] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<SoapKey>("S");

  const Back = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!petId) return;
    let active = true;
    setLoadError(false);
    void (async () => {
      try {
        const [p, v, m] = await Promise.all([repo.getPet(petId), repo.listVisits(petId), repo.listMedia(petId)]);
        if (!active) return;
        setPet(p ?? null);
        setVisits(v);
        setMedia(m);
        if (!p) setLoadError(true);
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [petId]);

  const suggestions: DiagnosisCode[] = useMemo(() => searchDiagnoses(assessment), [assessment]);

  if (!pet) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        {loadError ? (
          <div className="card mx-auto max-w-md p-8">
            <p className="font-semibold text-ink">{t("records.loadFailed", "Couldn't load this record")}</p>
            <p className="mt-1 text-sm text-ink-muted">{t("errors.tryAgain", "Please try again.")}</p>
            <Button className="mt-4" variant="secondary" onClick={() => navigate(-1)}>{t("common.back", "Back")}</Button>
          </div>
        ) : (
          <span className="text-ink-subtle">{t("common.loading")}</span>
        )}
      </div>
    );
  }

  const setVital = (key: ReadingKey, value: string) => {
    setVitals((prev) => ({ ...prev, [key]: value }));
    const num = Number(value);
    if (value !== "" && !Number.isNaN(num) && isOutOfRangePet(pet.species, key, num, pet.id)) {
      playWarning();
    }
  };

  const save = async () => {
    if (!assessment.trim() || saving) return;
    const fmt = (keys: ReadingKey[]) =>
      keys.filter((k) => vitals[k]).map((k) => `${t(`reading.${k}`)} ${vitals[k]}${rangeForPet(pet.species, k, pet.id).unit}`).join(" · ");
    const vitalsStr = fmt(VITAL_KEYS);
    const cbcStr = fmt(CBC_KEYS);
    const objective = [vitalsStr, cbcStr && `CBC — ${cbcStr}`].filter(Boolean).join("\n");
    setSaving(true);
    try {
      const visit = await repo.addVisit({
        pet_id: pet.id,
        clinic_name: "Happy Paws Veterinary Clinic",
        doctor_name: user?.full_name ?? "Doctor",
        visit_date: new Date().toISOString().slice(0, 10),
        subjective: subjective.trim() || undefined,
        objective: objective || undefined,
        assessment: assessment.trim(),
        plan: plan.trim() || undefined,
        treatments: treatments.split(",").map((s) => s.trim()).filter(Boolean),
        notes: marking ? "See anatomical marking." : undefined,
      });
      if (marking) {
        await repo.addMedia({ pet_id: pet.id, kind: "document", url: marking, caption: `Anatomical marking — ${visit.visit_date}` });
      }
      if (apptId) await repo.setAppointmentStatus(apptId, "done");
      playSuccess();
      setSaved(true);
    } catch (e) {
      toast.error(t("records.saveError", "Couldn't save. Please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const recent = visits.slice(0, 3);
  const lang: "en" | "ar" = i18n.language === "ar" ? "ar" : "en";
  const allKeys = [...VITAL_KEYS, ...CBC_KEYS];
  const anyVital = allKeys.some((k) => vitals[k]);
  const abnormalCount = allKeys.filter((k) => {
    const v = vitals[k];
    const n = Number(v);
    return v && !Number.isNaN(n) && isOutOfRangePet(pet.species, k, n, pet.id);
  }).length;

  const done: Record<SoapKey, boolean> = {
    S: !!subjective.trim(),
    O: anyVital || !!marking,
    A: !!assessment.trim(),
    P: !!plan.trim() || !!treatments.trim(),
  };
  const doneCount = Object.values(done).filter(Boolean).length;

  const SECTIONS: { id: SoapKey; label: string; sub: string; icon: typeof MessageSquare }[] = [
    { id: "S", label: lang === "ar" ? "الشكوى" : "Subjective", sub: lang === "ar" ? "شكوى المالك" : "Owner's complaint", icon: MessageSquare },
    { id: "O", label: lang === "ar" ? "الفحص" : "Objective", sub: lang === "ar" ? "العلامات الحيوية والفحص" : "Vitals & exam", icon: Activity },
    { id: "A", label: lang === "ar" ? "التشخيص" : "Assessment", sub: lang === "ar" ? "التشخيص" : "Diagnosis", icon: Stethoscope },
    { id: "P", label: lang === "ar" ? "الخطة" : "Plan", sub: lang === "ar" ? "العلاج والرعاية" : "Treatment & care", icon: ClipboardList },
  ];
  const order: SoapKey[] = ["S", "O", "A", "P"];
  const idx = order.indexOf(section);
  const NextChevron = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;
  const PrevChevron = i18n.dir() === "rtl" ? ChevronRight : ChevronLeft;
  const addComplaint = (c: string) => setSubjective((s) => (s.trim() ? `${s.replace(/\s*$/, "")}, ${c}` : c));
  const cur = SECTIONS[idx];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button className="btn-ghost mb-3 px-2 py-1 text-sm" onClick={() => navigate(-1)}>
        <Back size={18} /> {t("common.back")}
      </button>

      {/* Patient header */}
      <Card padded className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <PetAvatar pet={pet} size={56} photoFallback />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{pet.name}</h1>
            <p className="text-sm text-ink-muted">
              {t(`pet.species.${pet.species}`)}{pet.breed ? ` · ${breedLabel(pet.breed, i18n.language)}` : ""}
            </p>
          </div>
          <Badge tone="neutral" icon={<Weight size={13} />}>{pet.current_weight_kg ?? "—"} {t("common.kg")}</Badge>
          <Button variant="secondary" size="sm" leftIcon={<Pill size={16} />} onClick={() => navigate(`/pet/${pet.id}?tab=treatment`)}>
            {t("treatment.openSheet")}
          </Button>
        </div>
        {pet.allergies && pet.allergies.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-2.5 text-sm font-semibold text-danger-700 dark:bg-danger-500/15 dark:text-danger-200">
            <ShieldAlert size={18} /> {t("pet.allergies")}: {pet.allergies.join(", ")}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* MAIN — guided SOAP workspace */}
        <div className="space-y-4 lg:col-span-2">
          {/* Section menu */}
          <div className="flex gap-1.5 rounded-2xl border border-line bg-surface-2 p-1.5">
            {SECTIONS.map((s, i) => {
              const active = section === s.id;
              const isDone = done[s.id];
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSection(s.id); playTap(); }}
                  className={cn("relative flex-1 rounded-xl px-2 py-2.5 transition-colors", active ? "text-white" : "text-ink-muted hover:text-ink")}
                >
                  {active && <motion.span layoutId="soap-tab" className="absolute inset-0 rounded-xl bg-brand-600 shadow-soft" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                  <span className="relative z-10 flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold", active ? "bg-white/25 text-white" : isDone ? "bg-success-500 text-white" : "bg-surface-1 text-ink-subtle")}>
                        {isDone ? <Check size={11} strokeWidth={3} /> : i + 1}
                      </span>
                      <Icon size={15} />
                    </span>
                    <span className="text-xs font-semibold">{s.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active section panel */}
          <Card padded className="min-h-[24rem]">
            <AnimatePresence mode="wait">
              <motion.div key={section} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
                <PanelHead icon={<cur.icon size={18} />} title={cur.label} sub={cur.sub} right={section === "O" && abnormalCount > 0 ? <Badge tone="danger">{abnormalCount} {t("consult.outOfRange")}</Badge> : undefined} />

                {section === "S" && (
                  <div>
                    <p className="mb-2 text-xs text-ink-subtle">{t("consult.quickComplaints", "Tap to add common complaints")}</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {COMPLAINTS.map((c) => (
                        <button key={c.en} onClick={() => addComplaint(c[lang])} className="chip bg-surface-2 text-ink-muted transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/15 dark:hover:text-brand-300">
                          + {c[lang]}
                        </button>
                      ))}
                    </div>
                    <textarea className="input min-h-36" value={subjective} onChange={(e) => setSubjective(e.target.value)} placeholder={t("consult.subjectivePlaceholder")} autoFocus />
                  </div>
                )}

                {section === "O" && (
                  <div className="space-y-4">
                    <div>
                      <p className="label">{t("consult.objective")}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {VITAL_KEYS.map((k) => <VitalCard key={k} k={k} pet={pet} value={vitals[k] ?? ""} onChange={setVital} />)}
                      </div>
                    </div>
                    <div>
                      <p className="label">{t("reading.cbc")}</p>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {CBC_KEYS.map((k) => <VitalCard key={k} k={k} pet={pet} value={vitals[k] ?? ""} onChange={setVital} />)}
                      </div>
                    </div>
                    <div>
                      <p className="label">{t("consult.marking")}</p>
                      <AnatomyMarker species={pet.species} onChange={setMarking} />
                    </div>
                  </div>
                )}

                {section === "A" && (
                  <div>
                    {assessment.trim() && (
                      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10">
                        <span className="font-display font-bold text-brand-700 dark:text-brand-300">{assessment}</span>
                        <button onClick={() => setAssessment("")} className="text-xs text-ink-subtle underline transition hover:text-ink">{t("common.clear", "Clear")}</button>
                      </div>
                    )}
                    <div className="relative">
                      <Search size={16} className="absolute top-3.5 start-3 text-ink-subtle" />
                      <input
                        className="input ps-9"
                        value={assessment}
                        onChange={(e) => { setAssessment(e.target.value); setShowSuggest(true); }}
                        onFocus={() => setShowSuggest(true)}
                        placeholder={t("consult.assessmentPlaceholder")}
                      />
                    </div>
                    {showSuggest && suggestions.length > 0 && (
                      <div className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                        {suggestions.map((d) => (
                          <button
                            key={d.code}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-ink transition hover:bg-brand-50 dark:hover:bg-brand-500/15"
                            onClick={() => { setAssessment(d.name); setShowSuggest(false); }}
                          >
                            <span className="font-mono text-xs text-brand-600 dark:text-brand-300">{d.code}</span>
                            {d.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {section === "P" && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">{t("consult.plan")}</label>
                      <textarea className="input min-h-28" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={t("consult.planPlaceholder")} />
                    </div>
                    <div>
                      <label className="label">{t("consult.treatments")}</label>
                      <input className="input" value={treatments} onChange={(e) => setTreatments(e.target.value)} placeholder="Carprofen 75mg, Glucosamine" />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Section nav */}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <Button variant="ghost" size="sm" disabled={idx === 0} leftIcon={<PrevChevron size={16} />} onClick={() => setSection(order[idx - 1])}>
                {t("common.back")}
              </Button>
              {idx < order.length - 1 && (
                <Button variant="secondary" size="sm" rightIcon={<NextChevron size={16} />} onClick={() => setSection(order[idx + 1])}>
                  {SECTIONS[idx + 1].label}
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* CONTEXT rail */}
        <div className="space-y-4">
          <Card padded>
            <h2 className="mb-2 flex items-center gap-2 font-bold text-ink"><Stethoscope size={18} /> {t("consult.lastVisits")}</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("consult.noHistory")}</p>
            ) : (
              <div className="space-y-2.5">
                {recent.map((v) => (
                  <div key={v.id} className="border-s-2 border-brand-200 ps-3 dark:border-brand-500/40">
                    <p className="text-sm font-semibold text-ink">{v.assessment}</p>
                    <p className="text-xs text-ink-muted">{v.visit_date} · {v.doctor_name}</p>
                    {v.plan && <p className="mt-0.5 text-xs text-ink-subtle">{v.plan}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padded>
            <h2 className="mb-2 flex items-center gap-2 font-bold text-ink"><ImageIcon size={18} /> {t("consult.latestMedia")}</h2>
            {media.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t("passport.noMedia")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {media.slice(0, 6).map((m) => (
                  <div key={m.id} className="overflow-hidden rounded-xl border border-line">
                    {m.url.startsWith("data:image") || /\.(png|jpg|jpeg|webp|gif)$/i.test(m.caption ?? m.url) || m.url.startsWith("blob:") ? (
                      <img src={m.url} alt={m.caption} className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="grid aspect-square place-items-center bg-surface-2 text-ink-subtle"><FileText size={22} /></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-1/90 px-4 py-3 shadow-raised backdrop-blur no-print">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            {order.map((k) => <span key={k} className={cn("h-2 w-2 rounded-full transition-colors", done[k] ? "bg-success-500" : "bg-surface-3")} />)}
          </div>
          <span className="hidden text-sm text-ink-muted sm:inline">{t("consult.progress", { done: doneCount, total: 4, defaultValue: "{{done}}/{{total}} sections" })}</span>
        </div>
        <Button size="lg" onClick={save} loading={saving} disabled={!assessment.trim() || saving}>{t("consult.save")}</Button>
      </div>

      <SuccessDialog
        open={saved}
        onClose={() => navigate("/reception")}
        title={t("consult.saved")}
        message={t("consult.savedMsg", { name: pet.name, defaultValue: "{{name}}'s consultation has been recorded." })}
        actionLabel={t("common.close")}
        onAction={() => navigate("/reception")}
      />
    </div>
  );
}

function PanelHead({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
        <div>
          <h2 className="font-display text-lg font-bold tracking-tighter2 text-ink">{title}</h2>
          <p className="text-xs text-ink-subtle">{sub}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

const VITAL_ICON: Partial<Record<ReadingKey, typeof Activity>> = {
  temp: Thermometer, hr: HeartPulse, rr: Wind, crt: Timer,
  wbc: Shield, rbc: Droplet, hgb: Droplets, hct: FlaskConical,
  plt: Activity, mcv: TestTube, mchc: TestTube,
};

/** Premium vital metric card: icon, large editable value, low–normal–high gauge, status pill. */
function VitalCard({ k, pet, value, onChange }: { k: ReadingKey; pet: Pet; value: string; onChange: (k: ReadingKey, v: string) => void }) {
  const { t } = useTranslation();
  const range = rangeForPet(pet.species, k, pet.id);
  const num = Number(value);
  const has = value !== "" && !Number.isNaN(num);
  const bad = has && isOutOfRangePet(pet.species, k, num, pet.id);
  const span = range.max - range.min || 1;
  const pad = span * 0.45;
  const dispMin = range.min - pad;
  const dispSpan = span + pad * 2;
  const normLeft = ((range.min - dispMin) / dispSpan) * 100;
  const normWidth = (span / dispSpan) * 100;
  const markerPct = has ? Math.max(2, Math.min(98, ((num - dispMin) / dispSpan) * 100)) : null;
  const status = !has ? null : bad ? (num < range.min ? "low" : "high") : "normal";
  const Icon = VITAL_ICON[k] ?? Activity;
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-colors",
        bad
          ? "border-danger-300 bg-danger-50/50 dark:border-danger-500/30 dark:bg-danger-500/5"
          : has
            ? "border-success-200 bg-surface-1 dark:border-success-500/25"
            : "border-line bg-surface-1",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-muted">
          <Icon size={14} className={cn("shrink-0", bad ? "text-danger-500" : "text-brand-500")} />
          <span className="truncate">{t(`reading.${k}`)}</span>
        </span>
        {status && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              status === "normal"
                ? "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200"
                : "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-200",
            )}
          >
            {t(`reading.${status}`, status)}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(k, e.target.value)}
          placeholder="—"
          className={cn(
            "w-full min-w-0 bg-transparent font-display text-2xl font-extrabold tracking-tighter2 outline-none placeholder:text-ink-subtle/40",
            bad ? "text-danger-600 dark:text-danger-300" : "text-ink",
          )}
        />
        <span className="shrink-0 text-[11px] text-ink-subtle">{range.unit}</span>
      </div>

      <div className="mt-2" dir="ltr">
        <div className="relative h-1.5 rounded-full bg-danger-100/70 dark:bg-danger-500/15">
          <span className="absolute top-0 h-full rounded-full bg-success-300 dark:bg-success-500/40" style={{ left: `${normLeft}%`, width: `${normWidth}%` }} />
          {markerPct !== null && (
            <span
              className={cn("absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-1 shadow", bad ? "bg-danger-500" : "bg-success-600")}
              style={{ left: `${markerPct}%` }}
            />
          )}
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-ink-subtle">
          <span>{range.min}</span>
          <span>{range.max}</span>
        </div>
      </div>
    </div>
  );
}
