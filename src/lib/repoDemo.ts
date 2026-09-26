/* ============================================================================
 * المرآةُ التجريبية للريبو (localStorage) — **خارج حزمة الإقلاع**.
 *
 * كانت داخل `repo.ts`: ٣٤٠٠ سطر (~٣٠ كيلو مضغوطة) تنزل مع كلّ إقلاعٍ لعيادةٍ حقيقية
 * لا تنفّذ منها سطراً — فالاختيارُ بين السحابيّ والتجريبيّ يجري **وقتَ التشغيل**
 * (`supabase ? … : …`) فلا يقدر المجمِّعُ أن يحذفها. فصارت وحدةً تُحمَّل كسولاً وحدَها،
 * ويبدأ تحميلُها لحظةَ تقييم `repo.ts` حين لا سحابة — بالتوازي مع أوّل رسم.
 *
 * العقدُ لم يتغيّر: نفسُ الدوالّ ونفسُ الحرّاس، و`repo` يوجّه إليها.
 * ========================================================================= */
import { loadDB, saveDB } from "./demoStore";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, AppointmentStatus, ClinicInfo, PublicStaff, DailyNote, TreatmentEntry, Admission, Branch, Reminder, Product, Company, CompanySection, Purchase, PurchaseItem, PurchasePayment, PurchaseDraftLine, PurchaseMeta, Courier, DeliveryOrder, PetMovement, DemoDB, Invoice, InvoiceItem, CheckoutItem, SaleMeta, Customer, DiscountType, PaymentMethod, PaymentSplit, WhatsAppMessage, AuditEntry, LoginEvent, PetNote, Expense, ExpenseMethod, ReturnMeta, RetailReturnResult, HealthMetric, ClinicVisit , Surgery, LabResult, LabDeviceLink, LabDeviceInbox, LabStatusValue, PetProblem, CareEntry, FeatureRequest, GeneratedBarcode, StoreProfile, StoreOrder, StoreOrderItem, StoreFrontInfo, StoreCatalogItem, SuggestedProduct, StoreTrackInfo, LibraryImage, Journey, JourneyEvent, JourneyKind, JourneyStage, JourneyPublicView, EditLine, PoultryFarm, PoultryHouse, PoultryCycle, PoultryDaily, PoultryUse, PoultryUseKind, PoultryCycleStats, PoultryConsumeResult, ProductMovement } from "@/types";
import type { CompanyCharge, CompanyTwinGroup, DeletedCompany, DeletedCompanySection, DeletedCompanySectionNote, ReminderMark } from "@/types";
import type { DeletedProduct, CourierSettlement, ReceiptsDay, ReceiptsTotal, TopProductRow, StaffSalesRow, InvoiceSearch } from "@/types";
import type { BarcodeAilment, BarcodeHealthRow } from "@/types";
import type { PurchaseEffect, PurchaseEffectSnap } from "@/types";
import type { PortalMe, PortalPetCard, PortalPetDetail, PortalAdmission, PortalJourney, PortalCodeRequest, PortalVerifyResult } from "@/types";
import { receiptsOf, dueOf } from "./debt";
import { phoneDigits } from "./phone";
import { searchable, invNormName } from "./utils";
import i18next from "i18next";
import { invoiceNo } from "./invoiceNo";
import { auditKind, activityBrief } from "./activityKinds";
import type { ProductBatch } from "@/types";
import type { CountDecision, CountLineInput, CountSubmitResult, StockCount, StockLossRow } from "@/types";
import type { ActivityQuery, ActivityRow, ActivitySummaryRow, ActivityActor } from "@/types";
import type { PayrollPolicyDTO, StaffComp, StaffRecurring, PayrollAdjustment, PayrollRun, Payslip, PayslipLine, StaffLoan, StaffLoanEvent, PayslipDraft, PayMethod } from "@/types";
import * as PD from "./payrollDemo";
import { paidOf, round2 } from "./debt";
import { isValidSlug, normalizeSlug, matchSlug, slugKey, demoOrderNo } from "./storeLib";
import { expenseMethodOf } from "./pockets";
import { journeyToken, OWNER_REACTIONS } from "./journey";
import { getClinicName, getClinicLogo, getClinicSocials } from "./settings";
import { uid, uuid, ageMonths, localISO, normalizeCode, matchCode, groupKey, normGroupName } from "./utils";
import { scanVariants } from "./productCodes";
import { phoneKey } from "./phone";
import { loadOwners } from "./owners";
import { loadClinics } from "./clinics";
import { listStaff } from "./staff";
import type { PreparedUpload } from "./image";
import { LAB_STAGE_COL, assertUpdated, assertUploadableImage, blankOwnerField, dailyNoteLocalGet, dailyNoteLocalSet, dedupeCustomers, labLifecycleFields, pickByPurchaseName, purchaseCoRank, sayAmbiguousCode } from "./repo";
import type { DateRange } from "./repo";

interface DemoPortalSession { slug: string; key: string; expires: string }


interface DemoPortalCode { code: string; expires: number; attempts: number }

/* موحِّدا مطابقة المخزون — مرآةُ inv_norm_code/inv_norm_name على الخادم:
 * قاعدتان تنحرفان تعني قطعةً تُطابَق محلياً وتتوأم سحابياً.
 *
 * ومنذ 0164 صار `inv_norm_code` بالقاعدة مرآةً **حرفية** لـ`matchCode`: نفسُ
 * الأرقام، ونفسُ المحارف الخفية، ونفسُ طيّ الحالة — ويقيسه `code-norm-parity`
 * حرفاً بحرف على مئةٍ وعشر حالات. فالنسخةُ المحلية هنا لم تعد نسخة: هي
 * الدالّةُ نفسها. وكانت قبلها تشيل المسافاتِ والأرقامَ العربية وحدها، فرمزٌ
 * بعلامة اتجاهٍ خفية يُطابَق سحابياً ولا يُطابَق تجريبياً — وفحوصُ المنطق
 * تجري على التجريبية، فالانحرافُ يخفي العطلَ بدل أن يكشفه. */
const invNormCode = (v: string | null | undefined): string => matchCode(v);

/* Demo-only audit + login trails (localStorage). On Supabase these live in the
 * audit_log / login_events tables; in demo we keep small local mirrors so the
 * Reports security-log views are populated and testable offline. */
const DEMO_AUDIT_KEY = "vp_demo_audit";

const DEMO_LOGIN_KEY = "vp_demo_login";

const DEMO_EXPENSES_KEY = "vp_demo_expenses";

const DEMO_PORTAL_SESSIONS_KEY = "vp_portal_sessions";

const pickByPurchaseCode = <T extends { id: string; barcode?: string | null; alt_codes?: string[] | null; company_id?: string | null; section_id?: string | null; created_at?: string }>(
  rows: readonly T[], code: string, companyId: string | null,
): string | null => {
  const isPrimary = (p: T) => invNormCode(p.barcode) === code && (p.barcode ?? "") !== "";
  /* طبقةُ الشركة تحاكي SQL حرفياً: `(company_id = v_company) desc nulls last`.
   * وهي ثلاثُ مراتبَ لا اثنتان — والفرقُ كلُّه بدلالات NULL التي تخالف جافاسكربت:
   *  · فاتورةٌ بلا شركة (v_company فارغ): الشرطُ NULL لكلّ صفّ ⇒ **لا تمييزَ
   *    أصلاً**. وكانت `=== null` تُقدّم منتجاتِ «بلا شركة» — عكسَ الخادم؛
   *  · وفاتورةٌ بشركة: مطابقُها أوّلاً (true)، ثم مخالفُها (false)، ثم «بلا
   *    شركة» **آخرَ شيء** (NULL ⇒ nulls last) — وكانت تُسوّى بالمخالف. */
  const coRank = (p: T): number => purchaseCoRank(p.company_id, companyId);
  return rows
    .filter((p) => isPrimary(p) || (p.alt_codes ?? []).some((a) => invNormCode(a) === code))
    .sort((a, b) => Number(isPrimary(b)) - Number(isPrimary(a))
      || coRank(b) - coRank(a)
      || Number(b.section_id != null) - Number(a.section_id != null)
      || (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0]?.id ?? null;
};

/** صورةُ المنتج للكشف — نفسُ حقول `purchase_effect_snap` (0211). */
const effectSnap = (p: Product | undefined): PurchaseEffectSnap | null => p ? {
  name: p.name, barcode: p.barcode ?? null, stock: p.stock ?? 0,
  purchase_price: p.purchase_price ?? 0, sell_price: p.sell_price ?? 0, min_stock: p.min_stock ?? 0,
  expiry_date: p.expiry_date ?? null, category: p.category ?? null, company_id: p.company_id ?? null,
  section_id: p.section_id ?? null, pooled: p.pooled ?? false,
} : null;

const EFFECT_FIELDS = ["barcode", "category", "company_id", "expiry_date", "min_stock", "purchase_price", "sell_price"] as const;

const DEMO_NOTES_KEY = "vp_demo_pet_notes";

/* ── حقولُ الدواجن تجريبياً (0191) — مفاتيحُ localStorage مستقلّة ───────────
 * خارج `vp_demo_db` عمداً: قاعدةُ الجهاز التجريبية محدودةُ الحصّة (١٤ صفّاً
 * صنعت ٤٫٢ ميغا مرّةً)، وسطورُ الحقل اليومية تنمو بلا سقفٍ طبيعيّ — دفعةٌ
 * واحدةٌ بأربعين يوماً وثلاثِ قاعاتٍ = مئاتُ الصفوف. */
const DEMO_POULTRY: Record<string, string> = {
  farms: "vp_demo_pfarms", houses: "vp_demo_phouses", cycles: "vp_demo_pcycles",
  daily: "vp_demo_pdaily", use: "vp_demo_puse",
};

function demoExpensesLoad(): Expense[] {
  try { const r = localStorage.getItem(DEMO_EXPENSES_KEY); if (r) return JSON.parse(r) as Expense[]; } catch { /* ignore */ }
  return [];
}

function demoExpensesSave(list: Expense[]) { try { localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(list)); } catch { /* ignore */ } }

function demoAuditLoad(): AuditEntry[] {
  try { const r = localStorage.getItem(DEMO_AUDIT_KEY); if (r) return JSON.parse(r) as AuditEntry[]; } catch { /* ignore */ }
  return [];
}

/** Signed-in demo user's display name — stamped on demo log rows (the server
 *  stores auth.uid() instead and the UI resolves it via the staff list). */
function demoActorName(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { full_name?: string } } | null;
    return s?.raw?.full_name ?? null;
  } catch { return null; }
}

/** لا `data:` بسجلّ الجهاز.
 *
 *  الصورةُ تُخزَّن تجريبياً **عنواناً مضمَّناً** (`uploadProductImage` ترجع
 *  `upload.dataUrl`)، فنسخُها بالسجلّ يأكل حصّةَ الجهاز بلا أن يراها أحد:
 *  `activityBrief` تُسقط ما فوق مئتَي حرفٍ أصلاً، والسجلُّ لا يعرض الحقلَ
 *  الخام. أي أننا كنّا ندفع بالحصّة ثمنَ بايتاتٍ لا تُقرأ.
 *
 *  والمرورُ **عميق** لأن ما يصل `details` ليس صفّاً مسطّحاً دائماً: المُغلِّف
 *  يمرّر ما ترجعه الدالّة أو أوّلَ وسيطها — ومنها مصفوفاتٌ تُنشر بمفاتيحَ
 *  رقمية فتصير صفوفاً متداخلة، وحقولٌ مركّبة (`items`، `values`). */
