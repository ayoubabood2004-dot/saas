/* ============================================================================
 * نافذةُ الراجيتة من سجلّ الحيوان (0261): خاناتُ المريض نازلةٌ من ملفّه، والوصفةُ نصٌّ حرّ يُكتب فيه كلُّ شيء — أو يُدرج
 * من منتقي الأدوية ومن آخر خطة علاج — والورقةُ بجانبه كما ستُطبع، ثم «اطبع الراجيتة».
 *
 *  • الطباعةُ نافذةٌ تُفتح **داخل الضغطة** قبل أيّ await (سفاري يمنع غيرَها بصمت) ويُكتب فيها المستندُ بالضغطة نفسها، ثم الحفظُ
 *    بسجلّ الحيوان. والمحفوظُ **لقطةُ ما انطبع** (بمعرّفها، rxApi): «احفظها بالسجل» بعد فشلٍ يحفظ الورقةَ التي خرجت لا المسودّةَ
 *    بعد تعديلها، وردٌّ ضائع ثمّ إعادةٌ لا تكتب صفّاً ثانياً. والحفظُ يُسمع: فشلُه يُقال ويبقى الزرّ، والخروجُ قبله يُسأل.
 *  • نافذةُ الطباعة حَكَم (rxPrint): قياسُ المعاينة لهذا المستند نفسِه ونهائيٌّ بلا فائض ⇒ الحفظُ فوراً؛ وإلا (كُتب حرفٌ قبل ربع
 *    ثانية، أو الخطوطُ لم تصل) ⇒ يُحفظ حين تقول النافذةُ «طبعتُ»، ولا يُحفظ ما رفضته لفائض (تقوله هي والشاشة).
 *  • «من خطة العلاج» قراءةٌ طازجة ترمي (rxApi.notes): «ما مسجّلة خطة» بعد قراءةٍ نجحت وحدها، والفشلُ «أعد المحاولة».
 *  • الجرعةُ تُكتب كما حُفظت (rxLines) — لا formatNum.
 *  • الراجيتةُ المطبوعة لا تتعدّل (المحفّز)؛ «أضفها هنا» تنسخ نصَّها لراجيتةٍ جديدة، والإلغاءُ للمدير بتأكيدٍ يقول ماذا يحصل.
 *  • لا autoFocus (med-entry-guard: المكوّنُ يرسم MedPicker)، والخروجُ بنصٍّ لم يُحفظ يُسأل داخل النافذة (لا window.confirm).
 * رفيقٌ لنطاق rx: يُحمَّل كسولاً من مالكه (RxPad) وحدَه.
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Ban, ClipboardList, CopyPlus, Pill, Printer, RotateCcw, Check, History } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, Dialog, Segmented, Spinner, useToast } from "@/components/ui";
import { MedPicker } from "@/components/meds/MedPicker";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { ageFromDOB, cn, formatDate, formatDec, localISO, uuid } from "@/lib/utils";
import { rxApi, isRxMissing, isRxStale, RX_NOTES_LIMIT, type RxNew, type RxRecord } from "@/lib/rxApi";
import { buildRxHTML, openRxPrint } from "@/lib/rxPrint";
import { RX_LIMITS, ageTextEn, cleanRxBody, rxDraftKey, rxKindOf, type RxFields, type RxKind, type RxLang } from "@/lib/rxLayout";
import { appendBlock, appendLines, hasDrugLine, latestPlan, pickDoctor, planLine, removeDrugLine, type RxPlan } from "@/lib/rxLines";
import type { Pet } from "@/types";
import { RX_FIT, RX_FIT_SCROLL, RxPaper, type RxLayoutInfo } from "./RxPaper";
import { rxDoc, rxErrorText, useRxLabels, useRxPad } from "./rxShared";

type HistState = { status: "loading" | "ready" | "error" | "missing"; list: RxRecord[] };
/** ما انطبع ولم يُحفظ بعد: لقطتُه كما خرجت ومعرّفُه (المفتاحُ يكشف إعادتَها). */
type Snap = { key: string; input: RxNew & { id: string } };
/* نوافذُ الطباعة المفتوحة ورسائلُها (PRINT_JS: «print» قبل الطباعة، «overflow» بدلها). على مستوى الوحدة لا المكوّن: حفظٌ ينتظر
   «طبعتُ» يكمل ولو أُغلقت النافذةُ الصغيرة قبلها. */
