import type { TFunction } from "i18next";
import type { AuditKind, BarcodeHealthRow, InventoryAuditRow } from "@/types";
import type { AuditMarks } from "./stocktake";
import { formatNum } from "./utils";

/* ============================================================================
 * علاماتُ فحص المخزن على ورقة الجرد (0245، «مثبَّتٌ داخل الجرد»).
 *
 * رفيقُ نطاق `audit` (hot-paths.json: owner InventoryAudit.tsx، with هذا الملفّ) — يقرأ مفاتيحَه
 * ولا يستورده إلا مالكُه. والمخرجان (الطباعة والإكسل) يأخذان الناتجَ بيانات: لا نطاقَ ولا عربيةَ
 * صلبةً هناك. نقيٌّ بلا شبكة، مفحوصٌ بـaudit-marks-test.
 *
 * كلمةٌ يقرؤها العادُّ وهو بالرف، لا شرحٌ: الشرحُ والطريقُ بتبويب الفحص. وما تقوله الورقةُ أصلاً
 * لا يُكرَّر — «نافد» (zero_sold) و«بدون شركة» (مجموعتُها). والترتيبُ بالخطورة.
 * ==========================================================================*/

/** نافذةُ معدّل البيع لعلامات الورقة — نفسُ افتراض الشاشة. */
export const MARKS_DAYS = 90;

export function auditMarks(t: TFunction, audit: readonly InventoryAuditRow[], health: readonly BarcodeHealthRow[]): AuditMarks {
  const L = {
    qty: t("audit.tagQty", "كمية مشكوكة"),
    dup: t("audit.tagDup", "تكرار؟"),
    noCode: t("audit.tagNoCode", "بلا باركود"),
    hand: t("audit.tagHand", "رمز يدوي"),
    broken: t("audit.tagBroken", "رمز معطوب"),
    idle: t("audit.tagIdle", "ما ينباع"),
    slow: t("audit.tagSlow", "بطيء"),
  };
  const order = [L.qty, L.dup, L.noCode, L.hand, L.broken, L.idle, L.slow];
  const tagOf = (k: AuditKind): string | null => {
    switch (k) {
      case "impossible": return L.qty;
      case "dup_twin": case "dup_name": return L.dup;
      case "no_code": return L.noCode;
      case "hand_code": return L.hand;
      case "never_sold": case "stopped": return L.idle;
      case "slow": return L.slow;
      default: return null;
    }
  };
  const sets = new Map<string, Set<string>>();
  const add = (id: string, tag: string | null): void => {
    if (!tag) return;
    const s = sets.get(id) ?? new Set<string>();
    s.add(tag);
    sets.set(id, s);
  };
  for (const r of audit) add(r.product_id, tagOf(r.kind));
  for (const r of health) add(r.product_id, r.kind === "twin" || r.kind === "alt_owned" ? L.dup : L.broken);

  const byProduct = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const [id, s] of sets) {
    const tags = order.filter((x) => s.has(x));
    byProduct.set(id, tags);
    for (const x of tags) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  const parts = order.filter((x) => counts.has(x)).map((x) => `${x} ${formatNum(counts.get(x) ?? 0)}`);
  return {
    byProduct,
    header: t("audit.marksHeader", "ملاحظات الفحص"),
    summary: parts.length
      ? t("audit.marksSummary", { parts: parts.join(" · "), n: formatNum(MARKS_DAYS), defaultValue: "فحص المخزن (بيع آخر {{n}} يوم): {{parts}}" })
      : t("audit.marksClean", "فحص المخزن: ماكو ملاحظات ✓"),
  };
}

/** فشلُ الفحص لا يمنع الورقة (الجردُ لا ينتظر)، لكنه يُقال بسطرها الأعلى — ورقةٌ بلا علاماتٍ تُقرأ «نظيفة». */
export function auditMarksFailed(t: TFunction): AuditMarks {
  return {
    byProduct: new Map(),
    header: t("audit.marksHeader", "ملاحظات الفحص"),
    summary: t("audit.marksFailed", "ملاحظات فحص المخزن ما وصلت — هاي الورقة بلا علاماتها، وما نگول «سليم» عن فشل."),
  };
}
