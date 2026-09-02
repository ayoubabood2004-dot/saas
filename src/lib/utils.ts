import i18next from "i18next";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { currencyInfo, getActiveCurrency } from "./currency";
import { normalizeDigits } from "./digits";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iraqi Dinar currency symbol. */
export const IQD = "د.ع";

/** رمز عملة العيادة النشطة — بالعربي رمزها المختصر («د.ع»، «ر.س») وبالإنجليزي
 *  كودها الدولي (IQD, SAR). العملة تُشتق من دولة العيادة المختارة عند إنشاء
 *  الحساب وتُعدَّل من الإعدادات — فالنظام كله يعمل داخلياً بعملة العيادة. */
export const currencySymbol = () => {
  const c = currencyInfo(getActiveCurrency());
  return i18next.language === "ar" ? c.symAr : c.code;
};



// 'en-US' is intentional: it guarantees Western numerals (0-9) with thousands
// separators regardless of the browser locale, and never Eastern Arabic digits.
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Group a number with thousands separators, no decimals — e.g. 1500000 → "1,500,000". */
export function formatNum(n: number): string {
  return numFmt.format(Number.isFinite(n) ? n : 0);
}

// أرقام القياس تحتفظ بكسورها. formatNum يقصّها لأنه مخصّص للأعداد والمبالغ —
// واستعماله على قياس يكذب على الطبيب: WBC 12.4 تظهر 12، ومدى الوحيدات
// 0.15–1.35 يظهر 0–1، ووزن 4.5 كغ يظهر 5 وهو أساس حساب الجرعة.
const decFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Format a measurement, keeping its decimals — 30.8 → "30.8", 0.15 → "0.15". */
export function formatDec(n: number): string {
  return decFmt.format(Number.isFinite(n) ? n : 0);
}

/** وزنٌ بالكيلو بلا أصفارٍ زائدة: 2 → "2"، 0.5 → "0.5"، 1.250 → "1.25".
 *  دقّة الغرام (ثلاث خانات) هي دقّة المخزون نفسها، فلا يُعرض ما لا يُخزَّن. */
export function fmtKg(kg: number): string {
  const n = Math.round((Number(kg) || 0) * 1000) / 1000;
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, "");
}

/** Format an amount in the clinic's currency — e.g. 25000 → "25,000 د.ع".
 *  عملات الأجزاء (د.ك، د.ب، ر.ع…) تحتفظ بكسورها لأن «9.5 دينار كويتي» مبلغ
 *  حقيقي؛ تقريبه لـ9 يكذب على الكاشير. */
export function money(n: number): string {
  const frac = currencyInfo(getActiveCurrency()).frac;
  return `${frac ? formatDec(n) : formatNum(n)} ${currencySymbol()}`;
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

/**
 * Fold Arabic orthography for search: hamza forms أ/إ/آ → ا, ة → ه, ى → ي,
 * strip diacritics + tatweel, drop spacing, lowercase Latin. A doctor typing
 * «اموكس» must find «أموكسيسيلين» — search that demands the right hamza is
 * search that silently fails.
 */
export function normalizeAr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/\s+/g, "");
}

/**
 * نصٌّ جاهزٌ للبحث: الإملاء العربي مطويٌّ **والأرقام موحَّدة**. فمن يكتب «٢٣٨»
 * بلوحةٍ عربية يلقى «238»، ومن يكتب «خارجيه» يلقى «خارجية».
 *
 * والقاعدة الحاكمة: **الطرفان يمرّان من هنا** — ما يُكتب بالبحث وما هو مخزون.
 * تطبيعُ طرفٍ واحد أسوأ من لا تطبيع، لأنه يفشل بصمتٍ ويبدو أنه يعمل.
 */
export const searchable = (s: string | null | undefined): string =>
  normalizeAr(normalizeDigits(String(s ?? "")));

/**
 * تطبيع الباركود — قبل الحفظ وقبل المسح بنفس الدالّة.
 *
 * ثلاثةٌ تكسر المطابقة بصمت، وكلُّها موجودةٌ بقاعدة الإنتاج فعلاً:
 *   • أرقامٌ شرقية (٢٣٨) تُكتب بلوحةٍ عربية بينما الماسح يُخرج (238)
 *   • علامةُ اتجاهٍ غير مرئية تلتصق باللصق — عندنا صفٌّ باركودُه يبدو «8989»
 *     بالشاشة وأوّلُ محرفٍ فيه علامةُ اتجاه، فلا يتطابق مع مسحةِ 8989 أبداً
 *   • مسافةٌ طرفية من لصقٍ أو من ماسحٍ يُلحق فراغاً
 */
export const normalizeCode = (s: string | null | undefined): string =>
  normalizeDigits(String(s ?? ""))
    // علاماتُ الاتجاه والعرضِ الصفري: ZWSP/ZWNJ/ZWJ/LRM/RLM، والجيوب، والعوازل، وBOM
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, "");

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
// Defaults to the CURRENT UI language so date rendering follows the app language.
export const dateLocale = (lang: string = i18next.language) => (lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB");

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
