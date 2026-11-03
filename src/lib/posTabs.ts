/* ============================================================================
 * خاناتُ الطبيب بشاشة البيع (0258) — القاعدةُ النقيّة (مفحوصةٌ بـ`scripts/pos-tabs-test.mjs`).
 *
 * الخانةُ: اسمٌ، وحجمُ بطاقات (صغيرة/وسط/كبيرة)، وصورٌ أو لا، وعناصرُ مرتّبة — كلُّ عنصرٍ منتجٌ أو خدمة بشكله (مربّع
 * أو مستطيل بعرض عمودين). العنصرُ مرجعٌ بالمعرّف: منتجٌ طُوي بتوأمه أو حُذف يبقى «ما عاد موجود» — لا يُباع منه، ولا
 * يُقال عنه «رصيده صفر» (الغائبُ ليس صفراً)، ولا يُمحى بصمت: المحرّرُ يقوله ويشيله الطبيبُ بيده.
 * وشكلُ الصفّ يحرسه الخادمُ بقيده (_pos_tab_items_ok) — وهذه مرآتُه: ما يرفضه الخادم لا يُرسَل.
 * ========================================================================= */
import type { Product, Service } from "@/types";

export type TileShape = "sq" | "wide";
export type TileSize = "sm" | "md" | "lg";
export interface PosTabItem { k: "p" | "s"; id: string; shape: TileShape }
export interface PosTabDraft { name: string; tile_size: TileSize; show_images: boolean; items: PosTabItem[]; sort: number }
export interface PosTab extends PosTabDraft { id: string; updated_at: string }

/** سقوفُ الخادم (0258) — وسقفُ عدد الخانات للشاشة وحدها (شريطٌ لا يتّسع لأكثر). */
export const TAB_LIMITS = { tabs: 20, items: 120, name: 40 } as const;
/** أدنى عرضٍ للعمود بكلّ حجم — الشبكةُ auto-fill فتتنفّس مع الشاشة كشبكة المنتجات. */
export const TILE_MIN: Record<TileSize, string> = { sm: "6.5rem", md: "8.5rem", lg: "11rem" };

const SIZES: readonly TileSize[] = ["sm", "md", "lg"];
const shapeErr = () => Object.assign(new Error("pos_tabs_shape"), { code: "pos_tabs_shape" });

/** الاسمُ كما يُحفظ: بلا مسافاتٍ زائدة. */
export function cleanTabName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** عنصرٌ بشكل الخادم أو null (مرآةُ _pos_tab_items_ok للعنصر الواحد). */
function itemOf(x: unknown): PosTabItem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if ((o.k !== "p" && o.k !== "s") || typeof o.id !== "string" || o.id.length < 1 || o.id.length > 64) return null;
  const shape = o.shape == null ? "sq" : o.shape;
  if (shape !== "sq" && shape !== "wide") return null;
  return { k: o.k, id: o.id, shape };
}

/** صفُّ الخادم ← خانة، أو رميٌ (pos_tabs_shape): جوابٌ مكسور لا يُرسم خانةً فاضية. */
export function readTab(raw: unknown): PosTab {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== "string" || typeof r.name !== "string" || typeof r.updated_at !== "string") throw shapeErr();
  if (!SIZES.includes(r.tile_size as TileSize) || typeof r.show_images !== "boolean" || !Array.isArray(r.items)) throw shapeErr();
  const items = r.items.map(itemOf);
  if (items.some((i) => i === null)) throw shapeErr();
  return { id: r.id, name: r.name, tile_size: r.tile_size as TileSize, show_images: r.show_images, items: items as PosTabItem[],
    sort: typeof r.sort === "number" ? r.sort : 0, updated_at: r.updated_at };
}

/** لماذا لا تُحفظ المسودّة — أو null. نفسُ قيود الخادم، فما يُرفض هناك لا يُرسَل. */
export function draftProblem(d: PosTabDraft): "name" | "items" | "size" | null {
  const n = cleanTabName(d.name);
  if (n.length < 1 || n.length > TAB_LIMITS.name) return "name";
  if (!SIZES.includes(d.tile_size)) return "size";
  if (d.items.length > TAB_LIMITS.items || d.items.some((i) => itemOf(i) === null)) return "items";
  return null;
}

export type ResolvedItem =
  | { item: PosTabItem; kind: "product"; product: Product }
  | { item: PosTabItem; kind: "service"; service: Service }
  | { item: PosTabItem; kind: "missing" };

/** العناصرُ بأصحابها من قائمة البيع وكتالوج الخدمات — بترتيبها. ما لا صاحبَ له «missing»، لا يُسقط. */
export function resolveItems(items: readonly PosTabItem[], products: readonly Product[], services: readonly Service[]): ResolvedItem[] {
  const P = new Map(products.map((p) => [p.id, p]));
  const S = new Map(services.map((s) => [s.id, s]));
  return items.map((item) => {
    if (item.k === "p") { const product = P.get(item.id); return product ? { item, kind: "product", product } : { item, kind: "missing" }; }
    const service = S.get(item.id);
    return service ? { item, kind: "service", service } : { item, kind: "missing" };
  });
}

/* ── تعديلُ العناصر (نقيّ: يرجع نسخةً جديدة) ─────────────────────────────────── */
export const hasItem = (items: readonly PosTabItem[], k: PosTabItem["k"], id: string) => items.some((i) => i.k === k && i.id === id);
/** يُضاف بآخر الخانة، ولا يتكرّر، ولا يتجاوز السقف. */
export function addItem(items: readonly PosTabItem[], k: PosTabItem["k"], id: string, shape: TileShape = "sq"): PosTabItem[] {
  if (hasItem(items, k, id) || items.length >= TAB_LIMITS.items) return [...items];
  return [...items, { k, id, shape }];
}
export function removeItemAt(items: readonly PosTabItem[], i: number): PosTabItem[] {
  return items.filter((_, j) => j !== i);
}
/** خطوةٌ للأمام أو للخلف — بطرف القائمة لا شيء. */
export function moveItem(items: readonly PosTabItem[], i: number, dir: -1 | 1): PosTabItem[] {
  const j = i + dir;
  if (i < 0 || i >= items.length || j < 0 || j >= items.length) return [...items];
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export function setShapeAt(items: readonly PosTabItem[], i: number, shape: TileShape): PosTabItem[] {
  return items.map((x, j) => (j === i ? { ...x, shape } : x));
}
export function setAllShapes(items: readonly PosTabItem[], shape: TileShape): PosTabItem[] {
  return items.map((x) => ({ ...x, shape }));
}
/** مسودّتان سواء؟ (لزرّ «احفظ»: لا كتابةَ بلا تغيير). */
export function sameDraft(a: PosTabDraft, b: PosTabDraft): boolean {
  return cleanTabName(a.name) === cleanTabName(b.name) && a.tile_size === b.tile_size && a.show_images === b.show_images
    && a.items.length === b.items.length && a.items.every((x, i) => x.k === b.items[i].k && x.id === b.items[i].id && x.shape === b.items[i].shape);
}
/** ترتيبُ الخانة الجديدة: بعد آخرها. */
export const nextSort = (tabs: readonly PosTab[]) => tabs.reduce((m, t) => Math.max(m, t.sort), -1) + 1;
