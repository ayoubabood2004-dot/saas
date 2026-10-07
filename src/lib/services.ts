// Clinic-managed catalogue of billable non-barcode SERVICES (CBC, X-Ray, consults,
// grooming…), grouped into custom categories. Persisted to Supabase (table
// clinic_services + clinic_service_categories, isolated by clinic_id =
// auth_clinic()), with an in-memory cache so the synchronous getters below keep
// working and a localStorage mirror for demo/offline. The sale itself still flows
// through the normal invoice pipeline (a service is a line item, no product_id).
import { getActiveClinicId } from "./clinics";
import { uuid, normalizeCode, matchCode } from "./utils";
import { sb, cloudWrite, registerHydrator, registerReset, isConfigReadOnly } from "./clinicSync";
import type { ServiceCategory, Service, ServiceCatalog } from "@/types";

const keyName = () => `vp_services_${getActiveClinicId()}`;

let cache: ServiceCatalog | null = null;

/** Starter catalogue so a new clinic (and the demo) has services out of the box. */
function seedCatalog(): ServiceCatalog {
  const lab = uuid(), img = uuid(), con = uuid(), grm = uuid(), srg = uuid();
  return {
    categories: [
      { id: lab, name: "المختبر" },
      { id: img, name: "الأشعة" },
      { id: con, name: "الاستشاريات" },
      { id: grm, name: "حلاقة وعناية" },
      { id: srg, name: "العمليات الجراحية" },
    ],
    services: [
      // بيع عملية من الكاشير يسجّلها تلقائياً في طبلة الحيوان وسجل العمليات.
      { id: uuid(), category_id: srg, name: "عملية قيصرية", price: 150000 },
      { id: uuid(), category_id: srg, name: "تعقيم أنثى", price: 100000 },
      { id: uuid(), category_id: srg, name: "تعقيم ذكر", price: 75000 },
      { id: uuid(), category_id: lab, name: "تحليل دم شامل (CBC)", price: 25000 },
      { id: uuid(), category_id: lab, name: "تحاليل كيمياء الدم", price: 35000 },
      { id: uuid(), category_id: lab, name: "تحليل بول", price: 15000 },
      { id: uuid(), category_id: lab, name: "فحص براز", price: 10000 },
      { id: uuid(), category_id: img, name: "أشعة — لقطة واحدة", price: 30000 },
      { id: uuid(), category_id: img, name: "أشعة — لقطتان", price: 50000 },
      { id: uuid(), category_id: img, name: "سونار — بطني", price: 60000 },
      { id: uuid(), category_id: con, name: "فحص عام", price: 15000 },
      { id: uuid(), category_id: con, name: "مراجعة", price: 10000 },
      { id: uuid(), category_id: con, name: "استشارة طارئة", price: 40000 },
      { id: uuid(), category_id: grm, name: "حلاقة كاملة", price: 25000 },
      { id: uuid(), category_id: grm, name: "قص أظافر", price: 5000 },
    ],
  };
}

function readLocal(): ServiceCatalog {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) {
      const parsed = JSON.parse(raw) as ServiceCatalog;
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.services)) return parsed;
    }
  } catch { /* ignore */ }
  const fresh = seedCatalog();
  saveLocal(fresh);
  return fresh;
}

function saveLocal(c: ServiceCatalog) {
  try { localStorage.setItem(keyName(), JSON.stringify(c)); } catch { /* ignore */ }
}

/** Push a whole catalogue to Supabase (used for first-time migration / seeding). */
async function pushCatalog(c: ServiceCatalog) {
  const client = sb();
  if (!client) return;
  if (c.categories.length) await client.from("clinic_service_categories").insert(c.categories.map((x) => ({ id: x.id, name: x.name })));
  if (c.services.length) {
    const withRef = c.services.map((s) => ({ id: s.id, category_id: s.category_id, name: s.name, price: s.price, surgery_ref: s.surgery_ref ?? null, barcode: s.barcode ?? null, cost: s.cost ?? null }));
    const r = await client.from("clinic_services").insert(withRef as never[]);
    // قبل 0074/0102/0120 قد يغيب surgery_ref أو barcode أو cost — أعد المحاولة
    // بالأعمدة الأساسية بدل ما يضيع الكتالوج كله بسبب عمود واحد.
    if (r.error && /surgery_ref|barcode|cost/i.test(r.error.message)) await client.from("clinic_services").insert(c.services.map((s) => ({ id: s.id, category_id: s.category_id, name: s.name, price: s.price })) as never[]);
  }
}

