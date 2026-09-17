/* ============================================================================
 * نداءاتُ الزائر — خمسُ دوالَّ عامّة بـ`fetch` عارٍ، بلا `@supabase/supabase-js`.
 *
 * ── لماذا نسخةٌ ثانية، والقاعدةُ «لا تخترع تعريفاً موازياً» ────────────────
 * القياس: فتحُ `/s/:slug` ينزّل **٤٦٣٬٣٤٦ بايتاً مضغوطة** قبل أوّل منتج،
 * منها ٢٦٤ لقشرةِ تطبيق العيادة و٥٤ لعميل Supabase. وسببُ نزولِ القشرة أنّ
 * `Storefront` تستورد `repo`، و`repo` تستورد الإعدادات والمزامنة والتجريبيَّ
 * ونصفَ التطبيق. فزبونُ عيادةٍ عراقيةٍ على هاتفٍ رخيص يدفع ثمنَ شاشةِ الرواتب
 * والمختبر والأقفاص ليشتري شامبو قطط.
 *
 * والنداءاتُ الخمسةُ كلُّها **دوالُّ RPC عامّة ممنوحةٌ لـ`anon`** لا جداول:
 * لا جلسةَ تُدار، ولا تحديثَ رمزٍ، ولا اشتراكاتِ realtime — أي أنّ ٥٤ كيلو من
 * العميل تخدم `fetch` واحداً بأربعة رؤوس.
 *
 * ── وحارسُ الانحراف ──────────────────────────────────────────────────────
 * نسخةٌ ثانيةٌ تنحرف أخطرُ من نسخةٍ ثقيلة. فكلُّ دالّةٍ هنا **منسوخةٌ حرفياً**
 * عن نصف `repo` السحابيّ (اسمُ الدالّة، وأسماءُ الوسائط، وتشكيلُ الناتج)،
 * و`scripts/store-api-parity.mjs` يشغّل النسختين على نفس المدخل وردِّ الخادم
 * ويطابق: الاسمَ والوسائطَ والناتج. فأيُّ تعديلٍ بطرفٍ دون الآخر يفشّل البناء.
 *
 * ── والتجريبيّ ───────────────────────────────────────────────────────────
 * حين لا مفاتيحَ بالبيئة (تطويرٌ محلّيّ بلا سحابة) يُستورد `repo` **ديناميكياً**
 * فيبقى بحزمةٍ لا تُطلب أبداً بالإنتاج — يعمل التجريبيُّ ولا يدفع الزبونُ ثمنه.
 * ==========================================================================*/
