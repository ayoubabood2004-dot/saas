// ============================================================================
// نافذةُ «طباعة» ملخّص الحالة — مالكُ النطاق `csht` (يُحمَّل كسولاً من غرفة الأقفاص ومن «الملخّص» بملف الحيوان).
//
// طلبُ المالك ٢٢/١١: «يطبعلي ورقة حسب الحجم الي يختاره الدكتور، فيها جميع معلومات العيادة والحالة وصاحبها، وشلون
// تم علاج الحالة بشكل كامل وأخذت جميع علاجاتها وشنو الجرع اللي انطتها، بشكل مرتّب، ونصائح صغيرة للمالك، ومكان ختم
// وتوقيع العيادة ومكان لتوقيع المالك». وقراراتُه: الأحجام A4 وA5 وLetter، والنصائحُ جاهزةٌ بنوع الحيوان ويعدّلها
// الطبيب، والورقةُ طبيّةٌ بلا مال، والطبيبُ يكتب ما يشاء قبل الطباعة.
//
// وبعدها («تقرير الفندقة»): «الدكتور يكدر يعدّل كل شيء وكل كلمة مكتوبة، ويضلّ الورقة الشكل الي عدّله محفوظ، بحيث يعرف
// بعد فترة هو شنو عدّل وشنو نطى للزبون آخر مرّة». فالمعاينةُ نفسُها تُكتب: كلُّ كلمةٍ بمفتاحها الثابت (caseSheetPrint)،
// والتعديلُ يُلتقط بلا إعادة رسم (المؤشّرُ لا يقفز)، ويتلوّن على الشاشة وحدها. وكلُّ طباعةٍ تُحفظ (0287) كما انطبعت مع
// ما عُدّل فيها، و«المطبوعة» تعرضها بتعديلاتها («كان ← صار») وتطبعها كما هي أو يُعدَّل عليها. وتعديلاتُ آخر تقريرٍ تعود
// لنصوصها إن بقي نصُّ النظام تحتها كما كان («يضلّ الشكل الي عدّله»)، وتُشال بضغطة.
//
// البياناتُ تُحضَّر **قبل** «اطبع» — والطباعةُ تفتح النافذةَ وتكتبها بالضغطة نفسِها (درسُ الراجيتة والواتساب: سفاري لا
// يفتح نافذةً بعد await)، ثمّ يُحفظ التقريرُ بمعرّفٍ من الجهاز (إعادةُ الحفظ بعد ردٍّ ضائع لا تكتب صفّاً ثانياً). وقائمةٌ لم
// تصل خطأٌ يُقال مع «أعد» لا ورقةٌ ناقصة. وحدَه سجلُّ الحركة (ساعاتُ الدخول والخروج) اختياريّ.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicLogo, getClinicName } from "@/lib/settings";
import { siteHost } from "@/lib/appUrl";
import { describeDbError } from "@/lib/errors";
import { cn, formatDate, formatTime, localISO, uuid } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { buildCaseModel, dayOf, stayRange, type CaseInput } from "@/lib/caseSummary";
import {
  applyEdits, buildCaseSheetHTML, openCaseSheet, PAPERS, revertEdits, sheetTexts,
  type CaseSheet, type Edits, type Paper,
} from "@/lib/caseSheetPrint";
import { composeSheet, labelEdits } from "@/lib/caseSheetCompose";
import type { CaseReport, CaseReportHead, CaseReportNew } from "@/lib/caseReportsApi";
import type { Pet } from "@/types";

export interface CaseSheetData { pet: Pet; input: CaseInput }

const PAPER_KEY = "vp_case_paper";
const readPaper = (): Paper => {
  try { const v = localStorage.getItem(PAPER_KEY) as Paper | null; return v && PAPERS.includes(v) ? v : "a4"; } catch { return "a4"; }
};
/** بابُ التقارير كسولٌ (0287) — لا يدخل قطعةَ النافذة ولا الإقلاع. */
const loadMod = () => import("@/lib/caseReportsApi");

type SaveState =
  | { s: "idle" }
  | { s: "saving"; fp: string }
  | { s: "saved"; at: string; fp: string }
  | { s: "failed"; row: CaseReportNew; fp: string; err: string };

