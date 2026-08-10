// ============================================================================
// LabCenter (المختبر) — the pet file's laboratory tab + the recording modal.
//
//   • Result cards, newest first: numeric panels show their values as coloured
//     chips (↑ red / ↓ blue / normal), snap tests show a big positive/negative
//     verdict, descriptive tests show findings + the slide/printout photo.
//   • Trend table (جدول التطور): rows = parameters, columns = dates, each cell
//     coloured by its SNAPSHOTTED flag — the doctor sees a value's course
//     across visits at a glance.
//   • Recording: pick a panel card → only that panel's fields open. Numeric
//     values flag live as the doctor types; snap is two big buttons; the
//     descriptive form is text + photo. Ranges/units are stored WITH each
//     value (world-class rule: never re-judge old results by new references).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Plus, Camera, Trash2, Receipt, ChevronDown, AlertTriangle, CheckCircle2, MessageCircle, Printer, ShoppingCart, ArrowRightLeft, Brain, ShieldAlert, ShieldCheck, Activity, Cable, Cpu, X, Inbox, Radio, ClipboardList, TestTube2, BadgeCheck, Ban, Clock, Zap } from "lucide-react";
import type { Pet, LabResult, LabValue, LabValueFlag, LabDeviceInbox, LabStatusValue } from "@/types";
import {
  statusOf, nextStatus, advanceLabel, advanceOpensEntry, isInFlight, STATUS_META,
  timelineOf, tatMinutes, formatDuration, isOverdue, LAB_FLOW, type LabStatus,
} from "@/lib/labStatus";
import { repo } from "@/lib/repo";
import {
  LAB_PARAMS, LAB_GROUPS, nameFromGroups, labParamById, labParamIndex, labRange, labFlag,
  snapTestsFor, snapTestById, type LabFlag,
} from "@/lib/labCatalog";
import { readLabImageFull } from "@/lib/labOcr";
import { interpretResult, type Insight, type Severity } from "@/lib/labIntelligence";
import { serialSupported, connectSerial, type SerialSession } from "@/lib/serialLink";
import { readAnalyzerMessage, learnCode, type NormalizedReading } from "@/lib/labLink";
import { getActiveClinicId } from "@/lib/clinics";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { prepareUpload } from "@/lib/image";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { cn, formatNum, formatDec, formatDate } from "@/lib/utils";
import { waNumber } from "@/lib/phone";
import { getDialCode, getClinicName, getClinicLogo } from "@/lib/settings";
import { openLabPrint } from "@/lib/labPrint";
import { useNavigate } from "react-router-dom";

const FLAG_CHIP: Record<LabValueFlag, string> = {
  very_low: "bg-sky-200 text-sky-900 dark:bg-sky-500/35 dark:text-sky-100",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  normal: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  high: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300",
  very_high: "bg-danger-200 text-danger-900 dark:bg-danger-500/35 dark:text-danger-100",
};
const FLAG_CELL: Record<LabValueFlag, string> = {
  very_low: "bg-sky-200 text-sky-900 dark:bg-sky-500/35 dark:text-sky-100",
  low: "bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-200",
  normal: "bg-success-50 text-success-800 dark:bg-success-500/10 dark:text-success-200",
  high: "bg-danger-100 text-danger-800 dark:bg-danger-500/25 dark:text-danger-200",
  very_high: "bg-danger-200 text-danger-900 dark:bg-danger-500/35 dark:text-danger-100",
};
/** Five-step verdict scale (بلا أرقام) — the arrows the doctor taps. */
const ARROW5: Record<LabValueFlag, string> = { very_low: "↓↓", low: "↓", normal: "✓", high: "↑", very_high: "↑↑" };
const LABEL5: Record<LabValueFlag, string> = { very_low: "منخفض جداً", low: "منخفض", normal: "طبيعي", high: "مرتفع", very_high: "مرتفع جداً" };
const SCALE5: LabValueFlag[] = ["very_low", "low", "normal", "high", "very_high"];
/** Ordinal distance from normal — drives the before/after verdict for mixed entries. */
const FLAG_ORD: Record<LabValueFlag, number> = { very_low: 2, low: 1, normal: 0, high: 1, very_high: 2 };

/* ---- Lab lifecycle UI: status pill + progress timeline (LIS worklist) ---- */
const STATUS_ICON = { ClipboardList, TestTube2, Cpu, FlaskConical, BadgeCheck, Ban } as const;

function StatusPill({ status, className }: { status: LabStatus; className?: string }) {
  const m = STATUS_META[status];
  const Icon = STATUS_ICON[m.icon];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-black", m.chip, className)}>
      <Icon size={12} /> {m.short}
    </span>
  );
}

