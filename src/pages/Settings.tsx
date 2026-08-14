import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings as SettingsIcon, RotateCcw, Check, Volume2, VolumeX, Plus, Trash2, Pill, PawPrint, Stethoscope, Tag, FolderPlus, BadgePercent, IdCard, Mail, UserCog, Image as ImageIcon, Upload, Facebook, Instagram, Building2, Printer, Type, LogOut , Slice, ChevronDown, Radio, Copy, Download, Cable, Send, Barcode, Search, Package, Share2, ShieldAlert, MessageCircle, Gauge, CalendarClock } from "lucide-react";
import type { LabDeviceLink } from "@/types";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { makeZip } from "@/lib/zip";
import labBridgeAppSource from "@/assets/lab-bridge.app.mjs?raw";
import type { Species, Service, ServiceCategory, ServiceCatalog, Product } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { branchStore, useBranchState } from "@/lib/branchStore";
import { repo } from "@/lib/repo";
import { Combobox } from "@/components/Combobox";
import { cn, currencySymbol , formatNum, uuid, money, formatDate } from "@/lib/utils";
import { getPromoRules, addPromoRule, togglePromoRule, removePromoRule, subcategoriesOf, type PromoRule } from "@/lib/promotions";
import { getServiceCatalog, addServiceCategory, removeServiceCategory, addService, updateService, removeService, serviceBarcodeTaken } from "@/lib/services";
import { DEFAULT_RANGES, VITAL_KEYS, CBC_KEYS, rangeFor, type VitalKey } from "@/lib/vitals";

const ALL_KEYS: VitalKey[] = [...VITAL_KEYS, ...CBC_KEYS];
import { setVitalOverride, clearVitalOverrides, getDialCode, setDialCode, getClinicLogo, setClinicLogo, getClinicSocials, setClinicSocials, getClinicName, setClinicName, getPreSalePrint, setPreSalePrint, getResizableCart, setResizableCart, getFontScaleEnabled, setFontScaleEnabled, getDeliveryZones, setDeliveryZones, type DeliveryZone, getQtyPromos, setQtyPromos, promoTargetLabel, getCatalogShare, setCatalogShare, type QtyPromo, type PromoKind, type PromoMode } from "@/lib/settings";
import { FONT_SCALES, getFontScale, setFontScale, applyFontScale, getCrispMode, setCrispMode, type FontScaleId } from "@/lib/fontScale";
import { RECEIPT_WIDTHS, getReceiptWidth, setReceiptWidth, openReceiptCalibration } from "@/lib/printer";
import { catalogStats } from "@/lib/catalog";
import { fetchQuota, type QuotaUsage } from "@/lib/quotas";
import { SURGERY_CATALOG, isSurgeryCategoryName } from "@/lib/surgeryCatalog";
import { prepareLogo } from "@/lib/image";
import { isSoundEnabled, setSoundEnabled, playSuccess, playTap, playWarning } from "@/lib/sounds";
import { getClinicMeds, addClinicMed, removeClinicMed, allMedTypes, allMedicationNames, BUILTIN_MEDICATIONS, type ClinicMed } from "@/lib/meds";
import { getClinicVaccines, addClinicVaccine, removeClinicVaccine, BUILTIN_VACCINES, type ClinicVaccine } from "@/lib/vaccines";
import { getClinicBreeds, addClinicBreed, removeClinicBreed } from "@/lib/breeds";
import { SpeciesPicker } from "@/components/PetFields";
import { PhoneInput } from "@/components/PhoneInput";
import { ManagerOverrideCard } from "@/components/ManagerOverride";
import { Button, Dialog, useToast } from "@/components/ui";

export function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isStaff = user?.role !== "owner";
  // Clinic-wide cards need real settings rights — a device pinned to the
  // reception view (manager override) hides them like any receptionist.
  const canSettings = isStaff && can("manageSettings");
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

      {canSettings && <ClinicIdentity />}
      {canSettings && <ManagerOverrideCard />}
      {canSettings && <CashierOptions />}
      {canSettings && <DeliveryZonesCard />}
      {canSettings && <ThermalPrinterCard />}
      {canSettings && <FontScaleOptions />}
      <ClinicMembership />
      {canSettings && <BranchesManager />}
      {canSettings && <ServiceSettings />}
      {canSettings && <LabDevicesCard />}
      {canSettings && <PromotionsManager clinicId={user?.clinic_id ?? user?.id} />}
      {canSettings && <QtyPromosCard clinicId={user?.clinic_id ?? user?.id} />}
      {canSettings && <QuotaCard />}
      {canSettings && <SharedCatalogCard />}
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
      // مسار الشعار الخاص: يحفظ الشفافية (PNG)، يفرّغ الخلفية الموحّدة من
      // الحواف، ولا يلمس لوجو مفرّغاً أصلاً — prepareUpload (JPEG) كان يسطّحه.
      const prepared = await prepareLogo(f, { maxDim: 400 });
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
    <div className="card p-5 mb-4">
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

      {/* Logo — معاينة على رقعة شطرنج حتى تبين الشفافية الفعلية */}
      <div className="flex items-center gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line"
          style={logo ? {
            backgroundImage: "linear-gradient(45deg, rgba(148,163,184,.25) 25%, transparent 25%, transparent 75%, rgba(148,163,184,.25) 75%), linear-gradient(45deg, rgba(148,163,184,.25) 25%, transparent 25%, transparent 75%, rgba(148,163,184,.25) 75%)",
            backgroundSize: "14px 14px", backgroundPosition: "0 0, 7px 7px",
          } : undefined}
        >
          {logo ? <img src={logo} alt="logo" className="h-full w-full object-contain" /> : <ImageIcon size={26} className="text-ink-subtle/50" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-secondary cursor-pointer text-sm">
              <Upload size={15} /> {busy ? t("settings.logoBusy", "جارٍ التفريغ…") : logo ? t("settings.changeLogo", "تغيير الشعار") : t("settings.uploadLogo", "رفع شعار")}
              <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} />
            </label>
            {logo && <button onClick={removeLogo} className="chip bg-surface-2 text-xs font-semibold text-danger-600 hover:bg-danger-50"><Trash2 size={14} /> {t("common.remove", "إزالة")}</button>}
          </div>
          <p className="mt-1.5 text-2xs text-ink-subtle">{t("settings.logoCutHint", "الخلفية البيضاء/الموحّدة تنفرغ تلقائياً، واللوجو المفرّغ أصلاً يُحفَظ كما هو بلا أي تعديل.")}</p>
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

/* ------------- Cashier options (opt-in POS extras) ---------- */
function CashierToggle({ label, hint, checked, onToggle }: { label: string; hint: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="text-xs text-ink-subtle mt-0.5">{hint}</p>
      </div>
      <button role="switch" aria-checked={checked} onClick={onToggle} className="mt-0.5 shrink-0" aria-label={label}>
        <span className={cn("relative block h-6 w-11 rounded-full transition-colors", checked ? "bg-brand-600" : "border border-line bg-surface-3")}>
          <span className={cn("absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5 rtl:-translate-x-5")} />
        </span>
      </button>
    </div>
  );
}

function CashierOptions() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [preSale, setPreSale] = useState(getPreSalePrint());
  const [resizableCart, setResizableCartOn] = useState(getResizableCart());

  if (!can("manageSettings")) return null;

  const togglePreSale = () => {
    const next = !preSale;
    setPreSale(next);
    setPreSalePrint(next);
    if (next) playSuccess(); else playTap();
  };
  const toggleResizableCart = () => {
    const next = !resizableCart;
    setResizableCartOn(next);
    setResizableCart(next);
    if (next) playSuccess(); else playTap();
  };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><Printer size={18} className="text-brand-600" /> {t("settings.cashier", "خيارات الكاشير")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("settings.cashierHint", "ميزات إضافية لشاشة البيع — معطّلة افتراضياً، فعّل ما يناسب عيادتك فقط.")}</p>
      <div className="space-y-4">
        <CashierToggle
          label={t("settings.preSalePrint", "طباعة الفاتورة قبل إتمام البيع")}
          hint={t("settings.preSalePrintHint", "يضيف زر طباعة «فاتورة أولية» داخل شاشة البيع ليطّلع الزبون على الحساب قبل الدفع — لا تُسجَّل كفاتورة ولا تُخصم من المخزون.")}
          checked={preSale}
          onToggle={togglePreSale}
        />
        <div className="border-t border-line" />
        <CashierToggle
          label={t("settings.resizableCart", "سلة قابلة لتغيير الحجم")}
          hint={t("settings.resizableCartHint", "على الشاشات الواسعة: اسحب حافة السلة بالماوس لتكبيرها أو تصغيرها كما يناسبك — العرض المفضّل يُحفَظ على هذا الجهاز، ونقرة مزدوجة على الحافة تُرجع الحجم الافتراضي.")}
          checked={resizableCart}
          onToggle={toggleResizableCart}
        />
      </div>
    </div>
  );
}

