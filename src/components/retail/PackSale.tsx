/* ============================================================================
 * نصوصُ المسح بالكارتون والمغلّف — بشاشة البيع وفاتورة الشراء (0267) — مالكُ النطاق `pks` (hot-paths.json).
 *
 * «retail» نطاقٌ حارٌّ يدفعه الإقلاع، والنصفُ البارد على سقفه: فنصوصُ المسح بالكارتون هنا بحزمةٍ صغيرة تصل مع الشاشة
 * (`page(…, ["pks"])` بـSaleBuilder، كتسخين الورقة). والشاشةُ لا تقرأ مفاتيحَ النطاق — تسأل هذه الدوالَّ عن جملتها بـimport()،
 * وما يُرسم بالسلّة (`packNote`) يُكتب بالسطر نفسِه لحظةَ نزوله. وفاتورةُ الشراء كذلك (import() وensureOwned — لا page() لها هنا).
 * ========================================================================= */
import i18n from "i18next";

export type PackSay =
  | { kind: "notReady"; name: string; pack: string; per: number; unit: string }
  | { kind: "ret"; name: string; level: string; unit: string }
  | { kind: "usd"; name: string; pack: string }
  | { kind: "short"; name: string; pack: string; per: number; unit: string; stock: string }
  | { kind: "shortStale"; name: string; pack: string; per: number; unit: string; stock: string }
  | { kind: "changed"; name: string; pack: string }
  | { kind: "subInBox"; name: string; sub: string }
  | { kind: "found"; name: string; pack: string; per: number; unit: string }
  | { kind: "buyPack"; name: string; pack: string; per: number; unit: string }
  | { kind: "buyPackPrice"; name: string; pack: string; per: number; unit: string; price: string; each: string }
  | { kind: "buySub"; name: string; sub: string; unit: string };

/** جملةُ المسح بالكارتون — بلغة الواجهة الآن. */
export function packSay(s: PackSay): string {
  switch (s.kind) {
    case "notReady": return i18n.t("pks.notReady", { name: s.name, pack: s.pack, n: s.per, unit: s.unit });
    case "ret": return i18n.t("pks.ret", { name: s.name, level: s.level, unit: s.unit });
    case "usd": return i18n.t("pks.usd", { name: s.name, pack: s.pack });
    case "short": return i18n.t("pks.short", { name: s.name, pack: s.pack, n: s.per, unit: s.unit, stock: s.stock });
    case "shortStale": return i18n.t("pks.shortStale", { name: s.name, pack: s.pack, n: s.per, unit: s.unit, stock: s.stock });
    case "changed": return i18n.t("pks.changed", { name: s.name, pack: s.pack });
    case "subInBox": return i18n.t("pks.subInBox", { name: s.name, sub: s.sub });
    case "found": return i18n.t("pks.found", { name: s.name, pack: s.pack, n: s.per, unit: s.unit });
    case "buyPack": return i18n.t("pks.buyPack", { name: s.name, pack: s.pack, n: s.per, unit: s.unit });
    case "buyPackPrice": return i18n.t("pks.buyPackPrice", { name: s.name, pack: s.pack, n: s.per, unit: s.unit, price: s.price, each: s.each });
    case "buySub": return i18n.t("pks.buySub", { name: s.name, sub: s.sub, unit: s.unit });
  }
}

/** ما يُكتب تحت سطر الكارتون بالسلّة: «٢٤ علبة بالكارتون». */
export function packNote(per: number, unit: string): string {
  return i18n.t("pks.note", { n: per, unit });
}

/** اسمُ الوحدة الوسطى الافتراضيّ («علبة») ومستوياتُ الرمز للرسائل. */
export function packWords(): { box: string; sub: string; pack: string } {
  return { box: i18n.t("pks.box"), sub: i18n.t("pks.sub"), pack: i18n.t("pks.pack") };
}

/** التسخين: قطعةٌ لا ترسم شيئاً — `page(…, ["pks"])` يجلب النطاقَ معها. */
export default function PackSaleWarm(): null {
  return null;
}
