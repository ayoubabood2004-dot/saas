import type { TFunction } from "i18next";
import { ROLE_LABEL, type StaffRole } from "./staff";

/** اسمُ الدور معروضاً — مترجَم (ROLE_LABEL عربيٌّ صلبٌ قديم يبقى احتياطاً).
 *  بوحدةٍ لا تقرؤها شِفرةُ الإقلاع: مفاتيحُ `staff.roleName.*` بالنصف البارد، ولا
 *  يناديها إلا صفحاتٌ خلف page() (الكادر، الرواتب، الانضمام). */
export function roleText(role: StaffRole, t: TFunction): string {
  return t(`staff.roleName.${role}`, { defaultValue: ROLE_LABEL[role] ?? role });
}
