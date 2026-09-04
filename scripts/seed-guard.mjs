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

const FILES = ["src/lib/breeds.ts", "src/lib/meds.ts", "src/lib/settings.ts", "src/lib/clinicSync.ts"];
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

if (bad) {
  console.error(`\n✗ seed-guard: ${bad} كتابةً غيرَ محروسة داخل مُرطِّب.`);
  console.error("  الترطيبُ قراءة. ما يكتب لعيادةٍ لازم يتيقّن أنها عيادتها — لُفَّه بـseedOwnClinic.");
  process.exit(1);
}
console.log(`✓ seed-guard: ${ok} بذرةً محروسةً بـseedOwnClinic، ولا كتابةَ عارية داخل مُرطِّب.`);
