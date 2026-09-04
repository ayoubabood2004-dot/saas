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
const { stockLockedFrom } = await import(
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

console.log(fails ? `\n✗ manager-mode-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ manager-mode-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
