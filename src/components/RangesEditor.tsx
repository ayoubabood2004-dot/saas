import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Check } from "lucide-react";
import type { Species } from "@/types";
import { Modal } from "./Modal";
import { VITAL_KEYS, CBC_KEYS, DEFAULT_RANGES, rangeForPet, type ReadingKey } from "@/lib/vitals";
import { setPetRange, clearPetRanges } from "@/lib/settings";
import { playSuccess, playTap } from "@/lib/sounds";

type Draft = Record<ReadingKey, { min: string; max: string }>;

function buildDraft(species: Species, petId: string): Draft {
  const out = {} as Draft;
  for (const k of [...VITAL_KEYS, ...CBC_KEYS]) {
    const r = rangeForPet(species, k, petId);
    out[k] = { min: String(r.min), max: String(r.max) };
  }
  return out;
}

/** Doctor-only editor for an individual animal's normal reading ranges (vitals + CBC). */
export function RangesEditor({ open, petId, species, petName, onClose }: { open: boolean; petId: string; species: Species; petName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => buildDraft(species, petId));
  const [saved, setSaved] = useState(false);

  const set = (k: ReadingKey, side: "min" | "max", v: string) =>
    setDraft((d) => ({ ...d, [k]: { ...d[k], [side]: v } }));

  const save = () => {
    for (const k of [...VITAL_KEYS, ...CBC_KEYS]) {
      const min = Number(draft[k].min);
      const max = Number(draft[k].max);
      if (!Number.isNaN(min) && !Number.isNaN(max) && max > min) setPetRange(petId, k, { min, max });
    }
    playSuccess();
    setSaved(true);
  };

  const reset = () => {
    clearPetRanges(petId);
    setDraft(buildDraft(species, petId));
    setSaved(false);
    playTap();
  };

  const Group = ({ title, keys }: { title: string; keys: ReadingKey[] }) => (
    <div className="mb-4">
      <p className="text-xs font-bold text-ink-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="w-32 shrink-0">
              <p className="text-sm font-medium text-ink leading-tight">{t(`reading.${k}`)}</p>
              <p className="text-[10px] text-ink-subtle">{DEFAULT_RANGES[species][k].unit}</p>
            </div>
            <input type="number" step="0.1" className="input py-1.5" value={draft[k].min} onChange={(e) => set(k, "min", e.target.value)} />
            <span className="text-ink-subtle">–</span>
            <input type="number" step="0.1" className="input py-1.5" value={draft[k].max} onChange={(e) => set(k, "max", e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("reading.individualTitle", { name: petName })}>
      <p className="text-sm text-ink-muted mb-4">{t("reading.individualHint", { species: t(`pet.species.${species}`) })}</p>
      <Group title={t("reading.vitals")} keys={VITAL_KEYS} />
      <Group title={t("reading.cbc")} keys={CBC_KEYS} />
      <div className="flex items-center gap-3 mt-2">
        <button className="btn-ghost text-sm" onClick={reset}><RotateCcw size={16} /> {t("reading.reset")}</button>
        <button className="btn-primary flex-1" onClick={save}>{t("common.save")}</button>
      </div>
      {saved && <p className="text-sm text-brand-700 font-medium mt-3 flex items-center gap-1.5"><Check size={16} /> {t("reading.saved")}</p>}
    </Modal>
  );
}
