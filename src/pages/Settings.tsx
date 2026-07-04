import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings as SettingsIcon, RotateCcw, Check, Volume2, VolumeX, Plus, Trash2, Pill, PawPrint, Stethoscope, Tag, FolderPlus, BadgePercent, IdCard, Mail, UserCog, Image as ImageIcon, Upload, Facebook, Instagram, Building2 } from "lucide-react";
import type { Species, Service, ServiceCategory, ServiceCatalog, Product } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { branchStore, useBranchState } from "@/lib/branchStore";
import { repo } from "@/lib/repo";
import { Combobox } from "@/components/Combobox";
import { cn, currencySymbol } from "@/lib/utils";
import { getPromoRules, addPromoRule, togglePromoRule, removePromoRule, subcategoriesOf, type PromoRule } from "@/lib/promotions";
import { getServiceCatalog, addServiceCategory, removeServiceCategory, addService, updateService, removeService } from "@/lib/services";
import { DEFAULT_RANGES, VITAL_KEYS, CBC_KEYS, rangeFor, type VitalKey } from "@/lib/vitals";

const ALL_KEYS: VitalKey[] = [...VITAL_KEYS, ...CBC_KEYS];
import { setVitalOverride, clearVitalOverrides, getDialCode, setDialCode, getClinicLogo, setClinicLogo, getClinicSocials, setClinicSocials, getClinicName, setClinicName } from "@/lib/settings";
import { prepareUpload } from "@/lib/image";
import { isSoundEnabled, setSoundEnabled, playSuccess, playTap } from "@/lib/sounds";
import { getClinicMeds, addClinicMed, removeClinicMed, allMedTypes, allMedicationNames, BUILTIN_MEDICATIONS, type ClinicMed } from "@/lib/meds";
import { getClinicVaccines, addClinicVaccine, removeClinicVaccine, BUILTIN_VACCINES, type ClinicVaccine } from "@/lib/vaccines";
import { getClinicBreeds, addClinicBreed, removeClinicBreed } from "@/lib/breeds";
import { SpeciesPicker } from "@/components/PetFields";
import { PhoneInput } from "@/components/PhoneInput";
import { Button, useToast } from "@/components/ui";

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

      <AccountInfo />

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

      {isStaff && <ClinicIdentity />}
      {isStaff && <BranchesManager />}
      {isStaff && <ServiceSettings />}
      {isStaff && <PromotionsManager clinicId={user?.clinic_id ?? user?.id} />}
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

