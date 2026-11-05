/* ============================================================================
 * مصمِّمُ الراجيتة بالإعدادات (0261): قالبٌ جاهز يُرسم من بيانات العيادة (الترويسة، الدكاترة، الدوام والأرقام، العلامة
 * المائية، لونُ الحبر) — أو صورةُ راجيتة العيادة خلفيةً تُسحب الخاناتُ على خطوطها، مع معايرة الطابعة للطباعة فوق
 * الراجيتة المطبوعة. والورقةُ بجانبه بمريضٍ تجريبيّ، كما ستُطبع.
 *
 *  • الحفظُ بشرط «كما فُتح» (rx_stale ⇒ يُقال ويُعاد آخرُ تصميم — بختمه، فالحفظُ التالي يمرّ)، والخروجُ بتعديلٍ لم يُحفظ يُسأل
 *    داخل النافذة، والنسخةُ الجديدة لا تنزل فوقه (holdUpdates: السحبُ والمنزلقاتُ والرفعُ ليست كتابةً يراها editing()).
 *  • فشلُ القراءة يُقال بـ«أعد المحاولة» لا يُبذر الافتراضيُّ كأنه تصميمُ العيادة (حفظُه كان يُرفض ويُضيّع ما بُني).
 *  • الصورُ تُرفع فوراً للدلو (مجلّدُ العيادة كما يؤكّده الخادم) والتصميمُ يحمل مسارَها؛ «رجّع الافتراضي» لا يمسّها،
 *    والحفظُ موقوفٌ حتى ينتهي **كلُّ** رفع (عدّادٌ لكلّ نوع — خانةٌ واحدة كان يفرّغها أوّلُ رفعٍ ينتهي فيُحفظ التصميمُ بلا الثاني
 *    ويُقال «انحفظ»)، والرفعُ موقوفٌ أثناء الحفظ، ورفعٌ عالق يُقطع بمهلة (كان يقفل «احفظ» للأبد). وصورةُ الراجيتة تُسطَّح على أبيض.
 *  • شعارُ الدائرة خانةٌ ثابتة بالجهة الثانية من الترويسة — ترفعه العيادةُ مرّةً (لا نحمل صورةَ شعارٍ رسميّ).
 *  • جدولٌ غائب (واجهةٌ قبل هجرتها): المعاينةُ تعمل والحفظُ موقوفٌ بجملةٍ تقوله.
 * رفيقٌ لنطاق rx: يُحمَّل كسولاً من مالكه (RxPad) وحدَه.
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
/* أيقوناتٌ بحزمة الإقلاع أصلاً (ChevronUp/Down، CloudUpload، Camera) أو مقسومةٌ قبلُ — أيقونةٌ كانت داخل قطعة صفحةٍ وصارت مشتركةً معنا
   تُقسم قطعةً تدخل قائمةَ تحميل الصفحة بحزمة الإقلاع (مقيس: ArrowUp وUpload، وImagePlus فصلت ExternalLink عن قطعتها). */
