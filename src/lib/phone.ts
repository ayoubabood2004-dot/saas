// Phone helpers for format-agnostic search.
// Doctors type digits only — no spaces, and the international dialing code is optional
// (defaults to the clinic's configured code, see settings.getDialCode).

export function phoneDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/** National significant number: stored digits with the dial code and leading zeros stripped. */
export function nationalNumber(phone: string, dialCode: string): string {
  let d = phoneDigits(phone);
  const cc = phoneDigits(dialCode);
  if (cc && d.startsWith(cc)) d = d.slice(cc.length);
  return d.replace(/^0+/, "");
}

/**
 * Country-code- and format-agnostic phone match.
 * Matches whether the query includes spaces, the dial code, or a leading zero — or none of them.
 */
export function phoneMatches(stored: string, query: string, dialCode: string): boolean {
  const qd = phoneDigits(query);
  if (!qd) return false;
  const storedFull = phoneDigits(stored);
  const storedNat = nationalNumber(stored, dialCode);
  const queryNat = nationalNumber(query, dialCode);
  return storedFull.includes(qd) || storedNat.includes(qd) || (queryNat.length > 0 && storedNat.includes(queryNat));
}

/** Build a canonical stored value from a national number + dial code. */
export function withDialCode(nationalInput: string, dialCode: string): string {
  const nat = phoneDigits(nationalInput).replace(/^0+/, "");
  if (!nat) return "";
  return `${dialCode} ${nat}`.trim();
}

/**
 * Build the international wa.me number (digits only): dial code + national number,
 * with the leading zero / duplicated dial code stripped. Shared by every "open
 * WhatsApp" action so birthday greetings and campaigns format numbers identically.
 */
export function waNumber(phone: string, dialCode: string): string {
  return `${phoneDigits(dialCode)}${nationalNumber(phone, dialCode)}`;
}