export async function hydrateServices(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    let [cats, svcs] = await Promise.all([
      client.from("clinic_service_categories").select("id,name").order("created_at"),
      client.from("clinic_services").select("id,category_id,name,price,surgery_ref,barcode,cost").order("created_at"),
    ]);
    // قبل 0074/0102/0120: العمود غير موجود → أعد الجلب بدونه بدلاً من فقدان المزامنة كلها.
    if (svcs.error && /\bcost\b/i.test(svcs.error.message)) {
      svcs = (await client.from("clinic_services").select("id,category_id,name,price,surgery_ref,barcode").order("created_at")) as unknown as typeof svcs;
    }
    if (svcs.error && /barcode/i.test(svcs.error.message)) {
      svcs = (await client.from("clinic_services").select("id,category_id,name,price,surgery_ref").order("created_at")) as unknown as typeof svcs;
    }
    if (svcs.error && /surgery_ref/i.test(svcs.error.message)) {
      svcs = (await client.from("clinic_services").select("id,category_id,name,price").order("created_at")) as unknown as typeof svcs;
    }
    if (cats.error) throw cats.error;
    if (svcs.error) throw svcs.error;
    let next: ServiceCatalog = {
      categories: (cats.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
      services: (svcs.data ?? []).map((s) => ({ id: s.id as string, category_id: s.category_id as string, name: s.name as string, price: Number(s.price), surgery_ref: (s as { surgery_ref?: string | null }).surgery_ref ?? null, barcode: (s as { barcode?: string | null }).barcode ?? null, cost: (s as { cost?: number | null }).cost != null ? Number((s as { cost?: number | null }).cost) : null })),
    };
    // First run on a live backend → migrate existing local data (or seed) up.
    if (next.categories.length === 0 && next.services.length === 0) {
      next = readLocal();
      await pushCatalog(next);
    }
    cache = next;
    saveLocal(next);
  } catch {
    cache = readLocal(); // backend unreachable → behave exactly as offline
  }
}
registerHydrator(hydrateServices);
registerReset(() => { cache = null; });

export function getServiceCatalog(): ServiceCatalog {
  return cache ?? readLocal();
}

function commit(c: ServiceCatalog) { cache = c; saveLocal(c); }

export function addServiceCategory(name: string): ServiceCategory | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  if (c.categories.some((x) => x.name.toLowerCase() === clean.toLowerCase())) return null;
  const cat: ServiceCategory = { id: uuid(), name: clean };
  commit({ ...c, categories: [...c.categories, cat] });
  cloudWrite(() => sb()!.from("clinic_service_categories").insert({ id: cat.id, name: cat.name }), "service-category-add");
  return cat;
}

export function removeServiceCategory(id: string) {
  const c = getServiceCatalog();
  commit({ categories: c.categories.filter((x) => x.id !== id), services: c.services.filter((s) => s.category_id !== id) });
  // FK on_delete cascade removes the category's services in the DB too.
  cloudWrite(() => sb()!.from("clinic_service_categories").delete().eq("id", id), "service-category-del");
}

