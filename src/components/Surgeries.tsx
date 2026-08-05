// ============================================================================
// سجل العمليات الجراحية — داخل سجل الحالة (الطبلة) وملف الحيوان.
//
// الطبيب يفتح الحالة → «تسجيل عملية» → يختار من كتالوج علمي منظم (أو يكتب
// اسم العملية بأي لغة) → التاريخ يُحدد تلقائياً بوقت الآن ويبقى قابلاً
// للتعديل لعملية أُجريت سابقاً → تفاصيل جراحية اختيارية دقيقة: المدخل
// الجراحي، أنماط الخياطة العلمية، مادة الخيط وقياسه، التخدير والمدة
// والنتيجة والملاحظات وموعد متابعة اختياري (شيل خيوط / مراجعة).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { Slice, Plus, Search, Clock, UserRound, CalendarCheck2, Trash2, ChevronDown, Check, Stethoscope } from "lucide-react";
import type { Surgery } from "@/types";
import { repo } from "@/lib/repo";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { DoctorSelect } from "@/components/MedicalEntry";
import { SURGERY_CATALOG, APPROACH_OPTIONS, SUTURE_PATTERNS, SUTURE_MATERIALS, SUTURE_SIZES, ANESTHESIA_OPTIONS, SURGERY_OUTCOMES, outcomeLabel } from "@/lib/surgeryCatalog";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { playSuccess, playTap } from "@/lib/sounds";

/* يحوّل Date إلى قيمة datetime-local بالمنطقة المحلية (وليس UTC). */
const localDT = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const OUTCOME_TONE: Record<string, string> = {
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  complications: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  critical: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
};

