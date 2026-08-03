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
import { useMemo, useRef, useState } from "react";
import { FlaskConical, Plus, Camera, Trash2, Receipt, ChevronDown, AlertTriangle, CheckCircle2, MessageCircle, Printer, ShoppingCart, ArrowRightLeft } from "lucide-react";
import type { Pet, LabResult, LabValue } from "@/types";
import { repo } from "@/lib/repo";
import {
  LAB_PARAMS, LAB_GROUPS, nameFromGroups, labParamById, labRange, labFlag,
  snapTestsFor, snapTestById, type LabFlag,
} from "@/lib/labCatalog";
import { FLAG_ARROW } from "@/lib/cbc";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { prepareUpload } from "@/lib/image";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { cn, formatNum, formatDate } from "@/lib/utils";
import { waNumber } from "@/lib/phone";
import { getDialCode, getClinicName, getClinicLogo } from "@/lib/settings";
import { openLabPrint } from "@/lib/labPrint";
import { useNavigate } from "react-router-dom";

const FLAG_CHIP: Record<LabFlag, string> = {
  low: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  normal: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  high: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300",
};
const FLAG_CELL: Record<LabFlag, string> = {
  low: "bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-200",
  normal: "bg-success-50 text-success-800 dark:bg-success-500/10 dark:text-success-200",
  high: "bg-danger-100 text-danger-800 dark:bg-danger-500/25 dark:text-danger-200",
};

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

