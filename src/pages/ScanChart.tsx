import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanLine, Search, Printer, ShieldAlert, Mail } from "lucide-react";
import type { Pet, Vaccination, MedicalVisit, WeightLog } from "@/types";
import { repo } from "@/lib/repo";
import { PetAvatar } from "@/components/PetAvatar";
import { WeightChart } from "@/components/WeightChart";
import { ageFromDOB } from "@/lib/utils";
import { playScan, playWarning } from "@/lib/sounds";
import { getOwnerByToken } from "@/lib/owners";

interface Chart {
  pet: Pet;
  vaccines: Vaccination[];
  visits: MedicalVisit[];
  weights: WeightLog[];
}

export function ScanChart() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [chart, setChart] = useState<Chart | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState("");
  const [emailResults, setEmailResults] = useState<Pet[] | null>(null);
  const [emailError, setEmailError] = useState(false);

  const openPet = async (pet: Pet) => {
    playScan();
    try {
      const [vaccines, visits, weights] = await Promise.all([
        repo.listVaccinations(pet.id),
        repo.listVisits(pet.id),
        repo.listWeights(pet.id),
      ]);
      setChart({ pet, vaccines, visits, weights });
    } catch {
      playWarning();
      setError(true);
      setChart(null);
    }
  };

  const open = async () => {
    setError(false);
    try {
      // An owner's personal QR (OWNER-…) opens their shared pets; otherwise treat as a pet passport.
      const owner = getOwnerByToken(code);
      if (owner) {
        const pets = await repo.getSharedPetsByOwnerId(owner.id);
        if (pets.length === 0) { playWarning(); setError(true); setChart(null); return; }
        if (pets.length === 1) { await openPet(pets[0]); return; }
        playScan();
        setEmailResults(pets);
        return;
      }
      const pet = await repo.getPetByToken(code);
      if (!pet) {
        playWarning();
        setError(true);
        setChart(null);
        return;
      }
      await openPet(pet);
    } catch {
      playWarning();
      setError(true);
      setChart(null);
    }
  };

  const lookupEmail = async () => {
    setEmailError(false);
    try {
      const pets = await repo.getPetsByOwnerEmail(email);
      if (pets.length === 0) {
        playWarning();
        setEmailError(true);
        setEmailResults(null);
        return;
      }
      if (pets.length === 1) { await openPet(pets[0]); return; }
      playScan();
      setEmailResults(pets);
    } catch {
      playWarning();
      setEmailError(true);
      setEmailResults(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {!chart ? (
        <div className="card p-6 max-w-md mx-auto mt-6 animate-fade-in">
          <div className="flex flex-col items-center text-center mb-5">
            <div className="relative w-40 h-40 rounded-2xl bg-slate-900 overflow-hidden grid place-items-center mb-4">
              <ScanLine size={64} className="text-brand-400" />
              <div className="absolute inset-x-0 h-0.5 bg-brand-400 shadow-[0_0_12px_2px_#4ade80] animate-scan-line" />
            </div>
            <h1 className="text-xl font-bold text-ink">{t("qr.scanTitle")}</h1>
            <p className="text-sm text-ink-muted mt-1">{t("qr.scanHint")}</p>
          </div>
          <label className="label">{t("qr.token")}</label>
          <div className="flex gap-2">
            <input
              className="input font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && open()}
              placeholder="PET-BOBBY-7F3A9"
              autoFocus
            />
            <button className="btn-primary px-4" onClick={open}>
              <Search size={18} />
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{t("qr.notFound")}</p>}
          <p className="text-xs text-ink-subtle mt-4">Demo codes: <span className="font-mono">PET-BOBBY-7F3A9</span>, owner QR <span className="font-mono">OWNER-MAYA-5G7H2</span></p>

          <div className="border-t border-line mt-5 pt-5">
            <label className="label flex items-center gap-1.5"><Mail size={14} /> {t("qr.byEmail")}</label>
            <div className="flex gap-2">
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupEmail()}
                placeholder="owner@email.com"
              />
              <button className="btn-secondary px-4" onClick={lookupEmail}><Search size={18} /></button>
            </div>
            {emailError && <p className="text-sm text-red-600 mt-2">{t("qr.noEmail")}</p>}
            {emailResults && (
              <div className="mt-3">
                <p className="text-xs text-ink-muted mb-2">{t("qr.choosePet")}</p>
                <div className="space-y-2">
                  {emailResults.map((p) => (
                    <button key={p.id} className="card w-full p-3 flex items-center gap-3 text-start hover:shadow-soft" onClick={() => openPet(p)}>
                      <PetAvatar pet={p} size={40} />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm">{p.name}</p>
                        <p className="text-xs text-ink-muted">{t(`pet.species.${p.species}`)}{p.breed ? ` · ${p.breed}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-ink-subtle mt-3">Demo email: <span className="font-mono">maya.khalil@email.com</span></p>
          </div>
        </div>
      ) : (
        <PrintableChart chart={chart} onBack={() => { setChart(null); setCode(""); }} />
      )}
    </div>
  );
}

function PrintableChart({ chart, onBack }: { chart: Chart; onBack: () => void }) {
  const { t } = useTranslation();
  const { pet, vaccines, visits, weights } = chart;
  const age = ageFromDOB(pet.dob);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button className="btn-ghost px-3 py-2 text-sm" onClick={onBack}>{t("common.back")}</button>
        <button className="btn-primary py-2 px-4 text-sm" onClick={() => window.print()}>
          <Printer size={18} /> {t("qr.print")}
        </button>
      </div>

      <div className="card p-6 print-area space-y-6">
        <div className="flex items-center gap-4 border-b border-line pb-4">
          <PetAvatar pet={pet} size={72} />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-ink">{t("qr.chartFor", { name: pet.name })}</h1>
            <p className="text-ink-muted">
              {t(`pet.species.${pet.species}`)}{pet.breed ? ` · ${pet.breed}` : ""}
              {age ? ` · ${t("pet.ageValue", { years: age.years, months: age.months })}` : ""}
              {pet.microchip_id ? ` · ${t("pet.microchip")} ${pet.microchip_id}` : ""}
            </p>
          </div>
        </div>

        {pet.allergies && pet.allergies.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 text-red-700 px-4 py-3 font-semibold">
            <ShieldAlert size={20} /> {t("pet.allergies")}: {pet.allergies.join(", ")}
          </div>
        )}

        <section>
          <h2 className="font-bold text-ink mb-2">{t("passport.weightChart")}</h2>
          {weights.length ? <WeightChart logs={weights} /> : <p className="text-ink-subtle text-sm">{t("passport.noWeights")}</p>}
        </section>

        <section>
          <h2 className="font-bold text-ink mb-2">{t("passport.vaccineTimeline")}</h2>
          <div className="space-y-1.5">
            {vaccines.map((v) => (
              <div key={v.id} className="flex justify-between text-sm border-b border-slate-50 py-1.5">
                <span className="font-medium text-ink">{v.name}</span>
                <span className="text-ink-muted">
                  {v.status === "administered" ? `✓ ${v.administered_at}` : v.status === "overdue" ? `⚠ ${t("passport.overdue")}` : v.due_date}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-bold text-ink mb-2">{t("passport.historyTitle")}</h2>
          <div className="space-y-3">
            {visits.map((v) => (
              <div key={v.id} className="border-s-2 border-brand-200 ps-3">
                <p className="font-semibold text-ink">{v.assessment}</p>
                <p className="text-xs text-ink-muted">{v.visit_date} · {v.clinic_name} · {v.doctor_name}</p>
                {v.plan && <p className="text-sm text-ink-muted mt-1">{t("passport.prescription")}: {v.plan}</p>}
                {v.treatments && v.treatments.length > 0 && (
                  <p className="text-sm text-ink-muted">{t("passport.treatments")}: {v.treatments.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