/** Horizontal stepper: the case's journey with the moment each stage was reached. */
function LabTimeline({ r }: { r: LabResult }) {
  const st = statusOf(r);
  if (st === "canceled") return null;
  const done = new Set<LabStatus>(timelineOf(r).map((t) => t.status));
  const AT: Record<string, string | null | undefined> = { ordered: r.ordered_at, collected: r.collected_at, running: r.running_at, resulted: r.resulted_at, verified: r.verified_at };
  const atOf = (s: LabStatus) => AT[s];
  const curIdx = LAB_FLOW.indexOf(st);
  return (
    <div className="mt-3 flex items-stretch gap-0.5 overflow-x-auto pb-1">
      {LAB_FLOW.map((s, i) => {
        const m = STATUS_META[s];
        const Icon = STATUS_ICON[m.icon];
        const reached = done.has(s) || i <= curIdx;
        const isCur = i === curIdx;
        const at = atOf(s);
        return (
          <div key={s} className="flex min-w-[68px] flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1 rounded", i === 0 ? "opacity-0" : reached ? m.dot : "bg-line")} />
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full transition", reached ? `${m.dot} text-white` : "bg-surface-2 text-ink-subtle", isCur && "ring-2 ring-offset-1 ring-offset-surface-1 ring-current")}>
                <Icon size={12} />
              </span>
              <span className={cn("h-0.5 flex-1 rounded", i === LAB_FLOW.length - 1 ? "opacity-0" : i < curIdx ? STATUS_META[LAB_FLOW[i + 1]].dot : "bg-line")} />
            </div>
            <span className={cn("text-[9px] font-bold leading-tight", reached ? "text-ink" : "text-ink-subtle")}>{m.short}</span>
            <span className="text-[9px] leading-none text-ink-subtle" dir="ltr">
              {at ? new Date(at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Severity ribbon styling — one glanceable state (طبيعي / انتبه / حرج). */
const SEV_META: Record<Severity, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  normal: { label: "الحالة مطمئنة", icon: ShieldCheck, cls: "border-success-200 bg-success-50 text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200" },
  attention: { label: "تحتاج انتباه", icon: Activity, cls: "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" },
  critical: { label: "حالة حرجة — راجعها فوراً", icon: ShieldAlert, cls: "border-danger-300 bg-danger-50 text-danger-800 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-200" },
};
const INSIGHT_TONE: Record<Insight["tone"], string> = {
  critical: "border-s-4 border-danger-500 bg-danger-50/70 text-danger-900 dark:bg-danger-500/10 dark:text-danger-100",
  warn: "border-s-4 border-warn-500 bg-warn-50/70 text-warn-900 dark:bg-warn-500/10 dark:text-warn-100",
  info: "border-s-4 border-brand-400 bg-brand-50/60 text-brand-900 dark:bg-brand-500/10 dark:text-brand-100",
  good: "border-s-4 border-success-500 bg-success-50/70 text-success-900 dark:bg-success-500/10 dark:text-success-100",
};

/** «قارئ النتائج» — DecisionIQ-style interpretation block for a numeric result. */
function InterpretationPanel({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-sky-50/60 p-3 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-sky-500/5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-600 text-white"><Brain size={13} /></span>
        <span className="text-xs font-extrabold text-brand-800 dark:text-brand-200">قراءة السستم الذكية</span>
        <span className="chip bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">تفسير مساعد — القرار للطبيب</span>
      </div>
      <div className="space-y-1.5">
        {insights.map((ins) => (
          <div key={ins.id} className={cn("rounded-lg p-2.5", INSIGHT_TONE[ins.tone])}>
            <p className="text-sm font-bold leading-snug">{ins.title}</p>
            {ins.detail && <p className="mt-0.5 text-2xs leading-relaxed opacity-90">↳ {ins.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== Recording modal ============================== */
// One question — «شنو سويت؟» — three big buttons. Numbers mode shows a single
// grouped sheet: the doctor types only what's on the analyser printout and the
// entry NAMES ITSELF from the groups he touched. No panel jargon, no catalogs.

type EntryMode = "numbers" | "snap" | "micro";

const MICRO_TYPES = [
  { id: "fecal", label: "فحص البراز", emoji: "🔬" },
  { id: "skin", label: "كشط جلد / فطريات", emoji: "🧫" },
  { id: "cytology", label: "خلايا / خزعة", emoji: "🔍" },
  { id: "culture", label: "زراعة وحساسية", emoji: "🧬" },
  { id: "micro_other", label: "فحص آخر", emoji: "📋" },
];

export function LabEntry({ pet, visitId, doctor, onSaved, onClose, fulfill, prefill, fulfillPick }: {
  pet: Pet; visitId?: string | null; doctor?: string | null;
  onSaved: () => void; onClose: () => void;
  /** طلب «بانتظار النتائج» (بيع من المبيعات): النتيجة الجديدة تحل محله وترث فوترته وزيارته. */
  fulfill?: LabResult | null;
  /** رسالة جهاز واردة من الصندوق: تُقرأ فوراً وتتعبّى بوضع الأرقام لهذا الحيوان. */
  prefill?: { raw: string } | null;
  /** الطلبات المفتوحة لهذا الحيوان + المختار منها — يظهر بشريط فوق الحقول. */
  fulfillPick?: { target: LabResult | null; options: LabResult[]; onPick: (r: LabResult | null) => void } | null;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<EntryMode | null>(null);
  const [group, setGroup] = useState("blood");   // active value-group filter
  const [openParam, setOpenParam] = useState<string | null>(null); // expanded slider row
  const [q, setQ] = useState("");                 // search across every param
  const [vals, setVals] = useState<Record<string, string>>({});
  const [quals, setQuals] = useState<Record<string, LabValueFlag>>({}); // حكم بلا رقم
  const [ocrBusy, setOcrBusy] = useState(false);
  // ربط جهاز المختبر (Web Serial) — الأرقام تدخل مباشرة من الجهاز بلا كتابة
  const [serial, setSerial] = useState<SerialSession | null>(null);
  const [serialStatus, setSerialStatus] = useState<"idle" | "connecting" | "listening" | "error">("idle");
  const [lastRead, setLastRead] = useState<{ count: number; protocol: string } | null>(null);
  const [unknownCodes, setUnknownCodes] = useState<{ code: string; value: number; units?: string }[]>([]);
  const [snapTest, setSnapTest] = useState<string | null>(null);
  const [snapResult, setSnapResult] = useState<"positive" | "negative" | null>(null);
  const [microType, setMicroType] = useState(MICRO_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [freeRows, setFreeRows] = useState<{ label: string; value: string; unit: string; low: string; high: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const prep = await prepareUpload(f, { maxDim: 1280, quality: 0.72 });
      setPhoto(prep.dataUrl);
    } catch { playWarning(); toast.error("تعذّر تجهيز الصورة"); }
  };

  const ocrRef = useRef<HTMLInputElement>(null);
  /** صورة → قراءة تلقائية: القيم المقروءة تتعبى بالحقول والصورة تنحفظ مع النتيجة. */
  const ocrPick = async (f: File | undefined) => {
    if (!f) return;
    setOcrBusy(true);
    try {
      const prep = await prepareUpload(f, { maxDim: 1600, quality: 0.8 });
      setPhoto(prep.dataUrl);
      const { values } = await readLabImageFull(prep.dataUrl, LAB_PARAMS);
      const n = Object.keys(values).length;
      if (n > 0) {
        setVals((m) => {
          const next = { ...m };
          for (const [pid, v] of Object.entries(values)) next[pid] = String(v);
          return next;
        });
        setQuals((q) => {
          const next = { ...q };
          for (const pid of Object.keys(values)) delete next[pid]; // الرقم المقروء يغلب الحكم
          return next;
        });
        playSuccess();
        toast.success(`قرأنا ${formatNum(n)} قيمة من الصورة — راجعها وعدّل اللي يحتاج`);
      } else {
        playWarning();
        toast.toast({ tone: "info", title: "ما كدرنا نقرأ أرقام واضحة", description: "الصورة انحفظت مع النتيجة — قرّب الكاميرا على الأرقام وحاول مرة ثانية، أو عبّي يدوياً." });
      }
    } catch {
      playWarning();
      toast.error("تعذّرت قراءة الصورة");
    } finally { setOcrBusy(false); }
  };

  /**
   * قيمة الجهاز كما أرسلها — بلا أي تقريب.
   *
   * كانت هذه الدالة تُلصق الرقم بـ`step` المعرّف للإدخال اليدوي، فتُفسد ما
   * قرأه الجهاز: HCT خطوته ١ فتصير 30.8 ← 31، وPLT خطوته ٥، وAMYL/LIPA ١٠.
   * الخطوة مقياس لأزرار الزيادة والنقصان، لا لقيمة قادمة من جهاز معاير.
   * نقصّ فقط ذيل الفاصلة العائمة (0.30000000000000004 ← 0.3).
   */
  const exactStr = (_id: string, v: number): string =>
    Number.isFinite(v) ? String(Number(v.toPrecision(12))) : "";

  /** طبّق قراءة الجهاز على الحقول — نفس مسار OCR: الأرقام تتعبّى والأحكام تُمسح. */
  const applyReading = (read: NormalizedReading) => {
    const entries = Object.entries(read.values);
    if (entries.length) {
      setVals((m) => {
        const next = { ...m };
        for (const [id, v] of entries) next[id] = exactStr(id, v);
        return next;
      });
      setQuals((q) => { const next = { ...q }; for (const [id] of entries) delete next[id]; return next; });
    }
    setUnknownCodes(read.unknown);
    setLastRead((prev) => ({ count: entries.length, protocol: (prev?.protocol ?? "") }));
  };

  // استقبال رسالة من صندوق الأجهزة: افتح وضع الأرقام واقرأها فوراً على هذا الحيوان.
  const prefillRaw = prefill?.raw;
  useEffect(() => {
    if (!prefillRaw) return;
    setMode("numbers");
    const read = readAnalyzerMessage(prefillRaw, getActiveClinicId());
    applyReading(read);
    setLastRead({ count: read.count, protocol: read.protocol.toUpperCase() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRaw]);

  /** اربط الجهاز عبر المنفذ التسلسلي؛ كل رسالة كاملة تُقرأ وتُعبّى فوراً. */
  const connectDevice = async () => {
    if (!serialSupported()) { toast.error("هذا المتصفح ما يدعم الربط المباشر — استخدم Chrome على الكمبيوتر، أو صوّر الورقة."); return; }
    if (serial) { await serial.close().catch(() => {}); setSerial(null); setSerialStatus("idle"); return; }
    setSerialStatus("connecting");
    try {
      const clinicId = getActiveClinicId();
      const session = await connectSerial({}, {
        framing: "auto",
        onFrame: (rawMsg) => {
          const read = readAnalyzerMessage(rawMsg, clinicId);
          if (read.count === 0 && read.unknown.length === 0) return; // ضجيج — تجاهله
          applyReading(read);
          setLastRead({ count: read.count, protocol: read.protocol.toUpperCase() });
          playSuccess();
          toast.success(`استلمنا ${formatNum(read.count)} قيمة من الجهاز (${read.protocol.toUpperCase()}) — راجعها واحفظ`);
        },
        onStatus: (st) => { if (st === "error") { setSerialStatus("error"); } if (st === "closed") { setSerialStatus("idle"); setSerial(null); } },
      });
      setSerial(session);
      setSerialStatus("listening");
      toast.toast({ tone: "info", title: "الجهاز مربوط — شغّل التحليل والنتائج راح تدخل بروحها" });
    } catch (e) {
      setSerialStatus("idle");
      const msg = e instanceof Error ? e.message : "";
      if (!/cancel|no port|gesture/i.test(msg)) toast.error("تعذّر الربط بالجهاز", msg);
    }
  };

  /** علّم الجهاز: كود مجهول = أي فحص. يُحفظ للأبد ويُطبّق على القيمة الحالية. */
  const teachUnknown = (u: { code: string; value: number; units?: string }, canonicalId: string) => {
    learnCode(u.code, canonicalId, getActiveClinicId());
    setVals((m) => ({ ...m, [canonicalId]: exactStr(canonicalId, u.value) }));
    setQuals((q) => { const n = { ...q }; delete n[canonicalId]; return n; });
    setUnknownCodes((list) => list.filter((x) => x.code !== u.code));
    playTap();
  };

  // اقطع الربط عند إغلاق الشاشة حتى لا يبقى المنفذ مفتوحاً.
  useEffect(() => () => { void serial?.close().catch(() => {}); }, [serial]);

  /** Snapshot every value the doctor actually typed (any group) + verdicts + free rows. */
  const buildValues = (): LabValue[] => {
    const out: LabValue[] = [];
    for (const [pid, raw] of Object.entries(vals)) {
      if (raw.trim() === "" || !Number.isFinite(Number(raw))) continue;
      const p = labParamById(pid);
      if (!p) continue;
      const [lo, hi] = labRange(p, pet.species);
      const v = Number(raw);
      out.push({ id: pid, label: p.label, abbr: p.abbr, value: v, unit: p.unit, low: lo, high: hi, flag: labFlag(v, lo, hi) });
    }
    // أحكام بلا أرقام — خمس درجات، تدخل بجدول التطور والمقارنة مثل الأرقام تماماً
    for (const [pid, flag] of Object.entries(quals)) {
      if (vals[pid]?.trim()) continue; // الرقم الصريح يغلب الحكم
      const p = labParamById(pid);
      if (!p) continue;
      const [lo, hi] = labRange(p, pet.species);
      out.push({ id: pid, label: p.label, abbr: p.abbr, unit: p.unit, low: lo, high: hi, flag, qualitative: true });
    }
    // ترتيب الكتلوك (ترتيب ورقة الجهاز) لا ترتيب وصول الرسالة — يُخزَّن مرتّباً
    // فتقرأه كل الشاشات والتقارير بنفس التسلسل الذي اعتاده الطبيب.
    out.sort((a, b) => labParamIndex(a.id) - labParamIndex(b.id));
    for (const r of freeRows) {
      if (!r.label.trim() || r.value.trim() === "" || !Number.isFinite(Number(r.value))) continue;
      const v = Number(r.value);
      const lo = r.low.trim() === "" ? undefined : Number(r.low);
      const hi = r.high.trim() === "" ? undefined : Number(r.high);
      out.push({
        id: `free_${r.label.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
        label: r.label.trim(), value: v, unit: r.unit.trim(),
        low: lo, high: hi, flag: labFlag(v, lo, hi),
      });
    }
    return out;
  };

  const filledCount = mode === "numbers" ? buildValues().length : 0;
  const canSave = !busy && !!mode && (
    mode === "numbers" ? filledCount > 0 || !!notes.trim() || !!photo
      : mode === "snap" ? !!snapTest && !!snapResult
        : !!notes.trim() || !!photo
  );

  const save = async () => {
    if (!mode || !canSave) return;
    setBusy(true);
    try {
      const values = mode === "numbers" ? buildValues() : null;
      const snap = snapTest ? snapTestById(snapTest) : undefined;
      const named = mode === "numbers" ? nameFromGroups((values ?? []).map((v) => v.id)) : null;
      await repo.addLabResult({
        pet_id: pet.id, visit_id: fulfill?.visit_id ?? visitId ?? null,
        // نتيجة تُكمل طلباً مباعاً تحتفظ بهويّته — هو ما اشتراه الزبون وما يبحث
        // عنه الطبيب بالسجل. التسمية من مجموعات القيم للنتائج الجديدة فقط.
        panel_id: mode === "numbers" ? (fulfill?.panel_id ?? named!.panel_id) : mode === "snap" ? "snap" : microType.id,
        panel_label: mode === "numbers" ? (fulfill?.panel_label ?? named!.panel_label) : mode === "snap" ? `فحص سريع — ${snap?.label ?? ""}` : microType.label,
        kind: mode === "numbers" ? "numeric" : mode === "snap" ? "snap" : "descriptive",
        values,
        snap_test_id: mode === "snap" ? snapTest : null,
        snap_result: mode === "snap" ? snapResult : null,
        notes: notes.trim() || null,
        photo_url: photo,
        doctor: doctor ?? null,
        billed: fulfill?.billed ?? false, // الطلب المباع يبقى مفوتراً بعد تسجيل نتائجه
        taken_at: new Date(takenAt + "T12:00:00").toISOString(),
        // دورة الحياة: النتيجة الجديدة «جاهزة بانتظار الاعتماد»، وترث توقيتات الطلب
        // (متى طُلب/سُحبت العينة/شُغّل) وأولويته حتى يبقى زمن الإنجاز صحيحاً.
        status: "resulted",
        priority: fulfill?.priority ?? "routine",
        ordered_at: fulfill?.ordered_at ?? null,
        collected_at: fulfill?.collected_at ?? null,
        running_at: fulfill?.running_at ?? null,
        collected_by: fulfill?.collected_by ?? null,
      });
      // النتيجة الحقيقية حلت محل بطاقة «بانتظار النتائج» — نشيل البطاقة المؤقتة.
      if (fulfill) await repo.deleteLabResult(fulfill.id).catch(() => {});
      playSuccess();
      toast.success("انحفظت النتيجة بسجل المختبر");
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error("تعذّر حفظ النتيجة", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  /* ---- Step 1: one question, three big answers ---- */
  if (!mode) {
    const MODES: { id: EntryMode; emoji: string; title: string; sub: string }[] = [
      { id: "numbers", emoji: "🩸", title: "أرقام تحاليل", sub: "دم، كيمياء، بول — اكتب الأرقام اللي بورقة الجهاز وبس" },
      { id: "snap", emoji: "⚡", title: "فحص سريع", sub: "بارفو، ديستمبر، FeLV… النتيجة إيجابي أو سلبي" },
      { id: "micro", emoji: "🔬", title: "مجهر / زراعة", sub: "براز، كشط جلد، خلايا — وصف وصورة" },
    ];
    return (
      <div>
        <p className="mb-3 text-sm font-bold text-ink-muted">شنو سويت للحيوان؟</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id} type="button"
              onClick={() => { playTap(); setMode(m.id); }}
              className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-line bg-surface-1 p-5 text-center transition hover:border-brand-400 hover:bg-brand-50/40 active:scale-[.98] dark:hover:bg-brand-500/10"
            >
              <span className="text-4xl leading-none">{m.emoji}</span>
              <span className="mt-1 text-base font-extrabold text-ink">{m.title}</span>
              <span className="text-2xs leading-snug text-ink-subtle">{m.sub}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Shared header: back + date ---- */
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => { playTap(); setMode(null); setQ(""); }} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
        ← رجوع
      </button>
      <span className="text-base font-extrabold text-ink">
        {mode === "numbers" ? "🩸 أرقام التحاليل" : mode === "snap" ? "⚡ فحص سريع" : `🔬 ${microType.label}`}
      </span>
      <label className="ms-auto flex items-center gap-1.5 text-xs text-ink-subtle">
        التاريخ
        <input type="date" dir="ltr" value={takenAt} onChange={(e) => e.target.value && setTakenAt(e.target.value)} className="input h-8 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
      </label>
    </div>
  );

  /* ---- Numbers: ONE sheet — group chips + search, fill only what you have ---- */
  const groupFilled = (g: { params: string[] }) => g.params.filter((pid) => (vals[pid] ?? "").trim() !== "" || quals[pid]).length;
  const query = q.trim().toLowerCase();
  const visibleParams = query
    ? LAB_PARAMS.filter((p) => p.abbr.toLowerCase().includes(query) || p.label.includes(q.trim()))
    : (LAB_GROUPS.find((g) => g.id === group)?.params ?? []).map((pid) => labParamById(pid)!).filter(Boolean);

  return (
    <div className="space-y-4">
      {header}

      {mode === "numbers" && (
        <>
          {/* أسهل طريقة: صوّر ورقة الجهاز والأرقام تنقرأ وتتعبى بروحها */}
          <button
            type="button"
            disabled={ocrBusy}
            onClick={() => { playTap(); ocrRef.current?.click(); }}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50/60 p-4 text-base font-extrabold text-brand-700 transition hover:bg-brand-100/60 active:scale-[.99] disabled:opacity-60 dark:border-brand-500/50 dark:bg-brand-500/10 dark:text-brand-300"
          >
            {ocrBusy ? "📸 دنقرأ الأرقام من الصورة…" : "📸 صوّر ورقة الجهاز — الأرقام تتعبى بروحها"}
          </button>
          <input ref={ocrRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void ocrPick(e.target.files?.[0]); e.target.value = ""; }} />

          {/* ربط جهاز المختبر مباشرة — الأرقام تدخل من الجهاز بلا كتابة ولا تصوير */}
          {serialSupported() && (
            <button
              type="button"
              onClick={() => void connectDevice()}
              className={cn(
                "flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 p-4 text-base font-extrabold transition active:scale-[.99]",
                serial
                  ? "border-success-400 bg-success-50 text-success-700 dark:border-success-500/50 dark:bg-success-500/10 dark:text-success-300"
                  : "border-dashed border-teal-400 bg-teal-50/60 text-teal-700 hover:bg-teal-100/60 dark:border-teal-500/50 dark:bg-teal-500/10 dark:text-teal-300",
              )}
            >
              {serialStatus === "connecting" ? <><Cpu size={18} className="animate-pulse" /> دنربط الجهاز…</>
                : serial ? <><Cable size={18} /> الجهاز مربوط — شغّل التحليل (اضغط لفصله)</>
                  : <><Cable size={18} /> اربط جهاز المختبر مباشرة — القراءة تلقائية</>}
            </button>
          )}
          {lastRead && lastRead.count > 0 && (
            <p className="rounded-xl bg-success-50 px-3 py-2 text-2xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
              ✓ {prefill ? "استلمنا من الجهاز" : "آخر استلام"}: {formatNum(lastRead.count)} قيمة{lastRead.protocol ? ` بلغة ${lastRead.protocol}` : ""}. راجع القيم تحت واضغط حفظ.
            </p>
          )}

          {/* أي طلب مفتوح ستُكمله هذه النتيجة — يُعرض صراحةً لأن الخطأ هنا خطأ
              فوترة: نتيجة تُحفظ منفصلة تترك الطلب المباع معلّقاً بلا نتائج. */}
          {fulfillPick && (fulfillPick.target || fulfillPick.options.length > 0) && (
            <div className={cn("rounded-2xl border p-3", fulfillPick.target
              ? "border-brand-300 bg-brand-50/70 dark:border-brand-500/40 dark:bg-brand-500/10"
              : "border-warn-300 bg-warn-50/70 dark:border-warn-500/40 dark:bg-warn-500/10")}>
              {fulfillPick.target ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs font-extrabold text-brand-800 dark:text-brand-200">
                    ✓ هذي النتائج راح تُسجَّل على الطلب «{fulfillPick.target.panel_label}»
                    {fulfillPick.target.billed ? " — المفوتر" : ""} وتكمّل مراحله.
                  </span>
                  {fulfillPick.options.length > 0 && (
                    <button type="button" onClick={() => fulfillPick.onPick(null)}
                      className="ms-auto rounded-full bg-surface-1 px-2.5 py-1 text-2xs font-bold text-ink-muted transition hover:text-ink">
                      تسجيلها منفصلة بدل ذلك
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-2xs font-extrabold text-warn-800 dark:text-warn-200">
                    عندك {formatNum(fulfillPick.options.length)} تحاليل مفتوحة لهذا الحيوان — على أيها نسجّل النتائج؟
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fulfillPick.options.map((o) => (
                      <button key={o.id} type="button" onClick={() => fulfillPick.onPick(o)}
                        className="rounded-full border border-brand-300 bg-surface-1 px-2.5 py-1 text-2xs font-bold text-brand-700 transition hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-300">
                        {o.panel_label}{o.billed ? " · مفوتر" : ""}
                      </button>
                    ))}
                    <span className="self-center text-2xs text-ink-subtle">أو اتركها بلا اختيار لتُسجَّل نتيجة جديدة منفصلة.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* تعليم الأكواد المجهولة — يُسأل مرة واحدة ويُحفظ للأبد لكل أجهزة العيادة */}
          {unknownCodes.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-warn-300 bg-warn-50/60 p-3 dark:border-warn-500/40 dark:bg-warn-500/10">
              <p className="text-2xs font-extrabold text-warn-800 dark:text-warn-200">🎓 الجهاز أرسل أكواد ما يعرفها السستم — علّمه مرة وحدة ويحفظها للأبد:</p>
              {unknownCodes.map((u) => (
                <div key={u.code} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-surface-1 px-2 py-1 text-xs font-black text-ink" dir="ltr">{u.code} = {formatDec(u.value)}{u.units ? ` ${u.units}` : ""}</span>
                  <span className="text-2xs text-ink-muted">→ يعني:</span>
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) teachUnknown(u, e.target.value); }}
                    className="input h-8 flex-1 py-0 text-xs"
                  >
                    <option value="" disabled>اختر الفحص المقابل…</option>
                    {LAB_PARAMS.map((p) => <option key={p.id} value={p.id}>{p.abbr} · {p.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setUnknownCodes((list) => list.filter((x) => x.code !== u.code))} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:text-danger-600"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <p className="rounded-xl bg-brand-50/60 px-3 py-2 text-2xs font-semibold leading-relaxed text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
            أو اضغط الأسهم كدام كل فحص للحكم السريع (↓↓ ↓ ✓ ↑ ↑↑) بلا أرقام — ومن تريد الدقة اضغط اسم الفحص واكتب الرقم.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {LAB_GROUPS.map((g) => {
              const n = groupFilled(g);
              return (
                <button key={g.id} type="button" onClick={() => { playTap(); setGroup(g.id); setQ(""); setOpenParam(null); }}
                  className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold transition",
                    !query && group === g.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {g.emoji} {g.label}
                  {n > 0 && <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-black", !query && group === g.id ? "bg-white/25 text-white" : "bg-brand-600 text-white")}>{formatNum(n)}</span>}
                </button>
              );
            })}
            <div className="relative ms-auto">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على فحص… (ALT، سكر…)" className="input h-9 w-44 py-0 pe-3 text-sm" />
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            {visibleParams.map((p) => {
              const [lo, hi] = labRange(p, pet.species);
              const raw = vals[p.id] ?? "";
              const num = raw.trim() === "" ? null : Number(raw);
              const flag: LabFlag | null = num === null || !Number.isFinite(num) ? null : labFlag(num, lo, hi);
              const open = openParam === p.id;
              const dec = p.step < 1 ? (String(p.step).split(".")[1]?.length ?? 1) : 0;
              const setNum = (n: number) => {
                const clamped = Math.min(p.max, Math.max(p.min, n));
                setVals((m) => ({ ...m, [p.id]: clamped.toFixed(dec) }));
              };
              const loPct = Math.round(((lo - p.min) / (p.max - p.min)) * 100);
              const hiPct = Math.round(((hi - p.min) / (p.max - p.min)) * 100);
              return (
                <div key={p.id} className={cn("rounded-2xl border transition", open ? "border-brand-400 bg-surface-1 shadow-card lg:col-span-2" : flag === "high" ? "border-danger-300 bg-danger-50/50 dark:border-danger-500/40 dark:bg-danger-500/10" : flag === "low" ? "border-sky-300 bg-sky-50/50 dark:border-sky-500/40 dark:bg-sky-500/10" : "border-line bg-surface-1")}>
                  {/* Collapsed: the whole row is one big tap target */}
                  <button type="button" onClick={() => { playTap(); setOpenParam(open ? null : p.id); }} className="flex w-full items-center gap-2.5 p-3 text-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink"><span dir="ltr">{p.abbr}</span> · {p.label}</p>
                      <p className="text-2xs tabular-nums text-ink-subtle" dir="ltr">{formatDec(lo)}–{formatDec(hi)} {p.unit}</p>
                    </div>
                    {num !== null && Number.isFinite(num) && (
                      <span className={cn("rounded-xl px-2.5 py-1 text-base font-extrabold tabular-nums", FLAG_CHIP[flag ?? "normal"])} dir="ltr">
                        {formatDec(num)}{flag && flag !== "normal" ? ` ${ARROW5[flag]}` : ""}
                      </span>
                    )}
                  </button>
                  {/* الحكم السريع — خمس درجات بلا أرقام (الرقم الصريح يغلبها) */}
                  {(num === null || !Number.isFinite(num)) && (
                    <div className="flex items-center gap-1 px-3 pb-3" dir="ltr">
                      {SCALE5.map((f5) => (
                        <button
                          key={f5} type="button"
                          title={LABEL5[f5]}
                          onClick={() => { playTap(); setQuals((q) => q[p.id] === f5 ? (() => { const n = { ...q }; delete n[p.id]; return n; })() : { ...q, [p.id]: f5 }); }}
                          className={cn(
                            "grid h-10 flex-1 place-items-center rounded-xl text-sm font-black transition active:scale-95",
                            quals[p.id] === f5 ? FLAG_CHIP[f5] + " ring-2 ring-current" : "bg-surface-2 text-ink-subtle hover:text-ink",
                          )}
                        >
                          {ARROW5[f5]}
                        </button>
                      ))}
                      {quals[p.id] && <span className={cn("ms-1 whitespace-nowrap rounded-lg px-2 py-1 text-2xs font-black", FLAG_CHIP[quals[p.id]])}>{LABEL5[quals[p.id]]}</span>}
                    </div>
                  )}

                  {/* Expanded: big slider + big +/- steppers — finger-first entry */}
                  {open && (
                    <div className="space-y-3 border-t border-line p-3.5">
                      <div className="flex items-center justify-center gap-3">
                        <button type="button" onClick={() => { playTap(); setNum((num ?? (lo + hi) / 2) - p.step); }} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-black text-ink transition hover:bg-brand-50 active:scale-95">−</button>
                        <input
                          aria-label={p.abbr} type="number" inputMode="decimal" step={p.step} dir="ltr" placeholder="—" value={raw}
                          onChange={(e) => setVals((m) => ({ ...m, [p.id]: e.target.value }))}
                          className={cn("input h-14 w-36 px-2 py-0 text-center text-2xl font-black tabular-nums", flag === "high" && "border-danger-400 text-danger-700 dark:text-danger-300", flag === "low" && "border-sky-400 text-sky-700 dark:text-sky-300")}
                        />
                        <button type="button" onClick={() => { playTap(); setNum((num ?? (lo + hi) / 2) + p.step); }} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-black text-ink transition hover:bg-brand-50 active:scale-95">+</button>
                      </div>
                      {/* Coloured band slider: blue = low zone, green = normal, red = high */}
                      <div dir="ltr">
                        <input
                          type="range" min={p.min} max={p.max} step={p.step}
                          value={num ?? (lo + hi) / 2}
                          onChange={(e) => setNum(Number(e.target.value))}
                          className="h-3 w-full cursor-pointer appearance-none rounded-full accent-brand-700"
                          style={{ background: `linear-gradient(90deg, #7dd3fc 0%, #7dd3fc ${loPct}%, #86efac ${loPct}%, #86efac ${hiPct}%, #fca5a5 ${hiPct}%, #fca5a5 100%)` }}
                        />
                        <div className="mt-1 flex justify-between text-[10px] font-bold tabular-nums text-ink-subtle">
                          <span>{formatDec(p.min)}</span>
                          <span className="text-success-600">{formatDec(lo)} — {formatDec(hi)} طبيعي</span>
                          <span>{formatDec(p.max)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        {raw.trim() !== "" ? (
                          <button type="button" onClick={() => { playTap(); setVals((m) => { const n = { ...m }; delete n[p.id]; return n; }); }} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-danger-600">مسح القيمة</button>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => {
                            playTap();
                            const idx = visibleParams.findIndex((x) => x.id === p.id);
                            const next = visibleParams[idx + 1];
                            setOpenParam(next ? next.id : null);
                          }}
                          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-95"
                        >
                          {visibleParams.findIndex((x) => x.id === p.id) < visibleParams.length - 1 ? "الفحص التالي ←" : "تم ✓"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {visibleParams.length === 0 && <p className="col-span-full py-4 text-center text-sm text-ink-subtle">ماكو فحص بهذا الاسم — ضيفه تحت كـ«فحص مو موجود».</p>}
          </div>

          {/* Anything the catalog doesn't have */}
          <div className="space-y-2">
            {freeRows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl border border-dashed border-line bg-surface-1 p-2.5 sm:grid-cols-[1fr,90px,80px,80px,80px,auto] sm:items-center">
                <input value={r.label} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="اسم الفحص" className="input h-9 py-0 text-sm font-bold col-span-2 sm:col-span-1" />
                <input value={r.value} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} type="number" dir="ltr" placeholder="القيمة" className="input h-9 px-2 py-0 text-center text-sm font-extrabold tabular-nums" />
                <input value={r.unit} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} dir="ltr" placeholder="الوحدة" className="input h-9 px-2 py-0 text-center text-sm" />
                <input value={r.low} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, low: e.target.value } : x))} type="number" dir="ltr" placeholder="من" className="input h-9 px-2 py-0 text-center text-sm tabular-nums" />
                <input value={r.high} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, high: e.target.value } : x))} type="number" dir="ltr" placeholder="إلى" className="input h-9 px-2 py-0 text-center text-sm tabular-nums" />
                <button type="button" onClick={() => setFreeRows((rs) => rs.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setFreeRows((rs) => [...rs, { label: "", value: "", unit: "", low: "", high: "" }])} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
              <Plus size={12} /> فحص مو موجود بالقائمة
            </button>
          </div>
        </>
      )}

      {mode === "snap" && (
        <div className="space-y-3">
          <p className="text-2xs font-semibold text-ink-subtle">شنو الفحص؟</p>
          <div className="flex flex-wrap gap-1.5">
            {snapTestsFor(pet.species).map((s) => (
              <button key={s.id} type="button" onClick={() => { playTap(); setSnapTest(s.id); }}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", snapTest === s.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {s.label}
              </button>
            ))}
          </div>
          {snapTest && (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => { playTap(); setSnapResult("negative"); }}
                className={cn("flex items-center justify-center gap-2 rounded-2xl border-2 p-4 text-base font-extrabold transition", snapResult === "negative" ? "border-success-500 bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "border-line bg-surface-1 text-ink-muted hover:border-success-300")}>
                <CheckCircle2 size={20} /> سلبي
              </button>
              <button type="button" onClick={() => { playTap(); setSnapResult("positive"); }}
                className={cn("flex items-center justify-center gap-2 rounded-2xl border-2 p-4 text-base font-extrabold transition", snapResult === "positive" ? "border-danger-500 bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" : "border-line bg-surface-1 text-ink-muted hover:border-danger-300")}>
                <AlertTriangle size={20} /> إيجابي
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "micro" && (
        <div className="flex flex-wrap gap-1.5">
          {MICRO_TYPES.map((m) => (
            <button key={m.id} type="button" onClick={() => { playTap(); setMicroType(m); }}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition", microType.id === m.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Notes + photo — every mode gets them. */}
      <div className="space-y-2">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={mode === "micro" ? "النتيجة والملاحظات (ما شوهد بالمجهر، البكتيريا والمضاد الفعال…)" : "ملاحظات إضافية (اختياري)"}
          className="input min-h-[64px] w-full resize-y text-sm leading-relaxed" />
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
            <Camera size={13} /> {photo ? "تغيير الصورة" : "صوّر ورقة الجهاز / الشريحة"}
          </button>
          {photo && <img src={photo} alt="lab" className="h-12 w-12 rounded-xl border border-line object-cover" />}
          {photo && <button type="button" onClick={() => setPhoto(null)} className="text-2xs font-bold text-danger-600">إزالة</button>}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-2xs font-bold text-ink-subtle">
          {mode === "numbers" && filledCount > 0 ? `${formatNum(filledCount)} قيمة جاهزة للحفظ` : ""}
        </span>
        <Button onClick={save} loading={busy} disabled={!canSave} leftIcon={<FlaskConical size={16} />}>حفظ النتيجة</Button>
      </div>
    </div>
  );
}

/* ================================ Trend table ================================ */

function TrendTable({ results }: { results: LabResult[] }) {
  // Numeric results only, oldest→newest columns, capped to the last 6 dates.
  const numeric = useMemo(
    () => results.filter((r) => r.kind === "numeric" && (r.values?.length ?? 0) > 0).slice().sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    [results],
  );
  const cols = numeric.slice(-6);
  const paramRows = useMemo(() => {
    const seen = new Map<string, { label: string; abbr?: string; unit: string }>();
    for (const r of cols) for (const v of r.values ?? []) if (!seen.has(v.id)) seen.set(v.id, { label: v.label ?? v.id, abbr: v.abbr, unit: v.unit });
    return [...seen.entries()];
  }, [cols]);
  if (cols.length < 2) return null; // a trend needs at least two dates

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"><FlaskConical size={15} /></span>
        <h3 className="font-display text-sm font-extrabold text-ink">تطور القيم عبر الزمن</h3>
        <span className="ms-auto text-2xs text-ink-subtle">آخر {formatNum(cols.length)} تحاليل</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-2xs text-ink-muted">
              <th className="px-3 py-2 text-start font-bold">الفحص</th>
              {cols.map((c) => (
                <th key={c.id} className="px-2 py-2 text-center font-bold tabular-nums" dir="ltr">
                  {new Date(c.taken_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paramRows.map(([pid, meta]) => (
              <tr key={pid}>
                <td className="px-3 py-1.5">
                  <span className="font-bold text-ink" dir="ltr">{meta.abbr ?? meta.label}</span>
                  <span className="ms-1.5 text-2xs text-ink-subtle">{meta.unit}</span>
                </td>
                {cols.map((c) => {
                  const v = (c.values ?? []).find((x) => x.id === pid);
                  return (
                    <td key={c.id} className="px-1.5 py-1.5 text-center">
                      {v ? (
                        <span className={cn("inline-block min-w-[52px] rounded-lg px-1.5 py-1 text-xs font-extrabold tabular-nums", FLAG_CELL[v.flag])} dir="ltr">
                          {v.value !== undefined ? `${formatDec(v.value)}${v.flag !== "normal" ? ` ${ARROW5[v.flag]}` : ""}` : ARROW5[v.flag]}
                        </span>
                      ) : <span className="text-ink-subtle/40">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================ Result card ================================ */

/** Compose the owner-facing WhatsApp summary of one result — clear Arabic, no jargon. */
function waResultMessage(pet: Pet, r: LabResult): string {
  const clinic = getClinicName() || "عيادتنا";
  const lines: string[] = [`مرحباً ${(pet.owner_name ?? "").trim() || ""} 🌟`, `نتائج فحص «${r.panel_label}» لـ${pet.name} بتاريخ ${formatDate(r.taken_at, "ar")}:`];
  if (r.kind === "numeric" && r.values?.length) {
    for (const v of r.values) {
      const range = v.value !== undefined && v.low !== undefined && v.high !== undefined ? ` (الطبيعي ${formatDec(v.low)}–${formatDec(v.high)})` : "";
      const mark = ` ${LABEL5[v.flag]} ${ARROW5[v.flag]}`;
      const num = v.value !== undefined ? `${formatDec(v.value)} ${v.unit}` : "";
      lines.push(`• ${v.abbr ?? v.label}: ${num}${mark}${range}`);
    }
  }
  if (r.kind === "snap") lines.push(r.snap_result === "positive" ? "النتيجة: إيجابية ⚠ — يرجى مراجعة العيادة." : "النتيجة: سلبية ✓");
  if (r.notes) lines.push(`ملاحظات الطبيب: ${r.notes}`);
  lines.push(`مع تمنياتنا بالسلامة لـ${pet.name} — ${clinic} 🐾`);
  return lines.join("\n");
}

/**
 * ورقة النتائج — نفس تخطيط الورقة التي يسحبها الطبيب من طابعة الجهاز:
 * رمز الفحص، ثم القيمة، ثم الوحدة، ثم النطاق الطبيعي من–إلى.
 *
 * الشرائح المتناثرة السابقة كانت تخفي النطاق داخل tooltip، والطبيب معتاد أن
 * يقرأ النتيجة وحدّها الطبيعي جنبها في سطر واحد. والترتيب هنا ترتيب الكتلوك
 * (ترتيب الطباعة) لا ترتيب وصول الرسالة — فالورقة تقرأ نفسها كل مرة.
 */
function ResultSheet({ values }: { values: LabValue[] }) {
  const rows = useMemo(
    () => [...values].sort((a, b) => labParamIndex(a.id) - labParamIndex(b.id)),
    [values],
  );
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-surface-2 text-2xs text-ink-subtle">
            <th className="px-2.5 py-1.5 text-start font-bold">الفحص</th>
            <th className="px-2 py-1.5 text-end font-bold">النتيجة</th>
            <th className="px-2 py-1.5 text-start font-bold">الوحدة</th>
            <th className="px-2.5 py-1.5 text-end font-bold">النطاق الطبيعي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className={cn("border-t border-line/70", v.flag !== "normal" && FLAG_CELL[v.flag])}>
              <td className="whitespace-nowrap px-2.5 py-1.5">
                <span className="font-black" dir="ltr">{v.abbr ?? v.id}</span>
                {v.label && <span className="ms-1.5 text-ink-subtle">{v.label}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-end font-black tabular-nums" dir="ltr">
                {v.value !== undefined ? formatDec(v.value) : LABEL5[v.flag]}
                {v.flag !== "normal" && <span className="ms-1">{ARROW5[v.flag]}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-2xs text-ink-subtle" dir="ltr">{v.unit}</td>
              <td className="whitespace-nowrap px-2.5 py-1.5 text-end tabular-nums text-2xs text-ink-subtle" dir="ltr">
                {v.low !== undefined && v.high !== undefined ? `${formatDec(v.low)} – ${formatDec(v.high)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultCard({ r, pet, prior, canEdit, onDelete, onToggleBilled, onBill, onPrint, onFulfill, onAdvance, onTogglePriority }: {
  r: LabResult; pet: Pet; prior?: LabResult | null; canEdit: boolean; onDelete: (id: string) => void; onToggleBilled: (r: LabResult) => void;
  onBill: (r: LabResult) => void; onPrint: (r: LabResult) => void; onFulfill: (r: LabResult) => void;
  onAdvance: (r: LabResult, to: LabStatusValue) => void; onTogglePriority: (r: LabResult) => void;
}) {
  const [openPhoto, setOpenPhoto] = useState(false);
  const abnormal = (r.values ?? []).filter((v) => v.flag !== "normal");
  const positive = r.snap_result === "positive";
  const interp = useMemo(() => (r.kind === "numeric" && (r.values?.length ?? 0) > 0 ? interpretResult(r, prior, pet.species) : null), [r, prior, pet.species]);
  // دورة حياة التحليل: مطلوب → عينة → تشغيل → جاهزة → مُعتمدة
  const st = statusOf(r);
  const inFlight = isInFlight(st);
  const urgent = r.priority === "urgent";
  const nowISO = new Date().toISOString();
  const overdue = isOverdue(r, nowISO);
  const next = nextStatus(st);
  const tat = tatMinutes(r, nowISO);
  const waNum = pet.owner_phone ? waNumber(pet.owner_phone, getDialCode()) : "";
  const sendWa = () => {
    if (!waNum) return;
    playTap();
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waResultMessage(pet, r))}`, "_blank", "noopener,noreferrer");
    void repo.logWhatsApp({ pet_id: pet.id, owner_name: pet.owner_name ?? null, owner_phone: pet.owner_phone ?? null, reminder_type: "lab_result" }).catch(() => {});
  };
  return (
    <div className={cn("card p-4",
      positive && "border-danger-300 ring-1 ring-danger-300/50 dark:border-danger-500/50",
      st === "ordered" && "border-amber-300 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-500/5",
      st === "resulted" && "border-teal-300 bg-teal-50/30 dark:border-teal-500/40 dark:bg-teal-500/5",
      overdue && "ring-1 ring-danger-400/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", positive ? "bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-300" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300")}>
          <FlaskConical size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{r.panel_label}</p>
          <p className="text-2xs text-ink-subtle">
            <span dir="ltr">{formatDate(r.taken_at, "ar")}</span>
            {r.doctor ? ` · ${r.doctor}` : ""}
            {!inFlight && st === "verified" && tat > 0 ? <> · <span className="inline-flex items-center gap-0.5"><Clock size={10} /> {formatDuration(tat)}</span></> : null}
          </p>
        </div>
        {urgent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 px-2 py-1 text-2xs font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300"><Zap size={11} /> عاجل</span>
        )}
        <StatusPill status={st} />
        {/* حارس الإيراد: نتيجة فيها محتوى وما انفوترت — لا تفوتك فلوس تحليل سويته */}
        {!r.billed && st !== "ordered" && ((r.values?.length ?? 0) > 0 || !!r.snap_result || !!(r.notes && r.notes.trim())) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-2xs font-black text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"><Receipt size={11} /> غير مفوترة</span>
        )}
        {r.kind === "numeric" && (r.values?.length ?? 0) > 0 && (
          <span className={cn("chip text-2xs font-bold", abnormal.length ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300")}>
            {abnormal.length ? `${formatNum(abnormal.length)} خارج الطبيعي` : "كل القيم طبيعية ✓"}
          </span>
        )}
        {interp && interp.severity.level !== "normal" && (
          <span className={cn("chip text-2xs font-black", interp.severity.level === "critical" ? "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300" : "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300")}>
            {interp.severity.level === "critical" ? "⚠ حرج" : "انتبه"}
          </span>
        )}
        {r.kind === "snap" && r.snap_result && (
          <span className={cn("chip text-2xs font-black", positive ? "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300" : "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300")}>
            {positive ? "⚠ إيجابي" : "سلبي ✓"}
          </span>
        )}
        {canEdit && !r.billed && (
          <button
            type="button" onClick={() => onBill(r)}
            title="فوترة بالمبيعات — التحليل ينزل بالسلة جاهزاً"
            className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 px-2.5 text-2xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300"
          >
            <ShoppingCart size={13} /> فوترة
          </button>
        )}
        <button
          type="button" onClick={() => onPrint(r)}
          title="طباعة تقرير هذه النتيجة"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
        >
          <Printer size={15} />
        </button>
        {canEdit && waNum && (
          <button
            type="button" onClick={sendWa}
            title="إرسال النتيجة للمربي واتساب"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-success-50 hover:text-success-600"
          >
            <MessageCircle size={15} />
          </button>
        )}
        {canEdit && (
          <button
            type="button" onClick={() => onToggleBilled(r)}
            title={r.billed ? "محسوبة بالفاتورة — اضغط للإلغاء" : "علّمها محسوبة بالفاتورة"}
            className={cn("grid h-8 w-8 place-items-center rounded-full transition", r.billed ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "text-ink-subtle hover:bg-surface-2 hover:text-ink")}
          >
            <Receipt size={15} />
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={() => onDelete(r.id)} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* دورة الحياة: الخط الزمني للمراحل + زر المرحلة التالية (مطلوب→…→مُعتمدة) */}
      {inFlight && (
        <>
          {overdue && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-danger-50 px-2.5 py-1.5 text-2xs font-black text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
              <AlertTriangle size={13} /> {urgent ? "عاجل ومتأخر" : "متأخر"} — {formatDuration(tat)} بلا نتيجة
            </p>
          )}
          <LabTimeline r={r} />
          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {next && (
                <button
                  type="button"
                  onClick={() => { playTap(); advanceOpensEntry(st) ? onFulfill(r) : onAdvance(r, next); }}
                  className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-extrabold text-white shadow-soft transition active:scale-95",
                    st === "resulted" ? "bg-emerald-600 hover:bg-emerald-700" : st === "running" ? "bg-teal-600 hover:bg-teal-700" : "bg-brand-600 hover:bg-brand-700")}
                >
                  {st === "resulted" ? <BadgeCheck size={15} /> : st === "running" ? <FlaskConical size={15} /> : <ArrowRightLeft size={15} />}
                  {advanceLabel(st)}
                </button>
              )}
              {(st === "ordered" || st === "collected") && (
                <button type="button" onClick={() => { playTap(); onFulfill(r); }} className="text-2xs font-bold text-teal-700 underline-offset-2 hover:underline dark:text-teal-300">
                  سجّل النتيجة مباشرة
                </button>
              )}
              <button
                type="button" onClick={() => onTogglePriority(r)}
                title={urgent ? "إرجاعه عادي" : "علّمه عاجل (STAT)"}
                className={cn("ms-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-2xs font-bold transition", urgent ? "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300" : "bg-surface-2 text-ink-subtle hover:text-ink")}
              >
                <Zap size={12} /> {urgent ? "عاجل" : "عادي"}
              </button>
            </div>
          )}
        </>
      )}

      {r.kind === "numeric" && (r.values?.length ?? 0) > 0 && <ResultSheet values={r.values ?? []} />}

      {interp && <InterpretationPanel insights={interp.insights} />}

      {r.notes && <p className="mt-2.5 whitespace-pre-wrap rounded-xl bg-surface-2/60 p-2.5 text-sm leading-relaxed text-ink">{r.notes}</p>}

      {r.photo_url && (
        <button type="button" onClick={() => setOpenPhoto((o) => !o)} className="mt-2.5 block">
          <img src={r.photo_url} alt="نتيجة المختبر" className={cn("rounded-xl border border-line object-cover transition", openPhoto ? "max-h-[520px]" : "h-20 w-28")} />
        </button>
      )}
    </div>
  );
}

/* ===================== Clinic lab worklist (طابور المختبر) ===================== */
/** A live, clinic-wide board of every test still in flight — from «مطلوب» to
 *  «بانتظار الاعتماد» — grouped by stage, urgent/overdue first. The lab tech
 *  opens any pet's lab tab and sees the whole queue; a tap jumps to the case. */
function LabWorklist({ bumpKey, currentPetId, onAct }: { bumpKey: number; currentPetId: string; onAct: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<LabResult[]>([]);
  const [petName, setPetName] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const [rs, ps] = await Promise.all([repo.listClinicLabResults(), repo.listAllPets()]);
        if (!alive) return;
        setItems(rs.filter((r) => isInFlight(statusOf(r))));
        const map: Record<string, string> = {};
        for (const p of ps) map[p.id] = p.name;
        setPetName(map);
      } catch { /* offline — keep last */ }
    };
    void pull();
    const t = window.setInterval(() => void pull(), 20000);
    const onVis = () => { if (document.visibilityState === "visible") void pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [bumpKey]);

  if (items.length === 0) return null;
  const nowISO = new Date().toISOString();
  const overdueCount = items.filter((r) => isOverdue(r, nowISO)).length;
  const cols: LabStatus[] = ["ordered", "collected", "running", "resulted"];
  const rank = (r: LabResult) => (isOverdue(r, nowISO) ? 0 : r.priority === "urgent" ? 1 : 2);
  const inCol = (c: LabStatus) => items
    .filter((r) => statusOf(r) === c)
    .sort((a, b) => rank(a) - rank(b) || (a.ordered_at || a.created_at || "").localeCompare(b.ordered_at || b.created_at || ""));

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50/60 to-transparent p-3 dark:border-brand-500/30 dark:from-brand-500/10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300"><Activity size={16} /></span>
        <span className="text-sm font-extrabold text-ink">طابور المختبر</span>
        <span className="chip bg-brand-100 text-2xs font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{formatNum(items.length)} قيد الفحص</span>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 px-2 py-1 text-2xs font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300"><AlertTriangle size={11} /> {formatNum(overdueCount)} متأخر</span>
        )}
        <ChevronDown size={16} className={cn("ms-auto text-ink-subtle transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cols.map((c) => {
            const list = inCol(c);
            const m = STATUS_META[c];
            const Icon = STATUS_ICON[m.icon];
            return (
              <div key={c} className="rounded-xl bg-surface-1/70 p-2">
                <div className="mb-1.5 flex items-center gap-1.5 px-1">
                  <span className={cn("grid h-5 w-5 place-items-center rounded-full text-white", m.dot)}><Icon size={11} /></span>
                  <span className="text-2xs font-extrabold text-ink">{m.short}</span>
                  <span className="ms-auto text-2xs font-bold text-ink-subtle">{formatNum(list.length)}</span>
                </div>
                <div className="space-y-1.5">
                  {list.length === 0 && <p className="px-1 py-2 text-center text-[10px] text-ink-subtle">—</p>}
                  {list.map((r) => {
                    const od = isOverdue(r, nowISO);
                    const waited = tatMinutes(r, nowISO);
                    const isCurrent = r.pet_id === currentPetId;
                    return (
                      <button
                        key={r.id} type="button"
                        onClick={() => { playTap(); if (r.pet_id === currentPetId) { onAct(); } else { navigate(`/pet/${r.pet_id}?tab=labs`); } }}
                        className={cn("w-full rounded-lg border bg-surface-1 p-2 text-start transition hover:border-brand-300 active:scale-[.99]",
                          od ? "border-danger-300 dark:border-danger-500/40" : "border-line",
                          isCurrent && "ring-1 ring-brand-400/60")}
                      >
                        <div className="flex items-center gap-1">
                          {r.priority === "urgent" && <Zap size={11} className="shrink-0 text-danger-600 dark:text-danger-400" />}
                          <span className="truncate text-2xs font-extrabold text-ink">{petName[r.pet_id] || "—"}</span>
                          <span className={cn("ms-auto inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold", od ? "text-danger-600 dark:text-danger-400" : "text-ink-subtle")}><Clock size={9} /> {formatDuration(waited)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-ink-muted">{r.panel_label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================== The tab ================================== */

export function LabsTab({ pet, results, canEdit, doctor, onChanged }: {
  pet: Pet; results: LabResult[]; canEdit: boolean; doctor?: string | null; onChanged: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [entryOpen, setEntryOpen] = useState(false);
  const [fulfillTarget, setFulfillTarget] = useState<LabResult | null>(null);
  const [acceptInbox, setAcceptInbox] = useState<LabDeviceInbox | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [shown, setShown] = useState(8);
  const [wlKey, setWlKey] = useState(0);         // bump → clinic worklist re-fetches
  const bumpWl = () => setWlKey((k) => k + 1);

  // صندوق الأجهزة: رسائل وصلت من جهاز المختبر عبر الشبكة، تنتظر ربطها بحيوان.
  // نستطلع بهدوء طول ما تبويب المختبر مفتوح — أي رسالة جديدة تظهر فوق مباشرة.
  const [inbox, setInbox] = useState<LabDeviceInbox[]>([]);
  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    const pull = () => { void repo.listDeviceInbox().then((r) => { if (alive) setInbox(r); }).catch(() => {}); };
    pull();
    const t = window.setInterval(pull, 15000);
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [canEdit]);
  const dismissInbox = (m: LabDeviceInbox) => {
    playTap();
    setInbox((list) => list.filter((x) => x.id !== m.id));
    void repo.markInboxHandled(m.id, "dismissed").catch(() => {});
  };
  /** طلبات هذا الحيوان التي ما زالت تنتظر نتائج — مطلوب/عينة مسحوبة/قيد التشغيل.
   *  «بانتظار الاعتماد» ليست منها: نتائجها مسجّلة أصلاً. */
  const awaitingOrders = useMemo(
    () => results.filter((r) => ["ordered", "collected", "running"].includes(statusOf(r))),
    [results],
  );

  /**
   * ربط رسالة الجهاز بالحالة.
   *
   * كانت تفتح الشاشة بلا هدف، فتُحفظ النتائج كتحليل جديد «بانتظار الاعتماد»
   * غير مفوتر، ويبقى الطلب المباع معلّقاً بمراحله بلا نتائج — يعني الطبيب
   * يفوتر مرة ويسجّل مرتين. الآن نربطها بالطلب المفتوح تلقائياً؛ وإذا كانت
   * الطلبات أكثر من واحد لا نخمّن، بل نعرضها ليختار (الخطأ هنا خطأ فوترة).
   */
  const acceptInboxItem = (m: LabDeviceInbox) => {
    playTap();
    setAcceptInbox(m);
    setFulfillTarget(awaitingOrders.length === 1 ? awaitingOrders[0] : null);
    setEntryOpen(true);
  };

  const printOpts = () => ({ clinicName: getClinicName() || "doctorVet", logoUrl: getClinicLogo() });
  const onPrint = (r: LabResult) => {
    playTap();
    if (!openLabPrint(pet, [r], printOpts())) toast.error("المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة");
  };
  const printAll = () => {
    playTap();
    if (!openLabPrint(pet, results, printOpts())) toast.error("المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة");
  };
  /** فوترة: افتح المبيعات والبند جاهز بالسلة — عند إتمام البيع تتعلم النتيجة «مفوترة» بروحها. */
  const onBill = (r: LabResult) => {
    playTap();
    const q = new URLSearchParams({
      customer: pet.owner_name ?? "", phone: pet.owner_phone ?? "",
      pet: pet.name, petId: pet.id, species: pet.species,
      service: r.panel_label, labId: r.id,
    });
    navigate(`/retail?${q.toString()}`);
  };
  const numericCount = results.filter((r) => r.kind === "numeric" && (r.values?.length ?? 0) > 0).length;

  const onDelete = (id: string) => {
    if (confirmDel !== id) {
      playTap(); setConfirmDel(id);
      toast.toast({ tone: "info", title: "اضغط الحذف مرة ثانية للتأكيد" });
      window.setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirmDel(null);
    void repo.deleteLabResult(id).then(() => { onChanged(); bumpWl(); }).catch(() => toast.error("تعذّر الحذف"));
  };
  const onToggleBilled = (r: LabResult) => {
    playTap();
    void repo.setLabBilled(r.id, !r.billed).then(onChanged).catch(() => {});
  };
  // نقل التحليل للمرحلة التالية بدورة حياته (سحب/تشغيل/اعتماد) مع ختم اللحظة والمسؤول.
  const onAdvance = (r: LabResult, to: LabStatusValue) => {
    playTap();
    const extra = to === "collected" ? { collected_by: doctor ?? null } : to === "verified" ? { verified_by: doctor ?? null } : undefined;
    void repo.advanceLabStatus(r.id, to, extra).then(() => {
      if (to === "verified") {
        playSuccess();
        // حارس الإيراد: نتيجة اعتُمدت وما انفوترت → ذكّر الطبيب يفوترها بضغطة «فوترة».
        const hasContent = (r.values?.length ?? 0) > 0 || !!r.snap_result || !!(r.notes && r.notes.trim());
        if (!r.billed && hasContent) toast.toast({ tone: "info", title: "انعتمدت النتيجة — لا تنسَ فوترتها", description: "اضغط «فوترة» بالبطاقة لإضافتها للمبيعات بسعر عيادتك." });
      }
      onChanged(); bumpWl();
    }).catch(() => toast.error("تعذّر تحديث الحالة"));
  };
  const onTogglePriority = (r: LabResult) => {
    playTap();
    void repo.setLabPriority(r.id, r.priority === "urgent" ? "routine" : "urgent").then(() => { onChanged(); bumpWl(); }).catch(() => {});
  };

  const positives = results.filter((r) => r.snap_result === "positive");

  // Numeric results newest-first, so priorOf can hand each result its predecessor.
  const numericResults = useMemo(
    () => results.filter((r) => r.kind === "numeric" && (r.values?.length ?? 0) > 0).slice().sort((a, b) => b.taken_at.localeCompare(a.taken_at)),
    [results],
  );
  const priorOf = (r: LabResult): LabResult | null => {
    const i = numericResults.findIndex((x) => x.id === r.id);
    return i >= 0 && i + 1 < numericResults.length ? numericResults[i + 1] : null;
  };

  // Case-level severity — the highest severity across the latest numeric result.
  const latestNumeric = numericResults[0];
  const caseInterp = useMemo(
    () => (latestNumeric ? interpretResult(latestNumeric, numericResults[1] ?? null, pet.species) : null),
    [latestNumeric, numericResults, pet.species],
  );

  return (
    <div className="space-y-4">
      {/* طابور المختبر — كل الحالات قيد الفحص بالعيادة، من الطلب لحد الاعتماد */}
      {canEdit && <LabWorklist bumpKey={wlKey} currentPetId={pet.id} onAct={bumpWl} />}

      {/* صندوق الأجهزة: نتائج وصلت من جهاز المختبر عبر الشبكة — استقبلها على هذا الحيوان */}
      {canEdit && inbox.length > 0 && (
        <div className="rounded-2xl border border-teal-300 bg-teal-50/70 p-3 dark:border-teal-500/40 dark:bg-teal-500/10">
          <div className="flex items-center gap-2">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
              <Radio size={16} />
              <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-teal-500" />
            </span>
            <span className="text-sm font-extrabold text-teal-800 dark:text-teal-200">
              وصلتك {formatNum(inbox.length)} نتيجة من جهاز المختبر
            </span>
            <span className="ms-auto text-2xs font-bold text-teal-700/70 dark:text-teal-300/70">اربطها بـ {pet.name}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {inbox.slice(0, 4).map((m) => {
              const peek = readAnalyzerMessage(m.raw, getActiveClinicId());
              // الجهاز قد يرسل عدة عينات بضغطة واحدة (كل الأعمدة المحددة بجدول
              // المراجعة). بلا بصمة مميزة تبدو الصفوف متطابقة والطبيب يخمّن
              // أيها عينته — فنعرض رقم العينة ولمحة من أهم القيم.
              const vitals = (["wbc", "hgb", "plt"] as const)
                .filter((k) => peek.values[k] !== undefined)
                .map((k) => `${k.toUpperCase()} ${formatDec(peek.values[k])}`)
                .join(" · ");
              const empty = peek.count > 0 && Object.values(peek.values).every((v) => v === 0);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-1 px-2.5 py-2">
                  <Inbox size={15} className="text-teal-600 dark:text-teal-400" />
                  <span className="text-2xs font-bold text-ink">
                    {peek.patientHint ? `عينة ${peek.patientHint}` : (m.device_name || "جهاز المختبر")}
                  </span>
                  <span className="text-2xs text-ink-subtle">
                    {peek.count > 0 ? `${formatNum(peek.count)} قيمة (${peek.protocol.toUpperCase()})` : "رسالة"} · {new Date(m.received_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {empty
                    ? <span className="rounded-full bg-warn-50 px-2 py-0.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">كل القيم أصفار — عينة فاضية غالباً</span>
                    : vitals && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold tabular-nums text-ink-muted">{vitals}</span>}
                  <div className="ms-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => acceptInboxItem(m)} className="rounded-full bg-teal-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-teal-700 active:scale-95">
                      استقبال لـ {pet.name}
                    </button>
                    <button type="button" onClick={() => dismissInbox(m)} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:text-danger-600" title="تجاهل"><X size={14} /></button>
                  </div>
                </div>
              );
            })}
            {inbox.length > 4 && <p className="ps-1 text-2xs font-bold text-teal-700/70 dark:text-teal-300/70">و{formatNum(inbox.length - 4)} غيرها…</p>}
          </div>
        </div>
      )}

      {/* شريط الخطورة — أول ما يفتح الدكتور: شكد الحالة خطيرة بنظرة، مع القيم الحرجة مبرزة */}
      {caseInterp && caseInterp.severity.level !== "normal" && (() => {
        const meta = SEV_META[caseInterp.severity.level];
        const Icon = meta.icon;
        return (
          <div className={cn("rounded-2xl border p-3", meta.cls)}>
            <div className="flex items-center gap-2">
              <Icon size={20} />
              <span className="text-sm font-extrabold">{meta.label}</span>
              <span className="ms-auto text-2xs font-bold opacity-80">{formatNum(caseInterp.severity.abnormal)} قيمة خارج الطبيعي · آخر تحليل</span>
            </div>
            {caseInterp.critical.length > 0 && (
              <div className="mt-2 space-y-1">
                {caseInterp.critical.map((c) => (
                  <p key={c.id} className="rounded-lg bg-danger-600/10 px-2.5 py-1.5 text-2xs font-bold text-danger-800 dark:bg-danger-500/20 dark:text-danger-200">{c.title}</p>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-extrabold text-ink">🧪 المختبر</h2>
        <span className="chip bg-surface-2 text-2xs font-bold text-ink-muted">{formatNum(results.length)} نتيجة</span>
        {positives.length > 0 && (
          <span className="chip bg-danger-100 text-2xs font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">
            {formatNum(positives.length)} فحص إيجابي
          </span>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          {numericCount >= 2 && (
            <button type="button" onClick={() => { playTap(); setCompareOpen(true); }} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
              <ArrowRightLeft size={14} /> مقارنة
            </button>
          )}
          {results.length > 0 && (
            <button type="button" onClick={printAll} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
              <Printer size={14} /> طباعة تقرير
            </button>
          )}
          {canEdit && (
            <Button onClick={() => { playTap(); setEntryOpen(true); }} leftIcon={<Plus size={16} />}>تسجيل تحاليل</Button>
          )}
        </div>
      </div>

      <TrendTable results={results} />

      {results.length === 0 ? (
        <div className="card grid place-items-center py-12 text-center">
          <FlaskConical size={30} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm font-bold text-ink-muted">ماكو تحاليل مسجلة بعد</p>
          <p className="mt-1 max-w-sm text-2xs leading-relaxed text-ink-subtle">
            سجّل CBC، كيمياء، فحص سريع، أو أي تحليل — وكل نتيجة راح تظهر هنا وتدخل بجدول تطور القيم تلقائياً.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.slice(0, shown).map((r) => (
            <ResultCard key={r.id} r={r} pet={pet} prior={priorOf(r)} canEdit={canEdit} onDelete={onDelete} onToggleBilled={onToggleBilled} onBill={onBill} onPrint={onPrint} onFulfill={(t) => { playTap(); setFulfillTarget(t); setEntryOpen(true); }} onAdvance={onAdvance} onTogglePriority={onTogglePriority} />
          ))}
          {results.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + 8)} className="mx-auto flex items-center gap-1 rounded-full bg-surface-2 px-4 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
              <ChevronDown size={14} /> عرض المزيد ({formatNum(results.length - shown)})
            </button>
          )}
        </div>
      )}

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} size="wide" title={`مقارنة تحاليل — ${pet.name}`}>
        <CompareView results={results} />
      </Modal>

      <Modal
        open={entryOpen}
        onClose={() => { setEntryOpen(false); setFulfillTarget(null); setAcceptInbox(null); }}
        size="wide"
        title={acceptInbox ? `استقبال نتائج الجهاز — ${pet.name}` : fulfillTarget ? `تسجيل نتائج «${fulfillTarget.panel_label}» — ${pet.name}` : `تسجيل تحاليل — ${pet.name}`}
      >
        <LabEntry
          pet={pet} doctor={doctor} fulfill={fulfillTarget}
          prefill={acceptInbox ? { raw: acceptInbox.raw } : null}
          fulfillPick={acceptInbox ? { target: fulfillTarget, options: awaitingOrders, onPick: setFulfillTarget } : null}
          onSaved={() => {
            // النتيجة انحفظت — علّم رسالة الجهاز «مستقبَلة» وشيلها من الصندوق.
            if (acceptInbox) {
              const id = acceptInbox.id;
              setInbox((list) => list.filter((x) => x.id !== id));
              void repo.markInboxHandled(id, "accepted").catch(() => {});
            }
            onChanged(); bumpWl();
          }}
          onClose={() => { setEntryOpen(false); setFulfillTarget(null); setAcceptInbox(null); }}
        />
      </Modal>
    </div>
  );
}

/* ============================ Before/after compare ============================ */

/** Side-by-side comparison of two numeric results. The verdict per value is by
 *  DISTANCE FROM THE NORMAL BAND: moved closer (or into it) = تحسّن, moved
 *  further = تراجع — direction-aware, so a falling high value counts as better. */
function CompareView({ results }: { results: LabResult[] }) {
  const numeric = useMemo(
    () => results.filter((r) => r.kind === "numeric" && (r.values?.length ?? 0) > 0).slice().sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    [results],
  );
  const [aId, setAId] = useState(() => numeric[Math.max(0, numeric.length - 2)]?.id ?? "");
  const [bId, setBId] = useState(() => numeric[numeric.length - 1]?.id ?? "");
  const A = numeric.find((r) => r.id === aId);
  const B = numeric.find((r) => r.id === bId);
  if (numeric.length < 2) return <p className="py-6 text-center text-sm text-ink-subtle">تحتاج نتيجتين رقميتين على الأقل للمقارنة.</p>;

  // مسافة القيمة عن النطاق. الحكم بلا رقم (أو المقارنة المختلطة) يُقاس بدرجته: جداً=2، عادي=1، طبيعي=0.
  const dist = (v: LabValue, other?: LabValue) => {
    const mixed = v.value === undefined || other?.value === undefined;
    if (mixed || v.low === undefined || v.high === undefined) return FLAG_ORD[v.flag];
    return v.value! < v.low ? v.low - v.value! : v.value! > v.high ? v.value! - v.high : 0;
  };

  const rows: { id: string; label: string; a?: LabValue; b?: LabValue }[] = [];
  for (const src of [A, B]) {
    for (const v of src?.values ?? []) {
      if (!rows.some((x) => x.id === v.id)) rows.push({ id: v.id, label: `${v.abbr ?? ""} ${v.label ?? ""}`.trim() });
    }
  }
  for (const row of rows) {
    row.a = (A?.values ?? []).find((v) => v.id === row.id);
    row.b = (B?.values ?? []).find((v) => v.id === row.id);
  }

  const pick = (id: string, side: "a" | "b") => { playTap(); (side === "a" ? setAId : setBId)(id); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => (
          <div key={side}>
            <p className="mb-1.5 text-2xs font-bold text-ink-muted">{side === "a" ? "قبل" : "بعد"}</p>
            <div className="flex flex-wrap gap-1.5">
              {numeric.map((r) => (
                <button key={r.id} type="button" onClick={() => pick(r.id, side)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-bold tabular-nums transition", (side === "a" ? aId : bId) === r.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")} dir="ltr">
                  {new Date(r.taken_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {A && B && (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-2xs text-ink-muted">
                <th className="px-3 py-2 text-start font-bold">الفحص</th>
                <th className="px-2 py-2 text-center font-bold" dir="ltr">{new Date(A.taken_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</th>
                <th className="px-2 py-2 text-center font-bold" dir="ltr">{new Date(B.taken_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</th>
                <th className="px-2 py-2 text-center font-bold">الاتجاه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const verdict = row.a && row.b
                  ? (dist(row.b, row.a) < dist(row.a, row.b) ? "up" : dist(row.b, row.a) > dist(row.a, row.b) ? "down" : "flat")
                  : null;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-bold text-ink">{row.label}</td>
                    {[row.a, row.b].map((v, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        {v ? <span className={cn("inline-block min-w-[56px] rounded-lg px-1.5 py-1 text-xs font-extrabold tabular-nums", FLAG_CELL[v.flag])} dir="ltr">{v.value !== undefined ? `${formatDec(v.value)}${v.flag !== "normal" ? ` ${ARROW5[v.flag]}` : ""}` : ARROW5[v.flag]}</span> : <span className="text-ink-subtle/40">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      {verdict === "up" && <span className="chip bg-success-50 text-2xs font-black text-success-700 dark:bg-success-500/15 dark:text-success-300">تحسّن ✓</span>}
                      {verdict === "down" && <span className="chip bg-danger-50 text-2xs font-black text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">تراجع !</span>}
                      {verdict === "flat" && <span className="chip bg-surface-2 text-2xs font-bold text-ink-subtle">مستقر</span>}
                      {verdict === null && <span className="text-ink-subtle/40">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-2xs leading-relaxed text-ink-subtle">«تحسّن» = القيمة اقتربت من نطاقها الطبيعي أو دخلت فيه — حتى لو نزلت من رقم أعلى. المقارنة بمسافة القيمة عن النطاق، مو بمجرد صعودها ونزولها.</p>
    </div>
  );
}

/* ===================== Case-sheet strip (بطاقة الطبلة) ===================== */

/** Compact «آخر تحاليل» summary for the visit page — glance, don't leave the case. */
export function LastLabsStrip({ results, onOpen }: { results: LabResult[]; onOpen: () => void }) {
  if (!results.length) return null;
  const latest = results[0];
  const abnormal = (latest.values ?? []).filter((v) => v.flag !== "normal");
  const positives = results.filter((r) => r.snap_result === "positive" && r.id !== latest.id);
  return (
    <button
      type="button" onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-brand-300"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"><FlaskConical size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-ink">آخر تحاليل: {latest.panel_label}</p>
        <p className="text-2xs text-ink-subtle" dir="auto">
          <span dir="ltr">{formatDate(latest.taken_at, "ar")}</span>
          {latest.kind === "numeric" ? (abnormal.length ? ` · ${formatNum(abnormal.length)} قيمة خارج الطبيعي` : " · كل القيم طبيعية") : ""}
          {latest.snap_result ? (latest.snap_result === "positive" ? " · إيجابي ⚠" : " · سلبي ✓") : ""}
        </p>
      </div>
      {abnormal.slice(0, 3).map((v) => (
        <span key={v.id} className={cn("rounded-lg px-1.5 py-0.5 text-2xs font-black tabular-nums", FLAG_CHIP[v.flag])} dir="ltr">
          {v.abbr ?? v.label} {ARROW5[v.flag]}
        </span>
      ))}
      {positives.length > 0 && (
        <span className="rounded-lg bg-danger-100 px-1.5 py-0.5 text-2xs font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">
          +{formatNum(positives.length)} إيجابي
        </span>
      )}
      <span className="text-2xs font-bold text-brand-600">فتح المختبر ←</span>
    </button>
  );
}
