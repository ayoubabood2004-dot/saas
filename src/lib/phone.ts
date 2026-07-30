// Phone helpers for format-agnostic search.
// Doctors type digits only — no spaces, and the international dialing code is optional
// (defaults to the clinic's configured code, see settings.getDialCode).

import { normalizeDigits } from "./digits";

export function phoneDigits(s: string): string {
  // Eastern-Arabic digits are converted first (NOT stripped) — a legacy number
  // stored as 0771… must keep working for search and WhatsApp links.
  return normalizeDigits(s || "").replace(/\D/g, "");
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

/**
 * Canonical identity key for a phone number — used to match an owner account to
 * pets registered across DIFFERENT clinics regardless of how each clinic typed
 * the number (spaces, +964, 00964, leading zero, Eastern-Arabic digits).
 * "+964 770 111 2222", "07701112222" and "٠٧٧٠١١١٢٢٢٢" all yield "7701112222".
 */
export function phoneKey(s: string): string {
  let d = phoneDigits(s);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("964")) d = d.slice(3);
  return d.replace(/^0+/, "");
}

/** Two numbers identify the same person (keys equal and long enough to be unambiguous). */
export function samePhone(a: string, b: string): boolean {
  const ka = phoneKey(a);
  return ka.length >= 8 && ka === phoneKey(b);
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
