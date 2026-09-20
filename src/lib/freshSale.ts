/**
 * «هل يُباع؟» حين تقول القائمةُ لا — قراراتٌ صِرفة خارج المكوّن لتُفحص بسلوكها.
 *
 * شاشةُ البيع تقرّر برصيد القائمة، والقائمةُ لقطة. فحين تقول «لا» (صفرٌ، أو سطرٌ
 * عند سقفه) يُسأل الخادمُ قبل الرفض (خطة الطزاجة، ط٢). وهنا ثلاثةُ أشياء كان
 * السؤالُ يخطئها فيقول للعيادة ما ليس صحيحاً — وهو أخطرُ من الخطأ الظاهر:
 *
 *  ١) **رصيدُ الكاشير ليس رصيدَ الصفّ.** قائمةُ الكاشير تضيف لكلّ منتجٍ حوضَ قسمه
 *     (المخزون المجمَّع)، والخادمُ يبيع منه فعلاً (`deduct_stock_pooled`، 0066:
 *     الصفُّ أوّلاً ثم الحوض، لأيّ منتجٍ بالقسم). والسؤالُ كان يرجع الصفَّ الخامّ
 *     وحده — فمنتجٌ صفُّه صفرٌ وحوضُ قسمه خمسون يُقال عنه «موجود بس رصيده صفر —
 *     زيد رصيده»: دعوةٌ صريحة لإدخال بضاعةٍ موجودة مرّتين. فالمعادلةُ هنا
 *     **مرّةً واحدة** (`sellableRow`)، والقائمةُ والسؤالُ يمرّان منها.
 *
 *  ٢) **صفٌّ غاب ليس صفّاً رصيدُه صفر.** بعد طيّ توأمين (`merge_products`) يُحذف
 *     الصفُّ المطويّ ويصير رمزُه رمزاً إضافياً للباقي برصيدهما معاً. القائمةُ
 *     القديمة ما زالت تحمل الصفَّ المطويّ، والسؤالُ بمعرّفه لا يلقى شيئاً — وكان
 *     «لا شيء» يُقرأ «رصيده صفر». فالغائبُ يُسأل عنه برمزه (كما كان المسحُ يسأل قبل
 *     ط٢)، فيُلقى الباقي ويُباع؛ وإن لم يُلقَ شيءٌ قيل «ما عاد موجوداً» لا «رصيده صفر».
 *
 *  ٣) **السقفُ حكمُ صفرٍ أيضاً.** سطرٌ بالسلّة عند سقفه يقول «المتوفّر ١ فقط وكلُّه
 *     بالسلّة» — وهذا «الباقي صفر» من لقطةٍ محلّية. فالسؤالُ يُطرح حين تُرفض
 *     الإضافةُ أو تُقصّ، لا حين يكون الصفُّ صفراً فقط.
 */
import type { CompanySection, Product } from "@/types";
import { unitCap, zeroStockVerdict, type StockRow } from "@/lib/cartCap";
import { sellableRow } from "@/lib/sellable";

/* ١) رصيدُ الكاشير: `sellable.ts` — المعادلةُ الوحيدة (الصفُّ + حوضُ قسمه). */

/* ── ٢) سؤالُ الخادم ───────────────────────────────────────────────────── */

/** جوابُ الخادم عن منتجٍ بعينه. `row` خامّ (رصيدُ صفّه وحده)، و`pool` حوضُ قسمه. */
export type FreshAnswer =
  /** وُجد. `replaces` = معرّفُ صفٍّ غاب فوُجد مكانه هذا برمزه (طيُّ توأمين). */
  | { kind: "row"; row: Product; pool: number; replaces?: string }
  /** لا بمعرّفه ولا برمزه — انحذف (أو طُوي بلا رمز). */
  | { kind: "gone"; id: string }
  /** ما وصلنا الخادم — لا نعرف. غيرُ «صفر» وغيرُ «غاب». */
  | { kind: "unreachable" };

export type FreshDeps = {
  byId: (id: string) => Promise<Product | undefined>;
  byCode: (code: string) => Promise<Product | undefined>;
  poolOf: (sectionId: string) => Promise<number>;
};

/**
 * يسأل الخادمَ عن منتجٍ من القائمة: بمعرّفه، ثم — إن غاب — برمزه.
 * `code` الرمزُ الممسوح إن وُجد (المسحُ يعرف ما مُسح)، وإلا رمزُ الصفّ نفسه (الكرت).
 * لا يرمي: الفشلُ جوابٌ اسمه `unreachable`.
 */
export async function askFresh(product: Pick<Product, "id" | "barcode">, code: string | null | undefined, deps: FreshDeps): Promise<FreshAnswer> {
  try {
    let row = await deps.byId(product.id);
    let replaces: string | undefined;
    if (!row) {
      const c = (code ?? "").trim() || (product.barcode ?? "").trim();
      const found = c ? await deps.byCode(c) : undefined;
      if (!found) return { kind: "gone", id: product.id };
      row = found;
      if (found.id !== product.id) replaces = product.id;
    }
    const pool = row.section_id ? await deps.poolOf(row.section_id) : 0;
    return { kind: "row", row, pool, ...(replaces ? { replaces } : {}) };
  } catch {
    return { kind: "unreachable" };
  }
}

/* ── ٣) الحكم ─────────────────────────────────────────────────────────── */

/** ما يلزم من سطر السلّة القائم لحساب ما بقي. */
export type CartSide = { qty: number; saleUnit?: "box" | "sub" } | null | undefined;

