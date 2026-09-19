/* ============================================================================
 * باركودٌ لا يعرفه المخزن بفاتورة الشراء — يُقال، ويُختار له بابٌ صريح
 *
 * الشكوى (المالك): «ما أعرف شنو يصير لما يجي باركود جديد أو غير معرّف بفاتورة
 * شراء». وما كان يصير: **لا شيء يُقال**. سطرٌ فارغ يهبط بذيل القائمة بنفس نغمة
 * النجاح، وعند الحفظ يولد الخادمُ منتجاً **اسمُه أرقامُ باركوده وسعرُ بيعه صفر**
 * (`coalesce(nullif(name,''),'Item')` بـ0166، والاسمُ يُرسَل `name || barcode`).
 * وإن كُتب له اسمٌ يطابق منتجاً قائماً، يخصم الخادمُ البضاعةَ على ذاك المنتج
 * **ويكتب عليه الأسعارَ المكتوبة هنا**، والرمزُ الممسوح لا يتعلّمه أبداً — فيبقى
 * «غير معرّف» بكلّ مسحةٍ قادمة.
 *
 * والبابان الآن: «موجودة عندي برمز ثاني» (يُدوَّر بالاسم، ويُربط الرمزُ بها
 * فتلقاها المسحةُ الجاية)، و«مادّة جديدة» (معلوماتُها تُكتب بهذه الفاتورة).
 * والربطُ هنا ليس نافذةَ الكاشير الملغاة: لا صفَّ افتراضيّ، ولا ضغطةً واحدة —
 * اسمٌ يُكتب، وصفٌّ يُختار، وجملةٌ تسمّي الرمزَ والمادّةَ قبل التأكيد. والبضاعةُ
 * وفاتورةُ المورّد بيد المستلم هنا، وهو موضعُ المعرفة لا الكاشير.
 *
 *   node scripts/purchase-scan-test.mjs
 * ==========================================================================*/
