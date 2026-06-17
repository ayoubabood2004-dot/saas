import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Map as MapIcon } from "lucide-react";
import { Combobox } from "@/components/Combobox";
import { addArea, addGovernorate, getAreas, getGovernorates } from "@/lib/locations";

/**
 * Two connected smart comboboxes for the local (Iraqi) address model:
 * Governorate (المحافظة) → Area (المنطقة). The Area field stays disabled until a
 * Governorate is chosen, and its suggestions depend on that choice. Both fields are
 * creatable, and anything the doctor creates is *remembered* per-clinic — so the
 * next time the same governorate is picked, their new area shows up as a suggestion
 * (see lib/locations). A local `version` counter bumps on every create so the
 * memoised option lists re-derive immediately, without a page reload.
 */
export function GovernorateAreaPicker({
  governorate,
  area,
  onChange,
}: {
  governorate: string;
  area: string;
  /** Emits the next (governorate, area) pair. Area is cleared when the governorate changes. */
  onChange: (governorate: string, area: string) => void;
}) {
  const { t } = useTranslation();
  // Bumped whenever a new governorate/area is persisted, to refresh the suggestions.
  const [version, setVersion] = useState(0);

  const governorates = useMemo(() => getGovernorates(), [version]);
  const areas = useMemo(
    () => (governorate.trim() ? getAreas(governorate) : []),
    [governorate, version],
  );

  const hasGovernorate = governorate.trim().length > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* المحافظة — Governorate */}
      <div>
        <label className="label">{t("newCase.governorate")}</label>
        <Combobox
          value={governorate}
          icon={<MapIcon size={16} />}
          placeholder={t("newCase.governoratePlaceholder")}
          options={governorates}
          createLabel={(q) => t("newCase.createGovernorate", { value: q })}
          // Typing changes the governorate; whenever it actually changes we reset
          // the dependent area so a stale area can't linger under a new governorate.
          onChange={(v) => onChange(v, v.trim() === governorate.trim() ? area : "")}
          // Remember a freshly created governorate so it persists as a suggestion.
          onCommit={(v) => { addGovernorate(v); setVersion((n) => n + 1); }}
        />
      </div>

      {/* المنطقة — Area (depends on governorate) */}
      <div>
        <label className="label">{t("newCase.area")}</label>
        <Combobox
          value={area}
          disabled={!hasGovernorate}
          icon={<MapPin size={16} />}
          placeholder={hasGovernorate ? t("newCase.areaPlaceholder") : t("newCase.selectGovernorateFirst")}
          options={areas}
          createLabel={(q) => t("newCase.createArea", { value: q })}
          onChange={(v) => onChange(governorate, v)}
          // Persist the new area under the current governorate → remembered next time.
          onCommit={(v) => { addArea(governorate, v); setVersion((n) => n + 1); }}
        />
      </div>
    </div>
  );
}