export function addService(categoryId: string, name: string, price: number, surgeryRef?: string | null, barcode?: string | null, cost?: number | null): Service | null {
  const clean = name.trim();
  if (!clean) return null;
  const c = getServiceCatalog();
  const code = cleanBarcode(barcode);
  const cleanCost = cost != null && Number.isFinite(cost) && cost > 0 ? Math.round(cost * 100) / 100 : null;
  const svc: Service = { id: uuid(), category_id: categoryId, name: clean, price: Math.max(0, Math.round(price * 100) / 100) || 0, surgery_ref: surgeryRef ?? null, barcode: code, cost: cleanCost };
  commit({ ...c, services: [...c.services, svc] });
  cloudWrite(async () => {
    const base: Record<string, unknown> = { id: svc.id, category_id: svc.category_id, name: svc.name, price: svc.price };
    // قبل ترحيلات 0074/0102/0120 قد تنقص أعمدة — أعد المحاولة
    // بالأعمدة الأساسية كي لا تضيع الخدمة بسبب عمود لم يُرحّل بعد.
    const row: Record<string, unknown> = { ...base };
    if (svc.surgery_ref) row.surgery_ref = svc.surgery_ref;
    if (svc.barcode) row.barcode = svc.barcode;
    if (svc.cost != null) row.cost = svc.cost;
    const r = await sb()!.from("clinic_services").insert(row as never);
    if (r.error && /surgery_ref|barcode|cost/i.test(r.error.message)) return sb()!.from("clinic_services").insert(base as never);
    return r;
  }, "service-add");
  return svc;
}

/** الباركود نصّي دائماً: قد يبدأ بصفر، والرقمنة تبتلع الصفر البادئ فيتحوّل
 *  الرمز لرمز آخر. وفاضي ⇒ null (لا سلسلة فارغة، حتى لا تتصادم خدمتان «بلا
 *  باركود» على الفهرس الفريد).
 *
 *  **والتطبيعُ من نفس مصدر المنتجات**: كانت تحذف كلَّ ما ليس لاتينياً، فـ
 *  `cleanBarcode("٧٧٠٩٩")` ترجع سلسلةً فارغة ⇒ null ⇒ الخدمةُ «غير موجودة»
 *  وتسقط المسحةُ إلى «الباركود مو موجود بمخزنك». ومسارُ المنتجات يترجم
 *  الأرقامَ الشرقية ويطوي الحالة — وتطبيعُ مسارٍ دون أخيه هو الصنفُ الذي
 *  تحرّمه CLAUDE.md §٣ بالنصّ: يفشل بصمتٍ ويبدو أنه يعمل. */
function cleanBarcode(v: string | null | undefined): string | null {
  // `normalizeCode` تترجم الأرقامَ الشرقية والفارسية وتشيل الخفيّ والمسافات،
  // ثم نُبقي ما يصلح رمزاً مطبوعاً. الحالةُ تُحفظ كما كتبها صاحبُها.
  const s = normalizeCode(v).replace(/[^0-9A-Za-z-]/g, "");
  return s || null;
}

/** مفتاحُ المطابقة — الطرفان يمرّان منه: مطبَّعٌ ومطويُّ الحالة (w90 = W90). */
const svcKey = (v: string | null | undefined): string => matchCode(cleanBarcode(v) ?? "");

/** خدمة برمز معيّن — يستعملها الكاشير عند مسح باركود لا يطابق أي منتج. */
export function findServiceByBarcode(code: string): Service | null {
  const want = svcKey(code);
  if (!want) return null;
  return getServiceCatalog().services.find((s) => s.barcode && svcKey(s.barcode) === want) ?? null;
}

/** هل هذا الرمز مستعمل من خدمة ثانية؟ (منع التصادم قبل الحفظ) */
export function serviceBarcodeTaken(code: string, exceptId?: string): boolean {
  const want = svcKey(code);
  if (!want) return false;
  return getServiceCatalog().services.some((s) => s.id !== exceptId && svcKey(s.barcode) === want);
}