/**
 * كم يُضاف بعدُ من هذا المنتج **برصيد هذا الصفّ**، بوحدة السطر القائم (أو وحدةِ
 * سطرٍ جديد: المفردُ إن لم تبقَ علبةٌ كاملة — كما يفتحه `addProduct`).
 * المجمَّعُ بلا سقفٍ محلّيّ (الخادمُ يخصم من حوض القسم ويقصّ).
 */
export function addRoom(p: StockRow, line?: CartSide): number {
  if (p.pooled) return Infinity;
  const hasSub = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
  const saleUnit = line?.saleUnit ?? (hasSub && Math.floor(p.stock ?? 0) < 1 ? "sub" : "box");
  const cap = unitCap({ stock: p.stock ?? 0, byWeight: !!p.sold_by_weight, saleUnit, unitsPerBox: p.units_per_box ?? null });
  return cap - (line?.qty ?? 0);
}

/**
 * هل يُسأل الخادمُ قبل هذه الإضافة؟ حين يرفضها رصيدُ القائمة أو يقصّها — صفرٌ
 * بالصفّ، أو سطرٌ بلغ سقفه، أو مضاعِفٌ أكبرُ من الباقي. لا الراجعُ ولا المجمَّع.
 * الموزونُ يُسأل عنه عند الصفر وحده: منتقي الوزن نفسُه يقول سقفَه بالكيلو.
 */
export function needsServerCheck(p: StockRow, line: CartSide, n: number, retMode = false): boolean {
  if (retMode || p.pooled) return false;
  if (p.sold_by_weight) return (p.stock ?? 0) <= 0;
  return addRoom(p, line) < n;
}

export type FreshVerdict =
  /** بِعْ بالصفّ الطازج (رصيدُ الكاشير) — والسقفُ يُقال إن بقي أقلَّ من المطلوب. */
  | "sell-fresh"
  /** ما وصلنا الخادم، والقائمةُ نفسُها تسمح بشيء ⇒ يُضاف ما تسمح به كما قبل. */
  | "sell-local"
  /** سألنا وأجاب: صفرٌ مؤكَّد ⇒ «زيد رصيده من المخزن». */
  | "refuse-confirmed"
  /** ما وصلنا الخادم ولا شيءَ بالقائمة ⇒ «صفرٌ بآخر تحديثٍ عندنا». */
  | "refuse-stale"
  /** ما وصلنا الخادم والسطرُ عند سقف القائمة ⇒ «المتوفّر N بآخر تحديثٍ عندنا». */
  | "cap-stale"
  /** لا بمعرّفه ولا برمزه ⇒ «ما عاد موجوداً»، لا «رصيده صفر». */
  | "refuse-gone";

/**
 * الحكمُ بعد الجواب. `inCart` كميةُ السطر القائم؛ `localRoom` ما تسمح به القائمة بعده.
 * `sellable` صفُّ الكاشير الطازج (الصفُّ + حوضُ قسمه) — به يُباع ويُرقَّع.
 */
export function freshVerdict(
  ans: FreshAnswer,
  s: { inCart: number; localRoom: number; retMode?: boolean },
): { verdict: FreshVerdict; sellable?: Product } {
  if (ans.kind === "gone") return { verdict: "refuse-gone" };
  if (ans.kind === "unreachable") {
    if (s.localRoom >= 1) return { verdict: "sell-local" };
    return { verdict: s.inCart > 0 ? "cap-stale" : "refuse-stale" };
  }
  const sellable = sellableRow(ans.row, ans.pool);
  // سطرٌ قائم: الإضافةُ تُحسب على الرصيد الطازج، و`bump` تقول السقفَ إن قصّ.
  if (s.inCart > 0) return { verdict: "sell-fresh", sellable };
  const v = zeroStockVerdict(sellable, true, !!s.retMode);
  return { verdict: v === "sell-fresh" ? "sell-fresh" : "refuse-confirmed", sellable };
}

/* ── ترقيعُ القائمة بالجواب ────────────────────────────────────────────── */

/** ما تعرفه الصفحةُ من جوابٍ طازج — لترقّع قائمتها **بلا تجديد عمرها**. */
export type FreshPatch =
  | { kind: "row"; row: Product; pool: number; replaces?: string }
  | { kind: "gone"; id: string };

function upsert(list: Product[], row: Product, drop?: string): Product[] {
  const base = drop ? list.filter((x) => x.id !== drop) : list;
  return base.some((x) => x.id === row.id)
    ? base.map((x) => (x.id === row.id ? { ...x, ...row } : x))
    : [...base, row];
}

/** قائمةُ كاشير (رصيدُها رصيدُ الكاشير): الصفُّ الطازج بحوضه، والغائبُ يُرفع. */
export function patchSellableList(list: Product[], patch: FreshPatch): Product[] {
  if (patch.kind === "gone") return list.filter((x) => x.id !== patch.id);
  return upsert(list, sellableRow(patch.row, patch.pool), patch.replaces);
}

/** قائمةُ مخزن (رصيدُها رصيدُ الصفّ): الصفُّ الطازجُ خامّاً، والغائبُ يُرفع. */
export function patchRawList(list: Product[], patch: FreshPatch): Product[] {
  if (patch.kind === "gone") return list.filter((x) => x.id !== patch.id);
  return upsert(list, patch.row, patch.replaces);
}

/** أقسامُ المخزن بحوض القسم الطازج — فكلُّ منتجٍ بالقسم يرى الرقمَ نفسه. */
export function patchSections<S extends Pick<CompanySection, "id" | "pooled_stock">>(sections: S[], patch: FreshPatch): S[] {
  if (patch.kind !== "row" || !patch.row.section_id) return sections;
  const id = patch.row.section_id;
  return sections.map((s) => (s.id === id ? { ...s, pooled_stock: patch.pool } : s));
}
