import type { Product, StoreCatalogItem, StoreCatOp, StoreCatsSnapshot, StoreCatsState, StoreFrontCat } from "@/types";
import { applyOps, checkBatch, isListed as listedOn, liveCats, membersOf, seedCats, snapshotOf, STORE_CAT_HINTS, StoreCatError } from "./storeCatIndex";
import { getActiveClinicId } from "./clinics";
import { loadDB, saveDB } from "./demoStore";
import { effectiveCan, peekMyPermissions, type StaffRole } from "./staff";
import { matchSlug } from "./storeLib";
import { localISO, uuid } from "./utils";

/* ============================================================================
 * تصنيفاتُ المتجر بالنسخة التجريبية — مرآةُ 0233/0234 بمخزن الجهاز.
 *
 * ليست عرضاً: فحوصُ المنطق تجري عليها، فانحرافُها عن الخادم يُخفي العطلَ بدل أن يكشفه.
 * فالكتابةُ نفسُها `applyOps` (مرآةُ store_categories_apply سطراً بسطر) بنفس الرموز
 * والتلميحات، والحقوقُ نفسُها: البنيةُ للمدير والطبيب، والعضويةُ لكلّ من له إذن المتجر،
 * والمصوّرُ عضويةٌ وحدها. **والقراءةُ لا تبذر أبداً** (درسُ 0153 — seed-guard): البذرةُ
 * عند فتح المتجر (`seedOnStoreCreate` من saveStoreProfile) وبعملية init وحدهما.
 * تُحمَّل كسولةً من repoDemo عند أوّل نداء.
 * ==========================================================================*/

const activeClinic = () => getActiveClinicId() || "default";
const EMPTY: StoreCatsState = { seeded: false, cats: [], items: [] };

/** الدورُ كما تحمله جلسةُ التجريبيّ (مرآةُ auth_role/is_photographer بالخادم). */
export function demoStaffRole(): StaffRole {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as
      { raw?: { rawRole?: string; staff?: { role?: string; staffRole?: string | null } | null } } | null;
    const staffRole = s?.raw?.staff?.staffRole;
    if (staffRole === "photographer" || staffRole === "veterinarian" || staffRole === "receptionist" || staffRole === "groomer" || staffRole === "manager") return staffRole;
    const role = s?.raw?.staff?.role ?? s?.raw?.rawRole;
    return role === "doctor" ? "veterinarian" : role === "reception" ? "receptionist" : "manager";
  } catch { return "manager"; }
}
function demoEmail(): string | null {
  try { return (JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { email?: string } } | null)?.raw?.email ?? null; }
  catch { return null; }
}
/** مرآةُ staff_can('manageStore'): المديرُ نعم، وإلا استثناءُ الكادر ثم قالبُ الدور. */
export const demoCanManageStore = (): boolean => effectiveCan(demoStaffRole(), "manageStore", peekMyPermissions(demoEmail()));
/** مرآةُ can_edit بالخادم: المديرُ والطبيبُ (لا المصوّر ولو رُفع). */
const demoCanEdit = (): boolean => { const r = demoStaffRole(); return r === "manager" || r === "veterinarian"; };

/** مرآةُ `_store_listed` بتاريخ اليوم — الدالّةُ نفسُها التي يستعملها كتلوجُ «الكل» التجريبيّ. */
const isListed = (p: Pick<Product, "store_visible" | "sell_price" | "expiry_date">): boolean => listedOn(p, localISO());

function stateOf(): StoreCatsState {
  const s = loadDB().storeCats;
  return s && Array.isArray(s.cats) && Array.isArray(s.items) ? s : EMPTY;
}
const productMap = (products: Product[]) => new Map(products.filter((p) => !p.farm_id).map((p) => [p.id, p]));
const seedFrom = (products: Product[]) => (s: StoreCatsState): StoreCatsState =>
  seedCats(s, products.map((p) => ({ id: p.id, name: p.name, category: p.category ?? null, farm_id: p.farm_id ?? null, listed: isListed(p) })), uuid);

function snapshot(s: StoreCatsState, products: Product[]): StoreCatsSnapshot {
  const map = productMap(products);
  return snapshotOf(s, activeClinic(), demoCanEdit(), (id) => {
    const p = map.get(id);
    return p ? { listed: isListed(p) } : undefined;
  });
}

/** مرآةُ store_categories_list: الإذنُ ثم اللقطة — **ولا كتابةَ أبداً**. */
export function demoCatsList(): StoreCatsSnapshot {
  if (!demoCanManageStore()) throw new StoreCatError("not_authorized", undefined, "no_store_right");
  const db = loadDB();
  return snapshot(stateOf(), db.products ?? []);
}

