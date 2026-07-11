import { useMemo, useState } from "react";
import { Layers, X, Crosshair } from "lucide-react";
import { anatomyFor, SPECIES_ANATOMY, type AnatomyRegion } from "@/lib/clinicalKnowledge";
import { systemById } from "@/lib/diagnoses";
import { animalArt, ANIMAL_ART_DEFS } from "@/lib/anatomyArt";
import { Glyph } from "@/lib/clinicalIcons";
import type { Species } from "@/types";
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

type Coords = { cx: number; cy: number; r: number };

/**
 * Interactive anatomical map — a scientific, clickable, SPECIES-CORRECT figure.
 * The region set comes from anatomyFor(species): a bird shows a beak + wing and
 * no teeth; a cow shows the forestomach + udder + cloven hoof, etc. Regions that
 * place cleanly on the figure are hotspots; internal viscera (crop, gizzard,
 * cloaca, forestomach, udder, hindgut) render as labeled chips below the map.
 */
export function AnatomyMap({ value, onChange, species = "dog" }: { value: AnatomyFocus | null; onChange: (f: AnatomyFocus | null) => void; species?: Species }) {
  const [openId, setOpenId] = useState<string | null>(value?.regionId ?? null);
  const regions = useMemo(() => anatomyFor(species), [species]);
  const note = SPECIES_ANATOMY[species]?.note;
  const posture = POSTURE[species];

  // A region is a hotspot if it resolves to real coords (from POSTURE or its own
  // cx/cy/r with r>0); otherwise it's a chip below the map.
  const coordsFor = (r: AnatomyRegion): Coords | null => {
    const o = posture?.[r.id];
    const cx = o?.cx ?? r.cx;
    const cy = o?.cy ?? r.cy;
    const rad = o?.r ?? r.r;
    if (cx == null || cy == null || rad == null || rad <= 0) return null;
    return { cx, cy, r: rad };
  };
  const placed = regions.map((r) => ({ r, c: coordsFor(r) }));
  const dots = placed.filter((p): p is { r: AnatomyRegion; c: Coords } => p.c !== null);
  const chipRegions = placed.filter((p) => p.c === null).map((p) => p.r);
  const open = openId ? regions.find((r) => r.id === openId) : undefined;

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
        <svg viewBox="0 0 300 230" className="mx-auto block h-auto w-full max-w-md" role="img" aria-label="خريطة تشريحية">
          {/* ---- Shaded, dimensional species figure (side-profile, facing right) ---- */}
          <defs dangerouslySetInnerHTML={{ __html: ANIMAL_ART_DEFS }} />
          <g dangerouslySetInnerHTML={{ __html: animalArt(species) }} />

          {/* ---- Hotspots — subtle markers that highlight on hover/select ---- */}
          {dots.map(({ r, c }) => {
            const active = openId === r.id;
            const focused = isFocused(r.id);
            const emphasised = active || focused;
            return (
              <g key={r.id} onClick={() => pickRegion(r)} className="cursor-pointer" role="button" aria-label={r.name}>
                {/* halo */}
                {emphasised && (
                  <circle cx={c.cx} cy={c.cy} r={c.r + 5} className="text-brand-400/25" fill="currentColor">
                    <animate attributeName="r" values={`${c.r + 3};${c.r + 7};${c.r + 3}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={c.cx} cy={c.cy} r={c.r}
                  className={cn(
                    "transition-all",
                    focused
                      ? "fill-brand-600/85 stroke-brand-600"
                      : active
                        ? "fill-brand-500/45 stroke-brand-500"
                        : "fill-brand-500/5 stroke-brand-500/25 hover:fill-brand-500/20 hover:stroke-brand-500/60",
                  )}
                  strokeWidth={emphasised ? 2 : 1}
                />
                <circle cx={c.cx} cy={c.cy} r={emphasised ? 3 : 2} className={cn("transition-all", focused ? "fill-white" : emphasised ? "fill-brand-600" : "fill-brand-500/60")} />
              </g>
            );
          })}
        </svg>

        {/* Coordless regions (skin + internal viscera) as chips below the figure */}
        {chipRegions.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-1.5 px-1">
            {chipRegions.map((r) => {
              const active = openId === r.id || isFocused(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRegion(r)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-bold transition",
                    active ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300",
                  )}
                >
                  <Glyph name={r.system} size={15} className={active ? "opacity-90" : ""} /> {r.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Species clinical caption */}
        {note && <p className="mt-2 px-2 text-center text-2xs leading-relaxed text-ink-subtle">{note}</p>}
      </div>

      {/* Structure drawer for the open region */}
      {open && (
        <div className="animate-fade-in rounded-2xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-brand-800 dark:text-brand-200">
              <Crosshair size={15} /> {open.name}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 py-0.5 pe-2 ps-0.5 text-2xs font-bold text-brand-600 dark:bg-black/20 dark:text-brand-300">
                <Glyph name={open.system} size={16} /> {systemById(open.system)?.name}
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

/* Per-species hotspot coords. Overrides the shared template where a species holds
 * a different posture (horse head high, rabbit compact) and places SPECIES-ADDED
 * hotspots (bird beak/wing, horse hoof, cow cloven hoof). Regions with no entry
 * fall back to their CORE_REGIONS coords; coordless regions become chips. */
type Pt = { cx: number; cy: number; r?: number };
const POSTURE: Partial<Record<Species, Record<string, Pt>>> = {
  horse: {
    head: { cx: 222, cy: 58, r: 19 }, oral: { cx: 232, cy: 66, r: 11 }, neck: { cx: 198, cy: 90, r: 15 },
    spine: { cx: 140, cy: 100, r: 15 }, thorax: { cx: 160, cy: 112, r: 21 }, abdomen: { cx: 114, cy: 116, r: 22 },
    pelvis: { cx: 84, cy: 110, r: 15 }, foreleg: { cx: 190, cy: 172, r: 18 }, hindleg: { cx: 110, cy: 172, r: 18 },
    hoof: { cx: 190, cy: 206, r: 11 },
  },
  rabbit: {
    head: { cx: 206, cy: 118, r: 18 }, oral: { cx: 230, cy: 120, r: 11 }, neck: { cx: 184, cy: 122, r: 13 },
    spine: { cx: 150, cy: 102, r: 15 }, thorax: { cx: 156, cy: 130, r: 20 }, abdomen: { cx: 124, cy: 142, r: 20 },
    pelvis: { cx: 100, cy: 150, r: 15 }, foreleg: { cx: 178, cy: 168, r: 14 }, hindleg: { cx: 112, cy: 174, r: 16 },
  },
  bird: {
    head: { cx: 196, cy: 102, r: 16 }, neck: { cx: 176, cy: 116, r: 12 }, beak: { cx: 216, cy: 112, r: 9 },
    wing: { cx: 150, cy: 120, r: 15 }, spine: { cx: 132, cy: 106, r: 12 }, thorax: { cx: 156, cy: 132, r: 15 },
    abdomen: { cx: 120, cy: 140, r: 14 }, pelvis: { cx: 106, cy: 138, r: 12 }, hindleg: { cx: 140, cy: 174, r: 13 },
  },
  cow: {
    cloven_hoof: { cx: 176, cy: 206, r: 11 },
  },
};