import { AlertTriangle, Camera, ChevronDown, ChevronUp, CloudUpload, Plus, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, Dialog, Segmented, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { prepareLogo, prepareUpload } from "@/lib/image";
import { describeUploadError, withTimeout } from "@/lib/errors";
import { cn, localISO } from "@/lib/utils";
import { holdUpdates } from "@/lib/inflight";
import { getClinicLogo, getClinicName, getClinicSocials, getClockFormat, getWorkHours } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { rxApi, isRxStale } from "@/lib/rxApi";
import { buildRxHTML, openRxPrint } from "@/lib/rxPrint";
import {
  RX_ACCENTS, RX_DEFAULT, RX_LIMITS, RX_PAPER, RX_SLOT_KEYS, RX_TICK_KEYS, cleanRxPad, hoursLine, sameRxPad,
  type RxFields, type RxPadConfig, type RxSlotKey, type RxTickKey,
} from "@/lib/rxLayout";
import { RX_FIT, RxPaper } from "./RxPaper";
import { rxDoc, rxErrorText, rxImageUrl, useRxLabels, useRxPad } from "./rxShared";

type HandleKey = `slot:${RxSlotKey}` | `tick:${RxTickKey}` | "body";
type UpKind = "bg" | "emblem";
/** رفعٌ عالق (شبكةٌ لا تجيب) يُقطع: «ما انرفعت» وتُعاد — بلا مهلة كان «احفظ» يبقى مقفولاً حتى تُغلق النافذة. */
const UPLOAD_MS = 90_000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function RxDesigner({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const pad = useRxPad();
  const [draft, setDraft] = useState<RxPadConfig | null>(null);
  const [base, setBase] = useState<RxPadConfig | null>(null);
  const [expect, setExpect] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<Record<UpKind, number>>({ bg: 0, emblem: 0 });
  const uploading = uploads.bg + uploads.emblem > 0;
  const [sel, setSel] = useState<HandleKey | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [resetAsk, setResetAsk] = useState(false);
  const [tab, setTab] = useState<"edit" | "paper">("edit");
  const { labels, failed: labelsFailed, retry: labelsRetry } = useRxLabels(draft?.lang ?? "en");

  /* أوّلُ فتح (وبعد «تغيّر من جهاز ثاني»): المحفوظُ، أو الافتراضيُّ ورقمُ هاتف الحساب بذرةً — **تعديلاً لم يُحفظ** (الأساسُ بلا
     البذرة): المعاينةُ تعرضه والطباعةُ تقرأ المحفوظ، فرقمٌ يظهر هنا ولا يُطبع كان يبقى بلا «احفظ» يقدر عليه. وفشلُ القراءة لا يبذر. */
  useEffect(() => {
    if (pad.status === "loading" || pad.status === "error" || draft) return;
    const c = pad.cfg;
    const seeded = !pad.row && c.phones.length === 0 && user?.phone ? { ...c, phones: [user.phone.trim()].filter(Boolean).slice(0, RX_LIMITS.phones) } : c;
    setDraft(seeded);
    setBase(c);
    setExpect(pad.row?.updated_at ?? null);
  }, [pad.status, pad.cfg, pad.row, draft, user?.phone]);

  const set = (patch: Partial<RxPadConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const sample: RxFields = useMemo(() => ({
    date: localISO(), name: t("rx.sample.name"), owner: t("rx.sample.owner"), age: t("rx.sample.age"), weight: t("rx.sample.weight"), kind: "canine",
  }), [t]);
  const title = t("rx.dTitle");
  const doctorName = draft?.doctors.find((d) => d.name)?.name ?? "";
  const html = useMemo(() => (draft ? buildRxHTML(rxDoc(draft, labels, sample, t("rx.sample.body"), doctorName, title)) : ""), [draft, labels, sample, t, doctorName, title]);
  const dirty = !!draft && !!base && !sameRxPad(cleanRxPad(draft, { allowData: !supabase }), cleanRxPad(base, { allowData: !supabase }));
  const missing = pad.status === "missing";
  /* تصميمٌ لم يُحفظ أو صورةٌ بالطريق: النسخةُ الجديدة تنتظر (خمولٌ طويل كان يعيد التحميل فيضيع ما سُحب ورُفع). */
  useEffect(() => (dirty || uploading ? holdUpdates(Infinity) : undefined), [dirty, uploading]);

  const save = async () => {
    if (!draft || missing || uploading || saving) return;
    setSaving(true);
    try {
      const row = await rxApi.savePad(draft, expect);
      setExpect(row.updated_at);
      setBase(row.cfg);
      setDraft(row.cfg);
      playSuccess();
      toast.success(t("rx.saved"));
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      if (isRxStale(e)) {
        toast.error(t("rx.staleD"));
        setDraft(null);
        pad.reload();
      } else {
        toast.error(t("rx.saveFailD"), rxErrorText(e, t));
      }
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: UpKind, file: File | undefined) => {
    if (!file || saving) return;
    const bump = (by: 1 | -1) => setUploads((u) => ({ ...u, [kind]: Math.max(0, u[kind] + by) }));
    bump(1);
    try {
      const prepared = kind === "emblem" ? await prepareLogo(file, { maxDim: 520 }) : await prepareUpload(file, { maxDim: 2000, quality: 0.82, background: "#ffffff" });
      const path = await withTimeout(rxApi.uploadImage(kind, prepared), UPLOAD_MS);
      setDraft((d) => (d ? (kind === "bg" ? { ...d, bgPath: path } : { ...d, emblemPath: path }) : d));
      playSuccess();
    } catch (e) {
      playWarning();
      toast.error(t("rx.uploadFail"), describeUploadError(e, t));
    } finally {
      bump(-1);
    }
  };

  /* صفحةُ المعايرة لصورة الراجيتة وحدها، وخاناتُها قيمٌ بلا عناوين — فلا تنتظر قاموسَ العناوين (كان فشلُه يُسكت الزرّ بلا كلمة). */
  const printCalibration = () => {
    if (!draft) return;
    /* نافذةُ الطباعة لا تطبع فائضاً (مربّعُ وصفةٍ أصغرُ من نصّ المثال) — فتقول لماذا بدل أن تقف صامتة. */
    if (!openRxPrint(buildRxHTML({ ...rxDoc(draft, labels, sample, t("rx.sample.body"), doctorName, title), overflowNote: t("rx.overflowPrint") }, { print: true, calibrate: true }))) {
      playWarning();
      toast.error(t("retail.popupBlocked"), t("retail.popupBlockedHint"));
    }
  };

  /* ورفعٌ بالطريق يُسأل أيضاً: الخروجُ يُضيّع الصورةَ التي اختيرت. */
  const confirmClose = () => {
    if (!dirty && !uploading) return true;
    setLeaveAsk(true);
    return false;
  };

  return (
    <>
      <Modal open onClose={onClose} size="full" title={t("rx.dTitle")} confirmClose={confirmClose}>
        {!draft && pad.status === "error" ? (
          <div className="grid h-60 place-items-center" data-rxd-loadfail>
            <div className="flex items-center gap-2 text-sm text-danger-700 dark:text-danger-300">
              <AlertTriangle size={16} /> <span>{t("rx.loadFail")}</span>
              <button className="font-semibold underline" onClick={pad.reload}>{t("common.retry")}</button>
            </div>
          </div>
        ) : !draft ? (
          <div className="grid h-60 place-items-center"><Spinner /></div>
        ) : (
          <div className="isolate" data-rx-designer={draft.mode}>
            <div className="mb-3 lg:hidden">
              <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-tab" value={tab} onChange={(v) => { playTap(); setTab(v); }}
                options={[{ value: "edit", label: t("rx.dTitle") }, { value: "paper", label: t("rx.tabPaper") }]} />
            </div>
            <div className="rxp-dcols grid gap-5">
              <div className={cn("min-w-0 space-y-3", tab === "paper" && "hidden lg:block")}>
                <Sec>
                  <Segmented className="max-w-full flex-wrap" layoutId="rxd-mode" value={draft.mode} onChange={(v) => { playTap(); set({ mode: v }); }}
                    options={[{ value: "template", label: t("rx.mode.template") }, { value: "image", label: t("rx.mode.image") }]} />
                  <p className="mt-2 text-xs text-ink-subtle">{t(`rx.modeHint.${draft.mode}`)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Labeled label={t("rx.paper")}>
                      <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-paper" value={draft.paper} onChange={(v) => set({ paper: v })}
                        options={[{ value: "a5", label: "A5" }, { value: "a4", label: "A4" }]} />
                    </Labeled>
                    <Labeled label={t("rx.lang")}>
                      <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-lang" value={draft.lang} onChange={(v) => set({ lang: v })}
                        options={[{ value: "en", label: t("rx.langEn") }, { value: "ar", label: t("rx.langAr") }]} />
                    </Labeled>
                  </div>
                </Sec>

                {draft.mode === "template" ? (
                  <TemplateControls draft={draft} set={set} uploads={uploads} saving={saving} onUpload={upload} />
                ) : (
                  <ImageControls draft={draft} set={set} uploads={uploads} saving={saving} onUpload={upload} sel={sel} onCalibrate={printCalibration} />
                )}

                <DoctorsSec draft={draft} set={set} />
              </div>

              <div className={cn("min-w-0", tab === "edit" && "rxp-offstage")}>
                <div className="rxp-stick rounded-3xl bg-surface-2 p-3 sm:p-5">
                  <p className="mb-2 text-center text-2xs font-semibold text-ink-subtle">{t("rx.preview")}</p>
                  {labelsFailed && (
                    <p className="mb-2 flex items-center justify-center gap-2 text-xs text-danger-700 dark:text-danger-300" data-rxd-labels-fail>
                      <AlertTriangle size={14} /> {t("rx.labelsFail")}
                      <button className="font-semibold underline" onClick={labelsRetry}>{t("common.retry")}</button>
                    </p>
                  )}
                  <RxPaper html={html} paper={draft.paper} title={title} style={RX_FIT}>
                    {draft.mode === "image" && <Handles draft={draft} setDraft={setDraft} sel={sel} setSel={setSel} />}
                  </RxPaper>
                </div>
              </div>
            </div>

            <div className="rxp-bleed sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface-1/95 px-5 py-3 backdrop-blur">
              <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={15} />} onClick={() => { playTap(); setResetAsk(true); }} data-rxd-reset>{t("rx.reset")}</Button>
              <div className="min-w-0 flex-1 text-xs">
                {missing && <span className="flex items-center gap-1.5 text-warn-700 dark:text-warn-300" data-rx-missing><AlertTriangle size={14} /> {t("rx.needsUpdate")}</span>}
              </div>
              <Button onClick={() => void save()} loading={saving} disabled={missing || pad.status !== "ready" || !dirty || uploading} data-rxd-save>{t("rx.save")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Dialog open={leaveAsk} onClose={() => setLeaveAsk(false)} size="sm" title={t("rx.leaveDesign")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLeaveAsk(false)}>{t("rx.stay")}</Button>
          <Button variant="danger" onClick={() => { setLeaveAsk(false); onClose(); }} data-rxd-leave>{t("rx.leaveDo")}</Button>
        </div>} />
      <Dialog open={resetAsk} onClose={() => setResetAsk(false)} size="sm" title={t("rx.resetTitle")} description={t("rx.resetHint")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setResetAsk(false)}>{t("rx.stay")}</Button>
          <Button onClick={() => {
            setDraft((d) => (d ? { ...cleanRxPad(RX_DEFAULT), emblemPath: d.emblemPath, bgPath: d.bgPath, phones: d.phones } : d));
            setResetAsk(false);
            playTap();
          }} data-rxd-reset-do>{t("rx.resetDo")}</Button>
        </div>} />
    </>
  );
}

/* ── أجزاءٌ صغيرة ─────────────────────────────────────────────────────────── */
function Sec({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-3.5">
      {title && <h3 className="mb-2.5 font-display text-sm font-bold text-ink">{title}</h3>}
      {children}
    </section>
  );
}
function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange, ...rest }: { label: string; checked: boolean; onChange: (v: boolean) => void; "data-t"?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm text-ink">
      <span className="min-w-0">{label}</span>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
    </label>
  );
}
/** `dir`: منزلقٌ معناه اتّجاهٌ على الورق (المعايرة يمين/يسار) **فيزيائيٌّ** — بواجهةٍ عربية كان طرفُه الأيمن سالباً فيزحزح الطباعةَ
 *  عكسَ ما يقوله عنوانُه، وكلُّ تجربةٍ ورقةُ راجيتةٍ مطبوعة. */
function Range({ label, value, min, max, step = 1, suffix = "", dir, onChange, onKeyDown, ...rest }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; dir?: "ltr"; onChange: (v: number) => void; onKeyDown?: (e: RKeyboardEvent<HTMLInputElement>) => void; "data-r"?: string }) {
  return (
    <label className="block py-1">
      <span className="flex items-center justify-between text-xs text-ink-muted"><span>{label}</span><span className="font-mono tabular-nums text-ink" dir="ltr">{value}{suffix}</span></span>
      <input type="range" className="mt-1 w-full accent-brand-600" dir={dir} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onKeyDown={onKeyDown} {...rest} />
    </label>
  );
}
/** `busy`: رفعُ هذا النوع بالطريق (يقوله)؛ `off`: موقوفٌ بلا كلمة (الحفظُ جارٍ). */
function ImagePick({ label, busy, off, onFile, accept = "image/png,image/jpeg,image/webp", ...rest }: { label: string; busy: boolean; off?: boolean; onFile: (f: File | undefined) => void; accept?: string; "data-up"?: string }) {
  const { t } = useTranslation();
  return (
    <label className={cn("btn-secondary cursor-pointer text-sm", (busy || off) && "pointer-events-none opacity-60")}>
      {busy ? <Spinner size={15} /> : <CloudUpload size={15} />} {busy ? t("rx.uploading") : label}
      <input type="file" accept={accept} className="hidden" disabled={busy || off} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }} {...rest} />
    </label>
  );
}

