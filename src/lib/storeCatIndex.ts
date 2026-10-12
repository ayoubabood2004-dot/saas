import type { StoreCatIcon, StoreCatOp, StoreCatSeedKey, StoreCatsSnapshot } from "@/types";
import { searchable } from "./utils";
import { categoryLook } from "./storeLib";

/* ============================================================================
 * storeCatIndex — قلبُ تصنيفات المتجر (0233)، بلا React (تقوده فحوصُ node).
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * الموضعُ والرفضُ يحسبهما الخادم (`store_categories_apply`)، والشاشةُ تعرض النتيجةَ
 * قبل وصوله ثم تستبدلها بلقطته — والنسخةُ التجريبيةُ تكتب بهذه نفسِها. فإن افترق
 * الحسابان رأى المديرُ تصنيفاً «ينطّ» بعد ثانية، أو رفضاً تجريبياً لا يقع بالإنتاج
 * فيُخفي العطلَ بدل أن يكشفه. لذلك `applyOps` مرآةُ الدالّة سطراً بسطر — نفسُ
 * الموضع ونفسُ الرفض **ونفسُ ترتيب الرفض** — ويفحص تطابقَهما `store-cats-parity`
 * على بوستغريس حقيقيّ، و`store-cats-test` على النسخة التجريبية.
 *
 * والحالةُ هنا أغنى من لقطة الخادم: صفوفُ العضوية بمواضعها (`items`). اللقطةُ تحمل
 * الأعضاءَ مرتَّبين بلا مواضع، فالشاشةُ تبني منها مواضعَ متتابعة (`stateFromSnapshot`)
 * — والترتيبُ الناتجُ عن عملياتٍ نسبيّة لا يتغيّر بقيمة المواضع، بل بترتيبها.
 * ==========================================================================*/

/** مفاتيحُ الأيقونات — **نفسُ قائمة قيد 0233** (تفحصها i18n-owned-guard وstore-cats-test). */
export const STORE_CAT_ICON_KEYS: readonly StoreCatIcon[] = [
  "paw", "dog", "cat", "bird", "fish", "rabbit", "pill", "syringe", "food", "bone",
  "toy", "bottle", "bath", "comb", "bag", "tag", "star", "gift", "new", "heart",
];
export const isCatIcon = (x: unknown): x is StoreCatIcon => typeof x === "string" && (STORE_CAT_ICON_KEYS as readonly string[]).includes(x);

/** تصنيفاتُ البداية بترتيب الأصناف (0233 `_store_cats_seed`): الاسمُ نصُّ storeLib الذي يراه
 *  الزبونُ اليوم، والأيقونةُ من القائمة. */
export const SEED_DEFS: readonly { key: StoreCatSeedKey; icon: StoreCatIcon }[] = [
  { key: "medicine", icon: "pill" },
  { key: "food", icon: "food" },
  { key: "accessories", icon: "toy" },
  { key: "consumables", icon: "bottle" },
  { key: "other", icon: "bag" },
];
export const seedName = (key: StoreCatSeedKey): string => categoryLook(key).label;

export const POS_STEP = 1024;
export const MAX_LIVE = 40;
export const MAX_OPS = 200;
export const MAX_IDS = 2000;
export const MAX_MEMBERS = 2000;
export const NAME_MAX = 40;

/** تلميحاتُ الخادم حرفاً بحرف (`raise … using hint`) — بمهارب يونيكود لأنها عقدٌ مع القاعدة
 *  لا نصٌّ يُترجم، ويفحص `store-cats-test` تطابقَها مع نصّ 0233/0234. */
