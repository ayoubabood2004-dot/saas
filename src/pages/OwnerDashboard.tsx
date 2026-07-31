import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, AlertTriangle, ChevronLeft, ChevronRight, UserCog, Check, Sparkles, X, PawPrint, CalendarClock, CalendarPlus, QrCode as QrIcon } from "lucide-react";
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
import { MyClinics } from "@/components/MyClinics";
import { buildUpcomingEvents } from "@/lib/events";
import { Modal } from "@/components/Modal";
import { PhoneInput } from "@/components/PhoneInput";
import { QrCode } from "@/components/QrCode";
import { Button, Skeleton, EmptyState } from "@/components/ui";
import { getOwner } from "@/lib/owners";
import { vaccinationCompletion, daysUntil } from "@/lib/utils";
import { getCached, setCached } from "@/lib/swrCache";
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
  // Pets auto-linked to this account by phone match during this session (celebration banner).
  const [autoClaimed, setAutoClaimed] = useState<Pet[]>([]);

  // سرعة الضوء: كل الجلبات تنطلق بالتوازي (مو وحدة ورا الثانية)، وآخر نسخة
  // محفوظة تنرسم لحظياً عند الرجوع للصفحة — التحديث يصير بالخفاء.
  const cacheKey = `owner_home_${user?.id ?? ""}`;
  const load = async () => {
    if (!user) return;
    const [list, apptList, rems] = await Promise.all([
      repo.listPets(user.id),
      repo.listAppointmentsForOwner(user.id).catch(() => [] as Appointment[]),
      repo.listReminders({ ownerId: user.id }).catch(() => [] as Reminder[]),
    ]);
    const withVax = await Promise.all(
      list.map(async (p) => ({ ...p, vaccinations: await repo.listVaccinations(p.id).catch(() => [] as Vaccination[]) })),
    );
    setPets(withVax);
    setAppts(apptList);
    const upcoming = apptList.find((a) => new Date(a.scheduled_at) >= new Date() && a.status !== "done");
    setNextAppt(upcoming ?? null);
    setReminders(rems);
    setCached(cacheKey, { pets: withVax, appts: apptList, reminders: rems });
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    // رسمة فورية من الكاش إن وجد — بدون أي سكيلتون
    const cached = getCached<{ pets: PetWithVax[]; appts: Appointment[]; reminders: Reminder[] }>(cacheKey);
    if (cached) {
      setPets(cached.pets);
      setAppts(cached.appts);
      const upcoming = cached.appts.find((a) => new Date(a.scheduled_at) >= new Date() && a.status !== "done");
      setNextAppt(upcoming ?? null);
      setReminders(cached.reminders);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // الربط التلقائي برقم الهاتف — بالخلفية بعد أول رسمة، فلا يؤخر الصفحة أبداً.
  useEffect(() => {
    if (!user) return;
    const acc = getOwner(user.id);
    repo.claimPetsByPhone({
      owner_id: user.id,
      phone: acc?.phone ?? user.phone,
      name: user.full_name,
      email: acc?.email ?? user.email,
    })
      .then((claimed) => {
        if (claimed.length) {
          setAutoClaimed((prev) => [...prev, ...claimed]);
          void load(); // انضافت حيوانات — حدّث القائمة
        }
      })
      .catch(() => { /* linking must never block the dashboard */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Never miss a shot: EVERY overdue vaccine (however old) + anything due within
  // a month — the old 7-day window hid upcoming doses from owners.
  const alerts = pets.flatMap((p) =>
    p.vaccinations
      .filter((v) => v.status === "overdue" || (v.status === "scheduled" && v.due_date && daysUntil(v.due_date) <= 30))
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
      {/* ── هيرو فاخر: ترحيب + نبض اليوم بلمحة ── */}
      <div className="relative mb-5 overflow-hidden rounded-3xl bg-brand-grad p-6 text-white shadow-soft animate-fade-in sm:p-7">
        <PawPrint size={150} className="pointer-events-none absolute -bottom-8 -start-8 rotate-12 text-white/10" />
        <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/75">{t(`greeting.${greetingKey()}`)}،</p>
            <h1 className="mt-0.5 font-display text-2xl font-extrabold tracking-tighter2 sm:text-3xl">{user?.full_name}</h1>
            <p className="mt-1 text-xs text-white/70">
              {new Date().toLocaleDateString(i18n.language === "ar" ? "ar-IQ" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
            onClick={() => {
              playTap();
              setAcctPhone(pets[0]?.owner_phone ?? "");
              setAcctEmail(pets[0]?.owner_email ?? "");
              setAcctSaved(false);
              setAcctOpen(true);
            }}
          >
            <UserCog size={17} /> {t("account.title")}
          </button>
        </div>
        {!loading && (
          <div className="relative mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              <PawPrint size={13} /> {t("dashboard.statPets", { n: pets.length, defaultValue: "{{n}} حيوانات" })}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur ${alerts.length ? "bg-white text-danger-600" : "bg-white/15"}`}>
              <AlertTriangle size={13} /> {alerts.length ? t("dashboard.statAlerts", { n: alerts.length, defaultValue: "{{n}} تنبيهات صحية" }) : t("dashboard.statNoAlerts", "ماكو تنبيهات 🎉")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur tabular-nums">
              <CalendarClock size={13} />
              {nextAppt
                ? t("dashboard.statNextAppt", {
                    when: new Date(nextAppt.scheduled_at).toLocaleDateString(i18n.language === "ar" ? "ar-IQ" : "en-US", { weekday: "long", day: "numeric", month: "short" }),
                    defaultValue: "موعدك القادم: {{when}}",
                  })
                : t("dashboard.statNoAppt", "ماكو موعد قادم")}
            </span>
          </div>
        )}
      </div>

      {/* ── إجراءات سريعة ── */}
      <div className="mb-6 grid grid-cols-3 gap-2.5 animate-fade-in">
        <button
          onClick={() => { playTap(); navigate("/book"); }}
          className="card flex flex-col items-center gap-1.5 p-3.5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised dark:hover:border-brand-500/40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><CalendarPlus size={19} /></span>
          <span className="text-xs font-semibold text-ink">{t("dashboard.quickBook", "حجز موعد")}</span>
        </button>
        <button
          onClick={() => { playTap(); setAddOpen(true); }}
          className="card flex flex-col items-center gap-1.5 p-3.5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised dark:hover:border-brand-500/40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"><Plus size={19} /></span>
          <span className="text-xs font-semibold text-ink">{t("dashboard.addPet")}</span>
        </button>
        <button
          onClick={() => {
            playTap();
            setAcctPhone(pets[0]?.owner_phone ?? "");
            setAcctEmail(pets[0]?.owner_email ?? "");
            setAcctSaved(false);
            setAcctOpen(true);
          }}
          className="card flex flex-col items-center gap-1.5 p-3.5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised dark:hover:border-brand-500/40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"><QrIcon size={19} /></span>
          <span className="text-xs font-semibold text-ink">{t("dashboard.myCode", "رمزي للعيادة")}</span>
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

      {autoClaimed.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-success-50 px-4 py-3 text-success-700 animate-fade-in dark:bg-success-500/10 dark:text-success-200">
          <Sparkles size={20} className="mt-0.5 shrink-0" />
          <p className="flex-1 text-sm font-medium">
            {t("dashboard.autoClaimed", {
              count: autoClaimed.length,
              names: autoClaimed.map((p) => p.name).join("، "),
            })}
          </p>
          <button
            className="shrink-0 rounded-lg p-1 text-success-700/70 transition hover:bg-success-100 dark:text-success-200/70 dark:hover:bg-success-500/20"
            onClick={() => setAutoClaimed([])}
            aria-label={t("common.close")}
          >
            <X size={16} />
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

      {!loading && (
        <div className="mb-6">
          <MyClinics pets={pets} />
        </div>
      )}

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
