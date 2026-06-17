import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Credit-card-expiry-style input for a product's expiry date. The user types digits
 * only and they auto-format as MM/YY; the slash is inserted automatically after the
 * month and removed gracefully on backspace. The month is validated (01–12) with a
 * subtle inline error state. On a complete, valid MM/YY the focus auto-advances
 * (onComplete) so data entry stays fast.
 *
 * The DB column is a full `date`, so a complete MM/YY is stored as the LAST day of
 * that month (a product is good through the end of its expiry month). Editing an
 * existing record shows MM/YY; an untouched record keeps its exact stored day.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → "MM/YY" (empty string if not a parseable ISO date). */
function isoToMask(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[1].slice(2)}`;
}

/** Complete "MM/YY" → "YYYY-MM-DD" (last day of the month), else null. */
function maskToISO(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(text);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = 2000 + Number(m[2]);
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last of this
  return `${year}-${pad(month)}-${pad(lastDay)}`;
}

export function ExpiryInput({
  value,
  onChange,
  onComplete,
  placeholder = "MM/YY",
  invalidLabel,
  id,
}: {
  /** Stored value as an ISO date ("YYYY-MM-DD") or "". */
  value: string;
  /** Emits an ISO date when MM/YY is complete & valid, or "" while incomplete/empty. */
  onChange: (iso: string) => void;
  /** Called once a complete, valid MM/YY is entered — use it to focus the next field. */
  onComplete?: () => void;
  placeholder?: string;
  /** Small inline message shown when the month is invalid. */
  invalidLabel?: string;
  id?: string;
}) {
  // The masked text is the source of truth for what's shown; seed it from the ISO
  // value once (and re-seed only on genuine external changes — see below).
  const [text, setText] = useState(() => isoToMask(value));
  const [error, setError] = useState(false);
  // Last ISO we emitted, so we can tell our own updates apart from external resets.
  const lastEmitted = useRef<string | undefined>(undefined);
  // Previous masked text, to detect "the user just deleted the slash" on backspace.
  const prevText = useRef<string>(text);

  // Re-seed the mask when the value changes for a reason other than our own emission
  // (e.g. the modal opened on a different product). Because every keystroke emits and
  // records lastEmitted, an in-progress entry never matches an "external" change, so
  // mid-typing is never wiped.
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
    const raw = e.target.value;
    let digits = raw.replace(/\D/g, "");

    // Backspace that removed the auto-inserted slash should also drop the last digit,
    // so "12/" → "1" feels natural instead of immediately re-adding the slash.
    if (raw.length < prevText.current.length && prevText.current.endsWith("/") && !raw.endsWith("/")) {
      digits = digits.slice(0, -1);
    }

    digits = digits.slice(0, 4);
    let month = digits.slice(0, 2);
    let year = digits.slice(2, 4);
    let err = false;

    if (month.length === 1) {
      // 2–9 can only be a single-digit month → prefix 0 and let the slash follow.
      if (month >= "2") month = `0${month}`;
    }
    if (month.length === 2) {
      const mn = Number(month);
      if (mn === 0) {
        err = true; // "00" is not a month
      } else if (mn > 12) {
        // 13–19: reject the offending second digit, flag the error, drop any year.
        month = month[0];
        year = "";
        err = true;
      }
    }

    const next = month.length === 2 ? `${month}/${year}` : month;
    prevText.current = next;
    setText(next);
    setError(err);

    const iso = maskToISO(next);
    emit(iso ?? "");

    // Seamless flow: a complete, valid MM/YY hands off focus to the next field.
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
        maxLength={5}
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