export function LabEntry({ pet, visitId, doctor, onSaved, onClose, fulfill }: {
  pet: Pet; visitId?: string | null; doctor?: string | null;
  onSaved: () => void; onClose: () => void;
  /** طلب «بانتظار النتائج» (بيع من المبيعات): النتيجة الجديدة تحل محله وترث فوترته وزيارته. */
  fulfill?: LabResult | null;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<EntryMode | null>(null);
  const [group, setGroup] = useState("blood");   // active value-group filter
  const [openParam, setOpenParam] = useState<string | null>(null); // expanded slider row
  const [q, setQ] = useState("");                 // search across every param
  const [vals, setVals] = useState<Record<string, string>>({});
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

  /** Snapshot every value the doctor actually typed (any group) + free rows. */
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
        panel_id: mode === "numbers" ? named!.panel_id : mode === "snap" ? "snap" : microType.id,
        panel_label: mode === "numbers" ? named!.panel_label : mode === "snap" ? `فحص سريع — ${snap?.label ?? ""}` : microType.label,
        kind: mode === "numbers" ? "numeric" : mode === "snap" ? "snap" : "descriptive",
        values,
        snap_test_id: mode === "snap" ? snapTest : null,
        snap_result: mode === "snap" ? snapResult : null,
        notes: notes.trim() || null,
        photo_url: photo,
        doctor: doctor ?? null,
        billed: fulfill?.billed ?? false, // الطلب المباع يبقى مفوتراً بعد تسجيل نتائجه
        taken_at: new Date(takenAt + "T12:00:00").toISOString(),
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
  const groupFilled = (g: { params: string[] }) => g.params.filter((pid) => (vals[pid] ?? "").trim() !== "").length;
  const query = q.trim().toLowerCase();
  const visibleParams = query
    ? LAB_PARAMS.filter((p) => p.abbr.toLowerCase().includes(query) || p.label.includes(q.trim()))
    : (LAB_GROUPS.find((g) => g.id === group)?.params ?? []).map((pid) => labParamById(pid)!).filter(Boolean);

  return (
    <div className="space-y-4">
      {header}

      {mode === "numbers" && (
        <>
          <p className="rounded-xl bg-brand-50/60 px-3 py-2 text-2xs font-semibold leading-relaxed text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
            اضغط على أي فحص وحرّك المؤشر أو استخدم + و − (أو اكتب مباشرة) — عبّي بس الموجود بورقة الجهاز، والسستم يسمي التحليل ويلوّن القيم بروحه.
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
                      <p className="text-2xs tabular-nums text-ink-subtle" dir="ltr">{formatNum(lo)}–{formatNum(hi)} {p.unit}</p>
                    </div>
                    {num !== null && Number.isFinite(num) ? (
                      <span className={cn("rounded-xl px-2.5 py-1 text-base font-extrabold tabular-nums", FLAG_CHIP[flag ?? "normal"])} dir="ltr">
                        {formatNum(num)}{flag && flag !== "normal" ? ` ${FLAG_ARROW[flag]}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-xl bg-surface-2 px-3 py-1 text-sm font-bold text-ink-subtle">اضغط للإدخال</span>
                    )}
                  </button>

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
                          <span>{formatNum(p.min)}</span>
                          <span className="text-success-600">{formatNum(lo)} — {formatNum(hi)} طبيعي</span>
                          <span>{formatNum(p.max)}</span>
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
                          {formatNum(v.value)}{v.flag !== "normal" ? ` ${FLAG_ARROW[v.flag]}` : ""}
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
      const range = v.low !== undefined && v.high !== undefined ? ` (الطبيعي ${formatNum(v.low)}–${formatNum(v.high)})` : "";
      const mark = v.flag === "high" ? " مرتفع ↑" : v.flag === "low" ? " منخفض ↓" : " طبيعي ✓";
      lines.push(`• ${v.abbr ?? v.label}: ${formatNum(v.value)} ${v.unit}${mark}${range}`);
    }
  }
  if (r.kind === "snap") lines.push(r.snap_result === "positive" ? "النتيجة: إيجابية ⚠ — يرجى مراجعة العيادة." : "النتيجة: سلبية ✓");
  if (r.notes) lines.push(`ملاحظات الطبيب: ${r.notes}`);
  lines.push(`مع تمنياتنا بالسلامة لـ${pet.name} — ${clinic} 🐾`);
  return lines.join("\n");
}

function ResultCard({ r, pet, canEdit, onDelete, onToggleBilled, onBill, onPrint, onFulfill }: {
  r: LabResult; pet: Pet; canEdit: boolean; onDelete: (id: string) => void; onToggleBilled: (r: LabResult) => void;
  onBill: (r: LabResult) => void; onPrint: (r: LabResult) => void; onFulfill: (r: LabResult) => void;
}) {
  const [openPhoto, setOpenPhoto] = useState(false);
  const abnormal = (r.values ?? []).filter((v) => v.flag !== "normal");
  const positive = r.snap_result === "positive";
  // طلب جاي من المبيعات — انباع بس النتائج بعدها ما مسجلة
  const pending = r.panel_id === "ordered" && !(r.values?.length) && !r.snap_result;
  const waNum = pet.owner_phone ? waNumber(pet.owner_phone, getDialCode()) : "";
  const sendWa = () => {
    if (!waNum) return;
    playTap();
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waResultMessage(pet, r))}`, "_blank", "noopener,noreferrer");
    void repo.logWhatsApp({ pet_id: pet.id, owner_name: pet.owner_name ?? null, owner_phone: pet.owner_phone ?? null, reminder_type: "lab_result" }).catch(() => {});
  };
  return (
    <div className={cn("card p-4", positive && "border-danger-300 ring-1 ring-danger-300/50 dark:border-danger-500/50", pending && "border-warn-300 bg-warn-50/30 dark:border-warn-500/40 dark:bg-warn-500/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", positive ? "bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-300" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300")}>
          <FlaskConical size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{r.panel_label}</p>
          <p className="text-2xs text-ink-subtle">
            <span dir="ltr">{formatDate(r.taken_at, "ar")}</span>
            {r.doctor ? ` · ${r.doctor}` : ""}
          </p>
        </div>
        {pending && (
          <span className="chip bg-warn-100 text-2xs font-black text-warn-700 dark:bg-warn-500/20 dark:text-warn-300">⏳ بانتظار تسجيل النتائج</span>
        )}
        {pending && canEdit && (
          <button
            type="button" onClick={() => onFulfill(r)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warn-500 px-3.5 text-xs font-extrabold text-white shadow-soft transition hover:bg-warn-600 active:scale-95"
          >
            <FlaskConical size={14} /> تسجيل النتائج
          </button>
        )}
        {r.kind === "numeric" && (r.values?.length ?? 0) > 0 && (
          <span className={cn("chip text-2xs font-bold", abnormal.length ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300")}>
            {abnormal.length ? `${formatNum(abnormal.length)} خارج الطبيعي` : "كل القيم طبيعية ✓"}
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

      {r.kind === "numeric" && (r.values?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(r.values ?? []).map((v) => (
            <span key={v.id} className={cn("inline-flex items-baseline gap-1 rounded-xl px-2 py-1 text-xs font-bold tabular-nums", FLAG_CHIP[v.flag])} dir="ltr" title={`${v.label ?? v.id}${v.low !== undefined && v.high !== undefined ? ` · النطاق ${formatNum(v.low)}–${formatNum(v.high)}` : ""}`}>
              <span className="font-black">{v.abbr ?? v.label}</span>
              {formatNum(v.value)}{v.unit ? <span className="text-[9px] opacity-70">{v.unit}</span> : null}
              {v.flag !== "normal" && <span>{FLAG_ARROW[v.flag]}</span>}
            </span>
          ))}
        </div>
      )}

      {r.notes && <p className="mt-2.5 whitespace-pre-wrap rounded-xl bg-surface-2/60 p-2.5 text-sm leading-relaxed text-ink">{r.notes}</p>}

      {r.photo_url && (
        <button type="button" onClick={() => setOpenPhoto((o) => !o)} className="mt-2.5 block">
          <img src={r.photo_url} alt="نتيجة المختبر" className={cn("rounded-xl border border-line object-cover transition", openPhoto ? "max-h-[520px]" : "h-20 w-28")} />
        </button>
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
  const [compareOpen, setCompareOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [shown, setShown] = useState(8);

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
    void repo.deleteLabResult(id).then(onChanged).catch(() => toast.error("تعذّر الحذف"));
  };
  const onToggleBilled = (r: LabResult) => {
    playTap();
    void repo.setLabBilled(r.id, !r.billed).then(onChanged).catch(() => {});
  };

  const positives = results.filter((r) => r.snap_result === "positive");

  return (
    <div className="space-y-4">
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
            <ResultCard key={r.id} r={r} pet={pet} canEdit={canEdit} onDelete={onDelete} onToggleBilled={onToggleBilled} onBill={onBill} onPrint={onPrint} onFulfill={(t) => { playTap(); setFulfillTarget(t); setEntryOpen(true); }} />
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

      <Modal open={entryOpen} onClose={() => { setEntryOpen(false); setFulfillTarget(null); }} size="wide" title={fulfillTarget ? `تسجيل نتائج «${fulfillTarget.panel_label}» — ${pet.name}` : `تسجيل تحاليل — ${pet.name}`}>
        <LabEntry pet={pet} doctor={doctor} fulfill={fulfillTarget} onSaved={onChanged} onClose={() => { setEntryOpen(false); setFulfillTarget(null); }} />
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

  const dist = (v: { value: number; low?: number; high?: number }) =>
    v.low === undefined || v.high === undefined ? 0 : v.value < v.low ? v.low - v.value : v.value > v.high ? v.value - v.high : 0;

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
                  ? (dist(row.b) < dist(row.a) ? "up" : dist(row.b) > dist(row.a) ? "down" : "flat")
                  : null;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-bold text-ink">{row.label}</td>
                    {[row.a, row.b].map((v, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        {v ? <span className={cn("inline-block min-w-[56px] rounded-lg px-1.5 py-1 text-xs font-extrabold tabular-nums", FLAG_CELL[v.flag])} dir="ltr">{formatNum(v.value)}{v.flag !== "normal" ? ` ${FLAG_ARROW[v.flag]}` : ""}</span> : <span className="text-ink-subtle/40">—</span>}
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
          {v.abbr ?? v.label} {FLAG_ARROW[v.flag]}
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
