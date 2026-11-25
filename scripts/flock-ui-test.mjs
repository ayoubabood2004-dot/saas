/* ============================================================================
 * حالةُ الحقل (0265) — الشاشاتُ بسلوكها، والمفرداتُ بقاموسها.
 *
 *   أ) المفردات (FlockVisit.tsx): كلُّ رمزِ علامةٍ وعضوٍ وآفةٍ وبيئةٍ وتشخيصٍ يقبله الخادمُ (_flock_codes) وله نصٌّ
 *      بالعربية والإنكليزية؛ وقواعدُ الاقتراح لا تسمّي آفةً غيرَ موجودة؛ وكلُّ قيمةٍ تُترجم بمفتاحٍ مركّب
 *      (الطرق، الأنواع، المراحل، الوحدات…) لها نصّ؛ وكلُّ رمزِ رفضٍ بالخادم (raise 'flock_*') له رسالة.
 *   ب) نافقُ اليوم مرسوماً: الفارغُ «ما انسأل» لا يُرسل، والصفرُ المكتوب يُرسل صفراً؛ وفشلُ قاعةٍ لا يُسقط ما
 *      انحفظ قبلها، والإعادةُ ترسل الفاشلةَ وحدها **بمرجعها نفسِه** (لا نسخةَ ثانية).
 *   ج) الزيارة مرسومةً: حفظٌ فارغ لا يلمس نافقَ الزيارة ولا تشريحَها (غيابُ المفتاح ≠ قائمةٌ فارغة)؛ النافقُ «منذ آخر
 *      تسجيل» بأيامه؛ والمسجَّلُ حتى اليوم مقفول؛ والتشريحُ يقترح من آفاته؛ والمرضُ واجبُ التبليغ يُختم ويُرى؛
 *      وتعديلُ زيارةٍ مُسح تشريحُها يرسل [] صريحاً.
 *   د) الطبلة مرسومةً: سحبُ دواءٍ فارغ يبقى null («غير معروف») لا صفراً، وجرعةٌ بلا رقم بلا وحدتها؛ والمُرسَلةُ تُقال.
 *   هـ) الإغلاقُ بيعاً قبل «لا تبيع قبل»: الزرُّ مقفولٌ حتى التأكيد، والتأكيدُ يُرسل صريحاً.
 *   و) الإقلاع: main.tsx يكنس من demoKey.ts لا من demoStore.ts (كانت تجرّ بذرةَ التجريبيّ كلَّها للإقلاع).
 *   ط) ما يصل للمربي (المراجعةُ العدائيّة): «لا تبيع قبل» للوجبة كلّها (نسخةٌ مستبدَلةٌ بسحبٍ أطول تحكم)، والبيضُ بالبيّاض،
 *      والموقوفةُ بأيامها كما انعطت؛ والنسخةُ من طبلةٍ مُرسَلة بتواريخ أيامها نفسِها.
 *   ي) فشلٌ مجهولُ المصير يُقفل النموذجَ على الإعادة بمرجعه، والرفضُ الحاسم لا يُقفل.
 *   ك) الزيارة: نموذجٌ فُتح من حزمةٍ قديمة لا يمسح ما وصل بعده؛ والنافقُ «منذ آخر تسجيل» لا يقفله تسجيلٌ بعد يوم الزيارة،
 *      ورقمٌ بقاعةٍ يومُها مسجَّل يُقال لا يُرسل؛ وتحصينٌ أُشّر ثمّ اختفى صفُّه لا يُختم.
 *   ل) فتحُ الحالة: سؤالُ حقول الزبون فشل ⇒ لا فتح؛ وحقلٌ اختير لزبونٍ سابق لا يُفتح عليه.
 *   م) العلاماتُ التشريحية بأجهزة الجسم (قائمةُ المالك ٢٤/١١، necropsy.ts): كلُّ بندٍ كتبه المالك موجودٌ بجهازه بالّلغتين،
 *      وكلُّ رمزٍ قديم باقٍ (لا يضيع ما سُجّل)؛ والتشريحُ بالسريعة أيضاً؛ «لا توجد آفات» لا تمسح آفاتٍ ولا تبقى مع آفة؛
 *      «طبيعي» لجهازٍ يشيل آفاتِه وآفةٌ تشيله؛ «الباقي طبيعي» لا يمسّ جهازاً فيه آفة؛ «طيرٌ بنفس العلامات»؛ والبحثُ بالطرفين
 *      مطبَّعين؛ وما لا تعرفه النسخةُ من رموزٍ يبقى؛ والملخّصُ يسمّي المجموعةَ حين لا يسمّيها الاسم؛ وقائمةُ الزيارات تقرأ
 *      الأمراضَ المختارة لا المكتوبَ وحده.
 *   ز) والفحصُ ليس فارغاً: كلُّ طفرةٍ معقولة تُسقط فحصاً على الأقلّ.
 *
 *   node scripts/flock-ui-test.mjs
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const J = (x) => JSON.stringify(x);
const SRC = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const swap = (src, from, to) => {
  if (!src.includes(from)) throw new Error(`الطفرة لم تجد نصَّها: ${from.slice(0, 90)}`);
  return src.split(from).join(to);
};
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

/* ── أ) المفردات والقاموس ─────────────────────────────────────────────────────── */
console.log("▸ أ) المفردات والقاموس");
const AR = JSON.parse(SRC("src/i18n/ar.json"));
const EN = JSON.parse(SRC("src/i18n/en.json"));
const get = (o, k) => k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
const both = (k) => typeof get(AR, k) === "string" && typeof get(EN, k) === "string";
const VISIT = SRC("src/components/flock/FlockVisit.tsx");
const lit = (name) => {
  const m = new RegExp(`const ${name}(?:: [^=]+)? = (\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\n\\});`).exec(VISIT);
  if (!m) throw new Error(`ما لكيت ${name} بـFlockVisit.tsx`);
  return Function(`"use strict"; return (${m[1]});`)();
};
const SIGNS = lit("SIGNS"), ENV = lit("ENV"), DX = lit("DX"), RULES = lit("RULES");
/** مفرداتُ التشريح وحدةٌ صِرفة بلا اعتماديات (necropsy.ts) — تُحزم وحدها هنا للفحص الثابت. */
const N0 = await (async () => {
  const out = await esbuild.build({ entryPoints: ["src/components/flock/necropsy.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  const dir = mkdtempSync(join(tmpdir(), "flock-necro-"));
  const f = join(dir, "n.mjs");
  writeFileSync(f, out.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
})();
const CODE = /^[a-z][a-z0-9_]{0,30}(\.[a-z0-9_]{1,30})?$/;   // _flock_codes بـ0265 حرفاً
const bad = [];
for (const [g, xs] of Object.entries(SIGNS)) for (const x of xs) { if (!CODE.test(`${g}.${x}`)) bad.push(`sign ${g}.${x}`); if (!both(`flkv.sign.${g}.${x}`)) bad.push(`flkv.sign.${g}.${x}`); }
for (const g of Object.keys(SIGNS)) if (!both(`flkv.signGroup.${g}`)) bad.push(`flkv.signGroup.${g}`);
const KNOWN = [...N0.ALL_CODES, ...N0.RETIRED.map((r) => r.code)];
for (const code of KNOWN) { if (!CODE.test(code)) bad.push(`lesion ${code}`); if (!both(`flkv.lesion.${code}`)) bad.push(`flkv.lesion.${code}`); }
for (const sys of N0.NECRO_SYSTEMS) {
  if (!CODE.test(N0.normalOf(sys.k))) bad.push(`normal ${sys.k}`);
  if (!both(`flkv.sys.${sys.k}`)) bad.push(`flkv.sys.${sys.k}`);
  for (const sub of sys.subs) if (sub.k !== "gen" && !both(`flkv.sub.${sub.k}`)) bad.push(`flkv.sub.${sub.k}`);
}
for (const k of ENV) { if (!/^[a-z][a-z0-9_]{0,30}$/.test(k)) bad.push(`env ${k}`); if (!both(`flkv.env.${k}`) || !both(`flkv.envAdvice.${k}`)) bad.push(`flkv.env.${k}`); }
for (const x of DX) { if (!CODE.test(x)) bad.push(`dx ${x}`); if (!both(`flk.dx.${x}`)) bad.push(`flk.dx.${x}`); }   // بنطاق الحالة: قائمةُ الزيارات تقرؤها
check(`${Object.values(SIGNS).flat().length} علامة و${KNOWN.length} آفة بـ${N0.NECRO_SYSTEMS.length} أجهزة و${ENV.length} بنودِ بيئة و${DX.length} تشخيصاً: رموزٌ يقبلها الخادم ولها نصّ بالّلغتين`, !bad.length, bad.slice(0, 6).join("، "));
const lesions = new Set(KNOWN);
const ruleBad = RULES.flatMap((r) => [...(DX.includes(r.dx) ? [] : [`dx ${r.dx}`]), ...r.any.flat().filter((c) => !lesions.has(c))]);
check("  وقواعدُ اقتراح التشخيص لا تسمّي آفةً ولا مرضاً غيرَ موجود", RULES.length >= 6 && !ruleBad.length, ruleBad.join("، "));

/* قائمةُ المالك (٢٤/١١) حرفاً، بجهازها — الاسمُ العربيّ قبل المصطلح اللاتينيّ. صُحّح منها خطأُ طباعةٍ واحد («وحتقان» ⇐ «واحتقان»)،
   وكلمةٌ سقطت («القصبة الهوائية (Tracheitis)» ⇐ «التهاب القصبة الهوائية»)؛ و«نزف تحت الجلد» العامّةُ قُصّت برسالته فهي نفسُ بند الجلد. */
const OWNER = {
  gen: ["لا توجد آفات تشريحية واضحة", "هزال شديد", "احتقان عام", "نزف عام", "تجمع سوائل في التجويف البطني", "تجمع سوائل حول القلب", "التهاب الأغشية المصلية",
    "التصاقات الأحشاء", "تضخم الأعضاء الداخلية", "شحوب الأعضاء", "اصفرار الأنسجة والأعضاء", "جفاف الجسم", "وذمة الأنسجة", "نزف تحت الجلد"],
  dig: ["التهاب الأمعاء النخري", "تضخم الأمعاء", "ترقق جدار الأمعاء", "سماكة جدار الأمعاء", "وجود نزف واحتقان داخل الأمعاء", "وجود قوالب دموية",
    "وجود مواد متجبنة داخل الأمعاء", "وجود غاز وانتفاخ الأمعاء", "نشاط كوكسيديا", "سالمونيلا", "نزف الأعورين", "تضخم الأعورين", "بقع نزفية في الأعورين",
    "تضخم الكبد", "شحوب الكبد", "احتقان الكبد", "نزف كبدي", "تنخر الكبد", "بقع بيضاء على الكبد", "بقع صفراء على الكبد", "وجود بؤر نخرية متعددة",
    "تضخم الكبد مع هشاشة النسيج", "الكبد الدهني"],
  heart: ["تجمع سوائل حول القلب", "التهاب التامور الفبريني", "نزف على سطح القلب", "تضخم القلب", "شحوب عضلة القلب", "تنخر عضلة القلب", "وجود ترسبات فبرينية حول القلب"],
  resp: ["التهاب القصبة الهوائية", "احتقان القصبة الهوائية", "نزف القصبة الهوائية", "زيادة المخاط", "وجود سدادات مخاطية", "وجود قوالب دموية",
    "وجود مواد متجبنة داخل القصبة", "احتقان الرئتين", "وذمة الرئتين", "التهاب الرئة", "تكثف الرئة", "نزف الرئتين", "التهاب الأكياس الهوائية",
    "تعكر الأكياس الهوائية", "سماكة الأكياس الهوائية", "ترسبات فبرينية", "وجود مواد متجبنة", "وجود عقيدات فطرية"],
  kidney: ["تضخم الكلى", "شحوب الكلى", "احتقان الكلى", "التهاب الكلى", "ترسب اليورات داخل الأنابيب الكلوية", "تضخم الحالبين", "امتلاء الحالبين باليورات",
    "النقرس الحشوي", "ترسبات بيضاء طباشيرية على الأحشاء", "ضمور الكلى"],
  spleen: ["تضخم الطحال", "ضمور الطحال", "احتقان الطحال", "شحوب الطحال", "نزف الطحال", "وجود بؤر نخرية", "وجود بقع بيضاء", "وجود عقيدات"],
  repro: ["التهاب قناة البيض", "وجود مواد متجبنة داخل قناة البيض", "التهاب المبيض", "نزف المبيض", "ضمور المبيض", "وجود جريبات مبيضية غير طبيعية",
    "التهاب الصفاق الناتج عن صفار البيض", "وجود صفار حر في التجويف البطني", "التصاقات حول قناة البيض"],
  msk: ["نزف عضلات الصدر", "نزف عضلات الفخذ", "تنخر العضلات", "التهاب العضلات", "شحوب العضلات", "التهاب المفاصل", "تورم المفاصل", "وجود سوائل داخل المفاصل",
    "التهاب غمد الأوتار", "التهاب الجلد", "التهاب النسيج الخلوي", "وجود خراجات تحت الجلد", "وجود أورام جلدية", "نزف تحت الجلد"],
};
const arMain = (code) => N0.splitTerm(get(AR, `flkv.lesion.${code}`) ?? "").main;
const ownerMiss = Object.entries(OWNER).flatMap(([k, items]) => {
  const sys = N0.NECRO_SYSTEMS.find((x) => x.k === k);
  const have = new Set((sys?.subs ?? []).flatMap((x) => x.codes).map(arMain));
  return items.filter((it) => !have.has(it)).map((it) => `${k}: ${it}`);
});
check(`قائمةُ المالك كلُّها (${Object.values(OWNER).flat().length} بنداً بثمانية أجهزة) موجودةٌ بجهازها باسمه`, !ownerMiss.length && N0.NECRO_SYSTEMS.slice(0, 2).map((x) => x.k).join() === "gen,dig", ownerMiss.slice(0, 6).join("، "));
// ما كان قبلها (0265) — كلُّ رمزٍ باقٍ يُختار أو يُقرأ: ما سُجّل بزياراتٍ قبلها لا يصير «رمزاً غريباً».
const OLD = ["ext.emaciation", "ext.dehydration", "ext.omphalitis", "ext.pododermatitis", "ext.hock_burn", "ext.breast_blister", "ext.pox", "ext.head_swelling", "ext.vent_pasting",
  "head.sinusitis", "head.conjunctivitis", "head.congestion", "head.mucus", "head.hemorrhage", "head.caseous_plug", "head.diphtheritic",
  "lung.congestion", "lung.pneumonia", "lung.airsac_foamy", "lung.airsac_cloudy", "heart.pericarditis", "heart.hydropericardium", "heart.ascites",
  "liver.perihepatitis", "liver.enlarged", "liver.necrotic_foci", "liver.spleen_enlarged", "prov.gland_hemorrhage", "prov.proventriculitis", "prov.gizzard_erosion",
  "gut.distended", "gut.thin_wall", "gut.excess_fluid", "gut.orange_mucus", "gut.blood", "gut.white_spots", "gut.necrosis", "gut.peyer_hemorrhage", "gut.undigested", "gut.cecal_cores",
  "kidney.swollen", "kidney.urates", "bursa.edema", "bursa.yellow_exudate", "bursa.hemorrhage", "bursa.atrophy",
  "repro.ovary_atrophy", "repro.egg_peritonitis", "repro.salpingitis", "repro.cystic_oviduct",
  "msk.muscle_hemorrhage", "msk.rubbery_bones", "msk.td", "msk.fhn", "msk.arthritis", "msk.sciatic"];
const lost = OLD.filter((c) => !lesions.has(c));
check(`  وكلُّ رمزٍ قبلها (${OLD.length}) باقٍ — يُختار، أو يُقرأ ويُشال إن تقاعد`, !lost.length && OLD.filter((c) => N0.ALL_CODES.includes(c)).length >= OLD.length - N0.RETIRED.length, lost.join("، "));
const strangers = [...N0.SELF_NAMED].filter((c) => !lesions.has(c));
check("  و«يسمّي عضوَه» لا يسمّي رمزاً غيرَ موجود", !strangers.length, strangers.join("، "));
// الملخّصُ (والتقريرُ للمربي) لا يكتب نصّاً واحداً لرمزين — وإلا عُدّ «وجود قوالب دموية ٢/٥» عن الأمعاء والقصبة معاً.
for (const [lang, dict] of [["ar", AR], ["en", EN]]) {
  const seen = new Map();
  const dup = [];
  for (const code of KNOWN) {
    const txt = N0.lesionText(code, (c) => get(dict, `flkv.lesion.${c}`) ?? c, (k) => get(dict, `flkv.sub.${k}`) ?? k, (o) => o);
    if (seen.has(txt)) dup.push(`${seen.get(txt)} = ${code} («${txt}»)`); else seen.set(txt, code);
  }
  check(`  ${lang}: نصُّ الملخّص لا يتكرّر لرمزين (${seen.size})`, !dup.length, dup.slice(0, 4).join("، "));
}

const TYPES = SRC("src/lib/flockTypes.ts");
const union = (name) => [...(new RegExp(`export type ${name} = ([^;]+);`).exec(TYPES)?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const ENUMS = {
  "flk.kind": union("FlockKind"), "flk.route": [...new Set([...union("FlockRoute"), ...union("FlockLineRoute")])],
  "flk.lineKind": union("FlockLineKind"), "flk.unit": union("FlockDoseUnit"), "flk.per": union("FlockDosePer"),
  "flk.feedPhase": union("FeedPhase"), "flk.trend": union("FlockTrend"), "flkv.grade": union("FlockGrade"),
  "flk.close.reason": ["sold", "depleted", "transferred", "other"], "flk.givenBy": ["vet", "farmer", "hatchery", "other"],
  "flk.mort.src": ["visit", "staff", "farmer"], "flk.tx.status": ["active", "done", "stopped", "replaced"],
  "flk.vax.status": ["planned", "given", "skipped"], "flk.visitKind": ["routine", "complaint", "followup"],
  "flkv.birdSrc": ["dead", "cull", "sacrificed"], "flkv.comp": ["yes", "partial", "no"], "flkv.dxStatus": ["suspected", "confirmed"],
};
const enumBad = Object.entries(ENUMS).flatMap(([p, vs]) => (vs.length ? vs.filter((v) => !both(`${p}.${v}`)).map((v) => `${p}.${v}`) : [`${p} (فارغ)`]));
check(`  وكلُّ قيمةٍ تُترجم بمفتاحٍ مركّب لها نصّ (${Object.values(ENUMS).flat().length} قيمةً بـ${Object.keys(ENUMS).length} عائلة)`, !enumBad.length, enumBad.join("، "));
const MIG = SRC("supabase/migrations/0265_flock_cases.sql");
const codes = [...new Set([...MIG.matchAll(/raise exception '(flock_[a-z_]+)'/g)].map((m) => m[1]))];
const errBad = codes.filter((c) => !both(`flk.err.${c}`));
check(`  وكلُّ رمزِ رفضٍ بالخادم (${codes.length}) له رسالةٌ بالّلغتين — التجريبيُّ يرمي بالرمز وحده`, codes.length >= 30 && !errBad.length, errBad.join("، "));
const DEMO = SRC("src/lib/demoFlock.ts");
const demoCodes = [...new Set([...DEMO.matchAll(/fail\("(flock_[a-z_]+)"/g)].map((m) => m[1]))];
check("  ورموزُ المرآة التجريبية من رموز الخادم نفسِها", demoCodes.length >= 20 && demoCodes.every((c) => codes.includes(c)), demoCodes.filter((c) => !codes.includes(c)).join("، "));

/* ── و) الإقلاع ──────────────────────────────────────────────────────────────── */
console.log("▸ و) الإقلاع لا يجرّ بذرةَ التجريبيّ");
const MAIN = SRC("src/main.tsx");
check("main.tsx يكنس من demoKey.ts ولا يستورد demoStore.ts", /from "\.\/lib\/demoKey"/.test(MAIN) && !/demoStore/.test(MAIN));
check("  وdemoStore.ts يعيد تصديرَ الكنس ويأخذ مفتاحَه من demoKey (مفتاحٌ واحد)", /export \{ pruneStaleStorage \} from "\.\/demoKey"/.test(SRC("src/lib/demoStore.ts")) && /const KEY = DEMO_DB_KEY;/.test(SRC("src/lib/demoStore.ts")));

/* ── ح) اليومُ المحلّيّ لختم الخادم ─────────────────────────────────────────────── */
console.log("▸ ح) يومُ ختم الخادم يومُ بغداد لا يومُ غرينتش");
const FLOCK_UI = ["src/pages/FlockCases.tsx", ...["FlockCase", "FlockSheets", "FlockTreatment", "FlockVisit", "FlockIntake"].map((f) => `src/components/flock/${f}.tsx`)];
const sliced = FLOCK_UI.flatMap((f) => SRC(f).split("\n").map((l, i) => [f, i + 1, l]))
  .filter(([, , l]) => /\b(?:at|[a-z]+_at)\.slice\(0, 10\)/.test(l) && !/\bd\.at\.slice/.test(l));
check("لا شاشةَ حقلٍ تقطع ختماً من الخادم بـslice(0, 10) — كلُّها بـlocalDay", !sliced.length, sliced.map(([f, n]) => `${f.split("/").pop()}:${n}`).join("، "));

/* ── م) توصيلُ صفحة الحالة (ليست بحزمة الفحص): القائمةُ والخطُّ الزمنيّ يقرآن dxText، والأقسامُ شبكةٌ بعرض الشاشة ── */
console.log("▸ م) صفحةُ الحالة");
const CASE = SRC("src/components/flock/FlockCase.tsx");
check("قائمةُ الزيارات والخطُّ الزمنيّ يقرآن التشخيصَ من dxText (الأمراضُ المختارة لا المكتوبُ وحده)",
  (CASE.match(/dxText\(t, v\)/g) ?? []).length >= 3 && !/\[v\.dx, necro/.test(CASE) && !/\(v\.dx \? ` · \$\{v\.dx\}`/.test(CASE));
check("  والأقسامُ السبعة شبكةٌ تملأ العرض (٤ بالهاتف، ٧ من sm) بلا انزلاقٍ جانبيّ",
  /grid grid-cols-4 gap-1\.5 rounded-2xl border border-line bg-surface-2 p-1\.5 sm:grid-cols-7" role="tablist"/.test(CASE) && !/overflow-x-auto pb-1" role="tablist"/.test(CASE));

/* ── البناء: المكوّناتُ الحقيقية مع بدائلَ للباب والسياق ─────────────────────────── */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, open: () => null };
// النصُّ مفتاحُه، ومعه قيمُ الإقحام (اليوم، العمر…) — فالفحصُ يرى ما يُقال لا اسمَ المفتاح وحده.
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); const s = typeof d === "string" ? d : (opt.defaultValue !== undefined ? opt.defaultValue : k); const { defaultValue, ...vals } = opt; return String(s) + (Object.keys(vals).length ? "|" + JSON.stringify(vals) : ""); }`;
const icons = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "lucide-react": `import { createElement } from "react";\n${icons.map((k) => `export const ${k} = () => createElement("x-icon");`).join("\n")}`,
  "@/components/ui": `import { createElement } from "react";
    export const Dialog = ({ open, title, children, footer, description }) => (open ? createElement("x-Dialog", null, createElement("x-title", null, title), description ?? null, children, createElement("x-footer", null, footer)) : null);
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Badge = ({ children, tone, dot, icon, ...p }) => createElement("x-badge", p, children);
    export const useToast = () => globalThis.__toast;`,
  "@/lib/flockApi": "export const flockApi = new Proxy({}, { get: (_t, k) => globalThis.__api[k] });",
  "@/contexts/AuthContext": "export const useAuth = () => ({ user: { id: 'u1', clinic_id: 'k1' } });",
  "@/lib/useFormDraft": "export const useFormDraft = () => ({ offer: null, more: 0, saved: 'full', take: () => null, dismiss: () => null, restoreDismissed() {}, clear() { globalThis.__draftCleared = (globalThis.__draftCleared || 0) + 1; } });",
  "@/lib/lazyPage": "export const page = () => () => null;",
  // زرّا «صوّر / من الجهاز» (نطاق att) قطعةٌ كسولة لا شأنَ لها بما يُفحص هنا — وحزمُها تجرّ i18n كلَّه.
  "@/components/attach/Attach": "export const PhotoSource = () => null;",
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  "@/lib/quotas": "export const sendWhatsApp = async (m) => { globalThis.__wa.push(m); }; export const useWarmWaQuota = () => {}; export const quotaMessage = () => null;",
  "@/lib/settings": "export const getClinicName = () => 'Clinic'; export const getClinicLogo = () => null; export const getDialCode = () => '+964';",
  "@/lib/phone": "export const waNumber = (p) => String(p).replace(/\\D/g, '');",
  "@/lib/image": "export const prepareUpload = async () => ({ blob: null, dataUrl: '', ext: 'jpg', contentType: 'image/jpeg' });",
  // errors.ts حقيقيّة (لا اعتماديات): الإقفالُ بعد «مجهول المصير» يُفحص بتصنيفها نفسِه (rejectedBeforeCommit).
  "@/components/PhoneInput": `import { createElement } from "react"; export const PhoneInput = ({ value, onChange }) => createElement("input", { value, onChange: (e) => onChange(e.target.value), "data-phone": 1 });`,
  "@/components/GovernorateAreaPicker": "export const GovernorateAreaPicker = () => null;",
  "react-router-dom": "export const useNavigate = () => (to) => { globalThis.__nav.push(to); }; export const useLocation = () => ({ state: globalThis.__locState ?? null, pathname: '/poultry/new', search: '' });",
};
const FILES = {
  necro: "src/components/flock/necropsy.ts",
  shared: "src/components/flock/flockShared.ts",
  sheets: "src/components/flock/FlockSheets.tsx",
  tx: "src/components/flock/FlockTreatment.tsx",
  visit: "src/components/flock/FlockVisit.tsx",
  intake: "src/components/flock/FlockIntake.tsx",
};
async function build(over = {}) {
  const built = await esbuild.build({
    stdin: {
      contents: `export { MortalitySheet, CloseSheet } from "./${FILES.sheets}";\nexport { TreatmentSheet, sheetText } from "./${FILES.tx}";\nexport { FlockOpenPage } from "./${FILES.intake}";\nexport { FlockVisit } from "./${FILES.visit}";\nexport { flockStats, addDays } from "./src/lib/flockMath.ts";\nexport { localDay, dxText } from "./${FILES.shared}";\nexport * as N from "./${FILES.necro}";\nexport { searchable } from "./src/lib/utils.ts";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
      resolveDir: process.cwd(), sourcefile: "flock-ui.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    loader: { ".css": "empty" },   // ورقةُ أنماط قطعة الصور الكسولة (attach.css) لا شأنَ لها بالسلوك
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "flock-ui",
      setup(b) {
        for (const [k, p] of Object.entries(FILES)) if (over[k]) {
          b.onLoad({ filter: new RegExp(p.replace(/[/.]/g, (c) => (c === "/" ? "[\\\\/]" : "\\.")) + "$") }, () => ({ contents: over[k], loader: "tsx" }));
        }
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUB, a.path) ? { path: a.path, namespace: "flk-stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "flk-stub" }, (a) => ({ contents: STUB[a.path], loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "flock-ui-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  try { return await import(pathToFileURL(file).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ── البيانات ─────────────────────────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, "0");
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
function bundleOf(M, o = {}) {
  const placed = M.addDays(TODAY, -11);
  const b = {
    case: { id: "c1", clinic_id: "k1", farm_id: "f1", kind: o.kind ?? "broiler", breed: null, hatchery: null, placed_on: placed, placed_count: 10000, vet_id: null,
      status: "open", closed_on: null, close_reason: null, sold_count: null, sold_avg_kg: null, note: null, created_at: `${placed}T08:00:00Z`, created_by: null, updated_at: "2026-11-01T00:00:00Z" },
    farm: { id: "f1", clinic_id: "k1", name: "Farm", owner_name: "Owner", owner_phone: "07701234567", cust_key: null, governorate: null, area: null, houses_count: null, note: null, archived: false, created_at: "", updated_at: "" },
    houses: o.houses ?? [], mortality: o.mortality ?? [], visits: o.visits ?? [], necropsy: o.necropsy ?? [], vax: o.vax ?? [], treatments: o.treatments ?? [], media: [],
  };
  b.stats = M.flockStats(b, TODAY);
  return b;
}
const H2 = [{ id: "h1", case_id: "c1", label: "H1", placed_count: 6000, position: 0 }, { id: "h2", case_id: "c1", label: "H2", placed_count: 4000, position: 1 }];
const mrow = (o) => ({ id: "m0", case_id: "c1", house_id: null, on_date: TODAY, days: 1, dead: 0, culled: 0, source: "staff", visit_id: null, note: null, created_at: "", updated_at: "", ...o });
/** t للنداء المباشر (sheetText): المفتاحُ وقيمُ إقحامه — كبديل الحزمة. */
const tt = (k, o) => k + (o && Object.keys(o).length ? "|" + JSON.stringify(o) : "");
/** «١٧/١١» كما تكتبه dayLabel لسنةٍ واحدة. */
const lbl = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const txRow = (o) => ({ id: "t1", case_id: "c1", visit_id: null, title: null, start_on: TODAY, status: "active", stopped_on: null, version: 1, supersedes: null,
  sent_at: null, printed_at: null, note: null, created_at: "", updated_at: "2026-11-03T00:00:00Z", lines: [], ...o });
const lnRow = (o) => ({ id: "l1", treatment_id: "t1", position: 0, day_from: 1, day_to: 5, product_id: null, product_name: "Drug", kind: "med", dose_amount: null,
  dose_unit: null, dose_per: null, strength_pct: null, hours: null, route: "water", withdrawal_meat_days: 3, withdrawal_egg_days: null, note: null, ...o });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reset = () => {
  globalThis.__calls = []; globalThis.__wa = []; globalThis.__toasts = []; globalThis.__draftCleared = 0; globalThis.__nav = []; globalThis.__locState = null;
  globalThis.__toast = { success: (t) => __toasts.push(["ok", t]), error: (t) => __toasts.push(["err", t]), warn: (t) => __toasts.push(["warn", t]), toast: (t) => __toasts.push(["t", t.title]) };
};
const typeIn = (n, value) => { if (!n) throw new Error("typeIn: لا عقدة"); n.props.onChange({ target: { value, checked: value } }); };
/** عقدةٌ داخل عقدة (أوّلُ ما يحمل الخاصّية). */
const inside = (root, attr, v) => { const out = []; const walk = (n) => { if (n.props && attr in n.props && (v === undefined || String(n.props[attr]) === String(v))) out.push(n); n.children.forEach(walk); }; walk(root); return out; };

/** الجولةُ كلُّها على حزمةٍ معطاة؛ c يعدّ الساقط (لجولات الطفرات) أو يطبع (للأصل). */
async function run(M, c) {
  const { React } = M;
  const el = React.createElement;

  /* ب) نافقُ اليوم */
  {
    reset();
    let fail = null, saved = 0;
    globalThis.__api = { saveMortality: async (p) => { __calls.push(p); if (fail && p.house_id === fail) throw Object.assign(new Error("flock_mortality_over"), { code: "P0001" }); return { ...p, id: `m${__calls.length}`, replayed: false }; } };
    const b = bundleOf(M, { houses: H2 });
    let ui = M.mount(el(M.MortalitySheet, { b, onClose() {}, onSaved() { saved++; } }));
    typeIn(ui.findAll("data-flock-dead")[0], "30");
    ui.click(ui.find("data-flock-save")); await flush();
    c("ب١ قاعةٌ بنافق والأخرى فارغة ⇒ نداءٌ واحد (الفارغُ «ما انسأل» لا صفر)", __calls.length === 1 && __calls[0].house_id === "h1" && __calls[0].dead === 30 && __calls[0].culled === 0 && __calls[0].days === 1 && __calls[0].source === "staff" && !!__calls[0].client_ref && saved === 1, J(__calls));
    ui.unmount();

    reset(); saved = 0;
    ui = M.mount(el(M.MortalitySheet, { b, onClose() {}, onSaved() { saved++; } }));
    typeIn(ui.findAll("data-flock-dead")[0], "30"); typeIn(ui.findAll("data-flock-dead")[1], "0");
    ui.click(ui.find("data-flock-save")); await flush();
    c("ب٢ وصفرٌ مكتوب يُرسل صفراً (يومٌ معروفٌ بلا نافق)", __calls.length === 2 && __calls[1].house_id === "h2" && __calls[1].dead === 0 && __calls[1].culled === 0, J(__calls));
    ui.unmount();

    reset(); saved = 0; fail = "h2";
    ui = M.mount(el(M.MortalitySheet, { b, onClose() {}, onSaved() { saved++; } }));
    typeIn(ui.findAll("data-flock-dead")[0], "30"); typeIn(ui.findAll("data-flock-dead")[1], "5");
    ui.click(ui.find("data-flock-save")); await flush();
    const ref2 = __calls[1]?.client_ref;
    c("ب٣ فشلُ قاعةٍ يُقال باسمها، وما انحفظ قبلها باقٍ، والنافذةُ لا تُغلق «تمّ»", __calls.length === 2 && saved === 0 && ui.findAll("data-flock-house-err").length === 1 && __toasts.some(([k]) => k === "warn"), J({ n: __calls.length, saved, toasts: __toasts }));
    fail = null;
    ui.click(ui.find("data-flock-save")); await flush();
    c("ب٤ والإعادةُ ترسل الفاشلةَ وحدها بمرجعها نفسِه — لا نسخةَ ثانية للمنحفظة", __calls.length === 3 && __calls[2].house_id === "h2" && __calls[2].client_ref === ref2 && saved === 1, J(__calls.map((x) => [x.house_id, x.client_ref])));
    ui.unmount();
  }

  /* ج) الزيارة */
  {
    reset();
    globalThis.__api = { saveVisit: async (p) => { __calls.push(p); return { visit: { id: "v9", ...p }, replayed: false }; } };
    let savedMsg = null;
    let b = bundleOf(M);
    let ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved(m) { savedMsg = m; } }));
    ui.click(ui.find("data-flock-save")); await flush();
    const p0 = __calls[0] ?? {};
    c("ج١ حفظٌ فارغ: لا مفتاحَ نافقٍ ولا تشريح (لا يُمسّان) — والمرجعُ من الجهاز والمسودّةُ تُمسح", __calls.length === 1 && !("mortality" in p0) && !("necropsy" in p0) && !!p0.client_ref && p0.case_id === "c1" && p0.quick === true && globalThis.__draftCleared === 1 && savedMsg != null, J(Object.keys(p0)));
    ui.unmount();

    reset();
    b = bundleOf(M, { mortality: [mrow({ id: "m1", on_date: M.addDays(TODAY, -3), dead: 4 })] });
    ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-v-dead"), "12");
    ui.click(ui.find("data-flock-save")); await flush();
    const pm = __calls[0]?.mortality?.[0];
    c("ج٢ النافقُ «منذ آخر تسجيل»: آخرُه قبل ٣ أيام ⇒ صفٌّ بيوم الزيارة يغطّي ٣ أيام", !!pm && pm.house_id === null && pm.on_date === TODAY && pm.days === 3 && pm.dead === 12 && pm.culled === 0, J(__calls[0]?.mortality));
    ui.unmount();

    reset();
    b = bundleOf(M, { mortality: [mrow({ id: "m1", on_date: TODAY, dead: 4 })] });
    ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved() {} }));
    c("ج٣ والمسجَّلُ حتى يوم الزيارة مقفول (التداخلُ يرفضه الخادم)", ui.find("data-flock-v-dead")?.props.disabled === true);
    ui.unmount();

    reset();
    b = bundleOf(M);
    ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved() {} }));
    ui.click(ui.find("data-flock-quick", "0"));
    ui.click(ui.find("data-flock-add-bird"));
    ui.click(ui.find("data-flock-sys", "heart")); ui.click(ui.find("data-chip", "heart.pericarditis"));
    ui.click(ui.find("data-flock-sys", "dig")); ui.click(ui.find("data-chip", "liver.perihepatitis"));
    const sug = ui.find("data-flock-dx-suggest");
    c("ج٤ التشريحُ يقترح من آفاته (التامور + محفظة الكبد ⇒ كولاي)", !!sug && ui.text(sug).includes("flk.dx.colibacillosis"), sug ? ui.text(sug) : "(لا اقتراح)");
    ui.click(ui.find("data-chip", "hpai"));
    c("ج٥ ومرضٌ واجبُ التبليغ يُرى فوراً", ui.findAll("data-flock-notifiable").length >= 1);
    ui.click(ui.find("data-flock-save")); await flush();
    const pn = __calls[0] ?? {};
    c("ج٦ ويُختم بالحفظ: notifiable، والطيرُ بآفاته", pn.notifiable === true && pn.dx_codes?.includes("hpai") && pn.necropsy?.length === 1 && pn.necropsy[0].findings.includes("heart.pericarditis") && pn.necropsy[0].findings.includes("liver.perihepatitis"), J({ n: pn.notifiable, dx: pn.dx_codes, ne: pn.necropsy }));
    ui.unmount();

    reset();
    c("ج٨ ختمُ ٢١:٣٠ غرينتش يومُ بغداد التالي (localDay)", M.localDay("2026-11-10T21:30:00.000Z") === "2026-11-11", M.localDay("2026-11-10T21:30:00.000Z"));
    {
      const late = { id: "v2", case_id: "c1", at: `${M.addDays(TODAY, -1)}T21:30:00.000Z`, kind: "routine", quick: true, vet_id: null, flock: {}, signs: [], env: {}, dx: null, dx_codes: [], dx_status: null,
        notifiable: false, advice: null, notes: null, trend: null, next_visit_on: null, compliance: {}, created_at: "", created_by: null, updated_at: "2026-11-02T00:00:00Z" };
      const bl = bundleOf(M, { visits: [late] });
      const vu = M.mount(el(M.FlockVisit, { b: bl, visit: late, canEdit: false, onClose() {}, onSaved() {} }));
      const shown = vu.text();
      c("ج٩ زيارةٌ ٠٠:٣٠ ببغداد تُعرض بعمر اليوم (١٢) لا أمس (١١)", shown.includes('"age":12') && !shown.includes('"age":11'), shown.slice(0, 160));
      vu.unmount();
    }
    reset();
    const v = { id: "v1", case_id: "c1", at: `${TODAY}T07:00:00.000Z`, kind: "routine", quick: false, vet_id: null, flock: {}, signs: [], env: {}, dx: null, dx_codes: [], dx_status: null,
      notifiable: false, advice: null, notes: null, trend: null, next_visit_on: null, compliance: {}, created_at: "", created_by: null, updated_at: "2026-11-02T00:00:00Z" };
    const nec = [1, 2].map((no) => ({ id: `n${no}`, case_id: "c1", visit_id: "v1", bird_no: no, source: "dead", weight_g: null, findings: ["lung.airsac_cloudy"], scores: {}, note: null }));
    b = bundleOf(M, { visits: [v], necropsy: nec });
    ui = M.mount(el(M.FlockVisit, { b, visit: v, canEdit: true, onClose() {}, onSaved() {} }));
    ui.click(ui.find("data-flock-visit-edit"));
    for (let i = 0; i < 2; i++) { const form = ui.find("data-flock-bird-form"); const del = inside(form, "aria-label", "flk.delete")[0]; ui.click(del); }
    ui.click(ui.find("data-flock-save")); await flush();
    const pe = __calls[0] ?? {};
    c("ج٧ تعديلُ زيارةٍ مُسح تشريحُها كلُّه ⇒ [] صريحاً (لا «غائب» يُبقي القديم)", pe.id === "v1" && pe.expect_updated_at === v.updated_at && Array.isArray(pe.necropsy) && pe.necropsy.length === 0 && !pe.client_ref, J({ id: pe.id, ne: pe.necropsy, ref: pe.client_ref }));
    ui.unmount();
  }

  /* د) الطبلة */
  {
    reset();
    globalThis.__api = { saveTreatment: async (p) => { __calls.push(p); return { id: p.id ?? "t9", version: p.id ? 2 : 1, lines: [], replayed: false }; } };
    const b = bundleOf(M);
    let ui = M.mount(el(M.TreatmentSheet, { b, onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-product"), "Doxy");
    ui.click(ui.find("data-flock-save")); await flush();
    const l0 = __calls[0]?.lines?.[0] ?? {};
    c("د١ سحبُ دواءٍ فارغ يبقى null («غير معروف» بصوت) — لا صفراً", __calls.length === 1 && l0.kind === "med" && l0.withdrawal_meat_days === null && !!__calls[0].client_ref, J(l0));
    c("  وجرعةٌ بلا رقم بلا وحدتها ولا أساسها (قيدُ الخادم: الثلاثةُ معاً)", l0.dose_amount === null && l0.dose_unit === null && l0.dose_per === null, J(l0));
    ui.unmount();

    reset();
    ui = M.mount(el(M.TreatmentSheet, { b, onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-product"), "Doxy"); typeIn(ui.find("data-flock-wd"), "0"); typeIn(ui.find("data-flock-dose"), "1");
    ui.click(ui.find("data-flock-save")); await flush();
    const l1 = __calls[0]?.lines?.[0] ?? {};
    c("د٢ وصفرٌ مكتوب = «بلا سحب» صفراً، والجرعةُ بوحدتها وأساسها", l1.withdrawal_meat_days === 0 && l1.dose_amount === 1 && l1.dose_unit === "g" && l1.dose_per === "liter", J(l1));
    ui.unmount();

    reset();
    const tx = { id: "t1", case_id: "c1", visit_id: null, title: "CRD", start_on: TODAY, status: "active", stopped_on: null, version: 1, supersedes: null, sent_at: `${TODAY}T08:00:00Z`, printed_at: null, note: null, created_at: "", updated_at: "2026-11-03T00:00:00Z",
      lines: [{ id: "l1", treatment_id: "t1", position: 0, day_from: 1, day_to: 5, product_id: null, product_name: "Doxy", kind: "med", dose_amount: 1, dose_unit: "g", dose_per: "liter", strength_pct: null, hours: null, route: "water", withdrawal_meat_days: 7, withdrawal_egg_days: null, note: null }] };
    ui = M.mount(el(M.TreatmentSheet, { b: bundleOf(M, { treatments: [tx] }), tx, onClose() {}, onSaved() {} }));
    c("د٣ الطبلةُ المُرسَلة تقول «التعديل نسخةٌ ثانية» قبل الحفظ", !!ui.find("data-flock-tx-frozen"));
    ui.click(ui.find("data-flock-save")); await flush();
    c("  والحفظُ بمعرّفها وختمها (الخادمُ يصنع النسخة ويوقف الأولى)", __calls[0]?.id === "t1" && __calls[0]?.expect_updated_at === tx.updated_at && __calls[0]?.lines?.[0]?.withdrawal_meat_days === 7, J(__calls[0]));
    ui.unmount();
  }

  /* هـ) الإغلاق أثناء السحب */
  {
    reset();
    globalThis.__api = { closeCase: async (id, p) => { __calls.push([id, p]); return {}; } };
    const tx = { id: "t1", case_id: "c1", visit_id: null, title: null, start_on: TODAY, status: "active", stopped_on: null, version: 1, supersedes: null, sent_at: null, printed_at: null, note: null, created_at: "", updated_at: "",
      lines: [{ id: "l1", treatment_id: "t1", position: 0, day_from: 1, day_to: 3, product_id: null, product_name: "Doxy", kind: "med", dose_amount: null, dose_unit: null, dose_per: null, strength_pct: null, hours: null, route: "water", withdrawal_meat_days: 5, withdrawal_egg_days: null, note: null }] };
    const b = bundleOf(M, { treatments: [tx] });
    const ui = M.mount(el(M.CloseSheet, { b, onClose() {}, onSaved() {} }));
    const btn = ui.find("data-flock-save");
    c("هـ١ البيعُ قبل «لا تبيع قبل»: التأكيدُ ظاهر والزرُّ مقفولٌ قبله", !!ui.find("data-flock-close-wd") && btn?.props.disabled === true, J({ wd: !!ui.find("data-flock-close-wd"), dis: btn?.props.disabled }));
    const box = inside(ui.find("data-flock-close-wd"), "type", "checkbox")[0];
    typeIn(box, true);
    ui.click(ui.find("data-flock-save")); await flush();
    c("  وبعد التأكيد يُرسل confirm_withdrawal صريحاً", __calls.length === 1 && __calls[0][1].confirm_withdrawal === true && __calls[0][1].reason === "sold", J(__calls));
    ui.unmount();
  }

  /* ط) ما يصل للمربي */
  {
    const D = (n) => M.addDays(TODAY, n);
    // v1 (سحب ١٠، أُرسلت، استُبدلت اليوم) وv2 (سحب ١): الوجبةُ = آخرُ ما أُعطي من v1 (اليوم) + ١٠ + ١.
    const v1 = txRow({ id: "t1", start_on: D(-4), status: "replaced", stopped_on: TODAY, sent_at: "x", lines: [lnRow({ day_to: 5, withdrawal_meat_days: 10 })] });
    const v2 = txRow({ id: "t2", start_on: TODAY, version: 2, supersedes: "t1", lines: [lnRow({ id: "l2", treatment_id: "t2", day_to: 3, withdrawal_meat_days: 1 })] });
    const bv = bundleOf(M, { treatments: [v1, v2] });
    const t2 = M.sheetText(tt, bv, v2);
    c("ط١ طبلةُ النسخة الثانية تقول «لا تبيع قبل» الوجبة كلّها (المستبدَلةُ بسحبها الأطول)", t2.includes(`"safe":"${lbl(D(11))}"`) && !t2.includes(`"safe":"${lbl(D(4))}"`), t2.split("\n").filter((x) => x.includes("safe")).join(" | "));
    const ly = bundleOf(M, { kind: "layer", treatments: [txRow({ id: "t3", lines: [lnRow({ day_to: 2, withdrawal_meat_days: 0, withdrawal_egg_days: 7 })] })] });
    const t3 = M.sheetText(tt, ly, ly.treatments[0]);
    c("ط٢ والبيّاض: سحبُ البيض بسطره وتاريخه (اللحمُ صفر لا يُخفيه)", t3.includes("flk.tx.eggLabel") && t3.includes(`flk.tx.eggSafe|{"safe":"${lbl(D(9))}"}`), t3.split("\n").slice(-4).join(" | "));
    const st = txRow({ id: "t4", start_on: D(-3), status: "stopped", stopped_on: D(-2), lines: [lnRow({ day_to: 5, withdrawal_meat_days: 2 }), lnRow({ id: "l9", day_from: 3, day_to: 5, withdrawal_meat_days: 9 })] });
    const t4 = M.sheetText(tt, bundleOf(M, { treatments: [st] }), st);
    c("ط٣ والموقوفةُ بأيامها كما انعطت: سطرٌ مقصوصٌ بيوم الإيقاف، وسطرٌ بعده «ما انعطى»، و«لا تبيع قبل» من الإيقاف",
      t4.includes("flk.tx.cut") && t4.includes("flk.tx.lineNotGiven") && t4.includes(`"last":"${lbl(D(-2))}","safe":"${lbl(D(1))}"`), t4.replace(/\n/g, " | ").slice(0, 400));
  }

  /* ي) نسخةٌ بتواريخها، والإقفالُ بعد «مجهول المصير» */
  {
    reset();
    let mode = null;
    globalThis.__api = { saveTreatment: async (p) => { __calls.push(p);
      if (mode === "net") throw new TypeError("Failed to fetch");
      if (mode === "rej") throw Object.assign(new Error("flock_treatment_line"), { code: "P0001" });
      return { id: p.id ?? "t9", version: 2, lines: [], replayed: false }; } };
    const fz = txRow({ id: "t5", start_on: M.addDays(TODAY, -2), sent_at: "x", lines: [lnRow({ day_to: 5 })] });
    let ui = M.mount(el(M.TreatmentSheet, { b: bundleOf(M, { treatments: [fz] }), tx: fz, onClose() {}, onSaved() {} }));
    c("ي١ نسخةٌ من طبلةٍ مُرسَلة قبل يومين تقول إن الأيام انزاحت", ui.text(ui.find("data-flock-tx-frozen")).includes("flk.tx.shiftNote"));
    ui.click(ui.find("data-flock-save")); await flush();
    const ln = __calls[0]?.lines?.[0] ?? {};
    c("  وتبدأ اليوم بتواريخ أيامها نفسِها (١–٥ قبل يومين ⇒ ١–٣ من اليوم)", __calls[0]?.start_on === TODAY && ln.day_from === 1 && ln.day_to === 3, J({ s: __calls[0]?.start_on, ln }));
    ui.unmount();

    reset(); mode = "net";
    ui = M.mount(el(M.TreatmentSheet, { b: bundleOf(M), onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-product"), "Doxy");
    ui.click(ui.find("data-flock-save")); await flush();
    c("ي٢ طبلةٌ جديدة بلا جواب (انقطاع) ⇒ النموذجُ مقفولٌ على الإعادة ويقولها", !!ui.find("data-flock-unknown") && ui.find("data-flock-tx-sheet")?.props.disabled === true);
    mode = null;
    ui.click(ui.find("data-flock-save")); await flush();
    c("  والإعادةُ بالمرجع نفسِه وبما كُتب", __calls.length === 2 && !!__calls[0].client_ref && __calls[1].client_ref === __calls[0].client_ref && __calls[1].lines[0].product_name === "Doxy", J(__calls.map((x) => x.client_ref)));
    ui.unmount();

    reset(); mode = "rej";
    ui = M.mount(el(M.TreatmentSheet, { b: bundleOf(M), onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-product"), "Doxy");
    ui.click(ui.find("data-flock-save")); await flush();
    c("ي٣ والرفضُ الحاسم (P0001) لا يُقفل — يُصلَح ويُعاد", !ui.find("data-flock-unknown") && ui.find("data-flock-tx-sheet")?.props.disabled !== true);
    ui.unmount();
  }

  /* ك) الزيارة */
  {
    reset();
    globalThis.__api = { saveVisit: async (p) => { __calls.push(p); return { visit: { id: p.id ?? "v9", ...p }, replayed: false }; } };
    const v = { id: "v1", case_id: "c1", at: `${TODAY}T07:00:00.000Z`, kind: "routine", quick: false, vet_id: null, flock: {}, signs: [], env: {}, dx: null, dx_codes: [], dx_status: null,
      notifiable: false, advice: null, notes: null, trend: null, next_visit_on: null, compliance: {}, created_at: "", created_by: null, updated_at: "2026-11-02T00:00:00Z" };
    const stale = bundleOf(M, { visits: [v] });
    const fresh = bundleOf(M, { visits: [v], mortality: [mrow({ id: "mv", visit_id: "v1", source: "visit", dead: 9 })],
      necropsy: [{ id: "n1", case_id: "c1", visit_id: "v1", bird_no: 1, source: "dead", weight_g: null, findings: ["lung.airsac_cloudy"], scores: {}, note: null }] });
    const Wrap = () => { const [bb, setBb] = React.useState(stale); globalThis.__setB = setBb; return el(M.FlockVisit, { b: bb, visit: v, canEdit: true, onClose() {}, onSaved() {} }); };
    let ui = M.mount(el(Wrap));
    ui.click(ui.find("data-flock-visit-edit"));
    globalThis.__setB(fresh); await flush();
    ui.click(ui.find("data-flock-save")); await flush();
    const pk = __calls[0] ?? {};
    c("ك١ نموذجٌ فُتح من حزمةٍ قبل الحفظ لا يمسح نافقَ الزيارة وتشريحَها حين تصل الجديدة (لا مفتاح = لا مسّ)", __calls.length === 1 && !("mortality" in pk) && !("necropsy" in pk), J(Object.keys(pk)));
    ui.unmount();

    reset();
    // آخرُ تسجيلٍ قبل ٦ أيام، والاستقبالُ سجّل اليوم: زيارةٌ بتاريخ أمس تغطّي ما بينهما (٥ أيام).
    const bg = bundleOf(M, { mortality: [mrow({ id: "m6", on_date: M.addDays(TODAY, -6), dead: 2 }), mrow({ id: "m0", on_date: TODAY, dead: 3 })] });
    ui = M.mount(el(M.FlockVisit, { b: bg, canEdit: true, onClose() {}, onSaved() {} }));
    typeIn(ui.all().find((n) => n.props?.type === "datetime-local"), `${M.addDays(TODAY, -1)}T10:00`);
    const inp = ui.find("data-flock-v-dead");
    c("ك٢ تسجيلٌ بعد يوم الزيارة لا يقفلها — أيامُها قبلُ فارغة", inp?.props.disabled !== true);
    typeIn(inp, "7");
    ui.click(ui.find("data-flock-save")); await flush();
    const pm = __calls[0]?.mortality?.[0];
    c("  والنافقُ يغطّي ما بين آخر تسجيلٍ قبلها ويومها (٥ أيام بيوم أمس)", !!pm && pm.on_date === M.addDays(TODAY, -1) && pm.days === 5 && pm.dead === 7, J(__calls[0]?.mortality));
    ui.unmount();

    reset();
    ui = M.mount(el(M.FlockVisit, { b: bg, canEdit: true, onClose() {}, onSaved() {} }));
    typeIn(ui.find("data-flock-v-dead"), "4");   // يومُ الزيارة (اليوم) مسجَّل ⇒ رقمٌ لا يُرسل
    ui.click(ui.find("data-flock-save")); await flush();
    c("ك٣ رقمٌ بقاعةٍ يومُها مسجَّل يُقال باسمها ولا يُرسل (كان يُرفض تداخلاً بكلّ حفظ)", __calls.length === 0 && ui.text(ui.find("data-flock-visit-error") ?? { type: "#text", text: "", children: [] }).includes("flkv.mortCovered"), J(__calls.length));
    ui.unmount();

    reset();
    const age = 12;   // الوجبةُ بعمر ١٢ اليوم (bundleOf): تحصينٌ مخطَّطٌ لليوم
    const bx = bundleOf(M, { vax: [{ id: "x1", case_id: "c1", vaccine: "ND", disease: null, route: "water", planned_age: age, status: "planned", given_on: null, given_by: null,
      batch_no: null, birds_count: null, take_ok: null, note: null, skip_reason: null, from_program: null, visit_id: null, updated_at: "" }] });
    ui = M.mount(el(M.FlockVisit, { b: bx, canEdit: true, onClose() {}, onSaved() {} }));
    ui.click(ui.find("data-flock-vgiven", "x1:vet"));
    typeIn(ui.all().find((n) => n.props?.type === "datetime-local"), `${M.addDays(TODAY, -6)}T10:00`);
    ui.click(ui.find("data-flock-save")); await flush();
    c("ك٤ تحصينٌ أُشّر ثمّ رُجع تاريخُ الزيارة فاختفى صفُّه لا يُختم منجَزاً", __calls.length === 1 && Array.isArray(__calls[0].vax_given) && __calls[0].vax_given.length === 0, J(__calls[0]?.vax_given));
    ui.unmount();
  }

  /* م) العلاماتُ التشريحية بأجهزة الجسم */
  {
    const N = M.N;
    const sysOf = (k) => N.NECRO_SYSTEMS.find((x) => x.k === k);
    const pickedOf = (ui) => ui.findAll("data-flock-picked").map((n) => n.props["data-flock-picked"]);
    reset();
    globalThis.__api = { saveVisit: async (p) => { __calls.push(p); return { visit: { id: "v9", ...p }, replayed: false }; } };
    let b = bundleOf(M);
    let ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved() {} }));
    c("م١ التشريحُ بالزيارة السريعة أيضاً (كان للكاملة وحدها)", !!ui.find("data-flock-add-bird") && ui.find("data-flock-quick", "1")?.props["aria-checked"] === true, J(!!ui.find("data-flock-add-bird")));
    ui.click(ui.find("data-flock-add-bird"));
    c("  والجهازُ الأوّل «العامّة» مفتوح، و«لا توجد آفات» أوّلُ بنوده", ui.find("data-flock-sys-panel")?.props["data-flock-sys-panel"] === "gen" && !!ui.find("data-chip", N.NIL));
    ui.click(ui.find("data-flock-sys", "dig")); ui.click(ui.find("data-chip", "gut.coccidia"));
    c("  ونقرةُ آفةٍ تُرى بـ«علامات هذا الطير» وبعدّ بطاقة جهازها", J(pickedOf(ui)) === J(["gut.coccidia"]) && ui.text(ui.find("data-flock-sys", "dig")).includes('"n":1'), J(pickedOf(ui)));
    c("  ومنها يُقترح التشخيص (نشاطُ كوكسيديا ⇒ كوكسيديا)", !!ui.find("data-flock-suggest", "coccidiosis"));
    ui.click(ui.find("data-flock-dup-bird"));
    ui.click(ui.find("data-flock-save")); await flush();
    const pq = __calls[0] ?? {};
    c("م٢ «طير جديد بنفس العلامات» ⇒ طيران بالآفة نفسِها، والزيارةُ سريعةٌ بتشريحها", pq.quick === true && pq.necropsy?.length === 2 && pq.necropsy.every((x) => J(x.findings) === J(["gut.coccidia"])) && J(pq.necropsy.map((x) => x.bird_no)) === "[1,2]", J(pq.necropsy));
    ui.unmount();

    reset();
    ui = M.mount(el(M.FlockVisit, { b, canEdit: true, onClose() {}, onSaved() {} }));
    ui.click(ui.find("data-flock-add-bird"));
    ui.click(ui.find("data-chip", N.NIL));
    const afterNil = pickedOf(ui);
    ui.click(ui.find("data-chip", "gen.congestion"));
    c("م٣ «لا توجد آفات» تُختار، وآفةٌ بعدها تشيلها (لا يجتمعان)", J(afterNil) === J([N.NIL]) && J(pickedOf(ui)) === J(["gen.congestion"]), J([afterNil, pickedOf(ui)]));
    c("  وفوق آفةٍ مختارة لا تُختار (لا مسحَ صامتٌ لما عُلّم) ويُقال لماذا", ui.find("data-chip", N.NIL)?.props.disabled === true && ui.text().includes("flkv.necro.nilBlocked"));
    ui.click(ui.find("data-flock-sys", "heart")); ui.click(ui.find("data-chip", "heart.cardiomegaly"));
    ui.click(ui.find("data-flock-normal", "heart"));
    const afterNormal = pickedOf(ui);
    ui.click(ui.find("data-chip", "heart.cardiomegaly"));
    ui.click(ui.find("data-flock-sys", "dig")); ui.click(ui.find("data-flock-rest-normal"));
    ui.click(ui.find("data-flock-picked", "gen.congestion"));
    ui.click(ui.find("data-flock-save")); await flush();
    const fn = __calls[0]?.necropsy?.[0]?.findings ?? [];
    c("م٤ «طبيعي» لجهازٍ يشيل آفاتِه، وآفةٌ بعده تشيل «طبيعي»", !afterNormal.includes("heart.cardiomegaly") && fn.includes("heart.cardiomegaly") && !fn.includes("heart.normal"), J({ afterNormal, fn }));
    const shown = N.systemsFor(false).map((x) => x.k);
    c("  و«الباقي طبيعي» يعلّم كلَّ جهازٍ بلا آفةٍ معروضٍ وحده — لا القلبَ ولا العامّةَ وفيهما آفة ساعتها، ولا التناسليَّ بوجبة لحم",
      shown.filter((k) => k !== "heart" && k !== "gen").every((k) => fn.includes(`${k}.normal`)) && !fn.includes("heart.normal") && !fn.includes("gen.normal") && !fn.includes("repro.normal"), J(fn));
    c("  و«المختار» يُشال بنقرته", !fn.includes("gen.congestion"), J(fn));
    ui.unmount();

    reset();
    const v = { id: "v1", case_id: "c1", at: `${TODAY}T07:00:00.000Z`, kind: "routine", quick: false, vet_id: null, flock: {}, signs: [], env: {}, dx: null, dx_codes: [], dx_status: null,
      notifiable: false, advice: null, notes: null, trend: null, next_visit_on: null, compliance: {}, created_at: "", created_by: null, updated_at: "2026-11-02T00:00:00Z" };
    const old = ["msk.muscle_hemorrhage", "liver.normal", "x_future.code"];
    b = bundleOf(M, { visits: [v], necropsy: [{ id: "n1", case_id: "c1", visit_id: "v1", bird_no: 1, source: "dead", weight_g: null, findings: old, scores: {}, note: null }] });
    ui = M.mount(el(M.FlockVisit, { b, visit: v, canEdit: true, onClose() {}, onSaved() {} }));
    ui.click(ui.find("data-flock-visit-edit"));
    ui.click(ui.find("data-flock-sys", "heart")); ui.click(ui.find("data-chip", "heart.cardiomegaly"));
    ui.click(ui.find("data-flock-save")); await flush();
    const fo = __calls[0]?.necropsy?.[0]?.findings ?? [];
    c("م٥ تعديلُ زيارةٍ قديمة: المتقاعدُ وعلامةُ العضو القديمة ورمزُ نسخةٍ أحدث تبقى كلُّها مع الآفة الجديدة", old.every((x) => fo.includes(x)) && fo.includes("heart.cardiomegaly"), J(fo));
    ui.unmount();

    // الدالّةُ نفسُها لا الزرُّ وحده: الزرُّ يُطفأ فوق الآفات، والدالّةُ ترجعها كما هي (بابٌ ثانٍ — نتيجةُ البحث — لا يمسح).
    c("م٤-ب «لا توجد آفات» فوق آفاتٍ ترجعها كما هي، وفوق علامة «طبيعي» تُختار",
      J(N.toggleLesion(["gut.blood", "heart.normal"], N.NIL)) === J(["gut.blood", "heart.normal"]) && J(N.toggleLesion(["heart.normal"], N.NIL)) === J(["heart.normal", N.NIL]),
      J([N.toggleLesion(["gut.blood", "heart.normal"], N.NIL), N.toggleLesion(["heart.normal"], N.NIL)]));
    c("  ورمزٌ بجهازين يطفئ «طبيعي» الاثنين، وحالُ الجهاز يقرأ «لا توجد آفات» طبيعياً",
      J(N.toggleLesion(["gen.normal", "heart.normal", "dig.normal"], "heart.hydropericardium")) === J(["dig.normal", "heart.hydropericardium"])
      && N.systemState([N.NIL], sysOf("dig")).normal === true && N.systemState([N.NIL, "gut.blood"], sysOf("dig")).normal === false);

    // البحثُ بالقاموس الحقيقيّ: الطرفان مطبَّعان (همزةٌ ناقصةٌ بالسؤال، ولاتينيٌّ بحالةٍ أخرى)، والجهازُ والمجموعةُ يُطابَقان
    const nameOf = (code) => get(AR, `flkv.lesion.${code}`);
    const groupOf = (sk, bk) => `${get(AR, `flkv.sys.${sk}`)} ${bk === "gen" ? "" : get(AR, `flkv.sub.${bk}`)}`;
    const find = (q, layer = false) => N.findLesions(q, N.systemsFor(layer), nameOf, groupOf, M.searchable);
    const airsac = find("الاكياس الهوائية");
    c("م٦ البحث: «الاكياس الهوائية» بلا همزة يلقى آفاتِ الأكياس", ["lung.airsacculitis", "lung.airsac_cloudy", "lung.airsac_thick"].every((x) => airsac.includes(x)), J(airsac));
    c("  و«HEPATOMEGALY» يلقى «تضخم الكبد»، و«نزف كبد» كلمتين معاً، والجهازُ باسمه («الطحال» ⇒ آفاتُه)",
      J(find("HEPATOMEGALY")) === J(["liver.enlarged"]) && find("نزف كبد").includes("liver.hemorrhage") && !find("نزف كبد").includes("spleen.hemorrhage")
      && sysOf("spleen").subs[0].codes.every((x) => find("الطحال").includes(x)), J([find("HEPATOMEGALY"), find("نزف كبد")]));
    c("  ورمزٌ بجهازين يُرجَع مرّةً، وما لا يطابق شيئاً فارغ", find("تجمع سوائل حول القلب").filter((x) => x === "heart.hydropericardium").length === 1 && find("زرافة").length === 0);
    c("  وجهازُ التناسليّ لا يُبحث فيه بوجبة لحم", !find("المبيض").length && find("المبيض", true).includes("repro.ovary_hemorrhage"));
    const sacs = find("الاكياس");
    // «أكياس رغوية» بلا «ال» فتأتي باسم مجموعتها كـ«احتقان الرئتين» — الثلاثُ التي يقولها اسمُها أوّلاً
    c("  وما طابقه اسمُه أوّلاً: آفاتُ «الأكياس» قبل «احتقان الرئتين» الذي جاء باسم مجموعته",
      J(sacs.slice(0, 3)) === J(["lung.airsacculitis", "lung.airsac_cloudy", "lung.airsac_thick"]) && sacs.indexOf("lung.congestion") === 3 && sacs.includes("lung.airsac_foamy"), J(sacs));

    // نصُّ الملخّص والتقرير: يسمّي المجموعةَ حين لا يسمّيها الاسم، وبلا المصطلح اللاتينيّ
    const txt = (code) => N.lesionText(code, (x) => get(AR, `flkv.lesion.${x}`) ?? x, (k) => get(AR, `flkv.sub.${k}`) ?? k, (o) => `[${o}]`);
    c("م٧ الملخّص: «تضخم الكبد» بلا سابقةٍ ولا مصطلح، و«الطحال: وجود بؤر نخرية»، و«احتقان عام» بلا سابقة، ورمزٌ مجهول بعضوه",
      txt("liver.enlarged") === "تضخم الكبد" && txt("spleen.necrotic_foci") === "الطحال: وجود بؤر نخرية" && txt("gen.congestion") === "احتقان عام"
      && txt("head.blood_casts") === "القصبة الهوائية: وجود قوالب دموية" && txt("x_future.code") === "[x_future]: x_future.code",
      J(["liver.enlarged", "spleen.necrotic_foci", "gen.congestion", "head.blood_casts", "x_future.code"].map(txt)));

    // قائمةُ الزيارات والخطُّ الزمنيّ: الأمراضُ المختارة تشخيصٌ أيضاً
    const dxv = M.dxText((k) => k, { dx: " ملاحظة ", dx_codes: ["coccidiosis", "ne"] });
    c("م٨ تشخيصُ الزيارة بالقائمة: المختارُ بأسمائه ثمّ المكتوب، والفارغُ فارغٌ («بلا تشخيص»)", dxv === "flk.dx.coccidiosiscommon.listSepflk.dx.ne — ملاحظة", dxv);
    c("  وزيارةٌ بلا مرضٍ ولا نصّ ⇒ فارغ", M.dxText((k) => k, { dx: null, dx_codes: [] }) === "" && M.dxText((k) => k, { dx: "  ", dx_codes: [] }) === "");

    // م٩ نقراتٌ بنفس اللحظة — جذرٌ متزامنٌ كـcreateRoot بالتطبيق: النقراتُ كلُّها قبل أيّ رسمة. كانت كلُّ نقرةٍ تحسب القائمةَ الجديدة من المرسومة
    // فتمسح الثانيةُ الأولى (مقيسٌ بالمتصفّح ٢٥/١١ بسؤال المالك «يكدر يختار اكثر من علامة بنفس الوقت؟»: ثلاثُ نقراتٍ بلحظةٍ واحدة بقيت أخيرتُها).
    reset();
    globalThis.__api = { saveVisit: async (p) => { __calls.push(p); return { visit: { id: "v9", ...p }, replayed: false }; } };
    ui = M.mount(el(M.FlockVisit, { b: bundleOf(M), canEdit: true, onClose() {}, onSaved() {} }), { concurrent: true });
    await ui.settle();
    ui.click(ui.find("data-flock-add-bird")); await ui.settle();
    ui.click(ui.find("data-flock-sys", "dig")); await ui.settle();
    const ev = { preventDefault() {}, stopPropagation() {} };
    const burst = ["gut.enlarged", "gut.thin_wall", "gut.thick_wall"].map((x) => ui.find("data-chip", x));
    ui.fire(() => burst.forEach((n) => n.props.onClick(ev)));
    await ui.settle();
    const dxs = ["colibacillosis", "coccidiosis", "ne"].map((x) => ui.find("data-chip", x));
    const sg = ["resp.cough", "gi.diarrhea_white"].map((x) => ui.find("data-chip", x));
    ui.fire(() => { dxs.forEach((n) => n.props.onClick(ev)); sg.forEach((n) => n.props.onClick(ev)); });
    await ui.settle();
    c("م٩ ثلاثُ علاماتٍ تشريحيّة بنفس اللحظة تبقى الثلاث (لا تمسح الأخيرةُ ما قبلها)", J(pickedOf(ui).sort()) === J(["gut.enlarged", "gut.thick_wall", "gut.thin_wall"]), J(pickedOf(ui)));
    ui.click(ui.find("data-flock-save")); await ui.settle(); await flush();
    const pb = __calls[0] ?? {};
    c("  وثلاثةُ تشخيصاتٍ وعلامتا الطيور الحيّة بنفس اللحظة تُحفظ كلُّها مع العلامات الثلاث",
      J([...(pb.dx_codes ?? [])].sort()) === J(["coccidiosis", "colibacillosis", "ne"]) && J([...(pb.signs ?? [])].sort()) === J(["gi.diarrhea_white", "resp.cough"])
      && J([...(pb.necropsy?.[0]?.findings ?? [])].sort()) === J(["gut.enlarged", "gut.thick_wall", "gut.thin_wall"]), J({ dx: pb.dx_codes, s: pb.signs, f: pb.necropsy?.[0]?.findings }));
    ui.unmount();
  }

  /* ل) فتحُ الحالة */
  {
    reset();
    let lookup = "fail";
    const F1 = { id: "f1", clinic_id: "k1", name: "Farm A", owner_name: "A", owner_phone: null, cust_key: null, governorate: null, area: null, houses_count: null, note: null, archived: false, created_at: "", updated_at: "" };
    const F2 = { ...F1, id: "f2", name: "Farm B" };
    globalThis.__api = {
      farmsFor: async (_ph, name) => { if (lookup === "fail") throw new TypeError("Failed to fetch"); return name === "B" ? [{ farm: F2, open_case: null }] : [{ farm: F1, open_case: null }]; },
      programs: async () => [],
      openCase: async (p) => { __calls.push(p); return { case: { id: "cX" }, farm: F1, replayed: false }; },
    };
    let ui = M.mount(el(M.FlockOpenPage, {}));
    typeIn(ui.find("data-flock-owner-name"), "A"); await wait(520); await flush();
    typeIn(ui.find("data-flock-farm-name"), "New farm"); typeIn(ui.find("data-flock-age-today"), "5"); typeIn(ui.find("data-flock-count"), "1000");
    ui.click(ui.find("data-flock-open")); await flush();
    c("ل١ سؤالُ حقول الزبون فشل ⇒ لا فتح (لا «جديد» يكرّر حقلاً قائماً) ويُقال", __calls.length === 0 && !!ui.find("data-flock-farms-error") && ui.text(ui.find("data-flock-intake-error") ?? { type: "#text", text: "", children: [] }).includes("flk.open.farmsFailOpen"), J(__calls.length));
    ui.unmount();

    reset(); lookup = "ok";
    ui = M.mount(el(M.FlockOpenPage, {}));
    typeIn(ui.find("data-flock-owner-name"), "A"); await wait(520); await flush();
    ui.click(ui.find("data-flock-farm", "f1"));
    typeIn(ui.find("data-flock-owner-name"), "B"); await wait(520); await flush();
    typeIn(ui.find("data-flock-farm-name"), "B farm"); typeIn(ui.find("data-flock-age-today"), "5"); typeIn(ui.find("data-flock-count"), "1000");
    ui.click(ui.find("data-flock-open")); await flush();
    c("ل٢ حقلٌ اختير لزبونٍ سابق لا يُفتح عليه بعد تبديل الزبون — حقلٌ جديدٌ باسمه", __calls.length === 1 && !("id" in (__calls[0]?.farm ?? {})) && __calls[0]?.farm?.name === "B farm", J(__calls[0]?.farm));
    ui.unmount();
  }
}

/* ── الأصل ───────────────────────────────────────────────────────────────────── */
console.log("▸ ب–هـ) الشاشاتُ مرسومةً");
const BASE = await build();
await run(BASE, check);

/* ── ز) الطفرات ──────────────────────────────────────────────────────────────── */
/** وعدٌ مرفوضٌ بلا معالج: بالأصل فشلٌ صريح (كسلوك node الافتراضيّ)، وبطفرةٍ سقوطٌ لها. */
let onCrash = null;
process.on("unhandledRejection", (e) => { if (onCrash) onCrash(e); else { console.error(e); process.exit(1); } });
console.log("▸ ز) الطفرات");
const S0 = { necro: SRC(FILES.necro), shared: SRC(FILES.shared), sheets: SRC(FILES.sheets), tx: SRC(FILES.tx), visit: SRC(FILES.visit), intake: SRC(FILES.intake) };
const MUTANTS = [
  ["الفارغُ يُحفظ صفراً", "sheets", `!done.has(h.id ?? "") && (v.dead.trim() !== "" || v.culled.trim() !== "")`, `!done.has(h.id ?? "") && true`],
  ["الإعادةُ ترسل المنحفظةَ ثانيةً", "sheets", `!done.has(h.id ?? "") && (v.dead`, `(v.dead`],
  ["زرُّ الإغلاق بلا قفلٍ قبل التأكيد", "sheets", "disabled={early && !confirmWd}", "disabled={false}"],
  ["الحفظُ الفارغ يرسل نافقاً فارغاً (يمسح نافقَ الزيارة)", "visit", "...(mortality.length || hadMort ? { mortality } : {}),", "...({ mortality }),"],
  ["مسحُ التشريح كلِّه لا يُرسل", "visit", "...(d.birds.length || hadNecro ? {", "...(d.birds.length ? {"],
  ["النافقُ «منذ آخر تسجيل» يوماً واحداً دائماً", "visit", "const n = last ? diffDays(last, day) : ageOn(c.placed_on, day);", "const n = 1;"],
  ["واجبُ التبليغ لا يُختم", "visit", "const notifiable = d.dxCodes.some((x) => NOTIFIABLE.has(x));", "const notifiable = false;"],
  ["يومُ الختم يومُ غرينتش", "shared", "export const localDay = (iso: string): string => localISO(new Date(iso));", "export const localDay = (iso: string): string => iso.slice(0, 10);"],
  ["«لا تبيع قبل» للطبلة وحدها", "tx", "const w = withdrawalOf(b.treatments);\n  const last = dayLabel(lastGiven(tx), today);", "const w = withdrawalOf([tx]);\n  const last = dayLabel(lastGiven(tx), today);"],
  ["سحبُ البيض لا يصل المربي", "tx", "  if (isLayer(b)) {\n    if (w.unknownEgg)", "  if (false) {\n    if (w.unknownEgg)"],
  ["الموقوفةُ بأيامها المخطَّطة", "tx", "  if (tx.stopped_on && tx.stopped_on < from) return null;", "  if (false) return null;"],
  ["النسخةُ تبدأ اليوم بأرقام أيامها", "tx", "const shift = frozen && tx ? diffDays(tx.start_on, vStart) : 0;", "const shift = 0;"],
  ["الفشلُ المجهول لا يُقفل الطبلة", "tx", "if (!tx && !rejectedBeforeCommit(e)) setLocked(true);", "if (false) setLocked(true);"],
  ["الحفظُ يقرأ الحزمةَ الحاليّة لا ما حمله النموذج", "visit", "const hadMort = loaded.mort, hadNecro = loaded.necro;", "const hadMort = !!visit && b.mortality.some((m) => m.visit_id === visit.id), hadNecro = !!visit && b.necropsy.some((n) => n.visit_id === visit.id);"],
  ["تسجيلٌ بعد يوم الزيارة يقفلها", "visit", "const last = rows.filter((m) => m.on_date < day).reduce", "const last = rows.reduce"],
  ["رقمٌ بقاعةٍ مسجَّلة يُرسل", "visit", "      if (!g) { setErr(t(\"flkv.mortCovered\", { house: h.label })); return; }\n", ""],
  ["تحصينٌ مختفٍ يُختم", "visit", "filter(([id, by]) => by && dueVax.some((v) => v.id === id))", "filter(([, by]) => by)"],
  ["سؤالُ الحقول الفاشل لا يمنع الفتح", "intake", "    if (farmsErr) { setErr(t(\"flk.open.farmsFailOpen\")); return; }\n", ""],
  ["الحقلُ المختار يبقى بعد تبديل الزبون", "intake", "const farmId = chosen ? chosen.farm.id : null;", "const farmId = f.farmId;"],
  ["«لا توجد آفات» تبقى مع آفة", "necro", "const drop = new Set([NIL, ...systemsWith(code).map(normalOf)", "const drop = new Set([...systemsWith(code).map(normalOf)"],
  ["«لا توجد آفات» تمسح الآفاتِ المختارة", "necro", "if (code === NIL) return lesionsOf(findings).length ? [...findings] : [...findings, NIL];", "if (code === NIL) return [NIL];"],
  ["«طبيعي» يُبقي آفاتِ الجهاز", "necro", "return [...findings.filter((f) => !mine.has(f) || f === NIL), mark];", "return [...findings, mark];"],
  ["آفةٌ لا تشيل «طبيعي» جهازها", "necro", "const drop = new Set([NIL, ...systemsWith(code).map(normalOf), `${code.split(\".\")[0]}.normal`]);", "const drop = new Set([NIL]);"],
  ["«الباقي طبيعي» يطغى على جهازٍ فيه آفة", "necro", "    if (codesOf(s).some((c) => c !== NIL && out.includes(c))) continue;\n", ""],
  ["البحثُ يطبّع السؤالَ وحده", "necro", "const a = norm(name(code)), g = norm(group(s.k, sub.k));", "const a = name(code), g = group(s.k, sub.k);"],
  ["البحثُ بترتيب القائمة لا بما طابقه الاسم", "necro", "    if (words.every((w) => a.includes(w))) own.push(code);\n    else if", "    if"],
  ["آفةٌ جديدة تُسقط رموزاً لا تعرفها", "necro", "return [...findings.filter((f) => !drop.has(f)), code];", "return [...findings.filter((f) => !drop.has(f) && isKnownLesion(f)), code];"],
  ["الملخّصُ يسبق كلَّ آفةٍ بمجموعتها", "necro", "return home.sub === \"gen\" || SELF_NAMED.has(code) ? main : `${group(home.sub)}: ${main}`;", "return `${group(home.sub)}: ${main}`;"],
  ["التشريحُ للكاملة وحدها", "visit", "{d.birds.length < 50 && (\n              <Button variant={d.birds.length ? \"outline\" : \"secondary\"}", "{!d.quick && d.birds.length < 50 && (\n              <Button variant={d.birds.length ? \"outline\" : \"secondary\"}"],
  ["«طيرٌ بنفس العلامات» فارغ", "visit", "onClick={() => addBird(bird)} data-flock-dup-bird", "onClick={() => addBird(null)} data-flock-dup-bird"],
  ["الآفةُ تُحسب من المرسوم (نقرتان بلحظةٍ تمسح الأولى)", "visit", "onChange={(fn) => setBirdAt(bird, (b) => ({ findings: fn(b.findings) }))}", "onChange={(fn) => setBirdAt(bird, { findings: fn(cur.findings) })}"],
  ["التشخيصُ يُحسب من المرسوم", "visit", "onClick={() => upd((st) => ({ dxCodes: toggle(st.dxCodes, x) }))}", "onClick={() => set({ dxCodes: toggle(d.dxCodes, x) })}"],
  ["علامةُ الطير الحيّ تُحسب من المرسوم", "visit", "onClick={() => upd((x) => ({ signs: toggle(x.signs, k) }))}", "onClick={() => set({ signs: toggle(d.signs, k) })}"],
  ["قائمةُ الزيارات تقرأ المكتوبَ وحده", "shared", "[v.dx_codes.map((x) => t(`flk.dx.${x}`, { defaultValue: x })).join(t(\"common.listSep\")), v.dx?.trim() ?? \"\"]", "[v.dx?.trim() ?? \"\"]"],
  ["السحبُ الفارغ يصير صفراً", "tx", `withdrawal_meat_days: l.kind === "med" ? optInt(l.wd_meat) : null`, `withdrawal_meat_days: l.kind === "med" ? (optInt(l.wd_meat) ?? 0) : null`],
];
for (const [name, file, from, to] of MUTANTS) {
  const M = await build({ [file]: swap(S0[file], from, to) });
  const fell = [];
  // انهيارُ الشاشة على الحالة سقوطٌ يُرى (رقمٌ بلا فجوة كان يقرأ g.days من null): يُعدّ مُمسَكاً بسببه. والحفظُ async
  // فانهيارُه وعدٌ مرفوضٌ بلا معالج لا استثناءٌ يصل run — يُلتقط بالمستمع ما دامت الطفرةُ تجري.
  onCrash = (e) => fell.push(`انهار: ${e?.message ?? e}`);
  try { await run(M, (n, cond) => { if (!cond) fell.push(n); }); } catch (e) { fell.push(`انهار: ${e?.message ?? e}`); }
  await new Promise((r) => setTimeout(r, 20));
  onCrash = null;
  check(`طفرة «${name}» تُمسك (${fell.length})`, fell.length > 0, "مرّت كلُّ الفحوص — الفحصُ أعمى عنها");
}

console.log(`\n${fails ? "✗" : "✓"} flock-ui-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
