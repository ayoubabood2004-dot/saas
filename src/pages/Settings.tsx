import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings as SettingsIcon, RotateCcw, Check, Volume2, VolumeX, Plus, Trash2, Pill, PawPrint, Stethoscope, Tag, FolderPlus } from "lucide-react";
import type { Species, Service, ServiceCategory, ServiceCatalog } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { getServiceCatalog, addServiceCategory, removeServiceCategory, addService, updateService, removeService } from "@/lib/services";
import { DEFAULT_RANGES, VITAL_KEYS, CBC_KEYS, rangeFor, type VitalKey } from "@/lib/vitals";

const ALL_KEYS: VitalKey[] = [...VITAL_KEYS, ...CBC_KEYS];
import { setVitalOverride, clearVitalOverrides, getDialCode, setDialCode } from "@/lib/settings";
import { isSoundEnabled, setSoundEnabled, playSuccess, playTap } from "@/lib/sounds";
import { getClinicMeds, addClinicMed, removeClinicMed, allMedTypes, allMedicationNames, BUILTIN_MEDICATIONS, type ClinicMed } from "@/lib/meds";
import { getClinicVaccines, addClinicVaccine, removeClinicVaccine, BUILTIN_VACCINES, type ClinicVaccine } from "@/lib/vaccines";
import { getClinicBreeds, addClinicBreed, removeClinicBreed } from "@/lib/breeds";
import { SpeciesPicker } from "@/components/PetFields";
import { Button } from "@/components/ui";

export function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isStaff = user?.role !== "owner";
  const [species, setSpecies] = useState<Species>("dog");
  // version bumps force re-read of effective ranges after save/reset
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<Record<VitalKey, { min: string; max: string }>>(() => readDraft("dog"));
  const [savedFlash, setSavedFlash] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const [dialCode, setDial] = useState(getDialCode());

  function readDraft(sp: Species): Record<VitalKey, { min: string; max: string }> {
    const out = {} as Record<VitalKey, { min: string; max: string }>;
    for (const k of ALL_KEYS) {
      const r = rangeFor(sp, k);
      out[k] = { min: String(r.min), max: String(r.max) };
    }
    return out;
  }

  const changeSpecies = (sp: Species) => {
    setSpecies(sp);
    setDraft(readDraft(sp));
    setSavedFlash(false);
  };

  const save = () => {
    for (const k of ALL_KEYS) {
      const min = Number(draft[k].min);
      const max = Number(draft[k].max);
      if (!Number.isNaN(min) && !Number.isNaN(max) && max > min) {
        setVitalOverride(species, k, { min, max });
      }
    }
    setVersion((v) => v + 1);
    playSuccess();
    setSavedFlash(true);
  };

  const reset = () => {
    clearVitalOverrides(species);
    setDraft(readDraft(species));
    setVersion((v) => v + 1);
    playTap();
    setSavedFlash(false);
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) playTap();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" key={version}>
      <div className="mb-1 flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><SettingsIcon size={20} /></span>
        <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("settings.title")}</h1>
      </div>
      <p className="mb-6 text-sm text-ink-muted">{t("settings.subtitle")}</p>

      <div className="card p-5 mb-4">
        <h2 className="font-bold text-ink mb-3">{t("settings.readingRanges")}</h2>

        <label className="label">{t("settings.species")}</label>
        <div className="mb-4">
          <SpeciesPicker value={species} onChange={changeSpecies} />
        </div>

        {([["reading.vitals", VITAL_KEYS], ["reading.cbc", CBC_KEYS]] as const).map(([title, keys]) => (
          <div key={title} className="mb-4">
            <p className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">{t(title)}</p>
            <div className="space-y-3">
              {keys.map((k) => {
                const unit = DEFAULT_RANGES[species][k].unit;
                return (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium text-ink leading-tight">{t(`reading.${k}`)}</p>
                      <p className="text-[11px] text-ink-subtle">{unit}</p>
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-ink-subtle">{t("settings.min")}</label>
                      <input
                        type="number" step="0.1" className="input py-2"
                        value={draft[k].min}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], min: e.target.value } }))}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-ink-subtle">{t("settings.max")}</label>
                      <input
                        type="number" step="0.1" className="input py-2"
                        value={draft[k].max}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], max: e.target.value } }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-5 flex items-center gap-3">
          <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={16} />} onClick={reset}>{t("settings.reset")}</Button>
          <Button className="flex-1" onClick={save}>{t("common.save")}</Button>
        </div>
        {savedFlash && (
          <p className="text-sm text-brand-700 font-medium mt-3 flex items-center gap-1.5">
            <Check size={16} /> {t("settings.saved")}
          </p>
        )}
      </div>

      {isStaff && <ServiceSettings />}
      <ClinicMedications />
      <ClinicVaccinations />
      <ClinicBreeds />

      <div className="card p-5">
        <h2 className="font-bold text-ink mb-3">{t("settings.preferences")}</h2>
        <div className="flex items-center justify-between mb-4">
          <span className="text-ink">{t("settings.sound")}</span>
          <button className={`chip ${sound ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-ink-muted"}`} onClick={toggleSound}>
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {sound ? t("settings.soundOn") : t("settings.soundOff")}
          </button>
        </div>
        <div className="border-t border-line pt-4">
          <label className="label">{t("settings.dialCode")}</label>
          <input
            className="input w-40"
            value={dialCode}
            inputMode="tel"
            onChange={(e) => setDial(e.target.value)}
            onBlur={() => { setDialCode(dialCode); setDial(getDialCode()); playTap(); }}
          />
          <p className="text-xs text-ink-subtle mt-1.5">{t("settings.dialCodeHint")}</p>
        </div>
      </div>
    </div>
  );
}

