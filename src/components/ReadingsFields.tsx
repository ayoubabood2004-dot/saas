import { useTranslation } from "react-i18next";
import type { Species } from "@/types";
import { VITAL_KEYS, CBC_KEYS, rangeForPet, isOutOfRangePet, type ReadingKey } from "@/lib/vitals";
import { playWarning } from "@/lib/sounds";

/**
 * Reusable medical-readings entry (vital signs + CBC) with out-of-range flagging
 * against the animal's effective ranges (per-pet override > species > default).
 */
export function ReadingsFields({
  species,
  petId,
  values,
  onChange,
}: {
  species: Species;
  petId?: string;
  values: Partial<Record<ReadingKey, string>>;
  onChange: (k: ReadingKey, v: string) => void;
}) {
  const { t } = useTranslation();

  const set = (k: ReadingKey, v: string) => {
    onChange(k, v);
    const num = Number(v);
    if (v !== "" && !Number.isNaN(num) && isOutOfRangePet(species, k, num, petId)) playWarning();
  };

  const Field = ({ k }: { k: ReadingKey }) => {
    const range = rangeForPet(species, k, petId);
    const val = values[k] ?? "";
    const bad = val !== "" && !Number.isNaN(Number(val)) && isOutOfRangePet(species, k, Number(val), petId);
    return (
      <div>
        <label className="text-xs text-ink-muted flex justify-between gap-1">
          <span className="truncate">{t(`reading.${k}`)}</span>
          <span className="text-ink-subtle shrink-0">{range.unit}</span>
        </label>
        <input
          type="number"
          step="0.1"
          value={val}
          onChange={(e) => set(k, e.target.value)}
          className={`input py-2 ${bad ? "border-red-400 bg-red-50 text-red-700 ring-2 ring-red-100" : ""}`}
        />
        <p className={`text-[10px] mt-0.5 ${bad ? "text-red-500 font-semibold" : "text-ink-subtle"}`}>
          {bad ? t("consult.outOfRange") : t("consult.normalRange", { min: range.min, max: range.max, unit: range.unit })}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">{t("reading.vitals")}</p>
        <div className="grid grid-cols-2 gap-2">
          {VITAL_KEYS.map((k) => <Field key={k} k={k} />)}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">{t("reading.cbc")}</p>
        <div className="grid grid-cols-2 gap-2">
          {CBC_KEYS.map((k) => <Field key={k} k={k} />)}
        </div>
      </div>
    </div>
  );
}
