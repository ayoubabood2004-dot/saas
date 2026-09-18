/* ============================================================================
 * فحصُ قفلِ المخزن — «الافتراضُ يقفل، والفتحُ قرارٌ يُتّخذ».
 *
 * وضعُ المدير (جهازٌ مقفولٌ بواجهة الاستقبال) كان يخفي أسعارَ الشراء ويترك
 * زرَّ «أضف منتجاً» وقلمَ التعديل شغّالَين — نصفُ حماية: الموظّف لا يرى
 * الكلفةَ لكنه يقدر يفتح النموذج ويكتب سعرَ بيعٍ جديداً.
 *
 * صار القفلُ يشمل القرارَ كلَّه، ولها بابٌ اختياريّ **مطفأٌ افتراضياً**.
 * وهنا الخطر: علمٌ افتراضُه مقلوب يفتح مخازنَ كلِّ العيادات بضربةٍ واحدة.
 * فالفحصُ يمشي على جدول الحقيقة الثمانيّ كلِّه، ويثبّت أن الافتراض قفل.
 *
 * والفحصُ على `stockLockedFrom` الحقيقية لا على نسخةٍ منها — المنطقُ
 * استُخرج بثلاثة معطياتٍ صريحة تحديداً ليُفحص وحده.
 *
 *   node scripts/manager-mode-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import fs from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* managerOverride يستورد رياكت وسوبابيس وطبقةَ البيانات — ولا واحدٌ منها يخصّ
 * هذا المنطق. نبدّلها بجذوعٍ فارغة فتُفحص الدالّةُ على شِفرتها. */
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^(react|\.\/clinicSync|\.\/clinics|\.\/settings|\.\/repo)$/ },
      (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default new Proxy({}, { get: () => () => undefined });"
        + "export const useSyncExternalStore = () => 0; export const sb = () => null;"
        + "export const getActiveClinicId = () => 'c'; export const repo = {};"
        + "export const getOverridePinMirror = () => null; export const setOverridePinMirror = () => {};"
        + "export const getStockEditInManagerMode = () => false;",
      loader: "js",
    }));
  },
};

