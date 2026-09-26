// Data-access layer. Currently backed by the local demo store so the app is fully
// usable before a backend exists. Each method is async and isolated so a Supabase
// implementation can be dropped in here without touching the UI.

export const purchaseCoRank = (rowCompany: string | null | undefined, companyId: string | null): number => {
  if (companyId == null) return 0;
  if (rowCompany == null) return -1;
  return rowCompany === companyId ? 1 : 0;
};
/**
 * مطابقةُ الاسم احتياطاً — مرآةُ SQL حرفياً: `(company_id = v_company) desc nulls last,
 * (section_id is not null) desc, created_at`. كانت التجريبيةُ بلا مراتب NULL الثلاث وبلا
 * فاصل الأقدم، فتوأمان بنفس الاسم (أقدمُهما بلا شركة) يختار الخادمُ واحداً والمرآةُ آخر.
 */
export const pickByPurchaseName = <T extends { id: string; name: string; company_id?: string | null; section_id?: string | null; created_at?: string }>(
  rows: readonly T[], lname: string, companyId: string | null,
): string | null => rows
  .filter((p) => invNormName(p.name) === lname)
  .sort((a, b) => purchaseCoRank(b.company_id, companyId) - purchaseCoRank(a.company_id, companyId)
    || Number(b.section_id != null) - Number(a.section_id != null)
    || (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0]?.id ?? null;

/* `invNormName` انتقلت إلى `utils.ts` (0206+): الشاشةُ تحتاجها كي تعرف
 * أيَّ سطرٍ سيطابقه الخادمُ بالاسم، ومصدرُ التطبيع واحدٌ لا نسختان. */
import { supabase } from "./supabase";
import { outboxEnqueue, outboxEnqueueRpc, outboxDrop, isNetworkError } from "./outbox";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, DailyNote, TreatmentEntry, Admission, Branch, Reminder, Product, Company, CompanySection, Purchase, PurchaseItem, PurchasePayment, Courier, DeliveryOrder, PetMovement, Invoice, InvoiceItem, Customer, DiscountType, PaymentSplit, WhatsAppMessage, AuditEntry, LoginEvent, PetNote, Expense, RetailReturnResult, HealthMetric, ClinicVisit, Surgery, LabResult, LabDeviceLink, LabDeviceInbox, PetProblem, CareEntry, FeatureRequest, GeneratedBarcode, StoreProfile, StoreOrder, StoreFrontInfo, StoreCatalogItem, SuggestedProduct, StoreTrackInfo, LibraryImage, Journey, JourneyEvent, JourneyPublicView, PoultryFarm, PoultryHouse, PoultryCycle, PoultryDaily, PoultryUse, PoultryCycleStats, PoultryConsumeResult, ProductMovement } from "@/types";
import type { CompanyCharge, CompanyTwinGroup, DeletedCompany, DeletedCompanySection, ReminderMark } from "@/types";
import type { DeletedProduct, CourierSettlement } from "@/types";
import type { BarcodeHealthRow } from "@/types";
import type { PurchaseEffect } from "@/types";
import type { PortalMe, PortalPetDetail, PortalCodeRequest, PortalVerifyResult } from "@/types";
import { invNormName } from "./utils";
import { emitGlobalToast } from "./globalToast";
import i18next from "i18next";
import type { PgSort } from "./pgOrder";
import type { ActivityRow } from "@/types";
import type { PayrollPolicyDTO, StaffComp, StaffRecurring, PayrollAdjustment, PayrollRun, Payslip, PayslipLine, StaffLoan, StaffLoanEvent } from "@/types";
import { isValidSlug, normalizeSlug, productImageUrl } from "./storeLib";
import { expenseMethodOf } from "./pockets";
import { journeyToken } from "./journey";
import { uid, uuid, ageMonths, localISO, normalizeCode, matchCode, groupKey, normGroupName } from "./utils";
import { getActiveClinicId } from "./clinics";

/** Resolve a discount input (percent 0–100 or a fixed amount) to an amount, clamped to [0, subtotal]. */
export function resolveDiscount(subtotal: number, type: DiscountType | null | undefined, value: number): number {
  if (!type || !value || value <= 0) return 0;
  if (type === "percent") return Math.round(subtotal * Math.min(value, 100)) / 100;
  return Math.min(value, subtotal);
}


/** Collapse invoice rows into distinct customers (keyed by phone, else name), most-recent first. */
export function dedupeCustomers(rows: { customer_name?: string | null; customer_phone?: string | null; created_at: string }[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  const map = new Map<string, Customer>();
  for (const inv of rows) {
    const name = (inv.customer_name ?? "").trim();
    const phone = (inv.customer_phone ?? "").trim();
    if (!name && !phone) continue;
    const key = (phone || name).toLowerCase();
    const prev = map.get(key);
    if (prev) { prev.visits += 1; if (inv.created_at > prev.last_seen) prev.last_seen = inv.created_at; }
    else map.set(key, { name, phone, last_seen: inv.created_at, visits: 1 });
  }
  let list = Array.from(map.values());
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q));
  return list.sort((a, b) => b.last_seen.localeCompare(a.last_seen)).slice(0, 8);
}

/** A clinic owner-contact field counts as "blank" when empty or the "—" placeholder
 *  NewCase writes for walk-ins — only then may a claiming owner account fill it. */
export function blankOwnerField(v?: string | null): boolean {
  const s = (v ?? "").trim();
  return !s || s === "—";
}

/* Daily sticky notes — device-local store. The demo's persistence AND the cloud
 * fallback while migration 0080 hasn't been applied yet (notes then stay on the
 * device instead of erroring; the widget keeps working either way). */
const dailyNotesKey = () => `vp_daily_notes_${getActiveClinicId()}`;
function dailyNotesLoad(): Record<string, DailyNote> {
  try { return JSON.parse(localStorage.getItem(dailyNotesKey()) ?? "{}") as Record<string, DailyNote>; } catch { return {}; }
}
export function dailyNoteLocalGet(dateISO: string): DailyNote | null {
  return dailyNotesLoad()[dateISO] ?? null;
}
export function dailyNoteLocalSet(dateISO: string, content: string, author?: string | null) {
  const map = dailyNotesLoad();
  map[dateISO] = { note_date: dateISO, content, updated_by: author ?? null, updated_at: new Date().toISOString() };
  try { localStorage.setItem(dailyNotesKey(), JSON.stringify(map)); } catch { /* ignore */ }
}

// ---- Lab lifecycle (LIS) helpers, shared by demo + cloud repos. ----
export const LAB_STAGE_COL: Record<string, keyof LabResult> = {
  ordered: "ordered_at", collected: "collected_at", running: "running_at", resulted: "resulted_at", verified: "verified_at",
};
/** Stamp a new lab record's lifecycle: a placeholder order starts «ordered»,
 *  a real result lands «resulted» (awaiting the doctor's release), and every
 *  reached stage gets its timestamp so turnaround time is measurable. */
export function labLifecycleFields(input: Omit<LabResult, "id" | "created_at" | "clinic_id">, nowISO: string) {
  const isPlaceholder = input.panel_id === "ordered" && !(input.values?.length) && !input.snap_result;
  const status = input.status ?? (isPlaceholder ? "ordered" : "resulted");
  const reachedResult = status === "resulted" || status === "verified";
  return {
    status,
    priority: input.priority ?? "routine",
    ordered_at: input.ordered_at ?? nowISO,
    collected_at: input.collected_at ?? null,
    running_at: input.running_at ?? null,
    resulted_at: input.resulted_at ?? (reachedResult ? nowISO : null),
    verified_at: input.verified_at ?? (status === "verified" ? nowISO : null),
    collected_by: input.collected_by ?? null,
    verified_by: input.verified_by ?? null,
  };
}

// المرآةُ التجريبية بـ`repoDemo.ts` — خارج حزمة الإقلاع (انظر رأسَها).
import type { DemoRepo } from "./repoDemo";

const ambiguousSaid = new Set<string>();
export function sayAmbiguousCode(code: string, n: number): void {
  console.error("[pos] ambiguous code", code, n);
  if (ambiguousSaid.has(code)) return;
  ambiguousSaid.add(code);
  emitGlobalToast({
    tone: "warn",
    title: i18next.t("pos.ambiguousCode", "رمزٌ ملتبس — راجع المخزون"),
    description: i18next.t("pos.ambiguousCodeHint", { code, defaultValue: "الرمز {{code}} على أكثر من منتج. بعنا الأقدم؛ افتح المخزون وادمجهما أو غيّر رمزَ أحدهما." }),
  });
}

function sbc(): SupabaseClient {
  if (!supabase) throw new Error("[supabase] client is not configured");
  return supabase;
}
/* ══ صورُ المنتجات: مرآةُ قائمة الدلو (0184) ═══════════════════════════════
 *
 * الدلوُ `product-images` منذ 0184 يقبل ثلاثةَ أنواعٍ وسقفَ ٢ ميغا. وهذي
 * مرآتُها بالواجهة — **الطرفان من نفس القائمة**، فتطبيقُ طرفٍ واحد يترك
 * الآخرَ يفشل بخطأٍ إنكليزيٍّ خام بوجه عيادةٍ عراقية.
 *
 * ولماذا تُحرَس أصلاً: `prepareUpload` تمرّر غيرَ الصور **كما هي** عمداً —
 * تقاريرُ المختبر PDF تحتاج ذلك. فمن اختار PDF بمنتقي صورةِ المنتج رفعه
 * ونجح (الدلوُ كان بلا قائمةِ أنواع) وبقيت البطاقةُ فارغةً بلا خطأ.
 */
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** يُرمى حين يُختار ملفٌّ ليس صورةً مقبولة — تترجمه `describeUploadError`. */
export class NotAnImageError extends Error {
  constructor() { super("unsupported_image_type"); this.name = "NotAnImageError"; }
}

type UploadLike = { blob: Blob; dataUrl: string; ext?: string; contentType?: string };

/** النوعُ المُعلَن، مصفّى على قائمة الدلو — `blob.type` هو الحَكَم لا الاسم. */
function imageType(u: UploadLike): string {
  const t = (u.contentType || u.blob?.type || "").toLowerCase();
  return (IMAGE_MIMES as readonly string[]).includes(t) ? t : "image/jpeg";
}
/** الامتدادُ من النوع لا من اسم الملف: الاسمُ يكذب، والنوعُ ما نرسله فعلاً. */
function imageExt(u: UploadLike): string {
  return MIME_EXT[imageType(u)] ?? "jpg";
}
export function assertUploadableImage(u: UploadLike): void {
  const t = (u.contentType || u.blob?.type || "").toLowerCase();
  if (!(IMAGE_MIMES as readonly string[]).includes(t)) throw new NotAnImageError();
}

function listOf<T>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) { console.error("[supabase]", res.error.message); return []; }
  return (res.data ?? []) as T[];
}

/**
 * قائمةٌ تُرمى لا تُبلَع — لكلِّ قائمةٍ يُبنى عليها قرار.
 *
 * الحقيقةُ الحاملة: `postgrest-js` يحوّل حتى فشلَ الشبكة إلى `res.error` لا إلى
 * رمية (وما من `throwOnError` بالمستودع كلِّه). فدالّةٌ تفحص الخطأ وترجع `[]`
 * تجعل كلَّ `catch` عند مستهلكيها **ميّتاً**: الفشلُ يصل «نجاحاً فارغاً».
 * ومعالجاتُ الفشل مكتوبةٌ فعلاً بالشاشات (شاشةُ «أعد المحاولة»، توست البحث
 * الفاشل) لكنها لا تنطلق أبداً — فتُقال «ماكو» عن موجود.
 *
 * فما يُبنى عليه مرتجعٌ أو طباعةٌ أو كشفُ مورّدٍ أو استرجاعُ محذوفٍ يمرّ من هنا:
 * الخطأُ يُرمى بنصّه ورمزه (كـ`need`)، و«لا صفوف» تبقى `[]` مشروعة.
 * (`listOf` تبقى لقوائمَ زينةٍ لا يُبنى عليها قرار.)
 */
function listOrThrow<T>(res: { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }): T[] {
  if (res.error) {
    const src = res.error;
    const err = new Error(src.message) as Error & { code?: string; details?: string; hint?: string };
    if (src.code) err.code = src.code;
    if (src.details) err.details = src.details;
    if (src.hint) err.hint = src.hint;
    throw err;
  }
  return (res.data ?? []) as T[];
}

/**
 * استعلام .in() على دفعات بدل مصفوفة واحدة غير محدودة.
 *
 * PostgREST يمرّر قائمة المعرفات داخل رابط الطلب، وكل uuid يستهلك ~٣٩ حرفاً
 * بعد الترميز. عيادة بـ٢٠٠+ حيوان تتجاوز حدود طول الرابط عند الوكيل الأمامي،
 * والرفض يرجع بلا ترويسات CORS فيظهر للطبيب «TypeError: Failed to fetch»
 * الغامضة — يعني الشاشة تعمل بالعيادة الصغيرة وتنكسر لمّا تكبر. مئة معرف
 * لكل دفعة ≈ ٤KB، بهامش مريح تحت أي حد شائع.
 */
const IN_CHUNK = 100;
async function inChunks<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  if (ids.length <= IN_CHUNK) return ids.length === 0 ? [] : query(ids);
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...await query(ids.slice(i, i + IN_CHUNK)));
  }
  return out;
}
/**
 * كسر سقف الألف: PostgREST يقصّ أي استعلام على 1000 صف افتراضياً — بصمت.
 *
 * العيادة الكبيرة تتجاوز ألف منتج/فاتورة، فتظهر أول ألفٍ فقط (بترتيب
 * الاستعلام) ويبدو ما بعدها «مختفياً»: الدكتور يضيف منتجاً ثم «ما يلگيه»،
 * والبيع يرفض باركوداً موجوداً فعلاً لأنه خارج الألف المقروءة. هذا المساعد
 * يسحب صفحات كاملة حتى النهاية، بترتيب ثابت (ترتيب الاستعلام + id كاسر
 * تعادل) كي لا يتكرر صف بين صفحتين ولا يسقط.
 */
const PAGE_ROWS = 1000;

/** مدى تاريخٍ اختياريّ للقراءات الثقيلة (ISO). حين يُمرَّر يُفلتَر **بالقاعدة**
 *  بدل أن تنزل كل صفوف العيادة ثم يرمي المتصفح ما هو خارج المدى — الفلتر
 *  نفسه، ومكانه هو ما تغيّر. */
export interface DateRange { from?: string | null; to?: string | null }

/** المنطقةُ الزمنية للمتصفّح — الملخّصُ اليوميّ يُقطَّع عليها بالخادم. */
function localTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad"; } catch { return "Asia/Baghdad"; }
}

/** يشدّ استعلاماً على عمودٍ زمنيّ بالمدى المطلوب. بلا مدى يمرّ كما هو، فتبقى
 *  كل النداءات القائمة على سلوكها السابق حرفياً. */
function inRange<T>(q: T, col: string, r?: DateRange): T {
  const x = q as unknown as { gte(c: string, v: string): T; lte(c: string, v: string): T };
  let out = q;
  if (r?.from) out = x.gte(col, r.from);
  if (r?.to) out = (out as unknown as typeof x).lte(col, r.to);
  return out;
}
/* ── الجلبُ بالمؤشّر القيميّ (keyset) — خطة الطزاجة، ط٤ ───────────────────
 * كانت تتقدّم **بالموقع** (`range(from, from+999)`): «من الصفّ ١٠٠١». وحذفُ
 * صفٍّ قرأناه — أو دمجُ منتجين — بجهازٍ ثانٍ بين الطلبتين يُصعد كلَّ ما بعده
 * خانةً، فيسقط صفٌّ بين الطلبتين **صامتاً**: مادّةٌ بالرفّ لا تظهر بالقائمة،
 * وهذا بالضبط صنفُ «المنتج اختفى». أُثبت بالفحص على الشيفرة القديمة (ع٩/ط٤).
 * والعتبةُ المسجّلة للترقية (جدولٌ يقارب الألف) انكسرت: عيادةٌ بـ١٠٠٥ منتجات.
 *
 * الآن تتقدّم **بالمعرّف**: «كلُّ ما بعد آخرِ معرّفٍ وصل» (`gt id`). حذفٌ أو إدراجٌ
 * بالنصّ لا يزحزح شيئاً — فلا يسقط صفٌّ قائمٌ ولا يتكرّر. وذاك يشترط أن يكون `id`
 * الترتيبَ **الوحيد** بالخادم، ففرزُ العرض يُمرَّر هنا (`sort`) ويُطبَّق بعد
 * اكتمال الجلب بمقارِنٍ يطابق ترتيبَ القاعدة حرفياً (`pgOrder.ts`). والمستدعي
 * لا يُلحق `order()` بنفسه — `keyset-test` يفشّل البناءَ إن فعل. */
