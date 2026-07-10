import { X } from "lucide-react";
import { CBC, cbcRange, cbcFlag, FLAG_LABEL, type CbcParam, type CbcFlag } from "@/lib/cbc";
import type { Species } from "@/types";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

const FLAG_CHIP: Record<CbcFlag, string> = {
  low: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  normal: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  high: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
};
const pct = (v: number, p: CbcParam) => ((v - p.min) / (p.max - p.min)) * 100;

/**
 * CBC entry by SLIDER — the vet drags each parameter's pointer left/right; the
 * green zone on the track is the species-normal band, so a value out of range
 * shows an instant low/high flag. A parameter counts only once its slider is
 * touched (or its value set), keeping untouched rows out of the record.
 */
export function CbcPanel({
  species, value, onChange,
}: { species?: Species; value: Record<string, number>; onChange: (next: Record<string, number>) => void }) {
  const setVal = (id: string, v: number) => onChange({ ...value, [id]: v });
  const clear = (id: string) => { playTap(); const next = { ...value }; delete next[id]; onChange(next); };

  return (
    <div className="space-y-2.5">
      {CBC.map((p) => {
        const [lo, hi] = cbcRange(p, species);
        const recorded = value[p.id] !== undefined;
        const v = recorded ? value[p.id] : (lo + hi) / 2; // preview at band-middle until touched
        const flag = cbcFlag(v, [lo, hi]);
        const bandL = pct(lo, p), bandR = pct(hi, p);
        return (
          <div key={p.id} className={cn("rounded-2xl border p-3 transition", recorded ? "border-brand-200 bg-surface-1 dark:border-brand-500/30" : "border-line bg-surface-1")}>
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-6 min-w-[2.5rem] place-items-center rounded-lg bg-brand-50 px-1.5 text-2xs font-extrabold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{p.abbr}</span>
              <span className="flex-1 truncate text-xs font-bold text-ink">{p.label}</span>
              {recorded ? (
                <>
                  <span className="text-sm font-extrabold tabular-nums text-ink">{formatNum(Number(v.toFixed(p.step < 1 ? 1 : 0)))}</span>
                  <span className="text-2xs text-ink-subtle">{p.unit}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold", FLAG_CHIP[flag])}>{FLAG_LABEL[flag]}</span>
                  <button type="button" onClick={() => clear(p.id)} aria-label="مسح" className="grid h-6 w-6 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                    <X size={13} />
                  </button>
                </>
              ) : (
                <span className="text-2xs font-semibold text-ink-subtle">اسحب للتسجيل</span>
              )}
            </div>

            {/* Slider track pinned LTR (low→high, left→right — the lab convention) so
                the painted band, fill and native thumb all share one coordinate space,
                regardless of the page's RTL direction. */}
            <div dir="ltr">
              <div className="relative flex h-[22px] items-center">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2" />
                <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-success-400/45" style={{ left: `${bandL}%`, width: `${Math.max(0, bandR - bandL)}%` }} />
                {recorded && (
                  <div className={cn("pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full", flag === "high" ? "bg-danger-400/60" : flag === "low" ? "bg-brand-400/60" : "bg-success-500/50")} style={{ left: 0, width: `${pct(v, p)}%` }} />
                )}
                <input
                  type="range" min={p.min} max={p.max} step={p.step} value={v}
                  onChange={(e) => setVal(p.id, Number(e.target.value))}
                  className={cn("cbc-range relative", !recorded && "opacity-70")}
                  aria-label={`${p.label} (${p.abbr})`}
                />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-ink-subtle">
                <span>{formatNum(p.min)}</span>
                <span className="text-success-600 dark:text-success-400">{formatNum(lo)}–{formatNum(hi)} طبيعي</span>
                <span>{formatNum(p.max)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