/* ---------------- Logged-in account info (editable name + phone) --------- */
function AccountInfo() {
  const { t } = useTranslation();
  const { user, activeRole, updateProfile } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!user) return null;
  const dirty = name.trim() !== (user.full_name ?? "").trim() || phone.trim() !== (user.phone ?? "").trim();

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setFlash(null);
    const { error } = await updateProfile({ full_name: name, phone });
    setBusy(false);
    if (error) { playTap(); setFlash({ ok: false, msg: t("account.saveFail") }); }
    else { playSuccess(); setFlash({ ok: true, msg: t("account.saved") }); }
  };

  return (
    <div className="card p-5 mb-4">
      <div className="mb-1 flex items-center gap-2">
        <IdCard size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("account.infoTitle")}</h2>
      </div>
      <p className="mb-4 text-xs text-ink-subtle">{t("account.infoSubtitle")}</p>

      {/* Identity at a glance */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="chip bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <UserCog size={13} /> {t(`role.${user.role}`)}
        </span>
        <span className="chip bg-surface-2 text-xs text-ink-muted">
          {activeRole === "owner" ? t("account.typeOwner") : t("account.typeClinic")}
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">{t("account.name")}</label>
          <input className="input py-2" value={name} onChange={(e) => { setName(e.target.value); setFlash(null); }} />
        </div>
        <div>
          <label className="label">{t("account.email")}</label>
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
            <Mail size={15} className="shrink-0 text-ink-subtle" />
            <span className="min-w-0 flex-1 truncate" dir="ltr">{user.email || "—"}</span>
          </div>
          <p className="mt-1 text-2xs text-ink-subtle">{t("account.emailLocked")}</p>
        </div>
        <div>
          <label className="label">{t("account.phone")}</label>
          <PhoneInput value={phone} onChange={(v) => { setPhone(v); setFlash(null); }} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button className="flex-1" onClick={save} loading={busy} disabled={!dirty || !name.trim()}>{t("account.save")}</Button>
      </div>
      {flash && (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${flash.ok ? "text-brand-700" : "text-warn-600"}`}>
          <Check size={15} /> {flash.msg}
        </p>
      )}
    </div>
  );
}

/* ---------------- Branches: the clinic's physical locations -------------
 * Manager-only. Creating the FIRST extra branch also creates the main-branch
 * row ("الفرع الرئيسي") so all existing data (branch_id NULL) keeps a visible
 * home. Phase 1 supports add + rename; removing/merging branches ships later
 * with a proper "move cases" flow so data can never be stranded. */
function BranchesManager() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id;
  const { branches, hydrated } = useBranchState(clinicId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (!can("manageSettings")) return null;

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (branches.some((b) => b.name.trim() === trimmed)) {
      toast.error(t("branches.dup", "يوجد فرع بهذا الاسم مسبقاً."));
      return;
    }
    setBusy(true);
    try {
      // First extra branch → materialise the main branch first so pre-branches
      // data (branch_id NULL) has a named home in the switcher.
      if (branches.length === 0) {
        await repo.createBranch({ name: t("branches.main", "الفرع الرئيسي"), is_main: true, is_active: true });
      }
      await repo.createBranch({ name: trimmed, is_main: false, is_active: true });
      await branchStore.refresh();
      setName("");
      playSuccess();
    } catch (e) {
      toast.error(t("branches.addFail", "تعذّر إضافة الفرع، حاول مجدداً."), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  const rename = async (id: string) => {
    const trimmed = editName.trim();
    setEditingId(null);
    if (!trimmed) return;
    const current = branches.find((b) => b.id === id);
    if (!current || current.name === trimmed) return;
    try {
      await repo.updateBranch(id, { name: trimmed });
      await branchStore.refresh();
      playSuccess();
    } catch {
      toast.error(t("branches.renameFail", "تعذّرت إعادة التسمية، حاول مجدداً."));
    }
  };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><Building2 size={18} className="text-brand-600" /> {t("branches.title", "فروع العيادة")}</h2>
      <p className="text-xs text-ink-subtle mb-4">
        {t("branches.hint", "أضف فروعك (مواقع العيادة) ليظهر مبدّل الفروع للفريق — كل فرع يشوف حالاته، وكل بياناتك الحالية تبقى تابعة للفرع الرئيسي.")}
      </p>

      {/* Existing branches (or the implicit single-branch state) */}
      <div className="mb-4 space-y-2">
        {hydrated && branches.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-line bg-surface-2/50 px-3.5 py-3">
            <Building2 size={16} className="shrink-0 text-ink-subtle" />
            <p className="text-sm text-ink-muted">{t("branches.single", "عيادتك تعمل حالياً بفرع واحد — أضف فرعاً ثانياً لتفعيل تعدد الفروع.")}</p>
          </div>
        )}
        {branches.map((b) => (
          <div key={b.id} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-1 px-3.5 py-2.5">
            <Building2 size={16} className={cn("shrink-0", b.is_main ? "text-brand-600 dark:text-brand-300" : "text-ink-subtle")} />
            {editingId === b.id ? (
              <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void rename(b.id); }}>
                <input autoFocus className="input h-9 flex-1 py-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => void rename(b.id)} />
              </form>
            ) : (
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{b.name}</p>
            )}
            {b.is_main && <span className="chip shrink-0 bg-brand-50 text-2xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("branches.mainBadge", "الرئيسي")}</span>}
            {editingId !== b.id && (
              <button
                onClick={() => { playTap(); setEditingId(b.id); setEditName(b.name); }}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-2xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
              >
                {t("branches.rename", "إعادة تسمية")}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add branch */}
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input
          className="input h-10 flex-1 text-sm"
          placeholder={t("branches.namePh", "اسم الفرع الجديد — مثلاً: فرع المنصور")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button size="sm" type="submit" loading={busy} disabled={!name.trim()} leftIcon={<Plus size={15} />}>
          {t("branches.add", "إضافة فرع")}
        </Button>
      </form>
      {branches.length === 0 && name.trim() && (
        <p className="mt-2 text-2xs text-ink-subtle">{t("branches.firstNote", "عند الإضافة سيُنشأ تلقائياً «الفرع الرئيسي» ويضم كل بياناتك الحالية.")}</p>
      )}
    </div>
  );
}

/* ---------------- Clinic identity: logo + social handles ---------------- */
function ClinicIdentity() {
  const { t } = useTranslation();
  const toast = useToast();
  const [logo, setLogo] = useState<string | null>(getClinicLogo());
  const [busy, setBusy] = useState(false);
  const initial = getClinicSocials();
  const [facebook, setFacebook] = useState(initial.facebook);
  const [instagram, setInstagram] = useState(initial.instagram);
  const [name, setName] = useState(getClinicName());

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      // Compress to a small square-ish logo; store the data-URL (same as avatars).
      const prepared = await prepareUpload(f, { maxDim: 400, quality: 0.9 });
      setClinicLogo(prepared.dataUrl);
      setLogo(prepared.dataUrl);
      playSuccess();
    } catch {
      toast.error("تعذّر رفع الشعار", "اختر صورة صالحة (PNG/JPG).");
    } finally { setBusy(false); }
  };

  const removeLogo = () => { setClinicLogo(null); setLogo(null); playTap(); };
  const saveSocials = () => { setClinicSocials({ facebook, instagram }); playTap(); };
  const saveName = () => { setClinicName(name); playTap(); };

  return (
    <div className="card p-5">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><ImageIcon size={18} className="text-brand-600" /> {t("settings.identity", "هوية العيادة")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("settings.identityHint", "اسم العيادة وشعارها يظهران في أعلى الفاتورة ونماذج الإقرار وكعلامة مائية، وحسابات التواصل تظهر في الأسفل.")}</p>

      {/* Clinic name */}
      <div className="mb-5">
        <label className="label">{t("settings.clinicName", "اسم العيادة")}</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          placeholder={t("settings.clinicNamePlaceholder", "مثال: عيادة الرحمة البيطرية")}
        />
        <p className="text-xs text-ink-subtle mt-1">{t("settings.clinicNameHint", "يظهر في ترويسة الفاتورة ونماذج الإقرار ورسائل واتساب بدل اسم الموقع.")}</p>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2">
          {logo ? <img src={logo} alt="logo" className="h-full w-full object-contain" /> : <ImageIcon size={26} className="text-ink-subtle/50" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer text-sm">
            <Upload size={15} /> {logo ? t("settings.changeLogo", "تغيير الشعار") : t("settings.uploadLogo", "رفع شعار")}
            <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} />
          </label>
          {logo && <button onClick={removeLogo} className="chip bg-surface-2 text-xs font-semibold text-danger-600 hover:bg-danger-50"><Trash2 size={14} /> {t("common.remove", "إزالة")}</button>}
        </div>
      </div>

      {/* Social handles */}
      <div className="mt-5 space-y-3 border-t border-line pt-4">
        <div>
          <label className="label flex items-center gap-1.5"><Facebook size={14} className="text-[#1877f2]" /> {t("settings.facebook", "فيسبوك")}</label>
          <input className="input" dir="ltr" value={facebook} onChange={(e) => setFacebook(e.target.value)} onBlur={saveSocials} placeholder="@MyClinic" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Instagram size={14} className="text-[#e1306c]" /> {t("settings.instagram", "إنستغرام")}</label>
          <input className="input" dir="ltr" value={instagram} onChange={(e) => setInstagram(e.target.value)} onBlur={saveSocials} placeholder="@myclinic" />
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

/* ---------------- Mix & Match promotions ---------------- */
function PromotionsManager({ clinicId }: { clinicId?: string }) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PromoRule[]>(() => getPromoRules());
  const [subcats, setSubcats] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [qty, setQty] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  // Suggest the subcategories that actually exist on the clinic's products.
  useEffect(() => {
    let on = true;
    repo.listProducts(clinicId).then((p: Product[]) => { if (on) setSubcats(subcategoriesOf(p)); }).catch(() => { /* ignore */ });
    return () => { on = false; };
  }, [clinicId]);

  const refresh = () => setRules(getPromoRules());
  const add = () => {
    const rule = addPromoRule({ name, subcategory, qty: Number(qty) || 0, bundlePrice: Number(bundlePrice) || 0 });
    if (rule) {
      playSuccess();
      setName(""); setSubcategory(""); setQty(""); setBundlePrice("");
      setFlash({ ok: true, msg: t("promos.added") });
      refresh();
    } else {
      playTap();
      setFlash({ ok: false, msg: t("promos.invalid") });
    }
  };
  const toggle = (id: string) => { togglePromoRule(id); playTap(); refresh(); };
  const remove = (id: string) => { removePromoRule(id); playTap(); refresh(); };

  return (
    <div className="card p-5 mb-4">
      <div className="mb-1 flex items-center gap-2">
        <BadgePercent size={18} className="text-brand-600" />
        <h2 className="font-bold text-ink">{t("promos.title")}</h2>
      </div>
      <p className="mb-4 text-xs text-ink-subtle">{t("promos.subtitle")}</p>

      <div className="space-y-2">
        <div>
          <label className="label">{t("promos.name")}</label>
          <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("promos.namePh", "e.g. Canned 3 for 5,000")} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label">{t("promos.subcategory")}</label>
            <Combobox value={subcategory} onChange={setSubcategory} options={subcats} placeholder={t("promos.subcategoryPh", "e.g. canned")} createLabel={(q) => t("promos.subcategoryCreate", { value: q, defaultValue: `Use “${q}”` })} />
          </div>
          <div>
            <label className="label">{t("promos.qty")}</label>
            <input type="number" inputMode="numeric" min="1" step="1" className="input py-2" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="3" />
          </div>
          <div>
            <label className="label">{t("promos.bundlePrice")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input py-2" value={bundlePrice} onChange={(e) => setBundlePrice(e.target.value)} placeholder="5000" />
          </div>
        </div>
        <button className="btn-primary w-full py-2.5" onClick={add}><Plus size={16} /> {t("promos.add")}</button>
      </div>

      {flash && (
        <p className={`mt-2 flex items-center gap-1.5 text-sm ${flash.ok ? "text-brand-700" : "text-warn-600"}`}>
          <Check size={15} /> {flash.msg}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {rules.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t("promos.empty")}</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className={cn("flex items-center gap-3 rounded-2xl border p-3", r.active ? "border-line bg-surface-1" : "border-line bg-surface-2 opacity-70")}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{r.name}</p>
                <p className="text-xs text-ink-muted">{t("promos.ruleSummary", { qty: r.qty, price: r.bundlePrice.toLocaleString("en-US"), sub: r.subcategory, defaultValue: "{{qty}} for {{price}} · {{sub}}" })}</p>
              </div>
              <button onClick={() => toggle(r.id)} className={cn("chip text-xs", r.active ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-muted")}>
                {r.active ? t("promos.active") : t("promos.inactive")}
              </button>
              <button onClick={() => remove(r.id)} aria-label={t("promos.delete")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15">
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
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
                <input
                  type="number" min="0" step="1" inputMode="numeric"
                  defaultValue={s.price}
                  onBlur={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) { updateService(s.id, { price: v }); onChanged(); } }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-24 rounded-lg border border-line bg-surface-1 px-2 py-1 text-end text-sm font-semibold tabular-nums text-ink outline-none focus:border-brand-400"
                />
                <span className="text-2xs text-ink-subtle">{currencySymbol()}</span>
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
          <input type="number" min="0" step="1" inputMode="numeric" className="input py-2 text-end" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("services.price", "Price")} />
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
