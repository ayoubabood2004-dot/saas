import { useMemo, useState } from "react";
import { Search, X, ChevronDown, Sparkles, Plus, Check, Pencil } from "lucide-react";
import {
  SYMPTOMS, SYMPTOM_CATEGORIES, COMMON_COMPLAINTS, symptomById, symptomLabel, categoryForSystem,
} from "@/lib/clinicalKnowledge";
import { Glyph } from "@/lib/clinicalIcons";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/** symptomId → { qualifierId: chosen option } */
export type QualifierMap = Record<string, Record<string, string>>;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * SymptomPicker — the low-effort, organised replacement for the flat 26-chip pile.
 *
 * Three fast lanes onto the SAME corpus, from fastest to most complete:
 *   • قوالب الشكوى — one card seeds the owner's chief complaint as SUGGESTIONS the
 *     vet confirms sign-by-sign (never auto-committed).
 *   • بحث — type any sign (or a descriptor like "دم"); free-type the long tail.
 *   • المجموعات — the full corpus as an 8-category accordion, collapsed by default
 *     except the one implied by the anatomy focus.
 * A selected sign can be DESCRIBED (وصف) in a second tap via its qualifier sub-chips.
 * Emits `value: string[]` (unchanged engine contract) + a parallel `qualifiers` map.
 */