export function updateService(id: string, patch: Partial<Pick<Service, "name" | "price" | "category_id" | "barcode" | "cost">>) {
  const c = getServiceCatalog();
  const s = c.services.find((x) => x.id === id);
  if (!s) return;
  const next: Service = {
    ...s,
    name: patch.name !== undefined ? (patch.name.trim() || s.name) : s.name,
    price: patch.price !== undefined ? (Math.max(0, Math.round(patch.price * 100) / 100) || 0) : s.price,
    category_id: patch.category_id ?? s.category_id,
    barcode: patch.barcode !== undefined ? cleanBarcode(patch.barcode) : (s.barcode ?? null),
    cost: patch.cost !== undefined
      ? (patch.cost != null && Number.isFinite(patch.cost) && patch.cost > 0 ? Math.round(patch.cost * 100) / 100 : null)
      : (s.cost ?? null),
  };
  commit({ ...c, services: c.services.map((x) => (x.id === id ? next : x)) });
  /* **ما تغيّر وحده** يُرسل (0226): كان التعديلُ يرسل الاسمَ والسعرَ والصنفَ معاً من
   * ذاكرة الجهاز — فتعديلُ باركود خدمةٍ على جهازٍ حمّل الكتالوجَ صباحاً كان يُرجع
   * سعرَها لِما قبل رفع الأسعار بصمت. والسعرُ نفسُه لا يمرّ من هنا: له
   * `updateServicePrice` بالمقارنة ثمّ التبديل. */
  const sent: Record<string, unknown> = {};
  if (patch.name !== undefined && next.name !== s.name) sent.name = next.name;
  if (patch.category_id !== undefined && next.category_id !== s.category_id) sent.category_id = next.category_id;
  if (patch.price !== undefined && next.price !== s.price) sent.price = next.price;
  const extra: Record<string, unknown> = {};
  if (patch.barcode !== undefined && next.barcode !== (s.barcode ?? null)) extra.barcode = next.barcode;
  if (patch.cost !== undefined && next.cost !== (s.cost ?? null)) extra.cost = next.cost;
  if (!Object.keys(sent).length && !Object.keys(extra).length) return;
  cloudWrite(async () => {
    const r = await sb()!.from("clinic_services").update({ ...sent, ...extra }).eq("id", id);
    // قبل 0102/0120 قد يغيب barcode أو cost — احفظ الباقي بدل ما يفشل التعديل كله.
    if (r.error && /barcode|cost/i.test(r.error.message) && Object.keys(sent).length) return sb()!.from("clinic_services").update(sent).eq("id", id);
    return r;
  }, "service-update");
}

/** خطأُ «السعرُ تغيّر من جهازٍ آخر» — يحمل السعرَ الحاليّ ليُقال للمستخدم. */
export class ServicePriceMoved extends Error {
  constructor(public current: number | null) { super("service_price_moved"); }
}

/**
 * سعرُ خدمةٍ بالمقارنة ثمّ التبديل (0226): يُكتب **فقط** إن كان السعرُ بالقاعدة ما زال
 * `expected` (ما رآه المستخدم حين فتح الحقل). حقلٌ فُتح قبل رفع الأسعار وأُغلق بعده
 * كان يكتب سعرَ الصبح فوق الرفع بصمت (`onBlur` بلا فحص، و`cloudWrite` لا يعدّ صفوفاً).
 * صفرُ صفوفٍ ⇒ `ServicePriceMoved` بالسعر الحاليّ، والذاكرةُ تُحدَّث به.
 */
export async function updateServicePrice(id: string, next: number, expected: number): Promise<void> {
  // اشتراكٌ منتهٍ: لا كتابة — كبقيّة إعدادات العيادة (`cloudWrite`)، وكان هذا البابُ وحده يتجاوزه.
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  const price = Math.max(0, Math.round(next * 100) / 100) || 0;
  /* حفظان متتاليان على نفس الخدمة (Enter ثمّ تعديلٌ قبل وصول الجواب): الثاني يحمل «ما رآه»
   * من نفس الشاشة — أي ما قبل الأوّل — فيُرفض بـ«تغيّر من جهاز ثاني» وهو تعديلُ المستخدم
   * نفسِه. فالحفظُ لكلّ خدمةٍ بالدور، وما كتبه السابقُ من نفس «ما رآه» هو ما يُتوقَّع بعده. */
  const prev = pricePending.get(id);
  const run = (async () => {
    let exp = expected;
    if (prev) {
      const done = await prev.catch(() => null);
      if (done && done.from === exp) exp = done.to;
    }
    await writeServicePrice(id, price, exp);
    return { from: exp, to: price };
  })();
  pricePending.set(id, run);
  try { await run; } finally { if (pricePending.get(id) === run) pricePending.delete(id); }
}
const pricePending = new Map<string, Promise<{ from: number; to: number }>>();

