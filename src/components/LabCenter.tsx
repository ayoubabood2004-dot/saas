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
import { FlaskConical, Plus, Camera, Trash2, Receipt, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Pet, LabResult, LabValue } from "@/types";
import { repo } from "@/lib/repo";
import {
  LAB_PANELS, labParamById, labRange, labFlag, snapTestsFor, snapTestById,
  type LabPanel, type LabFlag,
} from "@/lib/labCatalog";
import { FLAG_ARROW } from "@/lib/cbc";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { prepareUpload } from "@/lib/image";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { cn, formatNum, formatDate } from "@/lib/utils";

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

function LabEntry({ pet, visitId, doctor, onSaved, onClose }: {
  pet: Pet; visitId?: string | null; doctor?: string | null;
  onSaved: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [panel, setPanel] = useState<LabPanel | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [snapTest, setSnapTest] = useState<string | null>(null);
  const [snapResult, setSnapResult] = useState<"positive" | "negative" | null>(null);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // free-form rows for the «تحليل حر» panel
  const [freeRows, setFreeRows] = useState<{ label: string; value: string; unit: string; low: string; high: string }[]>(
    [{ label: "", value: "", unit: "", low: "", high: "" }],
  );
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const prep = await prepareUpload(f, { maxDim: 1280, quality: 0.72 });
      setPhoto(prep.dataUrl);
    } catch { playWarning(); toast.error("تعذّر تجهيز الصورة"); }
  };

  /** Build the snapshotted values array from what the doctor actually typed. */
  const buildValues = (): LabValue[] => {
    if (panel?.id === "custom") {
      return freeRows
        .filter((r) => r.label.trim() && r.value.trim() !== "" && Number.isFinite(Number(r.value)))
        .map((r) => {
          const v = Number(r.value);
          const lo = r.low.trim() === "" ? undefined : Number(r.low);
          const hi = r.high.trim() === "" ? undefined : Number(r.high);
          return {
            id: `free_${r.label.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
            label: r.label.trim(), value: v, unit: r.unit.trim(),
            low: lo, high: hi, flag: labFlag(v, lo, hi),
          };
        });
    }
    const out: LabValue[] = [];
    for (const pid of panel?.params ?? []) {
      const raw = vals[pid];
      if (raw === undefined || raw.trim() === "" || !Number.isFinite(Number(raw))) continue;
      const p = labParamById(pid);
      if (!p) continue;
      const [lo, hi] = labRange(p, pet.species);
      const v = Number(raw);
      out.push({ id: pid, label: p.label, abbr: p.abbr, value: v, unit: p.unit, low: lo, high: hi, flag: labFlag(v, lo, hi) });
    }
    return out;
  };

  const filledCount = panel?.kind === "numeric" ? buildValues().length : 0;
  const canSave = !busy && !!panel && (
    panel.kind === "numeric" ? filledCount > 0 || !!notes.trim() || !!photo
      : panel.kind === "snap" ? !!snapTest && !!snapResult
        : !!notes.trim() || !!photo
  );

  const save = async () => {
    if (!panel || !canSave) return;
    setBusy(true);
    try {
      const snap = snapTest ? snapTestById(snapTest) : undefined;
      await repo.addLabResult({
        pet_id: pet.id, visit_id: visitId ?? null,
        panel_id: panel.id,
        panel_label: panel.kind === "snap" && snap ? `فحص سريع — ${snap.label}` : panel.label,
        kind: panel.kind,
        values: panel.kind === "numeric" ? buildValues() : null,
        snap_test_id: panel.kind === "snap" ? snapTest : null,
        snap_result: panel.kind === "snap" ? snapResult : null,
        notes: notes.trim() || null,
        photo_url: photo,
        doctor: doctor ?? null,
        billed: false,
        taken_at: new Date(takenAt + "T12:00:00").toISOString(),
      });
      playSuccess();
      toast.success("انحفظت النتيجة بسجل المختبر");
      onSaved();
      onClose();
    } catch (e) {
      playWarning();
      toast.error("تعذّر حفظ النتيجة", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  /* ---- Step 1: panel picker ---- */
  if (!panel) {
    return (
      <div>
        <p className="mb-3 text-sm text-ink-muted">اختر نوع الفحص — تنفتح حقوله فقط، بلا قوائم طويلة.</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {LAB_PANELS.map((p) => (
            <button
              key={p.id} type="button"
              onClick={() => { playTap(); setPanel(p); }}
              className="flex flex-col items-start gap-1 rounded-2xl border border-line bg-surface-1 p-3.5 text-start transition hover:border-brand-300 hover:bg-brand-50/40 active:scale-[.98] dark:hover:bg-brand-500/10"
            >
              <span className="text-2xl leading-none">{p.emoji}</span>
              <span className="mt-1 text-sm font-extrabold text-ink">{p.label}</span>
              {p.hint && <span className="text-2xs leading-snug text-ink-subtle">{p.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Step 2: the panel's own form ---- */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { playTap(); setPanel(null); setVals({}); setSnapTest(null); setSnapResult(null); }} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
          ← تغيير الفحص
        </button>
        <span className="text-base font-extrabold text-ink">{panel.emoji} {panel.label}</span>
        <label className="ms-auto flex items-center gap-1.5 text-xs text-ink-subtle">
          تاريخ التحليل
          <input type="date" dir="ltr" value={takenAt} onChange={(e) => e.target.value && setTakenAt(e.target.value)} className="input h-8 py-0 text-sm [color-scheme:light] dark:[color-scheme:dark]" />
        </label>
      </div>

      {panel.kind === "numeric" && panel.id !== "custom" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(panel.params ?? []).map((pid) => {
            const p = labParamById(pid);
            if (!p) return null;
            const [lo, hi] = labRange(p, pet.species);
            const raw = vals[pid] ?? "";
            const num = raw.trim() === "" ? null : Number(raw);
            const flag: LabFlag | null = num === null || !Number.isFinite(num) ? null : labFlag(num, lo, hi);
            return (
              <div key={pid} className={cn("flex items-center gap-2.5 rounded-2xl border p-2.5 transition", flag === "high" ? "border-danger-300 bg-danger-50/50 dark:border-danger-500/40 dark:bg-danger-500/10" : flag === "low" ? "border-sky-300 bg-sky-50/50 dark:border-sky-500/40 dark:bg-sky-500/10" : "border-line bg-surface-1")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink"><span dir="ltr">{p.abbr}</span> · {p.label}</p>
                  <p className="text-2xs tabular-nums text-ink-subtle" dir="ltr">{formatNum(lo)}–{formatNum(hi)} {p.unit}</p>
                </div>
                <input
                  type="number" inputMode="decimal" step={p.step} dir="ltr" placeholder="—" value={raw}
                  onChange={(e) => setVals((m) => ({ ...m, [pid]: e.target.value }))}
                  className="input h-10 w-24 px-2 py-0 text-center text-base font-extrabold tabular-nums"
                />
                {flag && <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black", FLAG_CHIP[flag])}>{FLAG_ARROW[flag]}</span>}
              </div>
            );
          })}
        </div>
      )}

      {panel.id === "custom" && (
        <div className="space-y-2">
          {freeRows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface-1 p-2.5 sm:grid-cols-[1fr,90px,80px,80px,80px,auto] sm:items-center">
              <input value={r.label} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="اسم الفحص" className="input h-9 py-0 text-sm font-bold col-span-2 sm:col-span-1" />
              <input value={r.value} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} type="number" dir="ltr" placeholder="القيمة" className="input h-9 px-2 py-0 text-center text-sm font-extrabold tabular-nums" />
              <input value={r.unit} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} dir="ltr" placeholder="الوحدة" className="input h-9 px-2 py-0 text-center text-sm" />
              <input value={r.low} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, low: e.target.value } : x))} type="number" dir="ltr" placeholder="من" className="input h-9 px-2 py-0 text-center text-sm tabular-nums" />
              <input value={r.high} onChange={(e) => setFreeRows((rs) => rs.map((x, j) => j === i ? { ...x, high: e.target.value } : x))} type="number" dir="ltr" placeholder="إلى" className="input h-9 px-2 py-0 text-center text-sm tabular-nums" />
              <button type="button" onClick={() => setFreeRows((rs) => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setFreeRows((rs) => [...rs, { label: "", value: "", unit: "", low: "", high: "" }])} className="chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink">
            <Plus size={12} /> فحص آخر
          </button>
          <p className="text-2xs text-ink-subtle">النطاق الطبيعي (من/إلى) اختياري — إذا كتبته تنلوّن القيمة تلقائياً.</p>
        </div>
      )}

      {panel.kind === "snap" && (
        <div className="space-y-3">
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

      {/* Notes + photo — every kind gets them (sediment, culture table, remarks…). */}
      <div className="space-y-2">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={panel.kind === "descriptive" ? "النتيجة والملاحظات (ما شوهد بالمجهر، البكتيريا والمضاد الفعال…)" : "ملاحظات إضافية (اختياري)"}
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
        <span className="text-2xs text-ink-subtle">
          {panel.kind === "numeric" && filledCount > 0 ? `${formatNum(filledCount)} قيمة جاهزة للحفظ` : ""}
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

function ResultCard({ r, canEdit, onDelete, onToggleBilled }: {
  r: LabResult; canEdit: boolean; onDelete: (id: string) => void; onToggleBilled: (r: LabResult) => void;
}) {
  const [openPhoto, setOpenPhoto] = useState(false);
  const abnormal = (r.values ?? []).filter((v) => v.flag !== "normal");
  const positive = r.snap_result === "positive";
  return (
    <div className={cn("card p-4", positive && "border-danger-300 ring-1 ring-danger-300/50 dark:border-danger-500/50")}>
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
  const [entryOpen, setEntryOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [shown, setShown] = useState(8);

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
        {canEdit && (
          <Button className="ms-auto" onClick={() => { playTap(); setEntryOpen(true); }} leftIcon={<Plus size={16} />}>تسجيل تحاليل</Button>
        )}
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
            <ResultCard key={r.id} r={r} canEdit={canEdit} onDelete={onDelete} onToggleBilled={onToggleBilled} />
          ))}
          {results.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + 8)} className="mx-auto flex items-center gap-1 rounded-full bg-surface-2 px-4 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
              <ChevronDown size={14} /> عرض المزيد ({formatNum(results.length - shown)})
            </button>
          )}
        </div>
      )}

      <Modal open={entryOpen} onClose={() => setEntryOpen(false)} size="wide" title={`تسجيل تحاليل — ${pet.name}`}>
        <LabEntry pet={pet} doctor={doctor} onSaved={onChanged} onClose={() => setEntryOpen(false)} />
      </Modal>
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