export function SymptomPicker({
  value, onChange, qualifiers, onQualifiersChange,
  differentialCount, onShowDifferential, focusSystem,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  qualifiers: QualifierMap;
  onQualifiersChange: (q: QualifierMap) => void;
  differentialCount: number;
  onShowDifferential: () => void;
  focusSystem?: string;
}) {
  const preOpen = focusSystem ? categoryForSystem(focusSystem)?.id : undefined;
  const [openCat, setOpenCat] = useState<string | null>(preOpen ?? null);
  const [activeComplaint, setActiveComplaint] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [describeId, setDescribeId] = useState<string | null>(null);

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (id: string) => {
    playTap();
    if (selected.has(id)) {
      onChange(value.filter((x) => x !== id));
      // shed any qualifiers for a removed sign
      if (qualifiers[id]) { const { [id]: _drop, ...rest } = qualifiers; onQualifiersChange(rest); }
      if (describeId === id) setDescribeId(null);
    } else {
      onChange([...value, id]);
    }
  };
  const add = (id: string) => { if (!selected.has(id)) { playTap(); onChange([...value, id]); } };

  const setQualifier = (symptomId: string, qualifierId: string, option: string) => {
    playTap();
    const cur = qualifiers[symptomId] ?? {};
    const next = cur[qualifierId] === option
      ? (() => { const { [qualifierId]: _drop, ...rest } = cur; return rest; })()
      : { ...cur, [qualifierId]: option };
    const map = { ...qualifiers, [symptomId]: next };
    if (Object.keys(next).length === 0) delete map[symptomId];
    onQualifiersChange(map);
  };

  const qualSummary = (id: string): string => {
    const q = qualifiers[id]; const sym = symptomById(id);
    if (!q || !sym?.qualifiers) return "";
    return sym.qualifiers.map((ax) => q[ax.id]).filter(Boolean).join(" · ");
  };

  const q = norm(query);
  const matches = useMemo(() => {
    if (!q) return [];
    return SYMPTOMS.filter((s) => norm(s.label).includes(q) || s.qualifiers?.some((ax) => ax.options.some((o) => norm(o).includes(q))));
  }, [q]);
  const exactCustom = q && !matches.some((s) => norm(s.label) === q);

  const countIn = (ids: string[]) => ids.filter((id) => selected.has(id)).length;

  return (
    <div className="space-y-3">
      {/* ── Sticky selected tray ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 rounded-2xl border border-brand-200 bg-brand-50/80 p-2.5 backdrop-blur dark:border-brand-500/30 dark:bg-brand-500/10">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-2xs font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            الأعراض المختارة {value.length > 0 && `(${formatNum(value.length)})`}
          </span>
          {value.length > 0 && (
            <button type="button" onClick={() => { playTap(); onShowDifferential(); }} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-2xs font-bold text-white shadow-soft transition hover:bg-brand-700">
              <Sparkles size={12} /> التشخيص التفريقي ({formatNum(differentialCount)})
            </button>
          )}
        </div>
        {value.length === 0 ? (
          <p className="px-1 pb-1 text-2xs text-ink-subtle">لم تُختَر أعراض بعد — اضغط قالب الشكوى بالأسفل، أو ابحث، أو تصفّح المجموعات.</p>
        ) : (
          <div className="space-y-1.5">
            {value.map((id) => {
              const sym = symptomById(id);
              const summary = qualSummary(id);
              const canDescribe = !!sym?.qualifiers?.length;
              const describing = describeId === id;
              return (
                <div key={id} className="rounded-xl border border-brand-200/70 bg-surface-1 dark:border-brand-500/20">
                  <div className="flex items-center gap-1.5 p-1.5">
                    <Glyph name={id} size={24} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-xs font-bold text-ink">{symptomLabel(id)}</span>
                      {summary && <span className="block truncate text-2xs text-brand-600 dark:text-brand-300">{summary}</span>}
                    </span>
                    {canDescribe && (
                      <button
                        type="button"
                        onClick={() => { playTap(); setDescribeId(describing ? null : id); }}
                        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-bold transition", describing || summary ? "bg-brand-600 text-white" : "border border-dashed border-brand-300 text-brand-700 hover:bg-brand-50 dark:text-brand-300")}
                      >
                        <Pencil size={11} /> وصف
                      </button>
                    )}
                    <button type="button" onClick={() => toggle(id)} aria-label="إزالة" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                      <X size={14} />
                    </button>
                  </div>
                  {describing && canDescribe && (
                    <div className="space-y-2 border-t border-line/70 px-2 pb-2.5 pt-2">
                      {sym!.qualifiers!.map((ax) => (
                        <div key={ax.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-16 shrink-0 text-2xs font-bold text-ink-subtle">{ax.label}</span>
                          {ax.options.map((o) => {
                            const on = qualifiers[id]?.[ax.id] === o;
                            return (
                              <button
                                key={o} type="button"
                                onClick={() => setQualifier(id, ax.id, o)}
                                className={cn("rounded-lg px-2.5 py-1 text-2xs font-semibold transition", on ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10")}
                              >
                                {o}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Chief-complaint template cards ───────────────────────────────── */}
      <div>
        <div className="mb-1.5 text-2xs font-bold text-ink-subtle">قوالب الشكوى الرئيسية — لمسة تقترح الأعراض لتؤكّدها</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {COMMON_COMPLAINTS.map((c, i) => {
            const on = activeComplaint === i;
            const have = countIn(c.symptomIds);
            return (
              <button
                key={c.label} type="button"
                onClick={() => { playTap(); setActiveComplaint(on ? null : i); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-center transition",
                  on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300",
                )}
              >
                <Glyph name={c.system} size={32} />
                <span className="text-2xs font-bold leading-tight text-ink">{c.label}</span>
                {have > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{formatNum(have)} مختار</span>}
              </button>
            );
          })}
        </div>

        {/* Suggestion tray for the tapped complaint — confirm sign-by-sign */}
        {activeComplaint !== null && (
          <div className="mt-2 animate-fade-in rounded-2xl border border-brand-200 bg-surface-1 p-2.5 dark:border-brand-500/25">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-2xs font-bold text-ink-muted">اضغط لتأكيد الأعراض التي لاحظتها فعلاً</span>
              <button
                type="button"
                onClick={() => { playTap(); const ids = COMMON_COMPLAINTS[activeComplaint].symptomIds; onChange([...value, ...ids.filter((id) => !selected.has(id))]); }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-2.5 py-1 text-[10px] font-bold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300"
              >
                <Plus size={11} /> أضف الكل
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_COMPLAINTS[activeComplaint].symptomIds.map((id) => {
                const on = selected.has(id);
                return (
                  <button
                    key={id} type="button" onClick={() => toggle(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border py-1 pe-3 ps-1 text-xs font-semibold transition",
                      on ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-dashed border-brand-300 bg-brand-50/50 text-brand-700 hover:bg-brand-50 dark:bg-brand-500/5 dark:text-brand-300",
                    )}
                  >
                    <span className={cn("grid h-4 w-4 place-items-center rounded-full", on ? "bg-white/25" : "bg-brand-100 dark:bg-brand-500/20")}>{on ? <Check size={11} /> : <Plus size={11} />}</span>
                    {symptomLabel(id)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Search + free-type ───────────────────────────────────────────── */}
      <div>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-subtle" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن عرض… (مثال: قيء، دم، عرج)"
            className="input h-10 w-full pe-9 text-sm"
          />
        </div>
        {q && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matches.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  key={s.id} type="button" onClick={() => toggle(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border py-1 pe-3 ps-1 text-xs font-semibold transition",
                    on ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-brand-700",
                  )}
                >
                  <Glyph name={s.id} size={24} /> {s.label}
                </button>
              );
            })}
            {exactCustom && (
              <button
                type="button"
                onClick={() => { add(`custom:${query.trim()}`); setQuery(""); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-400 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
              >
                <Plus size={13} /> إضافة «{query.trim()}»
              </button>
            )}
            {!matches.length && !exactCustom && <span className="px-1 text-2xs text-ink-subtle">لا نتائج.</span>}
          </div>
        )}
      </div>

      {/* ── Category accordion (full corpus) ─────────────────────────────── */}
      {!q && (
        <div className="overflow-hidden rounded-2xl border border-line">
          {SYMPTOM_CATEGORIES.map((cat) => {
            const isOpen = openCat === cat.id;
            const chosen = countIn(cat.symptomIds);
            return (
              <div key={cat.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => { playTap(); setOpenCat(isOpen ? null : cat.id); }}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition", isOpen ? "bg-brand-50/60 dark:bg-brand-500/10" : "bg-surface-1 hover:bg-surface-2")}
                >
                  <Glyph name={cat.systemId} size={28} />
                  <span className="flex-1 text-sm font-bold text-ink">{cat.name}</span>
                  {chosen > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{formatNum(chosen)} مختار</span>}
                  <ChevronDown size={17} className={cn("shrink-0 text-ink-subtle transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 bg-surface-1 px-3 pb-3 pt-1">
                    {cat.symptomIds.map((id) => {
                      const on = selected.has(id);
                      return (
                        <button
                          key={id} type="button" onClick={() => toggle(id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border py-1 pe-3 ps-1 text-xs font-semibold transition",
                            on ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-brand-700",
                          )}
                        >
                          <Glyph name={id} size={24} /> {symptomLabel(id)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
