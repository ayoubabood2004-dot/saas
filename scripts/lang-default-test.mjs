/* ============================================================================
 * فحصُ لغة الإقلاع — على `src/i18n/index.ts` نفسِه، بتحميلِه لا بقراءته.
 *
 * الجذر: `initialLang()` كانت ترجع "en"، فأوّلُ شاشةٍ لعيادةٍ عراقيةٍ جديدة
 * إنكليزية — والمقيسُ ٣٣ من ٤٩ تسجيلاً ماتت بصفر منتجٍ وصفر فاتورة. ولم يكن
 * العطبُ محميّاً بفحصٍ واحد: لا حارسَ ولا لقطةَ تنكسر لو رجع "en" غداً.
 *
 * وأوّلُ حارسٍ كتبتُه لهذا كان **مثقوباً**، وأثبته الهجومُ بخمس تجارب: كان
 * يقرأ نصَّ الدالّة بتعبيرٍ منتظم، فمرّر `if (navigator.language…) return "en"`
 * قبل السطر الصحيح، ومرّر `return "en";` يتلوه تعليقٌ فيه "ar"، ومرّر تحويلَ
 * `lng: initialLang()` إلى `lng: "en"` وتحويلَ `applyDir(initialLang())`
 * كذلك — بينما **فشّل** إعادةَ صياغةٍ أمينة (`const DEFAULT_LANG = "ar"`).
 * أي أنه يحمي شكلَ سطرٍ ويعاقب التنظيفَ ويسامح الانحدار.
 *
 * فالفحصُ هنا يحمّل الوحدةَ فعلاً بمخزنٍ بالذاكرة ويسأل i18next عن لغته:
 *   ١) بلا `vp_lang` ⇒ "ar"، و`<html lang>` و`dir` معه.
 *   ٢) و`vp_lang="en"` محفوظاً ⇒ "en" — من اختار يبقى على اختياره.
 *   ٣) ولا تُكتب `vp_lang` بالإقلاع — الافتراضُ ليس تفضيلاً باسم من لم يختر.
 *
 *   node scripts/lang-default-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const built = await esbuild.build({
  entryPoints: ["src/i18n/index.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
  // `react-i18next` يجرّ محلّلَ HTML لمكوّن <Trans> — ولا نحتاجه هنا: نفحص
  // الإقلاع لا التصيير. نتركه خارجياً بلا حلٍّ، ونحقنه مجوّفاً بالمُحمِّل.
  external: ["react", "react-dom", "html-parse-stringify"],
  loader: { ".json": "json" },
});
const CODE = built.outputFiles[0].text;

/** يحمّل الوحدةَ بمتصفّحٍ بالحدّ الأدنى، ويرجع ما استقرّ عليه الإقلاع. */
async function boot(stored) {
  const mem = new Map();
  if (stored != null) mem.set("vp_lang", stored);
  const writes = [];
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { writes.push(k); mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  const el = { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } };
  globalThis.document = {
    documentElement: el, head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener() {}, removeEventListener() {},
    getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
  // بصمةٌ فريدة لكل تحميل — وإلا أعاد `import` النسخةَ المخزّنة بلا تشغيل.
  const src = CODE.replace(/from\s*"html-parse-stringify"/g, 'from "./_hps.mjs"');
  // ملفٌّ مؤقّتٌ لا data: URL — رسالةُ خطأٍ مقروءة بدل كتلةِ base64.
  // داخل المستودع لا /tmp: الحزمةُ تترك `react` خارجياً، فلازم أن يراها node
  // من node_modules — ومجلّدٌ خارج الشجرة لا يحلّها.
  const dir = mkdtempSync(join(process.cwd(), "node_modules", ".vp-lang-"));
  writeFileSync(join(dir, "_hps.mjs"), "export default { parse: () => [], stringify: () => \"\" };\n");
  const f = join(dir, "boot.mjs");
  writeFileSync(f, src);
  const mod = await import(pathToFileURL(f).href);
  rmSync(dir, { recursive: true, force: true });
  // ثلاثةُ شواهدَ لا واحد: لغةُ i18next (ما يُترجَم فعلاً)، و`<html lang>`
  // و`dir` (ما يراه المتصفّحُ وقارئُ الشاشة). تثبيتُ `lng` وحدَها بلا لمس
  // `applyDir` يُبقي الشاهدين الأخيرين صادقين ويقلب النصَّ — فلا يكفي واحد.
  return { lang: el.lang, dir: el.dir, i18nLang: mod.default?.language ?? mod.default?.resolvedLanguage ?? "", writes, mod };
}

console.log("▸ لغةُ الإقلاع");
const fresh = await boot(null);
check("جهازٌ جديد بلا تفضيلٍ محفوظ يقلع بالعربية", fresh.lang === "ar", `طلع «${fresh.lang}»`);
check("  والاتجاه rtl معه", fresh.dir === "rtl", `طلع «${fresh.dir}»`);
check("  وi18next نفسُه على العربية (لا `<html lang>` وحدَه)",
      fresh.i18nLang === "ar", `طلع «${fresh.i18nLang}»`);
check("  ولا يُكتب vp_lang بالإقلاع (الافتراضُ ليس تفضيلاً باسم من لم يختر)",
      !fresh.writes.includes("vp_lang"), `كُتب: ${fresh.writes.join(",") || "لا شيء"}`);

const chose = await boot("en");
check("ومن اختار الإنكليزية يبقى عليها", chose.lang === "en", `طلع «${chose.lang}»`);
check("  والاتجاه ltr معه", chose.dir === "ltr", `طلع «${chose.dir}»`);
check("  وi18next معه", chose.i18nLang === "en", `طلع «${chose.i18nLang}»`);

console.log(`\n${fails ? "✗" : "✓"} lang-default-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
