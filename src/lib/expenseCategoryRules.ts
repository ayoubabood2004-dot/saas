/* ============================================================================
 * تصنيفاتُ السحوبات (0227) — القاعدةُ الواحدة التي تقرؤها الشاشةُ والمرآةُ التجريبية.
 *
 * العضويةُ مصدرُها واحد: `expenses.category_id`. لا مطابقةَ نصٍّ وقتَ القراءة ولا
 * أسماءَ بديلة — سحبٌ نصُّه «ايجار» بلا معرّف يُرى بجدول «بدون تصنيف» لا بجدول
 * «إيجار»، وإلا صار للجدول حقيقتان وأوّلُ تقريرٍ يقرأ إحداهما يُسقط الأخرى.
 * والاستثناءُ الوحيد ما يكتبه النظامُ بنفسه (مرتجع، رواتب، سلف، سحب مخزن): نصٌّ
 * ثابتٌ بلا معرّف، فجدولُه تلقائيّ بمفتاح نصّه — **بنفس تطبيع القاعدة** (`groupKey`
 * مرآةُ `inv_norm_group`) لأن الهجرةَ حكمت بهذا التطبيع أنّ «Payroll » ليس تصنيفاً.
 *
 * مرآةُ `_expense_reserved_keys()` وتلميحاتِ `expense_categories_guard` حرفاً بحرف؛
 * يحرس تطابقَهما `scripts/withdrawals-contract.mjs`. ولا `t()` هنا: الوحدةُ تُحمَّل مع
 * repoDemo قبل القاموس البارد — الترجمةُ بالشاشة.
 * ==========================================================================*/
import type { Expense, ExpenseCategory } from "@/types";
import { groupKey, normGroupName } from "./utils";

export const EXPENSE_CATEGORY_MAX_LEN = 40;
export const EXPENSE_CATEGORIES_CAP = 60;

/** ما يكتبه النظامُ بنفسه — نصوصُه الثابتة كما بالقاعدة (0112، 0136، 0140، 0217). */
export const SYSTEM_EXPENSE_TEXT = {
  returns: "\u0645\u0631\u062a\u062c\u0639",               // مرتجع — retail_return
  payroll: "payroll",                                        // payroll_pay_slip / payroll_disburse_advance
  payroll_loan: "payroll_loan",                              // payroll_disburse_loan
  stock: "\u0633\u062d\u0628 \u0645\u062e\u0632\u0646",     // سحب مخزن — stock_count_decide (method = stock)
} as const;
export type SystemTableId = keyof typeof SYSTEM_EXPENSE_TEXT;
export const SYSTEM_TABLE_ORDER: SystemTableId[] = ["returns", "payroll", "payroll_loan", "stock"];

/** «بدون تصنيف» — اسمٌ محجوز كي لا يصنع أحدٌ تصنيفاً يلبس ثوبَ الجدول التلقائيّ. */
export const NO_CATEGORY_TEXT = "\u0628\u062f\u0648\u0646 \u062a\u0635\u0646\u064a\u0641";

/** مرآةُ `_expense_reserved_keys()` بنصّها الخامّ — بنفس الترتيب. */
export const RESERVED_RAW: string[] = [
  SYSTEM_EXPENSE_TEXT.returns, SYSTEM_EXPENSE_TEXT.stock, SYSTEM_EXPENSE_TEXT.payroll,
  SYSTEM_EXPENSE_TEXT.payroll_loan, NO_CATEGORY_TEXT,
];

export type ExpenseCategoryProblem =
  | "expense_category_bad_name"
  | "expense_category_reserved"
  | "expense_category_twin"
  | "expense_categories_full";

/** تلميحاتُ الخادم كما يرفعها `expense_categories_guard` — المرآةُ ترفع نفسَها حرفاً.
 *  بياناتٌ مهرَّبة (كـ`RETURN_CATEGORY`) لا نصٌّ يُترجم: الشاشةُ تعرض `wdr.err.*`، وهذه
 *  للمرآة التجريبية وحدها؛ ونصُّها المقروء بالتعليق فوق كلٍّ منها. */
