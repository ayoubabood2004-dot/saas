// «خصم على الدين» (0241) — مفاتيحُ الأسباب وحدها (نطاقُ forgive البارد)، للواجهة خلف page().
// ونصوصُ الرفض بنطاق النافذة المملوك (fgv.err.*، ForgiveDialog.tsx) — لا تُضاف هنا: النصفُ البارد ممتلئ.
//
// debtForgive.ts تُحمَّل من الإقلاع (repoDemo) فلا تحمل مفتاحاً بارداً (i18n-hot-guard)؛ والنصُّ يُرسم بالنافذة
// والقائمة والتقرير حيث النصفُ البارد حاضر. لا تستورد هذه الوحدةَ من شِفرة الإقلاع.
import type { ForgiveReason } from "@/types";
import { REASON_CODES } from "./debtForgive";

/** الأسبابُ بترتيب عرضها ومفتاحُ كلٍّ. «غير ذلك» يحتاج ملاحظة. */
export const REASONS: readonly { code: ForgiveReason; key: string }[] = REASON_CODES.map((code) => ({ code, key: `forgive.reason.${code}` }));
export const reasonKey = (code: string | null | undefined): string | null => REASONS.find((r) => r.code === code)?.key ?? null;
