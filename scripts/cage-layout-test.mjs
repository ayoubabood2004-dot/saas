/* ============================================================================
 * تخطيطُ الأقفاص — خمسةُ شروطٍ كلُّها انكسرت مرّةً بصمت، فتُفحص.
 *
 * الشكوى: «العيادة ترتّب غرفها على حاسبة، وتفتحه على حاسبة ثانية فيصير
 * الترتيب عشوائياً وكل الأقفاص بغرفة وحدة» — والأسوأ أنّ الثانية تكتب ذلك
 * فوق الأولى. وما تفحصه هذه الحزمة هو **الجذر** لا الأعراض:
 *
 *  ١) الترقيةُ من الشكل القديم لا تحرّك قفصاً: تخطيطٌ رُسم قبل الإصلاح يُفتح
 *     كما تركته العيادة. (لو اختلّت الهندسةُ المشتقّة لبدا الترتيبُ «عشوائياً»
 *     بالضبط كما اشتكوا — فالفحصُ يقارن الترتيبَ حرفاً بحرف.)
 *  ٢) اللوحةُ وورقةُ الجولة ترتيبُهما واحد — كانا يفترقان (تلك تفرز بـ`x`
 *     وهذه بترتيب المصفوفة).
 *  ٣) الرموزُ غيرُ المرسومة **تُحسب للعرض** ولا تدخل التخطيط.
 *  ٤) لا بذرةَ تُسلسَل أبداً: مدخلٌ فارغٌ/فاسدٌ ⇒ تخطيطٌ فارغ، لا «غرفة
 *     الإقامة ١٠١–١٠٦». هذه البذرةُ هبطت بسبع عياداتٍ حقيقية.
 *  ٥) التوقيعُ يساوي نفسَه عبر دورةِ كتابةٍ وقراءة — عليه يقوم زرُّ «تحقّق».
 *
 *   node scripts/cage-layout-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const built = await esbuild.build({
  entryPoints: ["src/lib/cageLayout.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
});
const dir = mkdtempSync(join(tmpdir(), "cagelayout-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const L = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* قالبٌ من الإنتاج لا مخترَع: هذا شكلُ صفٍّ حقيقيٍّ بـ`clinic_prefs`. */
const V1 = JSON.stringify([
  { id: "r1", name: "غرفة الإقامة", cages: ["101", "102", "103", "104", "105", "106"] },
  { id: "rmt7diuyz", name: "الفندقة", cages: ["201", "202", "203", "204", "205", "206", "207", "208", "209"] },
]);

console.log("▸ ١) الترقيةُ من الشكل القديم لا تحرّك قفصاً");
const up = L.parseLayout(V1);
check("يُقرأ كشكلٍ قديمٍ ويُرقّى", up.from === 1);
check("  غرفتان", up.rooms.length === 2, String(up.rooms.length));
check("  وخمسةَ عشرَ قفصاً", up.cages.length === 15, String(up.cages.length));
const flat = L.flatRooms(up);
check("أسماءُ الغرف بترتيبها", flat.map((r) => r.name).join("|") === "غرفة الإقامة|الفندقة", flat.map((r) => r.name).join("|"));
/* الحاسم: نفسُ الترتيب حرفاً بحرف بعد الترقية **والفرز الهندسيّ**. */
check("أقفاصُ الغرفة الأولى بترتيبها الأصليّ",
  flat[0].cages.join(",") === "101,102,103,104,105,106", flat[0].cages.join(","));
check("  والثانيةُ كذلك (تسعةٌ تتخطّى عرضَ الصفّ فتنزل صفّاً ثانياً)",
  flat[1].cages.join(",") === "201,202,203,204,205,206,207,208,209", flat[1].cages.join(","));
check("والغرفُ لا تتداخل هندسياً", (() => {
  const a = up.rooms[0], b = up.rooms[1];
  return a.x + a.w <= b.x || b.x + b.w <= a.x;
})());
/* غرفةٌ بثلاثين قفصاً — الحالةُ التي ولّدت «غير مصنّفة» بالإنتاج. */
const big = Array.from({ length: 30 }, (_, i) => `c${i + 1}`);
const upBig = L.parseLayout(JSON.stringify([{ id: "r1", name: "كبيرة", cages: big }]));
check("غرفةٌ بثلاثين قفصاً تبقى غرفةً واحدةً بترتيبها",
  L.flatRooms(upBig)[0].cages.join(",") === big.join(","));
check("  ولا تُخترَع لها غرفةُ «غير مصنّفة»", upBig.rooms.length === 1 && !JSON.stringify(upBig.rooms).includes("غير مصنّفة"));
/* رمزٌ مكرّرٌ بين غرفتين كان يجعل قفصاً يظهر مرّتين ويختفي من إحداهما. */
const dup = L.parseLayout(JSON.stringify([
  { id: "a", name: "أ", cages: ["1", "2"] }, { id: "b", name: "ب", cages: ["2", "3"] },
]));
check("رمزٌ مكرّرٌ بين غرفتين يبقى بأولاهما وحدها", dup.cages.length === 3 && L.flatRooms(dup)[1].cages.join(",") === "3");

console.log("▸ ٢) اللوحةُ وورقةُ الجولة ترتيبُهما واحد");
/* غرفتان أُنشئتا بترتيبٍ مقلوبٍ هندسياً: القديمُ كان يفرز بترتيب المصفوفة
   فتقول الورقةُ «ب ثم أ» واللوحةُ «أ ثم ب». الآن مصدرٌ واحد. */
