/* ============================================================================
 * فحصُ التطابق: تطبيعُ رمز المطابقة بالمتصفّح (`matchCode`) مقابل نظيرِه
 * بالقاعدة (`inv_norm_code`) — حرفاً بحرف، على ملف قيمٍ واحد.
 *
 * لماذا: تطبيعُ طرفٍ واحد **أسوأ من لا تطبيع** — يفشل بصمتٍ ويبدو أنه يعمل
 * (CLAUDE.md §٣). رمزٌ مخزونٌ بعلامة اتجاهٍ خفية كان يطابق بالكاشير ولا يطابق
 * بمسار الشراء الخادميّ، فيُنشأ توأمٌ برصيدٍ مقسوم. وهذا الفحصُ يجعل أيَّ
 * تعديلٍ مستقبليّ بأحد الطرفين بلا الآخر **يفشّل البناء**.
 *
 * وجهان:
 *   node scripts/code-norm-parity.mjs            ← فحصُ جانب الواجهة وحده
 *       (ثوابتُ `matchCode`: خِلوٌّ من الخفيّ والمسافات، أرقامٌ لاتينية،
 *        حالةٌ مطويّة، وثباتٌ عند إعادة التطبيق). يدخل `npm run lint`،
 *        فينفع حتى حيث لا بوستغريس.
 *   node scripts/code-norm-parity.mjs <dir>      ← يضيف توليدَ <dir>/code-norm.sql
 *       لتشغّله حزمةُ run.sh فتقارن ناتجَ القاعدة بالمتوقَّع.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";

const outDir = process.argv[2] || null;

/* ---- الدالّة الحقيقية من المصدر، لا نسخةٌ منها ---------------------------- */
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^i18next$/ }, () => ({ path: "i18next", namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const t = (s) => s;", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: { contents: `export { matchCode, normalizeCode } from "./src/lib/utils";
export { scanVariants } from "./src/lib/productCodes";`, resolveDir: process.cwd(), loader: "js" },
  bundle: true, format: "esm", write: false, platform: "node", plugins: [stubs],
});
const { matchCode, normalizeCode, scanVariants } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

const cases = JSON.parse(fs.readFileSync("scripts/code-norm-fixture.json", "utf8"));

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; } else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const cp = (s) => [...s].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");

/* ---- ١) ثوابتُ جانب الواجهة ------------------------------------------------ */
// المحارفُ التي يجب ألا تنجو من التطبيع: الخفيُّ كلُّه، ومساحاتُ JS \s كلُّها.
const MUST_VANISH = [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];
for (const c of MUST_VANISH) {
  const ch = String.fromCharCode(c);
  check(`يُحذف ${cp(ch)}`, matchCode("89" + ch + "89") === "8989", `صار «${matchCode("89" + ch + "89")}»`);
}
// أرقامٌ شرقية وفارسية تنزل لاتينية
check("الأرقام الشرقية تنزل لاتينية", matchCode("٨٦٨٠٥٤٢") === "8680542");
check("والفارسية كذلك", matchCode("۸۶۸۰۵۴۲") === "8680542");
// حالةُ الأحرف مطويّة، والمخزونُ لا يُطوى
check("W90 و w90 يتطابقان بالمطابقة", matchCode("W90") === matchCode("w90"));
check("والحفظُ يبقي الحالة كما مُسحت", normalizeCode("W90") === "W90", `صار «${normalizeCode("W90")}»`);
// الثبات: تطبيعُ المطبَّع لا يغيّره (وإلا اختلف الطرفان بمسارٍ يطبّع مرّتين)
for (const raw of cases) {
  const once = matchCode(raw);
  check(`ثابتٌ عند الإعادة: ${cp(raw).slice(0, 40) || "(فارغ)"}`, matchCode(once) === once, `«${once}» → «${matchCode(once)}»`);
}
// طولُ الرمز لا يزيد أبداً بالتطبيع
for (const raw of cases) check("التطبيع لا يزيد الطول", matchCode(raw).length <= raw.length);

/* ---- ٢) توليدُ SQL للحزمة -------------------------------------------------- */
if (outDir) {
  // مهربُ U& — الملفُّ يبقى ASCII خالصاً فلا يمسخه محرّرٌ ولا نقلُ ملفات.
  const lit = (s) => {
    let out = "";
    for (const ch of s) {
      const n = ch.codePointAt(0);
      if (ch === "'") out += "''";
      else if (ch === "\\") out += "\\\\";
      else if (n >= 0x20 && n <= 0x7e) out += ch;
      else if (n <= 0xffff) out += "\\" + n.toString(16).padStart(4, "0");
      else out += "\\+" + n.toString(16).padStart(6, "0");
    }
    return `U&'${out}'`;
  };
  const rows = cases.map((raw, i) => `  (${i}, ${lit(raw)}, ${lit(matchCode(raw))})`).join(",\n");
  const sql = `-- مولَّدٌ من scripts/code-norm-parity.mjs — لا تعدّله بيدك.
-- كلُّ صفّ: الرمزُ الخام، وما تُخرجه matchCode بالمتصفّح. الحزمةُ تقارن به
-- ناتجَ inv_norm_code. اختلافُ صفٍّ واحد = الطرفان افترقا = فشل.
drop table if exists _code_norm_fixture;
create table _code_norm_fixture (idx int primary key, raw text, expected text);
insert into _code_norm_fixture (idx, raw, expected) values
${rows};
`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "code-norm.sql"), sql, "utf8");

  /* ---- وصيغُ الماسح: الطرفان يولّدان نفسَ المجموعة (0172/0173) ----------
   * نفسُ الحجّة بالضبط: `inv_code_variants` بالقاعدة مرآةُ `scanVariants`
   * بالواجهة. ومرآةٌ بلا فحصٍ تنحرف — وقد انحرفت فعلاً بأوّل صياغة: الواجهة
   * تختبر `[A-Za-z]` و`\d` (ASCII قطعاً)، والقاعدةُ كانت `between 'a' and 'z'`
   * وهو **رهنُ ترتيبِ المقارنة**: بـ`en_US.UTF-8` تقع «é» داخل a..z. فيقشّر
   * الخادمُ رأساً لا تقشّره الواجهة.
   * والمقارنةُ بلا إصلاحِ التخطيط (`withLayoutFix = false`): خريطتُه بياناتُ
   * متصفّحٍ لا تعرفها القاعدة، وذاك فرقٌ **مُعلَن** لا انحراف. */
  const varRows = cases
    .map((raw, i) => {
      // بترتيبِ التوليد لا مرتَّبةً: الترتيبُ جزءٌ من العقد — الانتقاءُ يقف
      // عند أوّل صيغةٍ مصيبة، فمن يرتّب غيرَ ترتيبها يبيع غيرَ ما يبيع.
      const want = [...new Set([matchCode(raw), ...scanVariants(raw, false)])].filter(Boolean);
      return { i, raw, want };
    })
    .map(({ i, raw, want }) => `  (${i}, ${lit(raw)}, array[${want.map(lit).join(", ")}]::text[])`)
    .join(",\n");
  const varSql = `-- مولَّدٌ من scripts/code-norm-parity.mjs — لا تعدّله بيدك.
-- كلُّ صفّ: الرمزُ الخام، والمجموعةُ التي تولّدها scanVariants بالمتصفّح
-- (بلا إصلاحِ التخطيط العربيّ — خريطتُه بياناتُ متصفّحٍ لا تعرفها القاعدة).
-- الحزمةُ تقارن بها ناتجَ inv_code_variants **بترتيبه**. اختلافُ صفٍّ = فشل.
drop table if exists _code_variants_fixture;
create table _code_variants_fixture (idx int primary key, raw text, expected text[]);
insert into _code_variants_fixture (idx, raw, expected) values
${varRows};
`;
  fs.writeFileSync(path.join(outDir, "code-variants.sql"), varSql, "utf8");
}

if (fails) {
  console.error(`✗ code-norm-parity: ${fails} فشلت من ${fails + passes}`);
  process.exit(1);
}
console.log(`✓ code-norm-parity: ${passes} نجحت، 0 فشلت (${cases.length} قيمة)${outDir ? " · وSQL مولَّد للحزمة" : ""}`);
