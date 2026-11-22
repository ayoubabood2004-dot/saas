// ============================================================================
// نافذةُ «طباعة» ملخّص الحالة — مالكُ النطاق `csht` (يُحمَّل كسولاً من غرفة الأقفاص ومن «الملخّص» بملف الحيوان).
//
// طلبُ المالك ٢٢/١١: «يطبعلي ورقة حسب الحجم الي يختاره الدكتور، فيها جميع معلومات العيادة والحالة وصاحبها، وشلون
// تم علاج الحالة بشكل كامل وأخذت جميع علاجاتها وشنو الجرع اللي انطتها، بشكل مرتّب، ونصائح صغيرة للمالك، ومكان ختم
// وتوقيع العيادة ومكان لتوقيع المالك». وقراراتُه: الأحجام A4 وA5 وLetter، والنصائحُ جاهزةٌ بنوع الحيوان ويعدّلها
// الطبيب، والورقةُ طبيّةٌ بلا مال، والطبيبُ يكتب ما يشاء قبل الطباعة.
//
// البياناتُ تُحضَّر **قبل** «اطبع» (من صفحة الحيوان كما حمّلتها، أو تُجلب هنا لغرفة الأقفاص) — والطباعةُ تفتح النافذةَ
// وتكتبها بالضغطة نفسِها (درسُ الراجيتة والواتساب: سفاري لا يفتح نافذةً بعد await). وقائمةٌ لم تصل خطأٌ يُقال مع «أعد»
// لا ورقةٌ ناقصة: ورقةُ علاجٍ بلا نصف جرعاتها تُصدَّق (CLAUDE.md). وحدَه سجلُّ الحركة (ساعاتُ الدخول والخروج) اختياريّ.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicLogo, getClinicName } from "@/lib/settings";
import { siteHost } from "@/lib/appUrl";
import { describeDbError } from "@/lib/errors";
import { cn, localISO } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { buildCaseModel, dayOf, stayRange, type CaseInput } from "@/lib/caseSummary";
import { buildCaseSheetHTML, openCaseSheet, PAPERS, type CaseSheet, type Paper } from "@/lib/caseSheetPrint";
import { composeSheet } from "@/lib/caseSheetCompose";
import type { Pet } from "@/types";

export interface CaseSheetData { pet: Pet; input: CaseInput }

const PAPER_KEY = "vp_case_paper";
const readPaper = (): Paper => {
  try { const v = localStorage.getItem(PAPER_KEY) as Paper | null; return v && PAPERS.includes(v) ? v : "a4"; } catch { return "a4"; }
};

export function CaseSheetDialog({ petId, admissionId = null, data = null, onClose }: {
  petId: string;
  /** إقامةٌ بعينها (بطاقةُ القفص) — الورقةُ تبدأ عليها. */
  admissionId?: string | null;
  /** ما حمّلته صفحةُ الحيوان — بلاه تُجلب البياناتُ هنا. */
  data?: CaseSheetData | null;
  onClose: () => void;
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
  const [parts, setParts] = useState({ vaccines: true, visits: true, notes: true, labs: true });
  const [tipsText, setTipsText] = useState<string | null>(null);
  const [doctorNote, setDoctorNote] = useState("");

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

  const sheetOf = (autoPrint: boolean): CaseSheet | null => (pet && model ? composeSheet({
    t, lang, pet, model, scope, paper, showDrugs, showDoseLog, parts, tips: (tipsText ?? "").split("\n"), doctorNote,
    clinic, doctor: user?.full_name ?? null, today, autoPrint,
  }) : null);
  const preview = useMemo(() => { const s = sheetOf(false); return s ? buildCaseSheetHTML(s) : ""; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pet, model, scope, paper, showDrugs, showDoseLog, parts, tipsText, doctorNote, clinic, lang]);

  const print = () => {
    const s = sheetOf(true);
    if (!s) return;
    playTap();
    // بالضغطة نفسِها: النافذةُ تُفتح وتُكتب الآن — لا await قبلها.
    if (!openCaseSheet(buildCaseSheetHTML(s))) { playWarning(); toast.error(t("csht.blocked")); }
  };
  const pickPaper = (p: Paper) => { playTap(); setPaper(p); try { localStorage.setItem(PAPER_KEY, p); } catch { /* swallow-ok: تفضيلٌ بالجهاز */ } };

  const chip = (on: boolean) => cn("inline-flex h-10 items-center rounded-2xl px-4 text-sm font-bold transition",
    on ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink");
  const toggle = (on: boolean, label: string, onChange: (v: boolean) => void, attr: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink" data-cs-opt={attr}>
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} onChange={(e) => { playTap(); onChange(e.target.checked); }} />
      {label}
    </label>
  );

  return (
    <Modal open onClose={onClose} size="full" title={pet ? `${t("csht.title")} — ${pet.name}` : t("csht.title")}>
      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-cs-failed>
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("csht.failed")} {failed}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : !pet || !model ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-subtle"><Loader2 size={16} className="animate-spin" /> {t("csht.loading")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-casesheet>
          <div className="space-y-4">
            {/* «اطبع» أوّلاً — ظاهرٌ بلا تمرير، والخياراتُ تحته تُغيّر المعاينةَ مباشرةً. */}
            <div className="flex gap-2">
              <Button className="flex-1" leftIcon={<Printer size={16} />} onClick={print} data-cs-print>{t("csht.print")}</Button>
              <Button variant="secondary" onClick={onClose}>{t("common.cancel", "إلغاء")}</Button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-ink-subtle">{t("csht.paper")}</p>
              <div className="flex flex-wrap gap-1.5">
                {PAPERS.map((p) => <button key={p} type="button" className={chip(paper === p)} onClick={() => pickPaper(p)} data-cs-paper={p}>{p === "letter" ? "Letter" : p.toUpperCase()}</button>)}
              </div>
            </div>
            {adm && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-ink-subtle">{t("csht.scope")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={chip(scope === "stay")} onClick={() => { playTap(); setScope("stay"); }} data-cs-scope="stay">{t("csht.scopeStay")}</button>
                  <button type="button" className={chip(scope === "all")} onClick={() => { playTap(); setScope("all"); }} data-cs-scope="all">{t("csht.scopeAll")}</button>
                </div>
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3">
              <p className="text-xs font-bold text-ink-subtle">{t("csht.parts")}</p>
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
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-bold text-ink-subtle">{t("csht.preview")} · {dayOf(today)}</p>
            <iframe title={t("csht.preview")} srcDoc={preview} className="h-[70vh] w-full rounded-2xl border border-line bg-white" data-cs-preview />
          </div>
        </div>
      )}
    </Modal>
  );
}