export const STORE_CAT_HINTS = {
  not_authenticated: "\u0644\u0627 \u0639\u064a\u0627\u062f\u0629\u064e \u0644\u0644\u062c\u0644\u0633\u0629 \u2014 \u0633\u062c\u0651\u0644 \u062f\u062e\u0648\u0644 \u0645\u0646 \u062c\u062f\u064a\u062f.",
  clinic_switched: "\u062a\u0628\u062f\u0651\u0644\u062a \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629. \u0645\u0627 \u0627\u0646\u062d\u0641\u0638 \u0634\u064a.",
  bad_ops: "\u0637\u0644\u0628\u064c \u063a\u064a\u0631 \u0645\u0641\u0647\u0648\u0645 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  not_authorized: "\u062a\u0633\u0645\u064a\u0629 \u0648\u062a\u0631\u062a\u064a\u0628 \u0627\u0644\u062a\u0635\u0646\u064a\u0641\u0627\u062a \u0644\u0644\u0645\u062f\u064a\u0631 \u0648\u0627\u0644\u0637\u0628\u064a\u0628",
  no_store_right: "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u062a\u062c\u0631 \u0645\u0648 \u0645\u0646 \u0635\u0644\u0627\u062d\u064a\u062a\u0643 \u2014 \u0627\u0637\u0644\u0628\u0647\u0627 \u0645\u0646 \u0645\u062f\u064a\u0631 \u0627\u0644\u0639\u064a\u0627\u062f\u0629.",
  store_cat_bad_name: "\u0627\u0633\u0645 \u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0644\u0627\u0632\u0645 \u064a\u0643\u0648\u0646 \u0628\u064a\u0646 \u062d\u0631\u0641 \u0648\u0664\u0660 \u062d\u0631\u0641\u0627\u064b.",
  store_cat_bad_icon: "\u0627\u0644\u0623\u064a\u0642\u0648\u0646\u0629 \u0645\u0648 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  store_cat_full: "\u0648\u0635\u0644\u062a \u0664\u0660 \u062a\u0635\u0646\u064a\u0641\u0627\u064b \u2014 \u0634\u064a\u0644 \u062a\u0635\u0646\u064a\u0641 \u0645\u0627 \u062a\u0633\u062a\u0639\u0645\u0644\u0647 \u0623\u0648\u0651\u0644\u0627\u064b.",
  store_cat_exists: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0645\u0648\u062c\u0648\u062f: \u00ab%s\u00bb \u2014 \u0627\u0633\u062a\u0639\u0645\u0644\u0647 \u0628\u062f\u0644 \u0645\u0627 \u062a\u0633\u0648\u0651\u064a \u0646\u0633\u062e\u0629 \u062b\u0627\u0646\u064a\u0629.",
  store_cat_gone: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0645\u0627 \u0639\u0627\u062f \u0645\u0648\u062c\u0648\u062f \u0623\u0648 \u062a\u063a\u064a\u0651\u0631 \u0645\u0646 \u062c\u0647\u0627\u0632 \u062b\u0627\u0646\u064a \u2014 \u0631\u062c\u0651\u0639\u0646\u0627\u0647 \u0645\u062b\u0644 \u0645\u0627 \u0628\u0627\u0644\u062e\u0627\u062f\u0645\u060c \u0639\u064a\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
  store_item_gone: "\u0645\u0627\u062f\u0629 \u0645\u0627 \u0639\u0627\u062f\u062a \u0645\u0648\u062c\u0648\u062f\u0629 \u0623\u0648 \u062a\u063a\u064a\u0651\u0631\u062a \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0646 \u062c\u0647\u0627\u0632 \u062b\u0627\u0646\u064a \u2014 \u0631\u062c\u0651\u0639\u0646\u0627\u0647\u0627 \u0645\u062b\u0644 \u0645\u0627 \u0628\u0627\u0644\u062e\u0627\u062f\u0645\u060c \u0639\u064a\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
  store_cat_members_full: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0648\u0635\u0644 \u0662\u0660\u0660\u0660 \u0645\u0627\u062f\u0629 \u2014 \u0642\u0633\u0651\u0645\u0647 \u0644\u062a\u0635\u0646\u064a\u0641\u064a\u0646.",
  cat_gone: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0645\u0627 \u0639\u0627\u062f \u0645\u0648\u062c\u0648\u062f",
} as const;
export type StoreCatErrorCode = Exclude<keyof typeof STORE_CAT_HINTS, "no_store_right">;

/** خطأٌ بشكل خطأ الخادم كما يصل من PostgREST: `message` = الرمز، و`code` = P0001 (أو 42501
 *  للصلاحية، P0002 لـcat_gone)، و`hint` = الشرح العربيّ — فيقرؤه `describeDbError` كرفض القاعدة. */
