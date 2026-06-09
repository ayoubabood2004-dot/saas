import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Camera, Stethoscope, BedDouble, LogOut as ReleaseIcon, CheckCircle2, Pill, Plus, Trash2, Activity, ChevronDown, Search } from "lucide-react";
import type { Species, Sex, AdmissionKind, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { PhoneInput } from "@/components/PhoneInput";
import { PetAvatar } from "@/components/PetAvatar";
import { ReadingsFields } from "@/components/ReadingsFields";
import { SpeciesPicker, SexPicker, AgeInput, WeightInput, ColorPicker, BreedPicker } from "@/components/PetFields";
import { useToast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { formatReadings, type ReadingKey } from "@/lib/vitals";
import { uid } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

type Disposition = "log" | "boarding" | "release";

interface AnimalDraft {
  key: string;
  photo: string | null;
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  dob: string;
  weight: string;
  color: string;
  microchip: string;
  allergies: string;
  notes: string;
  disp: Disposition;
  cage: string;
  addMeds: boolean;
  readings: Partial<Record<ReadingKey, string>>;
  readingsOpen: boolean;
}

function newAnimal(): AnimalDraft {
  return {
    key: uid("a"), photo: null, name: "", species: "dog", breed: "", sex: "unknown",
    dob: "", weight: "", color: "", microchip: "", allergies: "", notes: "",
    disp: "log", cage: "", addMeds: true, readings: {}, readingsOpen: false,
  };
}

interface Outcome {
  petId: string;
  name: string;
  species: Species;
  disp: Disposition;
  addMeds: boolean;
}

export function NewCase() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const [entry, setEntry] = useState<"new" | "serial">("new");
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [animals, setAnimals] = useState<AnimalDraft[]>([newAnimal()]);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const Next = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;

  const setAnimal = (key: string, patch: Partial<AnimalDraft>) =>
    setAnimals((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const addAnimal = () => setAnimals((as) => [...as, newAnimal()]);
  const removeAnimal = (key: string) => setAnimals((as) => (as.length === 1 ? as : as.filter((a) => a.key !== key)));

  const valid = animals.filter((a) => a.name.trim());

  const finish = async () => {
    // In live (Supabase) mode the pet's owner_id must reference a real account
    // (FK + row-level security). Clinic walk-ins have no owner account, so we
    // attribute the record to the signed-in staff member. Demo mode accepts any id.
    const ownerId = user?.id ?? uid("owner");
    const results: Outcome[] = [];
    try {
      for (const a of valid) {
        const pet = await repo.createPet({
          owner_id: ownerId,
          owner_name: ownerName.trim() || "—",
          owner_phone: phone || undefined,
          owner_email: email.trim() || undefined,
          name: a.name.trim(),
          species: a.species,
          breed: a.breed.trim() || undefined,
          sex: a.sex,
          dob: a.dob || null,
          microchip_id: a.microchip.trim() || undefined,
          color: a.color.trim() || undefined,
          photo_url: a.photo,
          current_weight_kg: a.weight ? Number(a.weight) : null,
          allergies: a.allergies.split(",").map((s) => s.trim()).filter(Boolean),
        });
        const reason = a.notes.trim() || undefined;
        if (a.disp === "log") {
          await repo.addAdmission({ pet_id: pet.id, kind: "treatment" as AdmissionKind, status: "active", admitted_on: today, reason });
        } else if (a.disp === "boarding") {
          await repo.addAdmission({ pet_id: pet.id, kind: "boarding" as AdmissionKind, status: "active", admitted_on: today, cage: a.cage.trim() || undefined, reason });
        } else {
          await repo.addAdmission({ pet_id: pet.id, kind: "treatment" as AdmissionKind, status: "discharged", admitted_on: today, discharged_on: today, reason });
        }

        // Readings recorded at registration become a dated entry in the patient's history.
        const objective = formatReadings(a.readings, a.species, pet.id, (k) => t(`reading.${k}`));
        if (objective) {
          await repo.addVisit({
            pet_id: pet.id,
            clinic_name: "Happy Paws Veterinary Clinic",
            doctor_name: user?.full_name ?? "Doctor",
            visit_date: today,
            objective,
            assessment: t("newCase.admissionReadings"),
          });
        }

        results.push({ petId: pet.id, name: pet.name, species: a.species, disp: a.disp, addMeds: a.addMeds });
      }
    } catch (e) {
      playWarning();
      toast.error(t("newCase.saveError", "Couldn't save the registration. Please try again."), e instanceof Error ? e.message : undefined);
      return;
    }
    playSuccess();
    setOutcomes(results);
  };

  if (outcomes) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center animate-fade-in">
        <CheckCircle2 size={64} className="mx-auto text-brand-500 mb-3" />
        <h1 className="text-2xl font-extrabold text-ink">{t("newCase.created")}</h1>
        <div className="mt-6 space-y-2 text-start">
          {outcomes.map((o) => (
            <div key={o.petId} className="card p-3 flex items-center gap-3">
              <PetAvatar pet={{ species: o.species, photo_url: null, name: o.name }} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink text-sm">{o.name}</p>
                <span className="chip bg-brand-50 text-brand-700 text-[11px]">
                  {o.disp === "log" ? t("newCase.toLog") : o.disp === "boarding" ? t("newCase.toBoarding") : t("newCase.toRelease")}
                </span>
              </div>
              {o.disp !== "release" && o.addMeds && (
                <button className="btn-secondary py-1.5 px-3 text-xs" onClick={() => navigate(`/pet/${o.petId}?tab=treatment`)}>
                  <Pill size={14} /> {t("treatment.openSheet")}
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="btn-primary w-full mt-6" onClick={() => navigate("/records")}>{t("newCase.goRecords")}</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="btn-ghost px-2 py-1 mb-2 text-sm" onClick={() => (step === 1 ? navigate(-1) : setStep(1))}>
        <Prev size={18} /> {t("common.back")}
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-extrabold text-ink">{t("newCase.title")}</h1>
        <span className="text-sm text-ink-subtle">{step === 1 ? t("newCase.step1") : t("newCase.step2")}</span>
      </div>
      <p className="text-xs text-ink-subtle mb-5">{t("newCase.subtitle")}</p>

      <div className="flex gap-1 mb-5 bg-surface-2 p-1 rounded-xl max-w-md">
        <button className={`flex-1 py-2 rounded-lg text-sm font-semibold ${entry === "new" ? "bg-white text-brand-700 shadow-card" : "text-ink-muted"}`} onClick={() => setEntry("new")}>{t("newCase.entryNew")}</button>
        <button className={`flex-1 py-2 rounded-lg text-sm font-semibold ${entry === "serial" ? "bg-white text-brand-700 shadow-card" : "text-ink-muted"}`} onClick={() => setEntry("serial")}>{t("newCase.entrySerial")}</button>
      </div>

      {entry === "serial" ? (
        <SerialAdmit today={today} doctorName={user?.full_name ?? "Doctor"} onAdmitted={(o) => setOutcomes([o])} />
      ) : step === 1 ? (
        <div className="space-y-5 animate-fade-in">
          {/* Owner (once) */}
          <div className="card p-4 space-y-3">
            <h2 className="font-bold text-ink">{t("newCase.ownerSection")}</h2>
            <div>
              <label className="label">{t("newCase.ownerName")}</label>
              <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("phone.ownerPhone")}</label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div>
              <label className="label">{t("phone.ownerEmail")}</label>
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" />
            </div>
          </div>

          {/* Animals (one or more) */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">{t("newCase.animals")}</h2>
            <span className="chip bg-surface-2 text-ink-muted text-xs">{animals.length}</span>
          </div>

          {animals.map((a, i) => (
            <div key={a.key} className="card p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-brand-700">{t("newCase.animalLabel", { n: i + 1 })}</span>
                {animals.length > 1 && (
                  <button className="text-ink-subtle hover:text-red-500" onClick={() => removeAnimal(a.key)} aria-label={t("newCase.removeAnimal")}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer shrink-0">
                  {a.photo ? (
                    <img src={a.photo} alt="" className="w-20 h-20 rounded-2xl object-cover" />
                  ) : (
                    <span className="w-20 h-20 rounded-2xl bg-brand-50 text-brand-500 grid place-items-center"><Camera size={26} /></span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const r = new FileReader(); r.onload = () => setAnimal(a.key, { photo: r.result as string }); r.readAsDataURL(f);
                  }} />
                </label>
                <div className="flex-1">
                  <label className="label">{t("pet.name")}</label>
                  <input className="input" value={a.name} onChange={(e) => setAnimal(a.key, { name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">{t("pet.speciesLabel")}</label>
                <SpeciesPicker value={a.species} onChange={(s) => setAnimal(a.key, { species: s })} />
              </div>
              <div>
                <label className="label">{t("pet.breed")}</label>
                <BreedPicker species={a.species} value={a.breed} onChange={(v) => setAnimal(a.key, { breed: v })} />
              </div>
              <div>
                <label className="label">{t("pet.sexLabel")}</label>
                <SexPicker value={a.sex} onChange={(s) => setAnimal(a.key, { sex: s })} />
              </div>
              <div>
                <label className="label">{t("pet.ageLabel", "Age")}</label>
                <AgeInput dob={a.dob} onChange={(d) => setAnimal(a.key, { dob: d })} />
              </div>
              <div>
                <WeightInput value={a.weight} onChange={(v) => setAnimal(a.key, { weight: v })} />
              </div>
              <div>
                <label className="label">{t("pet.color")}</label>
                <ColorPicker value={a.color} onChange={(v) => setAnimal(a.key, { color: v })} />
              </div>
              <div>
                <label className="label">{t("pet.microchip")}</label>
                <input className="input" value={a.microchip} onChange={(e) => setAnimal(a.key, { microchip: e.target.value })} />
              </div>
              <div>
                <label className="label">{t("newCase.allergies")}</label>
                <input className="input" value={a.allergies} onChange={(e) => setAnimal(a.key, { allergies: e.target.value })} placeholder="Penicillin, …" />
              </div>
              <div>
                <label className="label">{t("newCase.notes")}</label>
                <textarea className="input min-h-16" value={a.notes} onChange={(e) => setAnimal(a.key, { notes: e.target.value })} placeholder={t("newCase.notesPlaceholder")} />
              </div>

              {/* Optional medical readings (vitals + CBC), recorded into history */}
              <div className="border-t border-line pt-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-semibold text-brand-700"
                  onClick={() => setAnimal(a.key, { readingsOpen: !a.readingsOpen })}
                >
                  <Activity size={16} /> {t("newCase.recordReadings")}
                  <ChevronDown size={16} className={`transition ${a.readingsOpen ? "rotate-180" : ""}`} />
                </button>
                {a.readingsOpen && (
                  <div className="mt-3">
                    <ReadingsFields
                      species={a.species}
                      values={a.readings}
                      onChange={(k, v) => setAnimal(a.key, { readings: { ...a.readings, [k]: v } })}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          <button className="btn-ghost text-sm text-brand-700" onClick={addAnimal}>
            <Plus size={16} /> {t("newCase.addAnimal")}
          </button>

          <button className="btn-primary w-full" disabled={valid.length === 0} onClick={() => { playTap(); setStep(2); }}>
            {t("common.next")} <Next size={18} />
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          <h2 className="font-bold text-ink">{t("newCase.disposition")}</h2>

          {valid.map((a) => (
            <div key={a.key} className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <PetAvatar pet={{ species: a.species, photo_url: a.photo, name: a.name }} size={36} />
                <span className="font-bold text-ink">{a.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DispMini active={a.disp === "log"} icon={Stethoscope} label={t("newCase.toLog")} onClick={() => { playTap(); setAnimal(a.key, { disp: "log", addMeds: true }); }} />
                <DispMini active={a.disp === "boarding"} icon={BedDouble} label={t("newCase.toBoarding")} onClick={() => { playTap(); setAnimal(a.key, { disp: "boarding", addMeds: false }); }} />
                <DispMini active={a.disp === "release"} icon={ReleaseIcon} label={t("newCase.toRelease")} onClick={() => { playTap(); setAnimal(a.key, { disp: "release" }); }} />
              </div>
              {a.disp === "boarding" && (
                <div>
                  <label className="label">{t("newCase.cage")}</label>
                  <input className="input py-2" value={a.cage} onChange={(e) => setAnimal(a.key, { cage: e.target.value })} placeholder="B-2" />
                </div>
              )}
              {a.disp !== "release" && (
                <label className="flex items-center justify-between cursor-pointer text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <Pill size={16} className="text-brand-600" /> {t("newCase.addMeds")}
                    {a.disp === "boarding" && <span className="text-xs text-ink-subtle">· {t("newCase.addMedsOptional")}</span>}
                  </span>
                  <input type="checkbox" className="w-5 h-5 accent-brand-600" checked={a.addMeds} onChange={(e) => setAnimal(a.key, { addMeds: e.target.checked })} />
                </label>
              )}
            </div>
          ))}

          <button className="btn-primary w-full py-4" onClick={finish}>{t("newCase.finish")}</button>
        </div>
      )}
    </div>
  );
}

function DispMini({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Stethoscope; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold transition border ${active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-ink-muted border-line"}`}>
      <Icon size={20} />
      {label}
    </button>
  );
}

/** Admit an EXISTING animal to the clinic by its serial — no new registration. */
function SerialAdmit({ today, doctorName, onAdmitted }: { today: string; doctorName: string; onAdmitted: (o: Outcome) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [serial, setSerial] = useState("");
  const [pet, setPet] = useState<Pet | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [disp, setDisp] = useState<Disposition>("log");
  const [cage, setCage] = useState("");
  const [addMeds, setAddMeds] = useState(true);
  const [readingsOpen, setReadingsOpen] = useState(false);
  const [readings, setReadings] = useState<Partial<Record<ReadingKey, string>>>({});

  const lookup = async () => {
    setNotFound(false);
    const found = await repo.getPetBySerial(serial);
    if (!found) { playWarning(); setPet(null); setNotFound(true); return; }
    playTap();
    setPet(found);
  };

  const admit = async () => {
    if (!pet) return;
    try {
      if (disp === "log") await repo.addAdmission({ pet_id: pet.id, kind: "treatment" as AdmissionKind, status: "active", admitted_on: today });
      else if (disp === "boarding") await repo.addAdmission({ pet_id: pet.id, kind: "boarding" as AdmissionKind, status: "active", admitted_on: today, cage: cage.trim() || undefined });
      else await repo.addAdmission({ pet_id: pet.id, kind: "treatment" as AdmissionKind, status: "discharged", admitted_on: today, discharged_on: today });
      const objective = formatReadings(readings, pet.species, pet.id, (k) => t(`reading.${k}`));
      if (objective) {
        await repo.addVisit({ pet_id: pet.id, clinic_name: "Happy Paws Veterinary Clinic", doctor_name: doctorName, visit_date: today, objective, assessment: t("newCase.admissionReadings") });
      }
    } catch (e) {
      playWarning();
      toast.error(t("newCase.saveError", "Couldn't save the registration. Please try again."), e instanceof Error ? e.message : undefined);
      return;
    }
    playSuccess();
    onAdmitted({ petId: pet.id, name: pet.name, species: pet.species, disp, addMeds: disp !== "release" && addMeds });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4">
        <label className="label">{t("newCase.serialLabel")}</label>
        <div className="flex gap-2">
          <input className="input font-mono tracking-widest" value={serial} onChange={(e) => setSerial(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder="10001" autoFocus />
          <button className="btn-primary px-4" onClick={lookup}><Search size={18} /></button>
        </div>
        {notFound && <p className="text-sm text-red-600 mt-2">{t("newCase.serialNotFound")}</p>}
      </div>

      {pet && (
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold text-brand-700">{t("newCase.existingFound")}</p>
          <div className="flex items-center gap-3">
            <PetAvatar pet={pet} size={48} />
            <div>
              <p className="font-bold text-ink">{pet.name} <span className="text-xs text-ink-subtle font-mono">#{pet.serial}</span></p>
              <p className="text-xs text-ink-muted">{t(`pet.species.${pet.species}`)}{pet.breed ? ` · ${pet.breed}` : ""} · {pet.owner_name}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <DispMini active={disp === "log"} icon={Stethoscope} label={t("newCase.toLog")} onClick={() => { playTap(); setDisp("log"); setAddMeds(true); }} />
            <DispMini active={disp === "boarding"} icon={BedDouble} label={t("newCase.toBoarding")} onClick={() => { playTap(); setDisp("boarding"); setAddMeds(false); }} />
            <DispMini active={disp === "release"} icon={ReleaseIcon} label={t("newCase.toRelease")} onClick={() => { playTap(); setDisp("release"); }} />
          </div>
          {disp === "boarding" && (
            <div>
              <label className="label">{t("newCase.cage")}</label>
              <input className="input py-2" value={cage} onChange={(e) => setCage(e.target.value)} placeholder="B-2" />
            </div>
          )}
          {disp !== "release" && (
            <label className="flex items-center justify-between cursor-pointer text-sm">
              <span className="flex items-center gap-2 text-ink"><Pill size={16} className="text-brand-600" /> {t("newCase.addMeds")}{disp === "boarding" && <span className="text-xs text-ink-subtle">· {t("newCase.addMedsOptional")}</span>}</span>
              <input type="checkbox" className="w-5 h-5 accent-brand-600" checked={addMeds} onChange={(e) => setAddMeds(e.target.checked)} />
            </label>
          )}
          <div className="border-t border-line pt-3">
            <button type="button" className="flex items-center gap-2 text-sm font-semibold text-brand-700" onClick={() => setReadingsOpen(!readingsOpen)}>
              <Activity size={16} /> {t("newCase.recordReadings")} <ChevronDown size={16} className={`transition ${readingsOpen ? "rotate-180" : ""}`} />
            </button>
            {readingsOpen && (
              <div className="mt-3">
                <ReadingsFields species={pet.species} petId={pet.id} values={readings} onChange={(k, v) => setReadings((s) => ({ ...s, [k]: v }))} />
              </div>
            )}
          </div>
          <button className="btn-primary w-full py-3" onClick={admit}>{t("newCase.admitExisting")}</button>
        </div>
      )}
    </div>
  );
}
