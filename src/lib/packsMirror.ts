/* ============================================================================
 * مرآةُ حرّاس 0259 للتجريبيّ (repoDemo) — نقيّة، ومفحوصةٌ بـ`scripts/packs-test.mjs` على الحالات نفسِها التي يفحصها قسمُ 0259
 * بالحزمة على بوستغريس. فحوصُ المنطق تجري على النسخة التجريبية (CLAUDE.md §٤): حارسٌ لا يوجد هنا حارسٌ لم يُفحص.
 *
 *  • `packagingShapeError` = قيدُ `products_packaging_ok` (23514) — `btrim` بوستغريس (المسافةُ وحدها) و`char_length` (محارف لا وحدات).
 *  • `levelGuardError` = محفّزُ `products_level_codes_guard` (P0001): داخل المادة `code_level_twin`، ثمّ كلُّ رمزٍ **جديد** بخانته
 *    مقابلَ غيره `barcode_taken` — وما لم يتغيّر لا يُفحص. والمحفّزُ قبل القيد بالخادم، فهنا كذلك.
 *  • `mergePackaging` / `unmergePackaging` / `snapshotFree` = إضافاتُ 0259 بـ`merge_products` و`restore_product`.
 *  • الرسالة: الخادمُ يكتب تلميحاً عربياً، وهنا الرمزُ وحده (`code_level_twin`، `merge_*`) وصفحةُ المخزون تقوله بنطاقها (`pkgDbError`)
 *    — نصٌّ عربيٌّ صلبٌ هنا نصٌّ بلا ترجمة. و`barcode_taken` بتلميح 0167 المترجَم نفسِه (`pos.barcodeTakenHint`) كمرآة 0167.
 * ========================================================================= */
import type { Product, ProductPack } from "@/types";
import { levelCodes, packsOf, subCodesOf, newPackId } from "./packs";
import { matchCode } from "./utils";
import i18next from "i18next";

type Err = Error & { code: string; hint?: string };
const pgErr = (code: string, message: string): Err => Object.assign(new Error(message), { code });

const btrim = (s: string) => s.replace(/^ +/, "").replace(/ +$/, "");
const chars = (s: string) => [...s].length;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const priceOk = (v: unknown) => v == null || (isNum(v) && v >= 0);
const codesOk = (list: unknown, max: number) =>
  list == null || (Array.isArray(list) && list.length <= max && list.every((c) => typeof c === "string" && chars(c) >= 1 && chars(c) <= 64));

/** مرآةُ `_pkg_packs_ok`. */
function packsShapeOk(p: unknown): boolean {
  if (p == null) return true;
  if (!Array.isArray(p) || p.length > 4) return false;
  const ids = new Set<string>();
  for (const e of p) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return false;
    const k = e as Record<string, unknown>;
    if (typeof k.id !== "string" || chars(k.id) < 1 || chars(k.id) > 64) return false;
    if (typeof k.name !== "string" || chars(btrim(k.name)) < 1 || chars(btrim(k.name)) > 20) return false;
    if (!isNum(k.per) || !Number.isInteger(k.per) || k.per < 2 || k.per > 100000) return false;
    if (!codesOk(k.codes, 5)) return false;
    if (!priceOk(k.purchase_price) || !priceOk(k.sell_price)) return false;
    ids.add(k.id);
  }
  return ids.size === p.length;
}

/** مرآةُ القيد `products_packaging_ok` على الصفّ كما سيُحفظ — خطأُ 23514 باسم القيد، أو null. */
export function packagingShapeError(p: Product): Err | null {
  const packs = p.packs as unknown;
  const sub = p.sub_codes as unknown;
  const ok = packsShapeOk(packs)
    && codesOk(sub, 5)
    && (p.sub_purchase_price == null || p.sub_purchase_price >= 0)
    && (p.unit_name == null || (chars(btrim(p.unit_name)) >= 1 && chars(btrim(p.unit_name)) <= 20))
    && ((Array.isArray(packs) ? packs.length : 0) === 0 || !(p.pooled || p.sold_by_weight))
    && ((Array.isArray(sub) ? sub.length : 0) === 0 || (!!p.has_sub_unit && (Number(p.units_per_box) || 0) > 0));
  return ok ? null : pgErr("23514", 'new row for relation "products" violates check constraint "products_packaging_ok"');
}

