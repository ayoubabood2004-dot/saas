import { useMemo, useState } from "react";
import { Layers, X, Crosshair } from "lucide-react";
import { anatomyFor, SPECIES_ANATOMY, type AnatomyRegion } from "@/lib/clinicalKnowledge";
import { systemById } from "@/lib/diagnoses";
import { figureFor } from "@/lib/anatomyFigure";
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

/**
 * Interactive anatomical map — a colourful, cartoon-yet-natural, SPECIES-CORRECT
 * figure whose body is divided into CLICKABLE anatomical zones by sharp dividing
 * lines (no dots). The region set comes from anatomyFor(species). A body zone that
 * exists on the figure is clickable in place; regions with no figure zone (skin +
 * internal viscera: crop, gizzard, cloaca, forestomach, udder, hindgut) render as
 * labeled chips below the map.
 */
export function AnatomyMap({ value, onChange, species = "dog" }: { value: AnatomyFocus | null; onChange: (f: AnatomyFocus | null) => void; species?: Species }) {
  const [openId, setOpenId] = useState<string | null>(value?.regionId ?? null);
  const regions = useMemo(() => anatomyFor(species), [species]);
  const note = SPECIES_ANATOMY[species]?.note;
  const fig = useMemo(() => figureFor(species), [species]);

  // Anatomy regions keyed by id, and which figure zones are clickable (= exist in
  // this species' anatomy). Figure zones with no matching region stay static body.
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const figIds = useMemo(() => new Set(fig.regions.map((z) => z.id)), [fig]);
  const chipRegions = regions.filter((r) => !figIds.has(r.id));
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
          {/* Ground shadow */}
          <ellipse cx="150" cy="214" rx="110" ry="8" fill="#1e293b" opacity="0.10" />

          {/* ---- Body zones, in the species' real colour, split by sharp lines ---- */}
          {fig.regions.map((z) => (
            <path key={`b-${z.id}`} d={z.d} fill={fig.palette.base} stroke={fig.palette.edge}
              strokeWidth={2.2} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
          ))}

          {/* ---- Clickable highlight overlay per anatomical zone ---- */}
          {fig.regions.filter((z) => regionById.has(z.id)).map((z) => {
            const r = regionById.get(z.id)!;
            const active = openId === r.id;
            const focused = isFocused(r.id);
            const emphasised = active || focused;
            return (
              <path
                key={`h-${z.id}`} d={z.d} role="button" aria-label={r.name}
                onClick={() => pickRegion(r)}
                fill="currentColor" stroke={emphasised ? "currentColor" : "none"} strokeWidth={emphasised ? 2.6 : 0}
                strokeLinejoin="round"
                className={cn(
                  "cursor-pointer transition-opacity",
                  focused ? "text-brand-600 opacity-90" : active ? "text-brand-500 opacity-55" : "text-brand-500 opacity-0 hover:opacity-25",
                )}
              />
            );
          })}

          {/* ---- Ears / eyes / nose / markings (non-interactive) ---- */}
          <g style={{ pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: fig.details }} />
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