export const EXPENSE_CATEGORY_HINTS: Record<ExpenseCategoryProblem | "expense_category_clinic_frozen", string> = {
  // اسم التصنيف لازم بين حرف و٤٠ حرفاً
  expense_category_bad_name: "\u0627\u0633\u0645 \u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u0644\u0627\u0632\u0645 \u0628\u064a\u0646 \u062d\u0631\u0641 \u0648\u0664\u0660 \u062d\u0631\u0641\u0627\u064b",
  // هذا اسمٌ يكتبه النظام بنفسه (مرتجع، رواتب، سلف، سحب مخزن، بدون تصنيف) — اختر اسماً ثانياً
  expense_category_reserved: "\u0647\u0630\u0627 \u0627\u0633\u0645\u064c \u064a\u0643\u062a\u0628\u0647 \u0627\u0644\u0646\u0638\u0627\u0645 \u0628\u0646\u0641\u0633\u0647 (\u0645\u0631\u062a\u062c\u0639\u060c \u0631\u0648\u0627\u062a\u0628\u060c \u0633\u0644\u0641\u060c \u0633\u062d\u0628 \u0645\u062e\u0632\u0646\u060c \u0628\u062f\u0648\u0646 \u062a\u0635\u0646\u064a\u0641) \u2014 \u0627\u062e\u062a\u0631 \u0627\u0633\u0645\u0627\u064b \u062b\u0627\u0646\u064a\u0627\u064b",
  // أكو تصنيف بنفس الاسم (يمكن مؤرشف) — استعمله أو رجّعه من المؤرشفة
  expense_category_twin: "\u0623\u0643\u0648 \u062a\u0635\u0646\u064a\u0641 \u0628\u0646\u0641\u0633 \u0627\u0644\u0627\u0633\u0645 (\u064a\u0645\u0643\u0646 \u0645\u0624\u0631\u0634\u0641) \u2014 \u0627\u0633\u062a\u0639\u0645\u0644\u0647 \u0623\u0648 \u0631\u062c\u0651\u0639\u0647 \u0645\u0646 \u0627\u0644\u0645\u0624\u0631\u0634\u0641\u0629",
  // وصلتوا ٦٠ تصنيفاً فعّالاً — أرشفوا ما لا تستعملونه
  expense_categories_full: "\u0648\u0635\u0644\u062a\u0648\u0627 \u0666\u0660 \u062a\u0635\u0646\u064a\u0641\u0627\u064b \u0641\u0639\u0651\u0627\u0644\u0627\u064b \u2014 \u0623\u0631\u0634\u0641\u0648\u0627 \u0645\u0627 \u0644\u0627 \u062a\u0633\u062a\u0639\u0645\u0644\u0648\u0646\u0647",
  // التصنيف يبقى بعيادته
  expense_category_clinic_frozen: "\u0627\u0644\u062a\u0635\u0646\u064a\u0641 \u064a\u0628\u0642\u0649 \u0628\u0639\u064a\u0627\u062f\u062a\u0647",
};

/** الاسمُ كما يُحفظ: بلا محارف اتجاهٍ خفية، والمسافاتُ مطويّة (الخادمُ يطويها أيضاً). */
export const cleanCategoryName = (s: string | null | undefined): string => normGroupName(s);

const reservedKeys = (): string[] => RESERVED_RAW.map((r) => groupKey(r));

export function isReservedCategoryName(name: string | null | undefined): boolean {
  const k = groupKey(name);
  return k !== "" && reservedKeys().includes(k);
}

const activeCount = (existing: readonly Pick<ExpenseCategory, "archived_at">[]) =>
  existing.filter((c) => !c.archived_at).length;

/**
 * مرآةُ الحارس بترتيبه: الاسمُ أوّلاً، ثم — إن كان تعديلاً لا يغيّر مفتاحَ الاسم — لا شيء،
 * ثم المحجوز، ثم التوأم (والمؤرشفُ محسوب: اسمُه محجوزٌ لعيادته)، ثم السقف عند الإضافة
 * (على الفعّالة وحدها — الأرشفةُ تُفرغ مكاناً كما يقول التلميح).
 * `selfId` = تسميةٌ لتصنيفٍ قائم. يرجع رمزَ الرفض أو null.
 */
export function categoryNameProblem(
  name: string,
  existing: readonly Pick<ExpenseCategory, "id" | "name" | "archived_at">[],
  selfId?: string,
): ExpenseCategoryProblem | null {
  const clean = cleanCategoryName(name);
  const key = groupKey(clean);
  if (key === "" || clean.length > EXPENSE_CATEGORY_MAX_LEN) return "expense_category_bad_name";
  if (selfId) {
    const self = existing.find((c) => c.id === selfId);
    if (self && groupKey(self.name) === key) return null;
  }
  if (reservedKeys().includes(key)) return "expense_category_reserved";
  if (existing.some((c) => c.id !== selfId && groupKey(c.name) === key)) return "expense_category_twin";
  if (!selfId && activeCount(existing) >= EXPENSE_CATEGORIES_CAP) return "expense_categories_full";
  return null;
}

/** الاسترجاعُ يُفحص كالإضافة: مؤرشفٌ يعود فوق الستّين الفعّالة يُرفض (مرآةُ الحارس). */
export function restoreProblem(existing: readonly Pick<ExpenseCategory, "archived_at">[]): ExpenseCategoryProblem | null {
  return activeCount(existing) >= EXPENSE_CATEGORIES_CAP ? "expense_categories_full" : null;
}

