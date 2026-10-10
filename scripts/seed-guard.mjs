/* ============================================================================
 * حارسُ البذرة — «القراءةُ لا تكتب إلا بأرض صاحبها».
 *
 * الحقيقةُ المقيسة من الإنتاج: بعد ثانيتين من دخول مشغّل المنصّة عيادةَ زبون،
 * نُسخت إليها سلالةُ المشغّل ودواؤه وأحدَ عشرَ صفَّ مؤشّراتٍ حيوية — بلا أن
 * يلمس أحدٌ شيئاً. السببُ فرعٌ داخل المُرطِّبات: «إن كان الجدولُ السحابيّ فارغاً
 * فارفعْ ما بهذا الجهاز». وهو صحيحٌ ما دام المتصفّحُ والخادمُ يقصدان العيادةَ
 * نفسها — ويكذب حين يختلفان.
 *
 * فكلُّ كتابةٍ تجري **داخل** دالّة ترطيب لازم تقع داخل نداء `seedOwnClinic(...)`.
 * والفحصُ بالنطاق لا بالسطر: اللفُّ قد يمتدّ أسطراً، والشِفرةُ لا تُشوَّه لترضي
 * تعبيراً نمطياً.
 *
 *   node scripts/seed-guard.mjs
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

/* قائمةٌ مكتوبةٌ بالنصّ تُعمي الحارسَ عن ملفٍّ جديد — وقد أعمته فعلاً عن
 * ثلاثة (promotions/locations/vaccines) حتى ظهر العطلُ بسجلّ الإنتاج:
 * «duplicate key … clinic_promos_pkey» من عيادةٍ تعيد المحاولة، والتصادمُ
 * هو ما منع كتابةً بأرضِ غيرها لا الحارس. فالنطاقُ صار «كلُّ ملفٍّ فيه
 * مُرطِّب»، يتّسع من نفسه كلّما وُلد مُرطِّبٌ جديد. */
const walk = (d) => fs.readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return fs.statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) ? [p.split(path.sep).join("/")] : []);
});
const FILES = walk("src").filter((f) => /registerHydrator|function hydrate/.test(fs.readFileSync(f, "utf8")));
/** نداءُ سوبابيس يغيّر صفّاً. */
const WRITE = /\b(?:client|sb\(\)!?)\s*\.\s*from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\s*\(/g;

/** مدى النداء من قوسه الفاتح إلى قوسه المغلق المقابل. */
function callExtent(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) return [openIdx, i]; }
  }
  return [openIdx, src.length];
}
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

let bad = 0, ok = 0;
for (const file of FILES) {
  const src = fs.readFileSync(file, "utf8");

  // نطاقاتُ seedOwnClinic(...) — كلُّ ما بداخلها محروس.
  const guarded = [];
  for (const m of src.matchAll(/seedOwnClinic\s*\(/g)) {
    guarded.push(callExtent(src, m.index + m[0].length - 1));
  }
  // مدى كل دالّة ترطيب: من تعريفها حتى أوّل `\n}` بعمودٍ صفر.
  const zones = [];
  for (const m of src.matchAll(/^(?:export )?(?:async )?function (hydrate\w*)/gm)) {
    const end = src.indexOf("\n}", m.index);
    zones.push({ name: m[1], from: m.index, to: end < 0 ? src.length : end });
  }

  for (const w of src.matchAll(WRITE)) {
    const zone = zones.find((z) => w.index >= z.from && w.index <= z.to);
    if (!zone) continue; // كتابةٌ خارج الترطيب — فعلٌ صريح من المستخدم، لا بذرة
    if (guarded.some(([a, b]) => w.index > a && w.index < b)) { ok++; continue; }
    bad++;
    console.error(`   ✗ ${file}:${lineOf(src, w.index)} — كتابةٌ داخل ${zone.name}() بلا seedOwnClinic:\n       ${src.slice(w.index, w.index + 90).split("\n")[0].trim()}`);
  }
}

// نطاقٌ لا يُفترض: ملفّاتُ المُرطِّبات المعروفة لازم تكون كلُّها بالمسح —
// وإلا فالحارسُ نفسُه انكمش بصمتٍ وعاد اطمئنانُه كاذباً.
const MUST = ["src/lib/breeds.ts", "src/lib/settings.ts",
              "src/lib/clinicSync.ts", "src/lib/promotions.ts",
              "src/lib/locations.ts", "src/lib/vaccines.ts"];
const missed = MUST.filter((f) => !FILES.includes(f));
if (missed.length) {
  console.error("   ✗ الحارسُ لا يمسح: " + missed.join("، "));
  bad += missed.length;
}

/* مُرطِّبٌ أُحيل: «أدويةُ العيادة» (clinic_meds) كانت بذرتُها من الثلاثة عشرَ صفّاً (0153)،
 * وصارت «أدويتي» بجدولها وبابها (0229) فخرج ملفُّها من MUST. فلا يرجع بصمت: لا مُرطِّبَ
 * بـmeds.ts، ولا كتابةَ من الواجهة على clinic_meds بأي ملفّ — الطيُّ (0230) بالقاعدة وحدها. */
const RETIRED = "src/lib/meds.ts";
if (/registerHydrator|function hydrate/.test(fs.readFileSync(RETIRED, "utf8"))) {
  console.error(`   ✗ ${RETIRED}: مُرطِّبُ أدوية العيادة رجع — «أدويتي» (0229) بابُها clinicDrugs.ts`);
  bad++;
}
const CLINIC_MEDS_WRITE = /\.from\(\s*["'`]clinic_meds["'`]\s*\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(/;
const medWriters = walk("src").filter((f) => CLINIC_MEDS_WRITE.test(fs.readFileSync(f, "utf8")));
if (medWriters.length) {
  console.error("   ✗ كتابةٌ على clinic_meds من الواجهة: " + medWriters.join("، "));
  bad += medWriters.length;
}

if (bad) {
  console.error(`\n✗ seed-guard: ${bad} كتابةً غيرَ محروسة داخل مُرطِّب.`);
  console.error("  الترطيبُ قراءة. ما يكتب لعيادةٍ لازم يتيقّن أنها عيادتها — لُفَّه بـseedOwnClinic.");
  process.exit(1);
}
console.log(`✓ seed-guard: ${ok} بذرةً محروسةً بـseedOwnClinic في ${FILES.length} ملفَّ مُرطِّبٍ ممسوحاً، ولا كتابةَ عارية.`);