type Setter = (patch: Partial<RxPadConfig>) => void;

function TemplateControls({ draft, set, uploads, saving, onUpload }: { draft: RxPadConfig; set: Setter; uploads: Record<UpKind, number>; saving: boolean; onUpload: (k: UpKind, f: File | undefined) => void }) {
  const { t } = useTranslation();
  const logo = getClinicLogo();
  const emblem = rxImageUrl(draft.emblemPath);
  const hoursAuto = hoursLine(getWorkHours(), getClockFormat(), draft.lang === "ar" ? t("rx.lbl.am") : "am", draft.lang === "ar" ? t("rx.lbl.pm") : "pm");
  const socials = getClinicSocials();
  const handles = [socials.facebook, socials.instagram].map((s) => (s || "").trim()).filter(Boolean);
  return (
    <>
      <Sec title={t("rx.sec.header")}>
        <div className="space-y-3">
          <Labeled label={t("rx.clinicName")}>
            <input className="input h-10 text-sm" dir="auto" value={draft.title} maxLength={RX_LIMITS.title} placeholder={getClinicName()} onChange={(e) => set({ title: e.target.value })} data-rxd="title" />
          </Labeled>
          <Labeled label={t("rx.subtitle")}>
            <input className="input h-10 text-sm" dir="auto" value={draft.subtitle} maxLength={RX_LIMITS.subtitle} placeholder={t("rx.subtitlePh")} onChange={(e) => set({ subtitle: e.target.value })} data-rxd="subtitle" />
          </Labeled>
          <Labeled label={t("rx.font")}>
            <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-font" value={draft.font} onChange={(v) => set({ font: v })}
              options={(["ruqaa", "naskh", "kufi"] as const).map((f) => ({ value: f, label: t(`rx.fontName.${f}`) }))} />
          </Labeled>
          <div className="rounded-xl bg-surface-2 p-2.5">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white">
                {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Camera size={18} className="text-ink-subtle/60" />}
              </div>
              <div className="min-w-0 flex-1">
                <Toggle label={t("rx.showLogo")} checked={draft.showLogo} onChange={(v) => set({ showLogo: v })} data-t="showLogo" />
                {!logo && <p className="text-2xs text-ink-subtle">{t("rx.noLogo")}</p>}
              </div>
            </div>
            <div className="mt-2">
              <span className="label">{t("rx.logoSide")}</span>
              <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-side" value={draft.logoSide} onChange={(v) => set({ logoSide: v })}
                options={[{ value: "right", label: t("rx.side.right") }, { value: "left", label: t("rx.side.left") }]} />
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2.5">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white">
                {emblem ? <img src={emblem} alt="" className="h-full w-full object-contain" /> : <span className="h-7 w-7 rounded-full border border-dashed border-line-strong" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t("rx.emblem")}</p>
                <p className="text-2xs text-ink-subtle">{t("rx.emblemHint")}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ImagePick label={emblem ? t("rx.change") : t("rx.emblemUpload")} busy={uploads.emblem > 0} off={saving} onFile={(f) => onUpload("emblem", f)} data-up="emblem" />
              {emblem && <button className="chip bg-surface-1 text-xs font-semibold text-danger-600 hover:bg-danger-50" onClick={() => set({ emblemPath: null })} data-rxd="emblem-remove"><Trash2 size={13} /> {t("common.remove")}</button>}
            </div>
          </div>
        </div>
      </Sec>

      <Sec title={t("rx.sec.contact")}>
        <div className="space-y-3">
          <Labeled label={t("rx.address")}>
            <input className="input h-10 text-sm" dir="auto" value={draft.address} maxLength={RX_LIMITS.address} placeholder={t("rx.addressPh")} onChange={(e) => set({ address: e.target.value })} data-rxd="address" />
          </Labeled>
          <Labeled label={t("rx.phones")}>
            <div className="space-y-2">
              {draft.phones.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input h-10 flex-1 text-sm" dir="ltr" inputMode="tel" value={p} maxLength={RX_LIMITS.phone}
                    onChange={(e) => set({ phones: draft.phones.map((x, j) => (j === i ? e.target.value : x)) })} data-rxd={`phone-${i}`} />
                  <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-subtle hover:bg-surface-2 hover:text-danger-600" aria-label={t("rx.removeRow")} onClick={() => set({ phones: draft.phones.filter((_, j) => j !== i) })}><X size={16} /></button>
                </div>
              ))}
              {draft.phones.length < RX_LIMITS.phones && (
                <button className="chip bg-surface-2 text-xs font-semibold text-ink-muted hover:text-ink" onClick={() => set({ phones: [...draft.phones, ""] })} data-rxd="phone-add"><Plus size={13} /> {t("rx.addPhone")}</button>
              )}
            </div>
          </Labeled>
          <Labeled label={t("rx.hours")}>
            <select className="input h-10 py-1.5 text-sm" value={draft.hours} onChange={(e) => set({ hours: e.target.value as RxPadConfig["hours"] })} data-rxd="hours">
              {(["auto", "custom", "off"] as const).map((h) => <option key={h} value={h}>{t(`rx.hoursMode.${h}`)}</option>)}
            </select>
            {draft.hours === "auto" && <p className="mt-1.5 text-xs text-ink-muted" dir="ltr">{hoursAuto || <span dir="auto">{t("rx.hoursNone")}</span>}</p>}
            {draft.hours === "custom" && (
              <input className="input mt-2 h-10 text-sm" dir="auto" value={draft.hoursText} maxLength={RX_LIMITS.hoursText} placeholder={t("rx.hoursPh")} onChange={(e) => set({ hoursText: e.target.value })} data-rxd="hoursText" />
            )}
          </Labeled>
          <div>
            <Toggle label={t("rx.socials")} checked={draft.socials} onChange={(v) => set({ socials: v })} data-t="socials" />
            <p className="text-2xs text-ink-subtle" dir="auto">{handles.length ? handles.join(" · ") : t("rx.socialsNone")}</p>
          </div>
        </div>
      </Sec>

      <Sec title={t("rx.sec.patient")}>
        <Toggle label={t("rx.showOwner")} checked={draft.owner} onChange={(v) => set({ owner: v })} data-t="owner" />
        <Toggle label={t("rx.showWeight")} checked={draft.weight} onChange={(v) => set({ weight: v })} data-t="weight" />
        <Toggle label={t("rx.signature")} checked={draft.signature} onChange={(v) => set({ signature: v })} data-t="signature" />
      </Sec>

      <Sec title={t("rx.sec.wm")}>
        <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-wm" value={draft.wm.src} onChange={(v) => set({ wm: { ...draft.wm, src: v } })}
          options={(["logo", "emblem", "none"] as const).map((s) => ({ value: s, label: t(`rx.wm.${s}`) }))} />
        {draft.wm.src !== "none" && (
          <div className="mt-2">
            <Range label={t("rx.wm.size")} value={draft.wm.size} min={15} max={95} suffix="%" onChange={(v) => set({ wm: { ...draft.wm, size: v } })} data-r="wm-size" />
            <Range label={t("rx.wm.opacity")} value={draft.wm.opacity} min={2} max={30} suffix="%" onChange={(v) => set({ wm: { ...draft.wm, opacity: v } })} data-r="wm-opacity" />
            <Range label={t("rx.wm.y")} value={draft.wm.y} min={15} max={85} suffix="%" onChange={(v) => set({ wm: { ...draft.wm, y: v } })} data-r="wm-y" />
            <Toggle label={t("rx.wm.gray")} checked={draft.wm.gray} onChange={(v) => set({ wm: { ...draft.wm, gray: v } })} data-t="wm-gray" />
          </div>
        )}
      </Sec>

      <Sec title={t("rx.sec.color")}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rx.colorHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {RX_ACCENTS.map((c) => (
            <button key={c} onClick={() => set({ accent: c })} aria-label={c} aria-pressed={draft.accent === c}
              className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface-1 transition", draft.accent === c ? "ring-2 ring-brand-500" : "hover:scale-105")}
              style={{ backgroundColor: c }} data-rxd-accent={c} />
          ))}
          <label className="chip cursor-pointer bg-surface-2 text-xs font-semibold text-ink-muted">
            <input type="color" className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" value={draft.accent} onChange={(e) => set({ accent: e.target.value })} />
            {t("rx.customColor")}
          </label>
        </div>
      </Sec>
    </>
  );
}

