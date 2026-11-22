// ============================================================================
// مكتبتا الصور (0285): العامّة (يرتّبها المشغّل ويراها الكلّ) ومكتبةُ العيادة الخاصّة (تكتبها بصلاحية صور
// المنتجات وتراها وحدها). القائمةُ من الخادم واحدة — السياسةُ ترجع العامّةَ ومكتبةَ هذه العيادة وحدها — والفصلُ
// بالعمود: `clinic_id` فارغ = العامّة. صِرفةٌ بلا React ليفحصها library-import-test بسلوكها.
// ============================================================================
import { cleanLibName, under, type LibPath } from "./libraryLevels";
import { normalizeCode, searchable } from "./utils";
import type { LibraryImage } from "@/types";

export type LibScope = "public" | "mine";

/** العامّةُ صفٌّ بلا عيادة — وقاعدةٌ قبل 0285 (بلا العمود أصلاً) كلُّ صفوفها عامّة. */
export const isPublicRow = (r: Pick<LibraryImage, "clinic_id">): boolean => !r.clinic_id;

export function rowsOf<T extends Pick<LibraryImage, "clinic_id">>(rows: readonly T[], scope: LibScope): T[] {
  return rows.filter((r) => (scope === "public" ? isPublicRow(r) : !isPublicRow(r)));
}

/**
 * القاعدةُ تعرف مكتبةَ العيادة؟ بمفتاح العمود بالصفّ — `select *` يرجعه ولو فارغاً منذ 0285 (كعمود `edits`
 * بـ0281). مكتبةٌ فارغةٌ كلُّها لا تقول شيئاً: يُفترض «نعم»، وقاعدةٌ قديمة ترفض أوّلَ كتابةٍ بعمودٍ لا تعرفه
 * فيُقال ذلك بجملة (`isLibraryColumnMissing`).
 */
export function clinicLibraryReady(rows: readonly object[]): boolean {
  return rows.length === 0 || rows.some((r) => "clinic_id" in r);
}

/** رفضُ قاعدةٍ لا تعرف عموداً أرسلناه (الصنف والوكالة 0284، أو العيادة 0285): PGRST204 أو 42703. */
export function isLibraryColumnMissing(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "PGRST204" || x?.code === "42703" || /column .*(kind|agency|clinic_id)/i.test(x?.message ?? "");
}

/** معرّفاتُ الصور تحت المسار — نقلُ مجموعةٍ بمستواها (إعادةُ تسمية وكالةٍ أو دمجُ قسمين) يكتبها كلَّها. */
export function idsUnder(rows: readonly LibraryImage[], path: LibPath): string[] {
  return under([...rows], path).map((r) => r.id);
}

/** الحقولُ التي تغيّرت وحدها — التعديلُ لا يرسل ما لم يُمسّ (قاعدةٌ قبل 0284 ترفض الصنفَ والوكالة ولو فارغين). */
export type LibraryPatch = Partial<Record<"name" | "company" | "kind" | "agency" | "section" | "barcode", string | null>>;
export function libraryPatch(before: LibraryImage, after: Record<keyof LibraryPatch, string>): LibraryPatch {
  const out: LibraryPatch = {};
  for (const k of ["name", "company", "kind", "agency", "section", "barcode"] as const) {
    const was = (before[k] ?? "").trim();
    const now = (after[k] ?? "").trim();
    if (was !== now) out[k] = now || null;
  }
  return out;
}

/* ── اقتراحُ صورٍ لمنتج (منتقي المكتبة، «صورة لـ…») ────────────────────────────────────────────────
 * الباركودُ نفسُه أوّلاً (المنتجُ نفسُه بلا شكّ)، ثمّ الاسمُ بكلماتٍ مشتركة: كلمتان فأكثر (أو كلمةٌ إن كان
 * الاسمُ كلمةً واحدة) — كلمةٌ عامّة واحدة («قطط») كانت ستقترح المكتبةَ كلَّها. والطرفان مطبَّعان بالدالّة
 * نفسِها (`searchable` للكلمة، `normalizeCode` للرمز). اقتراحٌ يُرى ويُختار باليد — لا ربطَ تلقائيّ. */
export function nameWords(s: string | null | undefined): string[] {
  return [...new Set(cleanLibName(s).split(/[\s\-–—_/\\|,.;:()[\]{}+&*#'"«»،؛]+/u).map((w) => searchable(w)).filter((w) => w.length >= 2))];
}
export function suggestFor<T extends Pick<LibraryImage, "name" | "barcode">>(
  rows: readonly T[], target: { name?: string | null; barcode?: string | null }, n = 8,
): T[] {
  const code = normalizeCode(target.barcode ?? "");
  const words = nameWords(target.name);
  if (!code && words.length === 0) return [];
  const need = words.length === 1 ? 1 : 2;
  const scored: [number, T][] = [];
  for (const r of rows) {
    let s = 0;
    if (code && r.barcode && normalizeCode(r.barcode) === normalizeCode(target.barcode)) s += 1000;
    if (words.length) {
      const rw = new Set(nameWords(r.name));
      let k = 0;
      for (const w of words) if (rw.has(w)) k++;
      if (k >= need) s += k;
    }
    if (s > 0) scored.push([s, r]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, "ar")).slice(0, n).map((x) => x[1]);
}

/* ── شركاتُ المتجر (التشكيلة): تصفيةٌ بالشركة وجولةُ صورٍ لمنتجاتها ──────────────────────────────────
 * «بلا شركة» مستوىً قائمٌ بذاته (`NO_COMPANY`) لا يُرمى. والجولةُ: ما بلا صورةٍ أوّلاً بترتيب الشاشة، ثمّ
 * ما عنده صورة (تبديلُها) — فالعملُ الباقي يتصدّر، والمكتملُ لا يُخفى. */
export const NO_COMPANY = "~none";
export interface CompanyCount { id: string; name: string | null; count: number; noPhoto: number }
export function companyCounts<P extends { company_id?: string | null; image_path?: string | null }>(
  products: readonly P[], names: ReadonlyMap<string, string>,
): CompanyCount[] {
  const m = new Map<string, CompanyCount>();
  for (const p of products) {
    const id = p.company_id || NO_COMPANY;
    const c = m.get(id) ?? { id, name: id === NO_COMPANY ? null : names.get(id) ?? null, count: 0, noPhoto: 0 };
    c.count++;
    if (!p.image_path) c.noPhoto++;
    m.set(id, c);
  }
  return [...m.values()].sort((a, b) => (a.name == null ? 1 : b.name == null ? -1 : a.name.localeCompare(b.name, "ar")));
}
export function inCompany(p: { company_id?: string | null }, id: string): boolean {
  return id === NO_COMPANY ? !p.company_id : p.company_id === id;
}
export function photoRunQueue<P extends { id: string; image_path?: string | null }>(ordered: readonly P[]): string[] {
  return [...ordered.filter((p) => !p.image_path), ...ordered.filter((p) => !!p.image_path)].map((p) => p.id);
}
