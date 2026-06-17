import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, AlertTriangle, ChevronLeft, ChevronRight, UserCog, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { repo } from "@/lib/repo";
import { breedLabel } from "@/lib/breeds";
import type { Pet, Vaccination, Reminder } from "@/types";
import { PetAvatar } from "@/components/PetAvatar";
import { VaccinationRing } from "@/components/VaccinationRing";
import { AddPetModal } from "@/components/AddPetModal";
import { NextAppointment } from "@/components/NextAppointment";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { EducationHub } from "@/components/EducationHub";
import { buildUpcomingEvents } from "@/lib/events";
import { Modal } from "@/components/Modal";
import { PhoneInput } from "@/components/PhoneInput";
import { QrCode } from "@/components/QrCode";
import { Button, Skeleton, EmptyState } from "@/components/ui";
import { getOwner } from "@/lib/owners";
import { vaccinationCompletion, daysUntil } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import type { Appointment } from "@/types";

function greetingKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

interface PetWithVax extends Pet {
  vaccinations: Vaccination[];
}

export function OwnerDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<PetWithVax[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [nextAppt, setNextAppt] = useState<Appointment | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctPhone, setAcctPhone] = useState("");
  const [acctEmail, setAcctEmail] = useState("");
  const [acctSaved, setAcctSaved] = useState(false);

  const load = async () => {
    if (!user) return;
    const list = await repo.listPets(user.id);
    const withVax = await Promise.all(
      list.map(async (p) => ({ ...p, vaccinations: await repo.listVaccinations(p.id) })),
    );
    setPets(withVax);
    const apptList = await repo.listAppointmentsForOwner(user.id);
    setAppts(apptList);
    const upcoming = apptList.find((a) => new Date(a.scheduled_at) >= new Date() && a.status !== "done");
    setNextAppt(upcoming ?? null);
    setReminders(await repo.listReminders({ ownerId: user.id }));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const alerts = pets.flatMap((p) =>
    p.vaccinations
      .filter((v) => v.status === "overdue" || (v.status === "scheduled" && v.due_date && daysUntil(v.due_date) <= 7))
      .map((v) => ({ pet: p, vax: v })),
  );

  const events = useMemo(
    () => buildUpcomingEvents({
      now: Date.now(),
      pets,
      appointments: appts,
      vaccinations: pets.flatMap((p) => p.vaccinations),
      reminders,
      includeFeeding: true,
      labels: { service: (s) => t(`service.${s}`) },
    }),
    [pets, appts, reminders, t],
  );

  const Chevron = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 animate-fade-in flex items-end justify-between">
        <div>
          <p className="text-ink-muted">{t(`greeting.${greetingKey()}`)},</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">{user?.full_name}</h1>
        </div>
        <button
          className="btn-ghost py-2 px-3 text-sm"
          onClick={() => {
            playTap();
            setAcctPhone(pets[0]?.owner_phone ?? "");
            setAcctEmail(pets[0]?.owner_email ?? "");
            setAcctSaved(false);
            setAcctOpen(true);
          }}
        >
          <UserCog size={18} /> {t("account.title")}
        </button>
      </div>

      {/* Multi-pet quick switcher */}
      {!loading && pets.length > 0 && (
        <div className="mb-6 -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 animate-fade-in">
          {pets.map((p) => (
            <button key={p.id} onClick={() => { playTap(); navigate(`/pet/${p.id}`); }} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className="rounded-full ring-2 ring-transparent transition hover:ring-brand-300"><PetAvatar pet={p} size={56} photoFallback /></span>
              <span className="max-w-[64px] truncate text-xs font-medium text-ink">{p.name}</span>
            </button>
          ))}
          <button onClick={() => { playTap(); setAddOpen(true); }} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-line text-ink-subtle transition hover:border-brand-400 hover:text-brand-600"><Plus size={22} /></span>
            <span className="text-xs font-medium text-ink-subtle">{t("dashboard.addNew")}</span>
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map(({ pet, vax }) => {
            const overdue = vax.status === "overdue";
            const days = vax.due_date ? daysUntil(vax.due_date) : 0;
            const isDeworm = /deworm|ديدان/i.test(vax.name);
            return (
              <div
                key={vax.id}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${overdue ? "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-200" : "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-200"}`}
              >
                <AlertTriangle size={20} className="shrink-0" />
                <span className="text-sm font-medium">
                  {isDeworm
                    ? t("dashboard.dewormingDue", { name: pet.name, when: overdue ? t("common.today") : `${days} ${t("common.days")}` })
                    : t("dashboard.vaccineDue", { vaccine: vax.name, name: pet.name, days: Math.max(days, 0) })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-6">
        <NextAppointment appt={nextAppt} onChanged={load} />
      </div>

      <div className="mb-6">
        <UpcomingEvents
          events={events}
          reminders={reminders}
          scope={{ ownerId: user?.id ?? null }}
          pets={pets}
          now={Date.now()}
          loading={loading}
          onChanged={load}
          onEventClick={(e) => e.petId && navigate(`/pet/${e.petId}`)}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold text-ink">{t("dashboard.yourPets")}</h2>
        <button className="btn-primary py-2 px-4 text-sm" onClick={() => { playTap(); setAddOpen(true); }}>
          <Plus size={18} />
          {t("dashboard.addPet")}
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
      ) : pets.length === 0 ? (
        <EmptyState icon={<Plus size={26} />} title={t("dashboard.noPets")} action={<Button leftIcon={<Plus size={18} />} onClick={() => { playTap(); setAddOpen(true); }}>{t("dashboard.addPet")}</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pets.map((pet) => {
            const pct = vaccinationCompletion(pet.vaccinations);
            return (
              <button
                key={pet.id}
                onClick={() => { playTap(); navigate(`/pet/${pet.id}`); }}
                className="card flex items-center gap-4 p-4 text-start transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised active:scale-[0.99] dark:hover:border-brand-500/40"
              >
                <PetAvatar pet={pet} size={64} photoFallback />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold text-ink">{pet.name}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {t(`pet.species.${pet.species}`)}
                    {pet.breed ? ` · ${breedLabel(pet.breed, i18n.language)}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {pct}% {t("dashboard.vaccinationComplete")}
                  </p>
                </div>
                <VaccinationRing percent={pct} />
                <Chevron size={20} className="text-ink-subtle" />
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <EducationHub />
      </div>

      <AddPetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          void load();
        }}
      />

      <Modal open={acctOpen} onClose={() => setAcctOpen(false)} title={t("account.title")}>
        {user && getOwner(user.id) && (
          <div className="mb-4 flex flex-col items-center rounded-3xl bg-brand-50 p-4 text-center dark:bg-brand-500/10">
            <p className="text-sm font-bold text-brand-700 dark:text-brand-300">{t("account.qrTitle")}</p>
            <p className="mt-0.5 mb-3 max-w-xs text-xs text-ink-muted">{t("account.qrHint")}</p>
            <div className="rounded-2xl bg-white p-2">
              <QrCode value={getOwner(user.id)!.owner_token} size={160} />
            </div>
            <span className="chip mt-3 bg-surface-1 font-mono text-sm text-brand-700 dark:text-brand-300">{t("account.qrCode")}: {getOwner(user.id)!.owner_token}</span>
          </div>
        )}
        <p className="mb-4 text-sm text-ink-muted">{t("account.subtitle")}</p>
        <label className="label">{t("phone.number")}</label>
        <PhoneInput value={acctPhone} onChange={setAcctPhone} />
        <label className="label mt-4">{t("phone.email")}</label>
        <input type="email" className="input" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} placeholder="owner@email.com" />
        {acctSaved ? (
          <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-success-700"><Check size={16} /> {t("account.saved")}</p>
        ) : (
          <button
            className="btn-primary w-full mt-5"
            onClick={async () => {
              if (!user) return;
              await repo.updateOwnerContact(user.id, { owner_phone: acctPhone, owner_email: acctEmail.trim() });
              playTap();
              setAcctSaved(true);
              void load();
            }}
          >
            {t("common.save")}
          </button>
        )}
      </Modal>
    </div>
  );
}
