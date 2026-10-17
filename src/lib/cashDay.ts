import type { Invoice, Expense } from "@/types";
import { dayOf } from "./backdate";
import { receiptsOf } from "./debt";

/* ============================================================================
 * يومُ الصندوق — اليومُ المحلّيّ لا يومُ غرينتش. نقيّةٌ ومفحوصةٌ بـ`scripts/cash-day-test.mjs`.
 *
 * كانت المطابقةُ تطلب «من منتصف الليل المحلّيّ» ثم تصفّي بـ`created_at.slice(0, 10)`
 * — والخادمُ يرجع اللحظةَ بغرينتش ("2026-10-16T22:30:00+00:00")، فالقطعُ يومُ غرينتش.
 * فاتورةُ ٠١:٣٠ ببغداد (٢٢:٣٠ غرينتش أمس) سقطت من صندوق يومها، والطلبُ نفسُه أخرجها
 * من صندوق أمس: **لا يراها أيُّ صندوق**. مقيس (١٧/١٠، ٦٠ يوماً): ١٢٢ فاتورةً غيرَ مرتجعة
 * بين ٠٠:٠٠ و٠٢:٥٩ ببغداد بأربع عيادات، نقدُها ٣٫٨ مليون — والعيادةُ التي تبيع ليلاً وحدها ٩٢.
 * والمصروفاتُ بالشكل نفسه (`spent_at` عمودُ timestamptz)؛ صفرٌ منها بتلك الساعات بعد.
 *
 * فالطرفان يومٌ محلّيّ: الطلبُ بمدّةٍ من منتصف الليل المحلّيّ للتالي، والتصفيةُ بـ`dayOf`.
 *
 * **ما بعد منتصف الليل لليوم الجديد — بقرار المالك (١٧/١٠).** لا «يومَ عملٍ» ينتهي
 * الفجر: بيعُ ٠١:٣٠ بصندوق يومه التقويميّ (وبالدوام الصباحيّ لعيادةٍ بدوامين) حتى لعيادةٍ
 * تبيع ليلاً. لا تمدّ الصندوقَ لما بعد منتصف الليل بلا كلمته.
 *
 * **والمالُ بيوم وصوله لا بيوم فاتورته.** كان الصندوقُ يجلب فواتيرَ أُنشئت اليوم ويرمي كلَّ
 * ساقِ دفعٍ بدوام إنشاء فاتورتها — والخادمُ يؤرّخ الساقَ بـ`at`ها (settle_invoice تختم now()،
 * وreceipt_legs بـ0149 تقرأ coalesce(at, created_at)). فتسديدُ دينٍ قديمٍ اليوم («تسديد دين»،
 * تحصيلُ مندوب التوصيل) لا يصل درجَ أحد: المفروضُ ناقص، والعدُّ المؤكَّد يُحفظ «زيادة» وهمية
 * باسم الكاشير؛ وتسديدُ المساء على فاتورة الصباح ينزل بالصباحيّ. فالجلبُ ما **لمس** اليوم
 * (`listInvoicesTouching`) والسِّيَقُ من `receiptsOf` نفسِها، كلٌّ بيومه ودوامه. و«المبيعات»
 * وعددُ الفواتير يبقيان بيوم الإنشاء. وفاتورةُ «تاريخ المبيع» (0242) سِيَقُها بلا `at`
 * فتنزل بيوم بيعها لا بدرج يوم إدخالها.
 * ========================================================================= */

/**
 * مدّةُ يومٍ محلّيّ للطلب (0149: لا قراءةَ لجداول المال بلا مدّة). `to` هو منتصفُ الليل
 * التالي نفسُه — والطلبُ يشمله (`lte`) — فلا فجوةَ أجزاءِ ثانيةٍ بآخر اليوم؛ وصفٌّ
 * بمنتصف الليل تماماً يُسقطه التصفيةُ بيومه.
 */
export function localDayRange(day: string): { from: string; to: string } {
  const [y, m, d] = day.split("-").map(Number);
  return { from: new Date(y, m - 1, d).toISOString(), to: new Date(y, m - 1, d + 1).toISOString() };
}

/** فواتيرُ صندوق اليوم: يومُها المحلّيّ هو اليوم، والمرتجعةُ خارجه. */
export function drawerInvoices(rows: Invoice[], day: string): Invoice[] {
  return rows.filter((i) => dayOf(i.created_at) === day && i.status !== "refunded");
}