import type { StoreCatalogItem, StoreFrontInfo, StoreTrackInfo, JourneyPublicView } from "@/types";
import { productImageUrl } from "./storeLib";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const SUPA_URL: string = (env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ANON: string = env.VITE_SUPABASE_ANON_KEY ?? "";
const CLOUD = !!SUPA_URL && !!ANON;

/** `repo` عند غياب المفاتيح فقط — استيرادٌ ديناميكيّ كي لا يدخل حزمةَ الزائر. */
const demoRepo = async () => (await import("./repo")).repo;

/**
 * نداءُ RPC عامّ. يرمي بنصّ الخادم كما ترمي `repo` — الشاشاتُ تعرض «أعد
 * المحاولة»، وقائمةٌ ناقصةٌ بصمتٍ أخطرُ من خطأٍ ظاهر (قاعدة المشروع).
 */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = ((await res.json()) as { message?: string })?.message || msg; } catch { /* نصُّ الحالة يكفي */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

type RawFront = { ok?: boolean } & StoreFrontInfo;

/* تشكيلُ الناتج بموضعٍ واحد: يستعمله النداءُ والبذرةُ معاً — نسختان تنحرفان. */
function shapeFront(d: RawFront | null): StoreFrontInfo | null {
  if (!d?.ok) return null;
  return {
    name: d.name, logo_url: productImageUrl(d.logo_url), phone: d.phone ?? null, whatsapp: d.whatsapp ?? null,
    facebook: d.facebook ?? null, instagram: d.instagram ?? null, bio: d.bio ?? null,
    delivery_fee: Number(d.delivery_fee) || 0, min_order: Number(d.min_order) || 0,
  };
}
function shapeCatalog(rows: StoreCatalogItem[] | null | undefined): StoreCatalogItem[] {
  return (rows ?? []).map((r) => ({ ...r, price: Number(r.price) || 0 }));
}

/**
 * بذرةُ الصفحة (`#store-boot`) — ما حقنته الحافةُ بالمستند قبل أن تنزل الحزمة.
 *
 * تُقرأ **مرّةً واحدة**: العنصرُ جزءٌ من مستندٍ مخبوءٍ خمسَ دقائق، فهو صورةٌ
 * للحظةٍ مضت لا مصدرُ حقيقةٍ متجدّد. الواجهةُ ترسمها فوراً ثمّ تستبدلها بما
 * يصل من الخادم — فالزبونُ يرى رفّاً بأوّل رسمٍ بدل دوّامةٍ تنتظر ذهاباً وإياباً.
 */
let bootRead = false;
/** هل رسمت الحافةُ رفّاً بهذا المستند؟ سؤالٌ بلا استهلاك (للتصيير لا للبيانات). */
export const pagePainted = (): boolean =>
  typeof document !== "undefined" && !!document.getElementById("store-boot");
export function readStoreBoot(slug: string): { front: StoreFrontInfo; catalog: StoreCatalogItem[] } | null {
  if (bootRead || typeof document === "undefined") return null;
  bootRead = true;
  try {
    const el = document.getElementById("store-boot");
    if (!el?.textContent) return null;
    const d = JSON.parse(el.textContent) as { slug?: string; front?: RawFront; catalog?: StoreCatalogItem[] };
    // السلاگُ يُطابَق: مستندٌ مخبوءٌ لعيادةٍ أخرى أسوأُ من لا بذرة.
    if (!d?.slug || d.slug !== slug || !d.front?.ok || !Array.isArray(d.catalog)) return null;
    return { front: shapeFront(d.front)!, catalog: shapeCatalog(d.catalog) };
  } catch { return null; }
}

export const storeApi = {
  async storeFrontPublic(slug: string): Promise<StoreFrontInfo | null> {
    if (!CLOUD) return (await demoRepo()).storeFrontPublic(slug);
    return shapeFront(await rpc<RawFront | null>("store_front", { p_slug: slug }));
  },

  async storeCatalogPublic(slug: string, limit = 60, offset = 0): Promise<StoreCatalogItem[]> {
    if (!CLOUD) return (await demoRepo()).storeCatalogPublic(slug, limit, offset);
    // ما قبل 0096 الدالة بوسيطة واحدة — نعيد النداء بلا صفحات بدل صفحة فارغة.
    let rows: StoreCatalogItem[];
    try {
      rows = await rpc<StoreCatalogItem[]>("store_catalog", { p_slug: slug, p_limit: limit, p_offset: offset });
    } catch (e) {
      if (offset !== 0) throw e;
      rows = await rpc<StoreCatalogItem[]>("store_catalog", { p_slug: slug });
    }
    return shapeCatalog(rows);
  },

  async trackStoreOrder(slug: string, orderNo: string, phone: string): Promise<StoreTrackInfo | null> {
    if (!CLOUD) return (await demoRepo()).trackStoreOrder(slug, orderNo, phone);
    const rows = await rpc<StoreTrackInfo[] | null>("store_order_track", { p_slug: slug, p_order_no: orderNo, p_phone: phone });
    return rows?.[0] ?? null;
  },

  async placeStoreOrder(
    slug: string,
    info: { name: string; phone: string; address?: string; note?: string },
    items: { product_id: string; qty: number }[],
  ): Promise<{ ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number }> {
    if (!CLOUD) return (await demoRepo()).placeStoreOrder(slug, info, items);
    const d = await rpc<{ ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number } | null>(
      "store_place_order",
      { p_slug: slug, p_name: info.name, p_phone: info.phone, p_address: info.address ?? "", p_note: info.note ?? "", p_items: items },
    );
    return d ?? { ok: false, error: "unknown" };
  },

  async trackJourneyPublic(token: string): Promise<JourneyPublicView | null> {
    if (!CLOUD) return (await demoRepo()).trackJourneyPublic(token);
    const d = await rpc<({ ok?: boolean } & JourneyPublicView) | null>("track_journey", { p_token: token });
    if (!d?.ok) return null;
    return {
      pet_name: d.pet_name, clinic_name: d.clinic_name, clinic_phone: d.clinic_phone ?? null,
      kind: d.kind, stage: d.stage, status: d.status, started_at: d.started_at,
      events: d.events ?? [],
    };
  },

  async reactJourneyPublic(token: string, eventId: string, emoji: string): Promise<boolean> {
    if (!CLOUD) return (await demoRepo()).reactJourneyPublic(token, eventId, emoji);
    // تفاعلٌ يفشل لا يُفشِل الصفحة — مرآةُ `repo` حرفياً (ترجع false ولا ترمي).
    try {
      const d = await rpc<{ ok?: boolean } | null>("react_journey", { p_token: token, p_event: eventId, p_emoji: emoji });
      return !!d?.ok;
    } catch { return false; }
  },
};
