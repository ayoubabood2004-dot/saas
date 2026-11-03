/* ============================================================================
 * قلمُ «حالة اللقاحات» — القاعدةُ النقيّة (مفحوصةٌ بـ`scripts/vax-edit-test.mjs`): تجميعُ الجرعات كما تجمعها البطاقة،
 * وما يُرسَل من التعديل (ما تغيّر وحده)، وصلاحُ تاريخ الإعطاء. النافذةُ: VaccineEditSheet.tsx.
 * ========================================================================= */
import type { Vaccination } from "@/types";
import { statusForDue } from "./vaccineDue";
import type { VaxPatch } from "./vaxEditApi";

/** مفتاحُ اللقاح كما تجمعه بطاقةُ «حالة اللقاحات». */
export const vaxKey = (name: string) => name.trim().toLowerCase();

export interface VaxGroup { key: string; name: string; doses: Vaccination[] }

/** اللقاحاتُ مجموعةً بالاسم، وجرعاتُ كلٍّ برقمها ثمّ تاريخها — مصدَّرةٌ لتُفحص بسلوكها. */
export function groupVaccines(vaccines: readonly Vaccination[]): VaxGroup[] {
  const m = new Map<string, VaxGroup>();
  for (const v of vaccines) {
    const k = vaxKey(v.name);
    const g = m.get(k) ?? { key: k, name: v.name.trim(), doses: [] };
    g.doses.push(v);
    m.set(k, g);
  }
  const when = (v: Vaccination) => (v.status === "administered" ? v.administered_at : v.due_date) ?? "9999";
  for (const g of m.values()) {
    g.doses.sort((a, b) => (a.dose_number ?? 999) - (b.dose_number ?? 999) || when(a).localeCompare(when(b)));
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** تاريخُ إعطاءٍ صالح: يومٌ حقيقيّ، لا بالمستقبل ولا قبل ٢٠٠٠. */
export function validGiven(day: string, todayISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day && day <= todayISO.slice(0, 10) && day >= "2000-01-01";
}

export interface VaxDraft { date: string; lot: string; notes: string }
export const sameDraft = (a: VaxDraft, b: VaxDraft) => a.date === b.date && a.lot === b.lot && a.notes === b.notes;
export const draftOf = (v: Vaccination): VaxDraft => ({
  date: ((v.status === "administered" ? v.administered_at : v.due_date) ?? "").slice(0, 10),
  lot: v.lot_number ?? "",
  notes: v.notes ?? "",
});

/** ما تغيّر بالجرعة وحده — والفارغُ null. مصدَّرةٌ لتُفحص: حقلٌ لم يُلمس لا يُرسَل (لا يدوس كتابةً أحدث). */
export function dosePatch(v: Vaccination, d: VaxDraft, todayISO: string): VaxPatch {
  const was = draftOf(v);
  const p: VaxPatch = {};
  if (v.status === "administered") {
    if (d.date !== was.date) p.administered_at = d.date;
    if (d.lot.trim() !== was.lot.trim()) p.lot_number = d.lot.trim() || null;
  } else if (d.date !== was.date) {
    p.due_date = d.date;
    p.status = statusForDue(d.date, todayISO);
  }
  if (d.notes.trim() !== was.notes.trim()) p.notes = d.notes.trim() || null;
  return p;
}