/** مصروفاتُ صندوق اليوم: يومُ خروج المال محلّياً هو اليوم. */
export function drawerExpenses(rows: Expense[], day: string): Expense[] {
  return rows.filter((e) => dayOf(e.spent_at || e.created_at) === day);
}

export type DrawerShiftId = "am" | "pm" | "day";

/** أرقامُ دوامٍ واحد بالصندوق. */
export interface DrawerFigures {
  id: DrawerShiftId;
  salesTotal: number;     // إجماليُّ فواتير أُنشئت بالدوام (كلُّ الطرق)
  invoiceCount: number;
  cash: number;           // نقدٌ وصل بالدوام — مهما كان يومُ فاتورته
  card: number;
  transfer: number;
  cashOut: number;        // مصروفاتٌ نقدية خرجت بالدوام
  expected: number;       // cash − cashOut
}

const minuteOf = (iso: string): number => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const pocketOf = (method: string | null): "cash" | "card" | "transfer" =>
  method === "card" ? "card" : method === "transfer" ? "transfer" : "cash";

/**
 * أرقامُ صندوق اليوم بدواماته. `rows` ما رجعه `listInvoicesTouching` لمدّة اليوم (فيه فواتيرُ
 * أيامٍ أخرى سُدِّد عليها اليوم، وديونٌ مفتوحة)، و`pmFrom` دقيقةُ بداية المسائيّ لعيادةٍ بدوامين
 * أو null لدوامٍ واحد — وما قبلها للصباحيّ فلا تضيع لحظةٌ بالاستراحة بين الدوامين.
 */
export function drawerShifts(rows: Invoice[], expenses: Expense[], day: string, pmFrom: number | null): DrawerFigures[] {
  const mk = (id: DrawerShiftId): DrawerFigures =>
    ({ id, salesTotal: 0, invoiceCount: 0, cash: 0, card: 0, transfer: 0, cashOut: 0, expected: 0 });
  const list = pmFrom != null ? [mk("am"), mk("pm")] : [mk("day")];
  const bucket = (iso: string): DrawerFigures => (pmFrom != null && minuteOf(iso) >= pmFrom ? list[1] : list[0]);

  for (const inv of drawerInvoices(rows, day)) {
    const s = bucket(inv.created_at);
    s.salesTotal += inv.total;
    s.invoiceCount += 1;
  }
  // المقبوضاتُ بحكم الخادم نفسه: المرتجعةُ لا شيء، والساقُ بلا `at` بيوم فاتورتها، والسالبةُ
  // (تصحيحُ تحصيل 0113، فكُّ تحصيل مندوب 0157) تُنقص جيبَها بيومها.
  for (const inv of rows) {
    for (const r of receiptsOf(inv)) {
      if (dayOf(r.at) !== day) continue;
      bucket(r.at)[pocketOf(r.method)] += Number(r.amount) || 0;
    }
  }
  for (const e of drawerExpenses(expenses, day)) {
    if ((e.method ?? "cash") !== "cash") continue;
    bucket(e.spent_at || e.created_at).cashOut += e.amount;
  }
  for (const s of list) {
    for (const k of ["cash", "card", "transfer"] as const) s[k] = Math.round(s[k] * 100) / 100;
    s.expected = Math.round((s.cash - s.cashOut) * 100) / 100;
  }
  return list;
}

/** ما يحتاجه الجلبُ من المستودع. */
export interface DrawerApi {
  listInvoicesTouching(range: { from: string; to: string }): Promise<Invoice[]>;
  listExpenses(clinicId: string | undefined, range: { from: string; to: string }): Promise<Expense[]>;
}

/**
 * جلبُ صندوق اليوم بمدّته المحلّيّة (0149): الفواتيرُ التي **لمستها** المدّة — أُنشئت، أو
 * وصلت عليها دفعة — والمصروفات. لا يبتلع: فشلُ أيٍّ منهما يُرمى، والشاشةُ تعرض «أعد المحاولة».
 * «صفر» عن خطأٍ كان درجاً كاذباً يُؤكَّد ويُحفظ فرقُه باسم الكاشير.
 */
export async function loadDrawer(api: DrawerApi, day: string): Promise<{ invoices: Invoice[]; expenses: Expense[] }> {
  const range = localDayRange(day);
  const [invoices, expenses] = await Promise.all([api.listInvoicesTouching(range), api.listExpenses(undefined, range)]);
  return { invoices, expenses };
}
