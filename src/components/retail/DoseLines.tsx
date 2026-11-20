/* ============================================================================
 * الجرعةُ بيع (0269) — نصوصُ شاشة البيع لسطور الطبلة، بنطاقٍ مملوك (dosl): «retail» حارٌّ والنصفُ البارد على سقفه.
 * تصلها شاشةُ البيع بـimport() مع البابِ وensureOwned("dosl") (كـPackSale/pks)، وتُسخَّن مع الشاشة. ما يُرسم تحت السطر
 * يُكتب بالسطر نفسِه لحظةَ نزوله (`dose.note`)، فرسمُ السلّة لا ينتظر قطعة.
 * ========================================================================= */
import i18n from "i18next";

const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}/${d.getMonth() + 1}`;
};

/** اسمُ السطر بالفاتورة: «Meloxicam · جرعة ١٣/١١». */
export const doseLineName = (name: string, givenAt: string): string => i18n.t("dosl.lineName", { name, date: day(givenAt) });
/** ما يُرسم تحت السطر: من الطبلة، لأيّ حيوان، ومتى أُعطيت. */
export const doseNote = (pet: string, givenAt: string): string => i18n.t("dosl.note", { pet, date: day(givenAt) });
/** نزلت جرعاتٌ من الطبلة لهذا الزبون. */
export const doseLoaded = (n: number): string => i18n.t("dosl.loaded", { count: n });
/** البيعةُ رُفضت لأنّ جرعةً انحسبت أو انلغت من جهازٍ ثانٍ — شيلت من السلّة. */
export const doseStale = (): string => i18n.t("dosl.stale");
/** مرجعُ البيعة ثبتت فاتورتُه بدون جرعاتٍ نزلت بعدها — شيلت، والإعادةُ ترجع الفاتورة. */
export const doseLate = (): string => i18n.t("dosl.late");
/** فشلُ جلب المعلَّق — لا يُصمت: الجرعاتُ باقيةٌ معلَّقة لكنّ الكاشيرَ يعرف أنها لم تنزل. */
export const doseFetchFail = (): string => i18n.t("dosl.fetchFail");
/** الجرعةُ سطرٌ واحد: الكميةُ ثابتة. */
export const doseQtyFixed = (): string => i18n.t("dosl.qtyFixed");
