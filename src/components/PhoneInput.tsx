import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DIAL_CODES, parsePhone } from "@/lib/dialcodes";
import { getDialCode } from "@/lib/settings";

/**
 * Phone entry with a per-number country-code selector. Defaults to the clinic's
 * configured code, but can be changed per number (foreign clients). Emits a stored
 * string like "+1 5551234567"; pass "" for empty.
 */
export function PhoneInput({ value, onChange }: { value: string; onChange: (full: string) => void }) {
  const { t } = useTranslation();
  const fallback = getDialCode();
  // Initialise once from the incoming value; the component remounts when a modal reopens.
  const parsed = parsePhone(value, fallback);
  const [code, setCode] = useState(parsed.code);
  const [national, setNational] = useState(parsed.national);

  // Include the active code even if it's a custom one not in the list.
  const codes = DIAL_CODES.some((d) => d.code === code) ? DIAL_CODES : [{ code, name: code, flag: "🌐" }, ...DIAL_CODES];

  const emit = (c: string, n: string) => {
    const nat = n.replace(/\D/g, "");
    onChange(nat ? `${c} ${nat}` : "");
  };

  return (
    <div className="flex gap-2">
      <select
        className="input w-28 shrink-0 px-2"
        value={code}
        onChange={(e) => { setCode(e.target.value); emit(e.target.value, national); }}
        aria-label={t("phone.country")}
      >
        {codes.map((d) => (
          <option key={d.code} value={d.code}>{d.flag} {d.code}</option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        className="input flex-1"
        value={national}
        placeholder={t("phone.number")}
        onChange={(e) => { setNational(e.target.value); emit(code, e.target.value); }}
      />
    </div>
  );
}