/* ------------------------------ بطاقة عملية ------------------------------ */
function SurgeryCard({ s, lang, onDelete }: { s: Surgery; lang: string; onDelete?: (s: Surgery) => void }) {
  const [expanded, setExpanded] = useState(false);
  const details = [
    s.approach && ["المدخل الجراحي", s.approach],
    s.suture_pattern && ["أنماط الخياطة", s.suture_pattern],
    s.suture_material && ["مادة الخيط", [s.suture_material, s.suture_size].filter(Boolean).join(" · ")],
    s.anesthesia && ["التخدير", s.anesthesia],
    s.duration_min ? ["مدة العملية", `${s.duration_min} دقيقة`] : null,
    s.notes && ["ملاحظات", s.notes],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><Slice size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-ink">{s.name}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs font-bold text-ink-subtle">
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatDate(s.performed_at, lang)}</span>
            {s.surgeon && <span className="inline-flex items-center gap-1"><UserRound size={11} /> {s.surgeon}</span>}
          </div>
        </div>
        {s.outcome && <span className={cn("rounded-full px-2.5 py-1 text-2xs font-black", OUTCOME_TONE[s.outcome] ?? "bg-surface-2 text-ink-muted")}>{outcomeLabel(s.outcome)}</span>}
        {s.followup_on && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-black text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <CalendarCheck2 size={11} /> متابعة {formatDate(s.followup_on, lang)}
          </span>
        )}
        {details.length > 0 && (
          <button onClick={() => { playTap(); setExpanded((v) => !v); }} className="rounded-lg p-1.5 text-ink-subtle transition hover:bg-surface-2 hover:text-ink" aria-label="التفاصيل">
            <ChevronDown size={15} className={cn("transition-transform", expanded && "rotate-180")} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(s)} className="rounded-lg p-1.5 text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600" aria-label="حذف">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {expanded && details.length > 0 && (
        <dl className="mt-3 grid gap-x-5 gap-y-2 border-t border-line pt-3 sm:grid-cols-2">
          {details.map(([k, v]) => (
            <div key={k} className="text-xs">
              <dt className="mb-0.5 font-bold text-ink-subtle">{k}</dt>
              <dd className="whitespace-pre-wrap font-semibold leading-relaxed text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* --------------------------- نافذة تسجيل عملية --------------------------- */
function SurgeryModal({ open, petId, visitId, defaultSurgeon, onClose, onSaved }: {
  open: boolean; petId: string; visitId?: string | null; defaultSurgeon: string;
  onClose: () => void; onSaved: (s: Surgery) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [at, setAt] = useState(localDT());
  const [surgeon, setSurgeon] = useState(defaultSurgeon);
  const [anesthesia, setAnesthesia] = useState<string>("تخدير عام");
  const [duration, setDuration] = useState("");
  const [outcome, setOutcome] = useState<string>("success");
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [approach, setApproach] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [material, setMaterial] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ(""); setCat(null); setName(""); setCategory(null);
    setAt(localDT()); setSurgeon(defaultSurgeon); setAnesthesia("تخدير عام");
    setDuration(""); setOutcome("success"); setNotes(""); setFollowup("");
    setDetailsOpen(false); setApproach(null); setPatterns([]); setMaterial(null); setSize(null);
    setBusy(false);
  }, [open, defaultSurgeon]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SURGERY_CATALOG
      .filter((c) => !cat || c.key === cat)
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => !needle || it.name.toLowerCase().includes(needle) || (it.en ?? "").toLowerCase().includes(needle)),
      }))
      .filter((c) => c.items.length > 0);
  }, [q, cat]);

  const pick = (catLabel: string, itemName: string, en: string | undefined, followupDays: number | undefined) => {
    playTap();
    setName(en ? `${itemName} — ${en}` : itemName);
    setCategory(catLabel);
    if (followupDays && !followup) {
      const d = new Date(at || Date.now());
      d.setDate(d.getDate() + followupDays);
      setFollowup(d.toISOString().slice(0, 10));
    }
  };

  const togglePattern = (p: string) =>
    setPatterns((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const row = await repo.addSurgery({
        pet_id: petId, visit_id: visitId ?? null,
        name: name.trim(), category,
        performed_at: new Date(at || Date.now()).toISOString(),
        surgeon: surgeon.trim() || null, anesthesia, duration_min: duration.trim() ? Math.max(0, Math.round(Number(duration))) : null,
        outcome, approach,
        suture_pattern: patterns.length ? patterns.join(" + ") : null,
        suture_material: material, suture_size: material ? size : null,
        notes: notes.trim() || null, followup_on: followup || null,
      });
      playSuccess();
      toast.success("سُجلت العملية في ملف الحيوان");
      onSaved(row);
      onClose();
    } catch (e) {
      toast.error("تعذّر حفظ العملية — حاول مجدداً");
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="full" title="تسجيل عملية جراحية">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* ---- العمود الأول: اختيار العملية ---- */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العملية — عربي أو علمي…" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { playTap(); setCat(null); }} className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition", !cat ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>الكل</button>
            {SURGERY_CATALOG.map((c) => (
              <button key={c.key} onClick={() => { playTap(); setCat(cat === c.key ? null : c.key); }} className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition", cat === c.key ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pe-1">
            {results.map((c) => (
              <div key={c.key}>
                <div className="mb-1.5 text-2xs font-black text-ink-subtle">{c.icon} {c.label}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {c.items.map((it) => {
                    const active = name.startsWith(it.name);
                    return (
                      <button key={it.name} onClick={() => pick(c.label, it.name, it.en, it.followupDays)}
                        className={cn("rounded-xl border p-2.5 text-start transition", active ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                        <div className="text-xs font-extrabold text-ink">{it.name}</div>
                        {it.en && <div className="mt-0.5 text-2xs font-semibold text-ink-subtle" dir="ltr">{it.en}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {results.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-xs text-ink-muted">لا نتائج — اكتب اسم العملية يدوياً في الحقل المجاور، بأي لغة تريد.</p>}
          </div>
        </div>

        {/* ---- العمود الثاني: التفاصيل ---- */}
        <div className="space-y-3.5">
          <div>
            <label className="label">اسم العملية — اكتبه بأي لغة أو اختر من القائمة</label>
            <input className="input font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: تعقيم أنثى — Ovariohysterectomy" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">تاريخ ووقت العملية</label>
              <input type="datetime-local" dir="ltr" className="input tabular-nums" value={at} max={localDT()} onChange={(e) => setAt(e.target.value)} />
              <p className="mt-1 text-2xs text-ink-subtle">يُحدد تلقائياً بوقت الآن — عدّله إذا أُجريت العملية سابقاً.</p>
            </div>
            <div>
              <label className="label">الجرّاح</label>
              <DoctorSelect value={surgeon} onChange={setSurgeon} placeholder="اختر الطبيب…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">التخدير</label>
              <select className="input" value={anesthesia} onChange={(e) => setAnesthesia(e.target.value)}>
                {ANESTHESIA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">مدة العملية (دقيقة)</label>
              <input type="number" min="0" step="5" inputMode="numeric" className="input tabular-nums" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" />
            </div>
          </div>
          <div>
            <label className="label">النتيجة</label>
            <div className="flex flex-wrap gap-1.5">
              {SURGERY_OUTCOMES.map((o) => (
                <button key={o.id} onClick={() => { playTap(); setOutcome(o.id); }}
                  className={cn("rounded-full px-3.5 py-1.5 text-xs font-black transition", outcome === o.id ? OUTCOME_TONE[o.id] + " ring-1 ring-current" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* التفاصيل الجراحية العلمية — اختيارية */}
          <div className="overflow-hidden rounded-xl border border-line">
            <button onClick={() => { playTap(); setDetailsOpen((v) => !v); }} className="flex w-full items-center justify-between bg-surface-2 px-3.5 py-2.5 text-sm font-extrabold text-ink">
              <span className="inline-flex items-center gap-2"><Stethoscope size={15} className="text-brand-600" /> السجل الجراحي العلمي <span className="text-2xs font-bold text-ink-subtle">· اختياري</span></span>
              <ChevronDown size={15} className={cn("transition-transform", detailsOpen && "rotate-180")} />
            </button>
            {detailsOpen && (
              <div className="space-y-3.5 p-3.5">
                <div>
                  <label className="label">المدخل الجراحي (Approach)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {APPROACH_OPTIONS.map((a) => (
                      <button key={a} onClick={() => { playTap(); setApproach(approach === a ? null : a); }}
                        className={cn("rounded-full px-3 py-1.5 text-2xs font-bold transition", approach === a ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">أنماط الخياطة (Suture patterns) — اختر ما استُخدم</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SUTURE_PATTERNS.map((p) => (
                      <button key={p} onClick={() => { playTap(); togglePattern(p); }}
                        className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", patterns.includes(p) ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                        {patterns.includes(p) && <Check size={11} />} {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">مادة الخيط</label>
                    <select className="input" value={material ?? ""} onChange={(e) => setMaterial(e.target.value || null)}>
                      <option value="">—</option>
                      {SUTURE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">قياس الخيط (USP)</label>
                    <select className="input" value={size ?? ""} onChange={(e) => setSize(e.target.value || null)} disabled={!material}>
                      <option value="">—</option>
                      {SUTURE_SIZES.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">موعد المتابعة / شيل الخيوط <span className="text-2xs text-ink-subtle">· اختياري</span></label>
              <input type="date" dir="ltr" className="input tabular-nums" value={followup} onChange={(e) => setFollowup(e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="label">ملاحظات</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="نزف بسيط، مضاد حيوي بعد العملية…" />
            </div>
          </div>

          <Button size="lg" className="w-full" leftIcon={<Slice size={17} />} disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? "جارٍ الحفظ…" : "حفظ العملية في السجل"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------- القسم داخل سجل الحالة ------------------------- */
export function SurgerySection({ petId, visitId, lang, defaultSurgeon, readonly = false }: {
  petId: string; visitId?: string | null; lang: string; defaultSurgeon?: string; readonly?: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Surgery[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Surgery | null>(null);

  useEffect(() => {
    let alive = true;
    // داخل الطبلة: عمليات هذه الطبلة فقط — كل طبلة سجلها المستقل.
    // في ملف الحيوان (بدون visitId): التاريخ الجراحي الكامل.
    repo.listSurgeries(petId)
      .then((r) => { if (alive) setRows(visitId ? r.filter((x) => x.visit_id === visitId) : r); })
      .catch(() => {});
    return () => { alive = false; };
  }, [petId, visitId]);

  const doDelete = async (s: Surgery) => {
    try {
      await repo.deleteSurgery(s.id);
      setRows((rs) => rs.filter((x) => x.id !== s.id));
      toast.success("حُذفت العملية");
    } catch { toast.error("تعذّر الحذف"); }
    setConfirmDel(null);
  };

  if (readonly && rows.length === 0) return null;

  // Nothing recorded → one line, not a headed card with an empty box inside it.
  if (rows.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5">
          <Slice size={14} className="shrink-0 text-ink-subtle" />
          <span className="text-2xs font-bold text-ink-muted">العمليات الجراحية</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-ink-subtle">— ما في عمليات مسجّلة</span>
          {!readonly && (
            <button onClick={() => { playTap(); setOpen(true); }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-2xs font-extrabold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <Plus size={11} /> تسجيل عملية
            </button>
          )}
        </div>
        {!readonly && (
          <SurgeryModal open={open} petId={petId} visitId={visitId} defaultSurgeon={defaultSurgeon ?? ""} onClose={() => setOpen(false)} onSaved={(x) => setRows((rs) => [x, ...rs])} />
        )}
      </>
    );
  }

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><Slice size={16} className="text-rose-600" /> العمليات الجراحية</h2>
        {rows.length > 0 && <span className="chip bg-surface-2 text-2xs text-ink-muted">{rows.length}</span>}
        {!readonly && (
          <button onClick={() => { playTap(); setOpen(true); }} className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <Plus size={14} /> تسجيل عملية
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        !readonly && <p className="rounded-xl border border-dashed border-line bg-surface-1 px-3 py-3.5 text-center text-xs text-ink-muted">لا عمليات مسجلة بعد — «تسجيل عملية» يوثّق الجراحة بتفاصيلها العلمية في ملف الحيوان.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => <SurgeryCard key={s.id} s={s} lang={lang} onDelete={readonly ? undefined : (x) => setConfirmDel(x)} />)}
        </div>
      )}

      {!readonly && (
        <SurgeryModal open={open} petId={petId} visitId={visitId} defaultSurgeon={defaultSurgeon ?? ""} onClose={() => setOpen(false)} onSaved={(s) => setRows((rs) => [s, ...rs])} />
      )}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف العملية؟">
        <div className="space-y-4">
          <p className="text-sm text-ink">حذف «{confirmDel?.name}» من سجل الحيوان — لا يمكن التراجع.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDel(null)}>إلغاء</Button>
            <button onClick={() => confirmDel && void doDelete(confirmDel)} className="inline-flex items-center gap-1.5 rounded-full bg-danger-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-danger-700"><Trash2 size={13} /> نعم، احذف</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