export class StoreCatError extends Error {
  code: string;
  hint: string;
  constructor(reason: StoreCatErrorCode, arg?: string, hintKey?: keyof typeof STORE_CAT_HINTS) {
    super(reason);
    this.name = "StoreCatError";
    this.code = reason === "not_authorized" ? "42501" : reason === "cat_gone" ? "P0002" : "P0001";
    this.hint = STORE_CAT_HINTS[hintKey ?? reason].replace("%s", arg ?? "");
  }
}
/** رمزُ الرفض من خطأ الخادم أو المرآة (الرسالةُ نفسُها). */
export const storeCatErrorCode = (e: unknown): string | null => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : null;
};
const fail = (reason: StoreCatErrorCode, arg?: string): never => { throw new StoreCatError(reason, arg); };

/** مرآةُ `btrim(regexp_replace(name, '[ \t\r\n]+', ' ', 'g'))` — حرفاً بحرف (لا `\s` ولا `trim()`). */
export const normCatName = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[ \t\r\n]+/g, " ").replace(/^ +| +$/g, "");
/** مفتاحُ التصنيف — مرآةُ `search_norm(name)` بالفهرس الفريد. */
export const catKey = (name: string | null | undefined): string => searchable(name);
const charLen = (s: string) => [...s].length;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);

/* ── الحالة ──────────────────────────────────────────────────────────────── */
export interface CatRow {
  id: string;
  name: string;
  icon: StoreCatIcon;
  hidden: boolean;
  pos: number | null;
  archived_at: string | null;
  seed_key: StoreCatSeedKey | null;
}
export interface ItemRow { category_id: string; product_id: string; pos: number }
export interface CatsState { seeded: boolean; cats: CatRow[]; items: ItemRow[] }

export interface ApplyCtx {
  /** مرآةُ `can_edit` بالخادم: البنيةُ والترتيبُ — وإلا not_authorized. */
  canEdit: boolean;
  /** منتجٌ لهذه العيادة خارج الحقول؟ الشاشةُ لا تعرف كلَّ شيء فتترك الحكمَ للخادم (افتراضاً نعم). */
  isProduct?: (id: string) => boolean;
  /** البذرة (النسخةُ التجريبية) — الشاشةُ لا تبذر بنفسها، تنتظر لقطةَ الخادم. */
  seed?: (s: CatsState) => CatsState;
  now?: string;
}

/** ترتيبُ بوستغريس `order by pos, id` (المعرّفُ uuid يُقارن بايتاً بايتاً = نصّاً بحروفٍ صغيرة). */
const byPosId = <T extends { pos: number | null }>(id: (x: T) => string) => (a: T, b: T): number =>
  ((a.pos ?? 0) - (b.pos ?? 0)) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0);
export const cmpCat = byPosId<CatRow>((c) => c.id);
export const cmpItem = byPosId<ItemRow>((m) => m.product_id);

/** التصنيفاتُ الحيّةُ بترتيب العيادة، ثم المؤرشفةُ الأحدثُ أوّلاً (ترتيبُ store_categories_list). */
export function liveCats(s: CatsState): CatRow[] { return s.cats.filter((c) => c.archived_at == null).sort(cmpCat); }
export function archivedCats(s: CatsState): CatRow[] {
  return s.cats.filter((c) => c.archived_at != null)
    .sort((a, b) => (a.archived_at! < b.archived_at! ? 1 : a.archived_at! > b.archived_at! ? -1 : a.id < b.id ? -1 : 1));
}
/** أعضاءُ تصنيفٍ بترتيبه. */
export function membersOf(s: CatsState, cat: string): string[] {
  return s.items.filter((m) => m.category_id === cat).sort(cmpItem).map((m) => m.product_id);
}

/** لقطةُ الخادم ⇒ حالةٌ تُطبَّق عليها العمليات. مواضعُ الأعضاء متتابعة (اللقطةُ بلا مواضع). */
export function stateFromSnapshot(snap: Pick<StoreCatsSnapshot, "seeded" | "cats" | "members">): CatsState {
  const cats: CatRow[] = snap.cats.map((c) => ({
    id: c.id, name: c.name, icon: c.icon, hidden: !!c.hidden, pos: c.pos == null ? null : Number(c.pos),
    archived_at: c.archived_at ?? null, seed_key: c.seed_key ?? null,
  }));
  const items: ItemRow[] = [];
  for (const [cat, ids] of Object.entries(snap.members ?? {})) {
    ids.forEach((pid, i) => items.push({ category_id: cat, product_id: pid, pos: (i + 1) * POS_STEP }));
  }
  return { seeded: !!snap.seeded, cats, items };
}