export function CaseSheetDialog({ petId, admissionId = null, data = null, onClose, startTab = "sheet" }: {
  petId: string;
  /** إقامةٌ بعينها (بطاقةُ القفص) — الورقةُ تبدأ عليها. */
  admissionId?: string | null;
  /** ما حمّلته صفحةُ الحيوان — بلاه تُجلب البياناتُ هنا. */
  data?: CaseSheetData | null;
  onClose: () => void;
  /** «المطبوعة» من الملخّص تفتح على سجلّ التقارير. */
  startTab?: "sheet" | "printed";
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const lang = i18n.language;
  const today = localISO();
  const [loaded, setLoaded] = useState<CaseSheetData | null>(data);
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [pad, setPad] = useState<{ address: string; phones: string[] } | null>(null);
  const [paper, setPaper] = useState<Paper>(readPaper);
  const [scope, setScope] = useState<"stay" | "all">(admissionId ? "stay" : "all");
  const [showDrugs, setShowDrugs] = useState(true);
  const [showDoseLog, setShowDoseLog] = useState(true);
  const [showDays, setShowDays] = useState(true);
  const [parts, setParts] = useState({ vaccines: true, visits: true, notes: true, labs: true });
  const [tipsText, setTipsText] = useState<string | null>(null);
  const [doctorNote, setDoctorNote] = useState("");
  const [tab, setTab] = useState<"sheet" | "printed">(startTab);

  useEffect(() => {
    if (data) { setLoaded(data); return; }
    let alive = true;
    setFailed(null);
    void (async () => {
      try {
        const [pet, vaccines, treatments, clinicVisits, visits, admissions, notes, labs, appointments, weights] = await Promise.all([
          repo.getPet(petId), repo.listVaccinations(petId), repo.listTreatments(petId), repo.listClinicVisitsForPet(petId),
          repo.listVisits(petId), repo.listAdmissionsForPet(petId), repo.listPetNotes(petId), repo.listLabResults(petId),
          repo.listAppointmentsForPet(petId), repo.listWeights(petId),
        ]);
        // ساعاتُ الدخول والخروج وحدها اختياريّة: بلاها يُطبع اليومُ وحده.
        const movements = await repo.listPetMovements(petId).catch(() => []);   /* swallow-ok: الساعةُ زيادةٌ على اليوم المطبوع */
        if (!alive) return;
        if (!pet) throw new Error("pet_not_found");
        setLoaded({ pet, input: { vaccines, treatments, clinicVisits, visits, admissions, movements, notes, labs, media: [], appointments, weights } });
      } catch (e) { if (alive) setFailed(describeDbError(e, t)); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, tick, data]);

  // عنوانُ العيادة وهواتفُها من ترويسة الراجيتة إن حُفظت — زيادةٌ على الاسم، فغيابُها لا يوقف الورقة.
  useEffect(() => {
    let alive = true;
    void import("@/lib/rxApi").then((m) => m.rxApi.getPad())
      .then((p) => { if (alive && p) setPad({ address: p.cfg.address ?? "", phones: p.cfg.phones ?? [] }); })
      .catch(() => { /* swallow-ok: الترويسةُ بالاسم والهاتف تكفي */ });
    return () => { alive = false; };
  }, []);

  // ── سجلُّ التقارير المطبوعة (0287): قائمةٌ لم تصل تُقال، وجدولٌ غائب (واجهةٌ سبقت هجرتها) يُخفي السجلَّ بصمت ──
  const [reports, setReports] = useState<CaseReportHead[] | null>(null);
  const [repState, setRepState] = useState<"loading" | "ok" | "missing" | "failed">("loading");
  const [repErr, setRepErr] = useState("");
  const [repTick, setRepTick] = useState(0);
  const [limit, setLimit] = useState(0);
  useEffect(() => {
    let alive = true;
    setRepState("loading");
    void (async () => {
      try {
        const m = await loadMod();
        try {
          const xs = await m.caseReportsApi.listForPet(petId);
          if (alive) { setReports(xs); setLimit(m.REPORTS_LIMIT); setRepState("ok"); }
        } catch (e) {
          if (!alive) return;
          if (m.isReportsMissing(e)) setRepState("missing");
          else { setRepErr(describeDbError(e, t)); setRepState("failed"); }
        }
      } catch (e) { if (alive) { setRepErr(describeDbError(e, t)); setRepState("failed"); } }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, repTick]);

  const pet = loaded?.pet ?? null;
  useEffect(() => {
    if (pet && tipsText === null) setTipsText(t(`csht.tips.${pet.species}`, { defaultValue: t("csht.tips.other") }));
  }, [pet, tipsText, t]);

  const adm = loaded ? (admissionId ? loaded.input.admissions.find((x) => x.id === admissionId) : loaded.input.admissions.find((x) => x.status === "active")) ?? null : null;
  const model = useMemo(() => (loaded
    ? buildCaseModel({ ...loaded.input, admissions: scope === "stay" && adm ? [adm] : loaded.input.admissions }, { today, range: scope === "stay" && adm ? stayRange(adm, today) : null })
    : null), [loaded, scope, adm, today]);

  const clinic = useMemo<CaseSheet["clinic"]>(() => ({
    name: getClinicName() || user?.full_name || t("visit.clinicFallback", "عيادة بيطرية"),
    lines: [pad?.address ?? "", [...(pad?.phones ?? []), ...(pad?.phones?.length ? [] : user?.phone ? [user.phone] : [])].filter(Boolean).join(" · ")],
    logoUrl: getClinicLogo(), site: siteHost(),
  }), [pad, user, t]);

  // ── الورقةُ كما يولّدها النظام: من البيانات الآن، أو («عدّل عليها») من تقريرٍ مطبوع بنصّ نظامه الأصليّ ──
  const [base, setBase] = useState<CaseReport | null>(null);
  const fresh = useMemo<CaseSheet | null>(() => (pet && model ? composeSheet({
    t, lang, pet, model, scope, paper, showDrugs, showDoseLog, showDays, parts, tips: (tipsText ?? "").split("\n"), doctorNote,
    clinic, doctor: user?.full_name ?? null, today, autoPrint: false,
  }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [pet, model, scope, paper, showDrugs, showDoseLog, showDays, parts, tipsText, doctorNote, clinic, lang]);
  const generated = useMemo<CaseSheet | null>(() => {
    if (!base?.sheet) return fresh;
    // تاريخُ الطباعة تاريخُ اليوم: نسخةٌ تُطبع اليوم لا تحمل تاريخَ طباعتها الأولى.
    const g = revertEdits(base.sheet, base.edits);
    const now = formatDate(new Date().toISOString(), lang, true);
    return { ...g, paper, autoPrint: false, meta: g.meta.map((f) => (f.key === "printed" ? { ...f, value: now } : f)) };
  }, [base, fresh, paper, lang]);
  const genTexts = useMemo(() => (generated ? sheetTexts(generated) : new Map<string, string>()), [generated]);
  const genTextsRef = useRef(genTexts);
  genTextsRef.current = genTexts;

  // ── التعديلات: مرجعٌ يُكتب بالكتابة نفسِها (بلا إعادة رسمٍ للمعاينة — المؤشّرُ لا يقفز)، و`epoch` لما يتغيّر من خارجها ──
  const editsRef = useRef<Edits>({});
  const [epoch, setEpoch] = useState(0);
  const [editTick, setEditTick] = useState(0);
  const [carried, setCarried] = useState<string | null>(null);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || repState !== "ok" || !reports) return;
    seeded.current = true;
    const last = reports[0];
    if (!last?.edits.length || Object.keys(editsRef.current).length) return;
    editsRef.current = Object.fromEntries(last.edits.map((e) => [e.k, e]));
    setCarried(last.created_at);
    setEpoch((n) => n + 1);
  }, [repState, reports]);
  const applied = useMemo(() => (generated ? applyEdits(generated, editsRef.current).applied : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generated, epoch, editTick]);
  const preview = useMemo(() => {
    if (!generated) return "";
    const r = applyEdits(generated, editsRef.current);
    return buildCaseSheetHTML(r.sheet, { editable: true, marks: new Set(r.applied.map((e) => e.k)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated, epoch]);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const onFrameLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    // «نصٌّ فقط» يمنع لصقَ التنسيق؛ متصفّحٌ لا يعرفه (فايرفوكس قديم) يأخذ التحريرَ العاديّ ولصقاً يُنظَّف هنا.
    let plain = true;
    try { const probe = doc.createElement("span"); probe.contentEditable = "plaintext-only"; plain = probe.contentEditable === "plaintext-only"; } catch { plain = false; }
    if (!plain) {
      doc.querySelectorAll("[contenteditable]").forEach((el) => el.setAttribute("contenteditable", "true"));
      doc.addEventListener("paste", (e) => { e.preventDefault(); doc.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? ""); });
    }
    doc.addEventListener("input", (e) => {
      const el = (e.target as Element | null)?.closest?.("[data-k]") as HTMLElement | null;
      const k = el?.getAttribute("data-k");
      if (!el || !k) return;
      const from = genTextsRef.current.get(k);
      if (from === undefined) return;
      const to = el.innerText.replace(/ /g, " ").replace(/\n+$/, "");
      if (to === from) { delete editsRef.current[k]; el.removeAttribute("data-ed"); }
      else { editsRef.current[k] = { k, from, to }; el.setAttribute("data-ed", "1"); }
      setEditTick((n) => n + 1);
    });
  };
  const resetEdits = () => { playTap(); editsRef.current = {}; setCarried(null); setEpoch((n) => n + 1); };

  // ── الطباعة ثمّ الحفظ ──
  const [save, setSave] = useState<SaveState>({ s: "idle" });
  /** كلُّ ورقةٍ انحفظت بهذه النافذة (ببصمتها) — لا تُكتب ثانيةً. */
  const savedFps = useRef(new Set<string>());
  /** الحالُ المعروض حالُ آخرِ حفظٍ بدأ: حفظٌ أقدمُ يرجع متأخّراً لا يقول «انحفظت» فوق حفظٍ ما زال يجري. */
  const saveSeq = useRef(0);
  const [closeAsk, setCloseAsk] = useState(false);
  const doSave = async (row: CaseReportNew, fp: string) => {
    const my = ++saveSeq.current;
    const show = (st: SaveState) => { if (my === saveSeq.current) setSave(st); };
    show({ s: "saving", fp });
    try {
      const m = await loadMod();
      try {
        const head = await m.caseReportsApi.add(row);
        savedFps.current.add(fp);
        show({ s: "saved", at: head.created_at, fp });
        if (my === saveSeq.current) setCloseAsk(false);
        setReports((xs) => [head, ...(xs ?? []).filter((x) => x.id !== head.id)]);
        if (repState === "failed") setRepTick((n) => n + 1);
      } catch (e) {
        if (m.isReportsMissing(e)) { setRepState("missing"); show({ s: "idle" }); return; }
        show({ s: "failed", row, fp, err: describeDbError(e, t) });
      }
    } catch (e) { show({ s: "failed", row, fp, err: describeDbError(e, t) }); }
  };
  const print = () => {
    if (!generated || !pet) return;
    playTap();
    const r = applyEdits({ ...generated, autoPrint: true }, editsRef.current);
    // بالضغطة نفسِها: النافذةُ تُفتح وتُكتب الآن — لا await قبلها.
    if (!openCaseSheet(buildCaseSheetHTML(r.sheet))) { playWarning(); toast.error(t("csht.blocked")); return; }
    if (repState === "missing") return;
    const row: CaseReportNew = {
      id: uuid(), pet_id: pet.id,
      admission_id: base ? base.admission_id : scope === "stay" ? adm?.id ?? null : null,
      scope: base ? base.scope : scope, paper, sheet: r.sheet, edits: labelEdits(r.applied, generated, t),
      author_name: user?.full_name ?? null,
    };
    // طباعةٌ ثانية للورقة نفسِها بلا تغيير (ورقةٌ علقت بالطابعة) لا تكتب تقريراً ثانياً — وبعد حفظٍ فشل تُعيده بمعرّفه
    // نفسِه: ردٌّ ضاع والصفُّ مكتوب ⇒ 23505 ⇒ يُعدّ محفوظاً، لا صفٌّ ثانٍ بمعرّفٍ جديد.
    const fp = JSON.stringify([row.paper, row.sheet.title, row.sheet.clinic, row.sheet.meta, row.sheet.blocks, row.sheet.signatures, row.sheet.footer, row.edits]);
    if (savedFps.current.has(fp) || (save.s === "saving" && save.fp === fp)) return;
    void doSave(save.s === "failed" && save.fp === fp ? save.row : row, fp);
  };
  const retrySave = () => { if (save.s === "failed") { playTap(); void doSave(save.row, save.fp); } };
  const requestClose = () => {
    // ورقةٌ انطبعت وما انحفظت: الخروجُ يُسأل — «شنو نطى للزبون» يضيع بصمتٍ لو خرج.
    if (save.s === "failed" && !closeAsk) { playWarning(); setCloseAsk(true); setTab("sheet"); return; }
    onClose();
  };
  const pickPaper = (p: Paper) => { playTap(); setPaper(p); try { localStorage.setItem(PAPER_KEY, p); } catch { /* swallow-ok: تفضيلٌ بالجهاز */ } };

  // ── «المطبوعة»: التقريرُ يُجلب كاملاً حين يُفتح، ويُعرض بتعديلاته ──
  const [view, setView] = useState<{ id: string; rep: CaseReport | null; err?: string } | null>(null);
  const openReport = async (id: string) => {
    playTap();
    setView({ id, rep: null });
    try {
      const m = await loadMod();
      const rep = await m.caseReportsApi.get(id);
      setView((v) => (v?.id === id ? { id, rep: rep?.sheet ? rep : null, ...(rep?.sheet ? {} : { err: t("csht.viewMissing") }) } : v));
    } catch (e) { setView((v) => (v?.id === id ? { id, rep: null, err: describeDbError(e, t) } : v)); }
  };
  const viewHtml = useMemo(() => (view?.rep?.sheet ? buildCaseSheetHTML(view.rep.sheet, { marks: new Set(view.rep.edits.map((e) => e.k)) }) : ""), [view]);
  const reprint = () => {
    const sh = view?.rep?.sheet;
    if (!sh) return;
    playTap();
    if (!openCaseSheet(buildCaseSheetHTML({ ...sh, autoPrint: true }))) { playWarning(); toast.error(t("csht.blocked")); }
  };
  const editFrom = () => {
    const rep = view?.rep;
    if (!rep?.sheet) return;
    playTap();
    setBase(rep);
    setPaper(rep.paper);
    editsRef.current = Object.fromEntries(rep.edits.map((e) => [e.k, e]));
    setCarried(null);
    setEpoch((n) => n + 1);
    setTab("sheet");
  };
  const leaveBase = () => { playTap(); setBase(null); setEpoch((n) => n + 1); };

  const when = (iso: string) => `${formatDate(iso, lang, true)} · ${formatTime(iso, lang)}`;
  const chip = (on: boolean) => cn("inline-flex h-10 items-center rounded-2xl px-4 text-sm font-bold transition",
    on ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink");
  const toggle = (on: boolean, label: string, onChange: (v: boolean) => void, attr: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink" data-cs-opt={attr}>
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} onChange={(e) => { playTap(); onChange(e.target.checked); }} />
      {label}
    </label>
  );
  const showHistory = repState !== "missing";
  const nReports = reports?.length ?? 0;

  const saveLine = save.s === "saving" ? (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-subtle" data-cs-save="saving"><Loader2 size={13} className="animate-spin" /> {t("csht.saving")}</p>
  ) : save.s === "saved" ? (
    <p className="text-xs font-bold text-success-700 dark:text-success-300" data-cs-save="saved">{t("csht.saved", { time: when(save.at) })}</p>
  ) : save.s === "failed" ? (
    <div className="space-y-1.5 rounded-xl border border-danger-200 bg-danger-50 p-2.5 dark:border-danger-500/30 dark:bg-danger-500/10" data-cs-save="failed">
      <p className="text-xs font-semibold text-danger-700 dark:text-danger-300">{closeAsk ? t("csht.closeAsk") : t("csht.saveFailed")} {save.err}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={retrySave} data-cs-retry>{t("csht.saveRetry")}</Button>
        {closeAsk && <Button size="sm" variant="ghost" onClick={onClose} data-cs-close-anyway>{t("csht.closeAnyway")}</Button>}
      </div>
    </div>
  ) : null;

  return (
    <Modal open onClose={requestClose} size="full" title={pet ? `${t("csht.title")} — ${pet.name}` : t("csht.title")}>
      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-cs-failed>
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("csht.failed")} {failed}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : !pet || !model || !generated ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-subtle"><Loader2 size={16} className="animate-spin" /> {t("csht.loading")}</p>
      ) : (
        <div className="space-y-3" data-casesheet>
          {showHistory && (
            <div className="flex flex-wrap gap-1.5" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "sheet"} className={chip(tab === "sheet")} onClick={() => { playTap(); setTab("sheet"); }} data-cs-tab="sheet">{t("csht.tabSheet")}</button>
              <button type="button" role="tab" aria-selected={tab === "printed"} className={chip(tab === "printed")} onClick={() => { playTap(); setTab("printed"); }} data-cs-tab="printed">
                {repState === "ok" ? t("csht.tabPrinted", { n: nReports }) : t("csht.tabPrintedBare")}
              </button>
            </div>
          )}
          {tab === "printed" && showHistory ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-cs-history>
              <div className="min-w-0 space-y-2">
                {repState === "loading" ? (
                  <p className="flex items-center gap-2 py-6 text-sm text-ink-subtle"><Loader2 size={15} className="animate-spin" /> {t("csht.loading")}</p>
                ) : repState === "failed" ? (
                  <div className="space-y-2 rounded-2xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10" data-cs-hist-failed>
                    <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("csht.histFailed")} {repErr}</p>
                    <Button size="sm" variant="secondary" onClick={() => { playTap(); setRepTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
                  </div>
                ) : !nReports ? (
                  <p className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink-subtle" data-cs-hist-empty>{t("csht.histEmpty")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {reports!.map((r, i) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => void openReport(r.id)} data-cs-report={r.id}
                          className={cn("w-full rounded-2xl border p-3 text-start transition",
                            view?.id === r.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-ink">{when(r.created_at)}</span>
                            {i === 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{t("csht.histLast")}</span>}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-muted">{r.title || t("csht.title")} · {r.paper === "letter" ? "Letter" : r.paper.toUpperCase()}</span>
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-2xs text-ink-subtle">
                            {r.author_name && <span>{t("csht.histBy", { name: r.author_name })}</span>}
                            <span className={r.edits.length ? "font-bold text-warn-700 dark:text-warn-300" : ""}>{r.edits.length ? t("csht.histEdits", { n: r.edits.length }) : t("csht.histNoEdits")}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* سقفُ القائمة يُقال لا يُخفى: «آخر مئة» لا «كلّها». */}
                {limit > 0 && nReports >= limit && <p className="text-2xs text-ink-subtle" data-cs-hist-more>{t("csht.histMore", { n: nReports })}</p>}
              </div>
              <div className="min-w-0 space-y-2">
                {!view ? (
                  <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-subtle">{t("csht.histPick")}</p>
                ) : !view.rep ? (
                  view.err
                    ? <p className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm font-semibold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300">{view.err}</p>
                    : <p className="flex items-center gap-2 py-6 text-sm text-ink-subtle"><Loader2 size={15} className="animate-spin" /> {t("csht.loading")}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button leftIcon={<Printer size={16} />} onClick={reprint} data-cs-reprint>{t("csht.reprint")}</Button>
                      <Button variant="secondary" onClick={editFrom} data-cs-edit-from>{t("csht.editFrom")}</Button>
                    </div>
                    <section className="space-y-1.5 rounded-2xl border border-line bg-surface-2 p-3" data-cs-view-edits>
                      <p className="text-xs font-bold text-ink-subtle">{t("csht.viewEdits")}</p>
                      {view.rep.edits.length === 0 ? (
                        <p className="text-sm text-ink-muted">{t("csht.viewNoEdits")}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {view.rep.edits.map((e) => (
                            <li key={e.k} className="rounded-xl bg-surface-1 p-2 text-sm" data-cs-edit-row={e.k}>
                              <p className="text-2xs font-bold text-ink-subtle">{e.label || e.k}</p>
                              <p className="text-ink-muted [overflow-wrap:anywhere]"><span className="font-bold">{t("csht.was")}</span> <span dir="auto" className="line-through decoration-danger-400">{e.from || "—"}</span></p>
                              <p className="text-ink [overflow-wrap:anywhere]"><span className="font-bold">{t("csht.now")}</span> <span dir="auto" className="whitespace-pre-line">{e.to || "—"}</span></p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <iframe title={t("csht.preview")} srcDoc={viewHtml} className="h-[70vh] w-full rounded-2xl border border-line bg-white" data-cs-view />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="space-y-4">
                {/* «اطبع» أوّلاً — ظاهرٌ بلا تمرير، والخياراتُ تحته تُغيّر المعاينةَ مباشرةً. */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button className="flex-1" leftIcon={<Printer size={16} />} onClick={print} data-cs-print>{t("csht.print")}</Button>
                    <Button variant="secondary" onClick={requestClose}>{t("common.cancel", "إلغاء")}</Button>
                  </div>
                  {saveLine}
                </div>
                {base && (
                  <div className="space-y-1.5 rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10" data-cs-base>
                    <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{t("csht.baseBanner", { date: when(base.created_at) })}</p>
                    <Button size="sm" variant="secondary" onClick={leaveBase} data-cs-base-leave>{t("csht.baseBack")}</Button>
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-ink-subtle">{t("csht.paper")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PAPERS.map((p) => <button key={p} type="button" className={chip(paper === p)} onClick={() => pickPaper(p)} data-cs-paper={p}>{p === "letter" ? "Letter" : p.toUpperCase()}</button>)}
                  </div>
                </div>
                {!base && adm && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-ink-subtle">{t("csht.scope")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={chip(scope === "stay")} onClick={() => { playTap(); setScope("stay"); }} data-cs-scope="stay">{t("csht.scopeStay")}</button>
                      <button type="button" className={chip(scope === "all")} onClick={() => { playTap(); setScope("all"); }} data-cs-scope="all">{t("csht.scopeAll")}</button>
                    </div>
                  </div>
                )}
                {!base && (
                  <>
                    <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3">
                      <p className="text-xs font-bold text-ink-subtle">{t("csht.parts")}</p>
                      {scope === "stay" && model.days.length > 0 && toggle(showDays, t("csht.showDays"), setShowDays, "days")}
                      {toggle(showDrugs, t("csht.showDrugs"), setShowDrugs, "drugs")}
                      {showDrugs && toggle(showDoseLog, t("csht.showDoseLog"), setShowDoseLog, "doselog")}
                      {toggle(parts.vaccines, t("csht.partVaccines"), (v) => setParts({ ...parts, vaccines: v }), "vaccines")}
                      {toggle(parts.visits, t("csht.partVisits"), (v) => setParts({ ...parts, visits: v }), "visits")}
                      {toggle(parts.notes, t("csht.partNotes"), (v) => setParts({ ...parts, notes: v }), "notes")}
                      {toggle(parts.labs, t("csht.partLabs"), (v) => setParts({ ...parts, labs: v }), "labs")}
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-ink-subtle">{t("csht.tipsTitle")}</span>
                      <textarea className="input min-h-[8rem] py-2 text-sm leading-relaxed" value={tipsText ?? ""} onChange={(e) => setTipsText(e.target.value)} data-cs-tips />
                      <span className="text-2xs text-ink-subtle">{t("csht.tipsHint")}</span>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-ink-subtle">{t("csht.doctorNoteTitle")}</span>
                      <textarea className="input min-h-[6rem] py-2 text-sm leading-relaxed" value={doctorNote} onChange={(e) => setDoctorNote(e.target.value)}
                        placeholder={t("csht.doctorNoteHint")} data-cs-note />
                    </label>
                  </>
                )}
              </div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-ink-subtle">{t("csht.preview")} · {dayOf(today)}</p>
                  {applied.length > 0 && (
                    <span className="flex items-center gap-2" data-cs-edits={applied.length}>
                      <span className="rounded-full bg-warn-100 px-2.5 py-0.5 text-xs font-bold text-warn-800 dark:bg-warn-500/20 dark:text-warn-200">{t("csht.editsN", { n: applied.length })}</span>
                      <button type="button" className="text-xs font-bold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={resetEdits} data-cs-reset>{t("csht.resetEdits")}</button>
                    </span>
                  )}
                </div>
                <p className="text-2xs leading-relaxed text-ink-subtle" data-cs-edit-hint>{t("csht.editHint")}</p>
                {carried && applied.length > 0 && !base && (
                  <p className="rounded-xl border border-warn-200 bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-cs-carried>
                    {t("csht.carried", { date: when(carried), n: applied.length })}
                  </p>
                )}
                <iframe ref={frameRef} title={t("csht.preview")} srcDoc={preview} onLoad={onFrameLoad} className="h-[70vh] w-full rounded-2xl border border-line bg-white" data-cs-preview />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