function ClinicMedications() {
  const { t } = useTranslation();
  const types = allMedTypes();
  const [name, setName] = useState("");
  const [type, setType] = useState(types[0] ?? "Other");
  const [clinic, setClinic] = useState<ClinicMed[]>(getClinicMeds());
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const total = BUILTIN_MEDICATIONS.length + clinic.length;

  const add = () => {
    if (!name.trim()) return;
    const ok = addClinicMed(name, type);
    setClinic(getClinicMeds());
    if (ok) { playSuccess(); setFlash({ ok: true, msg: t("meds.added") }); setName(""); }
    else { playTap(); setFlash({ ok: false, msg: t("meds.exists") }); }
  };

  const remove = (n: string) => { removeClinicMed(n); setClinic(getClinicMeds()); playTap(); };

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Pill size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("meds.title")}</h2>
        <span className="chip bg-surface-2 text-ink-muted text-xs ms-auto">{t("meds.count", { n: total })}</span>
      </div>
      <p className="text-xs text-ink-subtle mb-4">{t("meds.subtitle")}</p>

      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <label className="label">{t("meds.name")}</label>
          <input list="all-med-options" className="input py-2" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <div>
          <label className="label">{t("meds.type")}</label>
          <select className="input py-2" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
        </div>
        <button className="btn-primary py-2.5" onClick={add}><Plus size={16} /> {t("meds.add")}</button>
      </div>
      <datalist id="all-med-options">
        {allMedicationNames().map((m) => <option key={m} value={m} />)}
      </datalist>

      {flash && (
        <p className={`text-sm mt-2 flex items-center gap-1.5 ${flash.ok ? "text-brand-700" : "text-warn-600"}`}>
          <Check size={15} /> {flash.msg}
        </p>
      )}

      {clinic.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-muted mb-2">{t("meds.clinicAdded")}</p>
          <div className="flex flex-wrap gap-2">
            {clinic.map((m) => (
              <span key={m.name} className="chip bg-sky-50 text-sm text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {m.name}
                <span className="text-[10px] text-sky-400">· {m.type}</span>
                <button className="ms-1 text-sky-300 hover:text-danger-500" onClick={() => remove(m.name)} aria-label={t("meds.remove")}>
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClinicBreeds() {
  const { t } = useTranslation();
  const [sp, setSp] = useState<Species>("dog");
  const [name, setName] = useState("");
  const [list, setList] = useState<string[]>(getClinicBreeds("dog"));
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const changeSp = (s: Species) => { setSp(s); setList(getClinicBreeds(s)); setFlash(null); setName(""); };
  const add = () => {
    if (!name.trim()) return;
    const ok = addClinicBreed(sp, name);
    setList(getClinicBreeds(sp));
    if (ok) { playSuccess(); setFlash({ ok: true, msg: t("breeds.added") }); setName(""); }
    else { playTap(); setFlash({ ok: false, msg: t("breeds.exists") }); }
  };
  const remove = (n: string) => { removeClinicBreed(sp, n); setList(getClinicBreeds(sp)); playTap(); };

  return (
    <div className="card p-5 mb-4">
      <div className="mb-1 flex items-center gap-2">
        <PawPrint size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("breeds.title")}</h2>
      </div>
      <p className="mb-4 text-xs text-ink-subtle">{t("breeds.subtitle")}</p>

      <label className="label">{t("settings.species")}</label>
      <div className="mb-3">
        <SpeciesPicker value={sp} onChange={changeSp} />
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label">{t("breeds.name")}</label>
          <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("breeds.placeholder", "e.g. Saluki")} />
        </div>
        <button className="btn-primary py-2.5" onClick={add}><Plus size={16} /> {t("breeds.add")}</button>
      </div>

      {flash && (
        <p className={`mt-2 flex items-center gap-1.5 text-sm ${flash.ok ? "text-brand-700" : "text-warn-600"}`}>
          <Check size={15} /> {flash.msg}
        </p>
      )}

      {list.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-ink-muted">{t("breeds.clinicAdded")}</p>
          <div className="flex flex-wrap gap-2">
            {list.map((b) => (
              <span key={b} className="chip bg-sky-50 text-sm text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {b}
                <button className="ms-1 text-sky-300 transition hover:text-danger-500" onClick={() => remove(b)} aria-label={t("breeds.remove")}>
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Services & non-barcode items ---------------- */
function ServiceSettings() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  const [catName, setCatName] = useState("");
  const refresh = () => setCatalog(getServiceCatalog());

  const addCat = () => {
    if (!catName.trim()) return;
    const ok = addServiceCategory(catName);
    if (ok) { playSuccess(); setCatName(""); refresh(); } else { playTap(); }
  };

  return (
    <div className="card p-5 mb-4">
      <div className="mb-1 flex items-center gap-2">
        <Stethoscope size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("services.title", "Services & non-barcode items")}</h2>
        <span className="chip bg-surface-2 text-ink-muted text-xs ms-auto">{t("services.count", { n: catalog.services.length, defaultValue: "{{n}} services" })}</span>
      </div>
      <p className="mb-4 text-xs text-ink-subtle">{t("services.subtitle", "CBC tests, X-rays, consultations, grooming… these appear in the POS for one-tap billing.")}</p>

      {/* Add category */}
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="label">{t("services.newCategory", "New category")}</label>
          <input className="input py-2" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} placeholder={t("services.categoryPh", "e.g. Laboratory, Imaging, Dentistry")} />
        </div>
        <button className="btn-primary py-2.5" onClick={addCat}><FolderPlus size={16} /> {t("services.addCategory", "Add category")}</button>
      </div>

      {catalog.categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-subtle">{t("services.empty", "No categories yet. Create one to start adding services.")}</div>
      ) : (
        <div className="space-y-3">
          {catalog.categories.map((cat) => (
            <CategoryBlock key={cat.id} cat={cat} services={catalog.services.filter((s) => s.category_id === cat.id)} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryBlock({ cat, services, onChanged }: { cat: ServiceCategory; services: Service[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const add = () => {
    if (!name.trim()) return;
    addService(cat.id, name, Number(price) || 0);
    playSuccess();
    setName(""); setPrice("");
    onChanged();
  };

  const delCategory = () => {
    if (!window.confirm(t("services.confirmDelCat", { name: cat.name, defaultValue: `Delete "${cat.name}" and its ${services.length} service(s)?` }))) return;
    removeServiceCategory(cat.id);
    playTap();
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><Tag size={14} className="text-brand-600" /> {cat.name}</span>
        <button onClick={delCategory} aria-label={t("common.delete", "Delete")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
      </div>

      {services.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {services.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
              <div className="flex items-center gap-1 text-sm text-ink-muted">
                <span className="text-xs">$</span>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  defaultValue={s.price}
                  onBlur={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) { updateService(s.id, { price: v }); onChanged(); } }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-lg border border-line bg-surface-1 px-2 py-1 text-end text-sm font-semibold tabular-nums text-ink outline-none focus:border-brand-400"
                />
              </div>
              <button onClick={() => { removeService(s.id); playTap(); onChanged(); }} aria-label={t("common.delete", "Delete")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Add service to this category */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("services.servicePh", "Service name (e.g. CBC Test)")} />
        </div>
        <div className="w-24">
          <input type="number" min="0" step="0.01" inputMode="decimal" className="input py-2 text-end" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("services.price", "Price")} />
        </div>
        <button className="btn-secondary py-2.5" onClick={add}><Plus size={16} /></button>
      </div>
    </div>
  );
}

function ClinicVaccinations() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [scientific, setScientific] = useState("");
  const [clinic, setClinic] = useState<ClinicVaccine[]>(getClinicVaccines());
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const total = BUILTIN_VACCINES.length + clinic.length;

  const add = () => {
    if (!name.trim()) return;
    const ok = addClinicVaccine(name, scientific);
    setClinic(getClinicVaccines());
    if (ok) { playSuccess(); setFlash({ ok: true, msg: t("vax.added") }); setName(""); setScientific(""); }
    else { playTap(); setFlash({ ok: false, msg: t("vax.exists") }); }
  };
  const remove = (n: string) => { removeClinicVaccine(n); setClinic(getClinicVaccines()); playTap(); };

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Pill size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("vax.title")}</h2>
        <span className="chip bg-surface-2 text-ink-muted text-xs ms-auto">{t("vax.count", { n: total })}</span>
      </div>
      <p className="text-xs text-ink-subtle mb-4">{t("vax.subtitle")}</p>

      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="label">{t("vax.name")}</label>
          <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("vax.scientific")}</label>
          <input list="all-vax-options" className="input py-2" value={scientific} onChange={(e) => setScientific(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary py-2 mt-3" onClick={add}><Plus size={16} /> {t("vax.add")}</button>
      <datalist id="all-vax-options">
        {BUILTIN_VACCINES.map((v) => <option key={v} value={v} />)}
      </datalist>

      {flash && (
        <p className={`text-sm mt-2 flex items-center gap-1.5 ${flash.ok ? "text-brand-700" : "text-warn-600"}`}>
          <Check size={15} /> {flash.msg}
        </p>
      )}

      {clinic.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-muted mb-2">{t("vax.clinicAdded")}</p>
          <div className="flex flex-wrap gap-2">
            {clinic.map((v) => (
              <span key={v.name} className="chip bg-sky-50 text-sm text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {v.name}
                <span className="text-[10px] text-sky-400">→ {v.scientific}</span>
                <button className="ms-1 text-sky-300 hover:text-danger-500" onClick={() => remove(v.name)}>
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