async function allPages<T>(make: () => unknown, sort?: PgSort): Promise<T[]> {
  type Q = {
    order: (c: string, o: { ascending: boolean }) => Q;
    gt: (c: string, v: unknown) => Q;
    limit: (n: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const out: T[] = [];
  const seen = new Set<unknown>();
  let after: unknown = undefined;
  // نتقدّم بما **وصل** لا بما **طُلب**، ونتوقّف عند صفحةٍ فارغة لا عند صفحةٍ ناقصة.
  //
  // الشرط القديم كان `rows.length < PAGE_ROWS ⇒ انتهت البيانات`، وهو يفترض أن
  // الخادم يعطي دائماً ما طُلب. لكن PostgREST عنده سقفُ صفوفٍ خاصٌّ به لكل طلب،
  // فإن كان أقلّ من ألف رجعت الصفحةُ الأولى ناقصةً فظنّها الكودُ الأخيرة — فيتوقّف
  // عند الحدّ ويصير **كلُّ ما بعده غيرَ موجود بنظر الشاشة**: يبحث الطبيب باسم
  // منتجٍ ترتيبُه بالذيل فلا يلقاه، والمنتجاتُ الأخرى ظاهرةٌ أمامه فيستنتج أن
  // مادّته لم تُدخَل، فيعيد إدخالها.
  //
  // والتقدّمُ بما وصل يجعل الحلقة صحيحةً مهما كان سقفُ الخادم — بلا أن نعرفه.
  for (;;) {
    let q = (make() as Q).order("id", { ascending: true });
    if (after !== undefined) q = q.gt("id", after);
    const r = await q.limit(PAGE_ROWS);
    // وفشلٌ يُرمى ولا يُبلع: كانت تُرجع ما جمعته — صفراً بالصفحة الأولى — فتقول
    // الشاشة «ماكو منتجات» عن مخزنٍ عامر. قائمةٌ ناقصة أسوأ من خطأ: الخطأ يُرى
    // ويُعاد، والنقصُ يُصدَّق.
    if (r.error) throw new Error(r.error.message);
    const rows = (r.data ?? []) as T[];
    if (rows.length === 0) break;
    let fresh = 0;
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      // المؤشّرُ معرّفٌ أو لا شيء: صفٌّ بلا id لا يُتقدَّم بعده ولا يُعرف أنه وصل.
      if (id == null) throw new Error("allPages: row without id — keyset pagination needs an id on every row");
      // وصفٌّ لا يُعدّ مرّتين (ع٩) — دفاعٌ ثانٍ لا يكلّف شيئاً.
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
      fresh++;
    }
    const last = (rows[rows.length - 1] as { id?: unknown }).id;
    /* **لا حلقةَ لا نهائية.** خادمٌ لا يحترم المؤشّر (أو مستدعٍ أفسد الترتيب)
     * يعيد نفسَ الصفحة، والمؤشّرُ لا يتقدّم — فيدور الجلبُ للأبد ويتجمّد المتصفّح.
     * نقف بخطأٍ صريح: شاشةُ «أعد المحاولة» خيرٌ من تبويبٍ معلَّق. */
    if (fresh === 0 || last === after) throw new Error("allPages: pagination made no progress (cursor did not advance)");
    after = last;
  }
  if (!sort) return out;
  /* المقارِنُ يُحمَّل عند الحاجة: `repo.ts` تحمله صفحةُ الزائر العامّة وهي لا تفرز قائمة —
   * فكان مقارِنُ ICU يُثقل ميزانَها (store-weight-guard) بلا عمل. أوّلُ فرزٍ يجلب قطعتَه
   * الصغيرة مرّة، ثم من الكاش. */
  const { pgCompare } = await import("./pgOrder");
  return out.sort(pgCompare<T>(sort));
}
/* تحديثٌ ردّته سياسةُ الصفوف يرجع **صفرَ صفوفٍ بلا خطأ** — فتقول الواجهةُ
 * «تمّ» والطلبُ لم يتغيّر. هذا بالضبط ما بُلِّغ عنه بالتوصيل: «اختار السائق ما
 * صار شي»، و«إشعارُ تحصيلٍ والطلبُ مكانه». الصمتُ هنا أخطرُ من الخطأ لأنه
 * يُصدَّق. فصفٌّ غائبٌ بعد update = خطأٌ صريح بسببٍ مفهوم. */
export function assertUpdated<T>(row: T | undefined): T {
  if (row === undefined) {
    // الرمزُ على الكائن لا بالنصّ وحدَه: `errors.ts` كانت تطابق بـ`.includes`
    // على الرسالة — يعمل، لكنه يجعل الرسالةَ عقداً. والرمزُ يبقى بالرسالة
    // كذلك لأنه يعبر حدَّ JSON (الصادر) حيث تسقط الخصائصُ غيرُ المعدودة.
    const e = new Error("no_row_updated") as Error & { code?: string };
    e.code = "no_row_updated";
    throw e;
  }
  return row;
}
/** تحديثٌ يُسمع صوتُه: خطأُ الخادم يُرمى، وصفرُ صفوفٍ يُرمى.
 *
 *  `maybe()` تصلح للقراءة («ما لقيت» جوابٌ مشروع)، وتكذب على الكتابة: تطبع
 *  الخطأ بالكونسول وترجع «لا صفّ»، فتُغلق النافذةُ ويُصفَّق للحفظ ولا شيء حُفظ.
 *  والصمتُ يُصدَّق: العيادةُ تعيد الإدخال أو تبيع بسعرٍ ظنّت أنها غيّرته. */
function updated<T>(res: { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }): T {
  if (res.error) {
    const src = res.error;
    const err = new Error(src.message) as Error & { code?: string; details?: string; hint?: string };
    if (src.code) err.code = src.code;
    if (src.details) err.details = src.details;
    if (src.hint) err.hint = src.hint;
    throw err;
  }
  return assertUpdated((res.data ?? undefined) as T | undefined);
}

/** قراءةٌ تُسمَع: خطأُ الخادم **يُرمى**، و«ما لكيت» ترجع undefined.
 *
 *  الفرقُ عن `maybe()`: تلك تخلط الجوابين — تطبع الخطأ بالكونسول وترجع «لا
 *  صفّ»، فيصير فشلُ الشبكة وغيابُ الصفّ شيئاً واحداً بعين المستدعي. فمن أراد
 *  «ما لكيت» جواباً مشروعاً **ولا يريد** أن يبتلع الفشلَ معه، يستعمل هذه. */
function row<T>(res: { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }): T | undefined {
  if (res.error) {
    const src = res.error;
    const err = new Error(src.message) as Error & { code?: string; details?: string; hint?: string };
    if (src.code) err.code = src.code;
    if (src.details) err.details = src.details;
    if (src.hint) err.hint = src.hint;
    throw err;
  }
  return (res.data ?? undefined) as T | undefined;
}

function maybe<T>(res: { data: unknown; error: { message: string } | null }): T | undefined {
  if (res.error) { console.error("[supabase]", res.error.message); return undefined; }
  return (res.data ?? undefined) as T | undefined;
}
function need<T>(res: { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }): T {
  if (res.error || res.data == null) {
    const src = res.error;
    // Preserve the Postgres error code/details so callers can show a specific,
    // friendly message (e.g. a unique-constraint conflict) instead of a generic one.
    const err = new Error(src?.message ?? "No data returned") as Error & { code?: string; details?: string; hint?: string };
    if (src?.code) err.code = src.code;
    if (src?.details) err.details = src.details;
    if (src?.hint) err.hint = src.hint;
    throw err;
  }
  return res.data as T;
}
/** For write ops (update/delete/rpc) that return no row: throw on error so a
 *  failed mutation surfaces to the caller instead of failing silently. */
function ok(res: { error: { message: string; code?: string; details?: string; hint?: string } | null }): void {
  if (res.error) {
    const err = new Error(res.error.message) as Error & { code?: string; details?: string; hint?: string };
    if (res.error.code) err.code = res.error.code;
    if (res.error.details) err.details = res.error.details;
    if (res.error.hint) err.hint = res.error.hint;
    throw err;
  }
}

// medical-media is a PRIVATE bucket: media_items.url holds the storage PATH, and
// we mint a short-lived signed URL for display. Legacy rows that still hold a full
// http(s)/data:/blob: URL pass straight through, so the switch is seamless.
const MEDIA_BUCKET = "medical-media";
const MEDIA_URL_TTL = 60 * 60 * 8; // 8 hours — comfortably longer than a work session
const isStoragePath = (u: string): boolean => !!u && !/^(https?:|data:|blob:)/i.test(u);
async function withSignedMedia(items: MediaItem[]): Promise<MediaItem[]> {
  const paths = items.filter((m) => isStoragePath(m.url)).map((m) => m.url);
  if (paths.length === 0) return items;
  try {
    const { data } = await sbc().storage.from(MEDIA_BUCKET).createSignedUrls(paths, MEDIA_URL_TTL);
    const signed = new Map<string, string>();
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, d.signedUrl);
    return items.map((m) => (isStoragePath(m.url) && signed.has(m.url) ? { ...m, url: signed.get(m.url)! } : m));
  } catch {
    return items; // never let a signing hiccup drop the whole gallery
  }
}