/** مقارنةُ jsonb بمعناها (ترتيبُ المفاتيح لا يهمّ) — `is not distinct from` بالخادم. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/**
 * مرآةُ `products_level_codes_guard`: `next` الصفُّ كما سيُحفظ، و`prev` كما كان (null لإدراج)، و`skipId` التوأمُ الذي يُطوى
 * (`doctorvet.codes_from`). خطأُ P0001 بالرسالة نفسها، أو null.
 */
export function levelGuardError(products: readonly Product[], next: Product, prev: Product | null, skipId?: string | null): Err | null {
  if (prev && (next.barcode ?? null) === (prev.barcode ?? null) && canon(next.alt_codes) === canon(prev.alt_codes)
      && canon(next.sub_codes) === canon(prev.sub_codes) && canon(next.packs) === canon(prev.packs)) return null;
  const mine = levelCodes(next);
  const slot = new Map<string, Set<string>>();
  for (const c of mine) slot.set(c.norm, (slot.get(c.norm) ?? new Set()).add(c.slot));
  const twin = mine.find((c) => (slot.get(c.norm)?.size ?? 0) > 1);
  if (twin) return Object.assign(pgErr("P0001", "code_level_twin"), { level_code: mine.filter((c) => c.norm === twin.norm).map((c) => c.raw).sort()[0] });
  const before = prev ? levelCodes(prev) : [];
  const others = products.filter((o) => o.id !== next.id && (!skipId || o.id !== skipId))
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : (a.created_at ?? "") > (b.created_at ?? "") ? 1 : 0));
  for (const c of mine) {
    if (before.some((o) => o.norm === c.norm && o.slot === c.slot)) continue;
    for (const o of others) {
      const hit = levelCodes(o).find((x) => x.norm === c.norm && (c.level !== "box" || x.level !== "box"));
      if (hit) {
        const name = o.name?.trim() || o.barcode;
        return Object.assign(pgErr("P0001", "barcode_taken"), {
          hint: i18next.t("pos.barcodeTakenHint", { name, defaultValue: "هذا الباركود مستعمل عند «{{name}}». افتح المخزون وادمج المنتجَين أو غيّر رمزَ أحدهما." }),
          level_owner: name, level_of: hit.level,
        });
      }
    }
  }
  return null;
}

