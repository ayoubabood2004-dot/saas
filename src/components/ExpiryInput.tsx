import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Credit-card-style masked input for a product's expiry date, formatted as
 * DD/MM/YYYY. The user types digits only — slashes are inserted automatically
 * after the 2-digit day and after the 2-digit month, and removed gracefully on
 * backspace. Arabic-Indic numerals (٠١٢٣…) are converted to English digits on the
 * fly so the value never reaches the database in a non-parseable form. Once a full,
 * valid 10-character date is entered, focus auto-advances (onComplete).
 *
 * The DB column is a full `date`, so the exact day is preserved as an ISO string.
 */

/**
 * Convert Arabic-Indic (U+0660–0669) and Extended/Persian (U+06F0–06F9) numerals
 * to standard English digits. Anything else is left untouched.
 */
function toEnglishDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (empty string if not a parseable ISO date). */
function isoToMask(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Complete "DD/MM/YYYY" → "YYYY-MM-DD", or null if it isn't a real calendar date. */
function maskToISO(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  // Round-trip through Date to reject impossible dates (e.g. 31/02/2025, 00/…).
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ExpiryInput({
  value,
  onChange,
  onComplete,
  placeholder = "DD/MM/YYYY",
  invalidLabel,
  id,
}: {
  /** Stored value as an ISO date ("YYYY-MM-DD") or "". */
  value: string;
  /** Emits an ISO date when the date is complete & valid, or "" while incomplete. */
  onChange: (iso: string) => void;
  /** Called once a full, valid date is entered — use it to focus the next field. */
  onComplete?: () => void;
  placeholder?: string;
  /** Small inline message shown when the typed date is invalid. */
  invalidLabel?: string;
  id?: string;
}) {
  // The masked text is the source of truth for what's shown; seed it from the ISO
  // value once and re-seed only on genuine external changes (see the effect below).
  const [text, setText] = useState(() => isoToMask(value));
  const [error, setError] = useState(false);
  // Last ISO we emitted, to tell our own updates apart from external resets.
  const lastEmitted = useRef<string | undefined>(undefined);
  // Previous masked text, to detect "the user just deleted a slash" on backspace.
  const prevText = useRef<string>(text);

  // Re-seed the mask when `value` changes for a reason other than our own emission
  // (e.g. the modal opened on a different product). Every keystroke emits and records
  // lastEmitted, so an in-progress entry never looks "external" and is never wiped.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const seeded = isoToMask(value);
    setText(seeded);
    prevText.current = seeded;
    setError(false);
  }, [value]);

  const emit = (iso: string) => {
    lastEmitted.current = iso;
    onChange(iso);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 1) Normalise Arabic-Indic numerals to English immediately.
    const raw = toEnglishDigits(e.target.value);

    // 2) Reduce to digits. A backspace that removed an auto-inserted slash should also
    //    drop the digit before it, so "12/" → "1" feels natural (not re-slashed).
    let digits = raw.replace(/\D/g, "");
    if (raw.length < prevText.current.length && prevText.current.endsWith("/") && !raw.endsWith("/")) {
      digits = digits.slice(0, -1);
    }
    digits = digits.slice(0, 8); // DDMMYYYY

    // 3) Consume the digit stream into day → month → year, auto-prefixing a leading 0
    //    where a single digit can't be a tens digit, and rejecting out-of-range parts.
    let i = 0;
    let day = "";
    let month = "";
    let year = "";
    let err = false;

    if (i < digits.length) {
      const d0 = digits[i];
      if (d0 >= "4") {
        day = `0${d0}`; // 4–9 → 04–09, day complete
        i += 1;
      } else {
        day = d0;
        i += 1;
        if (i < digits.length) {
          const dn = Number(d0 + digits[i]);
          if (dn === 0 || dn > 31) err = true; // 00 / 32–39: reject 2nd digit
          else { day = d0 + digits[i]; i += 1; }
        }
      }
    }

    if (day.length === 2 && !err && i < digits.length) {
      const m0 = digits[i];
      if (m0 >= "2") {
        month = `0${m0}`; // 2–9 → 02–09, month complete
        i += 1;
      } else {
        month = m0;
        i += 1;
        if (i < digits.length) {
          const mn = Number(m0 + digits[i]);
          if (mn === 0 || mn > 12) err = true; // 00 / 13–19: reject 2nd digit
          else { month = m0 + digits[i]; i += 1; }
        }
      }
    }

    if (month.length === 2 && !err && i < digits.length) {
      year = digits.slice(i, i + 4);
    }

    // 4) Re-assemble with auto-slashes after a full day and a full month.
    let next = day;
    if (day.length === 2) next += `/${month}`;
    if (day.length === 2 && month.length === 2) next += `/${year}`;

    // 5) On a complete 10-char date, confirm it's a real calendar date.
    const iso = next.length === 10 ? maskToISO(next) : null;
    if (next.length === 10 && !iso) err = true;

    prevText.current = next;
    setText(next);
    setError(err);
    emit(iso ?? "");

    // 6) Seamless flow: a complete, valid date hands focus to the next field.
    if (iso) onComplete?.();
  };

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        maxLength={10}
        className={cn(
          "input font-mono tracking-wider",
          error && "border-danger-400 focus:border-danger-400 focus:ring-danger-500/20",
        )}
        value={text}
        placeholder={placeholder}
        aria-invalid={error}
        onChange={handleChange}
      />
      {error && invalidLabel && (
        <p className="mt-1 text-xs font-medium text-danger-600 dark:text-danger-400">{invalidLabel}</p>
      )}
    </>
  );
}