/** أين يقع السحب: تصنيفُه بمعرّفه، أو جدولُ النظام بنصّه الثابت، أو «بدون تصنيف». */
export type WithdrawalBucket =
  | { kind: "cat"; id: string }
  | { kind: "system"; id: SystemTableId }
  | { kind: "none" };

export function bucketOf(e: Pick<Expense, "category" | "category_id" | "method">): WithdrawalBucket {
  if (e.category_id) return { kind: "cat", id: e.category_id };
  // سحبُ المخزن بطريقته لا بنصّه: الطريقةُ «stock» لا يكتبها إلا موافقةُ الجرد.
  if (e.method === "stock") return { kind: "system", id: "stock" };
  const k = groupKey(e.category);
  if (k) {
    for (const id of SYSTEM_TABLE_ORDER) if (groupKey(SYSTEM_EXPENSE_TEXT[id]) === k) return { kind: "system", id };
  }
  return { kind: "none" };
}

export interface WithdrawalTable {
  /** مفتاحٌ ثابت للرسم: `cat:<id>` / `sys:<id>` / `none`. */
  key: string;
  bucket: WithdrawalBucket;
  /** التصنيفُ نفسُه (للجدول `cat`) — undefined لمعرّفٍ لا تعرفه القائمة. */
  category?: ExpenseCategory;
  rows: Expense[];
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const byNewest = (a: Expense, b: Expense) =>
  (b.spent_at || "").localeCompare(a.spent_at || "") || (b.created_at || "").localeCompare(a.created_at || "");

/**
 * الجداول: تصنيفاتُ العيادة بترتيب إنشائها (ومؤرشفٌ له سحوبٌ بالمدّة يبقى جدولُه)، ثم
 * «بدون تصنيف»، ثم جداولُ النظام. كلُّ سحبٍ بجدولٍ واحدٍ بالضبط — مجموعُ الجداول =
 * مجموعُ السحوبات (يفحصه withdrawals-contract). ومعرّفٌ لا تعرفه القائمة (لا يحدث
 * بالقاعدة: المفتاحُ يمنعه) يُعرض جدولاً باسمه المكتوب ولا يُرمى صفُّه.
 * `idle` = تصنيفاتٌ فعّالة بلا سحبٍ بالمدّة — تُذكر بسطرٍ لا بجداولَ فارغة.
 */
export function groupWithdrawals(
  rows: readonly Expense[],
  categories: readonly ExpenseCategory[],
): { tables: WithdrawalTable[]; idle: ExpenseCategory[] } {
  const byCat = new Map<string, Expense[]>();
  const bySys = new Map<SystemTableId, Expense[]>();
  const none: Expense[] = [];
  for (const e of rows) {
    const b = bucketOf(e);
    if (b.kind === "cat") (byCat.get(b.id) ?? byCat.set(b.id, []).get(b.id)!).push(e);
    else if (b.kind === "system") (bySys.get(b.id) ?? bySys.set(b.id, []).get(b.id)!).push(e);
    else none.push(e);
  }
  const make = (key: string, bucket: WithdrawalBucket, list: Expense[], category?: ExpenseCategory): WithdrawalTable => ({
    key, bucket, category, rows: list.slice().sort(byNewest),
    total: round2(list.reduce((s, e) => s + (Number(e.amount) || 0), 0)),
  });
  const ordered = categories.slice().sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id));
  const tables: WithdrawalTable[] = [];
  const idle: ExpenseCategory[] = [];
  for (const c of ordered) {
    const list = byCat.get(c.id);
    if (list?.length) { tables.push(make(`cat:${c.id}`, { kind: "cat", id: c.id }, list, c)); byCat.delete(c.id); }
    else if (!c.archived_at) idle.push(c);
  }
  for (const [id, list] of byCat) tables.push(make(`cat:${id}`, { kind: "cat", id }, list));
  if (none.length) tables.push(make("none", { kind: "none" }, none));
  for (const id of SYSTEM_TABLE_ORDER) {
    const list = bySys.get(id);
    if (list?.length) tables.push(make(`sys:${id}`, { kind: "system", id }, list));
  }
  return { tables, idle };
}

/** التصنيفاتُ التي يُختار منها لسحبٍ جديد: الفعّالةُ وحدها بترتيب إنشائها. */
export function pickableCategories(categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return categories.filter((c) => !c.archived_at)
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id));
}

/** رمزُ رفضِ التصنيف من خطأ الخادم أو المرآة (الرسالةُ = رمزُ `raise exception`). */
export function expenseCategoryErrorCode(e: unknown): ExpenseCategoryProblem | "expense_category_clinic_frozen" | null {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  for (const code of Object.keys(EXPENSE_CATEGORY_HINTS) as (keyof typeof EXPENSE_CATEGORY_HINTS)[]) {
    if (m.includes(code)) return code;
  }
  return null;
}
