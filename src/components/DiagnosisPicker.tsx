import { useMemo, useState } from "react";
import { Search, X, Plus, Check } from "lucide-react";
import { BODY_SYSTEMS, SEVERITIES, systemById, type Diagnosis, type Severity } from "@/lib/diagnoses";
import { Glyph } from "@/lib/clinicalIcons";
import { playTap } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/**
 * Structured diagnosis picker: choose a body SYSTEM → see the conditions that
 * belong to it → add one or MORE → grade each by severity. Free-typed
 * conditions are allowed too (nothing is ever blocked). Emits the full list up
 * so the caller can store/summarise it.
 */
export function DiagnosisPicker({ value, onChange }: { value: Diagnosis[]; onChange: (next: Diagnosis[]) => void }) {
  const [sys, setSys] = useState<string>(BODY_SYSTEMS[0].id);
  const [q, setQ] = useState("");

  const system = systemById(sys)!;
  const selectedKeys = useMemo(() => new Set(value.map((d) => `${d.system}::${d.disease}`)), [value]);

  const ql = q.trim().toLowerCase();
  const options = useMemo(
    () => system.diseases.filter((d) => !ql || d.toLowerCase().includes(ql)),
    [system, ql],
  );

  const add = (disease: string) => {
    const key = `${sys}::${disease}`;
    if (selectedKeys.has(key)) return;
    playTap();
    onChange([...value, { system: sys, disease, severity: "moderate" }]);
  };
  const addTyped = () => {
    const name = q.trim();
    if (!name) return;
    add(name);
    setQ("");
  };
  const remove = (d: Diagnosis) => { playTap(); onChange(value.filter((x) => !(x.system === d.system && x.disease === d.disease))); };
  const setSeverity = (d: Diagnosis, sev: Severity) =>
    onChange(value.map((x) => (x.system === d.system && x.disease === d.disease ? { ...x, severity: sev } : x)));

  return (
    <div className="space-y-3">
      {/* Selected diagnoses — each with a severity switch */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((d) => {
            return (
              <div key={`${d.system}::${d.disease}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 p-2.5">
                <Glyph name={d.system} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{d.disease}</span>
                <div className="inline-flex items-center rounded-full border border-line bg-surface-2 p-0.5">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { playTap(); setSeverity(d, s.id); }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-bold transition",
                        d.severity === s.id ? s.chip : "text-ink-subtle hover:text-ink",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", d.severity === s.id ? s.dot : "bg-ink-subtle/40")} />
                      {s.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => remove(d)} aria-label="إزالة" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* System selector */}
      <div className="flex flex-wrap gap-1.5">
        {BODY_SYSTEMS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { playTap(); setSys(s.id); setQ(""); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full py-1 pe-3 ps-1 text-xs font-bold transition",
              sys === s.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink",
            )}
          >
            <Glyph name={s.id} size={22} /> {s.name}
          </button>
        ))}
      </div>

      {/* Search within the system + free-type */}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }}
          placeholder={`ابحث في ${system.name} أو اكتب تشخيصاً…`}
          className="input ltr:pl-9 rtl:pr-9"
        />
      </div>

      {/* Disease options for the chosen system */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((d) => {
          const picked = selectedKeys.has(`${sys}::${d}`);
          return (
            <button
              key={d}
              type="button"
              onClick={() => add(d)}
              disabled={picked}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                picked
                  ? "cursor-default border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300"
                  : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-brand-700 dark:hover:bg-brand-500/10",
              )}
            >
              {picked ? <Check size={13} /> : <Plus size={13} />} {d}
            </button>
          );
        })}
        {ql && !options.some((d) => d.toLowerCase() === ql) && (
          <button
            type="button"
            onClick={addTyped}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
          >
            <Plus size={13} /> إضافة «{q.trim()}»
          </button>
        )}
      </div>
    </div>
  );
}
