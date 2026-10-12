import type { TFunction } from "i18next";
import { describeDbError } from "@/lib/errors";

/* ============================================================================
 * رفضُ متجر التصنيفات قبل الشبكة يُقال بالعربية — رفيقُ «المتجر الإلكتروني» (نطاق cat).
 *
 * `storeCats` يرفض بـ`code: "not_ready"` حين لا لقطةَ بيده (تبدّلت العيادة، أو لم تصل قراءة)،
 * و`describeDbError` لا يعرف الرمز فيسقط إلى `err.message` — فكانت الشاشةُ تقول «ما انحفظ —
 * not_ready». الرمزُ رمزُ هذا المتجر وحده، فترجمتُه هنا بنطاقه لا بنصّ القاعدة العامّ.
 * ==========================================================================*/

export function catError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { code?: string; message?: string };
  if (err.code === "not_ready") {
    return err.message === "clinic_switched"
      ? t("cat.switched", "تبدّلت العيادة — حدّث الصفحة. ما انحفظ شي.")
      : t("cat.notReady", "التصنيفات بعدها ما وصلت — أعد المحاولة بعد لحظة.");
  }
  return describeDbError(e, t);
}