/* ── البذرة — مرآةُ `_store_cats_seed` (للنسخة التجريبية) ────────────────── */
export interface SeedProduct {
  id: string;
  name: string;
  category?: string | null;
  farm_id?: string | null;
  /** يراه الزبون (_store_listed)؟ */
  listed: boolean;
}
export function seedCats(s: CatsState, products: readonly SeedProduct[], newId: () => string): CatsState {
  if (s.seeded) return s;
  const out: CatsState = { seeded: true, cats: s.cats.map((c) => ({ ...c })), items: s.items.map((m) => ({ ...m })) };
  const mine = products.filter((p) => !p.farm_id);
  const liveKeys = new Set(out.cats.filter((c) => c.archived_at == null).map((c) => catKey(c.name)));
  const ranked = SEED_DEFS
    .map((d, ord) => ({
      ...d, ord, name: seedName(d.key),
      nListed: mine.filter((p) => p.category === d.key && p.listed).length,
      nTotal: mine.filter((p) => p.category === d.key).length,
    }))
    .filter((d) => !liveKeys.has(catKey(d.name)))
    .sort((a, b) => b.nListed - a.nListed || b.nTotal - a.nTotal || a.ord - b.ord);
  ranked.forEach((d, i) => {
    if (out.cats.some((c) => c.seed_key === d.key)) return;
    const id = newId();
    out.cats.push({ id, name: d.name, icon: d.icon, hidden: false, pos: (i + 1) * POS_STEP, archived_at: null, seed_key: d.key });
    mine.filter((p) => p.category === d.key)
      .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
      .forEach((p, j) => out.items.push({ category_id: id, product_id: p.id, pos: (j + 1) * POS_STEP }));
  });
  return out;
}

/* ── applyOps — مرآةُ store_categories_apply (0233) ──────────────────────── */

const STRUCT = new Set(["init", "create", "edit", "hide", "archive", "restore", "move", "move_item"]);
const OPS = new Set([...STRUCT, "add", "remove"]);
const hasKey = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * يطبّق دفعةً كما يطبّقها الخادم — بالترتيب، وبالرفض نفسه وترتيبه. لا يُغيّر الحالةَ الداخلة:
 * رفضٌ بمنتصف الدفعة يرمي ولا يترك نصفَها (معاملةٌ واحدة). فحصُ «إذن المتجر» نفسُه شأنُ
 * الخادم (والشاشةُ لا تُفتح بدونه)؛ هنا `canEdit` وحده.
 */
