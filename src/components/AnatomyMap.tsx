import { useState } from "react";
import { Layers, X, Crosshair } from "lucide-react";
import { ANATOMY, regionById, type AnatomyRegion } from "@/lib/clinicalKnowledge";
import { systemById } from "@/lib/diagnoses";
import { playTap } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/** A pinned anatomical focus: a body region, optionally narrowed to one structure. */
export interface AnatomyFocus {
  regionId: string;
  region: string;          // Arabic region name
  system: string;          // body-system id
  structure?: string;      // Arabic structure name (optional)
  latin?: string;          // scientific name of the structure
}

/**
 * Interactive anatomical map — a scientific, clickable quadruped side-profile.
 * Tap a body region to reveal its structures (organs / bones) with their Latin
 * names, then pin the exact structure the case concerns. Built from ANATOMY in
 * clinicalKnowledge.ts, so every hotspot is data-driven.
 */
export function AnatomyMap({ value, onChange }: { value: AnatomyFocus | null; onChange: (f: AnatomyFocus | null) => void }) {
  const [openId, setOpenId] = useState<string | null>(value?.regionId ?? null);
  const open = openId ? regionById(openId) : undefined;
  const dots = ANATOMY.filter((r) => r.r > 0); // the "skin" region (r:0) is a whole-body chip, not a hotspot

  const pickRegion = (r: AnatomyRegion) => {
    playTap();
    setOpenId((cur) => (cur === r.id ? null : r.id));
  };
  const pickStructure = (r: AnatomyRegion, s: { name: string; latin: string }) => {
    playTap();
    onChange({ regionId: r.id, region: r.name, system: r.system, structure: s.name, latin: s.latin });
  };
  const pickWholeRegion = (r: AnatomyRegion) => {
    playTap();
    onChange({ regionId: r.id, region: r.name, system: r.system });
  };

  const isFocused = (id: string) => value?.regionId === id;

  return (
    <div className="space-y-3">
      {/* The map */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface-1 to-surface-2 p-2">
        <div className="pointer-events-none absolute inset-x-0 top-2 flex items-center justify-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-ink-subtle">
          <Layers size={12} /> الخريطة التشريحية — اضغط منطقة لعرض تركيبها
        </div>
        <svg viewBox="0 0 320 210" className="mx-auto block h-auto w-full max-w-md" role="img" aria-label="خريطة تشريحية">
          {/* ---- Silhouette (stylised quadruped, facing right) ---- */}
          <g className="text-brand-200 dark:text-brand-500/25" fill="currentColor">
            {/* hind + fore legs */}
            <rect x="64" y="120" width="16" height="74" rx="8" />
            <rect x="90" y="122" width="15" height="72" rx="7" />
            <rect x="168" y="122" width="16" height="72" rx="8" />
            <rect x="192" y="120" width="15" height="74" rx="7" />
            {/* torso */}
            <ellipse cx="132" cy="108" rx="82" ry="36" />
            {/* rump / pelvis */}
            <ellipse cx="70" cy="96" rx="30" ry="30" />
            {/* neck */}
            <path d="M196 78 Q224 62 250 66 L256 96 Q226 104 200 104 Z" />
            {/* head */}
            <ellipse cx="264" cy="76" rx="27" ry="23" />
            {/* muzzle */}
            <path d="M286 74 Q308 76 306 92 Q304 102 288 98 Q282 86 286 74 Z" />
            {/* ear */}
            <path d="M250 56 L244 30 L266 50 Z" />
            {/* tail */}
            <path d="M42 92 Q20 84 14 62 Q26 70 34 80 Q40 86 48 88 Z" />
          </g>
          {/* subtle body separation line (spine hint) */}
          <path d="M60 82 Q130 62 210 74" className="text-brand-300 dark:text-brand-500/40" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="3 4" strokeLinecap="round" />

          {/* ---- Hotspots ---- */}
          {dots.map((r) => {
            const active = openId === r.id;
            const focused = isFocused(r.id);
            return (
              <g key={r.id} onClick={() => pickRegion(r)} className="cursor-pointer" role="button" aria-label={r.name}>
                {/* halo */}
                {(active || focused) && (
                  <circle cx={r.cx} cy={r.cy} r={r.r + 5} className="text-brand-400/30" fill="currentColor">
                    <animate attributeName="r" values={`${r.r + 3};${r.r + 7};${r.r + 3}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={r.cx} cy={r.cy} r={r.r}
                  className={cn(
                    "transition-colors",
                    focused ? "fill-brand-600" : active ? "fill-brand-500/70" : "fill-brand-500/15 hover:fill-brand-500/35",
                    "stroke-brand-500",
                  )}
                  strokeWidth={focused ? 2 : 1.25}
                />
                <circle cx={r.cx} cy={r.cy} r={2.5} className={cn(focused ? "fill-white" : "fill-brand-600")} />
              </g>
            );
          })}
        </svg>

        {/* whole-body: skin/fur chip */}
        <div className="mt-1 flex justify-center">
          {(() => {
            const skin = ANATOMY.find((r) => r.r === 0);
            if (!skin) return null;
            const active = openId === skin.id;
            return (
              <button
                type="button"
                onClick={() => pickRegion(skin)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-2xs font-bold transition",
                  active || isFocused(skin.id) ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300",
                )}
              >
                🐾 {skin.name}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Structure drawer for the open region */}
      {open && (
        <div className="animate-fade-in rounded-2xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-brand-800 dark:text-brand-200">
              <Crosshair size={15} /> {open.name}
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-2xs font-bold text-brand-600 dark:bg-black/20 dark:text-brand-300">
                {systemById(open.system)?.emoji} {systemById(open.system)?.name}
              </span>
            </div>
            <button type="button" onClick={() => setOpenId(null)} aria-label="إغلاق" className="grid h-6 w-6 place-items-center rounded-full text-ink-subtle hover:bg-white/60 dark:hover:bg-black/20">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => pickWholeRegion(open)}
              className={cn(
                "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition",
                value?.regionId === open.id && !value?.structure
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-dashed border-brand-300 bg-white/60 text-brand-700 hover:bg-white dark:bg-black/20 dark:text-brand-300",
              )}
            >
              كامل {open.name}
            </button>
            {open.structures.map((s) => {
              const picked = value?.regionId === open.id && value?.structure === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => pickStructure(open, s)}
                  className={cn(
                    "group inline-flex flex-col items-start rounded-xl border px-2.5 py-1.5 text-start transition",
                    picked ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-white/70 hover:border-brand-300 dark:bg-black/20",
                  )}
                >
                  <span className="text-xs font-bold leading-tight">{s.name}</span>
                  <span className={cn("text-2xs italic leading-tight", picked ? "text-white/80" : "text-ink-subtle")}>{s.latin}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current pinned focus */}
      {value && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface-1 p-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Crosshair size={16} /></span>
            <div className="leading-tight">
              <div className="font-bold text-ink">{value.structure ?? value.region}</div>
              <div className="text-2xs text-ink-subtle">{value.latin ? <span className="italic">{value.latin}</span> : `منطقة ${value.region}`}</div>
            </div>
          </div>
          <button type="button" onClick={() => { playTap(); onChange(null); setOpenId(null); }} className="rounded-full px-2.5 py-1 text-2xs font-bold text-danger-600 hover:bg-danger-50">
            مسح
          </button>
        </div>
      )}
    </div>
  );
}
