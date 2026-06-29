import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iraqi Dinar currency symbol. */
export const IQD = "د.ع";

// 'en-US' is intentional: it guarantees Western numerals (0-9) with thousands
// separators regardless of the browser locale, and never Eastern Arabic digits.
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Group a number with thousands separators, no decimals — e.g. 1500000 → "1,500,000". */
export function formatNum(n: number): string {
  return numFmt.format(Number.isFinite(n) ? n : 0);
}

/** Format an amount as Iraqi Dinar — e.g. 25000 → "25,000 د.ع". */
export function money(n: number): string {
  return `${formatNum(n)} ${IQD}`;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** RFC4122 v4 UUID — used for collision-free storage object names. */
export function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through to manual */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function ageFromDOB(dob?: string | null): { years: number; months: number } | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Total age in whole months from a DOB (null if missing/invalid). Used to snapshot a
 *  patient's age onto a visit record so history shows their age at that moment. */
export function ageMonths(dob?: string | null): number | null {
  const a = ageFromDOB(dob);
  return a ? a.years * 12 + a.months : null;
}

export function daysUntil(date: string): number {
  const target = new Date(date);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Local calendar date as YYYY-MM-DD. Uses local getters (NOT toISOString, which is
 *  UTC and lands on the wrong day late-evening/early-morning in positive-offset zones
 *  like Iraq UTC+3). The single source of truth for "today" across the app. */
export function localISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Arabic locale variant that keeps Arabic names but forces Western (Latin) numerals
// via the Unicode `nu=latn` extension — so dates/times never show Eastern-Arabic digits.
const dateLocale = (lang: string) => (lang === "ar" ? "ar-EG-u-nu-latn" : "en-US");

export function formatTime(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit" });
}

/** Format a bare "HH:MM" (24h) clock string into a locale-aware 12-hour time (e.g. "2:57 PM"). */
export function formatHM(hm: string, lang: string): string {
  const [h, m] = (hm || "").split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return hm;
  const d = new Date();
  d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
  return d.toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short" });
}

/** Generate slot start datetimes (ISO) for a day between open/close hours. */
export function generateSlots(dayISO: string, openHour: number, closeHour: number, slotMinutes: number): string[] {
  const slots: string[] = [];
  const base = new Date(dayISO);
  for (let h = openHour; h < closeHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      slots.push(d.toISOString());
    }
  }
  return slots;
}

/** Percentage of administered vaccinations out of those that are due now or already
 *  given. Future "scheduled" boosters are plans, not gaps, so they don't drag the
 *  score down — but "overdue" (missed) doses still count against coverage. */
export function vaccinationCompletion(vaccinations: { status: string }[]): number {
  const counted = vaccinations.filter((v) => v.status !== "scheduled");
  if (!counted.length) return 0;
  const done = counted.filter((v) => v.status === "administered").length;
  return Math.round((done / counted.length) * 100);
}