const mixed = {
  rooms: [
    { id: "b", name: "ب", x: 9, z: 0, w: 2, d: 1 },
    { id: "a", name: "أ", x: 0, z: 0, w: 2, d: 1 },
  ],
  cages: [
    { code: "b2", x: 10, z: 0 }, { code: "b1", x: 9, z: 0 },
    { code: "a2", x: 1, z: 0 }, { code: "a1", x: 0, z: 0 },
  ],
};
const mf = L.flatRooms(mixed);
check("الغرفُ تُفرز هندسياً لا بترتيب المصفوفة", mf.map((r) => r.name).join("|") === "أ|ب", mf.map((r) => r.name).join("|"));
check("  وأقفاصُ كلِّ غرفةٍ كذلك", mf[0].cages.join(",") === "a1,a2" && mf[1].cages.join(",") === "b1,b2");
check("الأرضيُّ قبل العلويِّ بنفس الخلية", (() => {
  const st = { rooms: [{ id: "r", name: "ر", x: 0, z: 0, w: 1, d: 1 }],
               cages: [{ code: "up", x: 0, z: 0, level: 1 }, { code: "dn", x: 0, z: 0 }] };
  return L.flatRooms(st)[0].cages.join(",") === "dn,up";
})());

console.log("▸ ٣) الرموزُ غيرُ المرسومة تُعرض ولا تدخل التخطيط");
const orph = L.orphanCodes(up, ["101", "  301 ", "301", "", "الفندقة-9", "106"]);
check("غيرُ المرسومِ فقط", orph.join(",") === "301,الفندقة-9", orph.join(","));
check("  بلا تكرارٍ ولا فراغ", new Set(orph).size === orph.length && !orph.includes(""));
check("  ولا تتغيّر حالةُ التخطيط", up.cages.length === 15);
check("  والمقارنةُ تتجاهل حالةَ الأحرف والمسافات", L.orphanCodes({ cages: [{ code: "A1" }] }, [" a1 "]).length === 0);

console.log("▸ ٤) لا بذرةَ أبداً — الفراغُ يبقى فراغاً");
for (const [name, raw] of [["null", null], ["فارغ", ""], ["نصٌّ فاسد", "{{{"], ["مصفوفةٌ فارغة", "[]"], ["كائنٌ فارغ", "{}"], ["رقم", "7"]]) {
  const l = L.parseLayout(raw);
  check(`  ${name} ⇒ تخطيطٌ فارغ`, l.rooms.length === 0 && l.cages.length === 0);
}
/* البصمةُ التي هبطت بسبع عياداتٍ حقيقية — لازم لا تخرج من هذه الوحدة أبداً. */
const anySeed = [null, "", "{{{", "[]", "{}"].some((r) => {
  const j = L.serializeLayout(L.parseLayout(r));
  return j.includes("غرفة الإقامة") || j.includes("101");
});
check("ولا يخرج «غرفة الإقامة ١٠١–١٠٦» من أيّ مدخلٍ فارغ", !anySeed);
check("ولا يُخترَع اسمُ غرفةٍ من الشِفرة إطلاقاً", !built.outputFiles[0].text.includes("غير مصنّفة"));

console.log("▸ ٥) دورةُ كتابةٍ وقراءة — عليها يقوم زرُّ «تحقّق»");
const rich = {
  rooms: [{ id: "r1", name: "العزل", x: 0, z: 0, w: 2, d: 2, door: { side: "left", at: 1 } }],
  cages: [
    { code: "A1", x: 0, z: 0, color: "#22d3ee", facing: 2, level: 0 },
    { code: "A2", x: 1, z: 0 }, { code: "A1ف", x: 0, z: 0, level: 1 },
  ],
};
const round = L.parseLayout(L.serializeLayout(rich));
check("الهندسةُ تعود كما كُتبت", JSON.stringify(round.rooms) === JSON.stringify(rich.rooms));
check("  واللونُ والاتجاهُ والطابق", round.cages.find((c) => c.code === "A1").color === "#22d3ee"
  && round.cages.find((c) => c.code === "A1").facing === 2
  && round.cages.find((c) => c.code === "A1ف").level === 1);
check("التوقيعُ ثابتٌ عبر الدورة", L.layoutFingerprint(round) === L.layoutFingerprint(rich));
check("  ويتغيّر بأصغرِ فرق", L.layoutFingerprint({ ...rich, cages: [...rich.cages.slice(1)] }) !== L.layoutFingerprint(rich));
check("  ولا يتأثّر بالنسخة", L.layoutFingerprint(L.parseLayout(L.serializeLayout(rich), 99)) === L.layoutFingerprint(rich));
check("النسخةُ تُقرأ وتُحمل", L.parseLayout(L.serializeLayout(rich), 12).rev === 12);
/* بابٌ بجهةٍ غيرِ معروفة كان يُكتب كما هو فينكسر رسمُ الجدار. */
check("جهةُ بابٍ غيرُ معروفةٍ تُسقَط بدل أن تُصدَّق",
  L.parseLayout(JSON.stringify({ v: 2, rooms: [{ id: "r", name: "ر", x: 0, z: 0, w: 1, d: 1, door: { side: "up", at: 0 } }], cages: [] })).rooms[0].door === undefined);

console.log(fails ? `\n✗ cage-layout-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ cage-layout-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