function ImageControls({ draft, set, uploads, saving, onUpload, sel, onCalibrate }: {
  draft: RxPadConfig; set: Setter; uploads: Record<UpKind, number>; saving: boolean; onUpload: (k: UpKind, f: File | undefined) => void; sel: HandleKey | null; onCalibrate: () => void;
}) {
  const { t } = useTranslation();
  const bg = rxImageUrl(draft.bgPath);
  return (
    <>
      <Sec title={t("rx.sec.bg")}>
        <div className="flex items-center gap-3">
          <div className="grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
            {bg ? <img src={bg} alt="" className="h-full w-full object-cover" /> : <Camera size={18} className="text-ink-subtle/60" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <ImagePick label={bg ? t("rx.bgChange") : t("rx.bgUpload")} busy={uploads.bg > 0} off={saving} onFile={(f) => onUpload("bg", f)} data-up="bg" />
            <p className="text-2xs text-ink-subtle">{t("rx.bgHint")}</p>
          </div>
        </div>
        <div className="mt-3">
          <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rxd-fit" value={draft.bgFit} onChange={(v) => set({ bgFit: v })}
            options={[{ value: "fill", label: t("rx.fit.fill") }, { value: "contain", label: t("rx.fit.contain") }]} />
        </div>
      </Sec>

      <Sec title={t("rx.sec.place")}>
        <p className="mb-2 text-2xs text-ink-subtle">{t("rx.placeHint")}</p>
        <div className="grid grid-cols-2 gap-x-4">
          {RX_SLOT_KEYS.map((k) => (
            <Toggle key={k} label={t(`rx.slot.${k}`)} checked={draft.slots[k].on} onChange={(v) => set({ slots: { ...draft.slots, [k]: { ...draft.slots[k], on: v } } })} data-t={`slot-${k}`} />
          ))}
          {RX_TICK_KEYS.map((k) => (
            <Toggle key={k} label={t(`rx.tick.${k}`)} checked={draft.ticks[k].on} onChange={(v) => set({ ticks: { ...draft.ticks, [k]: { ...draft.ticks[k], on: v } } })} data-t={`tick-${k}`} />
          ))}
        </div>
        <Range label={t("rx.fontPt")} value={draft.fontPt} min={8} max={18} step={0.5} suffix="pt" onChange={(v) => set({ fontPt: v })} data-r="fontPt" />
        {sel && sel.startsWith("slot:") && (() => {
          const k = sel.slice(5) as RxSlotKey;
          const s = draft.slots[k];
          return <Range label={`${t(`rx.slot.${k}`)} ↔`} value={r1(s.w)} min={5} max={r1(100 - s.x)} step={0.5} suffix="%" onChange={(v) => set({ slots: { ...draft.slots, [k]: { ...s, w: v } } })} data-r="slot-w" />;
        })()}
      </Sec>

      <Sec title={t("rx.sec.printing")}>
        <div className="grid gap-2" role="radiogroup">
          {(["on", "off"] as const).map((v) => {
            const on = draft.bgPrint === (v === "on");
            return (
              <button key={v} role="radio" aria-checked={on} onClick={() => set({ bgPrint: v === "on" })} data-rxd-bgprint={v}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition", on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:text-ink")}>
                <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-600" : "border-line-strong")}>{on && <span className="h-2 w-2 rounded-full bg-brand-600" />}</span>
                {t(`rx.bgPrint.${v}`)}
              </button>
            );
          })}
        </div>
        {!draft.bgPrint && (
          <div className="mt-3 rounded-xl bg-surface-2 p-2.5">
            <p className="text-sm font-semibold text-ink">{t("rx.calib")}</p>
            <p className="mt-0.5 text-2xs text-ink-subtle">{t("rx.calibHint")}</p>
            <Range label={t("rx.nudgeX")} value={draft.nudge.x} min={-15} max={15} step={0.5} suffix=" mm" dir="ltr" onChange={(v) => set({ nudge: { ...draft.nudge, x: v } })} data-r="nudge-x" />
            {/* السهمُ لفوق يرفع الطباعة (قيمةٌ أصغر) والسهمُ لجوه ينزّلها — المنزلقُ يزيد القيمةَ بالسهم لفوق فكان يزحزح عكسَ عنوانه. */}
            <Range label={t("rx.nudgeY")} value={draft.nudge.y} min={-15} max={15} step={0.5} suffix=" mm" onChange={(v) => set({ nudge: { ...draft.nudge, y: v } })}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const by = (e.shiftKey ? 2 : 0.5) * (e.key === "ArrowUp" ? -1 : 1);
                set({ nudge: { ...draft.nudge, y: clamp(r1(draft.nudge.y + by), -15, 15) } });
              }} data-r="nudge-y" />
            <Button size="sm" variant="outline" leftIcon={<Printer size={15} />} onClick={onCalibrate} data-rxd-calib>{t("rx.calibPrint")}</Button>
          </div>
        )}
      </Sec>
    </>
  );
}

