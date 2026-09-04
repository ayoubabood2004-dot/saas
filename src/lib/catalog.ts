// ============================================================================
// الكتالوج المشترك (0103) — باركود ← اسم + أسعار مرجعية، مجمَّعة من العيادات
// التي فعّلت المشاركة صراحةً.
//
// نقطة الاستعمال الحقيقية: العيادة الجديدة تمسح باركوداً ما تعرفه، فيجيها
// الاسم والأسعار جاهزة بدل ما تكتب مئة منتج بالإيد. الأسعار **مقترحة** دائماً
// — تنزل بالنموذج ليعدّلها الطبيب، ولا تُحفظ خلف ظهره.
//
// كل النتائج مجهولة الهوية (تجميع فقط، بلا أي معرّف عيادة) ومعها contributors
// حتى يقرر القارئ كم يثق: رقم من عيادة واحدة ليس «سعر السوق».
// ============================================================================
import { sb } from "./clinicSync";

export interface CatalogHit {
  barcode: string;
  name: string;
  /** null = محجوبٌ عمداً: المساهمون أقلُّ من الحدّ، فالوسيطُ سيكون سعرَ عيادةٍ
   *  بعينها لا سعرَ سوق (0153). صفرٌ ليس نائباً عنه — «٠» رقمٌ يُصدَّق. */
  sell_price: number | null;
  purchase_price: number | null;
  /** كم عيادة وراء هذا الرقم — ١ يعني مصدراً واحداً، فخذه بحذر. */
  contributors: number;
  /** كم تسمية مختلفة لنفس الباركود (يظهر عند التعارض). */
  name_variants?: number;
}

/** سعرٌ غائبٌ يبقى غائباً: `num()` القديمة كانت تقلب null إلى 0، فيقرأ الطبيبُ
 *  «بيع ٠» على أنه سعر. التمييزُ بين «لا نعرف» و«صفر» شرطٌ لصدق العرض. */
const priceOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

function toHit(r: Record<string, unknown>): CatalogHit {
  return {
    barcode: String(r.barcode ?? ""),
    name: String(r.name ?? ""),
    sell_price: priceOrNull(r.sell_price),
    purchase_price: priceOrNull(r.purchase_price),
    contributors: Math.max(1, Number(r.contributors) || 1),
    name_variants: r.name_variants === undefined ? undefined : Number(r.name_variants) || 1,
  };
}

/** باركود واحد → أفضل تطابق بالكتالوج، أو null. */
export async function catalogLookup(barcode: string): Promise<CatalogHit | null> {
  const code = barcode.trim();
  if (!code) return null;
  const client = sb();
  if (!client) return null; // ديمو / بلا خادم — ماكو كتالوج مشترك
  try {
    const { data, error } = await client.rpc("catalog_lookup", { p_barcode: code });
    // قبل ترحيل 0103 الدالة غير موجودة — صمتاً، فالميزة إضافة لا شرط.
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return row ? toHit(row) : null;
  } catch { return null; }
}

/** بحث بالاسم — الأكثر انتشاراً بين العيادات أولاً. */
export async function catalogSearch(q: string, limit = 25): Promise<CatalogHit[]> {
  const s = q.trim();
  if (!s) return [];
  const client = sb();
  if (!client) return [];
  try {
    const { data, error } = await client.rpc("catalog_search", { p_q: s, p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map(toHit);
  } catch { return []; }
}

/** حجم الكتالوج — لعرضه بالإعدادات بالأرقام لا بالكلام. */
export async function catalogStats(): Promise<{ barcodes: number; clinics: number } | null> {
  const client = sb();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("catalog_stats");
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { barcodes: Number(row.barcodes) || 0, clinics: Number(row.clinics) || 0 };
  } catch { return null; }
}