/** مرآةُ store_categories_apply: الختمُ، ثم الإذن، ثم الدفعةُ كاملةً أو لا شيء. */
export function demoCatsApply(clinic: string, ops: StoreCatOp[]): StoreCatsSnapshot {
  if (clinic !== activeClinic()) throw new StoreCatError("clinic_switched");
  // ترتيبُ الخادم: شكلُ الدفعة (bad_ops) قبل الإذن.
  checkBatch(ops);
  if (!demoCanManageStore()) throw new StoreCatError("not_authorized", undefined, "no_store_right");
  const db = loadDB();
  const products = db.products ?? [];
  const map = productMap(products);
  const next = applyOps(stateOf(), ops, {
    canEdit: demoCanEdit(),
    isProduct: (id) => map.has(id),
    seed: seedFrom(products),
    // معرّفاتُ التجريبيّ (prod_…) ليست uuid — والتصنيفاتُ تُنشأ بـuuid() كالسحابيّ.
    isId: (x) => x.length > 0 && x.length <= 80,
  });
  db.storeCats = next;
  saveDB(db);   // حصّةٌ ممتلئة ترمي — لا «تمّ» كاذبة
  return snapshot(next, products);
}

/** فتحُ المتجر بالتجريبيّ يبذر — مرآةُ محفّز store_cats_on_store_insert (مرّةً لكلّ جهاز). */
export function seedOnStoreCreate(): void {
  const db = loadDB();
  const s = stateOf();
  if (s.seeded) return;
  db.storeCats = seedFrom(db.products ?? [])(s);
  saveDB(db);
}

/** مرآةُ cats بـstore_front (0234): حيّةٌ، غيرُ مخفيّة، وفيها مادّةٌ معروضة، بترتيب العيادة. */
export function demoFrontCats(): StoreFrontCat[] {
  const db = loadDB();
  const s = stateOf();
  const map = productMap(db.products ?? []);
  return liveCats(s).filter((c) => !c.hidden).map((c) => ({
    id: c.id, name: c.name, icon: c.icon,
    n: membersOf(s, c.id).filter((id) => { const p = map.get(id); return !!p && isListed(p); }).length,
  })).filter((c) => c.n > 0);
}

/** مرآةُ store_catalog_in (0234): أعضاءُ تصنيفٍ واحد بترتيب العيادة، وcat_gone لا قائمةَ بديلة. */
export function demoCatalogIn(slug: string, cat: string, limit = 60, offset = 0): StoreCatalogItem[] {
  const db = loadDB();
  const sp = db.storeProfile;
  const s = stateOf();
  const c = s.cats.find((x) => x.id === cat);
  if (!sp?.enabled || !matchSlug(sp.slug, slug) || !c || c.archived_at != null || c.hidden) throw new StoreCatError("cat_gone");
  const map = productMap(db.products ?? []);
  const pool = (p: Product) => (db.companySections ?? []).find((x) => x.id === p.section_id)?.pooled_stock ?? 0;
  const cap = Math.min(Math.max(limit, 1), 100);
  return membersOf(s, cat)
    .map((id) => map.get(id))
    .filter((p): p is Product => !!p && isListed(p))
    .slice(Math.max(offset, 0), Math.max(offset, 0) + cap)
    .map((p) => ({
      id: p.id, name: p.name, category: p.category ?? null, subcategory: p.subcategory ?? null,
      price: p.sell_price, descr: p.store_desc ?? null,
      available: p.stock > 0 || pool(p) > 0,
      image_path: p.image_path ?? null,
      featured: !!p.store_featured,
    }));
}

/* ── مرآةُ 0235 (O5): فتحُ المتجر ورابطُه وتشغيلُه للمدير، والباقي بإذن المتجر ─────────── */
export const OWNER_HINTS = {
  open: "\u0641\u062a\u062d \u0627\u0644\u0645\u062a\u062c\u0631 \u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u0639\u064a\u0627\u062f\u0629",
  slug: "\u062a\u063a\u064a\u064a\u0631 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062a\u062c\u0631 \u0648\u062a\u0634\u063a\u064a\u0644\u0647 \u0644\u0644\u0645\u062f\u064a\u0631",
} as const;
/** يرمي كالخادم (42501 + التلميحُ العربيّ). `before` = الصفُّ القائم (null ⇒ فتحٌ أوّل). */
export function demoStoreProfileGuard(before: { slug: string; enabled: boolean } | null, next: { slug: string; enabled: boolean }): void {
  const manager = demoStaffRole() === "manager";
  const refuse = (msg: string, hint: string): never => { throw Object.assign(new Error(msg), { code: "42501", hint }); };
  if (!before) { if (!manager) refuse("store_owner_only", OWNER_HINTS.open); return; }
  if ((before.slug !== next.slug || before.enabled !== next.enabled) && !manager) refuse("store_owner_only", OWNER_HINTS.slug);
  if (!demoCanManageStore()) refuse("not_authorized", STORE_CAT_HINTS.no_store_right);
}
