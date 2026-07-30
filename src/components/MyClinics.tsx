import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, MapPin, Phone, CalendarPlus, MessageCircle } from "lucide-react";
import type { Pet, ClinicInfo } from "@/types";
import { repo } from "@/lib/repo";
import { waNumber } from "@/lib/phone";
import { playTap } from "@/lib/sounds";

/**
 * «عيادات حيواناتي» — the clinics currently treating this owner's pets, derived
 * from the pets' clinic links (no manual subscription step). Privacy holds both
 * ways: only clinics that actually have the owner's pets appear, and only the
 * clinic's public card (name/city/phone) is shown.
 */
export function MyClinics({ pets }: { pets: Pet[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<ClinicInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // clinic id → the owner's pets treated there
  const byClinic = useMemo(() => {
    const m = new Map<string, Pet[]>();
    for (const p of pets) {
      if (!p.clinic_id) continue;
      m.set(p.clinic_id, [...(m.get(p.clinic_id) ?? []), p]);
    }
    return m;
  }, [pets]);

  useEffect(() => {
    if (byClinic.size === 0) { setLoaded(true); return; }
    let alive = true;
    repo.listClinicDirectory()
      .then((dir) => { if (alive) setDirectory(dir); })
      .catch(() => { /* directory unavailable — placeholder names below */ })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [byClinic.size]);

  if (!loaded || byClinic.size === 0) return null;

  const rows = [...byClinic.entries()].map(([id, clinicPets]) => {
    const info = directory.find((c) => c.id === id);
    return { id, name: info?.name ?? t("dashboard.aClinic", "عيادة حيواناتك"), city: info?.city, phone: info?.phone, pets: clinicPets };
  });

  return (
    <div className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Building2 size={19} className="text-brand-600" /> {t("dashboard.myClinics", "عيادات حيواناتي")}
      </h2>
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{c.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                {c.city && <span className="flex items-center gap-1"><MapPin size={12} /> {c.city}</span>}
                <span>{t("dashboard.clinicTreats", { names: c.pets.map((p) => p.name).join("، "), defaultValue: "يعالجون: {{names}}" })}</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {c.phone && (
                <a
                  href={`https://wa.me/${waNumber(c.phone, "+964")}`}
                  target="_blank" rel="noreferrer"
                  onClick={() => playTap()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-success-600"
                >
                  <MessageCircle size={14} /> {t("dashboard.waClinic", "واتساب")}
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  onClick={() => playTap()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink transition hover:border-brand-300 hover:text-brand-600"
                >
                  <Phone size={14} /> {t("dashboard.callClinic", "اتصال")}
                </a>
              )}
              <button
                onClick={() => { playTap(); navigate("/book"); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-brand-700"
              >
                <CalendarPlus size={14} /> {t("dashboard.bookAtClinic", "حجز موعد")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