const built = await esbuild.build({
  entryPoints: ["src/lib/managerOverride.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs],
});
const { stockLockedFrom, capLockedFrom } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

/* ── ١) جدولُ الحقيقة كاملاً: جهازٌ مقفول × مدير مرفوع × الاستثناء ────────*/
console.log("▸ قفلُ المخزن — جهاز مقفول × رفعٌ بالرمز × استثناء العيادة");
const rows = [
  // [مقفول, مرفوع, استثناء, متوقَّع]
  [false, false, false, false, "جهازٌ عاديّ: المخزن مفتوح"],
  [false, false, true, false, "جهازٌ عاديّ والاستثناء مفعّل: مفتوح كذلك"],
  [false, true, false, false, "جهازٌ عاديّ ومديرٌ مرفوع: مفتوح"],
  [false, true, true, false, "جهازٌ عاديّ ومرفوعٌ واستثناء: مفتوح"],
  [true, false, false, true, "**الافتراض**: جهازٌ مقفولٌ بلا استثناء ⇒ المخزن مقفول"],
  [true, false, true, false, "مقفولٌ والاستثناءُ مفعّل ⇒ يفتح بقرار العيادة"],
  [true, true, false, false, "مقفولٌ ومديرٌ فتح بالرمز ⇒ يفتح عشر دقائق"],
  [true, true, true, false, "مقفولٌ ومرفوعٌ واستثناء ⇒ مفتوح"],
];
for (const [dev, elev, allow, want, why] of rows) {
  const got = stockLockedFrom(dev, elev, allow);
  check(why, got === want, `توقّعنا ${want} فجاء ${got}`);
}

/* ── ٢) الرفعُ بالرمز يغلب الاستثناء ولا يحتاجه ──────────────────────────*/
// مديرٌ أدخل رمزَه لا يجوز أن يبقى ممنوعاً لأن العيادة أطفأت خياراً اختيارياً.
check("الرفعُ بالرمز وحدَه يكفي لفتح المخزن", stockLockedFrom(true, true, false) === false);
// وحالةٌ واحدةٌ فقط من الثمانية تقفل — ما عداها مفتوح.
check("حالةٌ واحدةٌ تقفل لا أكثر",
  rows.filter(([d, e, a]) => stockLockedFrom(d, e, a)).length === 1);

/* ── ٣) الافتراضاتُ بالشِفرة: العلمُ مطفأٌ بالقيم الافتراضية ─────────────*/
console.log("▸ الافتراضاتُ المكتوبة — لا يُقلَب علمٌ بالسهو");
const settings = fs.readFileSync("src/lib/settings.ts", "utf8");
check("DEFAULT_PREFS يحمل manager_mode_stock_edit: false",
  /manager_mode_stock_edit:\s*false/.test(settings));
const sql = fs.readFileSync("supabase/migrations/0154_manager_mode_stock_edit.sql", "utf8");
check("والهجرةُ تنزله `not null default false`",
  /manager_mode_stock_edit\s+boolean\s+not\s+null\s+default\s+false/i.test(sql));

/* ── ٤) الشاشة: ما بقي زرُّ إضافةٍ أو تعديلٍ بلا بوّابة ───────────────────*/
console.log("▸ شاشةُ المخزن — كلُّ زرِّ إضافةٍ/تعديلٍ تحت البوّابة");
const inv = fs.readFileSync("src/pages/Inventory.tsx", "utf8");
check("البوّابةُ تُقرأ من useOverride().stockLocked بكل مواضع العمل",
  (inv.match(/stockLocked: locked/g) ?? []).length >= 7,
  String((inv.match(/stockLocked: locked/g) ?? []).length));

/* الأرقامُ الثلاثة الكبيرة (رأس المال · قيمة البيع · الربح المتوقَّع) هي
 * الاستثناءُ الوحيد: المفتاحُ يفتح العملَ لا الإعلانَ عن مال العيادة. فبطاقةُ
 * القيمة تتبع `restricted` نفسَه — ولو تسرّبت إلى `stockLocked` لانفتحت مع
 * أوّل عيادةٍ تفعّل المفتاح، بلا أن يشتكي أحد. */
const card = inv.slice(inv.indexOf("function InventoryValueCard"), inv.indexOf("function ValueCell"));
check("بطاقةُ القيمة تقرأ `restricted` لا `stockLocked`",
  /const \{ restricted \} = useOverride\(\)/.test(card) && !/stockLocked/.test(card));
check("وتختفي كلُّها بوضع المدير (الثلاثةُ لا اثنان)",
  /if \(restricted\) return null;/.test(card));
check("فما بقي بها شرطٌ يخفي عموداً دون عمود", !/!locked &&/.test(card));
// الأزرارُ الأربعةُ الحاسمة: إضافةُ منتج، تعديلُه، حذفُه، إضافةُ شركة.
for (const [needle, why] of [
  ['{!locked && <Button leftIcon={<PackagePlus', "زرُّ «أضف منتجاً» تحت البوّابة"],
  ['{!locked && <button onClick={onEdit}', "قلمُ تعديل المنتج تحت البوّابة"],
  ['{!locked && <button onClick={onRemove}', "سلّةُ حذف المنتج تحت البوّابة"],
  ['{!locked && <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("pos.addCompany"', "زرُّ «أضف شركة» تحت البوّابة"],
]) check(why, inv.includes(needle));

/* ── ٥) شاشاتُ المال — «الصلاحيةُ شرطٌ، وقفلُ الجهاز يغلبها» ─────────────*/
// تبويبُ تقارير المبيعات كان ظاهراً **بلا شرطٍ أبداً**: موظّفُ الاستقبال يفتحه
// بحسابه، والجهازُ المقفول يفتحه لأن القفلَ لا ينزّل الدور. فحصُ الثمانية هنا
// يثبّت أن المسموحَ وحده يرى، وأن القفلَ يغلب صلاحيته.
console.log("▸ القفلُ المركّب — صلاحية × جهاز مقفول × رفعٌ بالرمز");
const mrows = [
  // [مقفول, مرفوع, مسموح, متوقَّع]
  [false, false, false, true,  "**الجذرُ الأوّل**: بلا صلاحيةٍ ⇒ مقفول ولو الجهازُ عاديّ"],
  [false, false, true,  false, "مسموحٌ وجهازٌ عاديّ ⇒ يرى"],
  [false, true,  false, true,  "رفعٌ بالرمز لا يمنح صلاحيةً غيرَ ممنوحة"],
  [false, true,  true,  false, "مسموحٌ ومرفوع ⇒ يرى"],
  [true,  false, false, true,  "مقفولٌ وبلا صلاحية ⇒ مقفول"],
  [true,  false, true,  true,  "**الجذرُ الثاني**: مسموحٌ لكنّ الجهازَ مقفول ⇒ مقفول"],
  [true,  true,  false, true,  "مقفولٌ ومرفوعٌ بلا صلاحية ⇒ يبقى مقفولاً"],
  [true,  true,  true,  false, "مقفولٌ ومرفوعٌ ومسموح ⇒ يرى عشر دقائق"],
];
for (const [dev, elev, allow, want, why] of mrows) {
  const got = capLockedFrom(dev, elev, allow);
  check(why, got === want, `توقّعنا ${want} فجاء ${got}`);
}
// ثلاثٌ تفتح: المسموحُ على جهازٍ عاديّ (مرفوعاً أو لا)، والمسموحُ على مقفولٍ
// رُفع بالرمز. وكلُّ ما عداها مقفول.
check("ثلاثٌ من الثمانية تفتح لا أكثر",
  mrows.filter(([d, e, a]) => !capLockedFrom(d, e, a)).length === 3);
// ولا يُخلط بقفل المخزن: هذا بلا بابٍ اختياريّ («محظورة تماماً» بكلمة المالك).
check("قفلُ المال أشدُّ من قفل المخزن بالحالة السادسة",
  capLockedFrom(true, false, true) === true && stockLockedFrom(true, false, true) === false);

/* ── ٦) المواضعُ الثلاثة تقرأ من الدالّة، ولا فرعَ يسقط على التقارير ─────*/
console.log("▸ المبيعات — التبويبُ واللوحةُ وسطرُ الربح من حكمٍ واحد");
const retail = fs.readFileSync("src/pages/RetailSales.tsx", "utf8");
const panel  = fs.readFileSync("src/components/retail/ReportsPanel.tsx", "utf8");
const invp   = fs.readFileSync("src/components/retail/InvoicesPanel.tsx", "utf8");
for (const [src, why] of [
  [retail, "شريطُ التبويبات يقرأ capLockedFrom"],
  [panel,  "لوحةُ التقارير نفسُها تقرأها (طبقةٌ ثانية)"],
  [invp,   "وسطرُ ربح الفاتورة كذلك"],
]) check(why, /capLockedFrom\(ov\.deviceLocked, ov\.active,/.test(src));
// والحذفُ فعلٌ لا عرض، ويتبع نفسَ الحكم: جهازٌ مقفولٌ لا يحذف فاتورة.
check("وحذفُ الفاتورة يتبع نفسَ الحكم لا `can` وحدَها",
  /const canDelete = !capLockedFrom\(ov\.deviceLocked, ov\.active, can\("deleteInvoices"\)\)/.test(invp));
check("  وتصحيحُ الوصل يتبع الحذفَ لا يعيد الفحص",
  /const canFixReceipt = canDelete &&/.test(invp));

/* ── ٧) شاشةُ المخزن لا تُفتح بالرابط لمن لا يملك صلاحيتها ───────────────*/
// الشريطُ كان يخفيها، والصفحةُ ما تفحص شيئاً — وبطاقةُ النواقص بالرئيسية
// تنقل إليها بضغطةٍ للجميع. فتُرى رؤوسُ الأموال وأسعارُ الشراء **وأزرارُ
// الحذف** بحساب موظّف استقبال.
console.log("▸ المخزون — رابطٌ محميٌّ كالتقارير والرواتب");
const dash = fs.readFileSync("src/pages/Dashboard.tsx", "utf8");
check("الصفحةُ تفحص manageInventory وتردّ قفلاً",
  /if \(!can\("manageInventory"\)\) \{/.test(inv));
check("  والرسالةُ من القاموس لا نصّاً صلباً", /t\("pos\.noAccess"/.test(inv));
check("وبطاقةُ النواقص بالرئيسية تتبع نفسَ الصلاحية",
  /const canStock = can\("manageInventory"\)/.test(dash) && /\{canStock && <Card padded>/.test(dash));
check("التبويبُ يختفي من الشريط لا يُعطَّل",
  /\.\.\.\(reportsLocked \? \[\] : \[\{ id: "reports"/.test(retail));
check("والمحتوى مشروطٌ صراحةً — لا فرعَ أخيرَ يسقط على التقارير",
  /tab === "reports" && !reportsLocked \? \(/.test(retail) && !/\) : \(\s*<ReportsPanel \/>/.test(retail));
check("وتبويبٌ عالقٌ يُعاد إلى البيع عند القفل",
  /if \(tab === "reports" && reportsLocked\) setTab\("sell"\);/.test(retail));
// الأهمُّ: لا طلبَ يُرسل وهي مقفولة — أرقامُ التقارير لا تصل السلك أصلاً.
check("ولا تُنادى دوالُّ التقارير وهي مقفولة",
  /if \(locked\) \{ setLoading\(false\); setFailed\(false\); return; \}/.test(panel));
check("والقفلُ ضمنَ اعتماديّات أثر الجلب", /\}, \[periodStartMs, tick, locked\]\);/.test(panel));

console.log(fails ? `\n✗ manager-mode-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ manager-mode-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