/* ── الطيّ والفكّ والاسترجاع ─────────────────────────────────────────────── */
/** مرآةُ `_pkg_codes_union`: بترتيب الأوّل ثمّ الجديد من الثاني، مطبَّعاً. */
export function codesUnion(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...(a ?? []), ...(b ?? [])]) {
    const k = matchCode(c);
    if (c == null || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
/** مرآةُ `_pkg_codes_minus`. */
export function codesMinus(a: readonly string[] | null | undefined, rm: readonly string[] | null | undefined): string[] {
  const drop = new Set((rm ?? []).map((c) => matchCode(c)));
  return (a ?? []).filter((c) => !drop.has(matchCode(c)));
}
/** مرآةُ `_pkg_packs_union`: كارتونٌ بنفس العدد يضمّ رموزَ أخيه (وأسعارُ الأصل تغلب، وفارغُها يأخذ أخاه)، وغيرُه يُلحق. */
export function packsUnion(a: readonly ProductPack[] | null | undefined, b: readonly ProductPack[] | null | undefined): ProductPack[] {
  const v = (Array.isArray(a) ? a : []).map((k) => ({ ...k }));
  for (const e of Array.isArray(b) ? b : []) {
    const i = v.findIndex((k) => Number(k.per) === Number(e.per));
    if (i >= 0) {
      v[i] = { ...v[i], codes: codesUnion(v[i].codes, e.codes), purchase_price: v[i].purchase_price ?? e.purchase_price ?? null, sell_price: v[i].sell_price ?? e.sell_price ?? null };
    } else if (v.some((k) => k.id === e.id)) {
      v.push({ ...e, id: newPackId() });
    } else {
      v.push({ ...e });
    }
  }
  return v;
}
/** مرآةُ `_pkg_packs_minus`: ما بمعرّفه وعدده بالقطة يُشال، وما بقي تُشال منه رموزُها. */
export function packsMinus(a: readonly ProductPack[] | null | undefined, rm: readonly ProductPack[] | null | undefined): ProductPack[] {
  const r = Array.isArray(rm) ? rm : [];
  const rmCodes = r.flatMap((k) => k.codes ?? []);
  return (Array.isArray(a) ? a : [])
    .filter((k) => !r.some((x) => x.id === k.id && Number(x.per) === Number(k.per)))
    .map((k) => ({ ...k, codes: codesMinus(k.codes, rmCodes) }));
}

/**
 * إضافاتُ 0259 بـ`merge_products` — قبل أيّ كتابة: ما لا يُحمل يُرمى بصوت (P0001 بالرمز نفسه)، وإلا ما يُكتب على الأصل.
 */
export function mergePackaging(keep: Product, drop: Product): Pick<Product, "sub_codes" | "packs" | "unit_name" | "sub_purchase_price"> {
  const dropSub = subCodesOf(drop);
  if (dropSub.length > 0 && !(keep.has_sub_unit && (Number(keep.units_per_box) || 0) > 0 && Number(keep.units_per_box) === Number(drop.units_per_box))) {
    throw pgErr("P0001", "merge_sub_codes");
  }
  if (packsOf(drop).length > 0 && keep.sold_by_weight) throw pgErr("P0001", "merge_packs_unit");
  const packs = packsUnion(packsOf(keep), packsOf(drop));
  if (packs.length > 4) throw pgErr("P0001", "merge_packs_overflow");
  const name = (s: string | null | undefined) => (s == null ? null : btrim(s) || null);
  const sameUpb = (keep.units_per_box ?? null) === (drop.units_per_box ?? null) || Number(keep.units_per_box) === Number(drop.units_per_box);
  return {
    sub_codes: codesUnion(subCodesOf(keep), dropSub),
    packs,
    unit_name: name(keep.unit_name) ?? name(drop.unit_name),
    sub_purchase_price: keep.sub_purchase_price ?? (keep.has_sub_unit && sameUpb ? drop.sub_purchase_price ?? null : null),
  };
}

/** إضافةُ 0259 بفكّ الدمج: الأصلُ يردّ رموزَ المغلّف والكراتين التي حملها الطيّ. */
export function unmergePackaging(keep: Product, snapshot: Partial<Product>): Pick<Product, "sub_codes" | "packs"> {
  return { sub_codes: codesMinus(subCodesOf(keep), subCodesOf(snapshot as Product)), packs: packsMinus(packsOf(keep), packsOf(snapshot as Product)) };
}

/**
 * مرآةُ `_pkg_snapshot_free`: لقطةُ استرجاعٍ بلا ما صار لغيرها بمستوىً آخر (الأساسيُّ والإضافيّ إن صارا مغلّفاً أو كارتوناً لغيره،
 * والمغلّفُ والكارتون إن صارا لأحدٍ بأيّ مستوى)، وبمستوياتٍ فارغة لا null. `others` بلا المادة نفسها.
 */
export function snapshotFree<T extends Partial<Product>>(row: T, others: readonly Product[]): T {
  const all = others.flatMap((o) => levelCodes(o));
  const nonBox = new Set(all.filter((c) => c.level !== "box").map((c) => c.norm));
  const any = new Set(all.map((c) => c.norm));
  const v: T = { ...row, sub_codes: Array.isArray(row.sub_codes) ? row.sub_codes : [], packs: Array.isArray(row.packs) ? row.packs : [] };
  if ((v.barcode ?? "") !== "" && nonBox.has(matchCode(v.barcode))) v.barcode = null;
  if (Array.isArray(v.alt_codes)) v.alt_codes = v.alt_codes.filter((c) => !nonBox.has(matchCode(c)));
  v.sub_codes = (v.sub_codes ?? []).filter((c) => !any.has(matchCode(c)));
  v.packs = (v.packs ?? []).map((k) => ({ ...k, codes: (Array.isArray(k.codes) ? k.codes : []).filter((c) => !any.has(matchCode(c))) }));
  return v;
}