async function writeServicePrice(id: string, price: number, expected: number): Promise<void> {
  const c = getServiceCatalog();
  const s = c.services.find((x) => x.id === id);
  if (!s) throw new ServicePriceMoved(null);
  const client = sb();
  if (!client) {
    if (s.price !== expected) throw new ServicePriceMoved(s.price);
    commit({ ...c, services: c.services.map((x) => (x.id === id ? { ...x, price } : x)) });
    return;
  }
  const r = await client.from("clinic_services").update({ price }).eq("id", id).eq("price", expected).select("id,price");
  if (r.error) throw r.error;
  if (!r.data || r.data.length === 0) {
    const cur = await client.from("clinic_services").select("price").eq("id", id).maybeSingle();
    const now = cur.data ? Number((cur.data as { price: number }).price) : null;
    if (now != null) setServicePricesLocal({ [id]: now });
    throw new ServicePriceMoved(now);
  }
  setServicePricesLocal({ [id]: price });
}

/** أسعارٌ نزلت من الخادم (رفعٌ أو إرجاع) ⇒ الذاكرةُ والمرآةُ المحلّية، بلا كتابةٍ سحابية. */
export function setServicePricesLocal(prices: Record<string, number>) {
  const c = getServiceCatalog();
  if (!c.services.some((x) => x.id in prices)) return;
  commit({ ...c, services: c.services.map((x) => (x.id in prices ? { ...x, price: prices[x.id] } : x)) });
}

/**
 * قراءةٌ طازجة للكتالوج **ترمي على الفشل** ولا تكتب شيئاً (0226). `hydrateServices`
 * تبلع الخطأ وترجع للنسخة المحلّية (القديمة) وقد تدفع بذرةً للقاعدة — فلو استُعملت بعد
 * رفع الأسعار لقالت «تحدّث» والكاشيرُ ما زال يبيع بالقديم. هذه تقول «فشل» فتبقى البوّابة.
 */
export async function refreshServices(): Promise<ServiceCatalog> {
  const client = sb();
  if (!client) { cache = readLocal(); return cache; }
  const [cats, svcs] = await Promise.all([
    client.from("clinic_service_categories").select("id,name").order("created_at"),
    client.from("clinic_services").select("id,category_id,name,price,surgery_ref,barcode,cost").order("created_at"),
  ]);
  if (cats.error) throw cats.error;
  if (svcs.error) throw svcs.error;
  const next: ServiceCatalog = {
    categories: (cats.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    services: (svcs.data ?? []).map((s) => ({ id: s.id as string, category_id: s.category_id as string, name: s.name as string, price: Number(s.price),
      surgery_ref: (s as { surgery_ref?: string | null }).surgery_ref ?? null, barcode: (s as { barcode?: string | null }).barcode ?? null,
      cost: (s as { cost?: number | null }).cost != null ? Number((s as { cost?: number | null }).cost) : null })),
  };
  // كتالوجٌ فارغٌ بالقاعدة لا يُبذَر من هنا (درسُ 0153) — يبقى ما بالذاكرة.
  if (next.categories.length === 0 && next.services.length === 0) return getServiceCatalog();
  commit(next);
  return next;
}

export function removeService(id: string) {
  const c = getServiceCatalog();
  commit({ ...c, services: c.services.filter((x) => x.id !== id) });
  cloudWrite(() => sb()!.from("clinic_services").delete().eq("id", id), "service-del");
}
