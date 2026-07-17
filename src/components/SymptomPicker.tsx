import { useMemo, useState } from "react";
import { Search, X, Sparkles, Plus, Check, Pencil } from "lucide-react";
import {
  SYMPTOMS, SYMPTOM_CATEGORIES, symptomById, symptomLabel, categoryForSystem,
} from "@/lib/clinicalKnowledge";
import { Glyph } from "@/lib/clinicalIcons";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/** symptomId → { qualifierId: chosen option } */
export type QualifierMap = Record<string, Record<string, string>>;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * SymptomPicker — ONE simple flow (no more parallel template row + chip accordion):
 *   1. Big body-system boxes (المربعات الكبيرة). Every sign lives under exactly one.
 *   2. Tap a box → its signs open right below as LARGE, clearly-labelled buttons —
 *      one tap selects, one tap removes. Big text, big targets, fast to scan.
 *   3. Search finds any sign across every system (and free-types the long tail).
 * A selected sign can be DESCRIBED (وصف) via its qualifier sub-chips in the tray.
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
  const [query, setQuery] = useState("");
  const [describeId, setDescribeId] = useState<string | null>(null);

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (id: string) => {
    playTap();
    if (selected.has(id)) {
      onChange(value.filter((x) => x !== id));
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
  const openCategory = openCat ? SYMPTOM_CATEGORIES.find((c) => c.id === openCat) : undefined;

  // One big, clear, tappable symptom button (used in the open system + search).
  const SignButton = ({ id }: { id: string }) => {
    const on = selected.has(id);
    return (
      <button
        type="button" onClick={() => toggle(id)}
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-start transition active:scale-[0.98]",
          on ? "border-brand-500 bg-brand-600 text-white shadow-soft"
             : "border-line bg-surface-1 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
        )}
      >
        <Glyph name={id} size={30} />
        <span className="flex-1 text-[15px] font-bold leading-snug">{symptomLabel(id)}</span>
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", on ? "bg-white/25" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300")}>
          {on ? <Check size={15} /> : <Plus size={15} />}
        </span>
      </button>
    );
  };

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
          <p className="px-1 pb-1 text-2xs text-ink-subtle">لم تُختَر أعراض بعد — اضغط الجهاز المناسب بالأسفل ثم اختر العرض، أو ابحث بالاسم.</p>
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
                      <span className="block truncate text-sm font-bold text-ink">{symptomLabel(id)}</span>
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
                                className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition", on ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10")}
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

      {/* ── Search (finds any sign across every system) ──────────────────── */}
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-subtle" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن أي عرض… (مثال: قيء، دم، عرج)"
          className="input h-11 w-full pe-9 text-sm"
        />
      </div>
      {q && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((s) => <SignButton key={s.id} id={s.id} />)}
          {exactCustom && (
            <button
              type="button"
              onClick={() => { add(`custom:${query.trim()}`); setQuery(""); }}
              className="flex items-center gap-2.5 rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50 px-3.5 py-3 text-start text-[15px] font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
            >
              <Plus size={20} /> إضافة «{query.trim()}»
            </button>
          )}
          {!matches.length && !exactCustom && <span className="px-1 text-sm text-ink-subtle">لا نتائج مطابقة.</span>}
        </div>
      )}

      {/* ── Big body-system boxes → tap to open the signs underneath ─────── */}
      {!q && (
        <>
          <div className="text-2xs font-bold text-ink-subtle">اختر الجهاز ثم اضغط العرض — كل الأعراض بمكان واحد</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {SYMPTOM_CATEGORIES.map((cat) => {
              const isOpen = openCat === cat.id;
              const chosen = countIn(cat.symptomIds);
              return (
                <button
                  key={cat.id} type="button"
                  onClick={() => { playTap(); setOpenCat(isOpen ? null : cat.id); }}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition active:scale-[0.98]",
                    isOpen ? "border-brand-500 bg-brand-50 shadow-soft dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300",
                  )}
                >
                  <Glyph name={cat.systemId} size={40} />
                  <span className="text-[15px] font-bold leading-tight text-ink">{cat.name}</span>
                  {chosen > 0 && (
                    <span className="absolute end-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{formatNum(chosen)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* The tapped system's signs — large, clear buttons */}
          {openCategory && (
            <div className="animate-fade-in rounded-2xl border-2 border-brand-200 bg-surface-1 p-3 dark:border-brand-500/25">
              <div className="mb-2.5 flex items-center gap-2">
                <Glyph name={openCategory.systemId} size={26} />
                <span className="flex-1 text-sm font-extrabold text-ink">{openCategory.name}</span>
                <button type="button" onClick={() => { playTap(); setOpenCat(null); }} aria-label="إغلاق" className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {openCategory.symptomIds.map((id) => <SignButton key={id} id={id} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
