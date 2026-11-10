/* ============================================================================
 * فتحُ حالة حقل (docs/field-cases-plan.md §٧-ب) — رفيقةُ نطاق flk، مسارُها /poultry/new.
 *
 * تصلها من «حالة جديدة» (زرّ «حقل الدواجن» يحمل معلومات الزبون المكتوبة) أو من «+ حالة حقل» بالقائمة. قسمُ الزبون
 * هو نفسُه (الاسم، الرقم، المحافظة، المنطقة — بمكوّناته ونصوصه)، وتحته ثلاثة: الحقل (حقولُ هذا الزبون للاختيار أو
 * جديد)، الوجبة (النوع، السلالة، الفقّاسة، **تاريخُ الوصول أو «عمرها اليوم»** — العمرُ ١ يومُ الوصول، القرار ١ —
 * والعددُ أو قاعاتُه)، والتحصين (برنامجُ العيادة، و«شنو انعطى بالفقّاسة؟» يُختم منجَزاً بيوم الوصول).
 *
 * والفتحُ بمرجعٍ ثابتٍ بالمسودّة (client_ref): «افتح» بعد انقطاعٍ يرجع الحالةَ نفسَها لا ثانية. وما كُتب مسودّةٌ على
 * الجهاز (useFormDraft) تُعرض «رجّعها/احذفها». وحقولُ الزبون تُسأل بالخادم (cust_key) — فشلُ السؤال يُقال، لا «ماكو
 * حقول» تُصدَّق (CLAUDE.md §٣).
 * وكانت مكوّناً كسولاً داخل «حالة جديدة» بنطاقٍ ثالث — وكلُّ نطاقٍ مملوك سطرٌ بحزمة الإقلاع (فسحتُها بايتات)، فصارت
 * صفحةً بنطاق الحقول نفسِه.
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bird, Plus, RefreshCw, Syringe, Trash2, User } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { GovernorateAreaPicker } from "@/components/GovernorateAreaPicker";
import { useAuth } from "@/contexts/AuthContext";
import { useFormDraft } from "@/lib/useFormDraft";
import { cn, localISO } from "@/lib/utils";
import { flockApi, type FlockFarmMatch, type FlockOpenInput } from "@/lib/flockApi";
import { addDays, ageOn } from "@/lib/flockMath";
import type { FlockKind, FlockProgram } from "@/lib/flockTypes";
import { flockError, newRef } from "./flockShared";

const BREEDS = ["Ross 308", "Cobb 500", "Hubbard", "Arbor Acres", "Hy-Line", "Lohmann", "ISA Brown"];
const KINDS: FlockKind[] = ["broiler", "layer", "breeder", "other"];

type Owner = { name: string; phone: string; governorate: string; area: string };
export interface FieldIntake {
  /** مرجعُ الفتح من الجهاز: ثابتٌ للمسودّة. */
  ref: string;
  farmId: string | null;
  farmName: string;
  kind: FlockKind;
  breed: string;
  hatchery: string;
  dateMode: "date" | "age";
  placedOn: string;
  ageToday: string;
  count: string;
  houses: { label: string; count: string }[];
  programId: string | null;
  /** خطواتُ البرنامج (بترتيب العمر) المعطاةُ بالفقّاسة. */
  atHatchery: number[];
}
type OpenDraft = { v: 1; owner: Owner; field: FieldIntake };

export const emptyFieldIntake = (today: string): FieldIntake => ({
  ref: newRef(), farmId: null, farmName: "", kind: "broiler", breed: "", hatchery: "", dateMode: "age", placedOn: today, ageToday: "",
  count: "", houses: [], programId: null, atHatchery: [],
});
/** هل كُتب شيءٌ بالحقل؟ النوعُ ونمطُ التاريخ افتراضيّان — اختيارُهما وحده ليس عملاً يُحفظ. */
export const fieldHasContent = (f: FieldIntake): boolean =>
  !!(f.farmId || f.farmName.trim() || f.breed.trim() || f.hatchery.trim() || f.ageToday.trim() || f.count.trim() || f.houses.some((h) => h.count.trim()) || f.programId);