export function applyOps(state: CatsState, ops: readonly StoreCatOp[] | unknown, ctx: ApplyCtx): CatsState {
  if (!Array.isArray(ops) || ops.length > MAX_OPS) fail("bad_ops");
  const list = ops as unknown[];
  const total = list.reduce<number>((n, o) => n + (isObj(o) && Array.isArray(o.ids) ? o.ids.length : 0), 0);
  if (total > MAX_IDS) fail("bad_ops");
  const now = ctx.now ?? new Date().toISOString();
  const isProduct = ctx.isProduct ?? (() => true);
  let out: CatsState = { seeded: state.seeded, cats: state.cats.map((c) => ({ ...c })), items: state.items.map((m) => ({ ...m })) };

  const live = () => out.cats.filter((c) => c.archived_at == null);
  const twinOf = (name: string, except?: string): CatRow | undefined => {
    const k = catKey(name);
    return live().filter((c) => c.id !== except && catKey(c.name) === k).sort(cmpCat)[0];
  };
  const badName = (name: string) => catKey(name) === "" || charLen(name) > NAME_MAX;
  const itemsOf = (cat: string) => out.items.filter((m) => m.category_id === cat);
  const isMember = (cat: string, pid: string) => out.items.some((m) => m.category_id === cat && m.product_id === pid);

  /** مرآةُ `_store_cat_slot`. */
  const slotCat = (self: string | null, has: boolean, after: string | null): number => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const others = live().filter((c) => c.id !== self);
      if (!has) return (others.length ? Math.max(...others.map((c) => c.pos as number)) : 0) + POS_STEP;
      if (after === null) return (others.length ? Math.min(...others.map((c) => c.pos as number)) : POS_STEP) - POS_STEP;
      const a = live().find((c) => c.id === after);
      if (!a || after === self) return fail("store_cat_gone");
      const apos = a.pos as number;
      const later = others.filter((c) => (c.pos as number) > apos).map((c) => c.pos as number);
      if (!later.length) return apos + POS_STEP;
      const next = Math.min(...later);
      if (next - apos >= 2) return Math.floor((apos + next) / 2);
      if (attempt === 2) break;
      live().sort(cmpCat).forEach((c, i) => { c.pos = (i + 1) * POS_STEP; });
    }
    return fail("store_cat_gone");
  };
  /** مرآةُ `_store_item_slot`. */
  const slotItem = (cat: string, self: string | null, has: boolean, after: string | null): number => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const others = itemsOf(cat).filter((m) => m.product_id !== self);
      if (!has) return (others.length ? Math.max(...others.map((m) => m.pos)) : 0) + POS_STEP;
      if (after === null) return (others.length ? Math.min(...others.map((m) => m.pos)) : POS_STEP) - POS_STEP;
      const a = itemsOf(cat).find((m) => m.product_id === after);
      if (!a || after === self) return fail("store_item_gone");
      const later = others.filter((m) => m.pos > a.pos).map((m) => m.pos);
      if (!later.length) return a.pos + POS_STEP;
      const next = Math.min(...later);
      if (next - a.pos >= 2) return Math.floor((a.pos + next) / 2);
      if (attempt === 2) break;
      itemsOf(cat).sort(cmpItem).forEach((m, i) => { m.pos = (i + 1) * POS_STEP; });
    }
    return fail("store_item_gone");
  };
  const seedNow = () => {
    if (out.seeded) return;
    out = ctx.seed ? ctx.seed(out) : out;
    out.seeded = true;
  };

  for (const raw of list) {
    if (!isObj(raw)) fail("bad_ops");
    const o = raw as Record<string, unknown>;
    const op = typeof o.op === "string" ? o.op : null;
    if (!op || !OPS.has(op)) fail("bad_ops");
    if (STRUCT.has(op as string) && !ctx.canEdit) fail("not_authorized");

    // (أ) قراءةُ الحقول — شكلٌ خاطئ ⇒ bad_ops قبل أيّ فحصٍ آخر (نفسُ ترتيب الدالّة)
    let id = "", cat = "", after: string | null = null, has = false, ids: string[] = [];
    if (["create", "edit", "hide", "archive", "restore", "move", "move_item"].includes(op as string)) {
      if (!isUuid(o.id)) fail("bad_ops");
      id = (o.id as string).toLowerCase();
    }
    if (["move_item", "add", "remove"].includes(op as string)) {
      if (!isUuid(o.cat)) fail("bad_ops");
      cat = (o.cat as string).toLowerCase();
    }
    if (op === "add" || op === "remove") {
      if (!Array.isArray(o.ids)) fail("bad_ops");
      if ((o.ids as unknown[]).some((x) => !isUuid(x))) fail("bad_ops");
      ids = (o.ids as string[]).map((x) => x.toLowerCase());
    }
    if (["create", "move", "move_item", "add"].includes(op as string) && hasKey(o, "after")) {
      has = true;
      if (o.after === null) after = null;
      else if (isUuid(o.after)) after = (o.after as string).toLowerCase();
      else fail("bad_ops");
    }
    if ((op === "move" || op === "move_item") && !has) fail("bad_ops");
    if (op === "hide" && typeof o.hidden !== "boolean") fail("bad_ops");

    // (ب) العملية
    switch (op) {
      case "init":
        seedNow();
        break;
      case "create": {
        seedNow();
        if (out.cats.some((c) => c.id === id)) break;   // إعادةٌ آمنة
        const name = normCatName(typeof o.name === "string" ? o.name : "");
        if (badName(name)) fail("store_cat_bad_name");
        const icon = typeof o.icon === "string" ? o.icon : "tag";
        if (!isCatIcon(icon)) fail("store_cat_bad_icon");
        if (live().length >= MAX_LIVE) fail("store_cat_full");
        const twin = twinOf(name);
        if (twin) fail("store_cat_exists", twin.name);
        const pos = slotCat(null, has, after);
        out.cats.push({ id, name, icon: icon as StoreCatIcon, hidden: false, pos, archived_at: null, seed_key: null });
        break;
      }
      case "edit": {
        const r = live().find((c) => c.id === id);
        if (!r) return fail("store_cat_gone");
        const name = typeof o.name === "string" ? normCatName(o.name) : r.name;
        const icon = typeof o.icon === "string" ? o.icon : r.icon;
        if (name !== r.name) {
          if (badName(name)) fail("store_cat_bad_name");
          const twin = twinOf(name, r.id);
          if (twin) fail("store_cat_exists", twin.name);
        }
        if (!isCatIcon(icon)) fail("store_cat_bad_icon");
        r.name = name; r.icon = icon as StoreCatIcon;
        break;
      }
      case "hide": {
        const r = live().find((c) => c.id === id);
        if (!r) return fail("store_cat_gone");
        r.hidden = o.hidden as boolean;
        break;
      }
      case "archive": {
        const r = out.cats.find((c) => c.id === id);
        if (!r) return fail("store_cat_gone");
        if (r.archived_at == null) { r.archived_at = now; r.pos = null; }
        break;
      }
      case "restore": {
        const r = out.cats.find((c) => c.id === id);
        if (!r) return fail("store_cat_gone");
        if (r.archived_at != null) {
          if (live().length >= MAX_LIVE) fail("store_cat_full");
          const twin = twinOf(r.name, r.id);
          if (twin) fail("store_cat_exists", twin.name);
          const pos = slotCat(r.id, false, null);
          r.archived_at = null; r.pos = pos;
        }
        break;
      }
      case "move": {
        const r = live().find((c) => c.id === id);
        if (!r) return fail("store_cat_gone");
        r.pos = slotCat(r.id, true, after);
        break;
      }
      case "move_item": {
        if (!live().some((c) => c.id === cat)) fail("store_cat_gone");
        const m = itemsOf(cat).find((x) => x.product_id === id);
        if (!m) return fail("store_item_gone");
        m.pos = slotItem(cat, id, true, after);
        break;
      }
      case "add": {
        if (!live().some((c) => c.id === cat)) fail("store_cat_gone");
        if (ids.some((pid) => !isProduct(pid))) fail("store_item_gone");
        const n = itemsOf(cat).length;
        const fresh = new Set(ids.filter((pid) => !isMember(cat, pid)));
        if (n + fresh.size > MAX_MEMBERS) fail("store_cat_members_full");
        let at = after;
        for (const pid of ids) {
          if (isMember(cat, pid)) continue;
          const pos = slotItem(cat, null, has, at);
          out.items.push({ category_id: cat, product_id: pid, pos });
          if (has) at = pid;
        }
        break;
      }
      case "remove": {
        if (!live().some((c) => c.id === cat)) fail("store_cat_gone");
        const drop = new Set(ids);
        out.items = out.items.filter((m) => !(m.category_id === cat && drop.has(m.product_id)));
        break;
      }
    }
  }
  return out;
}

/* ── شكلُ اللقطة للنسخة التجريبية — مرآةُ store_categories_list ─────────────── */
export function snapshotOf(
  s: CatsState, clinic: string, canEdit: boolean,
  product: (id: string) => { listed: boolean } | undefined,
): StoreCatsSnapshot {
  const members: Record<string, string[]> = {};
  const counts = new Map<string, { n: number; n_listed: number }>();
  for (const c of s.cats) {
    const ids = membersOf(s, c.id).filter((pid) => product(pid));
    if (ids.length) members[c.id] = ids;
    counts.set(c.id, { n: ids.length, n_listed: ids.filter((pid) => product(pid)?.listed).length });
  }
  const order = [...liveCats(s), ...archivedCats(s)];
  return {
    clinic, seeded: s.seeded, can_edit: canEdit, members,
    cats: order.map((c) => ({ ...c, n: counts.get(c.id)?.n ?? 0, n_listed: counts.get(c.id)?.n_listed ?? 0 })),
  };
}