type PrintWatch = { onPrint?: () => void; onOverflow: () => void };
const watching = new Map<Window, PrintWatch>();
let listening = false;
function watchPrint(w: Window, h: PrintWatch) {
  watching.set(w, h);
  if (!listening) {
    listening = true;
    window.addEventListener("message", (e) => {
      const src = e.source as Window | null;
      const kind = (e.data as { rx?: unknown } | null)?.rx;
      const got = src ? watching.get(src) : undefined;
      if (!got || (kind !== "print" && kind !== "overflow")) return;
      watching.delete(src!);
      if (kind === "print") got.onPrint?.();
      else got.onOverflow();
    });
  }
  const iv = window.setInterval(() => { if (w.closed || !watching.has(w)) { watching.delete(w); window.clearInterval(iv); } }, 3000);
}
type PlanState = { status: "closed" } | { status: "loading" } | { status: "error" } | { status: "none" } | { status: "ready"; plan: RxPlan; picked: boolean[] };
const KIND_OPTS = ["canine", "feline", "exotic", "none"] as const;


export function RxSheet({ pet, visitId, onClose }: { pet: Pet; visitId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { role } = usePermissions();
  const pad = useRxPad();
  const cfg = pad.cfg;
  const { labels, ready: labelsReady, failed: labelsFailed, retry: labelsRetry, tp } = useRxLabels(cfg.lang);

  const [fields, setFields] = useState<RxFields | null>(null);
  const [body, setBody] = useState("");
  const [doctor, setDoctor] = useState("");
  const [tab, setTab] = useState<"write" | "paper">("write");
  const [layout, setLayout] = useState<RxLayoutInfo>({ pages: 1, overflow: false, final: false, html: "" });
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState<Snap[]>([]);
  const pendingRef = useRef<Snap[]>([]);
  const flushing = useRef(false);
  const alive = useRef(true);
  /* يُرفع بكلّ تركيب لا بأوّله وحده: StrictMode (والتركيبُ المعاد) ينادي التنظيفَ ثمّ الأثرَ ثانيةً — علمٌ يُطفأ ولا يُشعل كان يُسقط
     تحديثَ القائمة بعد كلّ حفظ. */
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [hist, setHist] = useState<HistState>({ status: "loading", list: [] });
  const histRef = useRef(hist);
  histRef.current = hist;
  const planSeq = useRef(0);
  const [histN, setHistN] = useState(0);
  const [medOpen, setMedOpen] = useState(false);
  const [plan, setPlan] = useState<PlanState>({ status: "closed" });
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [voidFor, setVoidFor] = useState<RxRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  /* خاناتُ المريض **بلغة الورقة** (مترجمُها tp بعد وصول قاموسها) — بعد وصول التصميم مرّةً واحدة؛ وبعدها هي ما كتبه الطبيب.
     والدكتورُ الموقّع: اسمُ الحساب بكلماتٍ كاملة ودكتورٌ واحدٌ طابق (pickDoctor) — لا تخمينٌ تحت التوقيع. */
  useEffect(() => {
    if (pad.status === "loading" || !labelsReady || fields) return;
    setFields(initialFields(pet, cfg.lang, tp));
    setDoctor(pickDoctor(user?.full_name, cfg.doctors.map((d) => d.name), t("rx.drTitles").split(",")));
  }, [pad.status, labelsReady, fields, pet, cfg, tp, t, user?.full_name]);

  useEffect(() => {
    let alive = true;
    setHist((h) => ({ ...h, status: "loading" }));
    rxApi.listForPet(pet.id).then(
      (list) => { if (alive) setHist({ status: "ready", list }); },
      (e: unknown) => { if (alive) setHist({ status: isRxMissing(e) ? "missing" : "error", list: [] }); },
    );
    return () => { alive = false; };
  }, [pet.id, histN]);

  const title = t("rx.docTitle", { name: fields?.name || pet.name });
  /* الورقةُ من النصّ **كما يُحفظ** (cleanRxBody: بلا محارف اتّجاهٍ خفيّة، وبسقفه) — فالورقةُ والسجلُّ نصٌّ واحد. */
  const clean = cleanRxBody(body);
  const tooLong = body.length > RX_LIMITS.body;
  const doc = useMemo(() => (fields ? rxDoc(cfg, labels, fields, clean, doctor, title) : null), [cfg, labels, fields, clean, doctor, title]);
  const html = useMemo(() => (doc ? buildRxHTML(doc) : ""), [doc]);
  const key = fields ? rxDraftKey(fields, clean, doctor) : "";
  const dirty = !!clean.trim() && key !== savedKey && !pending.some((p) => p.key === key);
  const canRecord = hist.status !== "missing" && pad.status !== "missing";
  /* قياسُ المعاينة يخصّ **هذا** المستند (لا ما قبل آخر حرف)؛ ومؤكَّدٌ = نهائيٌّ بعد الخطوط. */
  const measured = layout.html === html;
  const knownOverflow = measured && layout.overflow;

  const setField = <K extends keyof RxFields>(k: K, v: RxFields[K]) => setFields((f) => (f ? { ...f, [k]: v } : f));

  /** سطرٌ حُفظ يدخل القائمة **إن كانت قائمةَ الخادم**: قائمةٌ فشلت أو ما زالت تُقرأ تُقرأ من جديد (فيها هو) — لا «سابقة (1)» كاذبة. */
  const mergeHistory = (rec: RxRecord) => {
    const h = histRef.current;
    if (h.status === "ready") setHist({ status: "ready", list: [rec, ...h.list.filter((x) => x.id !== rec.id)] });
    else if (h.status !== "missing") setHistN((x) => x + 1);
  };

  /** يحفظ ما انطبع ولم يُحفظ، بالترتيب، ويقف عند أوّل فشل (يبقى بالقائمة لـ«احفظها بالسجل»). يكمل ولو أُغلقت الشاشة. */
  const flush = async () => {
    if (flushing.current) return;
    flushing.current = true;
    if (alive.current) setSaving(true);
    try {
      while (pendingRef.current.length) {
        const snap = pendingRef.current[0];
        let rec: RxRecord;
        try {
          rec = await rxApi.add(snap.input);
        } catch (e) {
          if (alive.current) setSaveFailed(true);
          playWarning();
          toast.error(t("rx.saveFail"), rxErrorText(e, t));
          return;
        }
        pendingRef.current = pendingRef.current.filter((x) => x !== snap);
        if (alive.current) {
          setPending(pendingRef.current);
          setSavedKey(snap.key);
          setSaveFailed(false);
          mergeHistory(rec);
        }
        playSuccess();
        toast.success(t("rx.printed", { name: snap.input.pet_name }));
      }
    } finally {
      flushing.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const enqueue = (snap: Snap) => {
    if (!pendingRef.current.some((p) => p.key === snap.key)) pendingRef.current = [...pendingRef.current, snap];
    if (alive.current) setPending(pendingRef.current);
    void flush();
  };
  const overflowed = () => { playWarning(); toast.error(t("rx.overflowPrint")); };

  /* داخل الضغطة: النافذةُ ومستندُها أوّلاً (قبل أيّ await)، ثمّ السجلّ — بلقطة ما كُتب فيها. */
  const print = () => {
    if (!doc || !fields || !labelsReady || tooLong || knownOverflow) return;
    const w = openRxPrint(buildRxHTML({ ...doc, overflowNote: t("rx.overflowPrint") }, { print: true }));
    if (!w) {
      playWarning();
      toast.error(t("retail.popupBlocked"), t("retail.popupBlockedHint"));
      return;
    }
    if (!clean.trim()) { watchPrint(w, { onOverflow: overflowed }); toast.success(t("rx.printedBlank")); return; }
    const waiting = pendingRef.current.find((p) => p.key === key);
    if (!canRecord || key === savedKey || waiting) {
      watchPrint(w, { onOverflow: overflowed });
      if (waiting) void flush(); else toast.success(t("rx.printedOnly"));
      return;
    }
    const snap: Snap = { key, input: { id: uuid(), pet_id: pet.id, visit_id: visitId, pet_name: fields.name || pet.name, doctor_name: doctor, fields, body: clean } };
    if (measured && layout.final && !layout.overflow) {
      watchPrint(w, { onOverflow: overflowed });
      enqueue(snap);
    } else {
      /* المعاينةُ لم تقس هذا المستندَ بعد: النافذةُ تقرّر — «طبعتُ» ⇒ يُحفظ، «فائض» ⇒ لا ورقة ولا سجلّ. */
      watchPrint(w, { onPrint: () => enqueue(snap), onOverflow: overflowed });
    }
  };

  const reprint = (r: RxRecord) => {
    if (!labelsReady) return;
    playTap();
    const d = rxDoc(cfg, labels, r.fields, r.body, r.doctor_name, t("rx.docTitle", { name: r.fields.name || r.pet_name || pet.name }));
    /* بلا معاينة (التصميمُ ربما تغيّر بعدها): نافذةُ الطباعة تحرسها — لا تطبع فائضاً وتقوله. */
    const w = openRxPrint(buildRxHTML({ ...d, overflowNote: t("rx.overflowPrint") }, { print: true }));
    if (!w) {
      playWarning();
      toast.error(t("retail.popupBlocked"), t("retail.popupBlockedHint"));
      return;
    }
    watchPrint(w, { onOverflow: overflowed });
  };

  /* القراءةُ وحدَها (وزرُّ «أعد المحاولة» يناديها مباشرةً — لا عبر الفتح/الإغلاق، فنسخةُ الحالة القديمة بإغلاقٍ كانت تُغلق اللوحةَ بدل إعادتها).
     وكلُّ قراءةٍ برقمها: جوابٌ متأخّر بعد «أغلق» أو بعد قراءةٍ أحدث لا يفتح اللوحة ولا يرجّع الصحّ على ما شيله الطبيب. */
  const loadPlan = async () => {
    const my = ++planSeq.current;
    setPlan({ status: "loading" });
    try {
      const notes = await rxApi.notes(pet.id);
      if (my !== planSeq.current) return;
      const p = latestPlan(notes);
      /* بلا خطة وقد بلغت القراءةُ سقفَها: ربما الخطةُ أقدمُ مما وصل — «تعذّر» لا «ماكو». */
      setPlan(p ? { status: "ready", plan: p, picked: p.items.map(() => true) } : notes.length >= RX_NOTES_LIMIT ? { status: "error" } : { status: "none" });
    } catch {
      if (my === planSeq.current) setPlan({ status: "error" });
    }
  };
  const togglePlan = () => {
    if (plan.status !== "closed") { planSeq.current++; setPlan({ status: "closed" }); return; }
    playTap();
    void loadPlan();
  };
  /* الأيامُ بلغة الورقة (tp): السطرُ يُطبع عليها. */
  const planDays = (n: number) => tp("rx.days", { count: n });
  const insertPlan = () => {
    if (plan.status !== "ready") return;
    const lines = plan.plan.items.filter((_, i) => plan.picked[i]).map((it) => planLine(it, planDays));
    setBody((b) => appendLines(b, lines));
    planSeq.current++;
    setPlan({ status: "closed" });
    playTap();
  };

  const confirmVoid = async () => {
    if (!voidFor) return;
    setVoiding(true);
    try {
      const r = await rxApi.voidRx(voidFor.id, voidReason);
      setHist((h) => ({ ...h, list: h.list.map((x) => (x.id === r.id ? r : x)) }));
      setVoidFor(null);
      setVoidReason("");
      playTap();
    } catch (e) {
      playWarning();
      toast.error(rxErrorText(e, t));
      if (isRxStale(e)) { setVoidFor(null); setHistN((x) => x + 1); }
    } finally {
      setVoiding(false);
    }
  };

  /* الخروجُ يُسأل: مسودّةٌ لم تنطبع، أو **ورقةٌ انطبعت ولم تُحفظ** (ولو فرّغ الطبيبُ النصَّ بعدها). */
  const confirmClose = () => {
    if (!dirty && !pending.length) return true;
    setLeaveAsk(true);
    return false;
  };

  const isManager = role === "manager";
  const loading = pad.status === "loading" || !fields;

  return (
    <>
      <Modal open onClose={onClose} size="full" title={title} confirmClose={confirmClose}>
        {labelsFailed && !fields ? (
          <div className="grid h-60 place-items-center" data-rx-labels-fail>
            <div className="flex items-center gap-2 text-sm text-danger-700 dark:text-danger-300">
              <AlertTriangle size={16} /> <span>{t("rx.labelsFail")}</span>
              <button className="font-semibold underline" onClick={labelsRetry}>{t("common.retry")}</button>
            </div>
          </div>
        ) : loading ? (
          <div className="grid h-60 place-items-center"><Spinner /></div>
        ) : (
          <div className="isolate" data-rx-sheet>
            <div className="mb-3 lg:hidden">
              <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rx-tab" value={tab} onChange={(v) => { playTap(); setTab(v); }}
                options={[{ value: "write", label: t("rx.tabWrite") }, { value: "paper", label: t("rx.tabPaper") }]} />
            </div>
            <div className="rxp-cols grid gap-5">
              {/* ── الكتابة ── */}
              <div className={cn("min-w-0 space-y-4", tab === "paper" && "hidden lg:block")}>
                {pad.status === "error" && (
                  <div className="flex items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 p-2.5 text-xs text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1">{t("rx.loadFail")}</span>
                    <button className="font-semibold underline" onClick={pad.reload}>{t("common.retry")}</button>
                  </div>
                )}
                <section className="rounded-2xl border border-line bg-surface-1 p-3.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <TextField label={t("rx.f.name")} value={fields!.name} onChange={(v) => setField("name", v)} span data-f="name" />
                    {cfg.owner && <TextField label={t("rx.f.owner")} value={fields!.owner} onChange={(v) => setField("owner", v)} span data-f="owner" />}
                    <TextField label={t("rx.f.age")} value={fields!.age} onChange={(v) => setField("age", v)} data-f="age" />
                    {cfg.weight ? <TextField label={t("rx.f.weight")} value={fields!.weight} onChange={(v) => setField("weight", v)} data-f="weight" /> : <span />}
                    <label className="col-span-2 block sm:col-span-1">
                      <span className="label">{t("rx.f.date")}</span>
                      <input type="date" className="input h-10 py-1.5 text-sm" value={fields!.date} onChange={(e) => setField("date", e.target.value)} data-f="date" />
                    </label>
                    {cfg.doctors.length > 0 && (
                      <label className="col-span-2 block sm:col-span-1">
                        <span className="label">{t("rx.doctor")}</span>
                        <select className="input h-10 py-1.5 text-sm" value={doctor} onChange={(e) => setDoctor(e.target.value)} data-f="doctor">
                          <option value="">{t("rx.doctorNone")}</option>
                          {cfg.doctors.filter((d) => d.name).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="mt-3">
                    <span className="label">{t("rx.f.kind")}</span>
                    <Segmented className="max-w-full flex-wrap" size="sm" layoutId="rx-kind" value={(fields!.kind || "none") as (typeof KIND_OPTS)[number]}
                      onChange={(v) => { playTap(); setField("kind", (v === "none" ? "" : v) as RxKind); }}
                      options={KIND_OPTS.map((k) => ({ value: k, label: t(`rx.kind.${k}`) }))} />
                  </div>
                </section>

                <section className="rounded-2xl border border-line bg-surface-1 p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="me-auto font-display text-sm font-bold text-ink">{t("rx.body")}</span>
                    <Button size="sm" variant="secondary" leftIcon={<Pill size={15} />} onClick={() => { playTap(); setMedOpen(true); }} data-rx-drug>{t("rx.addDrug")}</Button>
                    <Button size="sm" variant={plan.status === "closed" ? "outline" : "secondary"} leftIcon={<ClipboardList size={15} />} onClick={togglePlan} data-rx-plan>{t("rx.fromPlan")}</Button>
                  </div>
                  {plan.status !== "closed" && <PlanPanel plan={plan} lang={i18n.language} t={t} days={planDays} onRetry={() => void loadPlan()}
                    onToggle={(i) => setPlan((p) => (p.status === "ready" ? { ...p, picked: p.picked.map((x, j) => (j === i ? !x : x)) } : p))}
                    onInsert={insertPlan} />}
                  <div className="relative">
                    <textarea
                      className="input rxp-body resize-y py-2.5 font-sans text-[15px] leading-7"
                      style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.75rem - 1px), rgb(var(--line) / .7) calc(1.75rem - 1px), rgb(var(--line) / .7) 1.75rem)", backgroundPositionY: "0.62rem", backgroundAttachment: "local" }}
                      dir="auto"
                      value={body}
                      maxLength={RX_LIMITS.body}
                      placeholder={t("rx.bodyPh")}
                      onChange={(e) => setBody(e.target.value)}
                      data-rx-body
                    />
                    {body.length > 6000 && <span className={cn("absolute bottom-2 end-3 text-2xs", tooLong ? "font-bold text-danger-600" : "text-ink-subtle")}>{t("rx.bodyCount", { n: body.length, max: RX_LIMITS.body })}</span>}
                  </div>
                </section>

                <HistoryList hist={hist} lang={i18n.language} isManager={isManager} t={t}
                  onRetry={() => setHistN((x) => x + 1)} onReprint={reprint}
                  onReuse={(r) => { playTap(); setBody((b) => appendBlock(b, r.body)); }}
                  onVoid={(r) => { playTap(); setVoidReason(""); setVoidFor(r); }} />
              </div>

              {/* ── الورقة ── */}
              <div className={cn("min-w-0", tab === "write" && "rxp-offstage")}>
                <div className="rxp-stick rounded-3xl bg-surface-2 p-3 sm:p-5" style={layout.pages > 1 ? RX_FIT_SCROLL : undefined}>
                  <RxPaper html={html} paper={cfg.paper} title={title} onLayout={setLayout} style={RX_FIT} />
                </div>
              </div>
            </div>

            {/* ── الطباعة ── */}
            <div className="rxp-bleed sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-1/95 px-5 py-3 backdrop-blur">
              <div className="min-w-0 flex-1 text-xs">
                {tooLong ? (
                  <span className="flex items-center gap-1.5 font-semibold text-danger-700 dark:text-danger-300" data-rx-toolong><AlertTriangle size={14} /> {t("rx.tooLong", { max: RX_LIMITS.body })}</span>
                ) : layout.overflow ? (
                  <span className="flex items-center gap-1.5 font-semibold text-danger-700 dark:text-danger-300" data-rx-overflow><AlertTriangle size={14} /> {t("rx.overflow")}</span>
                ) : layout.pages > 1 ? (
                  <span className="text-ink-muted" data-rx-pages>{t("rx.pages", { n: layout.pages })}</span>
                ) : null}
                {saveFailed && pending.length > 0 && (
                  <span className="mt-1 flex items-center gap-2 font-semibold text-danger-700 dark:text-danger-300">
                    {t("rx.saveFail")}
                    <button className="underline" onClick={() => void flush()} disabled={saving} data-rx-retry>{t("rx.saveRetry")}</button>
                  </span>
                )}
                {savedKey && key === savedKey && <span className="flex items-center gap-1 text-success-700 dark:text-success-300"><Check size={14} /> {t("rx.printedOnly")}</span>}
              </div>
              <Button leftIcon={saving ? undefined : <Printer size={17} />} loading={saving} onClick={print} disabled={!labelsReady || tooLong || knownOverflow} data-rx-print>
                {t("rx.print")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <MedPicker open={medOpen} onClose={() => setMedOpen(false)} mode="multi" species={pet.species} freeText="oneOff" title={t("rx.addDrug")}
        isSelected={(m) => hasDrugLine(body, m.name)}
        onPick={(m) => setBody((b) => appendLines(b, [m.name]))}
        onUnpick={(m) => setBody((b) => removeDrugLine(b, m.name))} />

      <Dialog open={leaveAsk} onClose={() => setLeaveAsk(false)} size="sm" title={pending.length ? t("rx.leavePending") : t("rx.leaveTitle")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLeaveAsk(false)}>{t("rx.stay")}</Button>
          <Button variant="danger" onClick={() => { setLeaveAsk(false); onClose(); }} data-rx-leave>{t("rx.leaveDo")}</Button>
        </div>} />

      <Dialog open={!!voidFor} onClose={() => (voiding ? undefined : setVoidFor(null))} size="sm" title={t("rx.voidTitle")} description={t("rx.voidHint")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setVoidFor(null)} disabled={voiding}>{t("rx.stay")}</Button>
          <Button variant="danger" leftIcon={<Ban size={15} />} loading={voiding} onClick={() => void confirmVoid()} data-rx-void-do>{t("rx.voidDo")}</Button>
        </div>}>
        {voidFor && (
          <div className="space-y-3">
            <p className="line-clamp-3 whitespace-pre-line rounded-xl bg-surface-2 p-2.5 text-xs text-ink-muted" dir="auto">{voidFor.body}</p>
            <label className="block">
              <span className="label">{t("rx.voidReason")}</span>
              <input className="input h-10 text-sm" value={voidReason} maxLength={200} onChange={(e) => setVoidReason(e.target.value)} data-rx-void-reason />
            </label>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** خاناتُ الحيوان بلغة الورقة: العمرُ من الميلاد، والوزنُ بأرقامه كما سُجّل. */
function initialFields(pet: Pet, lang: RxLang, t: (k: string, o?: Record<string, unknown>) => string): RxFields {
  const age = ageFromDOB(pet.dob);
  let ageText = "";
  if (age) {
    if (lang === "en") ageText = ageTextEn(age);
    else if (age.years <= 0 && age.months <= 0) ageText = t("pet.newborn");
    else {
      const parts: string[] = [];
      if (age.years > 0) parts.push(`${age.years} ${t(age.years === 1 ? "pet.yearOne" : "pet.yearMany")}`);
      if (age.months > 0) parts.push(`${age.months} ${t(age.months === 1 ? "pet.monthOne" : "pet.monthMany")}`);
      ageText = parts.join(" ");
    }
  }
  const w = typeof pet.current_weight_kg === "number" && pet.current_weight_kg > 0 ? pet.current_weight_kg : null;
  return {
    date: localISO(),
    name: pet.name ?? "",
    owner: pet.owner_name ?? "",
    age: ageText,
    weight: w ? `${formatDec(w)} ${lang === "en" ? "kg" : t("rx.kg")}` : "",
    kind: rxKindOf(pet.species),
  };
}

function TextField({ label, value, onChange, span, ...rest }: { label: string; value: string; onChange: (v: string) => void; span?: boolean; "data-f"?: string }) {
  return (
    <label className={cn("block min-w-0", span && "col-span-2")}>
      <span className="label">{label}</span>
      <input className="input h-10 py-1.5 text-sm" dir="auto" value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

function PlanPanel({ plan, lang, t, days, onRetry, onToggle, onInsert }: {
  plan: Exclude<PlanState, { status: "closed" }>;
  lang: string;
  t: (k: string, o?: Record<string, unknown>) => string;
  /** «٧ أيام» بلغة الورقة — السطرُ يُرى كما سيُدرج. */
  days: (n: number) => string;
  onRetry: () => void;
  onToggle: (i: number) => void;
  onInsert: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3" data-rx-planpanel={plan.status}>
      {plan.status === "loading" && <div className="flex justify-center py-2"><Spinner size={18} /></div>}
      {plan.status === "error" && (
        <div className="flex items-center gap-2 text-xs text-danger-700 dark:text-danger-300">
          <AlertTriangle size={14} /> <span className="flex-1">{t("rx.plan.fail")}</span>
          <button className="font-semibold underline" onClick={onRetry}>{t("common.retry")}</button>
        </div>
      )}
      {plan.status === "none" && <p className="text-xs text-ink-muted">{t("rx.plan.none")}</p>}
      {plan.status === "ready" && (
        <>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-ink">{t("rx.plan.title")}</span>
            <span className="text-2xs text-ink-subtle">{t("rx.plan.at", { date: formatDate(plan.plan.at, lang, true) })}</span>
          </div>
          <ul className="space-y-1.5">
            {plan.plan.items.map((it, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-surface-1">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={plan.picked[i]} onChange={() => onToggle(i)} />
                  <span className="min-w-0 flex-1 text-ink" dir="auto">{planLine(it, days)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={onInsert} disabled={!plan.picked.some(Boolean)} data-rx-plan-insert>{t("rx.plan.insert", { n: plan.picked.filter(Boolean).length })}</Button>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryList({ hist, lang, isManager, t, onRetry, onReprint, onReuse, onVoid }: {
  hist: HistState;
  lang: string;
  isManager: boolean;
  t: (k: string, o?: Record<string, unknown>) => string;
  onRetry: () => void;
  onReprint: (r: RxRecord) => void;
  onReuse: (r: RxRecord) => void;
  onVoid: (r: RxRecord) => void;
}) {
  if (hist.status === "missing") return null;
  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-3.5" data-rx-history={hist.status}>
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-ink"><History size={15} className="text-ink-subtle" /> {t("rx.history")}
        {hist.status === "ready" && hist.list.length > 0 && <span className="text-xs font-semibold text-ink-subtle">({hist.list.length})</span>}</h3>
      {hist.status === "loading" && <div className="flex justify-center py-2"><Spinner size={18} /></div>}
      {hist.status === "error" && (
        <div className="flex items-center gap-2 text-xs text-danger-700 dark:text-danger-300">
          <AlertTriangle size={14} /> <span className="flex-1">{t("rx.historyFail")}</span>
          <button className="inline-flex items-center gap-1 font-semibold underline" onClick={onRetry}><RotateCcw size={12} /> {t("common.retry")}</button>
        </div>
      )}
      {hist.status === "ready" && hist.list.length === 0 && <p className="text-xs text-ink-subtle">{t("rx.historyEmpty")}</p>}
      {hist.status === "ready" && hist.list.length > 0 && (
        <ul className="divide-y divide-line">
          {hist.list.map((r) => {
            const voided = !!r.voided_at;
            const first = r.body.split("\n").find((l) => l.trim()) ?? "";
            return (
              <li key={r.id} className="py-2" data-rx-item={voided ? "voided" : "live"}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                      <span>{formatDate(r.issued_at, lang, true)}</span>
                      {r.doctor_name && <span dir="auto">· {r.doctor_name}</span>}
                      {voided && <span className="rounded bg-danger-50 px-1.5 font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">{t("rx.voided")}</span>}
                    </div>
                    <p className={cn("truncate text-sm text-ink", voided && "text-ink-subtle line-through")} dir="auto">{first}</p>
                    {voided && r.void_reason && <p className="truncate text-2xs text-ink-subtle" dir="auto">{r.void_reason}</p>}
                  </div>
                  {!voided && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink" title={t("rx.reprint")} aria-label={t("rx.reprint")} onClick={() => onReprint(r)} data-rx-reprint><Printer size={15} /></button>
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink" title={t("rx.reuse")} aria-label={t("rx.reuse")} onClick={() => onReuse(r)} data-rx-reuse><CopyPlus size={15} /></button>
                      {isManager && <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600" title={t("rx.void")} aria-label={t("rx.void")} onClick={() => onVoid(r)} data-rx-void><Ban size={15} /></button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