const ownerTyped = (o: Owner, base: Owner) => (Object.keys(base) as (keyof Owner)[]).some((k) => o[k].trim() !== base[k].trim());

/* ── الصفحة: قسمُ الزبون + المسودّة ──────────────────────────────────────────── */
export function FlockOpenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const today = localISO();
  const prefill = (location.state as { ownerPrefill?: Partial<Owner> } | null)?.ownerPrefill;
  const base = useRef<Owner>({ name: prefill?.name ?? "", phone: prefill?.phone ?? "", governorate: prefill?.governorate ?? "", area: prefill?.area ?? "" }).current;
  const [owner, setOwner] = useState<Owner>(base);
  const [field, setField] = useState<FieldIntake>(() => emptyFieldIntake(today));
  const [formKey, setFormKey] = useState(0);
  const value = useMemo<OpenDraft>(() => ({ v: 1, owner, field }), [owner, field]);
  const draft = useFormDraft<OpenDraft>({
    scope: user ? { form: "flockopen", clinic: user.clinic_id ?? user.id, user: user.id } : null,
    value, isEmpty: (d) => !ownerTyped(d.owner, base) && !fieldHasContent(d.field),
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-flock-open-page>
      <button type="button" className="btn-ghost mb-2 px-2 py-1 text-sm" onClick={() => navigate(-1)} data-flock-back>
        <ArrowLeft size={18} className="rtl:rotate-180" /> {t("flk.back")}
      </button>
      <h1 className="text-xl font-extrabold text-ink">{t("flk.open.title")}</h1>
      <p className="mb-5 text-xs text-ink-subtle">{t("flk.open.subtitle")}
        {draft.saved !== "stopped" && <> · {t(draft.saved === "failed" ? "flk.open.draftFailed" : "flk.open.draftAuto")}</>}</p>

      {draft.offer && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10" data-flock-draft-offer>
          <span className="min-w-0 flex-1 font-bold text-ink">{t("flk.open.draftOffer", { time: new Date(draft.offer.savedAt).toLocaleString(), farm: draft.offer.data.field.farmName || draft.offer.data.owner.name || "—" })}</span>
          <Button size="sm" onClick={() => { const r = draft.take(); if (r) { setOwner(r.data.owner); setField(r.data.field); setFormKey((k) => k + 1); } }}>{t("flk.open.restore")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { const r = draft.dismiss(); if (r) toast.toast({ tone: "info", title: t("flk.open.discarded"), action: { label: t("flk.open.undo"), onClick: () => draft.restoreDismissed(r) } }); }}>{t("flk.open.discard")}</Button>
        </div>
      )}

      <div key={formKey} className="space-y-5">
        {/* قسمُ الزبون — نفسُه بحالة جديدة (نصوصُه من قاموسها البارد) */}
        <div className="card p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-ink"><User size={18} className="text-brand-600" /> {t("newCase.ownerSection")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">{t("newCase.ownerName")}</label>
              <input className="input" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} data-flock-owner-name /></div>
            <div><label className="label">{t("phone.ownerPhone")}</label>
              <PhoneInput value={owner.phone} onChange={(v) => setOwner((o) => ({ ...o, phone: v }))} /></div>
            <div className="sm:col-span-2">
              <GovernorateAreaPicker governorate={owner.governorate} area={owner.area} onChange={(g, a) => setOwner((o) => ({ ...o, governorate: g, area: a }))} />
            </div>
          </div>
        </div>
        <FlockIntake owner={owner} value={field} onChange={setField}
          onOpened={(id) => { draft.clear(); navigate(`/poultry/c/${id}`, { replace: true }); }} />
      </div>
    </div>
  );
}