const supabaseRepo: DemoRepo = {
  async listPets(ownerId) {
    return listOf<Pet>(await sbc().from("pets").select("*").eq("owner_id", ownerId));
  },
  async listAllPets(clinicId) {
    return allPages<Pet>(() => {
      let q = sbc().from("pets").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    }, { col: "created_at", asc: false, kind: "time" });
  },
  async updateOwnerContact(ownerId, patch) {
    ok(await sbc().from("pets").update(patch).eq("owner_id", ownerId));
  },
  async getPet(petId) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("id", petId).maybeSingle());
  },
  async getPetByToken(token) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("passport_token", token.trim().toUpperCase()).maybeSingle());
  },
  async getPetsByIds(ids) {
    return inChunks(ids, async (c) => listOf<Pet>(await sbc().from("pets").select("*").in("id", c)));
  },
  async getPetBySerial(serial) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("serial", serial.trim()).maybeSingle());
  },
  async claimPet(serial, owner) {
    // Claiming only LINKS the owner account. The clinic's stored customer name/
    // phone (اسم المراجع) must survive the claim — we read the row first and only
    // fill fields the clinic left blank.
    // القراءةُ ترمي على الفشل وترجع undefined على الغياب — الجوابان مفترقان.
    const cur = row<Pet>(await sbc().from("pets").select("*").eq("serial", serial.trim()).maybeSingle());
    if (!cur) return undefined;
    const patch: Partial<Pet> = { owner_id: owner.owner_id };
    if (blankOwnerField(cur.owner_name) && owner.owner_name) patch.owner_name = owner.owner_name;
    if (blankOwnerField(cur.owner_phone) && owner.owner_phone) patch.owner_phone = owner.owner_phone;
    if (blankOwnerField(cur.owner_email) && owner.owner_email) patch.owner_email = owner.owner_email;
    // القراءةُ فوقُ أثبتت أنّ الحيوان موجود — فصفرُ صفوفٍ هنا **رفضُ سياسة**
    // لا غياب. كانت ترجع undefined فتقول الشاشةُ «ما لكيت الحيوان».
    return updated<Pet>(await sbc().from("pets").update(patch).eq("id", cur.id).select().maybeSingle());
  },
  async claimPetsByPhone(input) {
    // Server-side matching (migration 0077): the RPC uses the PROFILE's stored
    // phone — never a client-supplied one — so an account can only ever claim
    // pets registered under its own verified number. Missing RPC ⇒ no-op.
    try {
      const { data, error } = await sbc().rpc("claim_pets_by_phone", {
        p_name: input.name ?? null,
        p_email: input.email ?? null,
      });
      if (error) return [];
      return (data as Pet[]) ?? [];
    } catch {
      return [];
    }
  },
  async getPetsByOwnerEmail(email) {
    const e = email.trim();
    if (!e) return [];
    return listOf<Pet>(await sbc().from("pets").select("*").ilike("owner_email", e).eq("shared_with_clinic", true));
  },
  async getSharedPetsByOwnerId(ownerId) {
    return listOf<Pet>(await sbc().from("pets").select("*").eq("owner_id", ownerId).eq("shared_with_clinic", true));
  },
  async createPet(input) {
    // الرقم التسلسلي تولّده القاعدة (هجرة 0126): `nextval` ذرّيّ ثم تحويلٌ
    // تقابليّ، فالفرادة مضمونةٌ حسابياً لا احتمالياً. كان العميل يسحب رقماً
    // عشوائياً سحبةً واحدة بلا إعادة، فيصطدم بفهرسٍ فريد وتضيع الحالة —
    // ٠٫٧٩٪ اليوم، وترتفع مع كل حيوانٍ ينضاف.
    //
    // ما نمرّر `serial` أبداً: تمريره — ولو null — يلغي الـdefault ويرجّعنا
    // للحفرة. والحذف صريحٌ هنا لأن `input` يجي من نداءاتٍ كثيرة.
    const { serial: _ignored, ...clean } = input as typeof input & { serial?: string };
    void _ignored;

    // حزامٌ ثانٍ: نعيد المحاولة على **23505 وحدها** — خرق قيد الفرادة. أي
    // خطأٍ غيره (شبكة، صلاحية، عمود ناقص) يُرمى فوراً: إعادة المحاولة عليه
    // تخفي العطل وتكرّر الكتابة.
    let pet: Pet | undefined;
    for (let attempt = 0; ; attempt++) {
      try { pet = need<Pet>(await sbc().from("pets").insert(clean).select().single()); break; }
      catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "23505" || attempt >= 4) throw e;
      }
    }

    // قاعدةٌ ما نزلت عليها هجرة 0126 بعد ما بيها default، فيطلع الرقم فارغاً —
    // والفهرس الفريد يتجاهل NULL فما ينكشف الخلل بخطأ. والرقم هذا هو رقم ملفّ
    // المريض: مطبوعٌ بالموافقات وبالسجلّ وبيه يُبحث. فنملأه من العميل حينها،
    // بنفس حلقة التفادي، حتى تشتغل النسختان بأي ترتيبٍ نزلن به.
    if (!pet.serial) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const cand = String(Math.floor(10000 + Math.random() * 90000));
        try {
          // `row` لا `maybe`: الحلقةُ حولَها تمسك 23505 لتعيد المحاولة — وكانت
          // `maybe` تبلعه فلا يصل `catch` أبداً، فتنكسر إعادةُ المحاولة بصمت.
          const fixed = row<Pet>(await sbc().from("pets").update({ serial: cand }).eq("id", pet.id).select().maybeSingle());
          if (fixed) return fixed;
          break;
        } catch (e) {
          if ((e as { code?: string }).code !== "23505") break; // الحيوان انسجّل — الرقم تحسينٌ لا شرط
        }
      }
    }
    return pet;
  },
  async updatePet(petId, patch) {
    // اثنا عشرَ موضعَ نداءٍ بالشاشات، كلُّها تتجاهل المُرجَع وتقول «تمّ» بعدها.
    // فصفرُ صفوفٍ (سياسةٌ ردّت، أو معرّفٌ بايت) كان يُقال عنه نجاحاً.
    return updated<Pet>(await sbc().from("pets").update(patch).eq("id", petId).select().maybeSingle());
  },
  async deletePet(petId) {
    // ملفات التخزين لا تلحقها الـcascade — صفوف media_items تنحذف مع الحيوان
    // لكن ملفات الأشعة/الـPDF كانت تبقى بالباكت للأبد (بيانات مرضى + كلفة).
    // نحذفها أولاً، بأفضل جهد: فشل التنظيف ما يمنع حذف الحيوان نفسه.
    try {
      const rows = listOf<{ url: string }>(await sbc().from("media_items").select("url").eq("pet_id", petId));
      const paths = rows.map((r) => r.url).filter(isStoragePath);
      for (let i = 0; i < paths.length; i += 50) {
        await sbc().storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 50));
      }
    } catch { /* best effort — the DB delete below is the operation that matters */ }
    // Dependent rows (visits, vaccinations, treatments, media, weights, admissions)
    // are removed by the schema's `on delete cascade` foreign keys.
    ok(await sbc().from("pets").delete().eq("id", petId));
  },
  async listWeights(petId) {
    return listOf<WeightLog>(await sbc().from("weight_logs").select("*").eq("pet_id", petId).order("measured_at", { ascending: true }));
  },
  async addWeight(petId, weight_kg, measured_at) {
    const log = need<WeightLog>(
      await sbc().from("weight_logs").insert({ pet_id: petId, weight_kg, measured_at: measured_at ?? new Date().toISOString().slice(0, 10) }).select().single(),
    );
    // كان المُرجَعُ **يُهمَل كلّياً** — فلا الخطأُ يُرى ولا صفرُ الصفوف. الوزنُ
    // يُسجَّل بالسجلّ ولا يصل بطاقةَ الحيوان، فتقرأ الشاشةُ وزناً قديماً ويُحسب
    // عليه دواءٌ بالكيلو. `ok()` ترمي على الخطأ — وهو ما يعني هنا.
    ok(await sbc().from("pets").update({ current_weight_kg: weight_kg }).eq("id", petId));
    return log;
  },
  async listVaccinations(petId) {
    return listOf<Vaccination>(await sbc().from("vaccinations").select("*").eq("pet_id", petId));
  },
  async listAllVaccinations(petIds) {
    return inChunks(petIds, (c) => allPages<Vaccination>(() => sbc().from("vaccinations").select("*").in("pet_id", c)));
  },
  async addVaccination(input) {
    return need<Vaccination>(await sbc().from("vaccinations").insert(input).select().single());
  },
  async updateVaccination(id, patch) {
    ok(await sbc().from("vaccinations").update(patch).eq("id", id));
  },
  async listVisits(petId) {
    return listOf<MedicalVisit>(await sbc().from("medical_visits").select("*").eq("pet_id", petId).order("visit_date", { ascending: false }));
  },
  async listAllVisits(petIds) {
    return inChunks(petIds, (c) => allPages<MedicalVisit>(() => sbc().from("medical_visits").select("*").in("pet_id", c), { col: "visit_date", asc: false, kind: "date" }));
  },
  async listClinicVisits(clinicId, range) {
    // ملاحظة: حتى limit(5000) كان يُقصّ على 1000 من الخادم — الصفحات هي الحل.
    return allPages<MedicalVisit>(() => {
      let q = sbc().from("medical_visits").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "visit_date", range);
    }, { col: "visit_date", asc: false, kind: "date" });
  },
  async listCareEntries(petId, day) {
    let q = sbc().from("care_entries").select("*").eq("pet_id", petId).order("day", { ascending: true }).order("time", { ascending: true });
    if (day) q = q.eq("day", day);
    return listOf<CareEntry>(await q);
  },
  async addCareEntry(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id;   // stamped server-side by the auth_clinic() column default
    return need<CareEntry>(await sbc().from("care_entries").insert(rest).select().single());
  },
  async deleteCareEntry(id) {
    ok(await sbc().from("care_entries").delete().eq("id", id));
  },
  async listProblems(petId) {
    // clinic_id is stamped by the column default (auth_clinic()) — never sent by the client.
    return listOf<PetProblem>(
      await sbc().from("pet_problems").select("*").eq("pet_id", petId).order("created_at", { ascending: false }),
    ).sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
  },
  async addProblem(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id;
    return need<PetProblem>(await sbc().from("pet_problems").insert(rest).select().single());
  },
  async updateProblem(id, patch) {
    ok(await sbc().from("pet_problems").update(patch).eq("id", id));
  },
  async deleteProblem(id) {
    ok(await sbc().from("pet_problems").delete().eq("id", id));
  },
  async listFeatureRequests() {
    // RLS تحصرها بطلبات عيادة المستخدم نفسها.
    return listOf<FeatureRequest>(
      await sbc().from("feature_requests").select("*").order("created_at", { ascending: false }),
    );
  },
  async addFeatureRequest(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id; // يُختم من default العمود auth_clinic() — لا يُرسل من العميل
    return need<FeatureRequest>(await sbc().from("feature_requests").insert({ status: "new", ...rest }).select().single());
  },
  async updateFeatureRequest(id, patch) {
    ok(await sbc().from("feature_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  },
  async systemHealth() {
    // الحارس داخل الدالّة نفسها (is_platform_admin)، فغيرُ المشغّل يستلم رفضاً
    // من الخادم لا قائمةً منقوصة.
    return listOf<HealthMetric>(await sbc().rpc("system_health", {}));
  },
  async adminListFeatureRequests() {
    // سياسة is_platform_admin() توسّع القراءة لكل العيادات لمشغّل المنصة.
    return listOf<FeatureRequest>(
      await sbc().from("feature_requests").select("*").order("created_at", { ascending: false }).limit(500),
    );
  },
  async addVisit(input) {
    // Snapshot the patient's age at visit time. Look up the pet's DOB when the caller
    // didn't supply the age, so every saved visit carries a historical age.
    let patient_age_months = input.patient_age_months ?? null;
    if (patient_age_months == null) {
      const { data } = await sbc().from("pets").select("dob").eq("id", input.pet_id).maybeSingle();
      patient_age_months = ageMonths((data as { dob?: string | null } | null)?.dob);
    }
    return need<MedicalVisit>(await sbc().from("medical_visits").insert({ ...input, patient_age_months }).select().single());
  },
  async listPetNotes(petId) {
    return listOf<PetNote>(await sbc().from("pet_notes").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async listLabResults(petId) {
    return listOf<LabResult>(await sbc().from("lab_results").select("*").eq("pet_id", petId).order("taken_at", { ascending: false }));
  },
  async addLabResult(input) {
    // clinic_id is stamped by the column default (auth_clinic()).
    const lc = labLifecycleFields(input, new Date().toISOString());
    return need<LabResult>(await sbc().from("lab_results").insert({
      pet_id: input.pet_id, visit_id: input.visit_id ?? null,
      panel_id: input.panel_id, panel_label: input.panel_label, kind: input.kind,
      values: input.values ?? null, snap_test_id: input.snap_test_id ?? null,
      snap_result: input.snap_result ?? null, notes: input.notes ?? null,
      photo_url: input.photo_url ?? null, doctor: input.doctor ?? null,
      billed: input.billed ?? false, taken_at: input.taken_at,
      status: lc.status, priority: lc.priority,
      ordered_at: lc.ordered_at, collected_at: lc.collected_at, running_at: lc.running_at,
      resulted_at: lc.resulted_at, verified_at: lc.verified_at,
      collected_by: lc.collected_by, verified_by: lc.verified_by,
    }).select().single());
  },
  async setLabBilled(id, billed) {
    ok(await sbc().from("lab_results").update({ billed }).eq("id", id));
  },
  async advanceLabStatus(id, status, extra) {
    const patch: Record<string, unknown> = { status };
    const col = LAB_STAGE_COL[status];
    if (col) patch[col] = new Date().toISOString();
    if (extra?.collected_by !== undefined && status === "collected") patch.collected_by = extra.collected_by;
    if (extra?.verified_by !== undefined && status === "verified") patch.verified_by = extra.verified_by;
    ok(await sbc().from("lab_results").update(patch).eq("id", id));
  },
  async setLabPriority(id, priority) {
    ok(await sbc().from("lab_results").update({ priority }).eq("id", id));
  },
  async listClinicLabResults(clinicId, range) {
    // limit(2000) كان يُقصّ على 1000 من الخادم أصلاً — الصفحات تضمن الاثنين.
    return allPages<LabResult>(() => {
      let q = sbc().from("lab_results").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "taken_at", range);
    }, { col: "taken_at", asc: false, kind: "time" });
  },
  async deleteLabResult(id) {
    ok(await sbc().from("lab_results").delete().eq("id", id));
  },
  async createDeviceLink(name) {
    // token + clinic_id are stamped by column defaults; read them back for display.
    return need<LabDeviceLink>(await sbc().from("lab_device_links").insert({ name: name.trim() || "جهاز المختبر" }).select().single());
  },
  async listDeviceLinks() {
    return listOf<LabDeviceLink>(await sbc().from("lab_device_links").select("*").order("created_at", { ascending: false }));
  },
  async revokeDeviceLink(id) {
    ok(await sbc().from("lab_device_links").update({ revoked: true }).eq("id", id));
  },
  async listDeviceInbox() {
    return listOf<LabDeviceInbox>(await sbc().from("lab_device_inbox").select("*").eq("status", "new").order("received_at", { ascending: false }));
  },
  async markInboxHandled(id, status) {
    ok(await sbc().from("lab_device_inbox").update({ status, handled_at: new Date().toISOString() }).eq("id", id));
  },
  async ingestDeviceMessage(token, raw) {
    // Same secure path the receiver agent uses — SECURITY DEFINER RPC, token-authed.
    const { data, error } = await sbc().rpc("ingest_device_message", { p_token: token, p_raw: raw });
    if (error) return null;
    return (data as string | null) ?? null;
  },
  async addPetNote(input) {
    // clinic_id + author_id are stamped by the column defaults (auth_clinic() / auth.uid()).
    return need<PetNote>(await sbc().from("pet_notes").insert({
      pet_id: input.pet_id, note_text: input.note_text,
      author_id: input.author_id ?? undefined, author_name: input.author_name ?? null,
      visit_id: input.visit_id ?? null,
    }).select().single());
  },
  async listClinicVisitsForPet(petId) {
    return listOf<ClinicVisit>(await sbc().from("clinic_visits").select("*").eq("pet_id", petId).order("opened_at", { ascending: false }));
  },
  async getClinicVisit(id) {
    return maybe<ClinicVisit>(await sbc().from("clinic_visits").select("*").eq("id", id).maybeSingle()) ?? null;
  },
  async listOpenClinicVisits(clinicId) {
    let q = sbc().from("clinic_visits").select("*").eq("status", "open").order("opened_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<ClinicVisit>(await q);
  },
  async listEndedClinicVisits(clinicId, limit = 300) {
    let q = sbc().from("clinic_visits").select("*").eq("status", "ended").order("ended_at", { ascending: false }).limit(limit);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<ClinicVisit>(await q);
  },
  async addClinicVisit(input) {
    return need<ClinicVisit>(await sbc().from("clinic_visits").insert(input).select().single());
  },
  async updateClinicVisit(id, patch) {
    ok(await sbc().from("clinic_visits").update(patch).eq("id", id));
  },
  async listMedia(petId) {
    const items = listOf<MediaItem>(await sbc().from("media_items").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
    return withSignedMedia(items);
  },
  async listAllMedia(petIds, range) {
    const items = await inChunks(petIds, (c) => allPages<MediaItem>(() => inRange(sbc().from("media_items").select("*").in("pet_id", c), "created_at", range)));
    return withSignedMedia(items);
  },
  async addMedia(input) {
    return need<MediaItem>(await sbc().from("media_items").insert(input).select().single());
  },
  async uploadMedia(petId, upload, kind, caption) {
    const sb = sbc();
    // UUID object name keeps uploads collision-free; foldered by pet (the folder
    // name IS the pet id — the storage RLS policy scopes access by it).
    const path = `${petId}/${uuid()}.${upload.ext}`;
    const up = await sb.storage.from(MEDIA_BUCKET).upload(path, upload.blob, {
      contentType: upload.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) {
      const e = new Error(up.error.message) as Error & { name: string };
      e.name = "StorageError";
      throw e;
    }
    // Store the PATH (private bucket); link the file to the pet's record.
    const item = need<MediaItem>(
      await sb.from("media_items").insert({ pet_id: petId, kind, url: path, caption }).select().single(),
    );
    // Return a ready-to-display signed URL so the just-uploaded image renders at once.
    const { data: signed } = await sb.storage.from(MEDIA_BUCKET).createSignedUrl(path, MEDIA_URL_TTL);
    return { ...item, url: signed?.signedUrl ?? item.url };
  },
  async listAppointmentsForOwner(ownerId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("owner_id", ownerId).neq("status", "cancelled").order("scheduled_at", { ascending: true }));
  },
  async listAppointmentsForPet(petId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("pet_id", petId).neq("status", "cancelled").order("scheduled_at", { ascending: true }));
  },
  async listAppointmentsForDay(dayISO) {
    const day = dayISO.slice(0, 10);
    return listOf<Appointment>(
      await sbc().from("appointments").select("*").gte("scheduled_at", `${day}T00:00:00`).lte("scheduled_at", `${day}T23:59:59.999`).neq("status", "cancelled").order("scheduled_at", { ascending: true }),
    );
  },
  async listAppointmentsInRange(startISO, endISO) {
    return allPages<Appointment>(() =>
      sbc().from("appointments").select("*").gte("scheduled_at", `${startISO.slice(0, 10)}T00:00:00`).lte("scheduled_at", `${endISO.slice(0, 10)}T23:59:59.999`).neq("status", "cancelled"),
      { col: "scheduled_at", asc: true, kind: "time" },
    );
  },
  async listWaiting(doctorId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("doctor_id", doctorId).in("status", ["checked_in", "in_room"]).order("triage_score", { ascending: true }));
  },
  async slotTaken(doctorId, scheduledAt) {
    return listOf<{ id: string }>(await sbc().from("appointments").select("id").eq("doctor_id", doctorId).eq("scheduled_at", scheduledAt).neq("status", "cancelled")).length > 0;
  },
  async listBookingsForDay(dayISO) {
    // Fetch a ±1-day window then filter by the LOCAL calendar day — timestamps
    // are stored in UTC and Iraq runs +3, so a plain UTC window drops evenings.
    const day = dayISO.slice(0, 10);
    const from = new Date(`${day}T00:00:00`);
    from.setDate(from.getDate() - 1);
    const to = new Date(`${day}T00:00:00`);
    to.setDate(to.getDate() + 2);
    const rows = listOf<Appointment>(
      await sbc().from("appointments").select("*").gte("scheduled_at", from.toISOString()).lt("scheduled_at", to.toISOString()).order("scheduled_at", { ascending: true }),
    );
    return rows.filter((a) => localISO(new Date(a.scheduled_at)) === day);
  },
  async listBookingRequests() {
    // Clinic-scoped by RLS (appt_clinic_all): only this clinic's requests arrive.
    const since = new Date(Date.now() - 86400000).toISOString();
    return listOf<Appointment>(
      await sbc().from("appointments").select("*").eq("status", "requested").gte("scheduled_at", since).order("scheduled_at", { ascending: true }),
    );
  },
  async getDailyNote(dateISO) {
    try {
      const { data, error } = await sbc().from("clinic_notes").select("note_date, content, updated_by, updated_at").eq("note_date", dateISO).maybeSingle();
      if (error) return dailyNoteLocalGet(dateISO); // pre-0080 backend → device-local
      return (data as DailyNote | null) ?? null;
    } catch { return dailyNoteLocalGet(dateISO); }
  },
  async saveDailyNote(dateISO, content, author) {
    try {
      const { error } = await sbc().from("clinic_notes").upsert(
        { note_date: dateISO, content, updated_by: author ?? null, updated_at: new Date().toISOString() },
        { onConflict: "clinic_id,note_date" },
      );
      if (error) dailyNoteLocalSet(dateISO, content, author);
    } catch { dailyNoteLocalSet(dateISO, content, author); }
  },
  async listDoctorBusySlots(doctorIds, fromISO, toISO) {
    const out: Record<string, string[]> = {};
    if (doctorIds.length === 0) return out;
    try {
      const { data, error } = await sbc().rpc("doctor_busy_slots", { p_doctors: doctorIds, p_from: fromISO, p_to: toISO });
      if (error) return out; // pre-0079 backend — availability badges just don't show
      for (const row of (data as { doctor_id: string; scheduled_at: string }[]) ?? []) {
        (out[row.doctor_id] ??= []).push(row.scheduled_at);
      }
      return out;
    } catch { return out; }
  },
  async listClinicDirectory() {
    // Pre-0078 backend (RPC missing) → empty directory, the wizard copes.
    try {
      const { data, error } = await sbc().rpc("clinic_directory");
      if (error) return [];
      return ((data as { id: string; name: string; city: string | null; phone: string | null }[]) ?? []);
    } catch { return []; }
  },
  async listClinicStaffPublic(clinicId) {
    try {
      const { data, error } = await sbc().rpc("clinic_staff_public", { p_clinic: clinicId });
      if (error) return [];
      return ((data as { id: string; name: string; role: string; specialty: string | null }[]) ?? []);
    } catch { return []; }
  },
  async createAppointment(input) {
    return need<Appointment>(await sbc().from("appointments").insert(input).select().single());
  },
  async updateAppointment(id, patch) {
    return updated<Appointment>(await sbc().from("appointments").update(patch).eq("id", id).select().maybeSingle());
  },
  async setAppointmentStatus(id, status) {
    ok(await sbc().from("appointments").update({ status }).eq("id", id));
  },
  async listTreatments(petId) {
    return listOf<TreatmentEntry>(await sbc().from("treatment_entries").select("*").eq("pet_id", petId).order("day", { ascending: true }).order("time", { ascending: true }));
  },
  async listAllTreatments(petIds) {
    return inChunks(petIds, (c) => allPages<TreatmentEntry>(() => sbc().from("treatment_entries").select("*").in("pet_id", c)));
  },
  async listClinicTreatments(clinicId, day, range) {
    // limit(5000) كان يُقصّ على 1000 من الخادم — طبلات اليوم النشط تفوقها بسهولة.
    return allPages<TreatmentEntry>(() => {
      let q = sbc().from("treatment_entries").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      if (day) q = q.eq("day", day);
      return inRange(q, "day", range);
    }, { col: "day", asc: false, kind: "date" });
  },
  async addTreatment(input) {
    return need<TreatmentEntry>(await sbc().from("treatment_entries").insert(input).select().single());
  },
  async addTreatments(inputs) {
    if (inputs.length === 0) return;
    // `amount` و`medication` عمودان **not null** بالقاعدة منذ الهجرة الأولى.
    // والحارس هنا لا بالنداء: أي مُنادٍ ينسى الكمية يُسقط الدفعة كلّها برفضٍ
    // من القاعدة، والقيد لا يُقرأ من موضع النداء. فالتطبيع مرّةً واحدة عند
    // البوّابة أضمن من تذكّره بكل موضع.
    const rows = inputs.map((r) => ({ ...r, amount: r.amount ?? "", medication: r.medication ?? "" }));
    ok(await sbc().from("treatment_entries").insert(rows)); // دفعة وحدة — رحلة سيرفر واحدة
  },
  async deleteTreatment(id) {
    ok(await sbc().from("treatment_entries").delete().eq("id", id));
  },
  async listSurgeries(petId) {
    // Pre-0073 backend (table missing) must never break the case page — empty list.
    try {
      return listOf<Surgery>(await sbc().from("surgeries").select("*").eq("pet_id", petId).order("performed_at", { ascending: false }));
    } catch { return []; }
  },
  async addSurgery(input) {
    return need<Surgery>(await sbc().from("surgeries").insert(input).select().single());
  },
  async listAllSurgeries() {
    try {
      return listOf<Surgery>(await sbc().from("surgeries").select("*").order("performed_at", { ascending: false }).limit(500));
    } catch { return []; }
  },
  async updateSurgery(id, patch) {
    ok(await sbc().from("surgeries").update(patch).eq("id", id));
  },
  async deleteSurgery(id) {
    ok(await sbc().from("surgeries").delete().eq("id", id));
  },
  async setTreatmentGiven(id, given, by, at) {
    ok(await sbc().from("treatment_entries").update({ administered_at: given ? (at || new Date().toISOString()) : null, administered_by: given ? by : null, ...(given ? { missed_reason: null } : {}) }).eq("id", id));
  },
  async setTreatmentResult(id, result, by, at) {
    ok(await sbc().from("treatment_entries").update({ result, administered_at: at || new Date().toISOString(), administered_by: by ?? null, missed_reason: null }).eq("id", id));
  },
  async setTreatmentMissed(id, reason) {
    ok(await sbc().from("treatment_entries").update({ missed_reason: reason }).eq("id", id));
  },
  async updateTreatment(id, patch) {
    ok(await sbc().from("treatment_entries").update(patch).eq("id", id));
  },
  async listAdmissions(clinicId) {
    // Newest case first — order by the precise created_at so cases opened on the same
    // day still sort by real entry order (the day-only admitted_on can't distinguish them).
    let q = sbc().from("admissions").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Admission>(await q);
  },
  async listAdmissionsForPet(petId) {
    return listOf<Admission>(await sbc().from("admissions").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async addAdmission(input) {
    // Omit a null branch_id so a pre-0042 database (no column yet) keeps working —
    // a real branch id can only exist after that migration created the table.
    const { branch_id, ...rest } = input;
    const row = branch_id ? { ...rest, branch_id } : rest;
    return need<Admission>(await sbc().from("admissions").insert(row).select().single());
  },
  async listPetMovements(petId) {
    return listOf<PetMovement>(await sbc().from("pet_movements").select("*").eq("pet_id", petId).order("at", { ascending: false }));
  },
  async updateAdmission(id, patch) {
    ok(await sbc().from("admissions").update(patch).eq("id", id));
  },
  async listBranches(clinicId) {
    // RLS already scopes to the clinic; the explicit filter is belt-and-suspenders.
    let q = sbc().from("branches").select("*").eq("is_active", true)
      .order("is_main", { ascending: false }).order("created_at", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Branch>(await q);
  },
  async createBranch(input) {
    // clinic_id is stamped server-side by the auth_clinic() column default.
    const { clinic_id: _omit, ...row } = input;
    return need<Branch>(await sbc().from("branches").insert(row).select().single());
  },
  async updateBranch(id, patch) {
    ok(await sbc().from("branches").update(patch).eq("id", id));
  },
  async listReminders(filter) {
    return allPages<Reminder>(() => {
      let q = sbc().from("reminders").select("*");
      if (filter && "ownerId" in filter) {
        q = filter.ownerId == null ? q.is("owner_id", null) : q.eq("owner_id", filter.ownerId);
      }
      return q;
    }, { col: "date", asc: true, kind: "date" });
  },
  async addReminder(input) {
    return need<Reminder>(await sbc().from("reminders").insert(input).select().single());
  },
  async updateReminder(id, patch) {
    ok(await sbc().from("reminders").update(patch).eq("id", id));
  },
  async removeReminder(id) {
    ok(await sbc().from("reminders").delete().eq("id", id));
  },
  async listReminderMarks() {
    // قائمةٌ يُبنى عليها «أحمر أم تمّ» — تُرمى ولا تُبلع: صفرٌ هنا يعيد كلَّ تذكيرٍ «تمّ»
    // أحمرَ، فيُعاد إرسالُه لصاحبه. **وبلا حدٍّ بالتاريخ**: حدُّ ٧٣٠ يوماً كان يُسقط علامةَ
    // لقاحٍ أقدم (والمعلَّقُ لا يشيخ بالشاشة) فيعود أحمرَ بعد تحديث. تنمو بتذكيرٍ لكلّ موعد.
    return allPages<ReminderMark>(() => sbc().from("reminder_marks").select("*"));
  },
  async markReminderDone(rowKey, dueDate) {
    // `sent_at` ليس بالحمولة: فوق «أُرسلت» يبقى يومُها، فالتراجعُ يعيدها «أُرسلت» لا حمراء.
    return updated<ReminderMark>(await sbc().from("reminder_marks")
      .upsert({ row_key: rowKey, due_date: dueDate, state: "done", marked_at: new Date().toISOString() }, { onConflict: "clinic_id,row_key,due_date" })
      .select().maybeSingle());
  },
  async markReminderSent(rowKey, dueDate) {
    const now = new Date().toISOString();
    // إعادةُ إرسالٍ لصفٍّ «أُرسلت»: يتجدّد اليوم (مهلةُ السماح تُعدّ منه).
    const up = await sbc().from("reminder_marks").update({ sent_at: now, marked_at: now })
      .eq("row_key", rowKey).eq("due_date", dueDate).eq("state", "sent").select("id");
    if (up.error) throw new Error(up.error.message);
    if (((up.data as unknown[] | null) ?? []).length > 0) return;
    // وإلا إدراجٌ يُتجاهَل عند التعارض: لا يُنزل «تمّ» إلى «أُرسلت».
    ok(await sbc().from("reminder_marks")
      .upsert({ row_key: rowKey, due_date: dueDate, state: "sent", sent_at: now, marked_at: now }, { onConflict: "clinic_id,row_key,due_date", ignoreDuplicates: true }));
  },
  async undoReminderDone(rowKey, dueDate) {
    const now = new Date().toISOString();
    const back = await sbc().from("reminder_marks").update({ state: "sent", marked_at: now })
      .eq("row_key", rowKey).eq("due_date", dueDate).eq("state", "done").not("sent_at", "is", null).select();
    if (back.error) throw new Error(back.error.message);
    // عادت «أُرسلت»: الصفُّ كما ردّه الخادم هو ما بقي.
    const kept = ((back.data as ReminderMark[] | null) ?? [])[0];
    if (kept) return kept;
    const gone = await sbc().from("reminder_marks").delete()
      .eq("row_key", rowKey).eq("due_date", dueDate).eq("state", "done").select("id");
    if (gone.error) throw new Error(gone.error.message);
    // لا صفّ تغيّر ⇒ لا «تراجعتُ» كاذبة: السياسةُ ردّت، أو تغيّر من جهازٍ آخر.
    if (((gone.data as unknown[] | null) ?? []).length === 0) assertUpdated<ReminderMark>(undefined);
    return null;
  },

  /* ---------------- Inventory & POS ---------------- */
  async listProducts(clinicId) {
    // العيادة الكبيرة تتجاوز ألف منتج — بلا صفحات كان الجديد «يختفي» بعد الحد.
    // العيادةُ تحدّدها سياسةُ الصفوف بالخادم (auth_clinic) لا الواجهة: مرشّحٌ
    // ثانٍ هنا بمعرّفٍ تحسبه الواجهة كان طريقاً لإخفاء منتجاتٍ لو اختلف
    // الحسابان يوماً (عضويات متعدّدة). الخادم يرجع منتجات عيادتك ولا غيرها.
    void clinicId;
    // `is("farm_id", null)`: مخزنُ العيادة لا يرى مخزنَ الحقل (0191).
    return allPages<Product>(() => sbc().from("products").select("*").is("farm_id", null), { col: "name", asc: true, kind: "text" });
  },
  async listFarmProducts(farmId: string) {
    return allPages<Product>(() => sbc().from("products").select("*").eq("farm_id", farmId), { col: "name", asc: true, kind: "text" });
  },
  async supportsBulkGroup() {
    try {
      const r = await sbc().from("products").select("bulk_group").limit(1);
      // خطأ يذكر العمود = الترحيل 0075 غير منفَّذ بعد على قاعدة هذه العيادة.
      return !(r.error && /bulk_group/i.test(r.error.message));
    } catch {
      return true; // فشل شبكة — لا نُظهر تحذيراً خاطئاً
    }
  },
  async getProductById(id) {
    // سياسةُ الصفوف تحصرها بعيادة المُستدعي؛ و`is(farm_id, null)` مرآةُ listProducts.
    // والخطأُ يُرمى لا يُبلَع: «ما وصلنا الخادم» غيرُ «رصيده صفر» (zeroStockVerdict).
    const r = await sbc().from("products").select("*").eq("id", id).is("farm_id", null).maybeSingle();
    if (r.error) throw r.error;
    return (r.data ?? undefined) as Product | undefined;
  },
  async getSectionPool(sectionId) {
    // سياسةُ الصفوف تحصرها بعيادة المُستدعي (كما `listCompanySections` للكاشير نفسه).
    const r = await sbc().from("company_sections").select("pooled_stock").eq("id", sectionId).maybeSingle();
    if (r.error) throw r.error;
    return Number((r.data as { pooled_stock?: number | null } | null)?.pooled_stock ?? 0);
  },
  // العيادةُ تأتي من سياسات الصفوف لا من معامِلٍ: `product_by_code` بصلاحية
  // المُستدعي، فـauth_clinic() تحصرها. المعامِلُ يبقى بالتوقيع للنسخة التجريبية.
  async getProductByBarcode(barcode, _clinicId) {
    const code = matchCode(barcode);
    if (!code) return undefined;
    // دالّةُ القاعدة تقرأ `barcode` والرموزَ الإضافية معاً (0141)، وبصلاحية
    // المُستدعي فسياساتُ الصفوف تحصرها بعيادته.
    const r = await sbc().rpc("product_by_code", { p_code: code });
    if (!r.error) {
      const rows = (r.data ?? []) as Product[];
      // صفّان = رمزٌ ملتبس. نرجّع الأوّل ونصرخ بالكونسول بدل ما نبلعه صامتين
      // ونقول «غير موجود» — وهذا بالضبط ما كانت تفعله maybeSingle.
      if (rows.length > 1) sayAmbiguousCode(code, rows.length);
      return rows[0];
    }
    /* **فشلُ النداء ليس «غير موجود».** أيُّ خطأٍ يُرمى ليقول الكاشيرُ «ما وصل
     * الخادم — أعد المسح»؛ ولا يُبلَع فيصير «مو موجود بمخزنك» عن مادةٍ على
     * الرفّ، فذاك ما كلّف عياداتٍ إعادةَ إدخال بضاعتها.
     *
     * ولا مسارَ سقوطٍ بديل (ع١٠). كان هنا استعلامٌ مباشر لقاعدةٍ لم تنزل عليها
     * 0141 — وكان **نصفَ مطبَّع**: يقارن `matchCode` المطويَّ حالةً بمخزونٍ
     * محفوظٍ بحالته، فـ«W90» لا يطابق مسحتَه بذلك المسار أبداً. وهو نقضُ
     * القاعدة المعلنة بـ`utils.ts`: الطرفان من نفس الدالّة، وتطبيعُ طرفٍ
     * واحد أسوأ من لا تطبيع. وفرعٌ نائمٌ غيرُ مفحوصٍ إن استيقظ استيقظ خاطئاً.
     * فغيابُ الدالّة صار خطأ إعدادٍ يُسمّي هجرتَه، لا صمتاً يُصدَّق. */
    const missing = r.error.code === "PGRST202" || r.error.code === "42883";
    if (missing) {
      throw new Error("lookup_fn_missing: product_by_code (migrations 0141/0165/0172/0173)");
    }
    throw r.error;
  },
  async attachProductCode(productId, code) {
    // الخادمُ يخزّن ما يصله بـalt_codes — فيصله رمزُ الحفظ (بلا طيّ حالة)،
    // لا رمزُ المطابقة. (بلا مستدعٍ من الواجهة منذ أيلول ٢٠٢٦ — G11.)
    if (!matchCode(code)) throw new Error("empty code");
    const { data, error } = await sbc().rpc("attach_product_code", { p_product: productId, p_code: normalizeCode(code) });
    if (error) throw error;
    return data as Product;
  },
  async createProduct(input) {
    // المعرف يولد بالجهاز: فشل الشبكة يدخل صندوق الصادر ويُرفع لاحقاً بنفس
    // المعرف (upsert متجاهل التكرار) — لا منتج يضيع ولا يزدوج بضعف النت.
    // والباركود يُطبَّع عند الحفظ بنفس دالّة المسح، وإلا خُزّن بشكلٍ لا يُمسح.
    const row = { id: uuid(), ...input, barcode: normalizeCode(input.barcode) || null };
    try {
      // قبل ترحيلي 0075/0124 قد يغيب bulk_group أو sold_by_weight — أعد
      // المحاولة بدون العمود الناقص كي لا يفشل إنشاء المنتج كله.
      const r = await sbc().from("products").insert(row).select().single();
      if (r.error && /bulk_group|sold_by_weight/i.test(r.error.message)) {
        const { bulk_group, sold_by_weight, ...rest } = row as Record<string, unknown>;
        void bulk_group; void sold_by_weight;
        return need<Product>(await sbc().from("products").insert(rest as never).select().single());
      }
      return need<Product>(r);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("products", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as Product;
    }
  },
  /* ── مكتبة صور المنصّة (0175): الجدول يقرؤه الجميع ويكتبه المشغّل وحده
   *    (سياسات is_platform_admin بالقاعدة — لا حارسَ واجهةٍ يُعتمد عليه). ── */
  async listImageLibrary() {
    // `listOrThrow` لا `listOf`: منتقي المكتبة بفشلٍ صامتٍ يقول «ما بيها صور»
    // فيصوّر المستخدمُ المادّةَ من جديد — والصورةُ موجودةٌ بالمكتبة (البند ٢٠).
    return listOrThrow<LibraryImage>(await sbc().from("image_library").select("*").order("company", { ascending: true }).order("name", { ascending: true }).limit(1000));
  },
  async createLibraryImage(meta, upload) {
    const id = uuid();
    // الامتدادُ من `prepareUpload` لا ثابتاً: هي تُعيد الترميزَ إلى JPEG دائماً،
    // فاسمُ `.webp` كان يكذب على كلّ ملفٍّ بالدلو (البند ١٠).
    assertUploadableImage(upload);
    const path = `library/${id}.${imageExt(upload)}`;
    const up = await sbc().storage.from("product-images").upload(path, upload.blob, { contentType: imageType(upload), upsert: false });
    if (up.error) throw up.error;
    return need<LibraryImage>(await sbc().from("image_library").insert({
      id, name: meta.name.trim(), company: meta.company?.trim() || null,
      section: meta.section?.trim() || null, barcode: normalizeCode(meta.barcode) || null, path,
    }).select().single());
  },
  async deleteLibraryImage(id, path) {
    const r = await sbc().from("image_library").delete().eq("id", id);
    if (r.error) throw r.error;
    // الملف بعد الصفّ وبأفضل جهد: يتيمٌ لا يُرى أهون من صفٍّ بلا ملف.
    try { await sbc().storage.from("product-images").remove([path]); } catch { /* swallow-ok: الملف اليتيم لا يظهر بالمنتقي (الصفُّ راح) ولا يُحاسَب حجماً يُذكر */ }
  },
  async imageLibraryUsage(path) {
    const { data, error } = await sbc().rpc("image_library_usage", { p_path: path });
    if (error) throw error;
    return Number(data ?? 0);
  },
  /** صورة المنتج (0174): البايتات إلى bucket «product-images» بمسار
   *  `<clinic>/<product>-<ts36>.<ext>` — سياسةُ المخزن تشترط تطابق المجلد مع
   *  `auth_clinic()`، فرفعٌ بعيادةٍ غلط يُرفض من الخادم لا من الواجهة.
   *  والقاعدة تحمل المسارَ نصاً فقط (درسُ base64 بالشعارات — لا بايتات بجدول).
   *
   *  **المسارُ فريدٌ لكلّ رفعة** (البند ٩): كان ثابتاً بـ`upsert:true`، فالرابطُ
   *  العامّ لا يتغيّر عند الاستبدال — و`productImageUrl` تبنيه من المسار وحده
   *  بلا كاسرِ ذاكرة. فالعيادةُ تبدّل صورةً خاطئة وتبقى ترى القديمة بمتصفّحها
   *  وبشبكة التوزيع، فتبدّلها ثانيةً وثالثة. الفريدُ يُنهيها من جذرها،
   *  و`cacheControl` سنةً كاملة يصير **صحيحاً** بعد أن صار المسارُ لا يُعاد.
   *  و`upsert:false` تكشف تصادماً لو وقع بدل أن تطمسه.
   *
   *  والنوعُ يُحرَس هنا **مرآةً لقائمة الدلو (0184)**: `prepareUpload` تمرّر
   *  غيرَ الصور كما هي عمداً (تقاريرُ المختبر PDF)، فمن اختار PDF بمنتقي صورةِ
   *  المنتج كان يرفعه وينجح وتبقى البطاقةُ فارغة. الرفضُ هنا برسالةٍ مترجَمة
   *  أصدقُ من خطأ storage إنكليزيٍّ خام. */
  async uploadProductImage(clinicId, productId, upload) {
    if (!clinicId) throw new Error("no_clinic_for_image");
    assertUploadableImage(upload);
    const path = `${clinicId}/${productId}-${Date.now().toString(36)}.${imageExt(upload)}`;
    const up = await sbc().storage.from("product-images").upload(path, upload.blob, {
      contentType: imageType(upload),
      cacheControl: "31536000",
      upsert: false,
    });
    if (up.error) throw up.error;
    return path;
  },
  async deleteProductImage(clinicId, productId, path) {
    void clinicId; void productId;
    // أفضل جهدٍ: بقاءُ ملفٍ يتيمٍ أهون من إفشال تصفير المسار — والمسار data: تجريبيّ
    // لا ملف له. وملفُ المكتبة (library/) ملكُ المنصّة يخدم كلَّ العيادات:
    // «شيل الصورة» بعيادةٍ يفكّ مرجعَها هي، ولا يحذف ملفاً مشترَكاً أبداً.
    if (!path || path.startsWith("data:") || path.startsWith("library/")) return;
    // ولا يُحذف ملفٌّ ما زال صفٌّ آخرُ يشير إليه. صار هذا ممكناً بـ0184: الدمجُ
    // يورّث `image_path` للأصل، فالأصلُ والمطويُّ (إن رجع من سلّة المحذوفات)
    // يشيران لملفٍّ واحد. حذفُه من أحدهما كان سيكسر صورةَ الآخر بصمت — وهو
    // بالضبط صنفُ «اختفى كأنه ما كان». والنداءُ محدودٌ بعيادتنا بالسياسة،
    // ومسارُ المكتبة المشترَك خرج فوقُ أصلاً.
    const refs = await sbc().from("products").select("id").eq("image_path", path).limit(1);
    // فشلُ العدّ ⇒ لا نحذف. «ما أعرف» تعني «لا تلمس»، لا «امضِ».
    if (refs.error || (refs.data ?? []).length > 0) return;
    try { await sbc().storage.from("product-images").remove([path]); } catch { /* swallow-ok: ملفٌ يتيمٌ لا يُرى ولا يُحاسَب، والحذفُ يُعاد من أي حفظٍ لاحق */ }
  },
  /* ── حقولُ الدواجن (0191/0192) — السحابيّ ───────────────────────────────
   * القوائمُ من `listOrThrow` لا `listOf`: قائمةُ دفعاتٍ ناقصةٌ بصمتٍ تعني
   * دفعةً يظنّها الدكتورُ مغلقةً فيفتح ثانيةً بنفس الجملون — والقاعدةُ ترفض
   * فيظهر خطأٌ لا معنى له. «قائمةٌ ناقصةٌ أخطرُ من خطأٍ ظاهر». */
  async listPoultryFarms() {
    return listOrThrow<PoultryFarm>(await sbc().from("poultry_farms").select("*").eq("archived", false).order("created_at", { ascending: false }).limit(500));
  },
  async addPoultryFarm(input) {
    return need<PoultryFarm>(await sbc().from("poultry_farms").insert(input).select().single());
  },
  async listPoultryHouses(farmId) {
    return listOrThrow<PoultryHouse>(await sbc().from("poultry_houses").select("*").eq("farm_id", farmId).eq("archived", false).order("label", { ascending: true }).limit(500));
  },
  async addPoultryHouse(input) {
    return need<PoultryHouse>(await sbc().from("poultry_houses").insert(input).select().single());
  },
  async listPoultryCycles(farmId) {
    return listOrThrow<PoultryCycle>(await sbc().from("poultry_cycles").select("*").eq("farm_id", farmId).order("placed_on", { ascending: false }).limit(500));
  },
  async openPoultryCycle(input) {
    const r = await sbc().from("poultry_cycles").insert(input).select().single();
    // الفهرسُ الفريدُ الجزئيّ بالخادم هو الحكم؛ نترجم رمزَه لرسالةٍ تُفهم.
    if (r.error && /poultry_cycles_one_active_per_house|23505/.test(`${r.error.code} ${r.error.message}`)) {
      throw new Error("house_has_active_cycle");
    }
    return need<PoultryCycle>(r);
  },
  async closePoultryCycle(id, close) {
    if (!close.closed_on) throw new Error("close_needs_date");
    return updated<PoultryCycle>(await sbc().from("poultry_cycles").update({ ...close, status: "closed" }).eq("id", id).select());
  },
  async listPoultryDaily(cycleId) {
    return listOrThrow<PoultryDaily>(await sbc().from("poultry_daily").select("*").eq("cycle_id", cycleId).order("on_date", { ascending: false }).limit(1000));
  },
  /** `upsert` على (cycle_id,on_date): إعادةُ إدخال يومٍ تصحيحٌ لا صفٌّ ثانٍ. */
  /** إدخالُ اليوم — **يعيش بلا نت**.
   *
   *  الجملونُ على طرف قرية، والدكتورُ يكتب نفوقَ اليوم واقفاً. وكانت هذه
   *  تُرمى بفشل الشبكة فيضيع اليوم: لا أحدَ يرجع بعد ساعةٍ ليعيد كتابةَ ما
   *  عدّه. فصارت تدخل صندوق الصادر بمفتاحها الطبيعيّ (الدفعة + التاريخ)،
   *  ونُرجع ما كتبه كأنّه حُفظ — لأنه سيُحفظ. */
  async savePoultryDaily(input) {
    const opId = `poultry_daily:${input.cycle_id}:${input.on_date}`;
    const row = { ...input, updated_at: new Date().toISOString() };
    try {
      const saved = need<PoultryDaily>(await sbc().from("poultry_daily")
        .upsert(row, { onConflict: "cycle_id,on_date" }).select().single());
      // نجحت أونلاين ⇒ نسخةٌ قديمةٌ بالطابور لنفس اليوم لا يجوز أن تدهسها بعدُ.
      outboxDrop(opId);
      return saved;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("poultry_daily", row, { id: opId, conflict: "cycle_id,on_date" })) throw e;
      /* المُرجَعُ محلّيٌّ بمعرّفٍ اصطناعيّ: الشاشةُ تستعمله مفتاحَ عرضٍ لا أكثر،
         والقاعدةُ تولّد المعرّفَ الحقيقيّ حين ينزل الصفّ. */
      return { ...(input as object), id: opId, created_at: row.updated_at } as PoultryDaily;
    }
  },
  async listPoultryUse(cycleId) {
    return listOrThrow<PoultryUse>(await sbc().from("poultry_use").select("*").eq("cycle_id", cycleId).order("on_date", { ascending: false }).limit(2000));
  },
  /** الصرفُ من دالّةٍ لا بكتابتين: الخصمُ والسطرُ معاً أو لا شيء (0192). */
  async poultryConsume(input) {
    /* مرجعُ المحاولة يولَد هنا دائماً، لا عند الفشل: الطابورُ يرفض نداءً بلا
     * مرجع، ومن يولّده بعد الفشل يكون قد فقد المرجعَ الذي ذهب مع المحاولة
     * الأولى — فتصير الإعادةُ خصماً ثانياً (درس 0171). */
    const args = {
      p_cycle: input.cycle_id, p_kind: input.kind, p_product: input.product_id ?? null,
      p_name: input.name ?? null, p_qty: input.qty, p_unit: input.unit ?? null,
      p_on_date: input.on_date ?? null, p_note: input.note ?? null,
      p_withdrawal: input.withdrawal_days ?? null,
      p_meta: { client_ref: input.client_ref ?? uid("pcon") },
    };
    try {
      const { data, error } = await sbc().rpc("poultry_consume", args);
      if (error) throw new Error(error.message);
      return (data ?? { ok: false }) as PoultryConsumeResult;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueueRpc("poultry_consume", args as unknown as Record<string, unknown>)) throw e;
      /* الصرفُ سينزل، ولا شيءَ بعده ينتظر معرّفَه (بخلاف البيعة). فنُرجع
       * «تمّ» بلا `stock_after` ولا `shortfall`: رقمُ رصيدٍ نخترعه هنا قد
       * يخالف ما ستُنتجه القاعدة، وصمتٌ أصدقُ من رقمٍ يُصدَّق ثم يتبدّل. */
      return { ok: true, queued: true } as PoultryConsumeResult;
    }
  },
  async poultryUnconsume(useId) {
    const { data, error } = await sbc().rpc("poultry_unconsume", { p_use: useId });
    if (error) throw new Error(error.message);
    return (data ?? { ok: false }) as { ok: boolean; returned?: number };
  },
  async poultryCycleStats(cycleId) {
    const { data, error } = await sbc().rpc("poultry_cycle_stats", { p_cycle: cycleId });
    if (error) throw new Error(error.message);
    const row = (data as PoultryCycleStats[] | null)?.[0];
    return row ? { ...row, placed_count: Number(row.placed_count) || 0, dead: Number(row.dead) || 0, culled: Number(row.culled) || 0,
      alive: Number(row.alive) || 0, feed_kg: Number(row.feed_kg) || 0, feed_cost: Number(row.feed_cost) || 0,
      med_cost: Number(row.med_cost) || 0, other_cost: Number(row.other_cost) || 0, chick_cost: Number(row.chick_cost) || 0,
      days: Number(row.days) || 0,
      // النصُّ والرايةُ يمرّان كما هما — و`?? false` لأن قاعدةً قبل 0193 ترجع
      // `undefined`، و«مجهول» أسلمُ من «آمن» لكنّ «لا دواءَ أصلاً» ليس مجهولاً.
      safe_from: row.safe_from ?? null,
      withdrawal_unknown: row.withdrawal_unknown ?? false } : null;
  },

  /** شعار العيادة إلى الدلو (0190) — تصحيحُ سجلٍّ قبل أن يكون ميزة.
   *
   *  ترويسةُ 0174 تقول «الصورة لا تدخل جداول القاعدة أبداً» وتذكر أن شعارات
   *  base64 «نُظّفت يدوياً في ٩ أيلول». القياسُ يقول غيرَ ذلك: سبعةُ صفوفٍ في
   *  `clinic_prefs.logo_url` كلُّها `data:`، أكبرُها ١٠٦ آلاف محرف، ومعها ١٢٣
   *  صفَّ تدقيقٍ تحمل الصورةَ نفسها = ٥ ميغابايت من ١٨ (٢٨٪). التنظيفُ اليدويّ
   *  يمحو الماضي ولا يمنع الغد؛ الرفعُ إلى الدلو يمنعه.
   *
   *  والمسارُ داخل مجلّد العيادة بالضبط ليَحكمه ما يحكم صورةَ المنتج: سياسةُ
   *  المخزن تشترط `(storage.foldername(name))[1] = auth_clinic()`، فرفعُ شعارٍ
   *  بعيادةٍ غلط يُرفض من الخادم. ولا سياسةَ جديدة ولا دلوَ جديد — الدلوُ
   *  القائم وسياساتُه تكفي، وكلُّ سياسةٍ زائدة سطحُ خطأٍ زائد.
   *
   *  والطابعُ الزمنيّ بالمسار كدرس 0174 نفسه: الاستبدالُ يولّد رابطاً جديداً
   *  فلا تبقى العيادةُ ترى شعارَها القديم بذاكرة المتصفّح وشبكة التوزيع. */
  async uploadClinicLogo(clinicId, upload) {
    if (!clinicId) throw new Error("no_clinic_for_image");
    assertUploadableImage(upload);
    const path = `${clinicId}/logo-${Date.now().toString(36)}.${imageExt(upload)}`;
    const up = await sbc().storage.from("product-images").upload(path, upload.blob, {
      contentType: imageType(upload),
      cacheControl: "31536000",
      upsert: false,
    });
    if (up.error) throw up.error;
    return path;
  },
  /** الشعارُ القديم بعد نجاح الجديد. `data:` لا ملفَ له، ومسارُ المكتبة ليس
   *  ملكَ العيادة — وكلاهما يخرج قبل أي حذف. وأفضلُ جهد: يتيمٌ أهون من إفشال
   *  حفظِ شعارٍ نجح فعلاً. */
  async deleteClinicLogo(clinicId, path) {
    void clinicId;
    if (!path || path.startsWith("data:") || path.startsWith("library/")) return;
    try { await sbc().storage.from("product-images").remove([path]); } catch { /* swallow-ok: ملفٌ يتيمٌ لا يُرى ولا يُحاسَب، والشعارُ الجديد محفوظٌ أصلاً */ }
  },
  async updateProduct(id, patch) {
    // نفس تطبيع الإنشاء — تعديلٌ يكتب باركوداً غيرَ مطبَّع يعيد المشكلة.
    if ("barcode" in patch) patch = { ...patch, barcode: normalizeCode(patch.barcode) || null };
    const r = await sbc().from("products").update(patch).eq("id", id).select().maybeSingle();
    if (r.error && /bulk_group|sold_by_weight/i.test(r.error.message)) {
      const { bulk_group, sold_by_weight, ...rest } = patch as Record<string, unknown>;
      void bulk_group; void sold_by_weight;
      return updated<Product>(await sbc().from("products").update(rest as never).eq("id", id).select().maybeSingle());
    }
    return updated<Product>(r);
  },
  async deleteProduct(id, reason) {
    // طيٌّ لا محو (0145): الصفّ يُحفظ بالسلّة بصورته وسطورِ فواتيره، فيُستعاد
    // بنفس معرّفه. الحذفُ المباشر كان يجعل المنتج «كأنه ما كان» — وقد كان.
    const { error } = await sbc().rpc("delete_product", { p_id: id, p_reason: reason ?? null });
    if (error) throw error;
  },
  async listDeletedProducts() {
    // كانت الوحيدةَ بين قوائم كيانات المخزن العشر بطلبٍ واحد بلا صفحات: سقفُ
    // الألف يقصّها بصمت، وخطؤها يُبلع فتقول شاشةُ الاسترجاع «ماكو محذوفات» —
    // فتعيد العيادةُ إدخال ما حذفته بالغلط توأماً وتفقد تاريخه. `allPages`
    // تكسر السقفَ وترمي على الفشل معاً (وتضيف id كاسرَ تعادلٍ للترتيب).
    return allPages<DeletedProduct>(() => sbc().from("products_trash").select("*"), { col: "deleted_at", asc: false, kind: "time" });
  },
  async productSaleLines(id) {
    // عدٌّ لا صفوف — فلا يمسّه سقفُ الألف.
    const { count, error } = await sbc().from("invoice_items").select("id", { count: "exact", head: true }).eq("product_id", id).gt("qty", 0);
    if (error) throw error;
    return count ?? 0;
  },
  async restoreProduct(id) {
    const { data, error } = await sbc().rpc("restore_product", { p_id: id });
    if (error) throw error;
    return data as Product;
  },
  async mergeProducts(keepId, dropId) {
    const { data, error } = await sbc().rpc("merge_products", { p_keep: keepId, p_drop: dropId });
    if (error) throw error;
    return data as Product;
  },

  async barcodeHealth() {
    // تشخيصٌ لا لوحةُ مال — لكنه يُقرأ قراراً («ادمج هذين»)، فقائمةٌ ناقصةٌ عن
    // خطأٍ أسوأ من خطأ ظاهر. نرمي، والشاشةُ تقول «أعد المحاولة».
    const r = await sbc().rpc("verify_barcode_health");
    if (r.error) throw r.error;
    return (r.data ?? []) as BarcodeHealthRow[];
  },

  /* ---------------- Companies (الشركات) ---------------- */
  async listGeneratedBarcodes() {
    return allPages<GeneratedBarcode>(() =>
      sbc().from("generated_barcodes").select("*"),
      { col: "created_at", asc: false, kind: "time" },
    );
  },
  async updateGeneratedBarcode(id, patch) {
    ok(await sbc().from("generated_barcodes").update(patch).eq("id", id));
  },
  async addGeneratedBarcodes(rows) {
    // clinic_id يُختم من default العمود؛ upsert بتجاهل التعارض يحاكي سلوك الديمو
    // (كود موجود سابقاً لا يُدرج مرتين ولا يفشّل الدفعة كلها).
    const payload = rows.map(({ clinic_id, ...rest }) => { void clinic_id; return rest; });
    // التعارضُ المتجاهَل ليس خطأً (قد تنقص الصفوفُ الراجعة) — أما خطأُ الإدراج
    // فيُرمى: كانت تُبلع فتُطبع ملصقاتٌ لا وجودَ لها بالسجل، والدفعةُ التالية
    // تولّد نفسَ الأرقام فيصير ملصقان برمزٍ واحد على مادّتين.
    return listOrThrow<GeneratedBarcode>(
      await sbc().from("generated_barcodes").upsert(payload, { onConflict: "clinic_id,barcode", ignoreDuplicates: true }).select(),
    );
  },

  /* ---------------- المتجر الإلكتروني (0095) ---------------- */
  async getStoreProfile() {
    return maybe<StoreProfile>(await sbc().from("store_profiles").select("*").maybeSingle()) ?? null;
  },
  async saveStoreProfile(p) {
    // clinic_id يُختم من default العمود (auth_clinic) والصف مفتاحه clinic_id.
    const { clinic_id, ...rest } = p as StoreProfile;
    void clinic_id;
    const res = await sbc().from("store_profiles")
      .upsert({ ...rest, slug: normalizeSlug(p.slug), updated_at: new Date().toISOString() }, { onConflict: "clinic_id" })
      .select().single();
    if (res.error) {
      // قيد slug الفريد → رسالة مفهومة بدل نص Postgres الخام.
      if (/store_profiles_slug_unique|duplicate key/i.test(res.error.message)) throw new Error("slug_taken");
      if (/store_slug_format|violates check/i.test(res.error.message)) throw new Error("slug_invalid");
      throw new Error(res.error.message);
    }
    return res.data as StoreProfile;
  },
  async checkStoreSlug(slug) {
    if (!isValidSlug(normalizeSlug(slug))) return false;
    const { data, error } = await sbc().rpc("store_slug_available", { p_slug: normalizeSlug(slug) });
    if (error) throw new Error(error.message);
    return !!data;
  },
  async listStoreOrders(limit = 300) {
    return listOrThrow<StoreOrder>(
      await sbc().from("store_orders").select("*").order("created_at", { ascending: false }).limit(limit),
    );
  },
  /** صندوقُ «الجديد» كاملاً — **بلا سقف**.
   *
   *  الشارةُ تعدّ بالخادم (`count: exact`) بلا سقفٍ أصلاً، والصندوقُ كان يقرأ
   *  آخرَ ٣٠٠ طلبٍ **بكلّ الحالات** ثمّ يصفّي. فطلبٌ جديدٌ وراءه ثلاثُمئةِ قرارٍ
   *  أحدثُ منه لا يصل الصندوقَ أبداً: الشارةُ تقول «١» والصندوقُ يقول «ما اكو
   *  طلبات جديدة» — والصفحةُ تناقض نفسَها بصوتٍ عالٍ. وأسوأُ من التناقض أنّ
   *  الطلبَ **لا يمكن قبولُه ولا رفضُه**؛ الزبونُ ينتظر مكالمةً لن تأتي. */
  /** اقتراحُ رفِّ البداية (0187) — **اقتراحٌ لا كتابة**. */
  async suggestStoreProducts(limit = 40, days = 90) {
    const { data, error } = await sbc().rpc("store_suggest_products", { p_limit: limit, p_days: days });
    // قائمةُ قرارٍ: فشلُها يُرمى. «ما عندك مبيعات» عن فشلِ شبكةٍ يجعل الدكتورَ
    // يظنّ متجرَه بلا بضاعةٍ تستحقّ النشر — وهي «القائمةُ الناقصة تُصدَّق» عينُها.
    if (error) throw error;
    return (data ?? []) as SuggestedProduct[];
  },
  /** نشرٌ/إخفاءٌ جماعيّ بنداءٍ واحد (0186).
   *
   *  كان النشرُ صنفاً صنفاً مع `reload()` كاملة بعد كلّ واحد — وحمولةُ منتجاتِ
   *  أكبر عيادةٍ حيّة **٦٩١ ك.ب**، فأربعون منتجاً ≈ ٢٧ ميغا وضغطاتٌ تُبلَع.
   *  والدالّةُ تقصّ بالعيادة بنفسها وتردّ منتجاً بلا سعر. */
  async setStoreVisible(ids, on) {
    if (!ids.length) return { changed: 0, skipped_no_price: 0 };
    const { data, error } = await sbc().rpc("store_set_visible", { p_ids: ids, p_on: on });
    if (error) throw error;
    const r = (data ?? {}) as { changed?: number; skipped_no_price?: number };
    return { changed: Number(r.changed ?? 0), skipped_no_price: Number(r.skipped_no_price ?? 0) };
  },
  async listNewStoreOrders() {
    return allPages<StoreOrder>(() =>
      sbc().from("store_orders").select("*").eq("status", "new"), { col: "created_at", asc: false, kind: "time" });
  },
  async countNewStoreOrders() {
    /* `head: true` ⇒ عددٌ بلا صفوف. كان الجرسُ يجيب مئةَ طلبٍ كاملةً ببنودها
     * كلَّ ٤٥ ثانية ليعدّ الجديد منها — بياناتُ موبايلٍ يدفعها الدكتور بلا مقابل.
     * وفشلُ العدّ يرمي: صفرٌ صامتٌ هنا يعني جرساً لا يرنّ وطلباً ينتظر. */
    const { count, error } = await sbc().from("store_orders").select("id", { count: "exact", head: true }).eq("status", "new");
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async updateStoreOrder(id, patch) {
    // قرارُ مالٍ يمرّ من هنا: صفرُ صفوفٍ (سياسةٌ ردّت أو معرّفٌ بايت) لازم
    // يصيح، وإلا قيل «قبلت الطلب» ولا شيءَ انحفظ — درسُ «الكتابة تُسمَع».
    updated<StoreOrder>(await sbc().from("store_orders").update(patch).eq("id", id).select().maybeSingle());
  },
  /** القبولُ الذرّيّ (0183): نداءٌ واحد يفعل الفاتورةَ والتوصيلَ والختم.
   *  كان ثلاثَ رحلاتٍ من المتصفّح وكلُّ حدٍّ بينها نقطةُ انكسار. */
  async acceptStoreOrder(id, courierId, fee) {
    return need<{ ok: true; already: boolean; invoice_id: string }>(
      await sbc().rpc("store_accept_order", { p_order: id, p_courier: courierId ?? null, p_fee: fee ?? null }));
  },
  async rejectStaleStoreOrders(olderThanHours = 24) {
    return need<number>(await sbc().rpc("store_reject_stale", { p_older_than_hours: olderThanHours }));
  },
  /* ---- رحلة الحيوان بالعيادة ---- */
  async getActiveJourney(petId) {
    return maybe<Journey>(await sbc().from("journeys").select("*").eq("pet_id", petId).eq("status", "active").maybeSingle()) ?? null;
  },
  async listJourneyEvents(journeyId) {
    return listOf<JourneyEvent>(await sbc().from("journey_events").select("*").eq("journey_id", journeyId).order("created_at", { ascending: true }));
  },
  async createJourney(petId, kind, createdByName) {
    const clinicId = getActiveClinicId();
    // فهرس «رحلة نشطة واحدة» بالقاعدة يمنع التكرار — نعيد الموجودة بدل الفشل.
    const existing = maybe<Journey>(await sbc().from("journeys").select("*").eq("pet_id", petId).eq("status", "active").maybeSingle());
    if (existing) return existing;
    const j = need<Journey>(await sbc().from("journeys").insert({
      clinic_id: clinicId, pet_id: petId, kind, stage: "arrived", token: journeyToken(),
    }).select().single());
    ok(await sbc().from("journey_events").insert({
      journey_id: j.id, clinic_id: clinicId, kind: "stage", stage: "arrived", created_by_name: createdByName ?? null,
    }));
    return j;
  },
  async advanceJourney(journeyId, stage, createdByName) {
    const clinicId = getActiveClinicId();
    ok(await sbc().from("journeys").update({ stage }).eq("id", journeyId).eq("status", "active"));
    ok(await sbc().from("journey_events").insert({
      journey_id: journeyId, clinic_id: clinicId, kind: "stage", stage, created_by_name: createdByName ?? null,
    }));
  },
  async addJourneyNote(journeyId, input, createdByName) {
    ok(await sbc().from("journey_events").insert({
      journey_id: journeyId, clinic_id: getActiveClinicId(),
      kind: input.photo ? "photo" : "message",
      body: input.body?.slice(0, 500) || null, photo: input.photo ?? null,
      created_by_name: createdByName ?? null,
    }));
  },
  async closeJourney(journeyId, opts) {
    ok(await sbc().from("journeys").update({
      status: "closed", closed_at: new Date().toISOString(), ...(opts?.silent ? { silent: true } : {}),
    }).eq("id", journeyId));
  },
  async trackJourneyPublic(token) {
    const { data, error } = await sbc().rpc("track_journey", { p_token: token });
    if (error) throw new Error(error.message);
    const d = data as { ok?: boolean } & JourneyPublicView;
    if (!d?.ok) return null;
    return {
      pet_name: d.pet_name, clinic_name: d.clinic_name, clinic_phone: d.clinic_phone ?? null,
      kind: d.kind, stage: d.stage, status: d.status, started_at: d.started_at,
      events: d.events ?? [],
    };
  },
  async reactJourneyPublic(token, eventId, emoji) {
    const { data, error } = await sbc().rpc("react_journey", { p_token: token, p_event: eventId, p_emoji: emoji });
    if (error) return false;
    return !!(data as { ok?: boolean })?.ok;
  },

  async storeFrontPublic(slug) {
    const { data, error } = await sbc().rpc("store_front", { p_slug: slug });
    if (error) throw new Error(error.message);
    const d = data as { ok?: boolean } & StoreFrontInfo & { error?: string };
    if (!d?.ok) return null;
    return {
      // الشعارُ يصل كما هو بالعمود: مساراً (0190) أو `data:` قديماً. الزائرُ بلا
      // جلسة، والدلوُ عامّ — فالتحويلُ إلى رابطٍ يجري هنا مرّةً لكلّ المستهلكين.
      name: d.name, logo_url: productImageUrl(d.logo_url), phone: d.phone ?? null, whatsapp: d.whatsapp ?? null,
      facebook: d.facebook ?? null, instagram: d.instagram ?? null, bio: d.bio ?? null,
      delivery_fee: Number(d.delivery_fee) || 0, min_order: Number(d.min_order) || 0,
    };
  },
  async storeCatalogPublic(slug, limit = 60, offset = 0) {
    // ما قبل 0096 الدالة بوسيطة واحدة — نعيد النداء بلا صفحات بدل صفحة فارغة.
    let res = await sbc().rpc("store_catalog", { p_slug: slug, p_limit: limit, p_offset: offset });
    if (res.error && offset === 0) res = await sbc().rpc("store_catalog", { p_slug: slug });
    if (res.error) throw new Error(res.error.message);
    return ((res.data ?? []) as StoreCatalogItem[]).map((r) => ({ ...r, price: Number(r.price) || 0 }));
  },
  async trackStoreOrder(slug, orderNo, phone) {
    const { data, error } = await sbc().rpc("store_order_track", { p_slug: slug, p_order_no: orderNo, p_phone: phone });
    if (error) throw error;
    return (data as StoreTrackInfo[] | null)?.[0] ?? null;
  },
  async placeStoreOrder(slug, info, items) {
    const { data, error } = await sbc().rpc("store_place_order", {
      p_slug: slug,
      p_name: info.name,
      p_phone: info.phone,
      p_address: info.address ?? "",
      p_note: info.note ?? "",
      p_items: items,
    });
    if (error) throw new Error(error.message);
    return (data ?? { ok: false, error: "unknown" }) as { ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number };
  },

  /* ---- بوّابة المالك (0158) ----
   * القصُّ كلُّه بالقاعدة: هذه الدوالّ تمرّر ولا تُقرّر. أيُّ ترشيحٍ يُكتب هنا
   * بدل هناك يصير زينةً — من يملك المفتاح العلنيّ ينادي الدالّة بنفسه. */
  async portalRequestCode(slug, phone) {
    const { data, error } = await sbc().rpc("portal_request_code", { p_slug: slug, p_phone: phone });
    if (error) throw new Error(error.message);
    return (data ?? { ok: false, error: "unknown" }) as PortalCodeRequest;
  },
  async portalVerifyCode(slug, phone, code) {
    const { data, error } = await sbc().rpc("portal_verify_code", { p_slug: slug, p_phone: phone, p_code: code });
    if (error) throw new Error(error.message);
    return (data ?? { ok: false, error: "unknown" }) as PortalVerifyResult;
  },
  async portalMe(token) {
    const { data, error } = await sbc().rpc("portal_me", { p_token: token });
    if (error) throw new Error(error.message);
    const d = data as ({ ok?: boolean } & PortalMe) | null;
    // جلسةٌ ماتت أو أُبطلت: null تعني «اطلب رمزاً من جديد» لا «صار خطأ».
    if (!d?.ok) return null;
    // نفس تحويل الشعار (0190) — بوّابةُ المالك تعرضه كما يعرضه المتجر.
    return { clinic: { ...d.clinic, logo_url: productImageUrl(d.clinic?.logo_url) }, show_medical: !!d.show_medical, pets: d.pets ?? [] };
  },
  async portalPet(token, petId) {
    const { data, error } = await sbc().rpc("portal_pet", { p_token: token, p_pet: petId });
    if (error) throw new Error(error.message);
    const d = data as ({ ok?: boolean } & PortalPetDetail) | null;
    if (!d?.ok) return null;
    return {
      pet: d.pet,
      admission: d.admission ?? null,
      journey: d.journey ?? null,
      today: d.today ?? [],
      vaccines: d.vaccines ?? [],
      weights: d.weights ?? [],
      appointments: d.appointments ?? [],
    };
  },
  async portalLogout(token) {
    // الخروجُ لا يُفشِّل شيئاً: الرمزُ يُمحى محلياً على أي حال.
    try { await sbc().rpc("portal_logout", { p_token: token }); } catch { /* تجاهل */ }
  },

  async listCompanies(clinicId) {
    return allPages<Company>(() => {
      let q = sbc().from("companies").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    }, { col: "name", asc: true, kind: "text" });
  },
  async createCompany(input) {
    const row = { id: uuid(), ...input };
    try {
      return need<Company>(await sbc().from("companies").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("companies", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as Company;
    }
  },
  /* ابحث ثم أنشئ، بنداءٍ واحدٍ **بالخادم**.
   *
   * الجذرُ المقيس كان بالمتصفّح (مقارنةٌ بطرفٍ مطبَّعٍ وطرفٍ خام)، وقد أُصلح
   * بمواضعه الثلاثة. لكنّ المتصفّحَ وحدَه لا يكفي حارساً: تبويبان مفتوحان أو
   * جهازان يحفظان معاً يقرآن نفسَ القائمة القديمة فيُدرجان توأمَين. فالبحثُ
   * والإدراجُ صارا معاملةً واحدةً بالقاعدة (`ensure_company` — 0196).
   *
   * **والسقوطُ مقصودٌ وضيّق**: `0196` تنزل قبل نشر الواجهة، لكنّ جهازاً يحمل
   * نسخةً مخبّأةً قديمةً من الواجهة — أو نشراً سبق الهجرة — يرى الدالّةَ غيرَ
   * موجودة (PGRST202). عندها نرجع للمسار القديم بمفتاحٍ **مطبَّعٍ على الطرفين**
   * فلا يولد توأم؛ يبقى ثقبُ السباق وحدَه حتى تنزل الهجرة. ولا يُبتلع غيرُ
   * هذه الحالة: أيُّ خطأٍ آخر يُرمى. */
  async ensureCompany(name, clinicId) {
    const clean = normGroupName(name);
    try {
      return need<Company>(await sbc().rpc("ensure_company", { p_name: clean }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/PGRST202|could not find the function|does not exist/i.test(msg)) throw e;
      const key = groupKey(clean);
      const hit = (await this.listCompanies(clinicId ?? undefined)).find((c) => groupKey(c.name) === key);
      return hit ?? await this.createCompany({ name: clean, note: null, clinic_id: clinicId ?? null } as Omit<Company, "id" | "created_at">);
    }
  },
  async ensureCompanySection(companyId, name, clinicId) {
    const clean = normGroupName(name);
    try {
      return need<CompanySection>(await sbc().rpc("ensure_company_section", { p_company: companyId, p_name: clean }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/PGRST202|could not find the function|does not exist/i.test(msg)) throw e;
      const key = groupKey(clean);
      const hit = (await this.listCompanySections(companyId, clinicId ?? undefined)).find((x) => groupKey(x.name) === key);
      return hit ?? await this.createCompanySection({ company_id: companyId, name: clean, clinic_id: clinicId ?? null } as Omit<CompanySection, "id" | "created_at">);
    }
  },
  async updateCompany(id, patch) {
    return updated<Company>(await sbc().from("companies").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteCompany(id, reason) {
    /* المحفّزُ يصوّر الشركةَ بسلّتها قبل أن تخرج (0197)، ومعها **صفوفُ**
     * مطالباتها (0198) لأن مفتاحَها `cascade` يمحوها لا يفرّغها. والسببُ
     * يُكتب بالدالّة لا من هنا: سياسةُ السلّة قراءةٌ فقط، فتحديثٌ مباشرٌ
     * يكون صفرَ صفوفٍ **بلا خطأ** — نجاحٌ كاذب. */
    const { error } = await sbc().rpc("delete_company", { p_id: id, p_reason: reason ?? null });
    if (error) throw error;
  },
  async companyTwins() {
    const { data, error } = await sbc().rpc("company_twins");
    if (error) throw error;
    return (data ?? []) as CompanyTwinGroup[];
  },
  async mergeCompanies(keepId, dropId) {
    const { data, error } = await sbc().rpc("merge_companies", { p_keep: keepId, p_drop: dropId });
    if (error) throw error;
    return data as Company;
  },
  async mergeCompanySections(keepId, dropId) {
    const { error } = await sbc().rpc("merge_company_sections", { p_keep: keepId, p_drop: dropId });
    if (error) throw error;
  },
  /* قوائمُ السلّة ترمي على الفشل ولا تبلعه: «ماكو محذوفات» عن خطأٍ تُصدَّق،
   * فتعيد العيادةُ إدخالَ ما حذفته توأماً وتفقد تاريخه (درسُ `listDeletedProducts`). */
  async listDeletedCompanies() {
    return allPages<DeletedCompany>(() => sbc().from("companies_trash").select("*"), { col: "deleted_at", asc: false, kind: "time" });
  },
  async listDeletedCompanySections() {
    return allPages<DeletedCompanySection>(() => sbc().from("company_sections_trash").select("*"), { col: "deleted_at", asc: false, kind: "time" });
  },
  async restoreCompany(id) {
    const { data, error } = await sbc().rpc("restore_company", { p_id: id });
    if (error) throw error;
    return data as Company;
  },
  async restoreCompanySection(id) {
    const { data, error } = await sbc().rpc("restore_company_section", { p_id: id });
    if (error) throw error;
    return data as CompanySection;
  },

  /* ---------------- Company sections (أصناف) ---------------- */
  async listCompanySections(companyId, clinicId) {
    return allPages<CompanySection>(() => {
      let q = sbc().from("company_sections").select("*");
      if (companyId) q = q.eq("company_id", companyId);
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    }, { col: "name", asc: true, kind: "text" });
  },
  async createCompanySection(input) {
    const row = { id: uuid(), ...input };
    try {
      return need<CompanySection>(await sbc().from("company_sections").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("company_sections", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as CompanySection;
    }
  },
  async updateCompanySection(id, patch) {
    return updated<CompanySection>(await sbc().from("company_sections").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteCompanySection(id) {
    // FK on products.section_id is ON DELETE SET NULL, so products survive.
    ok(await sbc().from("company_sections").delete().eq("id", id));
  },

  /* ---------------- Purchases (المشتريات) ---------------- */
  async listPurchases(clinicId, range) {
    return allPages<Purchase>(() => {
      let q = sbc().from("purchases").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "purchased_at", range);
    }, { col: "purchased_at", asc: false, kind: "time" });
  },
  async listPurchaseItems(purchaseId) {
    return listOrThrow<PurchaseItem>(await sbc().from("purchase_items").select("*").eq("purchase_id", purchaseId));
  },
  async listPurchaseEffects(purchaseId) {
    // يرمي ولا يبلع: كشفٌ فارغٌ عن خطأ يقول «ماكو شي تغيّر» عن فاتورةٍ بدّلت أسعاراً.
    // و`allPages` لا `limit(1000)`: الصفوفُ تتراكم بكلّ تعديل (سطور × تعديلات)، وقصُّ
    // تصاعديٍّ عند الألف يُسقط **أحدثَ** دفعة فيُعرض كشفٌ قديمٌ على أنه الأخير.
    const rows = await allPages<PurchaseEffect>(() => sbc().from("purchase_effects").select("*").eq("purchase_id", purchaseId));
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.line_no - b.line_no);
  },
  async listAllPurchaseItems(clinicId, range) {
    return allPages<PurchaseItem>(() => {
      let q = sbc().from("purchase_items").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    });
  },
  async recordPurchase(lines, meta) {
    // Atomic on the server: restock/create products + insert purchase & items.
    // قبل ترحيل 0076 يتجاهل الخادم supplier_name/supplier_phone بأمان.
    return need<Purchase>(await sbc().rpc("record_purchase", { p_lines: lines, p_meta: meta }));
  },
  async updatePurchase(purchaseId, lines, meta) {
    // Atomic on the server: reverse old line stock, re-apply new lines, replace items.
    return need<Purchase>(await sbc().rpc("update_purchase", { p_purchase: purchaseId, p_lines: lines, p_meta: meta }));
  },
  /* ---- مطالبات الشركات اليدوية (0155) ---- */
  async listCompanyCharges(clinicId) {
    // قبل تطبيق 0155 لا يوجد الجدول: قائمةٌ فارغة تُبقي الدفتر يعمل بلا
    // مطالبات، بدل أن تسقط الشاشةُ كلُّها على ميزةٍ إضافية لم تنزل بعد.
    try {
      let q = sbc().from("company_charges").select("*").order("charged_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      const r = await q;
      if (r.error) return [];
      return (r.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) || 0 })) as CompanyCharge[];
    } catch {
      return [];
    }
  },
  async addCompanyCharge(input) {
    const amt = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (!(amt > 0)) throw new Error("amount must be greater than zero");
    const row = need<CompanyCharge>(await sbc().from("company_charges").insert({
      company_id: input.company_id,
      amount: amt,
      reason: input.reason?.trim() || null,
      note: input.note?.trim() || null,
      // نتركه للقاعدة حين لا يختاره الطبيب: افتراضُها يوم بغداد لا يوم الخادم.
      ...(input.charged_at ? { charged_at: input.charged_at } : {}),
    }).select().single());
    return { ...row, amount: Number(row.amount) || 0 };
  },
  async setCompanyChargeSettled(id, settled) {
    const row = need<CompanyCharge>(await sbc().from("company_charges")
      .update({ settled_at: settled ? new Date().toISOString() : null })
      .eq("id", id).select().single());
    return { ...row, amount: Number(row.amount) || 0 };
  },
  async deleteCompanyCharge(id) {
    ok(await sbc().from("company_charges").delete().eq("id", id));
  },

  async listPurchasePayments(purchaseId) {
    // قبل ترحيل 0076 لا يوجد جدول purchase_payments — أعد قائمة فارغة.
    try {
      const r = await sbc().from("purchase_payments").select("*").eq("purchase_id", purchaseId).order("paid_at", { ascending: false });
      if (r.error) return [];
      return (r.data ?? []) as PurchasePayment[];
    } catch {
      return [];
    }
  },
  async settlePurchase(purchaseId, amount, method = "cash", note) {
    return need<Purchase>(await sbc().rpc("settle_purchase", { p_purchase: purchaseId, p_amount: amount, p_method: method, p_note: note ?? null }));
  },
  async assignBarcodeIfEmpty(id, code) {
    const next = normalizeCode(code) || null;
    if (!next) throw new Error("empty code");
    /* الشرطُ بالمرشّح لا بقراءةٍ سابقة: `.is("barcode", null)` أو الفارغ.
     * قراءةٌ ثم كتابةٌ تترك نافذةَ سباقٍ بين الجهازين — والمرشّحُ يغلقها
     * بالقاعدة نفسِها. و`updated<T>()` ترمي على صفرِ صفوف، فالتخطّي يُقال
     * ولا يُبلَع (كتابةٌ ردّتها السياسةُ أو سبقَنا إليها جهازٌ آخر). */
    const r = await sbc().from("products").update({ barcode: next })
      .eq("id", id).or("barcode.is.null,barcode.eq.").select().maybeSingle();
    return updated<Product>(r);
  },
  async poolProduct(productId, sectionId) {
    const r = await sbc().rpc("pool_product", { p_product: productId, p_section: sectionId });
    if (r.error) throw r.error;
    return need<Product>({ data: r.data, error: null });
  },
  async tidyInventory() {
    const r = await sbc().rpc("inventory_tidy_uncat");
    if (r.error) throw r.error;
    const d = (r.data ?? {}) as { merged?: number; kept?: number };
    return { merged: Number(d.merged ?? 0), kept: Number(d.kept ?? 0) };
  },
  async supportsSupplierLedger() {
    try {
      const r = await sbc().from("purchase_payments").select("id").limit(1);
      // جدول ناقص = الترحيل 0076 غير منفَّذ بعد على قاعدة هذه العيادة.
      return !r.error;
    } catch {
      return true; // فشل شبكة — لا نُظهر تحذيراً خاطئاً
    }
  },

  async listInvoices(clinicId, range) {
    return allPages<Invoice>(() => {
      let q = sbc().from("invoices").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    }, { col: "created_at", asc: false, kind: "time" });
  },
  async checkout(items) {
    // Atomic on the server (creates invoice + items, decrements stock, computes profit).
    return need<Invoice>(await sbc().rpc("pos_checkout", { p_items: items }));
  },

  /* ---------------- Delivery (التوصيل — الدفع عند الاستلام) ---------------- */
  async listCouriers(clinicId) {
    let q = sbc().from("couriers").select("*").order("name", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const r = await q;
    /* **قائمةٌ فارغة هنا تقلب معنى المال.** الحاملُ يُعرف بنوعه: شركةٌ تُحاسَب
     * لاحقاً، وسائقٌ يسلّم نقدَه اليوم. فقائمةٌ فارغة عن خطأٍ تجعل كلَّ طلبِ
     * شركةٍ يبدو طلبَ سائق، وضغطةُ «استلمنا الفلوس» تسجّل تحصيلاً لم يحصل.
     * الخطأُ يُرمى ليُعرض «أعد المحاولة» بدل لوحةٍ كاذبة (CLAUDE.md §٣). */
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as Courier[];
  },
  async createCourier(input) {
    const r = await sbc().from("couriers").insert(input).select().single();
    // قاعدة قبل 0148 (بلا عمود kind): السائق يُسجَّل بلا نوعه بدل ما يضيع.
    if (r.error && /kind/i.test(r.error.message ?? "")) {
      const { kind, ...rest } = input; void kind;
      return need<Courier>(await sbc().from("couriers").insert(rest as never).select().single());
    }
    return need<Courier>(r);
  },
  async updateCourier(id, patch) {
    return updated<Courier>(await sbc().from("couriers").update(patch).eq("id", id).select().maybeSingle());
  },
  async listDeliveryOrders(clinicId) {
    return allPages<DeliveryOrder>(() => {
      let q = sbc().from("delivery_orders").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    }, { col: "created_at", asc: false, kind: "time" });
  },
  async createDeliveryOrder(input) {
    // Omit a null branch_id so a pre-0071 database (no column yet) keeps working.
    const { branch_id, zone, ...rest } = input;
    const row: Record<string, unknown> = { ...rest };
    if (branch_id) row.branch_id = branch_id;
    if (zone) row.zone = zone;
    let first = await sbc().from("delivery_orders").insert(row).select().single();
    // قاعدة قبل هجرة 0099 (بلا عمود zone): نعيد الإدخال بدون المنطقة بدل ما
    // يضيع طلب التوصيل كله — الفاتورة محفوظة أصلاً والطلب أهم من الحقل.
    if (first.error && zone && /zone/i.test(first.error.message ?? "")) {
      delete row.zone;
      first = await sbc().from("delivery_orders").insert(row).select().single();
    }
    /* فاتورةٌ لها طلبُ توصيلٍ سلفاً (0180): الفريدُ يرفض الثاني بـ23505،
     * ونحن نُرجع القائمَ بدل أن نرمي. هذا ما يجعل زرَّ «أعد المحاولة» بشاشة
     * البيع مأموناً: الكتابةُ قد تكون وصلت وضاع جوابُها، فالإعادةُ تُرجع نفسَ
     * الصفّ لا صفّاً ثانياً — نفسُ درس 0135 بالبيعة. ولو غاب الصفُّ رغم
     * 23505 (سياسةٌ تحجبه) يُرمى الخطأُ الأصليّ: الصمتُ أخطرُ من الخطأ. */
    /* الرمزُ وحدَه لا يميّز أيَّ قيدٍ انكسر. اليوم لا فريدَ آخر على الجدول،
     * لكنّ أيَّ فريدٍ يُضاف غداً يجعل هذه الكتلةَ تُرجع صفّاً لا علاقةَ له
     * بالخطأ وتقول الواجهةُ «انسجّل». فالاسمُ شرطٌ مع الرمز. */
    const err = first.error as { code?: string; message?: string } | null;
    const dupOfInvoice = err?.code === "23505" && (err.message ?? "").includes("delivery_orders_invoice_uniq");
    if (dupOfInvoice && input.invoice_id) {
      const dup = await sbc().from("delivery_orders").select("*").eq("invoice_id", input.invoice_id).limit(1).maybeSingle();
      if (!dup.error && dup.data) return dup.data as DeliveryOrder;
    }
    return need<DeliveryOrder>(first);
  },
  async updateDeliveryOrder(id, patch) {
    const r = await sbc().from("delivery_orders").update(patch).eq("id", id).select().maybeSingle();
    // قاعدة قبل 0148 (بلا collected_at): الحالة تُحفظ بلا الختم بدل ما يفشل الاستلام.
    if (r.error && "collected_at" in patch && /collected_at/i.test(r.error.message ?? "")) {
      const { collected_at, ...rest } = patch; void collected_at;
      const r2 = await sbc().from("delivery_orders").update(rest).eq("id", id).select().maybeSingle();
      if (r2.error) throw r2.error;
      return assertUpdated(maybe<DeliveryOrder>(r2));
    }
    // خطأُ الخادم يُرمى لا يُبلَع: `maybe()` كانت تطبعه بالكونسول وترجع «لا صفّ»،
    // فقالت الواجهةُ «تم الاستلام» على 500 حقيقيّ (0159) والطلبُ باقٍ مكانه.
    if (r.error) throw r.error;
    return assertUpdated(maybe<DeliveryOrder>(r));
  },
  async listCourierSettlements(courierId) {
    return allPages<CourierSettlement>(() => {
      let q = sbc().from("courier_settlements").select("*");
      if (courierId) q = q.eq("courier_id", courierId);
      return q;
    }, { col: "created_at", asc: false, kind: "time" });
  },
  async settleCourier(courierId, amount, method = "cash", note) {
    const { data, error } = await sbc().rpc("courier_settle", { p_courier: courierId, p_amount: amount, p_method: method, p_note: note ?? null });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    return { settled: Number(d.settled ?? 0), orders: Number(d.orders ?? 0), unallocated: Number(d.unallocated ?? 0), remaining_owed: Number(d.remaining_owed ?? 0) };
  },
  async unsettleCourier(settlementId, reason) {
    return need<CourierSettlement>(await sbc().rpc("courier_unsettle", { p_settlement: settlementId, p_reason: reason ?? null }));
  },

  /* ---------------- Retail & advanced invoicing ---------------- */
  async retailCheckout(items, meta) {
    // Atomic on the server: invoice (+ customer/discount/payment) + items + stock.
    return need<Invoice>(await sbc().rpc("retail_checkout", { p_items: items, p_meta: meta }));
  },
  async retailReturn(items, meta) {
    // ذرّيّة على الخادم: المخزون والسحوبات معاً أو لا شيء.
    const args = { p_items: items, p_meta: meta };
    try {
      return need<RetailReturnResult>(await sbc().rpc("retail_return", args));
    } catch (e) {
      // بخلاف البيعة، الإرجاع ما يعتمد عليه شيءٌ بعده — نتيجتُه رسالةٌ وحسب.
      // فيدخل الطابور بأمان (0136 يمنع ازدواجه بمرجعه)، ونُرجع حصيلةً
      // محسوبةً محلياً كي يرى الكاشير نفس الأرقام التي ستنزل.
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueueRpc("retail_return", args as unknown as Record<string, unknown>)) throw e;
      let total = 0, lines = 0;
      for (const it of items) {
        const qty = Math.abs(Number(it.qty) || 0);
        if (qty === 0) continue;
        total += Math.round(qty * Math.abs(Number(it.unit_price) || 0) * 100) / 100;
        lines += 1;
      }
      const m = meta.method;
      // نفسُ ترجمة الجيب — من `pockets.ts` لا نسخةً ثانيةً تنحرف.
      return { total, lines, method: expenseMethodOf(m) };
    }
  },
  async listInvoiceItems(invoiceId) {
    return listOrThrow<InvoiceItem>(await sbc().from("invoice_items").select("*").eq("invoice_id", invoiceId));
  },
  async listAllInvoiceItems(clinicId, range) {
    // أكبر جدول بالعيادة النشطة — بلا صفحات كانت التحليلات تحسب على أول ألف سطر فقط.
    // ومع المدى (0133) تنزل صفوف الشهر لا صفوف العمر كله.
    return allPages<InvoiceItem>(() => {
      let q = sbc().from("invoice_items").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    });
  },
  /* ---- التقارير (0149): القاعدةُ تجمع، والمتصفّح يعرض ---------------------- */
  async listInvoicesTouching(range) {
    // setof عبر RPC يخضع لسقف الصفوف نفسه — فالصفحات هنا أيضاً.
    return allPages<Invoice>(() => sbc().rpc("report_invoices", { p_from: range.from ?? "1970-01-01", p_to: range.to ?? "2999-01-01" }));
  },
  async customerInvoices(phone, name) {
    return allPages<Invoice>(() => sbc().rpc("customer_invoices", { p_phone: phone ?? null, p_name: name ?? null }));
  },
  async listInvoiceItemsFor(invoiceIds) {
    if (invoiceIds.length === 0) return [];
    return inChunks(invoiceIds, (c) => allPages<InvoiceItem>(() => sbc().from("invoice_items").select("*").in("invoice_id", c)));
  },
  async listInvoicesByIds(invoiceIds) {
    if (invoiceIds.length === 0) return [];
    // مرآةُ listInvoiceItemsFor: دفعاتٌ بالمعرّفات (طولُ الرابط) وصفحاتٌ كاملة
    // (سقفُ الألف صفّ). و`allPages` ترمي الخطأ ولا ترجع قائمةً جزئية — كشفُ
    // تحصيلٍ ناقصٌ يبدو تامّاً أخطرُ من خطأٍ ظاهر.
    return inChunks(invoiceIds, (c) => allPages<Invoice>(() => sbc().from("invoices").select("*").in("id", c)));
  },
  async reportReceiptsDaily(range, tz) {
    const rows = listOf<{ day: string; gross: number | string; net: number | string; invoices: number }>(
      await sbc().rpc("report_receipts_daily", { p_from: range.from ?? "1970-01-01", p_to: range.to ?? "2999-01-01", p_tz: tz ?? "Asia/Baghdad" }));
    return rows.map((r) => ({ day: r.day, gross: Number(r.gross), net: Number(r.net), invoices: Number(r.invoices) }));
  },
  async reportReceiptsTotal(range) {
    const rows = listOf<{ gross: number | string; net: number | string; invoices: number }>(
      await sbc().rpc("report_receipts_total", { p_from: range.from ?? "1970-01-01", p_to: range.to ?? "2999-01-01" }));
    const r = rows[0];
    return { gross: Number(r?.gross ?? 0), net: Number(r?.net ?? 0), invoices: Number(r?.invoices ?? 0) };
  },
  async reportTopProducts(range, limit = 5) {
    const rows = listOf<{ key: string; name: string; qty: number | string; revenue: number | string }>(
      await sbc().rpc("report_top_products", { p_from: range.from ?? "1970-01-01", p_to: range.to ?? "2999-01-01", p_limit: limit }));
    return rows.map((r) => ({ key: r.key, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
  },
  async reportStaff(range) {
    const rows = listOf<{ staff_id: string | null; invoices: number; revenue: number | string; profit: number | string }>(
      await sbc().rpc("report_staff", { p_from: range.from ?? "1970-01-01", p_to: range.to ?? "2999-01-01" }));
    return rows.map((r) => ({ staff_id: r.staff_id, invoices: Number(r.invoices), revenue: Number(r.revenue), profit: Number(r.profit) }));
  },
  async countInvoices() {
    // عدٌّ لا صفوف — لا يمسّه سقفُ الألف.
    const { count, error } = await sbc().from("invoices").select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  },
  async searchInvoices(s) {
    // صفحةٌ واحدة بحدّها — لا allPages هنا عمداً: الصفحةُ هي الفكرة.
    return listOrThrow<Invoice>(await sbc().rpc("search_invoices", {
      p_q: s.q ?? null, p_status: s.status ?? "all",
      p_before: s.before ?? null, p_before_id: s.beforeId ?? null, p_limit: s.limit ?? 50,
      p_since: s.since ?? null,
    }));
  },
  async countInvoicesMatching(s) {
    const { data, error } = await sbc().rpc("count_invoices_matching", { p_q: s.q ?? null, p_status: s.status ?? "all" });
    if (error) throw error;
    return Number(data ?? 0);
  },
  async openDebts() {
    return allPages<Invoice>(() => sbc().rpc("open_debts"));
  },
  async refundInvoice(invoiceId) {
    // Server marks refunded + returns units to stock (idempotent).
    return need<Invoice>(await sbc().rpc("refund_invoice", { p_invoice: invoiceId }));
  },
  async deleteInvoice(invoiceId) {
    ok(await sbc().rpc("delete_invoice", { p_invoice: invoiceId }));
  },
  async editInvoiceLines(invoiceId, lines, note) {
    // ذرّية على السيرفر: العكس والخصم وإعادة الحساب وتحديث مستحقّ السواق
    // بمعاملة واحدة — انقطاع الشبكة لا يترك مخزوناً منقوصاً وفاتورة قديمة.
    return need<Invoice>(await sbc().rpc("edit_invoice_lines", { p_invoice: invoiceId, p_lines: lines, p_note: note ?? null }));
  },
  async returnInvoiceItems(invoiceId, returns, method, note) {
    // المرتجع ذرّي عالسيرفر (0121): مخزون + فاتورة + نقد بمعاملة واحدة.
    return need<Invoice>(await sbc().rpc("return_invoice_items", { p_invoice: invoiceId, p_returns: returns, p_method: method ?? null, p_note: note ?? null }));
  },
  async settleInvoice(invoiceId, amount, method = "cash") {
    // Atomic on the server: clamps to the outstanding balance, appends a payment leg.
    return need<Invoice>(await sbc().rpc("settle_invoice", { p_invoice: invoiceId, p_amount: amount, p_method: method }));
  },
  async bumpInvoicePrints(invoiceId) {
    const res = await sbc().rpc("bump_invoice_prints", { p_invoice: invoiceId });
    if (res.error) { console.error("[supabase]", res.error.message); return 0; }
    return (res.data as number) ?? 0;
  },
  async setInvoicePaymentMethod(invoiceId, method) {
    // Direct UPDATE (invoices_clinic_all policy permits staff). Sync a single leg too.
    const inv = need<Invoice>(await sbc().from("invoices").select("*").eq("id", invoiceId).single());
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const patch: Record<string, unknown> = { payment_method: method };
    if (Array.isArray(inv.payment_details) && inv.payment_details.length === 1) {
      patch.payment_details = [{ ...inv.payment_details[0], method }];
    }
    return need<Invoice>(await sbc().from("invoices").update(patch).eq("id", invoiceId).select().single());
  },
  async setInvoicePaymentDetails(invoiceId, legs) {
    const inv = need<Invoice>(await sbc().from("invoices").select("*").eq("id", invoiceId).single());
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = (legs as PaymentSplit[]).filter((l) => l && l.method && Number(l.amount) > 0);
    if (!clean.length) return inv;
    const fixes = (inv.payment_details ?? []).filter((l) => Number(l.amount) < 0);
    const dominant = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
    return need<Invoice>(await sbc().from("invoices")
      .update({ payment_details: [...clean, ...fixes], payment_method: dominant })
      .eq("id", invoiceId).select().single());
  },
  async correctInvoiceReceipt(invoiceId, amount, reason, method) {
    const { data, error } = await sbc().rpc("correct_invoice_receipt", {
      p_invoice: invoiceId, p_amount: amount, p_reason: reason, p_method: method ?? null,
    });
    if (error) throw error;
    return data as Invoice;
  },
  async searchCustomers(query, clinicId) {
    let q = sbc().from("invoices").select("customer_name,customer_phone,created_at").order("created_at", { ascending: false }).limit(300);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const rows = listOf<{ customer_name: string | null; customer_phone: string | null; created_at: string }>(await q);
    return dedupeCustomers(rows, query);
  },
  async listExpenses(clinicId, range) {
    return allPages<Expense>(() => {
      let q = sbc().from("expenses").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "spent_at", range);
    }, { col: "spent_at", asc: false, kind: "time" });
  },
  async addExpense(input) {
    // clinic_id + staff_id are stamped by the column defaults (auth_clinic() / auth.uid());
    // send only the explicit fields so a caller can never set another clinic's id.
    //
    // والمعرّف يولَد بالجهاز لا بالقاعدة: بهذا وحده يصير الرفعُ المؤجَّل
    // متسامحاً مع التكرار، فسحبٌ سُجّل والنت واگع يدخل الطابور ولا يضيع —
    // ولا ينكتب مرّتين لو كان الطلب الأول قد وصل وضاع جوابه.
    const row = {
      id: uuid(), amount: input.amount, description: input.description,
      category: input.category ?? null, method: input.method ?? "cash", spent_at: input.spent_at,
    };
    try {
      return need<Expense>(await sbc().from("expenses").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("expenses", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, clinic_id: null, created_at: new Date().toISOString() } as Expense;
    }
  },
  async deleteExpense(id) {
    ok(await sbc().from("expenses").delete().eq("id", id));
  },

  /* ---- الرواتب (0112) ----
   * القراءة مباشرة (RLS تحصر: المدير يرى الكل، والموظف قسيمته وحدها).
   * الكتابة **كلّها** عبر دوال SECURITY DEFINER: سقف الاستقطاع، ومنع اعتماد
   * راتب النفس، والتجميد بعد الاعتماد — منطقٌ لا تعبّر عنه سياسة صفوف. */
  async getPayrollPolicy() {
    const { data, error } = await sbc().rpc("payroll_get_policy");
    if (error) throw error;
    return data as PayrollPolicyDTO;
  },
  async setPayrollPolicy(p) {
    const { data, error } = await sbc().rpc("payroll_set_policy", {
      p_basis: p.dayRateBasis, p_working_days: p.workingDays,
      p_cap_pct: p.deductionCapPct, p_round_to: p.roundTo,
    });
    if (error) throw error;
    return data as PayrollPolicyDTO;
  },
  async listStaffComp() {
    return listOf<StaffComp>(await sbc().from("staff_comp").select("*").order("effective_from", { ascending: false }));
  },
  async setStaffComp(staffId, from, base, note) {
    const { data, error } = await sbc().rpc("payroll_set_comp", {
      p_staff: staffId, p_from: from, p_base: base, p_note: note ?? null,
    });
    if (error) throw error;
    return data as StaffComp;
  },
  async deleteStaffComp(id) {
    const { error } = await sbc().rpc("payroll_delete_comp", { p_id: id });
    if (error) throw error;
  },
  async listStaffRecurring() {
    return listOf<StaffRecurring>(await sbc().from("staff_recurring").select("*"));
  },
  async addStaffRecurring(staffId, code, amount, note) {
    const { data, error } = await sbc().rpc("payroll_set_recurring", {
      p_staff: staffId, p_code: code, p_amount: amount, p_note: note ?? null,
    });
    if (error) throw error;
    return data as StaffRecurring;
  },
  async deleteStaffRecurring(id) {
    const { error } = await sbc().rpc("payroll_delete_recurring", { p_id: id });
    if (error) throw error;
  },
  async listPayrollAdjustments(period) {
    let q = sbc().from("payroll_adjustments").select("*").order("created_at", { ascending: true });
    if (period) q = q.eq("period", period);
    return listOf<PayrollAdjustment>(await q);
  },
  async addPayrollAdjustment(staffId, period, code, amount, qty, reason) {
    const { data, error } = await sbc().rpc("payroll_add_adjustment", {
      p_staff: staffId, p_period: period, p_code: code,
      p_amount: amount ?? 0, p_qty: qty ?? null, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as PayrollAdjustment;
  },
  async deletePayrollAdjustment(id) {
    const { error } = await sbc().rpc("payroll_delete_adjustment", { p_id: id });
    if (error) throw error;
  },
  async reversePayrollAdjustment(id, amount, qty, reason) {
    const { data, error } = await sbc().rpc("payroll_reverse_adjustment", {
      p_id: id, p_amount: amount ?? null, p_qty: qty ?? null, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as PayrollAdjustment;
  },
  async unpayPayslip(slipId) {
    const { data, error } = await sbc().rpc("payroll_unpay_slip", { p_slip: slipId });
    if (error) throw error;
    return data as Payslip;
  },
  async listPayrollRuns() {
    return listOf<PayrollRun>(await sbc().from("payroll_runs").select("*").order("period", { ascending: false }));
  },
  async openPayrollRun(period) {
    const { data, error } = await sbc().rpc("payroll_open_run", { p_period: period });
    if (error) throw error;
    return data as PayrollRun;
  },
  async savePayrollSlips(runId, slips) {
    const { data, error } = await sbc().rpc("payroll_save_slips", { p_run: runId, p_slips: slips });
    if (error) throw error;
    return data as { run: string; payslips: number };
  },
  async listPayslips(runId) {
    let q = sbc().from("payslips").select("*").order("staff_name");
    if (runId) q = q.eq("run_id", runId);
    return listOf<Payslip>(await q);
  },
  async listPayslipLines(payslipIds) {
    let q = sbc().from("payslip_lines").select("*");
    if (payslipIds) {
      if (!payslipIds.length) return [];
      q = q.in("payslip_id", payslipIds);
    }
    return listOf<PayslipLine>(await q);
  },
  async approvePayrollRun(runId) {
    const { data, error } = await sbc().rpc("payroll_approve", { p_run: runId });
    if (error) throw error;
    return data as PayrollRun;
  },
  async unapprovePayrollRun(runId) {
    const { data, error } = await sbc().rpc("payroll_unapprove_run", { p_run: runId });
    if (error) throw error;
    return data as PayrollRun;
  },
  async payPayslip(slipId, method) {
    const { data, error } = await sbc().rpc("payroll_pay_slip", { p_slip: slipId, p_method: method });
    if (error) throw error;
    return data as Payslip;
  },
  async closePayrollRun(runId) {
    const { data, error } = await sbc().rpc("payroll_close_run", { p_run: runId });
    if (error) throw error;
    return data as PayrollRun;
  },
  async listStaffLoans() {
    return listOf<StaffLoan>(await sbc().from("staff_loans").select("*").order("created_at", { ascending: false }));
  },
  async listLoanEvents(loanId) {
    let q = sbc().from("staff_loan_events").select("*").order("at", { ascending: false });
    if (loanId) q = q.eq("loan_id", loanId);
    return listOf<StaffLoanEvent>(await q);
  },
  async disburseLoan(staffId, _staffName, principal, installment, reason, method) {
    // الاسم يقرأه الخادم من صفّ الكادر لا من العميل — اسمٌ يرسله المتصفّح
    // يجعل بيان المصروف قابلاً للتزوير.
    const { data, error } = await sbc().rpc("payroll_disburse_loan", {
      p_staff: staffId, p_principal: principal, p_installment: installment,
      p_reason: reason, p_method: method,
    });
    if (error) throw error;
    return data as StaffLoan;
  },
  async disburseAdvance(staffId, _staffName, amount, reason, method) {
    const { data, error } = await sbc().rpc("payroll_disburse_advance", {
      p_staff: staffId, p_amount: amount, p_reason: reason, p_method: method,
    });
    if (error) throw error;
    return data as StaffLoan;
  },
  async writeOffLoan(loanId, note) {
    const { data, error } = await sbc().rpc("payroll_write_off_loan", { p_loan: loanId, p_note: note });
    if (error) throw error;
    return data as StaffLoan;
  },
  async logWhatsApp(input) {
    ok(await sbc().from("wa_messages").insert(input));
  },
  async listWhatsAppLog() {
    return listOf<WhatsAppMessage>(await sbc().from("wa_messages").select("*").order("sent_at", { ascending: false }).limit(1000));
  },
  async logClientEvent(event, details) {
    // Pre-0045 databases don't have the RPC yet — best-effort, always silent.
    try { await sbc().rpc("log_client_event", { p_event: event, p_details: details ?? {} }); } catch { /* ignore */ }
  },
  async noteScanShapes(day, counts, samples, clinicId) {
    // يرمي على الخطأ: العدّادُ يُبقي ما لم يصل ويعيده لاحقاً، ولا يقوله للمستخدم.
    need(await sbc().rpc("note_scan_shapes", { p_day: day, p_counts: counts, p_samples: samples, p_clinic: clinicId }));
  },
  async listAuditLog(_clinicId, limit = 200) {
    // RLS already scopes to the manager's clinic; just order + cap.
    return listOf<AuditEntry>(await sbc().from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit));
  },
  async listLoginEvents(_clinicId, limit = 100) {
    return listOf<LoginEvent>(await sbc().from("login_events").select("*").order("created_at", { ascending: false }).limit(limit));
  },
  async activitySummary(from, to, bucket) {
    const { data, error } = await sbc().rpc("activity_summary", { p_from: from, p_to: to, p_tz: localTimeZone(), p_bucket: bucket });
    if (error) throw error;
    return ((data ?? []) as { bucket: string; kind: string; n: number }[]).map((r) => ({ bucket: r.bucket, kind: r.kind, n: Number(r.n) }));
  },
  async productMovements(productId) {
    /* **ترمي ولا ترجّع فارغة.** قائمةٌ ناقصةٌ عن خطأٍ تقلب المعنى: «ماكو حركات»
     * تعني «ما صار شي» والحقيقةُ «ما وصلنا». والشاشةُ تعرض «أعد المحاولة». */
    return listOf<ProductMovement>(await sbc().rpc("product_movements", { p_product: productId, p_limit: 200 }));
  },
  async activityPage(s) {
    // صفحةٌ واحدة بحدّها — لا allPages عمداً: الفكرةُ ألّا يُنزَّل السجلُّ كلُّه.
    return listOf<ActivityRow>(await sbc().rpc("activity_page", {
      p_from: s.from, p_to: s.to, p_kinds: s.kinds ?? null, p_actor: s.actor ?? null, p_q: s.q ?? null,
      p_before: s.before ?? null, p_before_src: s.beforeSrc ?? null, p_before_id: s.beforeId ?? null, p_limit: s.limit ?? 50,
    }));
  },
  async activityActors(from, to) {
    const { data, error } = await sbc().rpc("activity_actors", { p_from: from, p_to: to });
    if (error) throw error;
    return ((data ?? []) as { actor: string; name: string; n: number }[]).map((r) => ({ actor: r.actor, name: r.name, n: Number(r.n) }));
  },
  async logLogin(input) {
    // clinic_id/user_id are stamped by the column defaults (auth_clinic()/auth.uid()).
    ok(await sbc().from("login_events").insert({ email: input.email ?? null, name: input.name ?? null }));
  },
};

/** Live when Supabase is configured, otherwise the local demo store. */
/* المرآةُ التجريبيةُ كسولة (`repoDemo.ts`): عيادةٌ على السحابة لا تنزّلها أبداً، والتجريبيُّ
 * يبدأ تنزيلَها لحظةَ تقييم هذه الوحدة — بالتوازي مع أوّل رسم. وبعد وصولها النداءُ مباشرٌ
 * **ومتزامنُ البدء** كما كان (الجزءُ المتزامن من الدالّة يجري لحظةَ النداء)؛ وقبله ينتظرها.
 * و`then`/الرموزُ لا تُعاد دوالّاً: وكيلٌ يجيب `then` يصير «وعداً» فيعلق كلُّ `await repo`. */
let demoImpl: DemoRepo | null = null;
const demoLoad: Promise<DemoRepo> | null = supabase ? null : import("./repoDemo").then((m) => (demoImpl = m.demoRepo));
const lazyDemo = new Proxy({} as DemoRepo, {
  get(_t, prop) {
    if (typeof prop !== "string" || prop === "then") return undefined;
    return (...args: unknown[]) => {
      const call = (r: DemoRepo) => (r as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args);
      return demoImpl ? call(demoImpl) : (demoLoad as Promise<DemoRepo>).then(call);
    };
  },
});
const baseRepo: DemoRepo = supabase ? supabaseRepo : lazyDemo;

// ---------------------------------------------------------------------------
// Read-only guard. When a clinic's subscription has lapsed (was a subscriber,
// now expired → read-only access), it may still VIEW everything but must not
// change anything. Rather than disable every button, we block writes at the one
// chokepoint they all pass through: the repo. A checker is registered by
// src/lib/subscription.ts; it defaults to "allow" so nothing ever locks by
// accident (fail-open). Only method names that mutate are gated — reads pass
// straight through.
// ---------------------------------------------------------------------------
let readOnlyChecker: () => boolean = () => false;
export function registerReadOnlyChecker(fn: () => boolean) { readOnlyChecker = fn; }

/** Thrown by a blocked write so call sites can show a "renew to edit" message. */
export class ReadOnlyError extends Error {
  constructor() { super("READ_ONLY"); this.name = "ReadOnlyError"; }
}

/**
 * قائمة السماح — لا قائمة المنع.
 *
 * كانت البوابة تمنع الأسماء التي تبدأ ببادئات كتابة معروفة، فتسرّبت منها
 * عمليات حقيقية لأن أسماءها لا تبدأ بواحدة منها: `retailCheckout` (إتمام بيع
 * كامل!) و`uploadMedia` و`closeJourney` و`markInboxHandled` و`claimPet`…
 * والأخطر أن كل دالة جديدة تُضاف مستقبلاً تتسرّب افتراضياً.
 *
 * القاعدة انقلبت: في وضع القراءة فقط كل شيء ممنوع إلا ما يُعلَن هنا قراءةً
 * صريحة. الخطأ الآن يميل للأمان — دالة جديدة تُمنع حتى تُراجَع، بدل أن تمرّ
 * وتكتب على عيادة منتهي اشتراكها.
 */
const READ_ONLY_ALLOWED = new Set<string>([
  // --- كل القراءات (مولَّدة من دوال الريبو نفسها، فلا تسقط واحدة سهواً) ---
  "listPoultryFarms", "listPoultryHouses", "listPoultryCycles", "listPoultryDaily",
  "listPoultryUse", "poultryCycleStats",
  "getActiveJourney", "getClinicVisit", "getDailyNote", "getPet", "getPetBySerial",
  "getPetByToken", "getPetsByIds", "getPetsByOwnerEmail", "getProductByBarcode", "getProductById", "getSectionPool",
  "getSharedPetsByOwnerId", "getStoreProfile", "countNewStoreOrders", "rejectStaleStoreOrders", "listAdmissions", "listAdmissionsForPet",
  "listAllInvoiceItems", "listAllMedia", "listAllPets", "listAllSurgeries", "listAllTreatments",
  "listAllVaccinations", "listAllVisits", "listAppointmentsForDay", "listAppointmentsForOwner",
  "listAppointmentsForPet", "listAppointmentsInRange", "listAuditLog", "listBookingRequests",
  "listBookingsForDay", "listBranches", "listCareEntries", "listClinicDirectory",
  "listClinicLabResults", "listClinicStaffPublic", "listClinicTreatments", "listClinicVisits",
  "listClinicVisitsForPet", "listCompanies", "listCompanySections", "listCouriers",
  "listDeliveryOrders", "listDeviceInbox", "listDeviceLinks", "listDoctorBusySlots", "listImageLibrary",
  "listEndedClinicVisits", "listExpenses", "listFeatureRequests", "listGeneratedBarcodes",
  "listInvoiceItems", "listInvoices", "listJourneyEvents", "listLabResults", "listLoginEvents",
  "listMedia", "listOpenClinicVisits", "listPetMovements", "listPetNotes", "listPets",
  "listProblems", "listProducts", "listPurchaseItems", "listPurchaseEffects", "listPurchasePayments", "listPurchases",
  "listCompanyCharges",
  "listReminders", "listStoreOrders", "listNewStoreOrders", "suggestStoreProducts", "listSurgeries", "listTreatments", "listVaccinations",
  "listVisits", "listWaiting", "listWeights", "listWhatsAppLog", "searchCustomers",
  // --- الرواتب: القراءة تبقى بالاشتراك المنتهي (الموظف يشوف قسيمته) ---
  "getPayrollPolicy", "listStaffComp", "listStaffRecurring", "listPayrollRuns",
  "listPayslips", "listPayslipLines", "listStaffLoans", "listLoanEvents",
  "listPayrollAdjustments", "listDeletedProducts", "productSaleLines", "listCourierSettlements",
  "companyTwins", "listDeletedCompanies", "listDeletedCompanySections",
  "listInvoicesTouching", "customerInvoices", "listReminderMarks", "listInvoiceItemsFor", "listInvoicesByIds", "reportReceiptsDaily", "reportReceiptsTotal",
  "reportTopProducts", "reportStaff", "countInvoices", "searchInvoices", "countInvoicesMatching", "openDebts",
  "activitySummary", "activityPage", "activityActors",
  "productMovements",
  // --- استعلامات مساعدة لا تكتب ---
  "checkStoreSlug", "slotTaken", "supportsBulkGroup", "supportsSupplierLedger",
  "adminListFeatureRequests", "systemHealth", "barcodeHealth",
  // --- واجهات الزبون العامة (تعمل خارج جلسة العيادة) ---
  "storeFrontPublic", "storeCatalogPublic", "placeStoreOrder", "trackStoreOrder", "trackJourneyPublic",
  "reactJourneyPublic", "claimPet", "claimPetsByPhone",
  // بوّابة المالك (0158): اشتراكُ العيادة شأنٌ بينها وبين المنصّة — وقفُ
  // البوّابة يعاقب المراجعَ الذي لا ناقةَ له ولا جمل، ولا يضغط على العيادة.
  "portalRequestCode", "portalVerifyCode", "portalMe", "portalPet", "portalLogout",
  // --- سجلات تشغيلية لا تمثّل إدخال بيانات (وحجبها يكسر الدخول) ---
  "logLogin", "logClientEvent",
]);

/** يُستعمل بالاختبارات وبالتشخيص: هل هذه الدالة مسموحة بوضع القراءة فقط؟ */
export const isReadAllowed = (name: string): boolean => READ_ONLY_ALLOWED.has(name);

export const repo: DemoRepo = new Proxy(baseRepo, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function" && typeof prop === "string" && !READ_ONLY_ALLOWED.has(prop)) {
      return (...args: unknown[]) => {
        if (readOnlyChecker()) return Promise.reject(new ReadOnlyError());
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
}) as DemoRepo;