import { readFileSync, existsSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");

const PUR = read("src/components/inventory/Purchases.tsx");
const en = JSON.parse(read("src/i18n/en.json"));
const ar = JSON.parse(read("src/i18n/ar.json"));
const scanAdd = PUR.slice(PUR.indexOf("const scanAdd = async () => {"), PUR.indexOf("/** مرشّحو الربط"));

/* ── ١) لا سطرَ صامت: الخادمُ يُسأل، ثم يُقال «ما ينعرف» ─────────────────── */
console.log("▸ رمزٌ لا تعرفه القائمة: يُسأل الخادمُ، ثم يُقال — لا سطرٌ صامت");
check("الخادمُ يُسأل قبل الحكم (القائمةُ لقطةٌ من الكاش)",
  /await withTimeout\(repo\.getProductByBarcode\(aimless, clinicId\), 6000\)/.test(scanAdd));
check("  وما يعرفه الخادمُ ينزل سطراً بمنتجه ويُقال",
  /addProductLine\(onServer, normalizeCode\(aimless\)\)/.test(scanAdd) && /purchase\.scanServerHit/.test(scanAdd));
check("  وفشلُ السؤال لا يُسقط الاستلام (يُكمل بما بيده)", /catch \{ reached = false; \/\* swallow-ok:/.test(scanAdd));
/* و«ما وصلنا الخادم» تُقال كما هي لا «ما عندك»: الرمزُ قد يكون معروفاً وما سألنا أحداً. */
check("  والنافذةُ تفرّق «ما ينعرف» عن «ما وصلنا الخادم»",
  /setUnknown\(\{ code: normalizeCode\(aimless\), reached \}\)/.test(scanAdd)
  && /unknown\.reached\s*\n?\s*\? t\("purchase\.unknownCode"/.test(PUR) && /purchase\.unknownOffline/.test(PUR));
check("ورمزٌ مجهولٌ يفتح البابين بدل سطرٍ فارغ",
  /setUnknown\(\{ code: normalizeCode\(aimless\), reached \}\)/.test(scanAdd) && /playWarning\(\);\s*\n\s*setUnknown/.test(scanAdd));
check("  ونغمتُه غيرُ نغمة النجاح", /playWarning\(\);/.test(scanAdd));
check("  ولا يُفتح سطرٌ للرمز المجهول بالمسح", !/blankLine\(\{ barcode: normalizeCode\(aimless\)/.test(scanAdd));
check("  والاسمُ المكتوب بصندوق المسح يبقى يهبط سطراً باسمه", /blankLine\(\{ name: normName\(raw\), qty: "1" \}\)/.test(scanAdd));

/* ── ٢) بابُ «موجودة عندي برمز ثاني» — بلا صفٍّ افتراضيّ ولا ضغطةٍ واحدة ─── */
console.log("▸ الربطُ صريحٌ: بحثٌ بالاسم، واختيارٌ، وجملةٌ تسمّي الطرفين");
check("نافذةُ الرمز المجهول تسمّي الرمزَ نفسَه", /data-unknowncode/.test(PUR) && /purchase\.unknownCode/.test(PUR));
check("  وبابان: مادّةٌ جديدة، وبحثٌ بالاسم", /data-unknownnew/.test(PUR) && /data-unknownsearch/.test(PUR));
check("  والبحثُ بالاسم **وبالرمز**، الطرفان مطبَّعان",
  /const byName = normalizeAr\(normName\(q\)\);/.test(PUR) && /const byCode = codeMatcher\(q\);/.test(PUR));
check("  ولا صفَّ مختاراً سلفاً (الاختيارُ بضغطةٍ صريحة)",
  /const \[linkPick, setLinkPick\] = useState<Product \| null>\(null\);/.test(PUR)
  && /data-unknownpick onClick=\{\(\) => \{ playTap\(\); setLinkPick\(p\); \}\}/.test(PUR)
  && !/linkCands\[0\]/.test(PUR));
check("  والكتابةُ بالبحث تُلغي الاختيارَ السابق (لا تأكيدٌ على صفٍّ قديم)",
  /onChange=\{\(e\) => \{ setLinkQ\(e\.target\.value\); setLinkPick\(null\); \}\}/.test(PUR));
check("  والتأكيدُ يسمّي الرمزَ والمادّةَ ورمزَها الحاليّ", /purchase\.unknownConfirm/.test(PUR)
  && /code: unknown\.code, name: linkPick\.name, cur: normalizeCode\(linkPick\.barcode\)/.test(PUR));
check("والربطُ رمزٌ إضافيّ لا يمسّ الأساسيّ (attach_product_code)",
  /repo\.attachProductCode\(linkPick\.id, unknown\.code\)/.test(PUR));
check("  ويُقال كيف يُفكّ إن انربط بالغلط", /purchase\.codeAttachedHint/.test(PUR));
check("  والسطرُ ينزل على المادّة نفسِها بالرمز الممسوح", /addProductLine\(updated, unknown\.code\)/.test(PUR));
check("  والمسحةُ الثانية لنفس العلبة تلقاها بلا حفظٍ ولا إعادةِ تحميل",
  /codeIndex\(\[\.\.\.products, \.\.\.attachedRef\.current\]\)/.test(PUR) && /attachedRef\.current = \[\.\.\.attachedRef\.current\.filter/.test(PUR));

/* ── ٣) بابُ «مادّة جديدة»: معلوماتُها تُكتب بالفاتورة نفسِها ─────────────── */
console.log("▸ مادّةٌ جديدة: بالفاتورة نفسِها، ولا تُولد باسمِ باركودها بسعر صفر");
check("«مادّة جديدة» تفتح سطراً بالرمز الممسوح", /const newFromUnknown = \(\) => \{/.test(PUR)
  && /blankLine\(\{ barcode: code, qty: "1" \}\)/.test(PUR));
const save = PUR.slice(PUR.indexOf("const save = async () => {"), PUR.indexOf("setBusy(true);", PUR.indexOf("const save = async () => {")));
check("والحفظُ يمنع مادّةً جديدة بلا اسم", /const nameless = validLines\.find\(\(l\) => !l\.product_id && !l\.name\.trim\(\)\);/.test(save)
  && /purchase\.needName/.test(save));
check("  وبلا سعرِ بيع (وإلا تنباع بصفر بالكاشير)",
  /const priceless = validLines\.find\(\(l\) => !l\.product_id && !\(Number\(l\.sell_price\) > 0\)\);/.test(save)
  && /purchase\.needSellPrice/.test(save));
check("  والمنعُ يسمّي السطرَ المقصود", /code: nameless\.barcode/.test(save) && /name: priceless\.name\.trim\(\) \|\| priceless\.barcode/.test(save));
check("  ويقع قبل الحفظ لا بعده", save.indexOf("nameless") < save.indexOf("excelArtifact"));

/* ── ٤) حقلُ رمزِ السطر يرى ما يراه صندوقُ المسح ─────────────────────────── */
console.log("▸ حقلُ الرمز بالسطر: نفسُ طبقات النجدة");
check("الرمزُ المكتوب بالسطر يمرّ بـrescueScan أيضاً",
  /const match = \(hit \? byBarcode\.get\(hit\) : undefined\)\s*\n\s*\?\? \(code\.trim\(\) \? rescueScan\(products, code\)\?\.product : undefined\);/.test(PUR));

/* (سلوكُ الربط بالوجه التجريبيّ مفحوصٌ بـrepo-demo-test — حيث يُحمَّل الريبو أصلاً.) */

/* ── ٦) الترجمة ─────────────────────────────────────────────────────────── */
console.log("▸ الترجمة");
for (const k of ["unknownCode", "unknownHint", "unknownNew", "unknownLink", "unknownSearchPh", "unknownStock",
  "unknownNoMatch", "unknownConfirm", "unknownConfirmGo", "noCode", "codeAttached", "codeAttachedHint",
  "scanServerHit", "needName", "needSellPrice", "unknownOffline"]) {
  check(`  مفتاحُ purchase.${k} بالملفّين`, !!en?.purchase?.[k] && !!ar?.purchase?.[k]);
}

console.log(`\n${fails ? "✗" : "✓"} purchase-scan-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