/* ── الحقل والوجبة والتحصين ─────────────────────────────────────────────────── */
function FlockIntake({ owner, value: f, onChange, onOpened }: {
  owner: Owner; value: FieldIntake; onChange: (v: FieldIntake) => void; onOpened: (caseId: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const today = localISO();
  const set = (p: Partial<FieldIntake>) => onChange({ ...f, ...p });

  // حقولُ هذا الزبون — بالرقم أو الاسم، بعد توقّف الكتابة.
  const [farms, setFarms] = useState<FlockFarmMatch[] | null>(null);
  const [farmsErr, setFarmsErr] = useState(false);
  const seq = useRef(0);
  const who = `${owner.phone.trim()}|${owner.name.trim()}`;
  const lookup = () => {
    const phone = owner.phone.replace(/\D/g, "").length >= 7 ? owner.phone.trim() : null;
    const name = owner.name.trim() || null;
    const my = ++seq.current;
    if (!phone && !name) { setFarms(null); setFarmsErr(false); return; }
    setFarmsErr(false);
    flockApi.farmsFor(phone, name).then((r) => { if (my === seq.current) setFarms(r); }, () => { if (my === seq.current) { setFarms(null); setFarmsErr(true); } });
  };
  useEffect(() => { const h = window.setTimeout(lookup, 450); return () => window.clearTimeout(h); }, [who]); // eslint-disable-line react-hooks/exhaustive-deps
  // حقلٌ اختير ثمّ تبدّل الزبونُ تحته: لا يُفتح باسم زبونٍ آخر.
  useEffect(() => { if (f.farmId && farms && !farms.some((m) => m.farm.id === f.farmId)) set({ farmId: null }); }, [farms]); // eslint-disable-line react-hooks/exhaustive-deps

  // برامجُ العيادة — فشلُها يُقال.
  const [programs, setPrograms] = useState<FlockProgram[] | null>(null);
  const [progErr, setProgErr] = useState(false);
  const loadPrograms = () => { setProgErr(false); flockApi.programs().then(setPrograms, () => { setPrograms(null); setProgErr(true); }); };
  useEffect(loadPrograms, []);
  const program = programs?.find((p) => p.id === f.programId) ?? null;
  const steps = useMemo(() => [...(program?.steps ?? [])].sort((a, b) => a.age - b.age), [program]);

  const placedOn = f.dateMode === "age" ? (Number(f.ageToday) >= 1 ? addDays(today, -(Math.trunc(Number(f.ageToday)) - 1)) : "") : f.placedOn;
  const houseSum = f.houses.reduce((n, h) => n + (Number(h.count) > 0 ? Math.trunc(Number(h.count)) : 0), 0);
  const chosen = farms?.find((m) => m.farm.id === f.farmId) ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = async () => {
    setErr(null);
    if (!f.farmId && !f.farmName.trim() && !owner.area.trim()) { setErr(t("flk.open.needFarm")); return; }
    if (!placedOn) { setErr(t("flk.open.needDate")); return; }
    if (f.houses.length ? f.houses.some((h) => !(Number(h.count) >= 1)) : !(Number(f.count) >= 1)) { setErr(t("flk.open.needCount")); return; }
    const p: FlockOpenInput = {
      client_ref: f.ref,
      farm: f.farmId ? { id: f.farmId } : {
        name: f.farmName.trim() || owner.area.trim(), owner_name: owner.name.trim() || null, owner_phone: owner.phone.trim() || null,
        governorate: owner.governorate.trim() || null, area: owner.area.trim() || null, houses_count: f.houses.length || null,
      },
      case: { kind: f.kind, breed: f.breed.trim() || null, hatchery: f.hatchery.trim() || null, placed_on: placedOn, placed_count: f.houses.length ? null : Math.trunc(Number(f.count)) },
      houses: f.houses.map((h, i) => ({ label: h.label.trim() || t("flk.open.houseN", { n: i + 1 }), placed_count: Math.trunc(Number(h.count)) })),
      vax: steps.map((s, i) => ({ vaccine: s.vaccine, disease: s.disease, route: s.route, age: s.age, at_hatchery: f.atHatchery.includes(i), from_program: program?.id ?? null })),
    };
    setBusy(true);
    try {
      const r = await flockApi.openCase(p);
      if (r.replayed) toast.toast({ tone: "info", title: t("flk.open.replayed") });
      onOpened(r.case.id);
    } catch (e) { setErr(flockError(e, t)); }
    finally { setBusy(false); }
  };

  const chip = (on: boolean) => cn("chip text-xs", on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted");
  return (
    <div className="space-y-5" data-flock-intake>
      {/* ١ · الحقل */}
      <div className="card space-y-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink"><Bird size={18} className="text-brand-600" /> {t("flk.open.farm")}</h2>
        {farmsErr && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-danger-600" data-flock-farms-error>{t("flk.open.farmsFail")}
            <button type="button" className="font-bold underline" onClick={lookup}><RefreshCw size={13} className="inline" /> {t("flk.retry")}</button></p>
        )}
        {farms && farms.length > 0 && (
          <div className="space-y-2" data-flock-farms>
            <span className="label">{t("flk.open.ownerFarms")}</span>
            <div className="flex flex-wrap gap-1.5">
              {farms.map((m) => (
                <button key={m.farm.id} type="button" className={chip(f.farmId === m.farm.id)} onClick={() => set({ farmId: m.farm.id })} data-flock-farm={m.farm.id}>{m.farm.name}</button>
              ))}
              <button type="button" className={chip(!f.farmId)} onClick={() => set({ farmId: null })}>{t("flk.open.newFarm")}</button>
            </div>
            {chosen?.open_case && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm font-bold text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
                <span className="min-w-0 flex-1">{t("flk.open.openExists")}</span>
                <Button size="sm" variant="outline" onClick={() => navigate(`/poultry/c/${chosen.open_case}`)}>{t("flk.open.openIt")}</Button>
              </div>
            )}
          </div>
        )}
        {!f.farmId && (
          <label className="block"><span className="label">{t("flk.open.farmName")}</span>
            <input className="input" value={f.farmName} maxLength={120} placeholder={owner.area.trim() || t("flk.open.farmNameHint")} onChange={(e) => set({ farmName: e.target.value })} data-flock-farm-name />
          </label>
        )}
      </div>

      {/* ٢ · الوجبة */}
      <div className="card space-y-4 p-4 sm:p-5">
        <h2 className="font-bold text-ink">{t("flk.open.batch")}</h2>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => <button key={k} type="button" className={chip(f.kind === k)} onClick={() => set({ kind: k })} data-flock-kind={k}>{t(`flk.kind.${k}`)}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">{t("flk.breed")}</span>
            <input className="input" list="flock-breeds" value={f.breed} maxLength={60} onChange={(e) => set({ breed: e.target.value })} />
            <datalist id="flock-breeds">{BREEDS.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
          <label className="block"><span className="label">{t("flk.hatchery")}</span><input className="input" value={f.hatchery} maxLength={120} onChange={(e) => set({ hatchery: e.target.value })} /></label>
        </div>
        <div>
          <div className="mb-2 flex gap-1.5">
            <button type="button" className={chip(f.dateMode === "age")} onClick={() => set({ dateMode: "age" })}>{t("flk.open.byAge")}</button>
            <button type="button" className={chip(f.dateMode === "date")} onClick={() => set({ dateMode: "date" })}>{t("flk.open.byDate")}</button>
          </div>
          {f.dateMode === "age" ? (
            <input type="number" inputMode="numeric" min={1} max={800} className="input max-w-xs" value={f.ageToday} placeholder={t("flk.open.ageToday")} onChange={(e) => set({ ageToday: e.target.value })} data-flock-age-today />
          ) : (
            <input type="date" className="input max-w-xs" value={f.placedOn} max={addDays(today, 7)} onChange={(e) => set({ placedOn: e.target.value })} data-flock-placed-on />
          )}
          <p className="mt-1 text-2xs text-ink-subtle" data-flock-placed-echo>
            {placedOn ? t("flk.open.placedEcho", { day: `${Number(placedOn.slice(8, 10))}/${Number(placedOn.slice(5, 7))}`, age: ageOn(placedOn, today) }) : t("flk.open.ageHint")}
          </p>
        </div>
        {f.houses.length === 0 ? (
          <label className="block"><span className="label">{t("flk.open.count")}</span>
            <input type="number" inputMode="numeric" min={1} className="input max-w-xs" value={f.count} onChange={(e) => set({ count: e.target.value })} data-flock-count />
          </label>
        ) : (
          <div className="space-y-2">
            {f.houses.map((h, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="block min-w-0 flex-1"><span className="label">{t("flk.open.houseName")}</span><input className="input" value={h.label} maxLength={40} placeholder={t("flk.open.houseN", { n: i + 1 })} onChange={(e) => set({ houses: f.houses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></label>
                <label className="block w-28"><span className="label">{t("flk.open.houseCount")}</span><input type="number" inputMode="numeric" min={1} className="input" value={h.count} onChange={(e) => set({ houses: f.houses.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)) })} data-flock-house-count={i} /></label>
                <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:text-danger-600" aria-label={t("flk.delete")} onClick={() => set({ houses: f.houses.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
              </div>
            ))}
            <p className="text-sm font-bold text-ink">{t("flk.open.houseSum", { n: houseSum.toLocaleString() })}</p>
          </div>
        )}
        <Button size="sm" variant="outline" leftIcon={<Plus size={15} />} data-flock-add-house
          onClick={() => set({ houses: f.houses.length ? [...f.houses, { label: "", count: "" }] : [{ label: "", count: f.count }, { label: "", count: "" }], count: "" })}>
          {f.houses.length ? t("flk.open.addHouse") : t("flk.open.splitHouses")}
        </Button>
      </div>

      {/* ٣ · التحصين */}
      <div className="card space-y-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink"><Syringe size={18} className="text-brand-600" /> {t("flk.tab.vax")}</h2>
        {progErr ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-danger-600">{t("flk.open.programsFail")}
            <button type="button" className="font-bold underline" onClick={loadPrograms}>{t("flk.retry")}</button></p>
        ) : !programs ? (
          <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(!f.programId)} onClick={() => set({ programId: null, atHatchery: [] })}>{t("flk.open.noProgram")}</button>
              {programs.map((p) => (
                <button key={p.id} type="button" className={chip(f.programId === p.id)} data-flock-program={p.id}
                  onClick={() => set({ programId: p.id, atHatchery: [...p.steps].sort((a, b) => a.age - b.age).flatMap((s, i) => (s.at_hatchery ? [i] : [])) })}>
                  {p.name} · {t(`flk.kind.${p.kind}`)}
                </button>
              ))}
            </div>
            {programs.length === 0 && <p className="text-xs text-ink-muted">{t("flk.open.noPrograms")}</p>}
            {steps.length > 0 && (
              <div className="space-y-1" data-flock-program-steps>
                <span className="label">{t("flk.open.hatcheryQ")}</span>
                {steps.map((s, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={f.atHatchery.includes(i)} onChange={(e) => set({ atHatchery: e.target.checked ? [...f.atHatchery, i] : f.atHatchery.filter((x) => x !== i) })} />
                    <span className="min-w-0 flex-1">{t("flk.open.step", { age: s.age, vaccine: s.vaccine, route: t(`flk.route.${s.route}`) })}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {err && <p className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm font-bold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200" data-flock-intake-error>{err}</p>}
      <div className="flex justify-end">
        <Button size="lg" loading={busy} disabled={!!chosen?.open_case} onClick={() => void open()} data-flock-open>{t("flk.open.open")}</Button>
      </div>
    </div>
  );
}
