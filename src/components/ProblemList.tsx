import { useEffect, useMemo, useState } from "react";
import { ListChecks, Plus, X, Check, RotateCcw, Infinity as InfinityIcon, ShieldAlert, Loader2 } from "lucide-react";
import type { PetProblem, ProblemCategory } from "@/types";
import { repo } from "@/lib/repo";
import {
  CATEGORY_LABEL, CATEGORY_TONE, SEVERITY_LABEL, COMMON_PROBLEMS, sortProblems, flagsFromProblems,
} from "@/lib/problems";
import { formatDate, cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { playTap, playSuccess } from "@/lib/sounds";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ProblemCategory[];

/**
 * ProblemList — the patient's master problem list (POMR).
 *
 * A diagnosis lives inside the visit it was made in; six months later nobody
 * finds it. A PROBLEM is opened once and stays open across every visit until
 * someone resolves it — and, more importantly, it is read back automatically
 * when a drug is prescribed (see flagsFromProblems → checkSafety), so an active
 * renal problem blocks an NSAID whether or not the doctor recalled the history.
 */
export function ProblemList({ petId, doctor, onFlagsChange }: {
  petId: string;
  doctor?: string;
  /** Fires whenever the ACTIVE set changes, so the prescribing guard stays current. */
  onFlagsChange?: (problems: PetProblem[]) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<PetProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProblemCategory>("other");
  const [chronic, setChronic] = useState(false);
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe" | "">("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const list = await repo.listProblems(petId);
      setItems(sortProblems(list));
      onFlagsChange?.(list);
    } catch {
      /* a clinic on a pre-0090 database simply has no problem list yet */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [petId]);

  const active = useMemo(() => items.filter((p) => p.status === "active"), [items]);
  const resolved = useMemo(() => items.filter((p) => p.status === "resolved"), [items]);
  const guardFlags = useMemo(() => flagsFromProblems(items), [items]);
  const guardsOn = [
    guardFlags.renal && "الكلى",
    guardFlags.hepatic && "الكبد",
    guardFlags.pregnant && "الحمل",
  ].filter(Boolean) as string[];

  const reset = () => { setTitle(""); setCategory("other"); setChronic(false); setSeverity(""); setAdding(false); };

  const add = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await repo.addProblem({
        pet_id: petId, title: t, category, status: "active", chronic,
        severity: severity || null, onset_date: null, notes: null,
        opened_by: doctor ?? null, resolved_at: null,
      });
      playSuccess();
      reset();
      await load();
    } catch (e) {
      toast.error("تعذّر إضافة المشكلة", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  const setStatus = async (p: PetProblem, status: "active" | "resolved") => {
    playTap();
    // Optimistic: the list is short and the guard reads from it immediately.
    setItems((prev) => sortProblems(prev.map((x) => (x.id === p.id ? { ...x, status } : x))));
    try {
      await repo.updateProblem(p.id, { status, resolved_at: status === "resolved" ? new Date().toISOString() : null });
      await load();
    } catch {
      setItems((prev) => sortProblems(prev.map((x) => (x.id === p.id ? p : x))));
      toast.error("تعذّر تحديث المشكلة");
    }
  };

  const remove = async (p: PetProblem) => {
    playTap();
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    try { await repo.deleteProblem(p.id); await load(); }
    catch { await load(); toast.error("تعذّر الحذف"); }
  };

  const Row = ({ p }: { p: PetProblem }) => {
    const done = p.status === "resolved";
    return (
      <div className={cn("flex items-center gap-2 rounded-xl border p-2.5", done ? "border-line bg-surface-2/50 opacity-70" : "border-line bg-surface-1")}>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", CATEGORY_TONE[p.category])}>{CATEGORY_LABEL[p.category]}</span>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-bold text-ink", done && "line-through")}>{p.title}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
            {p.chronic && <span className="inline-flex items-center gap-0.5 font-extrabold text-violet-600 dark:text-violet-300"><InfinityIcon size={11} /> مزمنة</span>}
            {p.severity && <span className="font-semibold">{SEVERITY_LABEL[p.severity]}</span>}
            <span>{formatDate(p.created_at, "ar")}</span>
            {p.opened_by && <span>· {p.opened_by}</span>}
          </div>
        </div>
        {done ? (
          <button type="button" onClick={() => void setStatus(p, "active")} title="إعادة فتح"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-3 hover:text-ink"><RotateCcw size={14} /></button>
        ) : (
          <button type="button" onClick={() => void setStatus(p, "resolved")} title="انحلّت"
            className="grid h-8 w-8 place-items-center rounded-full text-success-600 transition hover:bg-success-50 dark:hover:bg-success-500/15"><Check size={16} /></button>
        )}
        <button type="button" onClick={() => void remove(p)} title="حذف"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={14} /></button>
      </div>
    );
  };

  return (
    <section className="space-y-2.5 rounded-2xl border border-line bg-surface-1 p-3 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"><ListChecks size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-ink">قائمة المشاكل</h3>
          <p className="text-2xs text-ink-subtle">تبقى مفتوحة عبر كل الزيارات — مو داخل زيارة وحدة.</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => { playTap(); setAdding(true); }}
            className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-2xs font-extrabold text-white shadow-soft transition hover:bg-violet-700">
            <Plus size={13} /> مشكلة
          </button>
        )}
      </div>

      {/* What the prescribing guard will do because of this list */}
      {guardsOn.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2.5 text-2xs dark:border-brand-500/30 dark:bg-brand-500/10">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <span className="font-semibold text-ink-muted">
            <span className="font-extrabold text-brand-700 dark:text-brand-200">حارس الوصفة شغّال:</span>{" "}
            بسبب هالمشاكل، أي دواء يأذي {guardsOn.join(" أو ")} رح ينوقف وقت الوصف تلقائياً.
          </span>
        </div>
      )}

      {adding && (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 dark:border-violet-500/30 dark:bg-violet-500/5">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); if (e.key === "Escape") reset(); }}
            placeholder="اسم المشكلة…" className="input h-9 w-full text-sm" />

          <div className="flex flex-wrap gap-1">
            {COMMON_PROBLEMS.map((c) => (
              <button key={c.title} type="button"
                onClick={() => { playTap(); setTitle(c.title); setCategory(c.category); setChronic(c.chronic); }}
                className="rounded-full border border-line bg-surface-1 px-2 py-0.5 text-[10px] font-bold text-ink-muted transition hover:border-violet-300 hover:text-ink">
                {c.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => { playTap(); setCategory(c); }}
                className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold transition",
                  category === c ? CATEGORY_TONE[c] + " ring-2 ring-violet-400" : "bg-surface-2 text-ink-subtle hover:text-ink")}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-2xs font-bold text-ink">
              <input type="checkbox" checked={chronic} onChange={(e) => setChronic(e.target.checked)} className="h-4 w-4 accent-violet-600" />
              مزمنة
            </label>
            <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-1 p-0.5">
              {(["mild", "moderate", "severe"] as const).map((s) => (
                <button key={s} type="button" onClick={() => { playTap(); setSeverity(severity === s ? "" : s); }}
                  className={cn("rounded-full px-2 py-1 text-[10px] font-bold transition", severity === s ? "bg-violet-600 text-white" : "text-ink-muted hover:text-ink")}>
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="ms-auto flex items-center gap-1.5">
              <button type="button" onClick={reset} className="rounded-full px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:text-ink">إلغاء</button>
              <button type="button" onClick={() => void add()} disabled={!title.trim() || busy}
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-4 py-1.5 text-2xs font-extrabold text-white shadow-soft transition hover:bg-violet-700 disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-2xs text-ink-subtle"><Loader2 size={16} className="mx-auto animate-spin" /></div>
      ) : items.length === 0 ? (
        !adding && <p className="text-2xs text-ink-subtle">ما في مشاكل مسجّلة — افتح وحدة حتى تضل ظاهرة بكل زيارة.</p>
      ) : (
        <div className="space-y-1.5">
          {active.map((p) => <Row key={p.id} p={p} />)}
          {resolved.length > 0 && (
            <>
              <div className="pt-1 text-2xs font-extrabold text-ink-subtle">انحلّت ({resolved.length})</div>
              {resolved.map((p) => <Row key={p.id} p={p} />)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