/* ------------- Clinic membership (عضوية العيادة) — leave, deliberately ------ */
/** Shown ONLY to users working inside ANOTHER clinic they joined as staff.
 *  Replaces the old always-visible top banner: leaving is now a deliberate,
 *  double-confirmed action tucked in Settings, not a button under the cursor. */
function ClinicMembership() {
  const { t } = useTranslation();
  const { user, inAnotherClinic, leaveClinic } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!inAnotherClinic) return null;

  const doLeave = async () => {
    setBusy(true);
    const r = await leaveClinic();
    if (r.error) { setBusy(false); setConfirming(false); }
  };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><LogOut size={18} className="text-warn-600" /> {t("settings.membership", "عضوية العيادة")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("settings.membershipHint", "أنت تعمل حالياً داخل عيادة انضممت إليها كموظف — بياناتك الخاصة ليست محذوفة، فقط مخفية أثناء عملك هنا.")}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn-200 bg-warn-50/50 p-3.5 dark:border-warn-500/30 dark:bg-warn-500/10">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{t("settings.leaveTitle", "مغادرة هذه العيادة")}</p>
          <p className="text-xs text-ink-muted">{t("settings.leaveHint", "تفقد وصولك لبيانات العيادة وتعود لحسابك الخاص. للعودة تحتاج دعوة جديدة من المدير.")}</p>
        </div>
        {!confirming ? (
          <Button variant="secondary" leftIcon={<LogOut size={15} />} onClick={() => { playTap(); setConfirming(true); }}>
            {t("settings.leaveBtn", "مغادرة العيادة…")}
          </Button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-xs font-bold text-warn-700 dark:text-warn-300">{t("settings.leaveSure", { name: user?.full_name ?? "", defaultValue: "متأكد؟ هذا الإجراء فوري." })}</span>
            <Button variant="secondary" onClick={() => { playTap(); setConfirming(false); }}>{t("common.cancel", "إلغاء")}</Button>
            <button
              onClick={() => void doLeave()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-warn-600 px-4 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-warn-700 disabled:opacity-60"
            >
              <LogOut size={13} /> {busy ? t("app.leaving", "جارٍ المغادرة…") : t("settings.leaveConfirm", "نعم، غادر العيادة")}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ------- مناطق التوصيل — قائمة عيادية: اسم + أجرة تنملي تلقائياً بالبيع ------- */
function DeliveryZonesCard() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [zones, setZones] = useState<DeliveryZone[]>(getDeliveryZones());
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  if (!can("manageSettings")) return null;

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (zones.some((z) => z.name === n)) { playWarning(); return; }
    const next = [...zones, { name: n, fee: Math.max(0, Number(fee) || 0) }];
    setZones(next);
    setDeliveryZones(next);
    setName(""); setFee("");
    playSuccess();
  };
  const remove = (n: string) => {
    const next = zones.filter((z) => z.name !== n);
    setZones(next);
    setDeliveryZones(next);
    playTap();
  };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><Send size={18} className="text-sky-600" /> {t("settings.deliveryZones", "مناطق التوصيل")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("settings.deliveryZonesHint", "عرّف مناطق التوصيل مالتك مرة وحدة — عند البيع بالتوصيل يختار الكاشير المنطقة بضغطة، فتنملي أجرة التوصيل تلقائياً وتظهر المنطقة على الطلب وبوصل السائق المطبوع.")}</p>
      <div className="flex gap-2">
        <input className="input h-11 flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.deliveryZoneNamePh", "اسم المنطقة — مثال: المنصور")} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <input className="input h-11 w-32 text-end tabular-nums" type="number" min="0" step="250" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={t("settings.deliveryZoneFeePh", "الأجرة (اختياري)")} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button leftIcon={<Plus size={15} />} disabled={!name.trim()} onClick={add}>{t("common.add", "إضافة")}</Button>
      </div>
      {zones.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-center text-sm text-ink-subtle">{t("settings.deliveryZonesEmpty", "ما مضافة مناطق بعد — أضف أول منطقة من الأعلى.")}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {zones.map((z) => (
            <span key={z.name} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 py-1 pe-1 ps-3 text-sm font-bold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              📍 {z.name}
              {z.fee > 0 && <span className="text-2xs font-semibold text-sky-600 tabular-nums dark:text-sky-300">{formatNum(z.fee)} {currencySymbol()}</span>}
              <button onClick={() => remove(z.name)} aria-label={t("common.delete", "حذف")} className="grid h-6 w-6 place-items-center rounded-full text-sky-500 transition hover:bg-danger-50 hover:text-danger-600">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- الطابعة الحرارية: عرض الإيصال + شريط قياس يحدّده بطبعة واحدة ---- */
function ThermalPrinterCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = usePermissions();
  const [w, setW] = useState(getReceiptWidth());

  if (!can("manageSettings")) return null;

  const pick = (mm: number) => { setW(mm); setReceiptWidth(mm); playTap(); };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><Printer size={18} className="text-brand-600" /> {t("settings.thermal", "الطابعة الحرارية")}</h2>
      <p className="text-xs text-ink-subtle mb-4">
        {t("settings.thermalHint", "«٨٠مم» اسم الورق مو عرض الطباعة — كل موديل يطبع عرضاً مختلفاً قليلاً. إذا طلع الإيصال «نصف الكلام هنا والنصف بالجهة الثانية» أو مقصوصاً، فعرض المستند أكبر من طابعتك: اطبع شريط القياس وحدّد العرض الصحيح مرة وحدة.")}
      </p>

      <Button variant="secondary" leftIcon={<Printer size={15} />} onClick={() => {
        playTap();
        if (!openReceiptCalibration()) toast.error(t("retail.popupBlocked", "اسمح بالنوافذ المنبثقة للطباعة"));
      }}>
        {t("settings.thermalCalibrate", "اطبع شريط القياس")}
      </Button>

      <div className="mt-4 border-t border-line pt-4">
        <label className="label">{t("settings.thermalWidth", "عرض الإيصال (يُحفَظ لهذا الجهاز)")}</label>
        <div className="flex flex-wrap gap-2">
          {RECEIPT_WIDTHS.map((mm) => (
            <button key={mm} type="button" onClick={() => pick(mm)} aria-pressed={w === mm}
              className={cn("rounded-xl border px-3.5 py-2 text-sm font-black tabular-nums transition",
                w === mm ? "border-brand-500 bg-brand-50 text-brand-700 shadow-soft dark:bg-brand-500/15 dark:text-brand-300"
                  : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
              {formatNum(mm)} <span className="text-2xs font-bold">mm</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-2xs text-ink-subtle">
          {t("settings.thermalWidthHint", "اختر أطول عمود طُبع بشريط القياس خطاً واحداً نظيفاً بلا أثر بالجهة الثانية. الشائع: ٧٢مم لورق ٨٠مم، و٥٨مم للطابعات الصغيرة.")}
        </p>
      </div>
    </div>
  );
}

/* -------- عروض الكمية — «كل N قطع خصم X» بزر أحمر يدوي بشاشة البيع -------- */
/* ---- عروض الكمية (0100، ووُسّعت بـ0102) --------------------------------------
 * ثلاثة أشياء تفرّقها عن النسخة الأولى:
 *   ١) الاختيار بشبكة مربّعات داخل نافذة واسعة، لا خانة نص واحدة — العيادة
 *      عندها مئة منتج، والكتابة الحرفية كانت أبطأ من التصفّح وأكثر خطأً.
 *   ٢) اختيار متعدد: العرض ينطبق على **مجموع** المشمولين، فثلاث قطع من ثلاثة
 *      أصناف مختلفة تُكمل المجموعة تماماً كثلاث قطع من صنف واحد.
 *   ٣) الخدمات تنضم للعروض، ولها وضع «سعر المجموعة»: ثلاث خدمات بسعر جديد
 *      بدل خصم مبلغ — وهذا هو الشكل الطبيعي لباقات العيادات.
 * -------------------------------------------------------------------------- */
function QtyPromosCard({ clinicId }: { clinicId?: string }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [rules, setRules] = useState<QtyPromo[]>(getQtyPromos());
  const [products, setProducts] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  const [picking, setPicking] = useState(false);

  // مسودّة العرض الجاري بناؤه
  const [kind, setKind] = useState<PromoKind>("product");
  const [ids, setIds] = useState<string[]>([]);
  const [qty, setQty] = useState("3");
  const [mode, setMode] = useState<PromoMode>("off");
  const [off, setOff] = useState("");
  const [bundle, setBundle] = useState("");
  const [promoName, setPromoName] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { repo.listProducts(clinicId).then(setProducts).catch(() => setProducts([])); }, [clinicId]);
  useEffect(() => { setCatalog(getServiceCatalog()); }, [picking]);

  if (!can("manageSettings")) return null;

  const commit = (next: QtyPromo[]) => { setRules(next); setQtyPromos(next); };

  /** الأصناف المتاحة للاختيار حسب النوع — اسم + سعر، شكل موحّد للشبكة. */
  const pool: { id: string; name: string; price: number; sub: string | null }[] =
    kind === "service"
      ? catalog.services.map((s) => ({ id: s.id, name: s.name, price: s.price, sub: catalog.categories.find((c) => c.id === s.category_id)?.name ?? null }))
      : products.map((p) => ({ id: p.id, name: p.name, price: p.sell_price ?? 0, sub: p.subcategory ?? null }));

  const switchKind = (k: PromoKind) => { if (k === kind) return; playTap(); setKind(k); setIds([]); setFlash(null); };

  const add = () => {
    const q = Math.floor(Number(qty) || 0);
    if (q < 2) { playWarning(); setFlash(t("promos.qtyBadCount", "العدد لازم يكون ٢ فأكثر.")); return; }
    const o = Math.max(0, Number(off) || 0);
    const b = Math.max(0, Number(bundle) || 0);
    if (mode === "off" && o <= 0) { playWarning(); setFlash(t("promos.qtyBadOff", "حدد مقدار خصم أكبر من صفر.")); return; }
    if (mode === "bundle" && b <= 0) { playWarning(); setFlash(t("promos.qtyBadBundle", "حدد سعر المجموعة.")); return; }
    // عرض «سعر المجموعة» على كل الأصناف بلا تحديد يعني سعراً واحداً لأي ثلاثة
    // مهما اختلفت أسعارها — وهذا يخسّر العيادة بلا ما تنتبه.
    if (mode === "bundle" && ids.length === 0) { playWarning(); setFlash(t("promos.qtyBundleNeedsPick", "سعر المجموعة يحتاج تحديد الأصناف — «كل الأصناف» بسعر واحد يخسّرك.")); return; }
    const names = ids.map((id) => pool.find((x) => x.id === id)?.name).filter((x): x is string => !!x);
    commit([...rules, {
      id: uuid(), name: promoName.trim() || null, kind, ids: [...ids], names,
      qty: q, mode, off: mode === "off" ? o : 0, bundlePrice: mode === "bundle" ? b : 0, active: true,
    }]);
    setIds([]); setQty("3"); setOff(""); setBundle(""); setPromoName(""); setFlash(null);
    playSuccess();
  };
  const toggle = (id: string) => { commit(rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r))); playTap(); };
  const remove = (id: string) => { commit(rules.filter((r) => r.id !== id)); playTap(); };

  const pickedLabel = ids.length === 0
    ? (kind === "service" ? t("promos.allServices", "كل الخدمات") : t("promos.qtyAllProducts", "كل المنتجات"))
    : ids.length === 1
      ? (pool.find((x) => x.id === ids[0])?.name ?? "—")
      : t("promos.pickedN", { n: formatNum(ids.length), defaultValue: "{{n}} أصناف مختارة" });

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><BadgePercent size={18} className="text-danger-600" /> {t("promos.qtyTitle", "عروض الكمية")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("promos.qtyHint2", "«كل ٣ خصم ١٬٠٠٠» أو «٣ خدمات بـ٥٠٬٠٠٠». تكدر تحدد أكثر من صنف سوية — وقتها العدد يُحسب مجمّعاً، فثلاث قطع من ثلاثة أصناف مختلفة تكمّل المجموعة. الخصم ما ينطبق لحاله: بشاشة البيع يظهر زر أحمر وأنت تقرر.")}</p>

      {/* منتجات أم خدمات */}
      <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
        {([["product", t("promos.kindProducts", "منتجات"), <Package key="p" size={14} />], ["service", t("promos.kindServices", "خدمات"), <Stethoscope key="s" size={14} />]] as const).map(([k, label, icon]) => (
          <button key={k} type="button" onClick={() => switchKind(k as PromoKind)}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition", kind === k ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr,110px] sm:items-end">
        <div>
          <label className="label">{t("promos.qtyTargets", "الأصناف المشمولة")}</label>
          <button type="button" onClick={() => { playTap(); setPicking(true); }}
            className="flex w-full items-center gap-2 rounded-2xl border border-line bg-surface-1 px-3 py-2.5 text-start text-sm font-semibold text-ink transition hover:border-brand-400">
            <Search size={15} className="shrink-0 text-ink-subtle" />
            <span className="min-w-0 flex-1 truncate">{pickedLabel}</span>
            <span className="shrink-0 text-2xs font-bold text-brand-600">{t("promos.choose", "اختيار")}</span>
          </button>
        </div>
        <div>
          <label className="label">{t("promos.qtyEvery2", "كل كم")}</label>
          <input type="number" inputMode="numeric" min="2" step="1" className="input py-2" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="3" />
        </div>
      </div>

      {/* المكافأة: خصم مبلغ أم سعر جديد للمجموعة */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr,auto] sm:items-end">
        <div>
          <label className="label">{t("promos.reward", "المكافأة")}</label>
          <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
            {([["off", t("promos.modeOff", "خصم مبلغ")], ["bundle", t("promos.modeBundle", "سعر المجموعة")]] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => { playTap(); setMode(m as PromoMode); setFlash(null); }}
                className={cn("rounded-full px-3.5 py-1.5 text-xs font-bold transition", mode === m ? "bg-danger-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {mode === "off" ? (
          <div>
            <label className="label">{t("promos.qtyOff", "مقدار الخصم")}</label>
            <input type="number" inputMode="numeric" min="0" step="250" className="input py-2" value={off} onChange={(e) => setOff(e.target.value)} placeholder="1000" />
          </div>
        ) : (
          <div>
            <label className="label">{t("promos.bundlePrice", "سعر المجموعة كاملة")}</label>
            <input type="number" inputMode="numeric" min="0" step="1000" className="input py-2" value={bundle} onChange={(e) => setBundle(e.target.value)} placeholder="50000" />
          </div>
        )}
        <Button leftIcon={<Plus size={15} />} onClick={add}>{t("common.add", "إضافة")}</Button>
      </div>

      <div className="mt-3">
        <label className="label">{t("promos.nameOpt", "اسم العرض (اختياري)")}</label>
        <input className="input py-2" value={promoName} onChange={(e) => setPromoName(e.target.value)} placeholder={t("promos.namePh", "عرض الشامبو")} />
      </div>

      {flash && <p className="mt-2 text-xs font-semibold text-danger-600">{flash}</p>}

      {rules.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-center text-sm text-ink-subtle">{t("promos.qtyEmpty", "ما مضافة عروض كمية بعد.")}</p>
      ) : (
        <div className="mt-4 space-y-1.5">
          {rules.map((r) => (
            <div key={r.id} className={cn("flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2.5", !r.active && "opacity-55")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", r.kind === "service" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "bg-danger-50 text-danger-600 dark:bg-danger-500/15")}>
                {r.kind === "service" ? <Stethoscope size={16} /> : <BadgePercent size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{r.name || promoTargetLabel(r)}</p>
                <p className="truncate text-2xs text-ink-subtle">
                  {r.mode === "bundle"
                    ? t("promos.ruleLineBundle", { q: formatNum(r.qty), n: money(r.bundlePrice), defaultValue: "أي {{q}} → بـ{{n}}" })
                    : t("promos.qtyRuleLine2", { q: formatNum(r.qty), n: money(r.off), defaultValue: "كل {{q}} → خصم {{n}}" })}
                  {" · "}{promoTargetLabel(r)}
                </p>
              </div>
              <button onClick={() => toggle(r.id)} className={cn("chip text-2xs font-bold", r.active ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-subtle")}>
                {r.active ? t("promos.active", "فعّال") : t("promos.paused", "موقوف")}
              </button>
              <button onClick={() => remove(r.id)} aria-label={t("common.delete", "حذف")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <PromoPicker
        open={picking}
        onClose={() => setPicking(false)}
        kind={kind}
        pool={pool}
        selected={ids}
        onChange={setIds}
      />
    </div>
  );
}

/* ---- حصص الاشتراك (0104) — تظهر للعيادة نفسها ------------------------------
 * بدونها تكتشف العيادة الحد لحظة الرفض فقط، وهذا أسوأ وقت لاكتشافه. البطاقة
 * تختفي كلياً إذا ما أكو حدود (وهو حال أغلب العيادات) — لا نزحم الإعدادات
 * بشيء لا يخص المستخدم.
 * -------------------------------------------------------------------------- */
/** كم يوم للتجديد — سالب يعني مرّ التاريخ (لا يحدث عملياً). */
function daysTo(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function QuotaCard() {
  const { can } = usePermissions();
  const [q, setQ] = useState<QuotaUsage | null>(null);

  useEffect(() => { void fetchQuota(true).then(setQ).catch(() => setQ(null)); }, []);

  if (!can("manageSettings")) return null;
  if (!q || (q.petLimit == null && q.waLimit == null)) return null; // بلا حدود → لا بطاقة

  const Row = ({ icon, label, used, limit }: { icon: React.ReactNode; label: string; used: number; limit: number | null }) => {
    if (limit == null) return null;
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
    const left = Math.max(0, limit - used);
    const bar = pct >= 100 ? "bg-danger-500" : pct >= 80 ? "bg-warn-500" : "bg-brand-500";
    return (
      <div className="rounded-2xl border border-line p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted">{icon}</span>
          <span className="min-w-0 flex-1 text-sm font-bold text-ink">{label}</span>
          <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink">
            {formatNum(used)}<span className="text-ink-subtle">/{formatNum(limit)}</span>
          </span>
        </div>
        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span className={cn("block h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
        </span>
        <p className={cn("mt-1.5 text-2xs font-semibold", left === 0 ? "text-danger-600" : pct >= 80 ? "text-warn-600" : "text-ink-subtle")}>
          {left === 0 ? "خلصت حصة هذا الشهر — تتجدد تلقائياً، أو راجع مزوّد الخدمة لرفع الحد" : `باقي ${formatNum(left)} هذا الشهر`}
        </p>
      </div>
    );
  };

  return (
    <div className="card mb-4 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink">
        <Gauge size={18} className="text-brand-600" /> حصتك هذا الشهر
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-ink-subtle">
        تتجدد تلقائياً مع بداية كل شهر. الي ما تستهلكه ما يتراكم للشهر الجاي.
        <b className="text-ink-muted"> ولا شي ينحذف</b> — حيواناتك ورسائلك المرسلة كلها محفوظة، الي يتصفّر هو العدّاد بس.
      </p>
      {q.periodEnd && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-2xs font-bold text-ink-muted">
          <CalendarClock size={13} /> يتجدد بتاريخ {formatDate(q.periodEnd, "ar")}
          {daysTo(q.periodEnd) >= 0 && <span className="text-ink-subtle">· باقي {formatNum(daysTo(q.periodEnd))} يوم</span>}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Row icon={<PawPrint size={15} />} label="حيوانات هذا الشهر" used={q.petsUsed} limit={q.petLimit} />
        <Row icon={<MessageCircle size={15} />} label="رسائل هذا الشهر" used={q.waUsed} limit={q.waLimit} />
      </div>
    </div>
  );
}

/* ---- الكتالوج المشترك (0103) -------------------------------------------------
 * الاستفادة مجانية وبلا شرط: أي عيادة تمسح باركوداً مجهولاً يجيها الاسم
 * والأسعار المرجعية. المساهمة وحدها اختيارية — ومطفأة افتراضياً لأنها تشمل
 * **سعر الشراء**، وهو سرّ تجاري. لذلك النص يسمّي بالحرف كل حقل يخرج من
 * العيادة: موافقة غامضة ليست موافقة.
 * ------------------------------------------------------------------------- */
function SharedCatalogCard() {
  const { can } = usePermissions();
  const [on, setOn] = useState(getCatalogShare());
  const [stats, setStats] = useState<{ barcodes: number; clinics: number } | null>(null);

  useEffect(() => { void catalogStats().then(setStats).catch(() => setStats(null)); }, [on]);

  if (!can("manageSettings")) return null;

  const toggle = () => {
    const next = !on;
    setOn(next);
    setCatalogShare(next);
    if (next) playSuccess(); else playTap();
  };

  return (
    <div className="card mb-4 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink">
        <Share2 size={18} className="text-brand-600" /> الكتالوج المشترك
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-ink-subtle">
        كتالوج باركودات تبنيه العيادات سوية. تمسح باركوداً ما تعرفه فينزل اسمه وأسعاره
        المرجعية جاهزة بدل ما تكتب مئة منتج بالإيد.
        {stats && stats.barcodes > 0 && (
          <> فيه حالياً <b className="text-ink">{formatNum(stats.barcodes)}</b> باركود من{" "}
            <b className="text-ink">{formatNum(stats.clinics)}</b> عيادة.</>
        )}
      </p>

      {/* القراءة مجانية دائماً — نقولها صراحةً حتى ما يظن أحد أن المفتاح شرط */}
      <div className="mb-3 flex items-start gap-2 rounded-2xl bg-success-50 p-3 text-2xs leading-relaxed text-success-800 dark:bg-success-500/10 dark:text-success-200">
        <Check size={14} className="mt-0.5 shrink-0" />
        <span>الاستفادة من الكتالوج شغّالة عندك <b>بلا أي شرط</b> — حتى لو المفتاح تحت مطفي.</span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">شارك منتجات عيادتي بالكتالوج</span>
          <span className="block text-2xs text-ink-subtle">ساهم حتى تكبر القاعدة للجميع.</span>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-label="شارك منتجات عيادتي بالكتالوج"
          onClick={toggle}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand-600" : "bg-surface-3 dark:bg-surface-2")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "start-[1.375rem]" : "start-0.5")} />
        </button>
      </div>

      {/* الإفصاح الكامل — بالحرف، لا بالعموم */}
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-2xs leading-relaxed text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          إذا فعّلته، يخرج من عيادتك لكل منتج عنده باركود: <b>الباركود</b> و<b>اسم المنتج</b> و
          <b>سعر البيع</b> و<b>سعر الشراء</b>.
          <br />
          <b>سعر الشراء هو كلفتك من المجهّز</b> — فكّر بيها قبل التفعيل.
          <br />
          يخرج مجهول الهوية: اسم عيادتك لا يظهر أبداً، والأرقام تُعرض كوسيط بين كل
          المساهمين لا كسعرك أنت. وأي وقت تطفيه يتوقف كل شيء.
        </span>
      </div>
    </div>
  );
}

/* شاشة الاختيار: واسعة، بشبكة مربّعات وبحث حيّ. الاختيار المتعدد هو الأصل هنا —
 * لذلك المربّع كله زر، وعلامة الصح تظهر بزاويته، ومجموع المختار ثابت بالأسفل. */
function PromoPicker({ open, onClose, kind, pool, selected, onChange }: {
  open: boolean; onClose: () => void; kind: PromoKind;
  pool: { id: string; name: string; price: number; sub: string | null }[];
  selected: string[]; onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const groups = Array.from(new Set(pool.map((p) => p.sub).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "ar"));
  const ql = q.trim().toLowerCase();
  const shown = pool.filter((p) => (!group || p.sub === group) && (!ql || p.name.toLowerCase().includes(ql)));
  const has = (id: string) => selected.includes(id);
  const flip = (id: string) => { playTap(); onChange(has(id) ? selected.filter((x) => x !== id) : [...selected, id]); };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={kind === "service" ? t("promos.pickServices", "اختر الخدمات") : t("promos.pickProducts", "اختر المنتجات")}
      description={t("promos.pickHint", "اختر صنفاً واحداً، أو عدّة أصناف يشتغل عليهم العرض مجمّعاً. بلا اختيار = كل الأصناف.")}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-ink-muted">
            {selected.length === 0
              ? t("promos.pickedNone", "بلا تحديد — كل الأصناف")
              : t("promos.pickedCount", { n: formatNum(selected.length), defaultValue: "{{n}} مختار" })}
          </span>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button onClick={() => { playTap(); onChange([]); }} className="rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
                {t("promos.clearPick", "مسح التحديد")}
              </button>
            )}
            <Button onClick={() => { playSuccess(); onClose(); }} leftIcon={<Check size={15} />}>{t("common.done", "تم")}</Button>
          </div>
        </div>
      }
    >
      <div className="sticky top-0 z-10 -mx-6 mb-3 bg-surface-1/95 px-6 pb-3 backdrop-blur">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input autoFocus className="input py-2.5 pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("promos.search", "دوّر بالاسم…")} />
        </div>
        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button onClick={() => { playTap(); setGroup(null); }}
              className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", !group ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {t("promos.allGroups", "الكل")}
            </button>
            {groups.map((g) => (
              <button key={g} onClick={() => { playTap(); setGroup(g === group ? null : g); }}
                className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", group === g ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-subtle">{t("promos.pickEmpty", "ماكو أصناف بهذا البحث.")}</p>
      ) : (
        // كثافة مقصودة: مربّعات ~١٥٠بك تخلي عشرين صنفاً بالشاشة بلا سكرول —
        // مربّعات ضخمة تعني تنقّلاً أكثر، وهذا عكس الغاية من الشبكة.
        <div className="grid grid-cols-3 gap-2.5 pb-2 sm:grid-cols-4 lg:grid-cols-6">
          {shown.map((p) => {
            const on = has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => flip(p.id)}
                aria-pressed={on}
                className={cn(
                  "relative flex aspect-square flex-col justify-between rounded-2xl border p-3 text-start transition",
                  on
                    ? "border-brand-500 bg-brand-50 shadow-soft dark:bg-brand-500/15"
                    : "border-line bg-surface-1 hover:border-brand-300 hover:bg-surface-2",
                )}
              >
                <span className={cn("grid h-8 w-8 place-items-center rounded-xl", on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-subtle")}>
                  {on ? <Check size={16} /> : kind === "service" ? <Stethoscope size={15} /> : <Package size={15} />}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-xs font-extrabold leading-snug text-ink">{p.name}</span>
                  {p.sub && <span className="mt-0.5 block truncate text-[10px] text-ink-subtle">{p.sub}</span>}
                  <span className="mt-1 block text-xs font-bold tabular-nums text-brand-700 dark:text-brand-300">{money(p.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

/* ------------- UI font scale (حجم الخط) — opt-in, per-device size ---------- */
function FontScaleOptions() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [enabled, setEnabled] = useState(getFontScaleEnabled());
  const [scale, setScale] = useState<FontScaleId>(getFontScale());
  const [crisp, setCrisp] = useState(getCrispMode());

  if (!can("manageSettings")) return null;

  const toggleCrisp = () => {
    const next = !crisp;
    setCrisp(next);
    setCrispMode(next); // ينطبق فوراً على كل الواجهة — تفضيل هذا الجهاز فقط
    if (next) playSuccess(); else playTap();
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setFontScaleEnabled(next);
    // إيقاف القسم يرجّع حجم هذا الجهاز للافتراضي فوراً (السلوك البديهي القديم).
    if (!next) { setFontScale("normal"); setScale("normal"); }
    applyFontScale();
    if (next) playSuccess(); else playTap();
  };
  const pick = (id: FontScaleId) => {
    playTap();
    setScale(id);
    setFontScale(id); // applies instantly — the whole app resizes live
  };

  const LABELS: Record<FontScaleId, string> = {
    xcompact: t("settings.fontScaleXcompact", "مصغّر"),
    compact: t("settings.fontScaleCompact", "صغير"),
    normal: t("settings.fontScaleNormal", "افتراضي"),
    large: t("settings.fontScaleLarge", "كبير"),
    xlarge: t("settings.fontScaleXlarge", "أكبر"),
  };
  // The sample glyph's size mirrors each option's real scale.
  const SAMPLE_PX: Record<FontScaleId, number> = { xcompact: 13, compact: 14, normal: 16, large: 18, xlarge: 20 };

  return (
    <div className="card p-5 mb-4">
      <h2 className="font-bold text-ink mb-1 flex items-center gap-2"><Type size={18} className="text-brand-600" /> {t("settings.fontScale2", "حجم الخط ووضوح الشاشة")}</h2>
      <p className="text-xs text-ink-subtle mb-4">{t("settings.fontScaleSectionHint", "للشاشات الصغيرة أو النظر المجهد — كل النصوص والمسافات تكبر بتناسق كامل دون أن يختل أي تخطيط.")}</p>
      <CashierToggle
        label={t("settings.fontScaleToggle", "تفعيل تغيير حجم الخط")}
        hint={t("settings.fontScaleToggleHint", "اختر الحجم الذي يناسب شاشتك — الحجم المختار يُحفَظ على هذا الجهاز فقط، فكل جهاز في العيادة يقدر يختار ما يريحه.")}
        checked={enabled}
        onToggle={toggle}
      />
      {enabled && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FONT_SCALES.map((s) => {
              const active = scale === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => pick(s.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition",
                    active
                      ? "border-brand-500 bg-brand-50 shadow-soft ring-1 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40"
                      : "border-line bg-surface-1 hover:border-brand-300 hover:bg-surface-2",
                  )}
                >
                  {/* Fixed-px sample so the four options keep their relative sizes
                      even while the app itself is scaled. */}
                  <span className={cn("font-display font-extrabold leading-none", active ? "text-brand-600 dark:text-brand-300" : "text-ink")} style={{ fontSize: `${SAMPLE_PX[s.id]}px` }}>أ</span>
                  <span className={cn("text-xs font-semibold", active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted")}>{LABELS[s.id]}</span>
                  <span className="text-2xs text-ink-subtle tabular-nums" dir="ltr">{s.pct}%</span>
                </button>
              );
            })}
          </div>
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-muted">
            {t("settings.fontScalePreview", "معاينة حيّة: هذا النص وكل الواجهة يتغير حجمهما فوراً حسب اختيارك.")}
          </p>
        </div>
      )}

      {/* وضع الوضوح — للشاشات الصغيرة/الضعيفة البكسلات. مستقل عن حجم الخط
          ودائم الظهور: هذا علاج عرض لهذا الجهاز، مو تفضيل عيادة. */}
      <div className="mt-4 border-t border-line pt-4">
        <CashierToggle
          label={t("settings.crispToggle", "وضوح أعلى للشاشات الضعيفة")}
          hint={t("settings.crispToggleHint", "إذا كان الكلام يطلع مبكسل أو باهت وغير مبين على شاشتك — فعّل هذا الخيار: الحروف تُرسم أحدّ وأثخن والنصوص الرمادية تصير أغمق. يُحفَظ على هذا الجهاز فقط، والشاشات القوية بالعيادة ما تتأثر.")}
          checked={crisp}
          onToggle={toggleCrisp}
        />
        {crisp && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-muted">
            {t("settings.crispPreview", "معاينة حيّة: هذا النص وكل الواجهة صاروا أوضح وأثخن هسة. إذا شاشتك أصلاً قوية ما راح تلاحظ فرقاً كبيراً — والأفضل إبقاؤه مطفياً عليها.")}
          </p>
        )}
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

      {/* مكتبة العمليات الجاهزة — فعّل، سعّر، وعدّل الاسم براحتك */}
      <SurgeryLibrary catalog={catalog} onChanged={refresh} />

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

/* ---------- مكتبة العمليات الجاهزة (داخل إدارة الخدمات) ----------
 * كل عمليات الكتالوج العلمي بمفاتيح تشغيل/إيقاف: يفعّل الطبيب ما يجريه فقط،
 * يحدد سعره، ويغيّر الاسم لاحقاً بأي صيغة تعجبه — الخدمة تحمل مرجع العملية
 * (surgery_ref) فيبقى نوعها معروفاً بدقة وتُسجَّل في الطبلة بالاسم العلمي. */
function SurgeryLibrary({ catalog, onChanged }: { catalog: ServiceCatalog; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const byRef = new Map(catalog.services.filter((s) => s.surgery_ref).map((s) => [s.surgery_ref as string, s]));
  const enabledCount = byRef.size;

  /** تصنيف «العمليات الجراحية» — يُنشأ تلقائياً عند أول تفعيل. */
  const ensureSurgeryCategory = (): string => {
    const existing = catalog.categories.find((c) => isSurgeryCategoryName(c.name));
    if (existing) return existing.id;
    const created = addServiceCategory("العمليات الجراحية");
    return created ? created.id : (getServiceCatalog().categories.find((c) => isSurgeryCategoryName(c.name))?.id ?? "");
  };

  const toggle = (ref: string, arName: string) => {
    const existing = byRef.get(ref);
    if (existing) {
      removeService(existing.id);
      playTap();
    } else {
      const catId = ensureSurgeryCategory();
      if (!catId) return;
      addService(catId, arName, 0, ref);
      playSuccess();
    }
    onChanged();
  };

  const setPrice = (ref: string, price: number) => {
    const svc = byRef.get(ref);
    if (svc) { updateService(svc.id, { price }); onChanged(); }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-rose-200 dark:border-rose-500/30">
      <button onClick={() => { playTap(); setOpen((v) => !v); }} className="flex w-full items-center gap-2 bg-rose-50 px-3.5 py-3 text-start dark:bg-rose-500/10">
        <Slice size={16} className="shrink-0 text-rose-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-ink">مكتبة العمليات الجاهزة</span>
          <span className="block text-2xs text-ink-subtle">فعّل العمليات التي تجريها وحدد أسعارها — تظهر في الكاشير وتُسجَّل تلقائياً في طبلة الحيوان. الاسم والسعر قابلان للتعديل دائماً.</span>
        </span>
        {enabledCount > 0 && <span className="chip bg-rose-100 text-2xs font-black text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{formatNum(enabledCount)} مفعّلة</span>}
        <ChevronDown size={15} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="max-h-[46vh] space-y-4 overflow-y-auto p-3.5">
          {SURGERY_CATALOG.map((cat) => {
            const items = cat.items.filter((it) => it.en && it.en !== "Custom procedure");
            if (items.length === 0) return null;
            return (
              <div key={cat.key}>
                <div className="mb-1.5 text-2xs font-black text-ink-subtle">{cat.icon} {cat.label}</div>
                <div className="space-y-1.5">
                  {items.map((it) => {
                    const ref = it.en as string;
                    const svc = byRef.get(ref);
                    const on = !!svc;
                    return (
                      <div key={ref} className={cn("flex flex-wrap items-center gap-2.5 rounded-xl border p-2.5 transition", on ? "border-rose-300 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5" : "border-line bg-surface-1")}>
                        <button role="switch" aria-checked={on} aria-label={it.name} onClick={() => toggle(ref, it.name)} className="shrink-0">
                          <span className={cn("relative block h-5.5 w-10 rounded-full transition-colors", on ? "bg-rose-600" : "border border-line bg-surface-3")} style={{ height: 22 }}>
                            <span className={cn("absolute start-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform", on && "translate-x-[18px] rtl:-translate-x-[18px]")} />
                          </span>
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-extrabold text-ink">{svc ? svc.name : it.name}</span>
                          <span className="block truncate text-2xs text-ink-subtle" dir="ltr">{it.en}</span>
                        </span>
                        {on && (
                          <span className="flex items-center gap-1.5">
                            <input
                              type="number" min="0" step="250" inputMode="numeric"
                              className="input h-8 w-28 px-2 py-0 text-end text-xs font-bold tabular-nums"
                              defaultValue={svc!.price || ""}
                              placeholder="السعر"
                              onBlur={(e) => setPrice(ref, Number(e.target.value) || 0)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                            <span className="text-2xs font-bold text-ink-subtle">د.ع</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-2xs leading-relaxed text-ink-muted">
            💡 العملية المفعّلة تظهر كخدمة في تصنيف «العمليات الجراحية» بالكاشير. غيّر اسمها أو سعرها من القائمة تحت مثل أي خدمة — تبقى معروفة النوع وتُسجَّل بالاسم العلمي وموعد المتابعة الصحيحين مهما غيّرت التسمية.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryBlock({ cat, services, onChanged }: { cat: ServiceCategory; services: Service[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = () => {
    if (!name.trim()) return;
    // رمز مكرر يعني مسحة واحدة تنزّل خدمتين — نرفضه بالباب بدل ما ينكشف بالكاشير.
    if (code.trim() && serviceBarcodeTaken(code)) {
      playWarning();
      setErr(t("services.barcodeTaken", "هذا الباركود مستعمل لخدمة ثانية."));
      return;
    }
    addService(cat.id, name, Number(price) || 0, null, code);
    playSuccess();
    setName(""); setPrice(""); setCode(""); setErr(null);
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
              {/* باركود الخدمة: العيادة تطبعه بنفسها، ومسحه بالكاشير ينزّل الخدمة فوراً. */}
              <div className="flex items-center gap-1">
                <Barcode size={13} className="shrink-0 text-ink-subtle" />
                <input
                  dir="ltr" inputMode="numeric" defaultValue={s.barcode ?? ""}
                  placeholder={t("services.barcodePh", "باركود")}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if ((s.barcode ?? "") === v) return;
                    if (v && serviceBarcodeTaken(v, s.id)) { playWarning(); e.target.value = s.barcode ?? ""; return; }
                    updateService(s.id, { barcode: v }); playTap(); onChanged();
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-28 rounded-lg border border-line bg-surface-1 px-2 py-1 text-center text-xs font-semibold tabular-nums text-ink outline-none focus:border-brand-400"
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
          <input type="number" min="0" step="1" inputMode="numeric" className="input py-2 text-end" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("services.price", "Price")} />
        </div>
        <div className="w-28">
          <input dir="ltr" inputMode="numeric" className="input py-2 text-center" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("services.barcodePh", "باركود")} />
        </div>
        <button className="btn-secondary py-2.5" onClick={add}><Plus size={16} /></button>
      </div>
      {err && <p className="mt-1.5 text-2xs font-bold text-danger-600">{err}</p>}
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

/* ============================ Lab device bridge (الجسر الشبكي) ============================
 * ربط أجهزة المختبر عبر الشبكة: الجهاز بغرفة، السستم بغرفة ثانية. تطبيق صغير
 * قرب الجهاز يقرأ نتائجه ويرسلها للسحابة برمز سري، وتظهر بصندوق المختبر لتُربط
 * بالحيوان. هذي البطاقة تولّد الرمز، تحمّل حزمة التطبيق، وتلغي الأجهزة. */
const README_TXT = () => [
  "ربط جهاز المختبر بـ doctorVet",
  "==============================",
  "",
  "مهم: فُك ضغط هذا المجلد أولاً (كلك يمين ← Extract All).",
  "التشغيل من داخل المجلد المضغوط لا يعمل.",
  "",
  "١) ثبّت Node.js مرة واحدة من nodejs.org — اضغط الزر الأخضر (LTS).",
  "",
  "٢) شغّل الملف الذي يناسب حاسوبك:",
  "",
  "   ── ويندوز ──",
  "   دبل-كلك على «تشغيل على ويندوز».",
  "   إذا ظهرت نافذة زرقاء (Windows protected your PC):",
  "        اضغط More info ← ثم Run anyway",
  "",
  "   ── ماك ──",
  "   دبل-كلك على «تشغيل على ماك». سيرفضه النظام أول مرة برسالة",
  "   «Apple could not verify…» — هذا طبيعي لأن الملف نزل من الإنترنت.",
  "        ١. اضغط Done  (لا تضغط Move to Trash)",
  "        ٢. افتح System Settings ← Privacy & Security",
  "        ٣. انزل لقسم Security، ستجد اسم الملف مذكوراً",
  "           واضغط الزر: Open Anyway",
  "        ٤. أدخل كلمة السر أو البصمة، ثم دبل-كلك على الملف مرة",
  "           أخرى واضغط Open",
  "   مرة واحدة فقط — بعدها الدبل-كلك يكفي دائماً.",
  "",
  "   (ملاحظة: على نسخ macOS القديمة كان يكفي كلك يمين ← Open،",
  "    لكن آبل ألغت هذا المخرج ابتداءً من macOS 15.)",
  "",
  "٣) ستفتح صفحة عربية في المتصفح. اتبع الخطوات الأربع فيها.",
  "",
  "٤) خلاص — النتائج تدخل السستم لحالها.",
  "",
  "ملاحظات:",
  "• شغّل البرنامج على الحاسوب القريب من جهاز المختبر — لا على أي حاسوب.",
  "• اترك النافذة السوداء مفتوحة أثناء الدوام. تسكيرها يوقف الاستقبال.",
  "• التطبيق مقترن بعيادتك مسبقاً — لا يحتاج أي رمز أو إعداد يدوي.",
  "• إذا لم يجد الجهاز: تأكد أنه مشغّل وموصول بنفس الراوتر بكيبل الشبكة.",
  "• مجلد program يحتوي محرّك البرنامج — لا تحذفه ولا تنقله.",
  "",
].join("\r\n");

function LabDevicesCard() {
  const toast = useToast();
  const [links, setLinks] = useState<LabDeviceLink[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<LabDeviceLink | null>(null); // آخر جهاز مضاف — نعرض رمزه
  const [copied, setCopied] = useState(false);

  const load = () => { void repo.listDeviceLinks().then(setLinks).catch(() => {}); };
  useEffect(load, []);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const link = await repo.createDeviceLink(name.trim() || "جهاز المختبر");
      setFresh(link);
      setName("");
      playSuccess();
      load();
    } catch (e) {
      toast.error("تعذّر إنشاء الجهاز", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  /**
   * الإلغاء خطوتان عمداً: الزر ملاصق لأزرار التنزيل، وضغطة خطأ واحدة كانت
   * تقطع اتصال جهاز المختبر نهائياً بلا إنذار — والعيادة تكتشفها فقط حين
   * ترفض السحابة النتائج بـ«invalid device token». الضغطة الأولى تطلب
   * التأكيد وتتراجع وحدها بعد أربع ثوانٍ.
   */
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const revokeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (revokeTimer.current) window.clearTimeout(revokeTimer.current); }, []);

  const askRevoke = (id: string) => {
    playTap();
    setConfirmRevoke(id);
    if (revokeTimer.current) window.clearTimeout(revokeTimer.current);
    revokeTimer.current = window.setTimeout(() => setConfirmRevoke(null), 4000);
  };

  const revoke = async (id: string) => {
    if (confirmRevoke !== id) { askRevoke(id); return; }
    if (revokeTimer.current) window.clearTimeout(revokeTimer.current);
    setConfirmRevoke(null);
    try {
      await repo.revokeDeviceLink(id);
      playTap();
      if (fresh?.id === id) setFresh(null);
      load();
      toast.toast({ tone: "info", title: "انلغى ربط الجهاز", description: "المُستقبِل ما راح يرسل بعد الآن — أضف جهازاً جديداً واستبدل الرمز بملف الإعداد." });
    } catch { toast.error("تعذّر الإلغاء"); }
  };

  const copyToken = (token: string) => {
    void navigator.clipboard?.writeText(token).then(() => { setCopied(true); playTap(); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const saveFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    playTap();
  };

  /* لا نخمّن نظام التشغيل من المتصفح: الطبيب قد يحمّل الحزمة من الماك
     ليشغّلها على حاسوب ويندوز قرب الجهاز. الحزمة تحمل المُشغّلين معاً. */

  /** اسم ملف إنجليزي آمن لكل جهاز — حتى تتعايش عدة أجهزة بمجلد واحد. */
  const appFileName = (link: LabDeviceLink) => {
    const slug = link.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() || "lab";
    return `doctorvet-lab-${slug}.mjs`;
  };

  /** مسار المحرك داخل الأرشيف — بمجلد فرعي حتى يبقى الجذر فيه ما يُضغط عليه فقط. */
  const ENGINE_DIR = "program";

  /*
   * الحارس الأول: تشغيل الملف من داخل الأرشيف مباشرة (دبل-كلك داخل WinRAR)
   * يفكّ ضغط هذا الملف وحده إلى مجلد مؤقت ويترك مجلد program داخل الأرشيف —
   * فينهار node برسالة MODULE_NOT_FOUND مخيفة. نمسكها ونقول للطبيب ماذا يفعل.
   * الرسائل بالإنجليزية عمداً: نافذة cmd القديمة تعرض العربية معكوسة ومقطّعة.
   */
  const winLauncher = (file: string) => [
    "@echo off",
    "chcp 65001 >nul",
    "title doctorVet Lab",
    'cd /d "%~dp0"',
    `if not exist "${ENGINE_DIR}\\${file}" (`,
    "  echo.",
    "  echo   ==========================================================",
    "  echo     STOP - the program folder is missing.",
    "  echo   ==========================================================",
    "  echo.",
    "  echo   You are running this from INSIDE the zip file.",
    "  echo   Windows only unpacked this one file, not the whole folder.",
    "  echo.",
    "  echo   HOW TO FIX:",
    "  echo     1. Close this window.",
    "  echo     2. Right-click the downloaded zip file.",
    "  echo     3. Choose  Extract All  (or Extract To).",
    "  echo     4. Open the NEW folder that appears.",
    "  echo     5. Double-click this file again from there.",
    "  echo.",
    "  pause & exit /b 1",
    ")",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo.",
    "  echo   Node.js is not installed.",
    "  echo   Download it from nodejs.org ^(the green LTS button^), install, then run this again.",
    "  echo.",
    "  pause & exit /b 1",
    ")",
    "echo.",
    "echo   Starting the doctorVet lab app...",
    "echo   Your browser will open. KEEP THIS WINDOW OPEN while the clinic is working.",
    "echo.",
    `node "${ENGINE_DIR}\\${file}"`,
    "echo.",
    "echo   The app has stopped.",
    "pause",
    "",
  ].join("\r\n");

  /* الترمنل على الماك يعرض العربية سليمة، فالرسائل هنا عربية. */
  const macLauncher = (file: string) => [
    "#!/bin/bash",
    "# مُشغّل تطبيق المختبر — دبل-كلك يفتح التطبيق بالمتصفح.",
    'cd "$(dirname "$0")" || exit 1',
    `if [ ! -f "${ENGINE_DIR}/${file}" ]; then`,
    '  echo ""',
    '  echo "  ✗ مجلد program مو موجود جنب هذا الملف."',
    '  echo ""',
    '  echo "  غالباً شغّلت الملف من داخل الأرشيف المضغوط مباشرة."',
    '  echo "  فُك ضغط الملف المنزّل كاملاً أول (دبل-كلك عليه)،"',
    '  echo "  بعدها افتح المجلد الجديد وشغّل هذا الملف من هناك."',
    '  echo ""',
    '  read -n 1 -s -r -p "اضغط أي زر للإغلاق..."; exit 1',
    "fi",
    "if ! command -v node >/dev/null 2>&1; then",
    '  echo "✗ Node.js مو مثبّت. ثبّته من nodejs.org (الزر الأخضر LTS) ثم أعد المحاولة."',
    '  read -n 1 -s -r -p "اضغط أي زر للإغلاق..."; exit 1',
    "fi",
    'echo "▶ تشغيل تطبيق المختبر — راح ينفتح المتصفح. لا تسكّر هذه النافذة."',
    `node "${ENGINE_DIR}/${file}"`,
    'read -n 1 -s -r -p "توقّف التطبيق. اضغط أي زر للإغلاق..."',
    "",
  ].join("\n");

  /**
   * حزمة الجهاز: المحرك + مُشغّل لكل نظام، بأرشيف واحد.
   *
   * التطبيق يجيء مقترناً مسبقاً بالعيادة (الرابط والمفتاح والرمز مزروعة داخله)،
   * فالطبيب ما ينسخ رمزاً ولا يحرّر JSON ولا يفتح ترمنل.
   *
   * لماذا أرشيف؟ لأن المتصفح ما يكدر ينزّل ملفاً بصلاحية تنفيذ — وداخل ZIP
   * نخزنها فيبقى مُشغّل الماك قابلاً للدبل-كلك.
   *
   * ولماذا المُشغّلان معاً؟ التخمين من المتصفح كان يخطئ: طبيب يفتح السستم على
   * الماك ويريد تشغيل الجهاز على حاسوب ويندوز، فتنزله نسخة الماك ولا يلقى شيئاً
   * يشتغل. الملفان معاً بضعة مئات بايت، والاسم يقول أيهما له.
   */
  const downloadKit = (link: LabDeviceLink) => {
    const pairing = {
      url: supabaseUrl || "https://YOUR-PROJECT.supabase.co",
      anonKey: supabaseAnonKey || "YOUR_SUPABASE_ANON_KEY",
      token: link.token,
      device: link.name,
      clinic: getClinicName(), // يظهر بترويسة التطبيق: «مربوط بـ …»
    };
    const file = appFileName(link);
    const app = labBridgeAppSource.replace("/*@pairing*/ null", JSON.stringify(pairing));
    const zip = makeZip([
      { name: "تشغيل على ويندوز.bat", content: winLauncher(file) },
      { name: "تشغيل على ماك.command", content: macLauncher(file), executable: true },
      { name: "اقرأني أولاً.txt", content: README_TXT() },
      { name: `${ENGINE_DIR}/${file}`, content: app },
    ]);
    saveFile(zip, "doctorvet-lab.zip");
    toast.toast({
      tone: "info",
      title: "نزّلت حزمة الربط",
      description: "فك الضغط، وافتح ملف التشغيل الي يناسب نظامك — ويندوز أو ماك.",
    });
  };

  /** رسالة تجريبية: نمرّر رسالة HL7 نموذجية عبر نفس مسار الاستقبال — تظهر بصندوق المختبر. */
  const sendTest = async (link: LabDeviceLink) => {
    const sample = [
      "MSH|^~\\&|ANALYZER|LAB|||20260804||ORU^R01|1|P|2.3",
      "PID|1||TEST||حيوان تجريبي",
      "OBR|1||T1|CBC",
      "OBX|1|NM|WBC^White Blood Cells||12.4|10^3/uL|6-17|N",
      "OBX|2|NM|HGB^Hemoglobin||14.2|g/dL|12-18|N",
      "OBX|3|NM|PLT^Platelets||320|10^3/uL|200-500|N",
    ].join("\r") + "\r";
    const id = await repo.ingestDeviceMessage(link.token, sample).catch(() => null);
    if (id) { playSuccess(); toast.success("وصلت رسالة تجريبية — افتحها من صندوق المختبر داخل أي سجل حيوان"); }
    else { playWarning(); toast.error("تعذّر إرسال الرسالة التجريبية"); }
  };

  const active = links.filter((l) => !l.revoked);

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400"><Radio size={18} /></span>
        <h2 className="font-bold text-ink">ربط أجهزة المختبر عبر الشبكة</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-ink-subtle">
        الجهاز بغرفة والسستم بغرفة ثانية؟ أضف جهاز من تحت وحمّل <b>تطبيق الربط</b> — تطبيق صغير بواجهة عربية، يدوّر على الجهاز بشبكة العيادة
        ويربطه بنفسه. بلا ترمنل ولا إعدادات ولا نسخ رموز. بعدها كل نتيجة يطلعها الجهاز توصل لصندوق المختبر هنا، وتربطها بالحيوان بضغطة.
      </p>

      {/* الأجهزة المربوطة */}
      {active.length > 0 && (
        <div className="mb-4 space-y-2">
          {active.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 p-2.5">
              <Cable size={15} className="text-teal-600 dark:text-teal-400" />
              <span className="text-sm font-bold text-ink">{l.name}</span>
              <span className="text-2xs text-ink-subtle">
                {l.last_seen_at ? `آخر اتصال: ${new Date(l.last_seen_at).toLocaleString("ar")}` : "لم يتصل بعد"}
              </span>
              <div className="ms-auto flex items-center gap-1.5">
                <button type="button" onClick={() => sendTest(l)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:text-ink" title="رسالة تجريبية"><Send size={13} /> تجربة</button>
                <button type="button" onClick={() => downloadKit(l)} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-1.5 text-2xs font-bold text-white transition hover:bg-teal-700"><Download size={13} /> حمّل التطبيق</button>
                {confirmRevoke === l.id ? (
                  <button type="button" onClick={() => void revoke(l.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-danger-600 px-2.5 py-1.5 text-2xs font-extrabold text-white transition hover:bg-danger-700"
                    title="اضغط مرة ثانية لتأكيد إلغاء الربط">
                    <Trash2 size={13} /> تأكيد الإلغاء؟
                  </button>
                ) : (
                  <button type="button" onClick={() => void revoke(l.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:text-danger-600" title="إلغاء الربط (يحتاج تأكيداً)"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
          {active.length >= 2 && (
            <p className="rounded-xl border border-dashed border-line p-2.5 text-2xs leading-relaxed text-ink-subtle">
              عندك {formatNum(active.length)} أجهزة؟ حمّل تطبيق كل جهاز بمجلد لحاله وشغّلهم سوا — كل واحد يفتح صفحته ويشتغل بالتوازي.
            </p>
          )}
        </div>
      )}

      {/* رمز الجهاز المضاف حديثاً — يُعرض مرة، مع خطوات التشغيل */}
      {fresh && (
        <div className="mb-4 space-y-3 rounded-2xl border border-teal-300 bg-teal-50/60 p-3 dark:border-teal-500/40 dark:bg-teal-500/10">
          <p className="text-2xs font-extrabold text-teal-800 dark:text-teal-200">✓ انضاف «{fresh.name}». حمّل تطبيق الربط — يجيء مقترناً بعيادتك، ما يحتاج أي إعداد:</p>
          <button type="button" onClick={() => downloadKit(fresh)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-teal-500 bg-teal-600 p-3.5 text-sm font-extrabold text-white transition hover:bg-teal-700">
            <Download size={17} /> حمّل تطبيق الربط
          </button>
          <ol className="list-decimal space-y-1 ps-5 text-2xs leading-relaxed text-ink-muted">
            <li>ثبّت <b>Node.js</b> على حاسوب قرب الجهاز مرة وحدة (تحميل مجاني من <code dir="ltr">nodejs.org</code> — الزر الأخضر LTS).</li>
            <li>
              <b className="text-danger-600">فُك ضغط الملف المنزّل أولاً</b> — كلك يمين ←{" "}
              <span dir="ltr">Extract All</span> (أو <span dir="ltr">Extract To</span> بـWinRAR)، وافتح المجلد الجديد.
              <br />
              <b>لا تضغط على ملف التشغيل وهو داخل المضغوط</b> — راح يطلع خطأ، لأن ويندوز يفكّ ملفاً واحداً بس ويترك الباقي.
            </li>
            <li>
              دبل-كلك على ملف التشغيل الي يناسب حاسوبك — <b>«تشغيل على ويندوز»</b> أو <b>«تشغيل على ماك»</b>.
              النظام راح يرفضه أول مرة لأنه منزّل من الإنترنت، وهذا طبيعي:
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                <li><b>ويندوز:</b> <span dir="ltr">More info ← Run anyway</span></li>
                <li>
                  <b>ماك:</b> اضغط <span dir="ltr">Done</span> (مو <span dir="ltr">Move to Trash</span>)، بعدين{" "}
                  <span dir="ltr">System Settings ← Privacy &amp; Security</span> ← انزل لقسم{" "}
                  <span dir="ltr">Security</span> ← <b><span dir="ltr">Open Anyway</span></b> ← ارجع دبل-كلك ←{" "}
                  <span dir="ltr">Open</span>
                </li>
              </ul>
              مرة وحدة بس — بعدها الدبل-كلك يكفي دائماً.
            </li>
            <li>راح تنفتح صفحة عربية بأربع خطوات — عبّي اسم الجهاز، واختر <b>«دوّر على الجهاز تلقائياً»</b>.</li>
            <li>خلص. شغّل تحليل بالجهاز، والنتيجة توصل لصندوق المختبر هنا لحالها.</li>
          </ol>
          <p className="rounded-xl bg-surface-1 p-2 text-2xs leading-relaxed text-ink-subtle">
            <b>شغّله على الحاسوب القريب من جهاز المختبر</b> — هو الي يحتاج يوصل للجهاز بالشبكة.
            والحزمة بيها ملفّا تشغيل + «اقرأني» + مجلد <code dir="ltr">program</code> فيه محرّك البرنامج، لا تحذفه.
          </p>
          <details className="text-2xs text-ink-subtle">
            <summary className="cursor-pointer font-bold">الرمز السري للجهاز (للحالات المتقدمة فقط)</summary>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-1 p-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap text-2xs font-black text-ink" dir="ltr">{fresh.token}</code>
              <button type="button" onClick={() => copyToken(fresh.token)} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-1.5 text-2xs font-bold text-white transition hover:bg-teal-700">
                {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "اننسخ" : "انسخ"}
              </button>
            </div>
          </details>
        </div>
      )}

      {/* إضافة جهاز */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input flex-1"
          placeholder="اسم الجهاز — مثال: جهاز CBC غرفة المختبر"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
        />
        <Button onClick={() => void add()} disabled={busy} leftIcon={<Plus size={16} />}>أضف جهاز</Button>
      </div>
    </div>
  );
}