function auditSafe(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.startsWith("data:") ? `[data:${v.length}]` : v;
  if (v === null || typeof v !== "object" || depth >= 6) return v;
  if (Array.isArray(v)) return v.map((x) => auditSafe(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = auditSafe(x, depth + 1);
  return out;
}

/** سقفُ السجلّ **بالمحارف لا بالصفوف**: الحصّةُ تُقاس بالبايت، وخمسُمئة صفٍّ
 *  قد تكون خمسينَ كيلو كما قد تكون ميغاتٍ. سقفُ العدد يبقى حدّاً أعلى. */
const DEMO_AUDIT_MAX_CHARS = 256 * 1024;

function demoLoginLoad(): LoginEvent[] {
  try { const r = localStorage.getItem(DEMO_LOGIN_KEY); if (r) return JSON.parse(r) as LoginEvent[]; } catch { /* ignore */ }
  return [];
}

/* ---- بوّابة المالك (0158) — تخزينُ الوضع التجريبي ----
 * بمفاتيح مستقلّة عن `DemoDB` عمداً: رفعُ رقم البذرة وسط جلسةِ تعديلٍ يسابق
 * HMR فيُنشئ المفتاحَ الجديد بلا الحقول الجديدة ويثبت — مصيدةٌ وقعنا بيها
 * قبلاً. والرموزُ والجلسات حالةُ جلسةٍ لا بذرةَ بيانات، فمحلُّها هنا أصلاً. */
const DEMO_PORTAL_CODES_KEY = "vp_portal_codes";

function readPortalSessions(): Record<string, DemoPortalSession> {
  try { const r = localStorage.getItem(DEMO_PORTAL_SESSIONS_KEY); if (r) return JSON.parse(r) as Record<string, DemoPortalSession>; } catch { /* ignore */ }
  return {};
}

function writePortalSessions(m: Record<string, DemoPortalSession>) {
  try { localStorage.setItem(DEMO_PORTAL_SESSIONS_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/** الرقودُ المفتوح لحيوان — مرآةُ الاستعلام الفرعي بـportal_me. */
function portalAdmissionOf(db: DemoDB, petId: string): PortalAdmission | null {
  const a = (db.admissions ?? [])
    .filter((x) => x.pet_id === petId && x.status === "active")
    .sort((x, y) => String(y.admitted_on).localeCompare(String(x.admitted_on)))[0];
  return a ? { kind: a.kind, since: a.admitted_on ?? null, reason: a.reason ?? null } : null;
}

/** الرحلةُ الحيّة غيرُ الصامتة — النوعُ معها لأن تسميةَ المرحلة تُقرأ به. */
function portalJourneyOf(db: DemoDB, petId: string): PortalJourney | null {
  const j = (db.journeys ?? []).find((x) => x.pet_id === petId && x.status === "active" && !x.silent);
  return j ? { kind: j.kind, stage: j.stage } : null;
}

/**
 * مرآةُ كتلة المطابقة بالرمز داخل `record_purchase`/`update_purchase` (0166):
 * الرمزُ الأساسيّ **والرموزُ الإضافية**، والأساسيُّ يغلب عند التزاحم، ثم
 * شركةُ الفاتورة، ثم المصنَّف، ثم الأقدم. كانت هنا تفحص الأساسيَّ وحده — أي
 * أن الشراء لا يلقى ما يلقاه الكاشير: قطعةٌ رمزُها الأساسيّ رقمُ رفّ وباركودُ
 * المصنع بإضافيّها تُنشَأ من جديد برصيدٍ مقسوم بكلّ فاتورة شراء.
 */
/** منتهية؟ `expiry_date` آخرُ يومٍ صالح، والمقارنةُ بتاريخ الجهاز — نفسُ قاعدة
 *  `expiry.ts` (لا تُستورد هنا: repo بمسار الإقلاع، وتلك تقرأ نطاقاً بارداً). */
const isExpiredOn = (d: string | null | undefined, today = localISO()): boolean =>
  /^\d{4}-\d{2}-\d{2}/.test(String(d ?? "")) && String(d).slice(0, 10) < today;

/** ما تبدّل عدا الرصيد — `purchase_effect_changed`. */
const effectChanged = (b: PurchaseEffectSnap | null, a: PurchaseEffectSnap | null): string[] =>
  !b || !a ? [] : EFFECT_FIELDS.filter((k) => (b[k] ?? null) !== (a[k] ?? null));


/**
 * سطرُ شراءٍ واحد على مخزن التجريبيّ — **موضعٌ واحد** للتسجيل والتعديل (كانا نسختين
 * متطابقتين تقريباً فافترقتا عن SQL بمطابقة الاسم). يرجع كيف لُقيت المادّة وصورتيها.
 * `addStock` يقرّر الحصر: التسجيلُ يحصر بصفر، والتعديلُ لا (مرآةُ 0205).
 */
function applyPurchaseLine(
  db: DemoDB, l: PurchaseDraftLine, companyId: string | null, now: string,
  nums: { qty: number; cost: number; sell: number; minStock: number | null }, addStock: (stock: number, qty: number) => number,
): { pid: string; how: PurchaseEffect["matched_by"]; before: PurchaseEffectSnap | null; after: Product } {
  const products = db.products ?? (db.products = []);
  let pid = l.product_id ?? null;
  let how: PurchaseEffect["matched_by"] = pid ? "id" : null;
  const code = invNormCode(l.barcode);
  if (!pid && code) {
    pid = pickByPurchaseCode(products, code, companyId);
    if (pid) {
      const row = products.find((x) => x.id === pid);
      how = row && invNormCode(row.barcode) === code && (row.barcode ?? "") !== "" ? "barcode" : "alt_code";
    }
  }
  const lname = invNormName(l.name);
  if (!pid && lname.length >= 2 && lname !== "item") {
    pid = pickByPurchaseName(products, lname, companyId);
    if (pid) how = "name";
  }
  const existing = pid ? products.find((x) => x.id === pid) : undefined;
  if (existing) {
    const before = effectSnap(existing);
    if (!existing.barcode && l.barcode?.trim()) existing.barcode = l.barcode.trim();
    existing.stock = addStock(existing.stock || 0, nums.qty);
    // A received count makes this a TRACKED product — no longer part of the
    // section's unknown pool (the pool itself is deliberately left untouched).
    existing.pooled = false;
    // Only refresh a price when a positive value was entered — a blank/0
    // field on a restock line KEEPS the product's real price (never zero it).
    if (nums.cost > 0) existing.purchase_price = nums.cost;
    if (nums.sell > 0) existing.sell_price = nums.sell;
    if (nums.minStock != null) existing.min_stock = nums.minStock;
    if (l.expiry_date) existing.expiry_date = l.expiry_date;
    if (l.category) existing.category = l.category;
    if (!existing.company_id && companyId) existing.company_id = companyId;
    return { pid: existing.id, how, before, after: existing };
  }
  // صنف القطعة الجديدة — يُقبل فقط إن كان صنفاً حقيقياً لهذه الشركة.
  const sec = l.section_id
    ? (db.companySections ?? []).find((x) => x.id === l.section_id
        && (!companyId || x.company_id === companyId))?.id ?? null
    : null;
  const np: Product = {
    id: uid("prod"), clinic_id: null, company_id: companyId, section_id: sec,
    barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
    category: l.category ?? null, subcategory: null,
    purchase_price: nums.cost, sell_price: nums.sell, stock: Math.max(0, nums.qty),
    min_stock: nums.minStock ?? 0, expiry_date: l.expiry_date || null,
    created_at: now,
  };
  products.push(np);
  return { pid: np.id, how: null, before: null, after: np };
}


/**
 * صورةُ صفٍّ يخرج من `products` — مرآةُ محفّز 0146: **أيُّ** صفٍّ يخرج بأيّ
 * طريقٍ يُصوَّر، حذفاً كان أو دمجاً أو ترتيباً. وكان بالنسخة التجريبية ناسخان
 * متطابقان تقريباً (الحذف والدمج) وطريقٌ ثالثٌ بلا صورةٍ أصلاً («رتّبِ المخزن»)
 * — فما تطويه ثمّ يختفي بلا رجعة، بينما السحابةُ تحفظه ويُفكّ من المحذوفات.
 * ونسخةٌ ثالثةٌ كانت ستصير رابعة، فصار للصورة موضعٌ واحد.
 */
function trashProduct(db: DemoDB, row: Product, extra: { reason?: string | null; merged_into?: string; keep_barcode?: string | null } = {}): void {
  if (!db.productsTrash) db.productsTrash = [];
  db.productsTrash = db.productsTrash.filter((t) => t.id !== row.id);
  db.productsTrash.push({
    id: row.id, clinic_id: null, row: { ...row },
    invoice_item_ids: (db.invoiceItems ?? []).filter((i) => i.product_id === row.id).map((i) => i.id),
    purchase_item_ids: (db.purchaseItems ?? []).filter((i) => i.product_id === row.id).map((i) => i.id),
    sold_qty: (db.invoiceItems ?? []).filter((i) => i.product_id === row.id && i.qty > 0).reduce((n, i) => n + i.qty, 0),
    stock: row.stock || 0,
    reason: extra.reason?.trim() || null,
    deleted_by: null,
    deleted_at: new Date().toISOString(),
    ...(extra.merged_into ? { merged_into: extra.merged_into, keep_barcode: extra.keep_barcode ?? null } : {}),
  });
}


/** ثلاثُ منازل — نفسُ `round(x, 3)` بالقاعدة؛ حوضُ الأصناف يُخزَّن بها. */
const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;


/**
 * صورةُ شركةٍ تخرج من `companies` — مرآةُ محفّز 0197 وتوسعةِ 0198. والفرقُ
 * الذي كلّف الديون: مفتاحُ `company_charges` و`company_sections`
 * **`on delete cascade`**، فالصفُّ نفسُه يُمحى ولا يعيده معرّف. لذا تُحفظ
 * **صفوفُ المطالبات كاملةً** هنا كما بالقاعدة، وصفوفُ الأصناف بسلّتها.
 */
function trashCompany(db: DemoDB, row: Company, extra: { reason?: string | null; merged_into?: string; keep_note?: string | null } = {}): DeletedCompany {
  if (!db.companiesTrash) db.companiesTrash = [];
  db.companiesTrash = db.companiesTrash.filter((t) => t.id !== row.id);
  const secs = (db.companySections ?? []).filter((x) => x.company_id === row.id);
  const snap: DeletedCompany = {
    id: row.id, clinic_id: row.clinic_id ?? null, row: { ...row },
    merged_into: extra.merged_into ?? null,
    product_ids: (db.products ?? []).filter((p) => p.company_id === row.id).map((p) => p.id),
    purchase_ids: (db.purchases ?? []).filter((p) => p.company_id === row.id).map((p) => p.id),
    payment_ids: (db.purchasePayments ?? []).filter((p) => p.company_id === row.id).map((p) => p.id),
    charge_ids: (db.companyCharges ?? []).filter((c) => c.company_id === row.id).map((c) => c.id),
    sections: secs.map((sec) => ({
      id: sec.id, name: sec.name, pooled_moved: 0, folded_into: null,
      product_ids: (db.products ?? []).filter((p) => p.section_id === sec.id).map((p) => p.id),
    })),
    // الطيُّ ينقل الصفوفَ حيّةً فلا نسخةَ لها؛ والحذفُ الصريح يمحوها فتُنسخ.
    charges: extra.merged_into ? [] : (db.companyCharges ?? []).filter((c) => c.company_id === row.id).map((c) => ({ ...c })),
    // ملاحظةُ الباقية قبل الاتّحاد — بلا حفظها يستحيل فكُّ الاتّحاد (0201).
    keep_note: extra.merged_into ? extra.keep_note ?? null : null,
    reason: extra.reason?.trim() || null,
    deleted_by: null,
    deleted_at: new Date().toISOString(),
  };
  db.companiesTrash.push(snap);
  // وصورةُ كلِّ صنفٍ يخرج بالتتالي — محفّزُ الأصناف يعمل أثناءه بالقاعدة.
  if (!extra.merged_into) {
    if (!db.companySectionsTrash) db.companySectionsTrash = [];
    for (const sec of secs) {
      db.companySectionsTrash = db.companySectionsTrash.filter((t) => t.id !== sec.id);
      db.companySectionsTrash.push({
        id: sec.id, clinic_id: sec.clinic_id ?? null, company_id: sec.company_id, row: { ...sec },
        folded_into: null, pooled_moved: 0,
        product_ids: (db.products ?? []).filter((p) => p.section_id === sec.id).map((p) => p.id),
        deleted_at: new Date().toISOString(),
      });
    }
  }
  return snap;
}


/** Sort key for a case/admission — newest first. Prefers the precise `created_at`
 *  timestamp (so same-day cases keep their true insertion order) and falls back to
 *  the day-granularity `admitted_on` for any legacy row that predates the column. */
function admOrderKey(a: Admission): string {
  return a.created_at ?? a.admitted_on;
}


/** Demo-store sale core: create the invoice + its items and decrement stock. Shared by
 *  the quick POS checkout and the retail checkout (which adds customer/discount/payment). */
/** Append one movement event (demo mirror of the 0070 server trigger). Caller saves. */
function pushMovementLocal(db: DemoDB, m: Omit<PetMovement, "id" | "at" | "created_at">): void {
  if (!db.petMovements) db.petMovements = [];
  const now = new Date().toISOString();
  db.petMovements.push({ ...m, id: uid("mov"), at: now, created_at: now });
}


function createInvoiceLocal(items: CheckoutItem[], meta?: SaleMeta): Invoice {
  const db = loadDB();
  if (!db.products) db.products = [];
  if (!db.invoices) db.invoices = [];
  if (!db.invoiceItems) db.invoiceItems = [];
  // مرآةُ `retail_checkout` (0135): نفسُ المرجع = نفسُ البيعة — ترجع الفاتورة
  // الأولى بلا سحبِ مخزونٍ ثانٍ. غيابُها هنا خلّى قبولَ طلبٍ مكرّراً يولّد
  // فاتورتين بالتجريبي بينما الإنتاج يرجع الأولى (فحص التطابق ٠٩/٠٩).
  const ref = meta?.client_ref?.trim();
  if (ref) {
    const prior = db.invoices.find((v) => v.client_ref === ref);
    if (prior) return prior;
  }
  /* ── حسابُ المال: مرآةٌ حرفية لـ`retail_checkout` (0156) ──────────────────
   *
   * الفرقُ لم يكن كسرَ فلسٍ من طفوٍ ثنائي: `final_total` كان يُدوَّر بـ
   * `Math.round` — أي **إلى الدينار الكامل** — بينما الخادمُ `numeric(14,2)`.
   * فـ1562.5 تصير 1563 هنا و1562.50 هناك: **نصفُ دينارٍ بكلّ فاتورة**، وهو
   * الفرعُ الوحيدُ الذي تسلكه شاشةُ البيع (SaleBuilder يرسل `final_total` دائماً).
   *
   * وثانيةٌ أدقّ: متغيّراتُ الخادم `numeric(14,2)` فالمجموعُ الجاري يُدوَّر
   * **بعد كل سطر** لا مرّةً بالنهاية. ثلاثةُ سطورٍ بـ0.005 تعطي 0.03 هناك
   * و0.015 هنا. والكميةُ `numeric(14,3)` تُدوَّر قبل الضرب، و`item_count`
   * عددٌ صحيح بينما كان يبقى كسرياً (0.125).
   *
   * والأعمدةُ مقيسةٌ على الإنتاج لا مفترَضة: المالُ scale=2، الكميةُ 3،
   * `item_count` integer. */
  const rq = (n: number) => Math.round(n * 1000) / 1000;
  let subtotal = 0, cost = 0, count = 0;
  for (const i of items) {
    const q = rq(i.qty);
    subtotal = round2(subtotal + q * i.unit_price);
    cost = round2(cost + q * i.unit_cost);
    count = rq(count + q);
  }
  const dtype = meta?.discount_type ?? null;
  // v_dinput numeric(12,2): المدخَلُ نفسُه يُدوَّر قبل القصّ.
  const dinput = round2(meta?.discount_value ?? 0);
  // A cashier-set final price wins outright — it may be a markup ABOVE the subtotal or a
  // discount below it. Otherwise fall back to the percent/fixed discount computation.
  let total: number; let discount: number; let dtypeOut: DiscountType | null;
  if (meta?.final_total != null) {
    total = Math.max(0, round2(meta.final_total));
    discount = round2(Math.max(0, subtotal - total));
    // الخادمُ يفرض 'fixed' هنا مهما كان الوسمُ المُرسَل — كان يمرّ 'percent'.
    dtypeOut = discount > 0 ? "fixed" : null;
  } else if (dtype === "percent") {
    discount = round2(subtotal * Math.min(Math.max(dinput, 0), 100) / 100);
    total = Math.max(0, round2(subtotal - discount));
    // والوسمُ يبقى ولو كان الخصمُ صفراً — كان يُصفَّر إلى null.
    dtypeOut = "percent";
  } else if (dtype === "fixed") {
    discount = Math.min(Math.max(dinput, 0), subtotal);
    total = Math.max(0, round2(subtotal - discount));
    dtypeOut = "fixed";
  } else {
    discount = 0; dtypeOut = null;
    total = Math.max(0, subtotal);
  }
  // Amount received today. Absent → paid in full; otherwise clamp into [0, total] (a
  // shortfall becomes a credit/debt sale; any overpayment is change and never exceeds the total).
  const amountPaid = meta?.amount_paid != null ? Math.max(0, Math.min(total, round2(meta.amount_paid))) : total;
  const invoice: Invoice = {
    id: uid("inv"),
    customer_name: meta?.customer_name?.trim() || null,
    customer_phone: meta?.customer_phone?.trim() || null,
    pet_name: meta?.pet_name?.trim() || null,
    subtotal, discount, discount_type: dtypeOut,
    payment_method: meta?.payment_method ?? null,
    payment_details: meta?.payment_details && meta.payment_details.length ? meta.payment_details : null,
    total, amount_paid: amountPaid, cost_total: cost, profit: round2(total - cost), item_count: Math.round(count),
    print_count: 0, status: "paid", refunded_at: null,
    staff_id: meta?.staff_id?.trim() || null,
    notes: meta?.notes?.trim() || null,
    // نفسُ سقوطِ الخادم (0156): المجهولُ تجزئة — والنسخةُ التجريبية هي ما
    // تجري عليه فحوصُ المنطق، فسلوكٌ ناقصٌ هنا سلوكٌ لم يُفحص.
    sale_kind: meta?.sale_kind === "wholesale" ? "wholesale" : "retail",
    client_ref: ref || null,
    created_at: new Date().toISOString(),
  };
  db.invoices.push(invoice);
  const r3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
  for (const i of items) {
    // Box-equivalent removed from stock: the fraction for sub-unit sales, else the qty.
    const stockQty = i.stock_qty != null ? i.stock_qty : i.qty;
    let fromPool = 0;
    if (i.product_id) {
      const p = db.products.find((x) => x.id === i.product_id);
      // سطر راجع (كمية سالبة، 0122): القطعة ترجع لرصيد المنتج المعروف —
      // نفس مسار دالّة السيرفر حرفياً فلا يختلف حسابان للمخزون.
      if (p && stockQty < 0) {
        p.stock = Math.round((p.stock + -stockQty) * 1000) / 1000;
      } else if (p) {
        // Known-first: sell the product's own tracked stock, then fall back to
        // its section pool (the unknown legacy reserve). Round to 3 dp to avoid drift.
        let rem = stockQty;
        const fromStock = Math.min(rem, Math.max(0, p.stock || 0));
        if (fromStock > 0) { p.stock = r3(p.stock - fromStock); rem -= fromStock; }
        if (rem > 0 && p.section_id) {
          const sec = (db.companySections ?? []).find((x) => x.id === p.section_id);
          const pool = sec?.pooled_stock ?? 0;
          if (sec && pool > 0) {
            fromPool = Math.min(rem, pool);
            sec.pooled_stock = r3(pool - fromPool);
            rem -= fromPool;
          }
        }
      }
    }
    db.invoiceItems.push({ id: uid("ii"), invoice_id: invoice.id, product_id: i.product_id ?? null, name: i.name, barcode: i.barcode ?? null, qty: rq(i.qty), unit_price: i.unit_price, unit_cost: i.unit_cost, line_total: round2(rq(i.qty) * i.unit_price), stock_qty: stockQty, pooled_qty: fromPool, unit_label: i.unit_label ?? null });
  }
  saveDB(db);
  return invoice;
}

/** Credit a refunded/voided line back to inventory, reversing the pool-first
 *  split: the part that came from the section pool returns to the pool, the rest
 *  to the product's tracked stock. Legacy rows (pooled_qty absent) → all to stock. */
function restockLocal(db: ReturnType<typeof loadDB>, it: InvoiceItem) {
  if (!it.product_id) return;
  const p = (db.products ?? []).find((x) => x.id === it.product_id);
  if (!p) return;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const sq = it.stock_qty != null ? it.stock_qty : it.qty;
  const pq = it.pooled_qty ?? 0;
  let credited = 0;
  if (pq > 0 && p.section_id) {
    const sec = (db.companySections ?? []).find((s) => s.id === p.section_id);
    if (sec) { sec.pooled_stock = r3((sec.pooled_stock ?? 0) + pq); credited = pq; }
  }
  p.stock = r3(p.stock + (sq - credited));
}

function demoNotesLoad(): PetNote[] {
  try { const r = localStorage.getItem(DEMO_NOTES_KEY); if (r) return JSON.parse(r) as PetNote[]; } catch { /* ignore */ }
  return [];
}

function demoNotesSave(list: PetNote[]) { try { localStorage.setItem(DEMO_NOTES_KEY, JSON.stringify(list)); } catch { /* ignore */ } }

function pLoad<T>(k: string): T[] {
  try { const r = localStorage.getItem(DEMO_POULTRY[k]); if (r) return JSON.parse(r) as T[]; } catch { /* ignore */ }
  return [];
}

function pSave<T>(k: string, list: T[]) { try { localStorage.setItem(DEMO_POULTRY[k], JSON.stringify(list)); } catch { /* ignore */ } }


/** تسجيل مصروف بالوضع التجريبي. مشتركٌ بين addExpense وترحيل الرواتب حتى
 *  يمرّ خروج المال من مسلكٍ واحد مهما كان مصدره. */
function demoAddExpense(input: Omit<Expense, "id" | "created_at">): Expense {
  const e: Expense = { ...input, id: uid("exp"), clinic_id: null, created_at: new Date().toISOString() };
  demoExpensesSave([e, ...demoExpensesLoad()]);
  return e;
}

function demoAuditPush(e: Omit<AuditEntry, "id" | "created_at" | "actor">) {
  const details = { ...(auditSafe(e.details ?? {}) as Record<string, unknown>), __actor: demoActorName() };
  const entry: AuditEntry = { ...e, details, id: uid("au"), actor: null, created_at: new Date().toISOString() };
  try {
    const list = [entry, ...demoAuditLoad()].slice(0, 500);
    let raw = JSON.stringify(list);
    // الأقدمُ يخرج أوّلاً، والأحدثُ لا يخرج أبداً — سطرٌ واحدٌ يبقى مهما كبر.
    while (list.length > 1 && raw.length > DEMO_AUDIT_MAX_CHARS) { list.pop(); raw = JSON.stringify(list); }
    localStorage.setItem(DEMO_AUDIT_KEY, raw);
  } catch { /* swallow-ok: سجلُّ الجهاز ليس قرارَ مالٍ — والكتابةُ نفسُها تُسمَع بـsaveDB */ }
}

function demoLoginSave(list: LoginEvent[]) { try { localStorage.setItem(DEMO_LOGIN_KEY, JSON.stringify(list)); } catch { /* ignore */ } }


function readPortalCodes(): Record<string, DemoPortalCode> {
  try { const r = localStorage.getItem(DEMO_PORTAL_CODES_KEY); if (r) return JSON.parse(r) as Record<string, DemoPortalCode>; } catch { /* ignore */ }
  return {};
}

function writePortalCodes(m: Record<string, DemoPortalCode>) {
  try { localStorage.setItem(DEMO_PORTAL_CODES_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/** الجلسةُ الحيّة وحدها — المنتهيةُ تُكنس عند أوّل لمسة. */
function portalSession(token: string): DemoPortalSession | null {
  const all = readPortalSessions();
  const s = all[token];
  if (!s) return null;
  if (new Date(s.expires).getTime() <= Date.now()) {
    delete all[token]; writePortalSessions(all);
    return null;
  }
  return s;
}

/** بطاقةُ الحيوان بقائمة «حيواناتي». */
function portalCardOf(db: DemoDB, p: Pet): PortalPetCard {
  const today = localISO();
  const doses = (db.treatments ?? []).filter((t) => t.pet_id === p.id && t.day === today);
  const nextVax = (db.vaccinations ?? [])
    .filter((v) => v.pet_id === p.id && v.due_date && !v.administered_at)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  return {
    id: p.id, name: p.name, species: p.species ?? null, breed: p.breed ?? null,
    sex: p.sex ?? null, dob: p.dob ?? null, photo_url: p.photo_url ?? null,
    weight_kg: p.current_weight_kg ?? null,
    admission: portalAdmissionOf(db, p.id),
    journey: portalJourneyOf(db, p.id),
    next_vaccine: nextVax ? { name: nextVax.name, due_date: nextVax.due_date ?? null } : null,
    today: { total: doses.length, given: doses.filter((t) => !!t.administered_at).length },
  };
}


/** رسالةُ «قرار الطلب نهائي» — نصٌّ واحدٌ بموضعين كانا يكرّرانه حرفياً.
 *  مرآةُ محفّز 0176، ومرآةُ حارس `store_accept_order` معه (0183). */
function decisionLocked(status: string): Error {
  const st = status === "accepted" ? i18next.t("pos.storeDecidedAccepted", "مقبولٌ وانفوتر")
    : status === "rejected" ? i18next.t("pos.storeDecidedRejected", "مرفوض")
    : i18next.t("pos.storeDecidedCancelled", "ملغى");
  return new Error(i18next.t("pos.storeDecisionLocked", { st, defaultValue: "قرار الطلب نهائي: طلبٌ {{st}} ما يرجع «جديد» ولا يتقرّر مرتين. إذا صار خطأ، عالجه بمرتجعٍ من شاشة المبيعات." }));
}


/* ============================================================================
 * Live Supabase implementation — used automatically when VITE_SUPABASE_* are
 * set. The TS types already use snake_case, so DB rows map 1:1 (cast directly).
 * ==========================================================================*/
/** رمزٌ يصيب منتجَين: الكونسولُ لا يراه أحدٌ خلف الكاونتر. يُقال مرّةً لكل
 *  رمزٍ بالجلسة — تكرارُه مع كل مسحةٍ يصير ضجيجاً يُتجاهَل. والبيعُ يكمل على
 *  الأوّل بترتيبٍ حتميّ (0165)، فالتنبيهُ دعوةٌ لتنظيف المخزون لا حاجزٌ للبيع. */
/** مرآةُ محفّز الخادم `products_no_twin_code` (0167): رمزٌ واحد لمنتجٍ واحد،
 *  كشفاً متناظراً (الأساسيّ والإضافيّ) ومطبَّعاً، والصفُّ نفسُه مستثنى. ويرمي
 *  بشكل الخادم — P0001 وhint عربيّ — لا بشكل 23505 القديم: فحصٌ على صيغةِ خطأٍ
 *  لا تحدث بالإنتاج فحصٌ لغير الواقع. */
function throwIfCodeTaken(db: DemoDB, code: string | null, selfId: string | null): void {
  if (!code) return;
  const c = matchCode(code);
  if (!c) return;
  const owner = (db.products ?? []).find((x) =>
    x.id !== selfId
    && (matchCode(x.barcode) === c || (x.alt_codes ?? []).some((a) => matchCode(a) === c)));
  if (!owner) return;
  const e = new Error("barcode_taken") as Error & { code: string; hint: string };
  e.code = "P0001";
  e.hint = i18next.t("pos.barcodeTakenHint", { name: owner.name, defaultValue: "هذا الباركود مستعمل عند «{{name}}». افتح المخزون وادمج المنتجَين أو غيّر رمزَ أحدهما." });
  throw e;
}


/** مرآةُ الاتحاد بـactivity_page للوضع التجريبي: التدقيقُ + الدخولُ، مصنَّفةً ومختصَرة. */
function demoActivityRows(from: string, to: string): ActivityRow[] {
  const inRange = (at: string) => at >= from && at < to;
  const audit: ActivityRow[] = demoAuditLoad().filter((e) => inRange(e.created_at)).map((e) => ({
    id: e.id, src: "a", created_at: e.created_at, actor: e.actor ?? null,
    actor_name: (typeof e.details?.["__actor"] === "string" ? String(e.details["__actor"]) : null),
    kind: auditKind(e.entity, e.action, e.details), action: e.action, entity: e.entity, entity_id: e.entity_id ?? null,
    brief: activityBrief(e.details),
  }));
  const logins: ActivityRow[] = demoLoginLoad().filter((l) => inRange(l.created_at)).map((l) => ({
    id: l.id, src: "l", created_at: l.created_at, actor: null,
    actor_name: (l.name ?? "").trim() || (l.email ?? "").trim() || null,
    kind: "login", action: "LOGIN", entity: "login", entity_id: null,
    brief: { __actor: (l.name ?? "").trim() || (l.email ?? "").trim() || null },
  }));
  return [...audit, ...logins];
}


/** مرآةُ `invoice_matches` (0150) للوضع التجريبي: اسمٌ/هاتفٌ/رقمُ فاتورة بنفس التطبيع، وفلترُ الحالة. */
function demoMatchingInvoices(s: InvoiceSearch): Invoice[] {
  const q = (s.q ?? "").trim();
  const nq = searchable(q);
  const pq = phoneDigits(q);
  const noq = q.replace(/^inv-?/i, "").toUpperCase();
  const status = s.status ?? "all";
  return (loadDB().invoices ?? []).filter((i) => {
    if (status !== "all" && (i.status ?? "paid") !== status) return false;
    if (!nq) return true;
    return searchable(i.customer_name).includes(nq)
      || (!!pq && phoneDigits(i.customer_phone ?? "").includes(pq))
      || (!!noq && invoiceNo(i.id).slice(4).includes(noq));
  });
}


/** نظيرُ `inRange` بالوضع التجريبي: يصفّي مصفوفةً على عمودٍ زمنيّ. */
function within<T>(rows: T[], col: string, r?: DateRange): T[] {
  if (!r?.from && !r?.to) return rows.slice();
  return rows.filter((x) => {
    const d = String((x as Record<string, unknown>)[col] ?? "");
    return (!r.from || d >= r.from) && (!r.to || d <= r.to);
  });
}


const demoRepo = {
  async listPets(ownerId: string): Promise<Pet[]> {
    return loadDB().pets.filter((p) => p.owner_id === ownerId);
  },

  /** All pets for a clinic (used by the clinic log / records). Demo is single-tenant. */
  async listAllPets(_clinicId?: string): Promise<Pet[]> {
    return loadDB().pets;
  },

  /** Update an owner's contact details across all of their pets. */
  async updateOwnerContact(ownerId: string, patch: { owner_name?: string; owner_phone?: string; owner_email?: string }): Promise<void> {
    const db = loadDB();
    for (const p of db.pets) {
      if (p.owner_id === ownerId) Object.assign(p, patch);
    }
    saveDB(db);
  },

  async getPet(petId: string): Promise<Pet | undefined> {
    return loadDB().pets.find((p) => p.id === petId);
  },

  /** Batch pet fetch — ONE round-trip for a whole list (bookings/requests views). */
  async getPetsByIds(ids: string[]): Promise<Pet[]> {
    if (ids.length === 0) return [];
    const set = new Set(ids);
    return loadDB().pets.filter((p) => set.has(p.id));
  },

  async getPetByToken(token: string): Promise<Pet | undefined> {
    return loadDB().pets.find((p) => p.passport_token.toUpperCase() === token.trim().toUpperCase());
  },

  async getPetBySerial(serial: string): Promise<Pet | undefined> {
    const s = serial.trim();
    return loadDB().pets.find((p) => p.serial === s);
  },

  /** Owner claims an existing animal (by serial) into their profile.
   *  Claiming only LINKS the account (owner_id). The clinic's stored customer
   *  fields (اسم المراجع/هاتفه) are never overwritten — they're only filled
   *  when the clinic left them blank. */
  async claimPet(serial: string, owner: { owner_id: string; owner_name?: string; owner_phone?: string; owner_email?: string }): Promise<Pet | undefined> {
    const db = loadDB();
    const pet = db.pets.find((p) => p.serial === serial.trim());
    if (!pet) return undefined;
    pet.owner_id = owner.owner_id;
    if (blankOwnerField(pet.owner_name) && owner.owner_name) pet.owner_name = owner.owner_name;
    if (blankOwnerField(pet.owner_phone) && owner.owner_phone) pet.owner_phone = owner.owner_phone;
    if (blankOwnerField(pet.owner_email) && owner.owner_email) pet.owner_email = owner.owner_email;
    saveDB(db);
    return pet;
  },

  /** Phone-as-identity auto-claim: link every pet registered (in any clinic) under
   *  the account's phone number to this owner account. Only the LINK (owner_id)
   *  changes — clinic-entered contact fields stay untouched. Pets already linked
   *  to another real owner account are never re-claimed. Returns the newly linked pets. */
  async claimPetsByPhone(input: { owner_id: string; phone?: string; name?: string; email?: string }): Promise<Pet[]> {
    const key = phoneKey(input.phone ?? "");
    if (key.length < 8) return [];
    const db = loadDB();
    const ownerAccountIds = new Set(loadOwners().map((o) => o.id));
    const claimed: Pet[] = [];
    for (const p of db.pets) {
      if (p.owner_id === input.owner_id) continue;
      if (ownerAccountIds.has(p.owner_id)) continue; // belongs to another owner account
      if (phoneKey(p.owner_phone ?? "") !== key) continue;
      p.owner_id = input.owner_id;
      if (blankOwnerField(p.owner_name) && input.name) p.owner_name = input.name;
      if (blankOwnerField(p.owner_email) && input.email) p.owner_email = input.email;
      claimed.push(p);
    }
    if (claimed.length) saveDB(db);
    return claimed;
  },

  /** Clinic lookup of an owner's shared pets by email (cross-clinic account access). */
  async getPetsByOwnerEmail(email: string): Promise<Pet[]> {
    const e = email.trim().toLowerCase();
    if (!e) return [];
    return loadDB().pets.filter((p) => (p.owner_email ?? "").toLowerCase() === e && p.shared_with_clinic !== false);
  },

  /** Shared pets for an owner id (used when a clinic scans the owner's personal QR). */
  async getSharedPetsByOwnerId(ownerId: string): Promise<Pet[]> {
    return loadDB().pets.filter((p) => p.owner_id === ownerId && p.shared_with_clinic !== false);
  },

  async createPet(input: Omit<Pet, "id" | "passport_token" | "created_at" | "serial">): Promise<Pet> {
    const db = loadDB();
    const existing = new Set(db.pets.map((p) => p.serial));
    let serial = "";
    do { serial = String(Math.floor(10000 + Math.random() * 90000)); } while (existing.has(serial));
    const pet: Pet = {
      ...input,
      id: uid("pet"),
      passport_token: `PET-${input.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-${uid("").slice(1, 6).toUpperCase()}`,
      serial,
      created_at: new Date().toISOString(),
    };
    db.pets.push(pet);
    saveDB(db);
    return pet;
  },

  async updatePet(petId: string, patch: Partial<Pet>): Promise<Pet | undefined> {
    const db = loadDB();
    const pet = db.pets.find((p) => p.id === petId);
    if (!pet) return undefined;
    Object.assign(pet, patch);
    saveDB(db);
    return pet;
  },

  async deletePet(petId: string): Promise<void> {
    const db = loadDB();
    db.pets = db.pets.filter((p) => p.id !== petId);
    // Cascade the pet's dependent records so nothing is left dangling (mirrors the
    // `on delete cascade` foreign keys used in the Supabase schema).
    db.weightLogs = db.weightLogs.filter((w) => w.pet_id !== petId);
    db.vaccinations = db.vaccinations.filter((v) => v.pet_id !== petId);
    db.visits = db.visits.filter((v) => v.pet_id !== petId);
    db.media = db.media.filter((m) => m.pet_id !== petId);
    db.treatments = db.treatments.filter((tr) => tr.pet_id !== petId);
    db.admissions = db.admissions.filter((a) => a.pet_id !== petId);
    if (db.appointments) db.appointments = db.appointments.filter((a) => a.pet_id !== petId);
    saveDB(db);
  },

  async listWeights(petId: string): Promise<WeightLog[]> {
    return loadDB()
      .weightLogs.filter((w) => w.pet_id === petId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  },

  async addWeight(petId: string, weight_kg: number, measured_at?: string): Promise<WeightLog> {
    const db = loadDB();
    const log: WeightLog = { id: uid("w"), pet_id: petId, weight_kg, measured_at: measured_at ?? new Date().toISOString().slice(0, 10) };
    db.weightLogs.push(log);
    const pet = db.pets.find((p) => p.id === petId);
    if (pet) pet.current_weight_kg = weight_kg;
    saveDB(db);
    return log;
  },

  async listVaccinations(petId: string): Promise<Vaccination[]> {
    return loadDB().vaccinations.filter((v) => v.pet_id === petId);
  },

  /** Vaccinations across a set of pets (the clinic directory) — for the
   *  dashboard reminders feed (vaccines + deworming due soon). */
  async listAllVaccinations(petIds: string[]): Promise<Vaccination[]> {
    const ids = new Set(petIds);
    return (loadDB().vaccinations ?? []).filter((v) => ids.has(v.pet_id));
  },

  async addVaccination(input: Omit<Vaccination, "id">): Promise<Vaccination> {
    const db = loadDB();
    const v: Vaccination = { ...input, id: uid("v") };
    db.vaccinations.push(v);
    saveDB(db);
    return v;
  },

  /** Patch a vaccination in place — e.g. administering a scheduled booster. */
  async updateVaccination(id: string, patch: Partial<Omit<Vaccination, "id" | "pet_id">>): Promise<void> {
    const db = loadDB();
    const v = db.vaccinations.find((x) => x.id === id);
    if (!v) return;
    Object.assign(v, patch);
    saveDB(db);
  },

  async listVisits(petId: string): Promise<MedicalVisit[]> {
    return loadDB()
      .visits.filter((v) => v.pet_id === petId)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /** Visits for a set of pets (the clinic's directory), newest first — one pass. */
  async listAllVisits(petIds: string[]): Promise<MedicalVisit[]> {
    const ids = new Set(petIds);
    return (loadDB().visits ?? [])
      .filter((v) => ids.has(v.pet_id))
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /** Every visit for the clinic in ONE query — see listClinicTreatments for why. */
  async listClinicVisits(_clinicId?: string, range?: DateRange): Promise<MedicalVisit[]> {
    return within(loadDB().visits ?? [], "visit_date", range).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /* ---- Care sheet: fluids, vitals, intake/output beside the doses ---- */
  async listCareEntries(petId: string, day?: string): Promise<CareEntry[]> {
    return (loadDB().careEntries ?? [])
      .filter((c) => c.pet_id === petId && (!day || c.day === day))
      .sort((a, b) => (a.day === b.day ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.day.localeCompare(b.day)));
  },

  async addCareEntry(input: Omit<CareEntry, "id" | "created_at">): Promise<CareEntry> {
    const db = loadDB();
    const row: CareEntry = { ...input, id: uid("care"), created_at: new Date().toISOString() };
    (db.careEntries ??= []).push(row);
    saveDB(db);
    return row;
  },

  async deleteCareEntry(id: string): Promise<void> {
    const db = loadDB();
    db.careEntries = (db.careEntries ?? []).filter((c) => c.id !== id);
    saveDB(db);
  },

  /* ---- Problem list (POMR) — persists across visits, read at prescribing time ---- */
  async listProblems(petId: string): Promise<PetProblem[]> {
    return (loadDB().petProblems ?? [])
      .filter((p) => p.pet_id === petId)
      .sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "active" ? -1 : 1));
  },

  async addProblem(input: Omit<PetProblem, "id" | "created_at">): Promise<PetProblem> {
    const db = loadDB();
    const row: PetProblem = { ...input, id: uid("prob"), created_at: new Date().toISOString() };
    (db.petProblems ??= []).unshift(row);
    saveDB(db);
    return row;
  },

  async updateProblem(id: string, patch: Partial<PetProblem>): Promise<void> {
    const db = loadDB();
    const row = (db.petProblems ?? []).find((p) => p.id === id);
    if (row) Object.assign(row, patch);
    saveDB(db);
  },

  async deleteProblem(id: string): Promise<void> {
    const db = loadDB();
    db.petProblems = (db.petProblems ?? []).filter((p) => p.id !== id);
    saveDB(db);
  },

  /* ---- طلبات التطوير: المساعد يرفعها، والعيادة تتابع حالتها ---- */
  async listFeatureRequests(): Promise<FeatureRequest[]> {
    return (loadDB().featureRequests ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addFeatureRequest(input: Omit<FeatureRequest, "id" | "created_at" | "updated_at" | "status"> & { status?: FeatureRequest["status"] }): Promise<FeatureRequest> {
    const db = loadDB();
    const now = new Date().toISOString();
    const row: FeatureRequest = { status: "new", ...input, id: uid("freq"), created_at: now, updated_at: now };
    (db.featureRequests ??= []).unshift(row);
    saveDB(db);
    return row;
  },

  async updateFeatureRequest(id: string, patch: Partial<FeatureRequest>): Promise<void> {
    const db = loadDB();
    const row = (db.featureRequests ?? []).find((r) => r.id === id);
    if (row) Object.assign(row, patch, { updated_at: new Date().toISOString() });
    saveDB(db);
  },

  /** Admin: أسقفُ المزوّد وما استُهلك منها (هجرة 0137). بالوضع التجريبي ماكو
   *  خادمٌ ولا باقة، فالقائمة فارغة — واللوحة تخفي نفسها بدل ما تخترع أرقاماً. */
  async systemHealth(): Promise<HealthMetric[]> {
    return [];
  },

  /** Admin: كل الطلبات عبر كل العيادات — بالديمو نفس قائمة العيادة الوحيدة. */
  async adminListFeatureRequests(): Promise<FeatureRequest[]> {
    return (loadDB().featureRequests ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addVisit(input: Omit<MedicalVisit, "id">): Promise<MedicalVisit> {
    const db = loadDB();
    // Snapshot the patient's age at visit time (unless the caller already provided it).
    const patient_age_months = input.patient_age_months ?? ageMonths(db.pets.find((p) => p.id === input.pet_id)?.dob);
    const v: MedicalVisit = { ...input, patient_age_months, id: uid("vis") };
    db.visits.push(v);
    saveDB(db);
    return v;
  },

  /* ---------------- Clinical / progress notes ---------------- */
  async listPetNotes(petId: string): Promise<PetNote[]> {
    return demoNotesLoad().filter((n) => n.pet_id === petId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async addPetNote(input: { pet_id: string; note_text: string; author_id?: string | null; author_name?: string | null; visit_id?: string | null }): Promise<PetNote> {
    const note: PetNote = {
      id: uid("note"), pet_id: input.pet_id, clinic_id: null,
      author_id: input.author_id ?? null, author_name: input.author_name ?? null,
      note_text: input.note_text, visit_id: input.visit_id ?? null, created_at: new Date().toISOString(),
    };
    demoNotesSave([note, ...demoNotesLoad()]);
    return note;
  },

  /* ---------------- Laboratory (المختبر) ---------------- */
  async listLabResults(petId: string): Promise<LabResult[]> {
    return (loadDB().labResults ?? [])
      .filter((r) => r.pet_id === petId)
      .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  },
  async addLabResult(input: Omit<LabResult, "id" | "created_at" | "clinic_id">): Promise<LabResult> {
    const db = loadDB();
    const now = new Date().toISOString();
    const row: LabResult = { ...input, ...labLifecycleFields(input, now), id: uid("lab"), clinic_id: null, created_at: now };
    (db.labResults ??= []).unshift(row);
    saveDB(db);
    return row;
  },
  /** Advance a lab order to the next lifecycle stage, stamping the moment (and
   *  who, for collect/verify). Earlier stamps are preserved. */
  async advanceLabStatus(id: string, status: LabStatusValue, extra?: { collected_by?: string | null; verified_by?: string | null }): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (!r) return;
    const now = new Date().toISOString();
    r.status = status;
    const col = LAB_STAGE_COL[status];
    if (col && !r[col]) (r as unknown as Record<string, unknown>)[col] = now;
    if (extra?.collected_by !== undefined && status === "collected") r.collected_by = extra.collected_by;
    if (extra?.verified_by !== undefined && status === "verified") r.verified_by = extra.verified_by;
    saveDB(db);
  },
  async setLabPriority(id: string, priority: "routine" | "urgent"): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (r) { r.priority = priority; saveDB(db); }
  },
  async setLabBilled(id: string, billed: boolean): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (r) { r.billed = billed; saveDB(db); }
  },
  /** Clinic-wide lab results — feeds the clinical report (عدد التحاليل بالفترة). */
  async listClinicLabResults(_clinicId?: string, range?: DateRange): Promise<LabResult[]> {
    return within(loadDB().labResults ?? [], "taken_at", range).sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  },
  async deleteLabResult(id: string): Promise<void> {
    const db = loadDB();
    db.labResults = (db.labResults ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /* ---------------- Lab device bridge (الجسر الشبكي للمختبر) ---------------- */
  async createDeviceLink(name: string): Promise<LabDeviceLink> {
    const db = loadDB();
    const token = (uuid() + uuid()).replace(/-/g, ""); // secret credential, 64 hex
    const row: LabDeviceLink = {
      id: uid("dev"), clinic_id: null, name: name.trim() || "جهاز المختبر",
      token, revoked: false, last_seen_at: null, created_at: new Date().toISOString(),
    };
    (db.deviceLinks ??= []).unshift(row);
    saveDB(db);
    return row;
  },
  async listDeviceLinks(): Promise<LabDeviceLink[]> {
    return (loadDB().deviceLinks ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async revokeDeviceLink(id: string): Promise<void> {
    const db = loadDB();
    const r = (db.deviceLinks ??= []).find((x) => x.id === id);
    if (r) { r.revoked = true; saveDB(db); }
  },
  /** New (unhandled) inbox messages for this clinic, newest first. */
  async listDeviceInbox(): Promise<LabDeviceInbox[]> {
    return (loadDB().deviceInbox ?? [])
      .filter((m) => m.status === "new")
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  },
  async markInboxHandled(id: string, status: "accepted" | "dismissed"): Promise<void> {
    const db = loadDB();
    const m = (db.deviceInbox ??= []).find((x) => x.id === id);
    if (m) { m.status = status; m.handled_at = new Date().toISOString(); saveDB(db); }
  },
  /** Deliver a raw device message into the inbox (demo mirror of the cloud RPC).
   *  Used by the in-app «رسالة تجريبية» test and by the local simulator. */
  async ingestDeviceMessage(token: string, raw: string): Promise<string | null> {
    const db = loadDB();
    const link = (db.deviceLinks ?? []).find((x) => x.token === token && !x.revoked);
    if (!link) return null;
    const row: LabDeviceInbox = {
      id: uid("inbox"), clinic_id: link.clinic_id ?? null, link_id: link.id,
      device_name: link.name, raw, status: "new", received_at: new Date().toISOString(), handled_at: null,
    };
    (db.deviceInbox ??= []).unshift(row);
    link.last_seen_at = row.received_at;
    saveDB(db);
    return row.id;
  },

  /* ---------------- Clinic visits (الزيارات) ---------------- */
  async listClinicVisitsForPet(petId: string): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.pet_id === petId)
      .sort((a, b) => (b.opened_at || "").localeCompare(a.opened_at || ""));
  },
  async getClinicVisit(id: string): Promise<ClinicVisit | null> {
    return (loadDB().clinicVisits ?? []).find((v) => v.id === id) ?? null;
  },
  /** Clinic-wide list of still-open visits (across all pets) — powers the charts hub. */
  async listOpenClinicVisits(_clinicId?: string): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.status === "open")
      .sort((a, b) => (b.opened_at || "").localeCompare(a.opened_at || ""));
  },
  /** الحالات المنتهية (مع نتيجتها) — تغذي سكشن الحالات والمنقطعين والتقارير. */
  async listEndedClinicVisits(_clinicId?: string, limit = 300): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.status === "ended")
      .sort((a, b) => (b.ended_at || b.opened_at || "").localeCompare(a.ended_at || a.opened_at || ""))
      .slice(0, limit);
  },
  async addClinicVisit(input: Omit<ClinicVisit, "id" | "created_at">): Promise<ClinicVisit> {
    const db = loadDB();
    const v: ClinicVisit = { created_at: new Date().toISOString(), ...input, id: uid("visit") };
    (db.clinicVisits ??= []).unshift(v);
    saveDB(db);
    return v;
  },
  async updateClinicVisit(id: string, patch: Partial<ClinicVisit>): Promise<void> {
    const db = loadDB();
    const v = (db.clinicVisits ??= []).find((x) => x.id === id);
    if (v) { Object.assign(v, patch); saveDB(db); }
  },

  async listMedia(petId: string): Promise<MediaItem[]> {
    return loadDB()
      .media.filter((m) => m.pet_id === petId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /** Media across a set of pets (clinic-wide) — for the Lab & X-Ray report. */
  async listAllMedia(petIds: string[], range?: DateRange): Promise<MediaItem[]> {
    const ids = new Set(petIds);
    return within((loadDB().media ?? []).filter((m) => ids.has(m.pet_id)), "created_at", range);
  },

  async addMedia(input: Omit<MediaItem, "id" | "created_at">): Promise<MediaItem> {
    const db = loadDB();
    const m: MediaItem = { ...input, id: uid("m"), created_at: new Date().toISOString() };
    db.media.push(m);
    saveDB(db);
    return m;
  },

  /**
   * Upload a prepared (already client-side compressed) file and link it to a pet.
   * Demo mode has no object storage, so the compressed image is kept inline.
   */
  async uploadMedia(petId: string, upload: PreparedUpload, kind: MediaItem["kind"], caption?: string): Promise<MediaItem> {
    return demoRepo.addMedia({ pet_id: petId, kind, url: upload.dataUrl, caption });
  },

  async listAppointmentsForOwner(ownerId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.owner_id === ownerId && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** All non-cancelled appointments for a single pet (used by the pet workspace rail). */
  async listAppointmentsForPet(petId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.pet_id === petId && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** All appointments on a given calendar day (clinic-wide). */
  async listAppointmentsForDay(dayISO: string): Promise<Appointment[]> {
    const day = dayISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => a.scheduled_at.slice(0, 10) === day && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Appointments across a date range in ONE query (used by the dashboard week view). */
  async listAppointmentsInRange(startISO: string, endISO: string): Promise<Appointment[]> {
    const start = startISO.slice(0, 10);
    const end = endISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => { const d = a.scheduled_at.slice(0, 10); return d >= start && d <= end && a.status !== "cancelled"; })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Patients checked in and waiting for / in a given doctor's room. */
  async listWaiting(doctorId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.doctor_id === doctorId && (a.status === "checked_in" || a.status === "in_room"))
      .sort((a, b) => (a.triage_score ?? 9) - (b.triage_score ?? 9));
  },

  async slotTaken(doctorId: string, scheduledAt: string): Promise<boolean> {
    return loadDB().appointments.some(
      (a) => a.doctor_id === doctorId && a.scheduled_at === scheduledAt && a.status !== "cancelled",
    );
  },

  /** EVERY booking of a calendar day — cancelled and no-show included — for the
   *  الحجوزات hub. Day matching uses the LOCAL calendar (Iraq evenings must not
   *  leak into tomorrow via UTC). */
  async listBookingsForDay(dayISO: string): Promise<Appointment[]> {
    const day = dayISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => localISO(new Date(a.scheduled_at)) === day)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Incoming owner bookings awaiting the clinic's decision (طلبات الحجز).
   *  Anything still "requested" from yesterday onwards — the reception inbox. */
  async listBookingRequests(): Promise<Appointment[]> {
    const since = new Date(Date.now() - 86400000).toISOString();
    return loadDB()
      .appointments.filter((a) => a.status === "requested" && a.scheduled_at >= since)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** The clinic's shared sticky note for one calendar day (dashboard widget). */
  async getDailyNote(dateISO: string): Promise<DailyNote | null> {
    return dailyNoteLocalGet(dateISO);
  },

  async saveDailyNote(dateISO: string, content: string, author?: string): Promise<void> {
    dailyNoteLocalSet(dateISO, content, author ?? demoActorName());
  },

  /** Busy times for a set of doctors in a window — feeds the availability badges
   *  and the slot grid. Times only; no patient information. */
  async listDoctorBusySlots(doctorIds: string[], fromISO: string, toISO: string): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    if (doctorIds.length === 0) return out;
    const ids = new Set(doctorIds);
    for (const a of loadDB().appointments) {
      if (!ids.has(a.doctor_id) || a.status === "cancelled") continue;
      if (a.scheduled_at < fromISO || a.scheduled_at > toISO) continue;
      (out[a.doctor_id] ??= []).push(a.scheduled_at);
    }
    return out;
  },

  /** Booking directory: clinics an owner can book at (safe public fields only). */
  async listClinicDirectory(): Promise<ClinicInfo[]> {
    return loadClinics().map((c) => ({ id: c.id, name: c.name, city: c.city ?? null, phone: c.phone ?? null }));
  },

  /** Active bookable team of one clinic (demo shares the single local roster). */
  async listClinicStaffPublic(_clinicId: string): Promise<PublicStaff[]> {
    const list = await listStaff();
    return list
      .filter((s) => s.status === "active")
      .map((s) => ({ id: s.id, name: s.name, role: s.role, specialty: s.specialty || null }));
  },

  async createAppointment(input: Omit<Appointment, "id" | "created_at">): Promise<Appointment> {
    const db = loadDB();
    const apt: Appointment = { ...input, id: uid("apt"), created_at: new Date().toISOString() };
    db.appointments.push(apt);
    saveDB(db);
    return apt;
  },

  async updateAppointment(id: string, patch: Partial<Appointment>): Promise<Appointment | undefined> {
    const db = loadDB();
    const apt = db.appointments.find((a) => a.id === id);
    if (!apt) return undefined;
    Object.assign(apt, patch);
    saveDB(db);
    return apt;
  },

  async setAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
    await this.updateAppointment(id, { status });
  },

  async listTreatments(petId: string): Promise<TreatmentEntry[]> {
    return loadDB()
      .treatments.filter((t) => t.pet_id === petId)
      .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : a.day.localeCompare(b.day)));
  },

  /** Treatments across a set of pets (clinic-wide) — for the Dispensed Medications report. */
  async listAllTreatments(petIds: string[]): Promise<TreatmentEntry[]> {
    const ids = new Set(petIds);
    return (loadDB().treatments ?? []).filter((t) => ids.has(t.pet_id));
  },

  /**
   * Treatments for the whole clinic in ONE query, optionally narrowed to a single
   * day. Prefer this over listAllTreatments(petIds) on clinic-wide screens: the
   * pet-id variant sends every patient id in the URL, which grows without bound
   * as the clinic does. RLS already scopes rows to the clinic.
   */
  async listClinicTreatments(_clinicId?: string, day?: string, range?: DateRange): Promise<TreatmentEntry[]> {
    const all = within(loadDB().treatments ?? [], "day", range);
    return (day ? all.filter((t) => t.day === day) : all.slice())
      .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : b.day.localeCompare(a.day)));
  },

  async addTreatment(input: Omit<TreatmentEntry, "id" | "created_at">): Promise<TreatmentEntry> {
    const db = loadDB();
    const entry: TreatmentEntry = { ...input, id: uid("tx"), created_at: new Date().toISOString() };
    db.treatments.push(entry);
    saveDB(db);
    return entry;
  },

  /** Batch insert for whole treatment plans — ONE write instead of a round-trip
   *  per dose (a 3-drug × 10-day plan used to cost 30 sequential requests). */
  async addTreatments(inputs: Omit<TreatmentEntry, "id" | "created_at">[]): Promise<void> {
    if (inputs.length === 0) return;
    const db = loadDB();
    const at = new Date().toISOString();
    for (const input of inputs) db.treatments.push({ ...input, id: uid("tx"), created_at: at });
    saveDB(db);
  },

  async deleteTreatment(id: string): Promise<void> {
    const db = loadDB();
    db.treatments = db.treatments.filter((t) => t.id !== id);
    saveDB(db);
  },

  /* ---- العمليات الجراحية (سجل الحالة) ---- */
  async listSurgeries(petId: string): Promise<Surgery[]> {
    return (loadDB().surgeries ?? [])
      .filter((x) => x.pet_id === petId)
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  },

  async addSurgery(input: Omit<Surgery, "id" | "created_at">): Promise<Surgery> {
    const db = loadDB();
    const row: Surgery = { ...input, id: uid("srg"), created_at: new Date().toISOString() };
    db.surgeries = [...(db.surgeries ?? []), row];
    saveDB(db);
    return row;
  },

  /** كل عمليات العيادة (لعدّاد الشهر في سجل الطبلات). */
  async listAllSurgeries(): Promise<Surgery[]> {
    return (loadDB().surgeries ?? []).slice().sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  },

  async updateSurgery(id: string, patch: Partial<Surgery>): Promise<void> {
    const db = loadDB();
    db.surgeries = (db.surgeries ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x));
    saveDB(db);
  },

  async deleteSurgery(id: string): Promise<void> {
    const db = loadDB();
    db.surgeries = (db.surgeries ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /** Toggle a scheduled treatment between given/not-given (flowsheet check-off).
   *  `at` overrides the administration time (defaults to now). */
  async setTreatmentGiven(id: string, given: boolean, by?: string, at?: string): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.administered_at = given ? (at || new Date().toISOString()) : null;
    tx.administered_by = given ? by : undefined;
    if (given) tx.missed_reason = null;   // أُنجزت ⇒ ما عاد لها سببُ فوات
    saveDB(db);
  },

  /** تسجيل مهمة **بقيمة**: حرارة، نسبة أكل، حجم سوائل، نتيجة فحص.
   *  الدواء يُنجَز بعلامة، وهذه لا تُنجَز إلا بما قِيس فعلاً — فالقيمة جزءٌ
   *  من الإنجاز لا ملحقٌ به. */
  async setTreatmentResult(id: string, result: string, by?: string, at?: string): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.result = result;
    tx.administered_at = at || new Date().toISOString();
    tx.administered_by = by;
    tx.missed_reason = null;
    saveDB(db);
  },
  /** تعديل أمرٍ قبل إعطائه: الاسم/الكمية/الوقت/التكرار — به يصير «تعديل اليوم
   *  أو كل الأيام الباقية» بلا هدمٍ وإعادة بناء. */
  async updateTreatment(id: string, patch: Partial<Pick<TreatmentEntry, "medication" | "amount" | "time" | "observations" | "route">>): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    Object.assign(tx, patch);
    saveDB(db);
  },

  /** توثيق فوات مهمة بسببها — تبقى غير مُنجَزة، لكنها ما عادت مجهولة. */
  async setTreatmentMissed(id: string, reason: string | null): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.missed_reason = reason;
    saveDB(db);
  },

  async listAdmissions(_clinicId?: string): Promise<Admission[]> {
    return loadDB()
      .admissions.slice()
      .sort((a, b) => admOrderKey(b).localeCompare(admOrderKey(a)));
  },

  async listAdmissionsForPet(petId: string): Promise<Admission[]> {
    return loadDB()
      .admissions.filter((a) => a.pet_id === petId)
      .sort((a, b) => admOrderKey(b).localeCompare(admOrderKey(a)));
  },

  async addAdmission(input: Omit<Admission, "id">): Promise<Admission> {
    const db = loadDB();
    // Stamp the creation time so ordering is exact, then prepend so the local cache
    // mirrors the newest-first fetch — the new case shows at the top instantly.
    const adm: Admission = { created_at: new Date().toISOString(), ...input, id: uid("adm") };
    db.admissions.unshift(adm);
    // Mirror the production trigger: every admission writes an 'admitted' event
    // to the per-animal movement trail (سجل الحركات).
    pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "admitted", to_kind: adm.kind, to_cage: adm.cage ?? null });
    saveDB(db);
    return adm;
  },

  async updateAdmission(id: string, patch: Partial<Admission>): Promise<void> {
    const db = loadDB();
    const adm = db.admissions.find((a) => a.id === id);
    if (adm) {
      const before = { status: adm.status, kind: adm.kind, cage: adm.cage ?? null };
      Object.assign(adm, patch);
      // Mirror the production trigger (migration 0070) exactly — see its rules.
      if (before.status === "active" && adm.status === "discharged") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "discharged", from_kind: adm.kind });
      } else if (before.status === "discharged" && adm.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "admitted", to_kind: adm.kind, to_cage: adm.cage ?? null });
      }
      if (adm.kind !== before.kind && adm.status === "active" && before.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "transferred", from_kind: before.kind, to_kind: adm.kind });
      }
      if ((adm.cage ?? null) !== before.cage && adm.status === "active" && before.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "cage_changed", from_cage: before.cage, to_cage: adm.cage ?? null });
      }
      saveDB(db);
    }
  },

  /** The animal's movement trail — newest first (سجل حركات الحيوان). */
  async listPetMovements(petId: string): Promise<PetMovement[]> {
    return (loadDB().petMovements ?? [])
      .filter((m) => m.pet_id === petId)
      .sort((a, b) => b.at.localeCompare(a.at));
  },

  /** Branches — the clinic's physical locations. Main branch first, then by age. */
  async listBranches(_clinicId?: string): Promise<Branch[]> {
    return (loadDB().branches ?? [])
      .filter((b) => b.is_active !== false)
      .sort((a, b) => Number(!!b.is_main) - Number(!!a.is_main) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  },

  async createBranch(input: Omit<Branch, "id" | "created_at">): Promise<Branch> {
    const db = loadDB();
    const branch: Branch = { ...input, id: uid("br"), created_at: new Date().toISOString() };
    db.branches = [...(db.branches ?? []), branch];
    saveDB(db);
    return branch;
  },

  async updateBranch(id: string, patch: Partial<Omit<Branch, "id" | "clinic_id">>): Promise<void> {
    const db = loadDB();
    const branch = (db.branches ?? []).find((b) => b.id === id);
    if (branch) {
      Object.assign(branch, patch);
      saveDB(db);
    }
  },

  /** Reminders. Pass { ownerId } to scope: null/undefined-in-key → clinic reminders, a value → that owner's. */
  async listReminders(filter?: { ownerId?: string | null }): Promise<Reminder[]> {
    const db = loadDB();
    const all = db.reminders ?? [];
    const list = filter && "ownerId" in filter
      ? all.filter((r) => (filter.ownerId == null ? !r.owner_id : r.owner_id === filter.ownerId))
      : all;
    return list.slice().sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  },

  async addReminder(input: Omit<Reminder, "id" | "created_at">): Promise<Reminder> {
    const db = loadDB();
    if (!db.reminders) db.reminders = [];
    const r: Reminder = { ...input, id: uid("rem"), created_at: new Date().toISOString() };
    db.reminders.push(r);
    saveDB(db);
    return r;
  },

  async updateReminder(id: string, patch: Partial<Reminder>): Promise<void> {
    const db = loadDB();
    const r = (db.reminders ?? []).find((x) => x.id === id);
    if (r) { Object.assign(r, patch); saveDB(db); }
  },

  async removeReminder(id: string): Promise<void> {
    const db = loadDB();
    db.reminders = (db.reminders ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /** علاماتُ التذكير (0208) — مرآةُ reminder_marks بنفس دلالتها. كلُّها بلا حدٍّ بالتاريخ:
   *  اللقاحُ المعلَّق لا يشيخ بالشاشة، فعلامتُه تُقرأ مهما قدُم موعدُه. */
  async listReminderMarks(): Promise<ReminderMark[]> {
    return (loadDB().reminderMarks ?? []).map((m) => ({ ...m }));
  },
  /** «تمّ التذكير»: يعلو «أُرسلت» ويُبقي يومَ إرسالها (sent_at). */
  async markReminderDone(rowKey: string, dueDate: string): Promise<ReminderMark> {
    const db = loadDB();
    if (!db.reminderMarks) db.reminderMarks = [];
    const now = new Date().toISOString();
    let m = db.reminderMarks.find((x) => x.row_key === rowKey && x.due_date === dueDate);
    if (m) { m.state = "done"; m.marked_at = now; }
    else {
      m = { id: uid("rmk"), clinic_id: null, row_key: rowKey, due_date: dueDate, state: "done", sent_at: null, marked_at: now, marked_by: null };
      db.reminderMarks.push(m);
    }
    saveDB(db);
    return { ...m };
  },
  /** «أُرسلت»: يجدّد يومَ الإرسال لإعادةٍ، ولا يُنزل «تمّ» إلى «أُرسلت». */
  async markReminderSent(rowKey: string, dueDate: string): Promise<void> {
    const db = loadDB();
    if (!db.reminderMarks) db.reminderMarks = [];
    const now = new Date().toISOString();
    const m = db.reminderMarks.find((x) => x.row_key === rowKey && x.due_date === dueDate);
    if (m) { if (m.state === "sent") { m.sent_at = now; m.marked_at = now; } }
    else db.reminderMarks.push({ id: uid("rmk"), clinic_id: null, row_key: rowKey, due_date: dueDate, state: "sent", sent_at: now, marked_at: now, marked_by: null });
    saveDB(db);
  },
  /** التراجعُ عن «تمّ»: أُرسلت قبلها ⇒ تعود «أُرسلت»؛ وإلا تُزال العلامة. ولا شيءَ يُتراجَع عنه ⇒ يُرمى.
   *  يُرجع ما بقي (العلامةُ «أُرسلت» أو null) — فالشاشةُ تطبّقه بلا قراءةٍ ثانيةٍ تسابق غيرها. */
  async undoReminderDone(rowKey: string, dueDate: string): Promise<ReminderMark | null> {
    const db = loadDB();
    const list = db.reminderMarks ?? [];
    const m = assertUpdated(list.find((x) => x.row_key === rowKey && x.due_date === dueDate && x.state === "done"));
    if (m.sent_at) { m.state = "sent"; m.marked_at = new Date().toISOString(); }
    else db.reminderMarks = list.filter((x) => x !== m);
    saveDB(db);
    return m.sent_at ? { ...m } : null;
  },

  /* ---------------- Inventory & POS ---------------- */
  /* **مخزنُ العيادة لا يرى مخزنَ الحقل** (0191). الجدولُ واحدٌ والعرضان اثنان:
   * `farm_id` فارغٌ = العيادة، ومملوءٌ = حقلٌ بعينه. وبلا هذا الفصل يظهر
   * أربعون طنَّ علفٍ بشاشة مخزن العيادة وبقيمة مخزونها وبنتائج الكاشير —
   * و«جردٌ بالأرقام الفعلية» يصير مستحيلاً للاثنين معاً. */
  async listProducts(_clinicId?: string): Promise<Product[]> {
    return (loadDB().products ?? []).filter((p) => !p.farm_id).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  /** مخزنُ حقلٍ بعينه — الوجهُ الثاني لنفس الجدول. */
  async listFarmProducts(farmId: string): Promise<Product[]> {
    return (loadDB().products ?? []).filter((p) => p.farm_id === farmId).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  /** هل قاعدة البيانات تدعم عمود مجموعات الدفعات (bulk_group / ترحيل 0075)؟
   *  المخزن المحلي يدعمه دائماً؛ السحابة تُفحص فعلياً لتنبيه العيادة قبل أن
   *  تضيع روابط المجموعات بصمت. */
  async supportsBulkGroup(): Promise<boolean> {
    return true;
  },
  /** صفُّ منتجٍ طازجٌ بمعرّفه — لحكم «رصيده صفر» قبل رفض البيع (خطة الطزاجة، ط٢).
   *  بالمعرّف لا بالرمز: كرتُ المنتج لا يحمل رمزاً ممسوحاً، وبالمخزن منتجاتٌ بلا
   *  باركود أصلاً — ونحن نعرف **أيَّ** منتجٍ نسأل عنه. مخزنُ الحقل خارجُ الكاشير. */
  async getProductById(id: string): Promise<Product | undefined> {
    return (loadDB().products ?? []).find((p) => p.id === id && !p.farm_id);
  },
  /** حوضُ قسمٍ طازج — رصيدُ الكاشير = الصفُّ + حوضُ قسمه (`sellable.ts`)، والخادمُ
   *  يبيع منه. سؤالُ «رصيده صفر» بلا الحوض كان يقول «زيد رصيده» عمّا يُباع. */
  async getSectionPool(sectionId: string): Promise<number> {
    return (loadDB().companySections ?? []).find((s) => s.id === sectionId)?.pooled_stock ?? 0;
  },
  async getProductByBarcode(barcode: string, _clinicId?: string): Promise<Product | undefined> {
    const code = matchCode(barcode);
    if (!code) return undefined;
    // الرمزُ الأساسي أو أيُّ رمزٍ إضافي — ونطبّع المخزون أيضاً، فصفٌّ قديم
    // فيه محرفٌ غير مرئيّ يبقى قابلاً للمسح.
    // ومخزنُ الحقل خارجُ المسح: باركودُ علفٍ يُمسح بكاشير العيادة كان **يبيعه**
    // بسعرٍ لم يُوضع للبيع أصلاً، ويخصم من رصيدِ دفعةٍ جارية.
    const hits = (loadDB().products ?? []).filter(
      (p) => !p.farm_id && (matchCode(p.barcode) === code || (p.alt_codes ?? []).some((c) => matchCode(c) === code)),
    );
    /* مرآةُ ترتيب `product_by_code` (0165) — و`find` على ترتيب المصفوفة كانت
     * تخالفه: تختار حاملَ الرمز **الإضافيّ** حيث يختار الخادمُ صاحبَه الأصيل.
     * والترتيبُ ثلاثيّ: مطابقةٌ خامّةٌ للأساسيّ أوّلاً (رمزٌ مخزونٌ كما وصل)،
     * ثم مطابقةٌ مطبَّعةٌ للأساسيّ، ثم الأقدم. حتميةُ الاختيار ثابتٌ لا تحسين:
     * نفسُ المسحة تبيع نفسَ المنتج مهما تبدّل ترتيبُ التحميل. */
    hits.sort((a, b) =>
      Number(b.barcode === barcode) - Number(a.barcode === barcode)
      || Number(matchCode(b.barcode) === code) - Number(matchCode(a.barcode) === code)
      || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    // وصفّان = رمزٌ ملتبس: يُقال بصوتٍ كما بالسحابة، لا يُبلَع.
    if (hits.length > 1) sayAmbiguousCode(code, hits.length);
    if (hits.length > 0) return hits[0];
    /* خاب الحرفيّ ⇒ صيغُ الماسح — مرآةُ 0172/0173 بالقاعدة.
     * ثلاثةُ قيودٍ تجعلها مرآةً لا شبيهاً:
     *  ١) **الحرفيُّ أوّلاً وحده**: لو خُلطت الصيغُ به لصار رمزٌ يطابق صاحبَه
     *     حرفياً ويطابق آخرَ بصيغةٍ ⇒ «رمزٌ ملتبس» على مسارٍ كان سليماً.
     *  ٢) **صيغةٌ صيغةً بترتيبها**، لا اتحاداً عليها كلِّها. الاتحادُ يرتّب
     *     بالأقدم فيختار صاحبَ صيغةٍ متأخّرة على صاحب صيغةٍ أسبق — فيبيع
     *     منتجاً هنا وآخرَ بشاشة البيع (`rescueScan` تمشي بالترتيب).
     *     مقيسٌ بزوج UPC-A/EAN-13: «045496830434» و«0045496830434».
     *  ٣) **بلا إصلاحِ تخطيطٍ عربيّ**: خريطتُه بياناتُ متصفّح، والقاعدةُ لا
     *     تعرفها. نسختان تفترقان أسوأ من واحدةٍ ناقصة. */
    // ومخزنُ الحقل خارجُها كالحرفيّ — الخادمُ يستثنيه بالصيغ أيضاً (0191). بلا هذا
    // كانت صيغةٌ يحملها صفُّ حقلٍ تُختار قبل صيغةٍ لاحقةٍ يحملها منتجُ العيادة.
    const all = (loadDB().products ?? []).filter((p) => !p.farm_id);
    const holds = (p: Product, v: string) =>
      matchCode(p.barcode) === v || (p.alt_codes ?? []).some((c) => matchCode(c) === v);
    for (const v of scanVariants(code, false)) {
      const hits = all.filter((p) => holds(p, v));
      if (hits.length === 0) continue;
      hits.sort((a, b) =>
        Number(matchCode(b.barcode) === v) - Number(matchCode(a.barcode) === v)
        || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
      // والخادمُ يقف عند صفَّين (`limit 2`) — فالعددُ المُبلَّغ عددُه لا عددُنا.
      if (hits.length > 1) sayAmbiguousCode(code, 2);
      return hits[0];
    }
    return undefined;
  },
  /** يربط رمزاً بمنتجٍ قائم بدل إنشاء منتجٍ جديد — نظير attach_product_code. */
  async attachProductCode(productId: string, code: string): Promise<Product> {
    // المطابقةُ بـmatchCode، والمخزونُ بـnormalizeCode: ما يدخل alt_codes رمزُ
    // عيادةٍ **يُخزَّن**، وتخزينُ النسخة المطويّة يكتب غيرَ ما مسحه صاحبُه —
    // خلطُ التطبيعَين الذي تمنعه القاعدةُ المعلنة بالدفعة ١.
    const c = matchCode(code);
    const store = normalizeCode(code);
    if (!c) throw new Error("empty code");
    const db = loadDB();
    const taken = (db.products ?? []).find(
      (p) => p.id !== productId && (matchCode(p.barcode) === c || (p.alt_codes ?? []).some((x) => matchCode(x) === c)),
    );
    if (taken) throw new Error("code already belongs to another product");
    const p = (db.products ?? []).find((x) => x.id === productId);
    if (!p) throw new Error("product not found");
    if (matchCode(p.barcode) !== c && !(p.alt_codes ?? []).some((x) => matchCode(x) === c)) {
      p.alt_codes = [...(p.alt_codes ?? []), store];
      saveDB(db);
    }
    return p;
  },
  async createProduct(input: Omit<Product, "id" | "created_at">): Promise<Product> {
    const db = loadDB();
    if (!db.products) db.products = [];
    // نفسُ قيدِ الخادم (products_clinic_barcode_idx) وبنفس صيغةِ خطئه، حتى
    // يُترجمه describeDbError هنا كما هناك — وحتى يُفحص الحارس حيث يُفحص كلُّ شيء.
    const code = normalizeCode(input.barcode) || null;
    throwIfCodeTaken(db, code, null);
    const p: Product = { ...input, barcode: code, id: uid("prod"), created_at: new Date().toISOString() };
    db.products.push(p);
    saveDB(db);
    return p;
  },
  /* ── مكتبة صور المنصّة (0175) — تجريبياً: مصفوفة بقاعدة الجهاز والمسار data URL ── */
  async listImageLibrary(): Promise<LibraryImage[]> {
    return [...(loadDB().imageLibrary ?? [])].sort((a, b) => (a.company ?? "").localeCompare(b.company ?? "") || a.name.localeCompare(b.name));
  },
  async createLibraryImage(meta: { name: string; company?: string | null; section?: string | null; barcode?: string | null }, upload: { blob: Blob; dataUrl: string }): Promise<LibraryImage> {
    assertUploadableImage(upload);
    const db = loadDB();
    const row: LibraryImage = {
      id: uid("lib"), name: meta.name.trim(), company: meta.company?.trim() || null,
      section: meta.section?.trim() || null, barcode: normalizeCode(meta.barcode) || null,
      path: upload.dataUrl, updated_at: new Date().toISOString(),
    };
    db.imageLibrary = [...(db.imageLibrary ?? []), row];
    saveDB(db);
    return row;
  },
  async deleteLibraryImage(id: string, _path: string): Promise<void> {
    void _path;
    const db = loadDB();
    db.imageLibrary = (db.imageLibrary ?? []).filter((r) => r.id !== id);
    saveDB(db);
  },
  async imageLibraryUsage(path: string): Promise<number> {
    return (loadDB().products ?? []).filter((p) => p.image_path === path).length;
  },
  /** صورة المنتج (0174) — تجريبياً: لا مخزنَ ملفات، فيرجع data URL المضغوط
   *  ليُحفظ بـ`image_path` كما هو. الشاشات لا تفرّق بينه وبين مسار سحابيّ. */
  async uploadProductImage(_clinicId: string | null, _productId: string, upload: { blob: Blob; dataUrl: string }): Promise<string> {
    void _clinicId; void _productId;
    // نفسُ حارس النوع بالضبط: حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص.
    assertUploadableImage(upload);
    return upload.dataUrl;
  },
  /** حذف ملف الصورة — تجريبياً لا ملفَ أصلاً؛ تصفيرُ المسار شأنُ updateProduct. */
  async deleteProductImage(_clinicId: string | null, _productId: string, _path: string): Promise<void> {
    void _clinicId; void _productId; void _path;
  },
  /* ── حقولُ الدواجن (0191/0192) — تجريبياً ───────────────────────────────
   * يعكس الخادمَ بالقيود التي تهمّ: قاعةٌ واحدةٌ = دفعةٌ نشطةٌ واحدة، ويومٌ لا
   * يُدخَل مرّتين، والصرفُ بسعر الشراء يرجّع النقص. حارسٌ لا يوجد هنا حارسٌ
   * لم يُفحص — فحوصُ المنطق تجري على هذه النسخة. */
  async listPoultryFarms(): Promise<PoultryFarm[]> {
    return pLoad<PoultryFarm>("farms").filter((f) => !f.archived);
  },
  async addPoultryFarm(input: Partial<PoultryFarm> & { name: string }): Promise<PoultryFarm> {
    const row: PoultryFarm = { ...input, id: uid("pfarm"), clinic_id: null, archived: false, created_at: new Date().toISOString() };
    pSave("farms", [row, ...pLoad<PoultryFarm>("farms")]);
    return row;
  },
  async listPoultryHouses(farmId: string): Promise<PoultryHouse[]> {
    return pLoad<PoultryHouse>("houses").filter((h) => h.farm_id === farmId && !h.archived)
      .sort((a, b) => a.label.localeCompare(b.label));
  },
  async addPoultryHouse(input: Partial<PoultryHouse> & { farm_id: string; label: string }): Promise<PoultryHouse> {
    const row: PoultryHouse = { ...input, id: uid("phouse"), clinic_id: null, archived: false, created_at: new Date().toISOString() };
    pSave("houses", [...pLoad<PoultryHouse>("houses"), row]);
    return row;
  },
  async listPoultryCycles(farmId: string): Promise<PoultryCycle[]> {
    return pLoad<PoultryCycle>("cycles").filter((c) => c.farm_id === farmId)
      .sort((a, b) => b.placed_on.localeCompare(a.placed_on));
  },
  async openPoultryCycle(input: Omit<PoultryCycle, "id" | "status" | "created_at">): Promise<PoultryCycle> {
    const all = pLoad<PoultryCycle>("cycles");
    // مرآةُ الفهرس الفريد الجزئيّ بالخادم: دفعتان نشطتان بنفس الجملون تجعلان
    // كلَّ رقمٍ يوميٍّ بعدهما لا يُعرف لأيّهما.
    if (all.some((c) => c.house_id === input.house_id && c.status === "active")) {
      throw new Error("house_has_active_cycle");
    }
    const row: PoultryCycle = { ...input, id: uid("pcycle"), status: "active", created_at: new Date().toISOString() };
    pSave("cycles", [row, ...all]);
    return row;
  },
  async closePoultryCycle(id: string, close: { closed_on: string; sold_count?: number | null; sold_weight_kg?: number | null; sale_total?: number | null }): Promise<PoultryCycle | undefined> {
    const all = pLoad<PoultryCycle>("cycles");
    const c = all.find((x) => x.id === id);
    if (!c) return undefined;
    // مرآةُ القيد: مغلقةٌ بلا تاريخٍ تعني جرداً بلا حصيلة.
    if (!close.closed_on) throw new Error("close_needs_date");
    Object.assign(c, close, { status: "closed" as const });
    pSave("cycles", all);
    return c;
  },
  async listPoultryDaily(cycleId: string): Promise<PoultryDaily[]> {
    return pLoad<PoultryDaily>("daily").filter((d) => d.cycle_id === cycleId)
      .sort((a, b) => b.on_date.localeCompare(a.on_date));
  },
  /** يومٌ واحدٌ لكلّ دفعة: الإعادةُ تُحدّث ولا تضيف (مرآةُ الفهرس الفريد). */
  async savePoultryDaily(input: Omit<PoultryDaily, "id" | "created_at">): Promise<PoultryDaily> {
    const all = pLoad<PoultryDaily>("daily");
    const cur = all.find((d) => d.cycle_id === input.cycle_id && d.on_date === input.on_date);
    if (cur) {
      Object.assign(cur, input, { updated_at: new Date().toISOString() });
      pSave("daily", all);
      return cur;
    }
    const row: PoultryDaily = { ...input, id: uid("pday"), clinic_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    pSave("daily", [row, ...all]);
    return row;
  },
  async listPoultryUse(cycleId: string): Promise<PoultryUse[]> {
    return pLoad<PoultryUse>("use").filter((u) => u.cycle_id === cycleId)
      .sort((a, b) => b.on_date.localeCompare(a.on_date) || b.created_at.localeCompare(a.created_at));
  },
  async poultryConsume(input: { cycle_id: string; kind: PoultryUseKind; product_id?: string | null; name?: string | null; qty: number; unit?: string | null; on_date?: string | null; note?: string | null; withdrawal_days?: number | null; client_ref?: string | null }): Promise<PoultryConsumeResult> {
    const db = loadDB();
    const cyc = pLoad<PoultryCycle>("cycles").find((c) => c.id === input.cycle_id);
    if (!cyc) throw new Error("no_cycle");
    if (cyc.status !== "active") throw new Error("cycle_closed");
    if (!(input.qty > 0)) throw new Error("bad_qty");
    // سطرُ كلفةٍ بلا اسمٍ ولا مادّةٍ لا يُقرأ بجرد — يُرفض بالنصفين لا يُخترع له اسم.
    if (!input.product_id && !(input.name ?? "").trim()) throw new Error("bad_name");
    let cost = 0, stockAfter: number | null = null, shortfall = 0, nm = (input.name ?? "").trim();
    if (input.product_id) {
      const prod = (db.products ?? []).find((p) => p.id === input.product_id);
      if (!prod) throw new Error("no_product");
      // مادّةُ الحقل وحدَها: علبةُ قططٍ على دفعةِ دجاجٍ تفسد كلفةَ الدورة
      // وقيمةَ مخزن العيادة معاً (مرآةُ فحص الخادم).
      if ((prod.farm_id ?? null) !== cyc.farm_id) throw new Error("not_farm_stock");
      cost = prod.purchase_price ?? 0;
      shortfall = Math.max(0, input.qty - (prod.stock ?? 0));
      // الرصيدُ يُترك يسلب عمداً: الدفترُ اليوميُّ هو الحقيقة لا مخزوننا.
      prod.stock = (prod.stock ?? 0) - input.qty;
      stockAfter = prod.stock;
      nm = nm || prod.name;
      saveDB(db);
    }
    // فترةُ السحب لسطر الدواء وحدَه — مرآةُ الخادم: رقمٌ على كيس علفٍ يُهمَل
    // صامتاً لا يُرفض، ولو مرّ لدفع تاريخَ الأمان بلا سبب.
    const wd = input.kind === "med" ? (input.withdrawal_days ?? null) : null;
    if (wd !== null && (!Number.isFinite(wd) || wd < 0 || wd > 120)) throw new Error("bad_withdrawal");
    const onDate = input.on_date ?? new Date().toISOString().slice(0, 10);
    // مرآةُ 0193: مرجعٌ سبق ⇒ نُرجع سطرَه ولا نخصم ثانيةً.
    const ref = (input.client_ref ?? "").trim();
    if (ref) {
      const prior = pLoad<PoultryUse>("use").find((u) => u.client_ref === ref);
      if (prior) return { ok: true, use: prior, stock_after: null, shortfall: 0, replayed: true };
    }
    const row: PoultryUse = {
      id: uid("puse"), clinic_id: null, cycle_id: input.cycle_id, client_ref: ref || null,
      on_date: onDate,
      kind: input.kind, product_id: input.product_id ?? null, name: nm,
      qty: input.qty, unit: input.unit ?? null, unit_cost: cost,
      line_cost: Math.round(cost * input.qty * 100) / 100,
      withdrawal_days: wd,
      note: input.note ?? null, created_at: new Date().toISOString(),
    };
    pSave("use", [row, ...pLoad<PoultryUse>("use")]);
    const safe = wd === null ? null : new Date(new Date(onDate).getTime() + wd * 86400000).toISOString().slice(0, 10);
    return { ok: true, use: row, stock_after: stockAfter, shortfall, safe_from: safe };
  },
  async poultryUnconsume(useId: string): Promise<{ ok: boolean; returned?: number }> {
    const all = pLoad<PoultryUse>("use");
    const u = all.find((x) => x.id === useId);
    if (!u) return { ok: false };
    if (u.product_id) {
      const db = loadDB();
      const prod = (db.products ?? []).find((p) => p.id === u.product_id);
      if (prod) { prod.stock = (prod.stock ?? 0) + u.qty; saveDB(db); }
    }
    pSave("use", all.filter((x) => x.id !== useId));
    return { ok: true, returned: u.qty };
  },
  /** مرآةُ `poultry_cycle_stats` بالخادم — نفسُ المجاميع بنفس التعريفات. */
  async poultryCycleStats(cycleId: string): Promise<PoultryCycleStats | null> {
    const c = pLoad<PoultryCycle>("cycles").find((x) => x.id === cycleId);
    if (!c) return null;
    const days = pLoad<PoultryDaily>("daily").filter((d) => d.cycle_id === cycleId);
    const uses = pLoad<PoultryUse>("use").filter((u) => u.cycle_id === cycleId);
    const meds = uses.filter((u) => u.kind === "med");
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const dead = sum(days.map((d) => d.dead || 0));
    const culled = sum(days.map((d) => d.culled || 0));
    const end = c.closed_on ?? new Date().toISOString().slice(0, 10);
    const ms = new Date(end).getTime() - new Date(c.placed_on).getTime();
    return {
      placed_count: c.placed_count, dead, culled, alive: c.placed_count - dead - culled,
      feed_kg: sum(uses.filter((u) => u.kind === "feed").map((u) => u.qty)),
      feed_cost: sum(uses.filter((u) => u.kind === "feed").map((u) => u.line_cost)),
      med_cost: sum(uses.filter((u) => u.kind === "med").map((u) => u.line_cost)),
      other_cost: sum(uses.filter((u) => u.kind !== "feed" && u.kind !== "med").map((u) => u.line_cost)),
      chick_cost: Math.round((c.chick_unit_cost ?? 0) * c.placed_count * 100) / 100,
      days: Math.max(0, Math.round(ms / 86400000)),
      last_entry: days.length ? days.map((d) => d.on_date).sort().slice(-1)[0] : null,
      // مرآةُ القاعدة: **أبعدُ** تاريخٍ لا آخرُ سطر، وسطرٌ واحدٌ بلا رقمٍ يرفع
      // رايةَ المجهول — والقطيعُ يأمن حين تأمن آخرُ مادّةٍ دخلته.
      safe_from: meds.reduce<string | null>((best, u) => {
        if (u.withdrawal_days == null) return best;
        const d = new Date(new Date(u.on_date).getTime() + u.withdrawal_days * 86400000).toISOString().slice(0, 10);
        return best && best >= d ? best : d;
      }, null),
      withdrawal_unknown: meds.some((u) => u.withdrawal_days == null),
    };
  },

  /** شعار العيادة (0190) — تجريبياً كصورة المنتج: لا مخزنَ ملفات فيرجع
   *  data URL، و`getClinicLogo` تمرّره كما هو. */
  async uploadClinicLogo(_clinicId: string | null, upload: { blob: Blob; dataUrl: string }): Promise<string> {
    void _clinicId;
    assertUploadableImage(upload);
    return upload.dataUrl;
  },
  async deleteClinicLogo(_clinicId: string | null, _path: string): Promise<void> {
    void _clinicId; void _path;
  },
  async updateProduct(id: string, patch: Partial<Product>): Promise<Product | undefined> {
    const db = loadDB();
    const p = (db.products ?? []).find((x) => x.id === id);
    if (!p) return undefined;
    // الخادمُ يطبّع الباركود عند الحفظ ويحرسه بالمحفّز (0167)؛ وهنا كان بلا
    // أيّهما — فكان الفحصُ يمرّ على سلوكٍ لا وجودَ له بالإنتاج.
    if ("barcode" in patch) {
      const next = normalizeCode(patch.barcode) || null;
      throwIfCodeTaken(db, next, id);
      patch = { ...patch, barcode: next };
    }
    Object.assign(p, patch);
    saveDB(db);
    return p;
  },
  async deleteProduct(id: string, reason?: string | null): Promise<void> {
    const db = loadDB();
    const p = (db.products ?? []).find((x) => x.id === id);
    if (!p) throw new Error("product not found");
    trashProduct(db, p, { reason });
    // السطور تفقد صنفها كما بالخادم (set null) — والاسترجاع يعيده.
    for (const i of db.invoiceItems ?? []) if (i.product_id === id) i.product_id = null;
    for (const i of db.purchaseItems ?? []) if (i.product_id === id) i.product_id = null;
    db.products = (db.products ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },
  async listDeletedProducts(): Promise<DeletedProduct[]> {
    return (loadDB().productsTrash ?? []).slice().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  },
  /** كم فاتورةً بيع فيها هذا المنتج — تُعرض قبل تأكيد الحذف لا بعده. */
  async productSaleLines(id: string): Promise<number> {
    return (loadDB().invoiceItems ?? []).filter((i) => i.product_id === id && i.qty > 0).length;
  },
  async restoreProduct(id: string): Promise<Product> {
    const db = loadDB();
    const t = (db.productsTrash ?? []).find((x) => x.id === id);
    if (!t) throw new Error("not in trash");
    if ((db.products ?? []).some((x) => x.id === id)) throw new Error("product already exists");
    const row = { ...t.row };
    // فكُّ الدمج (0146): الأصل يردّ الرصيدَ ورمزَ النسخة من رموزه الإضافية.
    const keep = t.merged_into ? (db.products ?? []).find((x) => x.id === t.merged_into) : undefined;
    if (keep) {
      keep.stock = Math.max(0, (keep.stock || 0) - (t.stock || 0));
      const drop = new Set([row.barcode, ...(row.alt_codes ?? [])].filter(Boolean));
      keep.alt_codes = (keep.alt_codes ?? []).filter((c) => !drop.has(c));
      /* مرآةُ فكّ التوريث (0167): إن كان الأصلُ بلا باركودٍ لحظةَ الطيّ
       * (`keep_barcode` فارغ) وباركودُه الحاليُّ هو باركودُ المطويّ، فقد **ورثه**
       * لا ملكه — فيُردّ لصاحبه. وبلا هذا كان `takenBy` يجد الرمزَ عند الأصل
       * فيرجع المنتجُ بلا باركوده هنا، بينما السحابةُ تردّه — مرآةٌ تقول غيرَ
       * ما يقوله الخادم بمسارِ استرجاعٍ هو آخرُ خطِّ دفاعٍ عن صفٍّ مطويّ. */
      if (t.keep_barcode == null && row.barcode && keep.barcode === row.barcode) keep.barcode = null;
    }
    /* مرآةُ 0165 و0167 — والانحرافُ هنا كان يصنع بالضبط ما تمنعه القاعدة:
     *  ١) الرموزُ الإضافية التي **صارت لغيره** أثناء غيابه لا تُعاد. الصفُّ
     *     المحفوظ بالسلّة صورةٌ من يومها، وقد يكون رمزٌ منها انتقل لمنتجٍ آخر
     *     (بدمجٍ أو بإدخالٍ جديد) — فإعادتُه حرفياً **سرقةُ رمز**، ويصير رمزٌ
     *     واحدٌ على منتجَين.
     *  ٢) والمقارنةُ مطبَّعةٌ على الطرفين وتقرأ رموزَ الغير الإضافية كذلك، لا
     *     `x.barcode === row.barcode` الخامّة: رمزٌ يفرق بعلامةِ اتجاهٍ خفية أو
     *     بحالة حرفٍ كان يمرّ من هنا ويرفضه محفّزُ 0167 بالسحابة. */
    const takenBy = (code: string | null | undefined): boolean => {
      const c = matchCode(code);
      if (!c) return false;
      return (db.products ?? []).some((o) =>
        o.id !== id && (matchCode(o.barcode) === c || (o.alt_codes ?? []).some((x) => matchCode(x) === c)));
    };
    const droppedAlts = (row.alt_codes ?? []).filter((c) => takenBy(c));
    if (droppedAlts.length) row.alt_codes = (row.alt_codes ?? []).filter((c) => !takenBy(c));
    const droppedBarcode = !!row.barcode && takenBy(row.barcode);
    if (droppedBarcode) row.barcode = null;
    if (!db.products) db.products = [];
    db.products.push(row);
    // السطور التي كانت له ترجع إليه بمعرّفاتها كما بالخادم (بلا صنف، أو على الأصل المدموج فيه).
    const inv = new Set(t.invoice_item_ids ?? []), pur = new Set(t.purchase_item_ids ?? []);
    const from = (pid: string | null | undefined) => pid == null || (!!t.merged_into && pid === t.merged_into);
    for (const i of db.invoiceItems ?? []) if (from(i.product_id) && inv.has(i.id)) i.product_id = id;
    for (const i of db.purchaseItems ?? []) if (from(i.product_id) && pur.has(i.id)) i.product_id = id;
    db.productsTrash = (db.productsTrash ?? []).filter((x) => x.id !== id);
    saveDB(db);
    return row;
  },
  /** دمجُ توأمين (0144): الرصيد يُجمع، ورمزُ النسخة يصير إضافياً، والفواتير تعود للأصل. */
  async mergeProducts(keepId: string, dropId: string): Promise<Product> {
    if (keepId === dropId) throw new Error("cannot merge a product into itself");
    const db = loadDB();
    const keep = (db.products ?? []).find((x) => x.id === keepId);
    const drop = (db.products ?? []).find((x) => x.id === dropId);
    if (!keep) throw new Error("product to keep not found");
    if (!drop) throw new Error("product to drop not found");
    if (keep.pooled || drop.pooled) throw new Error("pooled products cannot be merged");
    // الصورةُ قبل الطيّ (0146): الاسترجاع يفكّ الدمج.
    // باركودُ الأصل **قبل** ضمّ الرموز (0167): به يميّز الفكُّ ملكَه الأصيل من الموروث.
    trashProduct(db, drop, { merged_into: keepId, keep_barcode: keep.barcode?.trim() ? keep.barcode : null });
    const codes = new Set(keep.alt_codes ?? []);
    if (drop.barcode && drop.barcode !== keep.barcode) codes.add(drop.barcode);
    for (const c of drop.alt_codes ?? []) if (c && c !== keep.barcode) codes.add(c);
    // التاريخ يعود للأصل قبل الحذف — وإلا فقدت التقارير صنفَها.
    for (const it of db.invoiceItems ?? []) if (it.product_id === dropId) it.product_id = keepId;
    for (const it of db.purchaseItems ?? []) if (it.product_id === dropId) it.product_id = keepId;
    for (const g of db.generatedBarcodes ?? []) if (g.product_id === dropId) g.product_id = keepId;
    keep.stock = (keep.stock || 0) + (drop.stock || 0);
    keep.alt_codes = Array.from(codes);
    keep.min_stock = Math.max(keep.min_stock ?? 0, drop.min_stock ?? 0) || keep.min_stock;
    if (!keep.expiry_date || (drop.expiry_date && drop.expiry_date > keep.expiry_date)) keep.expiry_date = drop.expiry_date ?? keep.expiry_date;
    db.products = (db.products ?? []).filter((x) => x.id !== dropId);
    saveDB(db);
    return keep;
  },

  /**
   * مرآةُ `verify_barcode_health()` (0168) — الأنواعُ الخمسة بنفس التعريف.
   * وتُكتب هنا لا لأن العيادةَ التجريبية تحتاجها، بل لأن فحوصَ المنطق تجري على
   * هذه النسخة: منطقٌ لا وجودَ له هنا منطقٌ لم يُفحص (CLAUDE.md §٤).
   */
  async barcodeHealth(): Promise<BarcodeHealthRow[]> {
    const products = loadDB().products ?? [];
    const out: BarcodeHealthRow[] = [];
    const row = (kind: BarcodeAilment, p: Product, code: string): void => {
      out.push({ kind, product_id: p.id, product_name: p.name, code });
    };
    const codes: { p: Product; raw: string; norm: string; primary: boolean }[] = [];
    for (const p of products) {
      if ((p.barcode ?? "").trim()) codes.push({ p, raw: p.barcode as string, norm: invNormCode(p.barcode), primary: true });
      for (const a of p.alt_codes ?? []) if ((a ?? "").trim()) codes.push({ p, raw: a, norm: invNormCode(a), primary: false });
    }
    // نفسُ قسمة 0168: عددُ حاملي الرمز، وعددُ من يحمله **أساسياً**.
    // ≠١ أساسيّاً ⇒ توأمٌ بلا صاحب، و=١ ⇒ استعارةٌ محسومة (المستعيرُ وحده يُعرض).
    const all = new Map<string, Set<string>>();
    const prim = new Map<string, Set<string>>();
    const note = (m: Map<string, Set<string>>, k: string, id: string): void => {
      const s = m.get(k) ?? new Set<string>();
      s.add(id);
      m.set(k, s);
    };
    for (const c of codes) {
      if (!c.norm) continue;
      note(all, c.norm, c.p.id);
      if (c.primary) note(prim, c.norm, c.p.id);
    }
    for (const c of codes) {
      if (!c.norm) continue;
      const nAll = all.get(c.norm)?.size ?? 0;
      const nPrim = prim.get(c.norm)?.size ?? 0;
      if (nAll <= 1) continue;
      if (nPrim !== 1) { row("twin", c.p, c.raw); continue; }
      if (!c.primary && !prim.get(c.norm)?.has(c.p.id)) row("alt_owned", c.p, c.raw);
    }
    for (const p of products) {
      const raw = p.barcode ?? "";
      if (!raw) continue;
      if (/[ء-ي]/.test(raw)) row("arabic", p, raw);
      if (/^\d+(\.\d+)?[Ee][+-]?\d+$/.test(raw) || /^\d{6,}\.0+$/.test(raw)) row("excel", p, raw);
      if (!invNormCode(raw)) row("empty", p, raw);
    }
    return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.product_name.localeCompare(b.product_name));
  },

  /* ---- سجل الباركودات المولدة (مولد الباركود الداخلي) ---- */
  async listGeneratedBarcodes(): Promise<GeneratedBarcode[]> {
    return (loadDB().generatedBarcodes ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  /** تسمية/إعادة تسمية باركود مولد — الاسم يظهر بالسجل وعلى الملصق المطبوع. */
  async updateGeneratedBarcode(id: string, patch: Partial<Pick<GeneratedBarcode, "label" | "product_id">>): Promise<void> {
    const db = loadDB();
    const row = (db.generatedBarcodes ?? []).find((g) => g.id === id);
    if (row) { Object.assign(row, patch); saveDB(db); }
  },

  /** حفظ دفعة أكواد مولدة — إدراج واحد للدفعة كلها. */
  async addGeneratedBarcodes(rows: Omit<GeneratedBarcode, "id" | "created_at">[]): Promise<GeneratedBarcode[]> {
    const db = loadDB();
    const now = new Date().toISOString();
    const existing = new Set((db.generatedBarcodes ?? []).map((g) => g.barcode));
    const fresh = rows
      .filter((r) => !existing.has(r.barcode)) // مرآة قيد unique بالسحابة
      .map((r) => ({ ...r, id: uid("gbc"), created_at: now }));
    (db.generatedBarcodes ??= []).unshift(...fresh);
    saveDB(db);
    return fresh;
  },

  /* ---------------- المتجر الإلكتروني (0095) ----------------
   * جهة العيادة: هوية المتجر + صندوق الطلبات وقراراته.
   * الواجهة العامة: ثلاث دوال يستعملها الزائر بلا حساب — مرايا حرفية
   * لدوال RPC السحابية (نفس التحققات، نفس أكواد الأخطاء) حتى الوضع
   * التجريبي يتصرف مثل الإنتاج واحد لواحد. */
  async getStoreProfile(): Promise<StoreProfile | null> {
    return loadDB().storeProfile ?? null;
  },
  async saveStoreProfile(p: Omit<StoreProfile, "updated_at">): Promise<StoreProfile> {
    if (!isValidSlug(p.slug)) throw new Error("slug_invalid");
    const db = loadDB();
    const prof: StoreProfile = { ...(db.storeProfile ?? {}), ...p, updated_at: new Date().toISOString() };
    db.storeProfile = prof;
    saveDB(db);
    return prof;
  },
  /** هل الرابط متاح؟ (بالتجريبي عيادة واحدة — يكفي أن تكون الصيغة سليمة.) */
  async checkStoreSlug(slug: string): Promise<boolean> {
    return isValidSlug(normalizeSlug(slug));
  },
  async listStoreOrders(limit = 300): Promise<StoreOrder[]> {
    return (loadDB().storeOrders ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },
  /** مرآةُ `store_suggest_products` (0187) — بنفس التعريفات الثلاثة. */
  async suggestStoreProducts(limit = 40, days = 90): Promise<SuggestedProduct[]> {
    const db = loadDB();
    const cut = Date.now() - Math.max(1, Math.min(365, days)) * 86400000;
    // تعريفُ البيع: الفاتورةُ المرتجَعةُ تُستثنى، والتاريخُ تاريخُها،
    // والكميّاتُ بإشارتها — نسخةٌ من الخادم لا اجتهادٌ ثانٍ.
    const okInv = new Set((db.invoices ?? [])
      .filter((v) => (v.status ?? "paid") !== "refunded" && new Date(v.created_at).getTime() >= cut)
      .map((v) => v.id));
    const agg = new Map<string, { qty: number; rev: number }>();
    for (const it of db.invoiceItems ?? []) {
      if (!it.product_id || !okInv.has(it.invoice_id)) continue;
      const a = agg.get(it.product_id) ?? { qty: 0, rev: 0 };
      a.qty += it.qty; a.rev += it.line_total;
      agg.set(it.product_id, a);
    }
    const pooled = new Map((db.companySections ?? []).map((c) => [c.id, c.pooled_stock ?? 0]));
    const out: SuggestedProduct[] = [];
    for (const p of db.products ?? []) {
      const a = agg.get(p.id);
      if (!a || a.rev <= 0) continue;
      if ((p.sell_price ?? 0) <= 0 || p.store_visible) continue;
      // تعريفُ التوفّر: نسخةٌ من `store_catalog` — المجمَّعُ يُحسب.
      const available = (p.stock ?? 0) > 0 || (p.section_id ? (pooled.get(p.section_id) ?? 0) > 0 : false);
      if (!available) continue;
      out.push({
        id: p.id, name: p.name, category: p.category ?? null, sell_price: p.sell_price,
        available, barcode: p.barcode ?? null, image_path: p.image_path ?? null,
        qty_sold: a.qty, revenue: Math.round(a.rev * 100) / 100,
      });
    }
    out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return out.slice(0, Math.max(1, Math.min(200, limit)));
  },
  /** مرآةُ `store_set_visible` (0186) — بنفس شرطِ السعر وبنفس معنى `changed`. */
  async setStoreVisible(ids: string[], on: boolean): Promise<{ changed: number; skipped_no_price: number }> {
    if (!ids.length) return { changed: 0, skipped_no_price: 0 };
    if (ids.length > 500) throw new Error("too_many");
    const db = loadDB();
    const want = new Set(ids);
    let changed = 0, skipped = 0;
    for (const p of db.products ?? []) {
      if (!want.has(p.id)) continue;
      if (on) {
        if ((p.sell_price ?? 0) <= 0) { if (!p.store_visible) skipped++; continue; }
        if (!p.store_visible) { p.store_visible = true; changed++; }
      } else if (p.store_visible) { p.store_visible = false; changed++; }
    }
    saveDB(db);
    return { changed, skipped_no_price: skipped };
  },
  /** مرآةُ `listNewStoreOrders` — بلا سقفٍ كذلك. */
  async listNewStoreOrders(): Promise<StoreOrder[]> {
    return (loadDB().storeOrders ?? [])
      .filter((o) => o.status === "new")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  /** عدُّ الطلبات الجديدة وحدَه — يُنادى كلَّ نصف دقيقةٍ من جرس التنبيه، فلا
   *  يجرّ صفوفَ الطلبات ببنودها (`items` jsonb) ليعدّها. */
  async countNewStoreOrders(): Promise<number> {
    return (loadDB().storeOrders ?? []).filter((o) => o.status === "new").length;
  },
  async updateStoreOrder(id: string, patch: Partial<Pick<StoreOrder, "status" | "invoice_id" | "decided_at">>): Promise<void> {
    const db = loadDB();
    const o = (db.storeOrders ?? []).find((x) => x.id === id);
    if (!o) return;
    // مرآةُ محفّز 0176 حرفياً: القرارُ يمشي من «جديد» حصراً إلى قرارٍ نهائي،
    // والختمُ من هنا لا من المستدعي. حارسٌ لا يوجد بالتجريبي حارسٌ لم يُفحص —
    // قبولٌ مكرّر عبَر التجريبيَّ بصمتٍ بينما الإنتاج يرميه (فحص التطابق ٠٩/٠٩).
    if (patch.status !== undefined && patch.status !== o.status) {
      if (o.status !== "new" || !["accepted", "rejected", "cancelled"].includes(patch.status)) {
        throw decisionLocked(o.status);
      }
      patch = { ...patch, decided_at: new Date().toISOString() };
    }
    Object.assign(o, patch); saveDB(db);
  },
  /** مرآةُ `store_accept_order` (0183): الفاتورةُ والتوصيلُ والختمُ معاً أو لا
   *  شيء. حارسٌ ليس بالمرآة حارسٌ لم يُفحص — وفحوصُ المنطق تجري هنا. */
  async acceptStoreOrder(id: string, courierId?: string | null, fee?: number | null): Promise<{ ok: true; already: boolean; invoice_id: string }> {
    const db = loadDB();
    const o = (db.storeOrders ?? []).find((x) => x.id === id);
    if (!o) throw new Error(i18next.t("pos.storeOrderNotFound", "ما لكينا هذا الطلب."));
    if (o.status === "accepted") return { ok: true, already: true, invoice_id: o.invoice_id as string };
    if (o.status !== "new") throw decisionLocked(o.status);
    const prods = db.products ?? [];
    /* 0212: طلبٌ انتهت مادّتُه بعد وقوعه لا يُقبل — بالاسم، ولا يخرج شيءٌ من الرفّ. */
    const expired = (o.items ?? []).find((it) => {
      const p = prods.find((x) => x.id === it.product_id);
      return !!p && isExpiredOn(p.expiry_date);
    });
    if (expired) {
      throw Object.assign(new Error("store_item_expired"), {
        code: "P0001", item: expired.name,
        hint: i18next.t("pos.storeItemExpired", { name: expired.name, defaultValue: "بالطلب مادة منتهية الصلاحية: {{name}} — ما نطلعها من المتجر. ارفض الطلب أو اتصل بالزبون." }),
      });
    }
    const items: CheckoutItem[] = (o.items ?? []).map((it) => {
      const p = prods.find((x) => x.id === it.product_id);
      return {
        product_id: p ? it.product_id : null, name: it.name, barcode: p?.barcode ?? null,
        qty: it.qty, unit_price: it.price, unit_cost: p?.purchase_price ?? 0,
        stock_qty: p ? it.qty : 0, unit_label: null,
      };
    });
    // الأجرةُ تُحسم عند القبول (0189): الوسيطُ يغلب ولو كان صفراً، وإلّا
    // فأجرةُ الطلب كما وقعت. **مرآةٌ حرفية** — حارسٌ ليس بالمرآة لم يُفحص.
    const vFee = Math.max(0, Math.round((fee ?? o.delivery_fee ?? 0) * 100) / 100);
    if (vFee > 0) {
      items.push({ product_id: null, name: i18next.t("retail.deliveryFeeLine", "أجرة توصيل"), barcode: null, qty: 1,
                   unit_price: vFee, unit_cost: 0, stock_qty: 0, unit_label: null });
    }
    const invoice = await demoRepo.retailCheckout(items, {
      // المجموعُ يتبع الأجرةَ المحسومة لا `o.total` المحسوبَ بأجرةِ لحظةِ الطلب.
      customer_name: o.customer_name, customer_phone: o.customer_phone,
      final_total: Math.round((o.subtotal + vFee) * 100) / 100,
      amount_paid: 0,
      notes: i18next.t("pos.storeOrderNote", { no: o.order_no, defaultValue: "طلب متجر {{no}}" })
        + (o.note ? ` — ${o.note}` : ""),
      client_ref: `store-${o.id}`,
    } as SaleMeta);
    await demoRepo.createDeliveryOrder({
      clinic_id: o.clinic_id ?? null, invoice_id: invoice.id, branch_id: null,
      courier_id: courierId ?? null, customer_name: o.customer_name, customer_phone: o.customer_phone,
      zone: null, address: o.address ?? null, note: o.note ?? null,
      delivery_fee: vFee, fee_to_clinic: vFee > 0,
      cod_amount: Math.max(0, invoice.total - (invoice.amount_paid ?? 0)), prepaid: invoice.amount_paid ?? 0,
      status: courierId ? "out" : "preparing",
      dispatched_at: courierId ? new Date().toISOString() : null, delivered_at: null, returned_at: null,
    });
    await demoRepo.updateStoreOrder(o.id, { status: "accepted", invoice_id: invoice.id });
    return { ok: true, already: false, invoice_id: invoice.id };
  },
  /** مرآةُ `store_reject_stale`: رفضٌ جماعيٌّ للمعلَّق القديم — بديلُ «سياسة
   *  DELETE» التي تخالف قانونَ البيت (الحذفُ طيٌّ لا محو). */
  async rejectStaleStoreOrders(olderThanHours = 24): Promise<number> {
    const db = loadDB();
    const cut = Date.now() - Math.max(olderThanHours, 1) * 3600_000;
    let n = 0;
    for (const o of db.storeOrders ?? []) {
      if (o.status === "new" && new Date(o.created_at).getTime() < cut) {
        o.status = "rejected"; o.decided_at = new Date().toISOString(); n++;
      }
    }
    if (n) saveDB(db);
    return n;
  },

  /* ---- رحلة الحيوان بالعيادة (متتبّع المالك) ---- */
  async getActiveJourney(petId: string): Promise<Journey | null> {
    return (loadDB().journeys ?? []).find((j) => j.pet_id === petId && j.status === "active") ?? null;
  },
  async listJourneyEvents(journeyId: string): Promise<JourneyEvent[]> {
    return (loadDB().journeyEvents ?? [])
      .filter((e) => e.journey_id === journeyId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async createJourney(petId: string, kind: JourneyKind, createdByName?: string | null): Promise<Journey> {
    const db = loadDB();
    // رحلة نشطة واحدة لكل حيوان — الموجودة تُعاد بدل إنشاء ثانية بالغلط.
    const existing = (db.journeys ?? []).find((j) => j.pet_id === petId && j.status === "active");
    if (existing) return existing;
    const now = new Date().toISOString();
    const j: Journey = {
      id: uid("jr"), clinic_id: null, pet_id: petId, kind,
      stage: "arrived", status: "active", token: journeyToken(),
      started_at: now, closed_at: null, last_seen_at: null, silent: false,
    };
    (db.journeys ??= []).unshift(j);
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: j.id, clinic_id: null, kind: "stage",
      stage: "arrived", created_by_name: createdByName ?? demoActorName(), created_at: now,
    });
    saveDB(db);
    return j;
  },
  async advanceJourney(journeyId: string, stage: JourneyStage, createdByName?: string | null): Promise<void> {
    const db = loadDB();
    const j = (db.journeys ?? []).find((x) => x.id === journeyId);
    if (!j || j.status !== "active") return;
    j.stage = stage;
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: journeyId, clinic_id: null, kind: "stage",
      stage, created_by_name: createdByName ?? demoActorName(), created_at: new Date().toISOString(),
    });
    saveDB(db);
  },
  async addJourneyNote(journeyId: string, input: { body?: string; photo?: string }, createdByName?: string | null): Promise<void> {
    const db = loadDB();
    if (!(db.journeys ?? []).some((x) => x.id === journeyId && x.status === "active")) return;
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: journeyId, clinic_id: null,
      kind: input.photo ? "photo" : "message",
      body: input.body?.slice(0, 500) || null, photo: input.photo ?? null,
      created_by_name: createdByName ?? demoActorName(), created_at: new Date().toISOString(),
    });
    saveDB(db);
  },
  /**
   * إغلاق الرحلة. `silent` هو صمّام الأخبار الصعبة: الرابط يموت فوراً وما
   * ينضاف أي حدث — لأن الوفاة والتدهور طريقهما الهاتف حصراً، لا الإشعارات.
   */
  async closeJourney(journeyId: string, opts?: { silent?: boolean }): Promise<void> {
    const db = loadDB();
    const j = (db.journeys ?? []).find((x) => x.id === journeyId);
    if (!j) return;
    j.status = "closed";
    j.closed_at = new Date().toISOString();
    if (opts?.silent) j.silent = true;
    saveDB(db);
  },
  /** الصفحة العامة — مرآة track_journey: نفس القصّ، ولا معلومة طبية. */
  async trackJourneyPublic(token: string): Promise<JourneyPublicView | null> {
    const db = loadDB();
    const t = token.trim().toUpperCase();
    const j = (db.journeys ?? []).find((x) => x.token === t);
    if (!j || j.silent) return null;
    if (j.status === "closed" && j.closed_at && Date.now() - new Date(j.closed_at).getTime() > 48 * 3600_000) return null;
    j.last_seen_at = new Date().toISOString();
    saveDB(db);
    const pet = db.pets.find((p) => p.id === j.pet_id);
    return {
      pet_name: pet?.name ?? "حبيبك",
      clinic_name: getClinicName() || "العيادة",
      clinic_phone: null,
      kind: j.kind, stage: j.stage, status: j.status, started_at: j.started_at,
      events: (db.journeyEvents ?? [])
        .filter((e) => e.journey_id === j.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ id: e.id, kind: e.kind, stage: e.stage, body: e.body, photo: e.photo, reaction: e.reaction, created_at: e.created_at })),
    };
  },
  async reactJourneyPublic(token: string, eventId: string, emoji: string): Promise<boolean> {
    if (!(OWNER_REACTIONS as readonly string[]).includes(emoji)) return false;
    const db = loadDB();
    const t = token.trim().toUpperCase();
    const j = (db.journeys ?? []).find((x) => x.token === t && !x.silent);
    if (!j) return false;
    const e = (db.journeyEvents ?? []).find((x) => x.id === eventId && x.journey_id === j.id && x.kind !== "stage");
    if (!e) return false;
    e.reaction = emoji;
    saveDB(db);
    return true;
  },

  /* ---- الواجهة العامة (الزائر) ---- */
  async storeFrontPublic(slug: string): Promise<StoreFrontInfo | null> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || !matchSlug(sp.slug, slug)) return null;
    const socials = getClinicSocials();
    return {
      name: getClinicName() || "عيادة بيطرية",
      logo_url: getClinicLogo(),
      phone: sp.whatsapp ?? null,
      whatsapp: sp.whatsapp ?? null,
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      bio: sp.bio ?? null,
      delivery_fee: sp.delivery_fee,
      min_order: sp.min_order,
    };
  },
  async storeCatalogPublic(slug: string, limit = 60, offset = 0): Promise<StoreCatalogItem[]> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || !matchSlug(sp.slug, slug)) return [];
    const poolOf = (p: Product) => (db.companySections ?? []).find((s) => s.id === p.section_id)?.pooled_stock ?? 0;
    const cap = Math.min(Math.max(limit, 1), 100); // نفس سقف السيرفر
    return (db.products ?? [])
      // 0212: المنتهي لا يُعرض (آخرُ يومٍ صالح يُعرض) — نفسُ قاعدة expiry.ts.
      .filter((p) => p.store_visible && !isExpiredOn(p.expiry_date))
      /* مرآةُ فرزِ 0182 حرفياً: المختارُ أوّلاً، ثم الفئةُ فالاسم، و`id` آخرَ
       * المفاتيح كي يصير الترتيبُ حاسماً — فصفحتا `offset` لا تتقاطعان ولا
       * تُسقطان صفّاً. والتوفّرُ خارجَ الفرز عمداً كما بالخادم. */
      .sort((a, b) =>
        Number(b.store_featured ?? false) - Number(a.store_featured ?? false)
        || (a.category ?? "z").localeCompare(b.category ?? "z")
        || a.name.localeCompare(b.name)
        || a.id.localeCompare(b.id))
      .slice(Math.max(offset, 0), Math.max(offset, 0) + cap)
      .map((p) => ({
        id: p.id, name: p.name, category: p.category ?? null, subcategory: p.subcategory ?? null,
        price: p.sell_price, descr: p.store_desc ?? null,
        available: p.stock > 0 || poolOf(p) > 0,
        image_path: p.image_path ?? null,
        featured: !!p.store_featured,
      }));
  },
  /** تتبّع الزبون (0176): الرقم والهاتف معاً — الرقم وحده قصيرٌ فيُعَدّ تخميناً. */
  async trackStoreOrder(slug: string, orderNo: string, phone: string): Promise<StoreTrackInfo | null> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp || !matchSlug(sp.slug, slug)) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || orderNo.trim().length < 4) return null;
    // آخر عشر خانات كما بالخادم حرفياً (0176): 0770… و+964770… نفس الذيل —
    // تطبيعُ طرفٍ واحد أسوأ من لا تطبيع (قاعدة المشروع).
    const o = (db.storeOrders ?? []).find((x) =>
      x.order_no.trim().toUpperCase() === orderNo.trim().toUpperCase()
      && (x.customer_phone ?? "").replace(/\D/g, "").slice(-10) === digits.slice(-10));
    return o ? { order_no: o.order_no, status: o.status, total: o.total, created_at: o.created_at, decided_at: o.decided_at ?? null } : null;
  },
  async placeStoreOrder(
    slug: string,
    info: { name: string; phone: string; address?: string; note?: string },
    items: { product_id: string; qty: number }[],
  ): Promise<{ ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number }> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || !matchSlug(sp.slug, slug)) return { ok: false, error: "closed" };
    const name = (info.name ?? "").trim();
    if (name.length < 2 || name.length > 80) return { ok: false, error: "bad_name" };
    const digits = (info.phone ?? "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: "bad_phone" };
    if ((info.address ?? "").length > 300 || (info.note ?? "").length > 500) return { ok: false, error: "bad_input" };
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return { ok: false, error: "bad_items" };
    // مضاد الإغراق — مرآة حدود السيرفر (10 لكل رقم / 300 للعيادة باليوم).
    // الرقمُ ذيلُه لا صيغتُه (0178): كامل الأرقام كانت تنخدع بـ+964 بالطرفين.
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const recent = (db.storeOrders ?? []).filter((o) => new Date(o.created_at).getTime() > dayAgo);
    if (recent.filter((o) => o.customer_phone.replace(/\D/g, "").slice(-10) === digits.slice(-10)).length >= 10) return { ok: false, error: "rate_limited" };
    if (recent.length >= 300) return { ok: false, error: "rate_limited" };
    // البنود: المنتج لازم منشور، والسعر يُقرأ من القاعدة الآن ويتجمّد.
    const lines: StoreOrderItem[] = [];
    for (const it of items) {
      const qty = it.qty;
      // الخادم يرفض الكسر كلَّه (`'5.5'::int` ترمي → bad_items) — التدويرُ
      // الصامت هنا كان يقلب حكمَ الفاحص على مدخلٍ حدّي (فحص التطابق ٠٩/٠٩).
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { ok: false, error: "bad_items" };
      const p = (db.products ?? []).find((x) => x.id === it.product_id && x.store_visible
        && !isExpiredOn(x.expiry_date));   // 0212: سلّةٌ قديمةٌ فيها منتهٍ
      if (!p) return { ok: false, error: "bad_items" };
      lines.push({ product_id: p.id, name: p.name, qty, price: p.sell_price, total: Math.round(p.sell_price * qty * 100) / 100 });
    }
    const subtotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
    if (sp.min_order > 0 && subtotal < sp.min_order) return { ok: false, error: "min_order", min_order: sp.min_order };
    const total = Math.round((subtotal + sp.delivery_fee) * 100) / 100;
    const order: StoreOrder = {
      id: uid("so"), order_no: demoOrderNo(),
      customer_name: name, customer_phone: (info.phone ?? "").trim(),
      address: (info.address ?? "").trim() || null, note: (info.note ?? "").trim() || null,
      items: lines, subtotal, delivery_fee: sp.delivery_fee, total,
      status: "new", invoice_id: null, decided_at: null, created_at: new Date().toISOString(),
    };
    (db.storeOrders ??= []).unshift(order);
    saveDB(db);
    return { ok: true, order_no: order.order_no, total };
  },

  /* ---- بوّابة المالك (0158) — مرآةُ دوالّ portal_* ----
   * تفرض **نفس حرّاس الخادم** لا شكلَها فقط: ردٌّ موحَّد سواء كان الرقم مسجّلاً
   * أو لا، وخمسُ محاولاتٍ ثم يُحرق الرمز، وعشرُ دقائق للصلاحية. لأن فحوصَ
   * المنطق تجري على النسخة التجريبية — فحارسٌ ناقصٌ هنا حارسٌ لم يُفحص. */
  async portalRequestCode(slug: string, phone: string): Promise<PortalCodeRequest> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp || !matchSlug(sp.slug, slug)) return { ok: false, error: "closed" };
    const key = phoneKey(phone);
    if (!key || key.length < 8) return { ok: false, error: "bad_phone" };
    const pets = db.pets.filter((p) => phoneKey(p.owner_phone ?? "") === key && !p.deceased);
    // لا صاحبَ لهذا الرقم: نفس الرد بالضبط — الفرقُ يكشف زبائن العيادة.
    if (pets.length === 0) return { ok: true };
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const codes = readPortalCodes();
    codes[`${slugKey(slug)}|${key}`] = { code, expires: Date.now() + 10 * 60_000, attempts: 0 };
    writePortalCodes(codes);
    // التجريبيّ هو وضعُ التجربة نفسه — لا مزوّدَ رسائل أصلاً بلا خادم.
    return { ok: true, test_code: code };
  },
  async portalVerifyCode(slug: string, phone: string, code: string): Promise<PortalVerifyResult> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp || !matchSlug(sp.slug, slug)) return { ok: false, error: "closed" };
    const key = phoneKey(phone);
    if (!key || key.length < 8) return { ok: false, error: "bad_code" };
    const codes = readPortalCodes();
    const id = `${slugKey(slug)}|${key}`;
    const row = codes[id];
    // «ما موجود» و«منتهي» و«غلط» ترجع الرسالة نفسها — لا تفريقَ يفيد المخمِّن.
    if (!row || row.expires <= Date.now()) { delete codes[id]; writePortalCodes(codes); return { ok: false, error: "bad_code" }; }
    if (row.attempts >= 5) { delete codes[id]; writePortalCodes(codes); return { ok: false, error: "too_many" }; }
    if (row.code !== (code ?? "").trim()) {
      row.attempts += 1; writePortalCodes(codes);
      return { ok: false, error: "bad_code" };
    }
    delete codes[id]; writePortalCodes(codes);
    const token = uid("pt") + Math.random().toString(36).slice(2, 10);
    const expires = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
    const sessions = readPortalSessions();
    sessions[token] = { slug: slugKey(slug), key, expires };
    writePortalSessions(sessions);
    return { ok: true, token, expires_at: expires };
  },
  async portalMe(token: string): Promise<PortalMe | null> {
    const s = portalSession(token);
    if (!s) return null;
    const db = loadDB();
    const pets = db.pets
      .filter((p) => phoneKey(p.owner_phone ?? "") === s.key && !p.deceased)
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      clinic: {
        // الفارغُ يعني «ما عندي اسم» — والواجهةُ تختار الكلمةَ البديلة بلغتها.
        // اسمٌ افتراضيٌّ عربيٌّ هنا يظهر كما هو لمن يقرأ بالإنكليزية.
        name: getClinicName() || "",
        logo_url: getClinicLogo(),
        phone: db.storeProfile?.whatsapp ?? null,
        whatsapp: db.storeProfile?.whatsapp ?? null,
        slug: db.storeProfile?.slug ?? null,
      },
      show_medical: true, // التجريبيّ يعرض كلّ شيء — لا قرارَ عيادةٍ محفوظاً هنا
      pets: pets.map((p) => portalCardOf(db, p)),
    };
  },
  async portalPet(token: string, petId: string): Promise<PortalPetDetail | null> {
    const s = portalSession(token);
    if (!s) return null;
    const db = loadDB();
    // الملكيةُ تُفحص هنا كما بالقاعدة: الرقمُ هو الحقّ، لا معرّفُ الحيوان وحده.
    const p = db.pets.find((x) => x.id === petId && phoneKey(x.owner_phone ?? "") === s.key && !x.deceased);
    if (!p) return null;
    const today = localISO();
    return {
      pet: {
        id: p.id, name: p.name, species: p.species ?? null, breed: p.breed ?? null,
        sex: p.sex ?? null, dob: p.dob ?? null, color: p.color ?? null,
        photo_url: p.photo_url ?? null, weight_kg: p.current_weight_kg ?? null,
        serial: p.serial ?? null,
      },
      admission: portalAdmissionOf(db, p.id),
      journey: portalJourneyOf(db, p.id),
      today: (db.treatments ?? [])
        .filter((t) => t.pet_id === p.id && t.day === today)
        .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
        .map((t) => ({ id: t.id, label: t.medication ?? null, time: t.time ?? null, given: !!t.administered_at })),
      vaccines: (db.vaccinations ?? [])
        .filter((v) => v.pet_id === p.id)
        .sort((a, b) => String(b.administered_at ?? b.due_date ?? "").localeCompare(String(a.administered_at ?? a.due_date ?? "")))
        .map((v) => ({
          id: v.id, name: v.name, due_date: v.due_date ?? null, administered_at: v.administered_at ?? null,
          dose_number: v.dose_number ?? null, doses_total: v.doses_total ?? null,
        })),
      weights: (db.weightLogs ?? [])
        .filter((w) => w.pet_id === p.id)
        .sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at)))
        .slice(0, 12).reverse()
        .map((w) => ({ kg: w.weight_kg, at: w.measured_at })),
      appointments: (db.appointments ?? [])
        .filter((a) => a.pet_id === p.id && a.status !== "cancelled" && a.status !== "no_show"
          && new Date(a.scheduled_at).getTime() > Date.now() - 24 * 3600_000)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        .map((a) => ({ id: a.id, at: a.scheduled_at, status: a.status })),
    };
  },
  async portalLogout(token: string): Promise<void> {
    const sessions = readPortalSessions();
    delete sessions[token];
    writePortalSessions(sessions);
  },

  /* ---------------- Companies (الشركات) — inventory grouping ---------------- */
  async listCompanies(_clinicId?: string): Promise<Company[]> {
    return (loadDB().companies ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  /* **التجريبيُّ يفرض حارسَ الخادم نفسَه.** حارسٌ لا يوجد هنا حارسٌ لم يُفحص،
   * لأن فحوصَ المنطق تجري على هذه النسخة. ومفتاحُ المقارنة `groupKey` — نفسُه
   * بالشاشتين وبالقاعدة (`inv_norm_group`، 0196). */
  async createCompany(input: Omit<Company, "id" | "created_at">): Promise<Company> {
    const db = loadDB();
    if (!db.companies) db.companies = [];
    const key = groupKey(input.name);
    /* اسمٌ يصير فارغاً بعد التطبيع (مسافات، أو محارفُ اتجاهٍ لا تُرى) يُرفض —
     * مرآةُ `bad_name` بـ`ensure_company`. وبلا هذا كان `key` الفارغ **يتخطّى
     * فحصَ التوأم كلَّه** فيُحفظ صفٌّ يبدو بلا اسمٍ على الشاشة. */
    if (!key) throw new Error("bad_name");
    if (db.companies.some((c) => groupKey(c.name) === key)) {
      /* الرسالةُ من كتالوج `errors.c.*` كبقيّة القيود، لا نصّاً هنا: الشاشةُ
         تترجمها بـ`describeDbError`، ومرآةُ الخادم تحمل نفسَ الاسم. */
      throw new Error("company_twin_name");
    }
    const c: Company = { ...input, id: uid("co"), created_at: new Date().toISOString() };
    db.companies.push(c);
    saveDB(db);
    return c;
  },
  /** ابحث ثم أنشئ — **نداءٌ واحد**. المسارُ الذي تستعمله شاشتا المخزون والشراء:
   *  بحثٌ بمفتاحٍ مطبَّعٍ على الطرفين، فلا يولد توأمٌ ولو تكرّر الضغط. */
  async ensureCompany(name: string, clinicId?: string | null): Promise<Company> {
    const key = groupKey(name);
    const db = loadDB();
    const hit = (db.companies ?? []).find((c) => groupKey(c.name) === key);
    if (hit) return hit;
    return this.createCompany({ name: normGroupName(name), note: null, clinic_id: clinicId ?? null } as Omit<Company, "id" | "created_at">);
  },
  async updateCompany(id: string, patch: Partial<Company>): Promise<Company | undefined> {
    const db = loadDB();
    const c = (db.companies ?? []).find((x) => x.id === id);
    if (!c) return undefined;
    Object.assign(c, patch);
    saveDB(db);
    return c;
  },
  /* **الحذفُ طيٌّ لا محو** — مرآةُ محفّزَي 0197 و0198. والصورةُ تحمل الصفوفَ
   * لا المعرّفاتِ وحدَها حيث المفتاحُ `on delete cascade`: المطالباتُ والأصنافُ
   * تُمحى صفوفُها، والمعرّفُ لا يعيد صفّاً غيرَ موجود. */
  async deleteCompany(id: string, reason?: string | null): Promise<void> {
    const db = loadDB();
    const co = (db.companies ?? []).find((x) => x.id === id);
    if (!co) throw new Error("company not found");
    trashCompany(db, co, { reason: reason ?? null });
    const gone = new Set((db.companySections ?? []).filter((s) => s.company_id === id).map((s) => s.id));
    db.companies = (db.companies ?? []).filter((x) => x.id !== id);
    db.companySections = (db.companySections ?? []).filter((s) => s.company_id !== id);
    // cascade: مطالباتُها تُمحى (وصورتُها بالسلّة)، والباقي يُفرَّغ (set null).
    db.companyCharges = (db.companyCharges ?? []).filter((c) => c.company_id !== id);
    for (const p of db.products ?? []) {
      if (p.company_id === id) p.company_id = null;
      if (p.section_id && gone.has(p.section_id)) p.section_id = null;
    }
    for (const pu of db.purchases ?? []) if (pu.company_id === id) pu.company_id = null;
    for (const py of db.purchasePayments ?? []) if (py.company_id === id) py.company_id = null;
    saveDB(db);
  },

  /* ---------------- طيُّ التوائم والسلّة (0196 → 0198) ---------------- */
  /** مرآةُ `company_twins()`: مجموعاتُ الاسم الواحد، وكم **ينتقل** بالطيّ. */
  async companyTwins(): Promise<CompanyTwinGroup[]> {
    const db = loadDB();
    const groups = new Map<string, Company[]>();
    for (const c of db.companies ?? []) {
      const k = groupKey(c.name);
      if (!k) continue;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
    }
    const out: CompanyTwinGroup[] = [];
    for (const [norm, rows] of groups) {
      if (rows.length < 2) continue;
      rows.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      const ids = rows.map((r) => r.id);
      const dropIds = new Set(ids.slice(1));
      const inAll = (cid?: string | null) => !!cid && ids.includes(cid);
      const inDrop = (cid?: string | null) => !!cid && dropIds.has(cid);
      const sections = (db.companySections ?? []);
      out.push({
        norm, keep_id: ids[0], keep_name: rows[0].name, rows: rows.length, ids,
        products: (db.products ?? []).filter((p) => inAll(p.company_id)).length,
        purchases: (db.purchases ?? []).filter((p) => inAll(p.company_id)).length,
        sections: sections.filter((x) => inAll(x.company_id)).length,
        charges: (db.companyCharges ?? []).filter((x) => inAll(x.company_id)).length,
        payments: (db.purchasePayments ?? []).filter((x) => inAll(x.company_id)).length,
        moving_products: (db.products ?? []).filter((p) => inDrop(p.company_id)).length,
        moving_purchases: (db.purchases ?? []).filter((p) => inDrop(p.company_id)).length,
        moving_sections: sections.filter((x) => inDrop(x.company_id)).length,
        moving_charges: (db.companyCharges ?? []).filter((x) => inDrop(x.company_id)).length,
        moving_payments: (db.purchasePayments ?? []).filter((x) => inDrop(x.company_id)).length,
        pool_moving: round3(sections.filter((x) => inDrop(x.company_id)).reduce((a, x) => a + (x.pooled_stock || 0), 0)),
        // لكلّ صفٍّ على حدة (0200): به تصدق الشاشةُ لأيّ باقٍ تختاره العيادة.
        rows_detail: rows.map((c) => ({
          id: c.id, name: c.name,
          products: (db.products ?? []).filter((p) => p.company_id === c.id).length,
          purchases: (db.purchases ?? []).filter((p) => p.company_id === c.id).length,
          sections: sections.filter((x) => x.company_id === c.id).length,
          charges: (db.companyCharges ?? []).filter((x) => x.company_id === c.id).length,
          payments: (db.purchasePayments ?? []).filter((x) => x.company_id === c.id).length,
          pool: round3(sections.filter((x) => x.company_id === c.id).reduce((a, x) => a + (x.pooled_stock || 0), 0)),
        })),
      });
    }
    return out.sort((a, b) => b.rows - a.rows || a.norm.localeCompare(b.norm));
  },

  /** مرآةُ `merge_companies`: تنقل **كلَّ** ما يشير إلى المطويّة ثم تحذفها. */
  async mergeCompanies(keepId: string, dropId: string): Promise<Company> {
    if (!keepId || !dropId || keepId === dropId) throw new Error("bad_merge");
    const db = loadDB();
    const keep = (db.companies ?? []).find((x) => x.id === keepId);
    const drop = (db.companies ?? []).find((x) => x.id === dropId);
    if (!keep) throw new Error("no_keep");
    if (!drop) throw new Error("no_drop");
    // اللقطةُ **قبل** أيّ تعديلٍ يمحو الحالةَ القديمة.
    const snap = trashCompany(db, drop, { merged_into: keepId, keep_note: keep.note ?? null });
    for (const p of db.products ?? []) if (p.company_id === dropId) p.company_id = keepId;
    for (const pu of db.purchases ?? []) if (pu.company_id === dropId) { pu.company_id = keepId; pu.company_name = keep.name; }
    for (const py of db.purchasePayments ?? []) if (py.company_id === dropId) py.company_id = keepId;
    for (const ch of db.companyCharges ?? []) if (ch.company_id === dropId) ch.company_id = keepId;
    for (const t of db.productsTrash ?? []) if (t.row?.company_id === dropId) t.row = { ...t.row, company_id: keepId };
    // الأصناف: المتطابقُ اسمُه يُطوى بحوضه، وغيرُه ينتقل كما هو.
    const notes: DeletedCompanySectionNote[] = [];
    for (const sec of (db.companySections ?? []).filter((x) => x.company_id === dropId)) {
      const match = (db.companySections ?? [])
        .filter((x) => x.company_id === keepId && groupKey(x.name) === groupKey(sec.name))
        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0];
      /* **قبل النقل**: منتجاتُ هذا الصنف وحدَه. قراءتُها بعده تحمل منتجاتِ
       * الصنف الباقي كذلك، فيردُّها الفكُّ إلى صنفٍ لم تكن فيه قطّ — أمسكه
       * فحصٌ يقود المتصفّح ويسأل عن كلّ منتج: أصنفُك لشركتك؟ (0201) */
      const pids = (db.products ?? []).filter((p) => p.section_id === sec.id).map((p) => p.id);
      if (match) {
        const moved = round3(sec.pooled_stock || 0);
        /* صورةُ الصنف الخارج — محفّزُ الأصناف يلتقطها بالقاعدة أثناء الطيّ،
         * وبلا مرآتها هنا كان الفكُّ يجد «لا صورة» فيبتلع حوضَه بصمت.
         * وتُكتب بوجهتها وحوضها: سجلّان عن حدثٍ واحدٍ لا يتناقضان، ويصحّ
         * استرجاعُ الصنف وحدَه بلا مضاعفةِ الحوض. */
        (db.companySectionsTrash ??= []);
        db.companySectionsTrash = db.companySectionsTrash.filter((t) => t.id !== sec.id);
        db.companySectionsTrash.push({
          id: sec.id, clinic_id: sec.clinic_id ?? null, company_id: sec.company_id, row: { ...sec },
          folded_into: match.id, pooled_moved: moved, product_ids: pids,
          deleted_at: new Date().toISOString(),
        });
        match.pooled_stock = round3((match.pooled_stock || 0) + moved);
        for (const p of db.products ?? []) if (p.section_id === sec.id) p.section_id = match.id;
        for (const t of db.productsTrash ?? []) if (t.row?.section_id === sec.id) t.row = { ...t.row, section_id: match.id };
        notes.push({ id: sec.id, name: sec.name, pooled_moved: moved, folded_into: match.id, product_ids: pids });
        db.companySections = (db.companySections ?? []).filter((x) => x.id !== sec.id);
      } else {
        sec.company_id = keepId;
        notes.push({ id: sec.id, name: sec.name, pooled_moved: 0, folded_into: null, product_ids: [] });
      }
    }
    snap.sections = notes;
    // **الملاحظةُ اتّحادٌ لا اختيار**: لو حمل الطرفان نصّاً ضاع أحدُهما.
    const a = (keep.note ?? "").trim(), b = (drop.note ?? "").trim();
    keep.note = (a === b ? (a || b) : [a, b].filter(Boolean).join("\n")) || null;
    db.companies = (db.companies ?? []).filter((x) => x.id !== dropId);
    (db.companyMerges ??= []).push({ from_id: dropId, to_id: keepId, clinic_id: drop.clinic_id ?? null,
      from_name: drop.name, merged_at: new Date().toISOString() });
    saveDB(db);
    return keep;
  },

  /** مرآةُ `merge_company_sections`: يجمع الحوضَ، ويشترط شركةً واحدة. */
  async mergeCompanySections(keepId: string, dropId: string): Promise<void> {
    if (!keepId || !dropId || keepId === dropId) throw new Error("bad_merge");
    const db = loadDB();
    const keep = (db.companySections ?? []).find((x) => x.id === keepId);
    const drop = (db.companySections ?? []).find((x) => x.id === dropId);
    if (!keep || !drop) throw new Error("bad_section");
    if (keep.company_id !== drop.company_id) throw new Error("cross_company");
    const moved = round3(drop.pooled_stock || 0);
    (db.companySectionsTrash ??= []).push({
      id: drop.id, clinic_id: drop.clinic_id ?? null, company_id: drop.company_id,
      row: { ...drop }, folded_into: keepId, pooled_moved: moved,
      product_ids: (db.products ?? []).filter((p) => p.section_id === dropId).map((p) => p.id),
      deleted_at: new Date().toISOString(),
    });
    keep.pooled_stock = round3((keep.pooled_stock || 0) + moved);
    for (const p of db.products ?? []) if (p.section_id === dropId) p.section_id = keepId;
    for (const t of db.productsTrash ?? []) if (t.row?.section_id === dropId) t.row = { ...t.row, section_id: keepId };
    db.companySections = (db.companySections ?? []).filter((x) => x.id !== dropId);
    saveDB(db);
  },

  async listDeletedCompanies(): Promise<DeletedCompany[]> {
    return (loadDB().companiesTrash ?? []).slice().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  },
  async listDeletedCompanySections(): Promise<DeletedCompanySection[]> {
    return (loadDB().companySectionsTrash ?? []).slice().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  },

  /** مرآةُ `restore_company` (0197 ثم 0198): بنفس المعرّف، وبشرط أنّ ما انتقل
   *  ما زال حيث تركه الطيّ — فصفٌّ نُقل يدوياً بعده لا يُخطَف. */
  async restoreCompany(id: string): Promise<Company> {
    const db = loadDB();
    const t = (db.companiesTrash ?? []).find((x) => x.id === id);
    if (!t) throw new Error("not_in_trash");
    if ((db.companies ?? []).some((x) => x.id === id)) throw new Error("already_there");
    /* **الوجهةُ لازم تكون قائمة** (0203): صفوفُ المطويّة انتقلت إلى الباقية،
     * فإن حُذفت الباقيةُ بعدها صار `company_id` فيها NULL — فلا شرطَ «ما زالت
     * حيث تركها الطيّ» يتحقّق، فترجع الشركةُ **فارغة** والشاشةُ تقول «تمّ».
     * الرفضُ يقول الترتيب: استرجعِ الباقيةَ أوّلاً. */
    if (t.merged_into && !(db.companies ?? []).some((x) => x.id === t.merged_into)) throw new Error("no_merge_target");
    const row = { ...t.row };
    (db.companies ??= []).push(row);
    const ids = new Set(t.product_ids ?? []);
    const into = t.merged_into ?? null;
    const at = (cur?: string | null) => (into ? cur === into : cur == null);
    for (const p of db.products ?? []) if (ids.has(p.id) && at(p.company_id)) p.company_id = id;
    for (const pu of db.purchases ?? []) if ((t.purchase_ids ?? []).includes(pu.id) && at(pu.company_id)) { pu.company_id = id; pu.company_name = row.name ?? pu.company_name; }
    for (const py of db.purchasePayments ?? []) if ((t.payment_ids ?? []).includes(py.id) && at(py.company_id)) py.company_id = id;
    if (into) {
      for (const ch of db.companyCharges ?? []) if ((t.charge_ids ?? []).includes(ch.id) && ch.company_id === into) ch.company_id = id;
      for (const tp of db.productsTrash ?? []) if (tp.row?.company_id === into && ids.has(tp.id)) tp.row = { ...tp.row, company_id: id };
      /* فكُّ اتّحاد الملاحظتين — يُعاد حسابُ ما أنتجه الطيُّ بنفس تعبيره، ولا
       * يُكتب إلا إن كانت الملاحظةُ ما زالت هي بالحرف: ملاحظةٌ كتبتها العيادةُ
       * بعد الطيّ ملكُها ولا يدهسها الفكّ (0201). */
      const keepRow = (db.companies ?? []).find((c) => c.id === into);
      if (keepRow) {
        const a = (t.keep_note ?? "").trim(), b = (row.note ?? "").trim();
        const union = (a === b ? (a || b) : [a, b].filter(Boolean).join("\n")) || null;
        if ((keepRow.note ?? null) === union) keepRow.note = t.keep_note ?? null;
      }
    } else {
      // المطالباتُ صفوفٌ محاها التتالي — تُعاد من الصورة (0198).
      for (const ch of t.charges ?? []) if (!(db.companyCharges ?? []).some((x) => x.id === ch.id)) (db.companyCharges ??= []).push({ ...ch, company_id: id });
    }
    for (const note of t.sections ?? []) {
      const exists = (db.companySections ?? []).some((x) => x.id === note.id);
      if (note.folded_into) {
        if (!exists) {
          const st = (db.companySectionsTrash ?? []).find((x) => x.id === note.id);
          if (st) (db.companySections ??= []).push({ ...st.row });
        }
        if (note.pooled_moved) {
          const keep = (db.companySections ?? []).find((x) => x.id === note.folded_into);
          if (keep) keep.pooled_stock = round3(Math.max(0, (keep.pooled_stock || 0) - note.pooled_moved));
          const back = (db.companySections ?? []).find((x) => x.id === note.id);
          if (back) back.pooled_stock = note.pooled_moved;
        }
        const mine = new Set(note.product_ids ?? []);
        for (const p of db.products ?? []) if (mine.has(p.id) && p.section_id === note.folded_into) p.section_id = note.id;
        // الصورةُ استُهلكت: بقاؤها يعني صنفاً «محذوفاً» وهو قائمٌ بالقائمة.
        if ((db.companySections ?? []).some((x) => x.id === note.id))
          db.companySectionsTrash = (db.companySectionsTrash ?? []).filter((x) => x.id !== note.id);
      } else if (into) {
        const sec = (db.companySections ?? []).find((x) => x.id === note.id);
        if (sec && sec.company_id === into) sec.company_id = id;
      } else {
        if (!exists) {
          const st = (db.companySectionsTrash ?? []).find((x) => x.id === note.id);
          if (st) (db.companySections ??= []).push({ ...st.row });
        }
        const mine = new Set(note.product_ids ?? []);
        for (const p of db.products ?? []) if (mine.has(p.id) && p.section_id == null) p.section_id = note.id;
        db.companySectionsTrash = (db.companySectionsTrash ?? []).filter((x) => x.id !== note.id);
      }
    }
    db.companyMerges = (db.companyMerges ?? []).filter((x) => x.from_id !== id);
    db.companiesTrash = (db.companiesTrash ?? []).filter((x) => x.id !== id);
    saveDB(db);
    return row;
  },

  async restoreCompanySection(id: string): Promise<CompanySection> {
    const db = loadDB();
    const t = (db.companySectionsTrash ?? []).find((x) => x.id === id);
    if (!t) throw new Error("not_in_trash");
    if ((db.companySections ?? []).some((x) => x.id === id)) throw new Error("already_there");
    if (t.company_id && !(db.companies ?? []).some((c) => c.id === t.company_id)) throw new Error("no_company");
    const row = { ...t.row };
    (db.companySections ??= []).push(row);
    if (t.folded_into && t.pooled_moved) {
      const keep = (db.companySections ?? []).find((x) => x.id === t.folded_into);
      if (keep) keep.pooled_stock = round3(Math.max(0, (keep.pooled_stock || 0) - t.pooled_moved));
    }
    const mine = new Set(t.product_ids ?? []);
    for (const p of db.products ?? []) if (mine.has(p.id) && (!t.folded_into || p.section_id === t.folded_into)) p.section_id = id;
    db.companySectionsTrash = (db.companySectionsTrash ?? []).filter((x) => x.id !== id);
    saveDB(db);
    return row;
  },

  /* ---------------- Company sections (أصناف) — groups inside a company ---------------- */
  async listCompanySections(companyId?: string, _clinicId?: string): Promise<CompanySection[]> {
    let rows = (loadDB().companySections ?? []).slice();
    if (companyId) rows = rows.filter((s) => s.company_id === companyId);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
  async createCompanySection(input: Omit<CompanySection, "id" | "created_at">): Promise<CompanySection> {
    const db = loadDB();
    if (!db.companySections) db.companySections = [];
    const key = groupKey(input.name);
    if (!key) throw new Error("bad_name");
    if ((db.companySections ?? []).some((x) => x.company_id === input.company_id && groupKey(x.name) === key)) {
      throw new Error("company_section_twin_name");
    }
    const s: CompanySection = { ...input, id: uid("sec"), created_at: new Date().toISOString() };
    db.companySections.push(s);
    saveDB(db);
    return s;
  },
  async ensureCompanySection(companyId: string, name: string, clinicId?: string | null): Promise<CompanySection> {
    const key = groupKey(name);
    const db = loadDB();
    const hit = (db.companySections ?? []).find((x) => x.company_id === companyId && groupKey(x.name) === key);
    if (hit) return hit;
    return this.createCompanySection({ company_id: companyId, name: normGroupName(name), clinic_id: clinicId ?? null } as Omit<CompanySection, "id" | "created_at">);
  },
  async updateCompanySection(id: string, patch: Partial<CompanySection>): Promise<CompanySection | undefined> {
    const db = loadDB();
    const s = (db.companySections ?? []).find((x) => x.id === id);
    if (!s) return undefined;
    Object.assign(s, patch);
    saveDB(db);
    return s;
  },
  async deleteCompanySection(id: string): Promise<void> {
    const db = loadDB();
    const sec = (db.companySections ?? []).find((x) => x.id === id);
    if (!sec) throw new Error("section not found");
    // صورةٌ قبل الخروج (0197): كان الصنفُ يُمحى **بحوضه** بلا أثر — وحداتٌ تُباع.
    (db.companySectionsTrash ??= []) && (db.companySectionsTrash = db.companySectionsTrash.filter((t) => t.id !== id));
    db.companySectionsTrash.push({
      id: sec.id, clinic_id: sec.clinic_id ?? null, company_id: sec.company_id, row: { ...sec },
      folded_into: null, pooled_moved: 0,
      product_ids: (db.products ?? []).filter((p) => p.section_id === id).map((p) => p.id),
      deleted_at: new Date().toISOString(),
    });
    db.companySections = (db.companySections ?? []).filter((x) => x.id !== id);
    // Products stay in the company — they just lose the (now-gone) section link.
    for (const p of db.products ?? []) if (p.section_id === id) p.section_id = null;
    saveDB(db);
  },

  /* ---------------- Purchases (المشتريات) — restock from a company ---------------- */
  async listPurchases(_clinicId?: string, range?: DateRange): Promise<Purchase[]> {
    return within(loadDB().purchases ?? [], "purchased_at", range).sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""));
  },
  async listPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
    return (loadDB().purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId);
  },
  /** كشفُ ما فعلته الفاتورةُ بالمخزن (0211) — التسجيلُ ثمّ كلُّ تعديل، بترتيب السطور. */
  async listPurchaseEffects(purchaseId: string): Promise<PurchaseEffect[]> {
    return (loadDB().purchaseEffects ?? []).filter((x) => x.purchase_id === purchaseId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.line_no - b.line_no);
  },
  /** كل سطور الشراء دفعة واحدة — تقرير التصنيفات يقارن المبيع بالمشترى. */
  async listAllPurchaseItems(_clinicId?: string, range?: DateRange): Promise<PurchaseItem[]> {
    return within(loadDB().purchaseItems ?? [], "created_at", range);
  },
  /** Bulk-receive stock from a company: restock existing barcodes (+ refresh
   *  prices), create new products for unknown barcodes, and save a purchase
   *  record. Mirrors the record_purchase RPC used on Supabase. */
  async recordPurchase(lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
    const db = loadDB();
    if (!db.products) db.products = [];
    if (!db.purchases) db.purchases = [];
    if (!db.purchaseItems) db.purchaseItems = [];
    const now = new Date().toISOString();
    const companyId = meta.company_id ?? null;
    const purchaseId = uid("pur");
    const round3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100; // match numeric(12,2) on the server
    const minStock = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
    let total = 0, count = 0;
    /* الكشف (مرآةُ 0211): صورةُ المادّة قبل سطرها — سطرٌ ثانٍ لنفس المادّة يرى ما
     * تركه الأوّل، كالخادم. */
    const effects: PurchaseEffect[] = [];
    for (const l of lines) {
      const qty = round3(Number(l.qty) || 0);
      const cost = round2(Number(l.purchase_price) || 0);
      const sell = round2(Number(l.sell_price) || 0);
      total += qty * cost;
      count += qty;
      // Resolve a product: explicit id → barcode **موحَّداً** → الاسم موحَّداً.
      // ٥٣٩١ و5391 قطعةٌ واحدة، والقطعة المسجّلة بلا باركود تُشترى باسمها
      // فتُرصَّد بمكانها وتتعلّم الباركود — لا توأمَ أعمى بـ«بدون صنف».
      const r = applyPurchaseLine(db, l, companyId, now, { qty, cost, sell, minStock: minStock(l.min_stock) }, (st, q) => round3(st + q));
      const pid = r.pid;
      const snapBefore = r.before;
      const after = effectSnap(r.after);
      effects.push({
        id: uid("pe"), clinic_id: null, purchase_id: purchaseId, op: "record", line_no: effects.length + 1,
        product_id: pid, product_name: r.after.name, barcode_in: l.barcode?.trim() || null,
        outcome: r.how === null ? "created" : "matched", matched_by: r.how, qty,
        before: snapBefore, after, changed: effectChanged(snapBefore, after), created_at: now,
      });
      db.purchaseItems.push({
        id: uid("pi"), purchase_id: purchaseId, clinic_id: null, product_id: pid,
        barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
        category: l.category ?? null, qty, purchase_price: cost, sell_price: sell,
        // 0214: تاريخُ هذه الوجبة مع سطرها — المكتوب، وإلا المحفوظُ عند التعديل (لا يلمس المنتج).
        expiry_date: l.expiry_date || l.batch_expiry || null, created_at: now,
      });
    }
    const totalR = Math.round(total * 100) / 100;
    const paid = meta.amount_paid != null ? Math.max(0, Math.min(totalR, Math.round(meta.amount_paid * 100) / 100)) : totalR;
    const purchase: Purchase = {
      id: purchaseId, clinic_id: null, company_id: companyId, company_name: meta.company_name ?? null,
      reference: meta.reference?.trim() || null, total: totalR, item_count: Math.round(count),
      amount_paid: paid, payment_method: meta.payment_method ?? null,
      status: paid >= totalR ? "paid" : paid <= 0 ? "unpaid" : "partial",
      supplier_name: meta.supplier_name?.trim() || null,
      supplier_phone: meta.supplier_phone?.trim() || null,
      notes: meta.notes?.trim() || null, purchased_at: meta.purchased_at || now,
      staff_id: meta.staff_id ?? null, created_at: now,
    };
    db.purchases.push(purchase);
    db.purchaseEffects = [...(db.purchaseEffects ?? []), ...effects];
    saveDB(db);
    return purchase;
  },
  /** تعديل فاتورة شراء محفوظة: يُعكس أثر سطورها القديمة على المخزون ثم تُنزَّل
   *  السطور الجديدة بنفس المطابقة الذكية — السطر غير المتغيّر أثره الصافي صفر.
   *  المدفوع يبقى كما سُدِّد (مقصوصاً على الإجمالي الجديد). يطابق update_purchase RPC. */
  async updatePurchase(purchaseId: string, lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
    const db = loadDB();
    const purchase = (db.purchases ?? []).find((x) => x.id === purchaseId);
    if (!purchase) throw new Error("purchase not found");
    if (!lines.length) throw new Error("empty purchase");
    const companyId = purchase.company_id ?? null;
    const round3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const minStock = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
    /* **بلا حصرٍ بصفر** (مرآةُ 0205). `round3` نفسُها تحصر، فالعكسُ يحتاج تقريباً
     * حرّاً: حصرُ خطوةٍ وسطى يخترع بضاعةً لمّا يكون بيعَ أكثرُ الكمية —
     * ٥٠ اشتُريت و٤٥ بيعت ⇒ الرصيد ٥، وتعديلٌ بلا تغييرِ كميةٍ كان يرفعه ٥٠.
     * وقعت بالإنتاج 2026-09-16. الحصرةُ الوحيدة بالنهاية على ما لمسته الفاتورة. */
    const rnd3 = (n: number) => Math.round(n * 1000) / 1000;
    const touched = new Set<string>();
    /* الكشف (مرآةُ 0211): «كان» صورةُ المادّة قبل التعديل كلِّه — لا بعد العكس. */
    const orig = new Map<string, PurchaseEffectSnap>();
    const oldQty = new Map<string, number>();
    const seen = new Set<string>();
    const effects: PurchaseEffect[] = [];
    // ١) اعكس السطور القديمة ثم أزلها
    for (const it of (db.purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId)) {
      const p = it.product_id ? db.products.find((x) => x.id === it.product_id) : undefined;
      if (p && !orig.has(p.id)) orig.set(p.id, effectSnap(p)!);
      if (it.product_id) oldQty.set(it.product_id, (oldQty.get(it.product_id) ?? 0) + (it.qty || 0));
      if (p) { p.stock = rnd3((p.stock || 0) - (it.qty || 0)); touched.add(p.id); }
    }
    db.purchaseItems = (db.purchaseItems ?? []).filter((x) => x.purchase_id !== purchaseId);
    // ٢) نزّل الجديدة — نفس مطابقة recordPurchase
    const now = new Date().toISOString();
    let total = 0, count = 0;
    for (const l of lines) {
      const qty = round3(Number(l.qty) || 0);
      const cost = round2(Number(l.purchase_price) || 0);
      const sell = round2(Number(l.sell_price) || 0);
      total += qty * cost;
      count += qty;
      const r = applyPurchaseLine(db, l, companyId, now, { qty, cost, sell, minStock: minStock(l.min_stock) }, (st, q) => rnd3(st + q));
      const pid = r.pid;
      if (r.how !== null) touched.add(pid);
      const snapBefore = r.how !== null && orig.has(pid) && !seen.has(pid) ? orig.get(pid)! : r.before;
      const after = effectSnap(r.after);
      effects.push({
        id: uid("pe"), clinic_id: null, purchase_id: purchaseId, op: "update", line_no: effects.length + 1,
        product_id: pid, product_name: r.after.name, barcode_in: l.barcode?.trim() || null,
        outcome: r.how === null ? "created" : "matched", matched_by: r.how, qty,
        before: snapBefore, after, changed: effectChanged(snapBefore, after), created_at: now,
      });
      seen.add(pid);
      db.purchaseItems.push({
        id: uid("pi"), purchase_id: purchaseId, clinic_id: null, product_id: pid,
        barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
        category: l.category ?? null, qty, purchase_price: cost, sell_price: sell,
        // 0214: تاريخُ هذه الوجبة مع سطرها — المكتوب، وإلا المحفوظُ عند التعديل (لا يلمس المنتج).
        expiry_date: l.expiry_date || l.batch_expiry || null, created_at: now,
      });
    }
    // ٢·٥) الحصرةُ الوحيدة: بضاعةٌ سُحبت من الفاتورة ولم تعد تغطّي ما بيع
    //      ⇒ صفرٌ لا سالب. على ما لمسته الفاتورةُ وحدَه (مرآةُ 0205).
    for (const id of touched) {
      const p = db.products.find((x) => x.id === id);
      if (p && (p.stock || 0) < 0) p.stock = 0;
    }
    // «صار» بعد الحصرة، والمشالُ من الفاتورة يُقال (مرآةُ 0211).
    for (const e of effects) {
      if ((e.after?.stock ?? 0) < 0) e.after = effectSnap(db.products.find((x) => x.id === e.product_id));
    }
    for (const [id, snap] of orig) {
      if (seen.has(id)) continue;
      const p = db.products.find((x) => x.id === id);
      effects.push({
        id: uid("pe"), clinic_id: null, purchase_id: purchaseId, op: "update", line_no: effects.length + 1,
        product_id: id, product_name: p?.name ?? snap.name ?? "Item", barcode_in: null,
        outcome: "removed", matched_by: null, qty: -(oldQty.get(id) ?? 0),
        before: snap, after: effectSnap(p), changed: [], created_at: now,
      });
    }
    db.purchaseEffects = [...(db.purchaseEffects ?? []), ...effects];
    // ٣) رأس الفاتورة — المدفوع الحقيقي يبقى مقصوصاً على الإجمالي الجديد
    const totalR = round2(total);
    const prevPaid = purchase.amount_paid != null ? purchase.amount_paid : purchase.total;
    const paid = Math.max(0, Math.min(totalR, round2(meta.amount_paid != null ? meta.amount_paid : prevPaid)));
    purchase.total = totalR;
    purchase.item_count = Math.round(count);
    purchase.amount_paid = paid;
    purchase.status = paid >= totalR ? "paid" : paid <= 0 ? "unpaid" : "partial";
    if (meta.reference?.trim()) purchase.reference = meta.reference.trim();
    if (meta.payment_method) purchase.payment_method = meta.payment_method;
    purchase.supplier_name = meta.supplier_name !== undefined ? (meta.supplier_name?.trim() || null) : purchase.supplier_name;
    purchase.supplier_phone = meta.supplier_phone !== undefined ? (meta.supplier_phone?.trim() || null) : purchase.supplier_phone;
    purchase.notes = meta.notes !== undefined ? (meta.notes?.trim() || null) : purchase.notes;
    if (meta.purchased_at) purchase.purchased_at = meta.purchased_at;
    saveDB(db);
    return purchase;
  },
  /* ---- مطالبات الشركات اليدوية (0155) ----
   * ما تطلبه الشركةُ ولا فاتورةَ شراءٍ له. تُجمع على الدين وحده — لا مخزونَ
   * يتحرّك ولا كلفةَ تُحتسب — ولذلك هي صفٌّ مستقلٌّ لا فاتورةٌ وهميّة. */
  async listCompanyCharges(_clinicId?: string): Promise<CompanyCharge[]> {
    return (loadDB().companyCharges ?? [])
      .slice()
      .sort((a, b) => (b.charged_at || "").localeCompare(a.charged_at || "")
        || (b.created_at || "").localeCompare(a.created_at || ""));
  },
  async addCompanyCharge(input: {
    company_id: string; amount: number; reason?: string | null;
    note?: string | null; charged_at?: string | null;
  }): Promise<CompanyCharge> {
    const amt = Math.round((Number(input.amount) || 0) * 100) / 100;
    // نفس حارس القاعدة: موجبٌ حصراً. المطالبةُ تزيد الدين، والتنقيصُ تسديد.
    if (!(amt > 0)) throw new Error("amount must be greater than zero");
    const db = loadDB();
    if (!db.companyCharges) db.companyCharges = [];
    const row: CompanyCharge = {
      id: uid("cc"), clinic_id: null, company_id: input.company_id, amount: amt,
      reason: input.reason?.trim() || null,
      note: input.note?.trim() || null,
      // اليومُ المحلّي لا UTC — مطالبةٌ تُقيَّد بعد التاسعة مساءً كانت تُكتب بالأمس.
      charged_at: input.charged_at || localISO(),
      settled_at: null, created_by: null, created_at: new Date().toISOString(),
    };
    db.companyCharges.push(row);
    saveDB(db);
    return row;
  },
  /** الطيُّ والفكّ: `settled_at` وحده يتبدّل — لا يُعاد كتابةُ مبلغٍ ولا تاريخ. */
  async setCompanyChargeSettled(id: string, settled: boolean): Promise<CompanyCharge | undefined> {
    const db = loadDB();
    const row = (db.companyCharges ?? []).find((x) => x.id === id);
    if (!row) return undefined;
    row.settled_at = settled ? new Date().toISOString() : null;
    saveDB(db);
    return row;
  },
  /** الحذفُ للخطأ بالإدخال وحده — التسويةُ طيٌّ لا محو. */
  async deleteCompanyCharge(id: string): Promise<void> {
    const db = loadDB();
    db.companyCharges = (db.companyCharges ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /** سجل تسديدات فاتورة شراء — كل دفعة انسدّت على دين المورّد. */
  async listPurchasePayments(purchaseId: string): Promise<PurchasePayment[]> {
    return (loadDB().purchasePayments ?? [])
      .filter((x) => x.purchase_id === purchaseId)
      .sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""));
  },
  /** تسديد دفعة على فاتورة شراء آجلة: تُقص على المتبقّي، تُسجَّل في سجل
   *  التسديدات، ويُحدَّث رأس الفاتورة. يطابق settle_purchase RPC في السحابة. */
  async settlePurchase(purchaseId: string, amount: number, method: PaymentMethod = "cash", note?: string | null): Promise<Purchase | undefined> {
    const db = loadDB();
    const p = (db.purchases ?? []).find((x) => x.id === purchaseId);
    if (!p) return undefined;
    const paid = p.amount_paid != null ? p.amount_paid : p.total;
    const due = Math.max(0, p.total - paid);
    const amt = Math.round(Math.min(Math.max(Number(amount) || 0, 0), due) * 100) / 100;
    if (amt <= 0) throw new Error("nothing to settle");
    if (!db.purchasePayments) db.purchasePayments = [];
    const now = new Date().toISOString();
    db.purchasePayments.push({
      id: uid("pp"), clinic_id: null, purchase_id: p.id, company_id: p.company_id ?? null,
      amount: amt, method, note: note?.trim() || null, paid_at: now, staff_id: null, created_at: now,
    });
    p.amount_paid = Math.round((paid + amt) * 100) / 100;
    p.status = p.amount_paid >= p.total ? "paid" : p.amount_paid <= 0 ? "unpaid" : "partial";
    saveDB(db);
    return p;
  },
  /** هل قاعدة البيانات تدعم دفتر ديون المورّدين (ترحيل 0076)؟ */
  /** ترتيب «بدون صنف»: كل توأمٍ لقطعةٍ مصنَّفة يُدمج بأصله — العدد يُجمع،
   *  والأصل يكسب الباركود إن كان بلا باركود، والتاريخ يتبع الأصل. */
  /** يطوي رصيدَ منتجٍ متتبَّع إلى حوض صنفه ويصفّره بالمنتج — **معاً**.
   *  مرآةُ `pool_product` (0171): الواجهةُ كانت تكتبهما على مرحلتين، فنجاحُ
   *  الأولى وفشلُ الثانية يعدّ البضاعةَ مرّتين (بالحوض وبالمنتج). */
  /**
   * يربط رمزاً بمنتجٍ **إن كان بلا رمزٍ بعد** — وإلا يرمي بلا كتابة.
   *
   * السبب: مولّدُ الباركود كان يقرأ «هل صار له رمز؟» من مصفوفة props بائتة،
   * فالتعليقُ يقول «انربط له باركود بجهاز ثاني؟ لا تكتب فوقه» والشيفرةُ تقرأ
   * نفسَ الصفّ الذي بيدها — أي أنها لا تسأل أحداً. وحلقةُ «ولّد للكلّ» لا
   * تعيد الفحصَ أصلاً. فجهازان يولّدان معاً ⇒ الثاني يدهس رمزَ الأوّل،
   * والملصقاتُ المطبوعة بالأوّل تصير رموزاً لا تخصّ شيئاً.
   * فالشرطُ ينزل حيث لا يُتجاوَز: بالكتابة نفسِها.
   */
  async assignBarcodeIfEmpty(id: string, code: string): Promise<Product> {
    const db = loadDB();
    const p = (db.products ?? []).find((x) => x.id === id);
    if (!p) throw new Error("product_not_found");
    if (p.barcode && p.barcode.trim()) throw new Error("barcode_already_set");
    const next = normalizeCode(code) || null;
    if (!next) throw new Error("empty code");
    throwIfCodeTaken(db, next, id);
    p.barcode = next;
    saveDB(db);
    return p;
  },
  async poolProduct(productId: string, sectionId: string): Promise<Product> {
    const db = loadDB();
    const p = (db.products ?? []).find((x) => x.id === productId);
    if (!p) throw new Error("product_not_found");
    const s = (db.companySections ?? []).find((x) => x.id === sectionId);
    if (!s) throw new Error("section_not_found");
    s.pooled_stock = Math.round(((s.pooled_stock ?? 0) + Math.max(0, p.stock || 0)) * 1000) / 1000;
    p.pooled = true; p.section_id = sectionId; p.stock = 0;
    saveDB(db);
    return p;
  },
  async tidyInventory(): Promise<{ merged: number; kept: number }> {
    const db = loadDB();
    const items = db.purchaseItems ?? [];
    const inv = db.invoiceItems ?? [];
    let merged = 0, kept = 0;
    for (const dup of [...(db.products ?? [])].filter((p) => !p.section_id)) {
      const code = invNormCode(dup.barcode);
      const name = invNormName(dup.name);
      let target =
        (code ? db.products.find((p) => p.id !== dup.id && p.section_id && invNormCode(p.barcode) === code && (p.barcode ?? "") !== "") : undefined)
        ?? (name.length >= 2
          ? db.products.find((p) => p.id !== dup.id && p.section_id
              && (p.company_id ?? null) === (dup.company_id ?? null)
              && invNormName(p.name) === name)
          : undefined);
      if (!target) { kept++; continue; }
      // صورةُ الطيّ قبل الحذف (0146): «رتّبِ المخزن» طريقٌ ثالثٌ يخرج به صفٌّ
      // من `products`، وكان يخرج هنا **بلا صورة** — فيختفي بلا رجعة بينما
      // السحابةُ تحفظه ويُفكّ من تبويب المحذوفات.
      trashProduct(db, dup, { merged_into: target.id, keep_barcode: target.barcode?.trim() ? target.barcode : null });
      target.stock = Math.max(0, (target.stock || 0) + Math.max(0, dup.stock || 0));
      /* رموزُ المطويّ تلحق بالهدف (0169) — الأساسيُّ والإضافية معاً، بنفس منطق
       * `merge_products`. كان الطيُّ يدفنها: هدفٌ له باركودُه لا يرث شيئاً، فأوّلُ
       * مسحةٍ لباركود المصنع بعد «رتّب المخزن» تقول «مو موجود» والمادّةُ بالمخزن،
       * فيُعاد إدخالُها توأماً — الدورةُ نفسُها من بابٍ اسمُه «ترتيب». */
      const tgtCode = invNormCode(target.barcode);
      const owned = (c: string) => (db.products ?? []).some((o) =>
        o.id !== target.id && o.id !== dup.id
        && (invNormCode(o.barcode) === invNormCode(c) || (o.alt_codes ?? []).some((x) => invNormCode(x) === invNormCode(c))));
      const codes = [...(target.alt_codes ?? [])];
      const addCode = (c: string | null | undefined) => {
        const v = (c ?? "").trim();
        if (!v || invNormCode(v) === tgtCode) return;
        if (codes.some((x) => invNormCode(x) === invNormCode(v))) return;
        if (owned(v)) return;
        codes.push(v);
      };
      addCode(dup.barcode);
      for (const c of dup.alt_codes ?? []) addCode(c);
      target.alt_codes = codes;
      if (!target.barcode && dup.barcode) target.barcode = dup.barcode;
      if (!target.expiry_date && dup.expiry_date) target.expiry_date = dup.expiry_date;
      for (const it of items) if (it.product_id === dup.id) it.product_id = target.id;
      for (const it of inv) if ((it as { product_id?: string | null }).product_id === dup.id) (it as { product_id?: string | null }).product_id = target.id;
      // والباركوداتُ المولَّدة تتبع الأصل كما بالدمج، لا تبقى معلّقةً على صفٍّ محذوف.
      for (const g of db.generatedBarcodes ?? []) if (g.product_id === dup.id) g.product_id = target.id;
      db.products = db.products.filter((p) => p.id !== dup.id);
      merged++;
    }
    saveDB(db);
    return { merged, kept };
  },

  async supportsSupplierLedger(): Promise<boolean> {
    return true;
  },

  async listInvoices(_clinicId?: string, range?: DateRange): Promise<Invoice[]> {
    return within(loadDB().invoices ?? [], "created_at", range).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async checkout(items: CheckoutItem[]): Promise<Invoice> {
    return createInvoiceLocal(items);
  },

  /* ---------------- Delivery (التوصيل — الدفع عند الاستلام) ---------------- */
  async listCouriers(_clinicId?: string): Promise<Courier[]> {
    return (loadDB().couriers ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  async createCourier(input: Omit<Courier, "id" | "created_at">): Promise<Courier> {
    const db = loadDB();
    if (!db.couriers) db.couriers = [];
    const c: Courier = { ...input, id: uid("cur"), created_at: new Date().toISOString() };
    db.couriers.push(c);
    saveDB(db);
    return c;
  },
  async updateCourier(id: string, patch: Partial<Courier>): Promise<Courier | undefined> {
    const db = loadDB();
    const c = (db.couriers ?? []).find((x) => x.id === id);
    if (!c) return undefined;
    Object.assign(c, patch);
    saveDB(db);
    return c;
  },
  async listDeliveryOrders(_clinicId?: string): Promise<DeliveryOrder[]> {
    return (loadDB().deliveryOrders ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createDeliveryOrder(input: Omit<DeliveryOrder, "id" | "created_at">): Promise<DeliveryOrder> {
    const db = loadDB();
    if (!db.deliveryOrders) db.deliveryOrders = [];
    // مرآةُ الفهرس الفريد بـ0180: فاتورةٌ واحدة = طلبٌ واحد. حارسٌ ليس هنا
    // حارسٌ لم يُفحص — فحوصُ المنطق تجري على هذه النسخة.
    const twin = input.invoice_id ? db.deliveryOrders.find((x) => x.invoice_id === input.invoice_id) : undefined;
    if (twin) return twin;
    const o: DeliveryOrder = { ...input, id: uid("dlv"), created_at: new Date().toISOString() };
    db.deliveryOrders.push(o);
    saveDB(db);
    return o;
  },
  async updateDeliveryOrder(id: string, patch: Partial<DeliveryOrder>): Promise<DeliveryOrder | undefined> {
    const db = loadDB();
    const o = (db.deliveryOrders ?? []).find((x) => x.id === id);
    if (!o) return undefined;
    Object.assign(o, patch);
    saveDB(db);
    return o;
  },
  async listCourierSettlements(courierId?: string): Promise<CourierSettlement[]> {
    return (loadDB().courierSettlements ?? [])
      .filter((s) => !courierId || s.courier_id === courierId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  /** تحصيلٌ من شركة توصيل (0148) — مرآةُ courier_settle: المبلغ يُوزَّع على طلباتها
   *  المسلَّمة غير المحصَّلة الأقدمَ فالأقدم، بنفس منطق settleInvoice، ويُختم كلُّ
   *  طلبٍ اكتمل تسديدُه. حارسٌ ليس هنا حارسٌ لم يُفحص. */
  async settleCourier(courierId: string, amount: number, method: PaymentMethod = "cash", note?: string | null): Promise<{ settled: number; orders: number; unallocated: number; remaining_owed: number }> {
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const db = loadDB();
    const c = (db.couriers ?? []).find((x) => x.id === courierId);
    if (!c) throw new Error("courier not found");
    let left = r2(Number(amount) || 0);
    if (left <= 0) throw new Error("amount must be positive");
    const now = new Date().toISOString();
    const open = (db.deliveryOrders ?? [])
      .filter((o) => o.courier_id === courierId && o.status === "delivered" && !o.collected_at)
      .sort((a, b) => (a.delivered_at ?? a.created_at).localeCompare(b.delivered_at ?? b.created_at));
    const allocations: CourierSettlement["allocations"] = [];
    let paid = 0;
    for (const o of open) {
      const inv = (db.invoices ?? []).find((i) => i.id === o.invoice_id);
      const was = inv ? (inv.amount_paid != null ? inv.amount_paid : inv.total) : 0;
      const due = inv && inv.status !== "refunded" ? Math.max(0, r2(inv.total - was)) : 0;
      if (!inv || due <= 0) { o.collected_at = now; continue; }
      if (left <= 0) break;
      const pay = Math.min(due, left);
      inv.amount_paid = r2(was + pay);
      const legs = [...(inv.payment_details ?? []), { method, amount: pay, at: now }];
      inv.payment_details = legs;
      inv.payment_method = legs.reduce((b, p) => (p.amount > b.amount ? p : b), legs[0]).method;
      if (pay >= due - 0.005) o.collected_at = now;
      allocations.push({ order_id: o.id, invoice_id: o.invoice_id, amount: pay });
      left = r2(left - pay); paid = r2(paid + pay);
    }
    if (paid <= 0) throw new Error("nothing to collect");
    if (!db.courierSettlements) db.courierSettlements = [];
    db.courierSettlements.push({ id: uid("cst"), clinic_id: null, courier_id: courierId, amount: paid, method, note: note?.trim() || null, allocations, created_by: null, created_at: now });
    const remaining = r2((db.deliveryOrders ?? [])
      .filter((o) => o.courier_id === courierId && o.status === "delivered" && !o.collected_at)
      .reduce((s, o) => { const inv = (db.invoices ?? []).find((i) => i.id === o.invoice_id); return s + (inv ? Math.max(0, r2(inv.total - (inv.amount_paid ?? inv.total))) : 0); }, 0));
    saveDB(db);
    return { settled: paid, orders: allocations.length, unallocated: left, remaining_owed: remaining };
  },
  /** فكُّ تحصيل — مرآةُ `courier_unsettle` (0157) بنفس قواعدها حرفياً:
   *  يردّ المبالغ ويعيد الطلبات للذمّة ويسِمُ الصفَّ مفكوكاً، **ولا يحذف شيئاً**.
   *  والعكسُ يُكتب ساقاً سالبةً لا مسحاً لساقٍ قديمة — فالفاتورةُ تحكي قصّتَها. */
  async unsettleCourier(settlementId: string, reason?: string | null): Promise<CourierSettlement> {
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const db = loadDB();
    const s = (db.courierSettlements ?? []).find((x) => x.id === settlementId);
    if (!s) throw new Error("settlement not found");
    if (s.reversed_at) throw new Error("already_reversed");
    const now = new Date().toISOString();
    for (const a of s.allocations ?? []) {
      const inv = (db.invoices ?? []).find((i) => i.id === a.invoice_id);
      if (inv && inv.status !== "refunded") {
        // لا نردّ أكثر مما هو مدفوعٌ فعلاً — والنقصُ ليس فكّاً جزئياً صامتاً.
        const back = Math.min(r2(a.amount), r2(inv.amount_paid ?? 0));
        if (back < r2(a.amount) - 0.005) throw new Error("cannot_fully_reverse");
        if (back > 0) {
          inv.amount_paid = r2((inv.amount_paid ?? 0) - back);
          inv.payment_details = [...(inv.payment_details ?? []),
            { method: s.method, amount: -back, at: now, reversal_of: s.id,
              ...(reason?.trim() ? { note: reason.trim() } : {}) }];
        }
      }
      const o = (db.deliveryOrders ?? []).find((x) => x.id === a.order_id);
      if (o) o.collected_at = null;   // يرجع بالذمّة — وهذا ما يعيده للكشف
    }
    s.reversed_at = now;
    s.reversed_reason = (reason ?? "").trim() || null;
    saveDB(db);
    return s;
  },

  /* ---------------- Retail & advanced invoicing ---------------- */
  async retailCheckout(items: CheckoutItem[], meta: SaleMeta): Promise<Invoice> {
    return createInvoiceLocal(items, meta);
  },
  /** إرجاعٌ خالص — مرآةُ `retail_return` (هجرة 0132) بنفس قواعدها حرفياً:
   *  ما تُنشأ فاتورة، والبضاعة ترجع للرصيد، وسحبٌ منفصل لكل صنف. */
  async retailReturn(items: CheckoutItem[], meta: ReturnMeta): Promise<RetailReturnResult> {
    // ترجمةُ الجيب بموضعٍ واحد (`pockets.ts`): كانت تعبيراً ثلاثياً منسوخاً
    // هنا وبالمسار السحابيّ، فأيُّ جيبٍ جديد كان يحتاج تعديلَ نسختين بلا رابط.
    const method: ExpenseMethod = expenseMethodOf(meta.method);
    const db = loadDB();
    let total = 0, lines = 0;
    const at = new Date().toISOString();
    for (const it of items) {
      const qty = Math.abs(Number(it.qty) || 0);
      if (qty === 0) continue;
      const stockQty = Math.abs(Number(it.stock_qty ?? qty) || 0);
      const price = Math.abs(Number(it.unit_price) || 0);
      const amount = Math.round(qty * price * 100) / 100;

      if (it.product_id) {
        const p = db.products.find((x) => x.id === it.product_id);
        if (p) p.stock = Math.round(((p.stock ?? 0) + stockQty) * 1000) / 1000;
      }
      if (amount > 0) {
        const qtyTxt = qty === 1 ? "" : ` \u00d7 ${String(qty)}`;
        const who = meta.customer_name?.trim() ? ` \u2014 ${meta.customer_name.trim()}` : "";
        const note = meta.note?.trim() ? ` (${meta.note.trim()})` : "";
        demoAddExpense({
          amount,
          description: `\u0631\u0627\u062c\u0639: ${it.name || "\u0635\u0646\u0641"}${qtyTxt}${who}${note}`,
          category: "\u0645\u0631\u062a\u062c\u0639",
          method, spent_at: at,
        });
        total += amount;
      }
      lines += 1;
    }
    if (lines === 0) throw new Error("no items");
    saveDB(db);
    return { total: Math.round(total * 100) / 100, lines, method };
  },
  async listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return (loadDB().invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
  },
  async listAllInvoiceItems(_clinicId?: string, range?: DateRange): Promise<InvoiceItem[]> {
    // البنود التجريبية ما بيها تاريخ خاص، فترث تاريخ فاتورتها — نفس ما تفعله
    // هجرة 0133 بالسحابة، حتى تتطابق النسختان بالنتيجة لا بالشكل وحده.
    const db = loadDB();
    const items = db.invoiceItems ?? [];
    if (!range?.from && !range?.to) return items.slice();
    const at = new Map((db.invoices ?? []).map((i) => [i.id, i.created_at]));
    return items.filter((it) => {
      const d = (it as { created_at?: string }).created_at ?? at.get(it.invoice_id) ?? "";
      return (!range.from || d >= range.from) && (!range.to || d <= range.to);
    });
  },
  /* ---- التقارير (0149): مرايا دوالّ القاعدة بمنطق الواجهة نفسه ------------
   * النسخة التجريبية تحسب بـreceiptsOf/dueOf — الدوالّ التي كانت الشاشات تحسب
   * بها — فيتطابق ما يراه الطبيب هنا مع ما ترجّعه القاعدة (وفحصُ التطابق يثبته). */
  async listInvoicesTouching(range: DateRange): Promise<Invoice[]> {
    const lo = range.from ? new Date(range.from).getTime() : -Infinity;
    const hi = range.to ? new Date(range.to).getTime() : Infinity;
    const inR = (iso?: string | null) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= lo && t <= hi; };
    return (loadDB().invoices ?? [])
      .filter((i) => inR(i.created_at) || inR(i.refunded_at)
        || ((i.status ?? "paid") !== "refunded" && dueOf(i) > 0.01)
        || (i.payment_details ?? []).some((l) => !!l.at && inR(l.at)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async customerInvoices(phone?: string | null, name?: string | null): Promise<Invoice[]> {
    const pd = phoneDigits(phone ?? "");
    const nm = (name ?? "").trim().toLowerCase();
    return (loadDB().invoices ?? [])
      .filter((i) => pd
        ? phoneDigits(i.customer_phone ?? "") === pd
        : (!!nm && !phoneDigits(i.customer_phone ?? "") && (i.customer_name ?? "").trim().toLowerCase() === nm))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async listInvoiceItemsFor(invoiceIds: string[]): Promise<InvoiceItem[]> {
    const ids = new Set(invoiceIds);
    return (loadDB().invoiceItems ?? []).filter((it) => ids.has(it.invoice_id));
  },
  /** فواتيرُ بمعرّفاتها — لكشفِ حاملٍ يمتدّ شهوراً.
   *  لقطةُ الصفحة تحمل آخرَ خمسةَ عشرَ يوماً + الديونَ المفتوحة (0150)، فطلبٌ
   *  **حُصِّل** قبل شهرين فاتورتُه ليست فيها. الكشفُ يمشي على معرّفاتِ طلباته
   *  لا على اللقطة، وإلا عرض قائمةً ناقصةً تبدو تامّة. */
  async listInvoicesByIds(invoiceIds: string[]): Promise<Invoice[]> {
    const ids = new Set(invoiceIds);
    return (loadDB().invoices ?? []).filter((i) => ids.has(i.id));
  },
  async reportReceiptsDaily(range: DateRange, _tz?: string): Promise<ReceiptsDay[]> {
    const lo = range.from ? new Date(range.from).getTime() : -Infinity;
    const hi = range.to ? new Date(range.to).getTime() : Infinity;
    const m = new Map<string, { gross: number; net: number; ids: Set<string> }>();
    for (const inv of loadDB().invoices ?? []) {
      const total = inv.total > 0 ? inv.total : 0;
      for (const r of receiptsOf(inv)) {
        const t = new Date(r.at).getTime();
        if (t < lo || t > hi) continue;
        const d = new Date(r.at);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const cur = m.get(day) ?? { gross: 0, net: 0, ids: new Set<string>() };
        cur.gross += r.amount; cur.net += total > 0 ? inv.profit * (r.amount / total) : 0; cur.ids.add(inv.id);
        m.set(day, cur);
      }
    }
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, gross: r2(v.gross), net: r2(v.net), invoices: v.ids.size }));
  },
  async reportReceiptsTotal(range: DateRange): Promise<ReceiptsTotal> {
    const days = await this.reportReceiptsDaily(range);
    const lo = range.from ? new Date(range.from).getTime() : -Infinity;
    const hi = range.to ? new Date(range.to).getTime() : Infinity;
    const ids = new Set<string>();
    for (const inv of loadDB().invoices ?? []) for (const r of receiptsOf(inv)) { const t = new Date(r.at).getTime(); if (t >= lo && t <= hi) ids.add(inv.id); }
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return { gross: r2(days.reduce((s, d) => s + d.gross, 0)), net: r2(days.reduce((s, d) => s + d.net, 0)), invoices: ids.size };
  },
  async reportTopProducts(range: DateRange, limit = 5): Promise<TopProductRow[]> {
    const db = loadDB();
    const lo = range.from ? new Date(range.from).getTime() : -Infinity;
    const hi = range.to ? new Date(range.to).getTime() : Infinity;
    const ok = new Set((db.invoices ?? []).filter((i) => (i.status ?? "paid") !== "refunded" && new Date(i.created_at).getTime() >= lo && new Date(i.created_at).getTime() <= hi).map((i) => i.id));
    const m = new Map<string, TopProductRow>();
    for (const it of db.invoiceItems ?? []) {
      if (!ok.has(it.invoice_id)) continue;
      const key = it.product_id || it.name;
      const cur = m.get(key) ?? { key, name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty; cur.revenue += it.line_total; m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  },
  async reportStaff(range: DateRange): Promise<StaffSalesRow[]> {
    const lo = range.from ? new Date(range.from).getTime() : -Infinity;
    const hi = range.to ? new Date(range.to).getTime() : Infinity;
    const m = new Map<string, StaffSalesRow>();
    for (const inv of loadDB().invoices ?? []) {
      if ((inv.status ?? "paid") === "refunded") continue;
      const t = new Date(inv.created_at).getTime();
      if (t < lo || t > hi) continue;
      const key = inv.staff_id ?? "";
      const cur = m.get(key) ?? { staff_id: inv.staff_id ?? null, invoices: 0, revenue: 0, profit: 0 };
      cur.invoices += 1; cur.revenue += inv.total; cur.profit += inv.profit ?? 0; m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  },
  async countInvoices(): Promise<number> {
    return (loadDB().invoices ?? []).length;
  },
  /* ---- صفحاتُ الفواتير والبحث بالخادم (0150) — مرآةُ invoice_matches ----
   * نفس التطبيع (searchable / phoneDigits / invoiceNo) على الطرفين. */
  async searchInvoices(s: InvoiceSearch): Promise<Invoice[]> {
    const rows = demoMatchingInvoices(s)
      .filter((i) => !s.since || i.created_at >= s.since)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const start = s.before ? rows.findIndex((i) => i.created_at < s.before! || (i.created_at === s.before && i.id < (s.beforeId ?? ""))) : 0;
    const from = start < 0 ? rows.length : start;
    return rows.slice(from, from + Math.min(Math.max(s.limit ?? 50, 1), 200));
  },
  async countInvoicesMatching(s: InvoiceSearch): Promise<number> {
    return demoMatchingInvoices(s).length;
  },
  async openDebts(): Promise<Invoice[]> {
    return (loadDB().invoices ?? [])
      .filter((i) => (i.status ?? "paid") !== "refunded" && dueOf(i) > 0.01)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async refundInvoice(invoiceId: string): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status !== "refunded") {
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) restockLocal(db, it);
      inv.status = "refunded";
      inv.refunded_at = new Date().toISOString();
      saveDB(db);
    }
    return inv;
  },
  async deleteInvoice(invoiceId: string): Promise<void> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    // Restock unless it was already refunded (which already restocked).
    if (inv && inv.status !== "refunded") {
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) restockLocal(db, it);
    }
    db.invoices = (db.invoices ?? []).filter((x) => x.id !== invoiceId);
    db.invoiceItems = (db.invoiceItems ?? []).filter((x) => x.invoice_id !== invoiceId);
    saveDB(db);
    // Mirror the server audit trigger so the demo's security log shows deletions.
    if (inv) demoAuditPush({ action: "DELETE", entity: "invoices", entity_id: invoiceId, details: inv as unknown as Record<string, unknown> });
  },
  /** Record a debt installment: add `amount` to what's been paid (never above the total),
   *  appending a payment leg. Once amount_paid reaches the total the sale is fully settled. */
  /* ---- تعديل أصناف فاتورة قائمة (0110) — للطلبات التي تُعدَّل بعد إصدارها،
   * وأشهر حالتها: زبون التوصيل يتصل بعد دقائق ليضيف صنفاً أو يغيّر كمية.
   *
   * القاعدة الحاكمة: **لا ينزلق مخزون ولا نقد**. لذلك التعديل يتم بعكس كامل
   * ثم إعادة خصم — لا بتعديل تفاضلي هشّ:
   *   ١) كل سطر قائم يُعاد للمخزون بنفس التقسيم الذي خرج به (حصّة القسم
   *      المشترك تعود للقسم، والباقي لرصيد المنتج) عبر restockLocal نفسها.
   *   ٢) تُحذف الأسطر القديمة وتُخصم الأسطر الجديدة بنفس منطق البيع تماماً
   *      (المخزون المعروف أولاً ثم مخزون القسم).
   *   ٣) المدفوع لا يُلمَس أبداً؛ يُعاد حساب الإجمالي والربح، ويُحدَّث المبلغ
   *      المطلوب من السواق = الإجمالي الجديد − المدفوع.
   * فاتورة مرتجعة لا تُعدَّل: سجلّها مغلق والطريق الصحيح إرجاعٌ جديد. ---- */
  async editInvoiceLines(invoiceId: string, lines: EditLine[], note?: string | null): Promise<Invoice> {
    const money2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = (lines ?? [])
      .map((l) => ({ ...l, qty: Math.round((Number(l.qty) || 0) * 1000) / 1000, unit_price: Math.max(0, Number(l.unit_price) || 0), unit_cost: Math.max(0, Number(l.unit_cost) || 0) }))
      .filter((l) => l.qty > 0);
    if (!clean.length) throw new Error("empty invoice");

    const oldTotal = Number(inv.total) || 0;
    const before = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
    // ١) العكس الكامل — نفس دالة الإرجاع حرفياً فلا يختلف حسابان للمخزون أبداً.
    for (const it of before) restockLocal(db, it);
    db.invoiceItems = (db.invoiceItems ?? []).filter((x) => x.invoice_id !== invoiceId);

    // ٢) إعادة الخصم بنفس منطق البيع (المعروف أولاً ثم القسم المشترك).
    const r3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    for (const i of clean) {
      const prev = i.id ? before.find((b) => b.id === i.id) : undefined;
      // سطر قائم بكمية معدّلة: نسبة المخزون تتبع الكمية (بيع الأجزاء).
      const perUnit = prev && prev.qty > 0 && prev.stock_qty != null ? prev.stock_qty / prev.qty : 1;
      // الواجهة تمرّر المسحوب صراحةً للأسطر الجديدة ببيع الأجزاء؛ وإلا نستنتجه
      // من نسبة السطر القديم — فلا ينزلق المخزون عند تغيير كمية حبّات.
      const stockQty = i.stock_qty != null ? r3(i.stock_qty) : r3(i.qty * perUnit);
      let fromPool = 0;
      if (i.product_id) {
        const p = (db.products ?? []).find((x) => x.id === i.product_id);
        if (p) {
          const avail = r3((p.stock || 0) + (p.section_id ? ((db.companySections ?? []).find((x) => x.id === p.section_id)?.pooled_stock ?? 0) : 0));
          if (stockQty > avail + 0.0005) throw new Error(`not enough stock: ${i.name}`);
          let rem = stockQty;
          const fromStock = Math.min(rem, Math.max(0, p.stock || 0));
          if (fromStock > 0) { p.stock = r3(p.stock - fromStock); rem -= fromStock; }
          if (rem > 0 && p.section_id) {
            const sec = (db.companySections ?? []).find((x) => x.id === p.section_id);
            const pool = sec?.pooled_stock ?? 0;
            if (sec && pool > 0) { fromPool = Math.min(rem, pool); sec.pooled_stock = r3(pool - fromPool); rem -= fromPool; }
          }
        }
      }
      db.invoiceItems.push({
        id: i.id && prev ? i.id : uid("ii"), invoice_id: invoiceId, product_id: i.product_id ?? null,
        name: i.name, barcode: i.barcode ?? null, qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost,
        line_total: r2(i.qty * i.unit_price), stock_qty: stockQty, pooled_qty: fromPool, unit_label: i.unit_label ?? null,
      });
    }

    // ٣) إعادة الحساب — الخصم ورسوم التوصيل كما هي، والمدفوع لا يُمَس.
    const subtotal = r2(clean.reduce((s, l) => s + l.qty * l.unit_price, 0));
    const cost = r2(clean.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    const discount = Math.max(0, Number(inv.discount) || 0);
    // أجرة التوصيل ليست عموداً بالفاتورة بل سطراً داخلها («أجرة توصيل»)، فهي
    // محسوبة ضمن المجموع الفرعي تلقائياً — ولا تُجمع مرتين.
    inv.subtotal = subtotal;
    inv.total = Math.max(0, r2(subtotal - discount));
    inv.cost_total = cost;
    inv.profit = r2(inv.total - cost);
    inv.item_count = clean.reduce((n, l) => n + l.qty, 0);
    const paid = inv.amount_paid != null ? inv.amount_paid : 0;
    // المدفوع أكبر من الإجمالي الجديد (نقص أصناف بعد الدفع) → يبقى كما هو
    // ويظهر كفائض للزبون؛ لا نتصرّف بنقد الزبون تلقائياً.
    const cod = Math.max(0, r2(inv.total - paid));
    // الطلب المستلم أو الراجع سجلٌّ مالي مغلق — لا يُعاد حساب مستحقّه.
    const ord = (db.deliveryOrders ?? []).find((o) => o.invoice_id === invoiceId && (o.status === "preparing" || o.status === "out"));
    if (ord) ord.cod_amount = cod;
    // أثر المراجعة: سجل الحركات يلتقط الفعل آلياً (DEMO_ACTIVITY_MAP / محفّزات
    // السيرفر)، وسببُ التعديل يُختم داخل الفاتورة نفسها فيبقى ملازماً لها
    // ويظهر بطباعتها — تعديل مالٍ بلا سبب مكتوب بابُ سرقة.
    const stamp = `تعديل ${new Date().toLocaleDateString("en-CA")}: ${before.length}→${clean.length} سطر · ${money2(oldTotal)} ← ${money2(inv.total)}${note ? ` · ${String(note).trim().slice(0, 120)}` : ""}`;
    inv.notes = inv.notes ? `${inv.notes}\n${stamp}` : stamp;
    saveDB(db);
    return inv;
  },
  /** المرتجع (0121): إرجاع أصنافٍ محددة بكمياتها — المخزون يرجع بنفس تقسيمه
   *  وقت البيع، الفاتورة يُعاد حسابها، والنقد الخارج فعلاً يُسجَّل سطراً
   *  سالباً (نفس آلية تصحيح التحصيل). إرجاع الكل = refund كامل بدلالاته. */
  async returnInvoiceItems(invoiceId: string, returns: { item_id: string; qty: number }[], method?: PaymentMethod | null, note?: string | null): Promise<Invoice> {
    const money2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const wanted = new Map((returns ?? []).filter((x) => x && x.qty > 0).map((x) => [x.item_id, r3(x.qty)]));
    if (!wanted.size) throw new Error("nothing to return");
    const items = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);

    // إرجاع كامل؟ ⇒ نفس دلالات refundInvoice: استرجاع الكل وقلب الحالة فقط.
    const full = items.length > 0 && items.every((it) => (wanted.get(it.id) ?? 0) + 0.0005 >= it.qty);
    if (full) {
      for (const it of items) restockLocal(db, it);
      inv.status = "refunded";
      inv.refunded_at = new Date().toISOString();
      saveDB(db);
      return inv;
    }

    for (const it of items) {
      const retQty = Math.min(wanted.get(it.id) ?? 0, it.qty);
      if (retQty <= 0) continue;
      // المخزون بنسب البيع نفسها: المسحوب لكل وحدة، وحصة القسم نسبية.
      if (it.product_id) {
        const per = it.qty > 0 && it.stock_qty != null ? it.stock_qty / it.qty : 1;
        const retStock = r3(retQty * per);
        let retPool = r3((it.pooled_qty ?? 0) * (retQty / it.qty));
        const p = (db.products ?? []).find((x) => x.id === it.product_id);
        if (p) {
          const sec = retPool > 0 && p.section_id ? (db.companySections ?? []).find((s) => s.id === p.section_id) : undefined;
          if (sec) sec.pooled_stock = r3((sec.pooled_stock ?? 0) + retPool);
          else retPool = 0;
          p.stock = r3(p.stock + (retStock - retPool));
        }
        if (retQty + 0.0005 >= it.qty) {
          db.invoiceItems = db.invoiceItems.filter((x) => x.id !== it.id);
        } else {
          it.qty = r3(it.qty - retQty);
          it.line_total = r2(it.qty * it.unit_price);
          if (it.stock_qty != null) it.stock_qty = r3(it.stock_qty - retStock);
          if (it.pooled_qty != null) it.pooled_qty = r3(it.pooled_qty - retPool);
        }
      } else if (retQty + 0.0005 >= it.qty) {
        db.invoiceItems = db.invoiceItems.filter((x) => x.id !== it.id);
      } else {
        it.qty = r3(it.qty - retQty);
        it.line_total = r2(it.qty * it.unit_price);
      }
    }

    // إعادة الحساب — الخصم الثابت يبقى كما هو.
    const left = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
    const subtotal = r2(left.reduce((s, l) => s + l.line_total, 0));
    const discount = Math.max(0, Number(inv.discount) || 0);
    const oldTotal = Number(inv.total) || 0;
    inv.subtotal = subtotal;
    inv.total = Math.max(0, r2(subtotal - discount));
    inv.cost_total = r2(left.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    inv.profit = r2(inv.total - inv.cost_total);
    inv.item_count = left.reduce((n, l) => n + l.qty, 0);

    // النقد الخارج فعلاً = المدفوع فوق الإجمالي الجديد. آجلة ⇒ الدين ينقص وحده.
    const paid = inv.amount_paid != null ? inv.amount_paid : inv.total;
    const back = Math.max(0, r2(paid - inv.total));
    if (back > 0) {
      const legs = [...(inv.payment_details ?? [])];
      const dominant = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
      const m = (method ?? dominant ?? inv.payment_method ?? "cash") as PaymentMethod;
      const posSum = r2(legs.filter((l) => l.amount > 0).reduce((s2, l) => s2 + l.amount, 0));
      if (posSum < paid) legs.push({ method: (inv.payment_method ?? m) as PaymentMethod, amount: r2(paid - posSum), at: inv.created_at });
      // ختم «مرتجع» بمهارب يونيكود: بياناتٌ تطابق ختم السيرفر حرفياً، لا نص واجهة.
      const label = "\u0645\u0631\u062A\u062C\u0639" + (note?.trim() ? `: ${note.trim().slice(0, 100)}` : "");
      legs.push({ method: m, amount: -back, at: new Date().toISOString(), note: label });
      inv.payment_details = legs;
      inv.amount_paid = Math.max(0, r2(paid - back));
      const pos = legs.filter((l) => l.amount > 0);
      if (pos.length) inv.payment_method = pos.reduce((b2, p2) => (p2.amount > b2.amount ? p2 : b2), pos[0]).method;
    }

    // «مرتجع … أُعيد نقداً …» بمهارب يونيكود — ختمٌ يطابق ختم دالّة السيرفر (0121).
    const RET_WORD = "\u0645\u0631\u062A\u062C\u0639";
    const BACK_WORDS = "\u0623\u064F\u0639\u064A\u062F \u0646\u0642\u062F\u0627\u064B";
    const stamp = `${RET_WORD} ${new Date().toLocaleDateString("en-CA")}: ${money2(oldTotal)} ← ${money2(inv.total)}${back > 0 ? ` · ${BACK_WORDS} ${money2(back)}` : ""}${note?.trim() ? ` · ${note.trim().slice(0, 120)}` : ""}`;
    inv.notes = inv.notes ? `${inv.notes}\n${stamp}` : stamp;
    saveDB(db);
    return inv;
  },
  async settleInvoice(invoiceId: string, amount: number, method: PaymentMethod = "cash"): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    // Match the server RPC's contract so demo and production behave identically.
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const paid = inv.amount_paid != null ? inv.amount_paid : inv.total;
    const add = Math.max(0, Math.min(Math.round((Number(amount) || 0) * 100) / 100, Math.round((inv.total - paid) * 100) / 100));
    if (add > 0) {
      inv.amount_paid = Math.round((paid + add) * 100) / 100;
      // Stamp the settlement with the collection time so the money reports date it on
      // the day it was actually received, not the original invoice day.
      const legs = [...(inv.payment_details ?? []), { method, amount: add, at: new Date().toISOString() }];
      inv.payment_details = legs;
      inv.payment_method = legs.reduce((b, p) => (p.amount > b.amount ? p : b), legs[0]).method;
      saveDB(db);
    }
    return inv;
  },
  async bumpInvoicePrints(invoiceId: string): Promise<number> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return 0;
    inv.print_count = (inv.print_count ?? 0) + 1;
    saveDB(db);
    return inv.print_count;
  },
  /** Correct a cashier's payment-method mistake on an existing invoice. Keeps a single
   *  settled leg in sync so print/analytics agree; refunded sales are locked. */
  async setInvoicePaymentMethod(invoiceId: string, method: PaymentMethod): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status === "refunded") throw new Error("invoice refunded");
    inv.payment_method = method;
    if (inv.payment_details && inv.payment_details.length === 1) {
      inv.payment_details = [{ ...inv.payment_details[0], method }];
    }
    saveDB(db);
    return inv;
  },
  /** Rewrite a split payment's legs (correct a mis-keyed method / re-allocate the
   *  breakdown). Only the method×amount split changes — the total collected
   *  (amount_paid) and the debt math are untouched; the caller guarantees the legs
   *  sum to what was already received. */
  async setInvoicePaymentDetails(invoiceId: string, legs: PaymentSplit[]): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = legs.filter((l) => l && l.method && Number(l.amount) > 0);
    if (clean.length) {
      // سطور التصحيح (السالبة) تُحفظ كما هي: إعادة توزيع السِّيَق تخصّ ما
      // وصل فعلاً، وإسقاطُ عكسٍ سابق هنا يعيد للفاتورة مالاً لم يصل.
      const fixes = (inv.payment_details ?? []).filter((l) => Number(l.amount) < 0);
      inv.payment_details = [...clean, ...fixes];
      inv.payment_method = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
      saveDB(db);
    }
    return inv;
  },
  /** تصحيح تحصيل (0113): مالٌ سُجّل واصلاً ولم يصل. الفاتورة لا تتغيّر —
   *  يُضاف سطر تحصيلٍ سالب فينزل المدفوع ويظهر الباقي ديناً تلقائياً.
   *  الحُرّاس هنا نسخة طبق الأصل من حُرّاس دالة الخادم: حارسٌ لا يوجد
   *  بالوضع التجريبي هو حارسٌ لم يُفحص. */
  async correctInvoiceReceipt(invoiceId: string, amount: number, reason: string, method?: PaymentMethod | null): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const who = (inv.customer_name ?? "").trim() || (inv.customer_phone ?? "").trim();
    if (!who) throw new Error("customer required");
    const cut = round2(Number(amount));
    if (!(cut > 0)) throw new Error("bad amount");
    if (cut > paidOf(inv)) throw new Error("above collected");

    const legs = [...(inv.payment_details ?? [])];
    const dominant = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
    const m = (method ?? dominant ?? inv.payment_method ?? "cash") as PaymentMethod;
    // البيعة البسيطة تُخزَّن بلا سِيَق، والتقارير تشتقّ منها ساقاً ضمنية ما
    // دامت المصفوفة فارغة. إضافةُ السالب فوق الفراغ تُسقط تلك الضمنية فيبقى
    // سالبٌ وحده. نُثبّت الأصل صراحةً أولاً ثم نعكس عليه.
    const posSum = round2(legs.filter((l) => l.amount > 0).reduce((s2, l) => s2 + l.amount, 0));
    const wasPaid = paidOf(inv);
    if (posSum < wasPaid) {
      legs.push({ method: (inv.payment_method ?? m) as PaymentMethod, amount: round2(wasPaid - posSum), at: inv.created_at });
    }
    // السبب اختياري — ويُكتَب مفتاحاً حين يوجد وحده (كما بدالّة الخادم).
    const why = (reason ?? "").trim();
    inv.payment_details = [...legs, { method: m, amount: -cut, at: new Date().toISOString(), ...(why ? { note: why } : {}) }];
    inv.amount_paid = Math.max(0, round2(wasPaid - cut));
    const pos = inv.payment_details.filter((l) => l.amount > 0);
    if (pos.length) inv.payment_method = pos.reduce((b, p) => (p.amount > b.amount ? p : b), pos[0]).method;
    saveDB(db);
    return inv;
  },
  /** Distinct walk-in customers seen on past invoices, most-recent first. */
  async searchCustomers(query: string, _clinicId?: string): Promise<Customer[]> {
    return dedupeCustomers(loadDB().invoices ?? [], query);
  },

  /* ---- Cash expenses / withdrawals ledger ---- */
  async listExpenses(_clinicId?: string, range?: DateRange): Promise<Expense[]> {
    return within(demoExpensesLoad(), "spent_at", range).sort((a, b) => b.spent_at.localeCompare(a.spent_at));
  },
  async addExpense(input: Omit<Expense, "id" | "created_at">): Promise<Expense> {
    return demoAddExpense(input);
  },
  async deleteExpense(id: string): Promise<void> {
    const before = demoExpensesLoad();
    const row = before.find((x) => x.id === id);
    demoExpensesSave(before.filter((x) => x.id !== id));
    if (row) demoAuditPush({ action: "DELETE", entity: "expenses", entity_id: id, details: row as unknown as Record<string, unknown> });
  },

  /* ---- الرواتب (0112) — الوضع التجريبي يفرض حُرّاس الخادم نفسها ---- */
  async getPayrollPolicy(): Promise<PayrollPolicyDTO> { return PD.getPolicy(); },
  async setPayrollPolicy(p: PayrollPolicyDTO): Promise<PayrollPolicyDTO> { return PD.setPolicy(p); },
  async listStaffComp(): Promise<StaffComp[]> { return PD.listComp(); },
  async setStaffComp(staffId: string, from: string, base: number, note?: string | null): Promise<StaffComp> {
    return PD.setComp(staffId, from, base, note);
  },
  async deleteStaffComp(id: string): Promise<void> { PD.deleteComp(id); },
  async listStaffRecurring(): Promise<StaffRecurring[]> { return PD.listRecurring(); },
  async addStaffRecurring(staffId: string, code: string, amount: number, note?: string | null): Promise<StaffRecurring> {
    return PD.addRecurring(staffId, code, amount, note);
  },
  async deleteStaffRecurring(id: string): Promise<void> { PD.deleteRecurring(id); },
  async listPayrollAdjustments(period?: string): Promise<PayrollAdjustment[]> { return PD.listAdjustments(period); },
  async addPayrollAdjustment(staffId: string, period: string, code: string, amount?: number | null, qty?: number | null, reason?: string | null): Promise<PayrollAdjustment> {
    return PD.addAdjustment(staffId, period, code, amount, qty, reason);
  },
  async deletePayrollAdjustment(id: string): Promise<void> { PD.deleteAdjustment(id); },
  async reversePayrollAdjustment(id: string, amount?: number | null, qty?: number | null, reason?: string | null): Promise<PayrollAdjustment> {
    return PD.reverseAdjustment(id, amount, qty, reason);
  },
  async unpayPayslip(slipId: string): Promise<Payslip> {
    return PD.unpaySlip(slipId, async (id) => { await this.deleteExpense(id); });
  },
  async listPayrollRuns(): Promise<PayrollRun[]> { return PD.listRuns(); },
  async openPayrollRun(period: string): Promise<PayrollRun> { return PD.openRun(period); },
  async savePayrollSlips(runId: string, slips: PayslipDraft[]): Promise<{ run: string; payslips: number }> {
    return PD.saveSlips(runId, slips);
  },
  async listPayslips(runId?: string): Promise<Payslip[]> { return PD.listSlips(runId); },
  async listPayslipLines(payslipIds?: string[]): Promise<PayslipLine[]> { return PD.listLines(payslipIds); },
  async approvePayrollRun(runId: string): Promise<PayrollRun> { return PD.approveRun(runId); },
  async unapprovePayrollRun(runId: string): Promise<PayrollRun> { return PD.unapproveRun(runId); },
  async payPayslip(slipId: string, method: PayMethod): Promise<Payslip> {
    return PD.paySlip(slipId, method, async (e) => demoAddExpense(e));
  },
  async closePayrollRun(runId: string): Promise<PayrollRun> { return PD.closeRun(runId); },
  async listStaffLoans(): Promise<StaffLoan[]> { return PD.listLoans(); },
  async listLoanEvents(loanId?: string): Promise<StaffLoanEvent[]> { return PD.listLoanEvents(loanId); },
  async disburseLoan(staffId: string, staffName: string, principal: number, installment: number, reason: string | null, method: PayMethod): Promise<StaffLoan> {
    return PD.disburseLoan(staffId, staffName, principal, installment, reason, method, async (e) => demoAddExpense(e));
  },
  /** سحبٌ على حساب الشهر: سلفةٌ قسطُها أصلُها، تُقطع كاملةً بأقرب قسيمة (0140). */
  async disburseAdvance(staffId: string, staffName: string, amount: number, reason: string | null, method: PayMethod): Promise<StaffLoan> {
    return PD.disburseLoan(staffId, staffName, amount, amount, reason, method, async (e) => demoAddExpense(e), "advance");
  },
  async writeOffLoan(loanId: string, note: string): Promise<StaffLoan> { return PD.writeOffLoan(loanId, note); },

  /** Log a WhatsApp message send (campaign history / "last contacted"). */
  async logWhatsApp(input: { pet_id?: string | null; owner_name?: string | null; owner_phone?: string | null; reminder_type?: string | null }): Promise<void> {
    const db = loadDB();
    if (!db.waMessages) db.waMessages = [];
    db.waMessages.push({ ...input, id: uid("wa"), sent_at: new Date().toISOString() });
    saveDB(db);
  },
  /** The clinic's WhatsApp send history, newest first. */
  async listWhatsAppLog(): Promise<WhatsAppMessage[]> {
    return (loadDB().waMessages ?? []).slice().sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  },
  async listAuditLog(_clinicId?: string, limit = 200): Promise<AuditEntry[]> {
    return demoAuditLoad().slice(0, limit);
  },
  /** Record a client-side action (print / export) in the activity log. Best-effort. */
  async logClientEvent(event: string, details?: Record<string, unknown>): Promise<void> {
    demoAuditPush({ action: "CLIENT", entity: "client", entity_id: null, details: { ...(details ?? {}), event } });
  },
  /** قياسُ صيغ المسح (0213) — التجريبيُّ لا يرسل شيئاً: القياسُ عن ماسحات العيادات الحقيقية. */
  async noteScanShapes(_day: string, _counts: Record<string, number>, _samples: string[], _clinicId: string): Promise<void> {},
  /* ---- مركزُ الحركات (0152) — مرآةُ activity_summary/page/actors ----
   * نفسُ التصنيف (auditKind) ونفسُ المختصر (activityBrief) ونفسُ المؤشّر. */
  async activitySummary(from: string, to: string, bucket: "day" | "hour"): Promise<ActivitySummaryRow[]> {
    const m = new Map<string, number>();
    for (const r of demoActivityRows(from, to)) {
      const d = new Date(r.created_at);
      if (bucket === "hour") d.setMinutes(0, 0, 0); else d.setHours(0, 0, 0, 0);
      const k = `${d.toISOString()}|${r.kind}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => { const [bucketAt, kind] = k.split("|"); return { bucket: bucketAt, kind, n }; })
      .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.kind.localeCompare(b.kind));
  },
  /** مرآةُ `product_movements` (0207). **منطقُها بوحدةٍ تُحمَّل عند النداء**:
   *  `repo.ts` على مسار الإقلاع الحرج، وكلُّ سطرٍ يُضاف هنا يدفعه كلُّ فتحِ
   *  تطبيقٍ بكلّ عيادة — وهذا كشفه `store-weight-guard` بـ٢٩٥ بايتاً. */
  /** مرآةُ `product_sales_rate` (0215): صافي المبيع بآخر `days` (٧..١٨٠)، لا ينزل تحت صفر. */
  async productSalesRate(days = 30): Promise<Map<string, number>> {
    const d = Math.min(180, Math.max(7, Math.round(days) || 30));
    const since = Date.now() - d * 86400000;
    const sum = new Map<string, number>();
    const db = loadDB();
    // تاريخُ السطر تاريخُ فاتورته (السطرُ بالتجريبيّ بلا ختمٍ خاصّ — 0133 تعبّئه بالخادم منها).
    const invAt = new Map((db.invoices ?? []).map((i) => [i.id, new Date(i.created_at).getTime()]));
    for (const it of db.invoiceItems ?? []) {
      if (!it.product_id) continue;
      const at = invAt.get(it.invoice_id) ?? 0;
      if (!(at >= since)) continue;
      sum.set(it.product_id, (sum.get(it.product_id) ?? 0) + (Number(it.qty) || 0));
    }
    for (const [k, v] of sum) sum.set(k, Math.max(0, v));
    return sum;
  },
  /* ---- الجردُ الدوريّ (0216) — مرآةٌ بوحدةٍ تُحمَّل عند النداء (`demoCounts.ts`) ---- */
  async submitStockCount(lines: CountLineInput[]): Promise<CountSubmitResult> {
    return (await import("./demoCounts")).demoSubmitCount(lines);
  },
  async decideStockCounts(ids: string[], approve: boolean): Promise<CountDecision> {
    return (await import("./demoCounts")).demoDecideCounts(ids, approve, demoAddExpense);
  },
  async listStockCounts(q: { pending: true } | { from: string; to: string }): Promise<StockCount[]> {
    const all = (await import("./demoCounts")).loadCounts();
    if ("pending" in q) return all.filter((c) => c.status === "pending").sort((a, b) => b.counted_at.localeCompare(a.counted_at));
    const lo = new Date(q.from).getTime(), hi = new Date(q.to).getTime();
    return all.filter((c) => c.status === "approved" && c.decided_at && new Date(c.decided_at).getTime() >= lo && new Date(c.decided_at).getTime() < hi)
      .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  },
  async listProductCounts(productId: string): Promise<StockCount[]> {
    return (await import("./demoCounts")).loadCounts().filter((c) => c.product_id === productId && c.status === "approved").slice(0, 200);
  },
  async reportStockLosses(from: string, to: string): Promise<StockLossRow[]> {
    return (await import("./demoCounts")).demoStockLosses(from, to);
  },
  async stockCountState(): Promise<Map<string, { lastCountedAt: string | null; lastDiffAt: string | null }>> {
    return (await import("./demoCounts")).demoCountState();
  },
  /** مرآةُ `product_batches` (0214): وجباتُ المادّة بتواريخها، الأحدثُ أوّلاً. */
  async productBatches(productId: string): Promise<ProductBatch[]> {
    const db = loadDB();
    const pur = new Map((db.purchases ?? []).map((p) => [p.id, p]));
    return (db.purchaseItems ?? []).filter((it) => it.product_id === productId)
      .map((it) => {
        const p = pur.get(it.purchase_id);
        return { purchase_id: it.purchase_id, purchased_at: p?.purchased_at ?? it.created_at, qty: it.qty, expiry_date: it.expiry_date ?? null, company_name: p?.company_name ?? null };
      })
      .sort((a, b) => (b.purchased_at ?? "").localeCompare(a.purchased_at ?? ""))
      .slice(0, 200);
  },
  async productMovements(productId: string): Promise<ProductMovement[]> {
    const { demoProductMovements } = await import("./demoMovements");
    return demoProductMovements(loadDB(), demoAuditLoad(), productId);
  },
  async activityPage(s: ActivityQuery): Promise<ActivityRow[]> {
    const nq = searchable(s.q ?? "");
    const rows = demoActivityRows(s.from, s.to)
      .filter((r) => (!s.kinds || s.kinds.includes(r.kind)) && (!s.actor || r.actor === s.actor)
        && (!nq || searchable(JSON.stringify(r.brief ?? {})).includes(nq) || searchable(r.actor_name ?? "").includes(nq)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.src.localeCompare(a.src) || String(b.id).localeCompare(String(a.id)));
    const start = s.before
      ? rows.findIndex((r) => r.created_at < s.before! || (r.created_at === s.before && (r.src < (s.beforeSrc ?? "z") || (r.src === s.beforeSrc && String(r.id) < String(s.beforeId ?? "")))))
      : 0;
    const from = start < 0 ? rows.length : start;
    return rows.slice(from, from + Math.min(Math.max(s.limit ?? 50, 1), 200));
  },
  async activityActors(from: string, to: string): Promise<ActivityActor[]> {
    const m = new Map<string, ActivityActor>();
    for (const r of demoActivityRows(from, to)) {
      if (!r.actor && !r.actor_name) continue;
      const key = r.actor ?? r.actor_name!;
      const cur = m.get(key) ?? { actor: key, name: r.actor_name ?? key, n: 0 };
      cur.n += 1; m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  },
  async listLoginEvents(_clinicId?: string, limit = 100): Promise<LoginEvent[]> {
    return demoLoginLoad().slice(0, limit);
  },
  async logLogin(input: { email?: string | null; name?: string | null }): Promise<void> {
    const e: LoginEvent = { id: uid("lg"), clinic_id: null, user_id: null, email: input.email ?? null, name: input.name ?? null, created_at: new Date().toISOString() };
    demoLoginSave([e, ...demoLoginLoad()].slice(0, 100));
  },
};

/* Demo-only activity mirror: on Supabase, DB triggers (migrations 0018 + 0044)
 * record every INSERT/UPDATE/DELETE automatically. In demo mode we wrap the
 * mutating repo methods ONCE so the clinic activity log fills up identically —
 * offline and testable. Logging failures never break the real operation. */
const DEMO_ACTIVITY_MAP: Record<string, { entity: string; action: "INSERT" | "UPDATE" | "DELETE" }> = {
  createPet: { entity: "pets", action: "INSERT" },
  updatePet: { entity: "pets", action: "UPDATE" },
  deletePet: { entity: "pets", action: "DELETE" },
  addWeight: { entity: "weight_logs", action: "INSERT" },
  addVaccination: { entity: "vaccinations", action: "INSERT" },
  addVisit: { entity: "medical_visits", action: "INSERT" },
  addPetNote: { entity: "pet_notes", action: "INSERT" },
  addLabResult: { entity: "lab_results", action: "INSERT" },
  deleteLabResult: { entity: "lab_results", action: "DELETE" },
  advanceLabStatus: { entity: "lab_results", action: "UPDATE" },
  createDeviceLink: { entity: "lab_device_links", action: "INSERT" },
  createJourney: { entity: "journeys", action: "INSERT" },
  advanceJourney: { entity: "journeys", action: "UPDATE" },
  addJourneyNote: { entity: "journey_events", action: "INSERT" },
  closeJourney: { entity: "journeys", action: "UPDATE" },
  revokeDeviceLink: { entity: "lab_device_links", action: "UPDATE" },
  addCareEntry: { entity: "care_entries", action: "INSERT" },
  deleteCareEntry: { entity: "care_entries", action: "DELETE" },
  addProblem: { entity: "pet_problems", action: "INSERT" },
  updateProblem: { entity: "pet_problems", action: "UPDATE" },
  addFeatureRequest: { entity: "feature_requests", action: "INSERT" },
  updateFeatureRequest: { entity: "feature_requests", action: "UPDATE" },
  addGeneratedBarcodes: { entity: "generated_barcodes", action: "INSERT" },
  updateGeneratedBarcode: { entity: "generated_barcodes", action: "UPDATE" },
  saveStoreProfile: { entity: "store_profiles", action: "UPDATE" },
  updateStoreOrder: { entity: "store_orders", action: "UPDATE" },
  acceptStoreOrder: { entity: "store_orders", action: "UPDATE" },
  rejectStaleStoreOrders: { entity: "store_orders", action: "UPDATE" },
  placeStoreOrder: { entity: "store_orders", action: "INSERT" },
  deleteProblem: { entity: "pet_problems", action: "DELETE" },
  addClinicVisit: { entity: "clinic_visits", action: "INSERT" },
  updateClinicVisit: { entity: "clinic_visits", action: "UPDATE" },
  addExpense: { entity: "expenses", action: "INSERT" },
  setStaffComp: { entity: "staff_comp", action: "INSERT" },
  deleteStaffComp: { entity: "staff_comp", action: "DELETE" },
  openPayrollRun: { entity: "payroll_runs", action: "INSERT" },
  savePayrollSlips: { entity: "payslips", action: "INSERT" },
  approvePayrollRun: { entity: "payroll_runs", action: "UPDATE" },
  unapprovePayrollRun: { entity: "payroll_runs", action: "UPDATE" },
  payPayslip: { entity: "payslips", action: "UPDATE" },
  unpayPayslip: { entity: "payslips", action: "UPDATE" },
  addPayrollAdjustment: { entity: "payroll_adjustments", action: "INSERT" },
  deletePayrollAdjustment: { entity: "payroll_adjustments", action: "DELETE" },
  reversePayrollAdjustment: { entity: "payroll_adjustments", action: "UPDATE" },
  closePayrollRun: { entity: "payroll_runs", action: "UPDATE" },
  disburseLoan: { entity: "staff_loans", action: "INSERT" },
  disburseAdvance: { entity: "staff_loans", action: "INSERT" },
  attachProductCode: { entity: "products", action: "UPDATE" },
  mergeProducts: { entity: "products", action: "UPDATE" },
  writeOffLoan: { entity: "staff_loans", action: "UPDATE" },
  setPayrollPolicy: { entity: "payroll_settings", action: "UPDATE" },
  addMedia: { entity: "media_items", action: "INSERT" },
  addTreatment: { entity: "treatment_entries", action: "INSERT" },
  addTreatments: { entity: "treatment_entries", action: "INSERT" },
  setTreatmentGiven: { entity: "treatment_entries", action: "UPDATE" },
  setTreatmentResult: { entity: "treatment_entries", action: "UPDATE" },
  updateTreatment: { entity: "treatment_entries", action: "UPDATE" },
  setTreatmentMissed: { entity: "treatment_entries", action: "UPDATE" },
  deleteTreatment: { entity: "treatment_entries", action: "DELETE" },
  addAdmission: { entity: "admissions", action: "INSERT" },
  addSurgery: { entity: "surgeries", action: "INSERT" },
  updateSurgery: { entity: "surgeries", action: "UPDATE" },
  deleteSurgery: { entity: "surgeries", action: "DELETE" },
  updateAdmission: { entity: "admissions", action: "UPDATE" },
  createBranch: { entity: "branches", action: "INSERT" },
  addReminder: { entity: "reminders", action: "INSERT" },
  createProduct: { entity: "products", action: "INSERT" },
  updateProduct: { entity: "products", action: "UPDATE" },
  deleteProduct: { entity: "products", action: "DELETE" },
  restoreProduct: { entity: "products", action: "INSERT" },
  createCompany: { entity: "companies", action: "INSERT" },
  ensureCompany: { entity: "companies", action: "INSERT" },
  ensureCompanySection: { entity: "company_sections", action: "INSERT" },
  updateCompany: { entity: "companies", action: "UPDATE" },
  deleteCompany: { entity: "companies", action: "DELETE" },
  createCompanySection: { entity: "company_sections", action: "INSERT" },
  updateCompanySection: { entity: "company_sections", action: "UPDATE" },
  deleteCompanySection: { entity: "company_sections", action: "DELETE" },
  mergeCompanies: { entity: "companies", action: "DELETE" },
  mergeCompanySections: { entity: "company_sections", action: "DELETE" },
  restoreCompany: { entity: "companies", action: "INSERT" },
  restoreCompanySection: { entity: "company_sections", action: "INSERT" },
  recordPurchase: { entity: "purchases", action: "INSERT" },
  updatePurchase: { entity: "purchases", action: "UPDATE" },
  createCourier: { entity: "couriers", action: "INSERT" },
  updateCourier: { entity: "couriers", action: "UPDATE" },
  createDeliveryOrder: { entity: "delivery_orders", action: "INSERT" },
  updateDeliveryOrder: { entity: "delivery_orders", action: "UPDATE" },
  settleCourier: { entity: "courier_settlements", action: "INSERT" },
  unsettleCourier: { entity: "courier_settlements", action: "UPDATE" },
  checkout: { entity: "invoices", action: "INSERT" },
  retailCheckout: { entity: "invoices", action: "INSERT" },
  retailReturn: { entity: "expenses", action: "INSERT" },
  settleInvoice: { entity: "invoices", action: "UPDATE" },
  correctInvoiceReceipt: { entity: "invoices", action: "UPDATE" },
  editInvoiceLines: { entity: "invoices", action: "UPDATE" },
  returnInvoiceItems: { entity: "invoices", action: "UPDATE" },
  refundInvoice: { entity: "invoices", action: "UPDATE" },
  setInvoicePaymentMethod: { entity: "invoices", action: "UPDATE" },
  setInvoicePaymentDetails: { entity: "invoices", action: "UPDATE" },
  uploadMedia: { entity: "media_items", action: "INSERT" },
  updateVaccination: { entity: "vaccinations", action: "UPDATE" },
  createAppointment: { entity: "appointments", action: "INSERT" },
  updateAppointment: { entity: "appointments", action: "UPDATE" },
  setAppointmentStatus: { entity: "appointments", action: "UPDATE" },
  updateReminder: { entity: "reminders", action: "UPDATE" },
  removeReminder: { entity: "reminders", action: "DELETE" },
  updateBranch: { entity: "branches", action: "UPDATE" },
  logWhatsApp: { entity: "wa_messages", action: "INSERT" },
  settlePurchase: { entity: "purchases", action: "UPDATE" },
};
{
  const target = demoRepo as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [method, meta] of Object.entries(DEMO_ACTIVITY_MAP)) {
    const orig = target[method];
    if (typeof orig !== "function") continue;
    target[method] = async (...args: unknown[]) => {
      /* «كان ← صار» كالمحفّز (0139): تحديثٌ بمعرّفٍ يُصوَّر صفُّه قبلَه فيُحفظ ما تغيّر وحدَه.
       * بلاه كان التجريبيُّ يسمّي كلَّ تعديلٍ «تعديل منتج» — الكتمُ والمخزونُ سواء. */
      const tbl = meta.action === "UPDATE" && typeof args[0] === "string" ? (loadDB() as unknown as Record<string, unknown>)[meta.entity] : null;
      const before = Array.isArray(tbl) ? { ...(tbl.find((x: { id?: unknown }) => x.id === args[0]) ?? {}) } as Record<string, unknown> : null;
      const res = await orig.apply(demoRepo, args);
      try {
        const row = (res && typeof res === "object" ? res : (typeof args[0] === "object" && args[0] !== null ? args[0] : undefined)) as Record<string, unknown> | undefined;
        const entityId = (row && typeof row.id === "string" ? row.id : undefined) ?? (typeof args[0] === "string" ? args[0] : null);
        const changed = before && row ? Object.fromEntries(Object.keys(row).filter((k) => JSON.stringify(row[k] ?? null) !== JSON.stringify(before[k] ?? null)).map((k) => [k, [before[k] ?? null, row[k] ?? null]])) : null;
        demoAuditPush({ action: meta.action, entity: meta.entity, entity_id: entityId, details: row ? (changed && Object.keys(changed).length ? { ...row, __changed: changed } : row) : null });
        // Checkout also logs each sold LINE — mirroring the invoice_items trigger.
        if ((method === "checkout" || method === "retailCheckout") && Array.isArray(args[0])) {
          for (const it of args[0] as Array<Record<string, unknown>>) {
            const qty = Number(it.qty) || 0; const price = Number(it.unit_price) || 0;
            demoAuditPush({ action: "INSERT", entity: "invoice_items", entity_id: null, details: { ...it, line_total: Math.round(qty * price * 100) / 100 } });
          }
        }
      } catch { /* the log must never break the operation itself */ }
      return res;
    };
  }
}


export { demoRepo };
export type DemoRepo = typeof demoRepo;