function DoctorsSec({ draft, set }: { draft: RxPadConfig; set: Setter }) {
  const { t } = useTranslation();
  const docs = draft.doctors;
  const put = (i: number, patch: Partial<RxPadConfig["doctors"][number]>) => set({ doctors: docs.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ doctors: next });
  };
  return (
    <Sec title={t("rx.sec.doctors")}>
      {docs.length === 0 && <p className="mb-2 text-2xs text-ink-subtle">{t("rx.noDoctors")}</p>}
      <div className="space-y-2.5">
        {docs.map((d, i) => (
          <div key={i} className="rounded-xl bg-surface-2 p-2.5" data-rxd-doctor={i}>
            <div className="flex items-center gap-1.5">
              <input className="input h-10 flex-1 text-sm" dir="auto" value={d.name} maxLength={RX_LIMITS.docName} placeholder={t("rx.docNamePh")} aria-label={t("rx.docName")} onChange={(e) => put(i, { name: e.target.value })} data-rxd="doc-name" />
              <button className="grid h-9 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-surface-1 hover:text-ink disabled:opacity-30" aria-label={t("rx.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={16} /></button>
              <button className="grid h-9 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-surface-1 hover:text-ink disabled:opacity-30" aria-label={t("rx.moveDown")} disabled={i === docs.length - 1} onClick={() => move(i, 1)}><ChevronDown size={16} /></button>
              <button className="grid h-9 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-danger-50 hover:text-danger-600" aria-label={t("rx.removeRow")} onClick={() => set({ doctors: docs.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
            <textarea className="input rxp-lines2 mt-2 py-2 text-sm" dir="auto" rows={2} value={d.lines} maxLength={RX_LIMITS.docLines}
              placeholder={t("rx.docLinesPh")} aria-label={t("rx.docLines")} onChange={(e) => put(i, { lines: e.target.value.split("\n").slice(0, 2).join("\n") })} data-rxd="doc-lines" />
          </div>
        ))}
      </div>
      {docs.length < RX_LIMITS.doctors && (
        <button className="chip mt-2.5 bg-surface-2 text-xs font-semibold text-ink-muted hover:text-ink" onClick={() => set({ doctors: [...docs, { name: "", lines: "" }] })} data-rxd="doc-add"><Plus size={13} /> {t("rx.addDoctor")}</button>
      )}
    </Sec>
  );
}

/* ── مقابضُ صورة الراجيتة: سحبٌ بالمؤشّر (والإصبع)، وأسهمُ لوحة المفاتيح تزحزح نصفَ درجة (Shift: درجتين) ──────────── */
function Handles({ draft, setDraft, sel, setSel }: {
  draft: RxPadConfig;
  setDraft: (f: (d: RxPadConfig | null) => RxPadConfig | null) => void;
  sel: HandleKey | null;
  setSel: (k: HandleKey | null) => void;
}) {
  const { t } = useTranslation();
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: HandleKey; mode: "move" | "size"; sx: number; sy: number; start: RxPadConfig } | null>(null);
  /* ارتفاعُ سطر الخانة نسبةً من الصفحة: حجمُ الخطّ × ١٫٢٥ بالمليمتر. */
  const lineH = (draft.fontPt * 1.25 * 0.3528 / RX_PAPER[draft.paper].h) * 100;

  const apply = (s: RxPadConfig, key: HandleKey, mode: "move" | "size", dx: number, dy: number): RxPadConfig => {
    if (key === "body") {
      const b = s.body;
      return mode === "move"
        ? { ...s, body: { ...b, x: r1(clamp(b.x + dx, 0, 100 - b.w)), y: r1(clamp(b.y + dy, 0, 100 - b.h)) } }
        : { ...s, body: { ...b, w: r1(clamp(b.w + dx, 10, 100 - b.x)), h: r1(clamp(b.h + dy, 8, 100 - b.y)) } };
    }
    if (key.startsWith("tick:")) {
      const k = key.slice(5) as RxTickKey;
      const p = s.ticks[k];
      return { ...s, ticks: { ...s.ticks, [k]: { ...p, x: r1(clamp(p.x + dx, 0, 98)), y: r1(clamp(p.y + dy, 0, 98)) } } };
    }
    const k = key.slice(5) as RxSlotKey;
    const sl = s.slots[k];
    return mode === "move"
      ? { ...s, slots: { ...s.slots, [k]: { ...sl, x: r1(clamp(sl.x + dx, 0, 100 - sl.w)), y: r1(clamp(sl.y + dy, 0, 98)) } } }
      : { ...s, slots: { ...s.slots, [k]: { ...sl, w: r1(clamp(sl.w + dx, 5, 100 - sl.x)) } } };
  };

  const down = (e: RPointerEvent, key: HandleKey, mode: "move" | "size") => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    /* preventDefault يمنع التركيزَ مع الضغطة: الأسهمُ كانت تحرّك آخرَ ما رُكّز عليه (حجمُ الخطّ) لا الخانةَ المختارة. */
    (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-handle]")?.focus({ preventScroll: true });
    setSel(key);
    drag.current = { key, mode, sx: e.clientX, sy: e.clientY, start: draft };
  };
  /* السحبُ يكتب **الخانةَ المسحوبة وحدها** فوق المسودّة الحالية — لقطةُ بداية السحب كاملةً كانت ترجّع ما تغيّر أثناءه (صورةٌ رُفعت). */
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const el = layer.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / r.width) * 100;
    const dy = ((e.clientY - d.sy) / r.height) * 100;
    const nx = apply(d.start, d.key, d.mode, dx, dy);
    setDraft((cur) => {
      if (!cur) return cur;
      if (d.key === "body") return { ...cur, body: nx.body };
      if (d.key.startsWith("tick:")) { const k = d.key.slice(5) as RxTickKey; return { ...cur, ticks: { ...cur.ticks, [k]: nx.ticks[k] } }; }
      const k = d.key.slice(5) as RxSlotKey;
      return { ...cur, slots: { ...cur.slots, [k]: nx.slots[k] } };
    });
  };
  const up = () => { drag.current = null; };
  const key = (e: RKeyboardEvent, k: HandleKey) => {
    const step = e.shiftKey ? 2 : 0.5;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = map[e.key];
    if (!v) return;
    e.preventDefault();
    setSel(k);
    setDraft((d) => (d ? apply(d, k, "move", v[0], v[1]) : d));
  };

  return (
    <div ref={layer} className="absolute inset-0" onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => setSel(null)} data-rxd-handles>
      {RX_SLOT_KEYS.filter((k) => draft.slots[k].on).map((k) => {
        const s = draft.slots[k];
        const hk = `slot:${k}` as HandleKey;
        const on = sel === hk;
        return (
          <div key={k} role="button" tabIndex={0} aria-label={t(`rx.slot.${k}`)} onKeyDown={(e) => key(e, hk)}
            className={cn("rxp-h", on && "is-on")}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${Math.max(lineH, 2)}%` }}
            onPointerDown={(e) => down(e, hk, "move")} data-handle={hk}>
            <span className="rxp-chip">{t(`rx.slot.${k}`)}</span>
            <span className="rxp-grip" onPointerDown={(e) => down(e, hk, "size")} data-grip={hk} />
          </div>
        );
      })}
      {RX_TICK_KEYS.filter((k) => draft.ticks[k].on).map((k) => {
        const p = draft.ticks[k];
        const hk = `tick:${k}` as HandleKey;
        return (
          <div key={k} role="button" tabIndex={0} aria-label={t(`rx.tick.${k}`)} onKeyDown={(e) => key(e, hk)}
            className={cn("rxp-t", sel === hk && "is-on")}
            style={{ left: `${p.x}%`, top: `${p.y}%` }} onPointerDown={(e) => down(e, hk, "move")} data-handle={hk}>
            ✓
            <span className="rxp-tchip">{t(`rx.tick.${k}`)}</span>
          </div>
        );
      })}
      {(() => {
        const b = draft.body;
        const on = sel === "body";
        return (
          <div role="button" tabIndex={0} aria-label={t("rx.boxLabel")} onKeyDown={(e) => key(e, "body")}
            className={cn("rxp-h rxp-box", on && "is-on")}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
            onPointerDown={(e) => down(e, "body", "move")} data-handle="body">
            <span className="rxp-chip">{t("rx.boxLabel")}</span>
            <span className="rxp-corner" onPointerDown={(e) => down(e, "body", "size")} data-grip="body" />
          </div>
        );
      })()}
    </div>
  );
}
