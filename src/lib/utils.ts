import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function daysUntil(date: string): number {
  const target = new Date(date);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatTime(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit" });
}

/** Format a bare "HH:MM" (24h) clock string into a locale-aware 12-hour time (e.g. "2:57 PM"). */
export function formatHM(hm: string, lang: string): string {
  const [h, m] = (hm || "").split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return hm;
  const d = new Date();
  d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
  return d.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "short", day: "numeric", month: "short" });
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
