/* ============================================================================
 * عناوين الرواتب خارج React.
 *
 * وُجد هذا الملف ليبقى `payroll.ts` نقيّاً: منطق الحساب يُفحص بـnode بلا
 * متصفّح ولا i18n، فلا يجوز أن يستورد أياً منهما. وبالمقابل تحتاج الطباعة
 * وطبقة المخزن التجريبي نصّاً مترجَماً وهما خارج شجرة المكوّنات، فلا `useTranslation`
 * لهما. فالوسيط: نداءٌ مباشر لنسخة i18next.
 * ==========================================================================*/
import i18n from "@/i18n";

/** عنوان بند الأجر بلغة الواجهة. الاحتياط رمزُ البند نفسه لا نصٌّ مخبّأ. */
export const elLabelOf = (code: string): string => i18n.t(`payroll.el.${code}`, code);

/** بيان مصروف الراتب كما يظهر بسجل المصروفات (يطابق ما يبنيه الخادم). */
export const salaryExpenseText = (name: string, period: string): string =>
  i18n.t("payroll.expSalary", { name, period });

/** بيان مصروف السلفة. */
export const loanExpenseText = (name: string): string =>
  i18n.t("payroll.expLoan", { name });

/** بيان مصروف السحب على حساب الراتب (يطابق ما يبنيه الخادم في 0140). */
export const drawExpenseText = (name: string, period: string): string =>
  i18n.t("payroll.expDraw", { name, period });

/** اسمٌ احتياطي حين تصل قسيمة بلا اسم — لا يُترك فارغاً بالمستند. */
export const unnamedStaff = (): string => i18n.t("payroll.unnamed", "موظف");
