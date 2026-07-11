/* ============================================================================
 * Universal digit normalisation — Western numerals (0-9) everywhere, always.
 *
 * Two layers:
 *   1. normalizeDigits(): pure converter — Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and
 *      Extended/Persian (۰۱۲۳۴۵۶۷۸۹) digits → ASCII, plus the Arabic decimal
 *      (٫) and thousands (٬) separators. Used by parsers (phone search, etc.)
 *      so LEGACY data typed with Eastern digits is still understood.
 *   2. installDigitNormalizer(): one global capture-phase listener that
 *      converts Eastern digits AS THEY ARE TYPED OR PASTED into any input or
 *      textarea — current and future ones alike. React-safe: it writes through
 *      the native value setter and dispatches a real `input` event, so
 *      controlled components update exactly as if the user typed 0-9.
 * ==========================================================================*/

const EASTERN = /[٠-٩۰-۹٫٬]/;

/** Convert any Eastern-Arabic/Persian digits (and Arabic separators) to ASCII. */
export function normalizeDigits(s: string): string {
  if (!s || !EASTERN.test(s)) return s;
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0x0660 && c <= 0x0669) out += String.fromCharCode(c - 0x0660 + 48); // ٠-٩
    else if (c >= 0x06f0 && c <= 0x06f9) out += String.fromCharCode(c - 0x06f0 + 48); // ۰-۹
    else if (c === 0x066b) out += "."; // ٫ Arabic decimal separator
    else if (c === 0x066c) out += ","; // ٬ Arabic thousands separator
    else out += ch;
  }
  return out;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

function isEditableField(el: unknown): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/** Write a value through the NATIVE setter then emit `input`, so React's
 *  controlled-component machinery sees it as genuine user input. */
function setNativeValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Intercept typing/pasting of Eastern digits in EVERY input/textarea and insert
 *  the Western equivalent instead — smooth, lossless, app-wide. Idempotent. */
let installed = false;
export function installDigitNormalizer() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  document.addEventListener(
    "beforeinput",
    (e: InputEvent) => {
      const el = e.target;
      if (!isEditableField(el) || el.readOnly || el.disabled) return;
      const data = e.data ?? e.dataTransfer?.getData("text") ?? "";
      if (!data || !EASTERN.test(data)) return;

      e.preventDefault();
      const norm = normalizeDigits(data);

      // Replace the current selection with the normalised text. Some input types
      // (number/email) legitimately refuse selection APIs — append there instead
      // (the caret is at the end while typing, which is the only case that occurs).
      let start: number | null = null;
      let end: number | null = null;
      try { start = el.selectionStart; end = el.selectionEnd; } catch { /* type=number etc. */ }

      if (start != null && end != null) {
        const v = el.value;
        setNativeValue(el, v.slice(0, start) + norm + v.slice(end));
        try { el.setSelectionRange(start + norm.length, start + norm.length); } catch { /* ignore */ }
      } else {
        setNativeValue(el, el.value + norm);
      }
    },
    true,
  );
}
