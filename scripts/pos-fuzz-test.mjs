/* ============================================================================
 * فحصُ الضغط العشوائيّ لمنطق البيع — الخواصُّ لا الأمثلة.
 *
 * الفحوصُ الأخرى تفحص حالاتٍ عرفناها. هذا يولّد آلافَ الحالات التي لم نعرفها
 * بعد: رموزاً بأرقامٍ شرقية ومحارفَ غير مرئية، ودفعاتِ ماسحٍ بتوقّفاتٍ عشوائية،
 * ومخازنَ بمئات الرموز، وفواتيرَ بمبالغَ كسرية — ويطلب من كلّ دالّةٍ **خاصّيةً**
 * تصحّ دائماً: التطبيعُ ثابتٌ بالتكرار، والمسحةُ تصل كاملةً أو لا تصل، والذيلُ
 * لا يُطابَق إلا لمنتجٍ واحد، والمدفوعُ والمستحقُّ يجمعان الفاتورة.
 *
 * البذرةُ ثابتة (mulberry32) فالفشلُ يُعاد بنفس الحالة، ولا يختفي بإعادة التشغيل.
 *
 *   node scripts/pos-fuzz-test.mjs            # ٦ آلاف حالة تقريباً
 *   FUZZ_N=50000 node scripts/pos-fuzz-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

const N = Number(process.env.FUZZ_N || 0) || 1500;
let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* مولّدٌ عشوائيّ ببذرة: نفسُ البذرة = نفسُ الحالات. */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20260906);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];
const digits = (n) => Array.from({ length: n }, () => String(int(0, 9))).join("");

const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
  },
};
const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], alias: { "@/lib/utils": "./src/lib/utils.ts" } });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
};
const { normalizeCode, matchCode, searchable } = await load("src/lib/utils.ts");
const { createScanAssembler } = await load("src/lib/scanBuffer.ts");
const { findByCode, matchTruncatedCode, looksLikeShelfCode, codeMatcher,
        layoutFix, looksLayoutMangled, excelArtifact, scanVariants } = await load("src/lib/productCodes.ts");
const { AR_LAYOUT } = await load("src/lib/arabicLayout.ts");
const { round2, paidOf, dueOf, paymentStatusOf, receiptsOf, isDebt } = await load("src/lib/debt.ts");

/* ── ١) تطبيعُ الرموز: ثابتٌ بالتكرار، ويشيل كلَّ ما لا يُرى، ويوحّد الأرقام ── */
console.log(`▸ normalizeCode — ${N} رمزاً بضجيجٍ عشوائيّ`);
const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";
const INVISIBLE = ["​", "‌", "‍", "‎", "‏", "﻿", "‪", "‬", "⁦", "⁩"];
const noisy = (code) => {
  let out = "";
  for (const ch of code) {
    const r = rnd();
    out += r < 0.25 && /\d/.test(ch) ? AR[+ch] : r < 0.35 && /\d/.test(ch) ? FA[+ch] : ch;
    if (rnd() < 0.15) out += pick(INVISIBLE);
    if (rnd() < 0.08) out += pick([" ", "\t", " "]);
  }
  if (rnd() < 0.3) out = pick(INVISIBLE) + out;
  if (rnd() < 0.3) out = " " + out + " ";
  return out;
};
let idem = 0, clean = 0, digitsOk = 0, bothSides = 0;
for (let i = 0; i < N; i++) {
  const code = rnd() < 0.7 ? digits(int(3, 14)) : pick(["w90", "A-12", "abc123", "00", "1003"]);
  const dirty = noisy(code);
  const n1 = normalizeCode(dirty), n2 = normalizeCode(n1);
  if (n1 === n2) idem++;
  if (!/[\s​-‏﻿‪-‮⁦-⁩]/.test(n1)) clean++;
  if (n1 === code) digitsOk++;
  // الطرفان: المخزونُ ملوَّث والمسحةُ نظيفة، أو العكس — يلتقيان.
  const inv = [{ id: "p", name: "x", barcode: noisy(code), stock: 1 }];
  if (findByCode(inv, code)?.id === "p" && findByCode(inv, noisy(code))?.id === "p") bothSides++;
}
check("ثابتٌ بالتكرار: normalizeCode(normalizeCode(x)) = normalizeCode(x)", idem === N, `${idem}/${N}`);
check("لا محرفَ غير مرئيّ ولا مسافة تبقى", clean === N, `${clean}/${N}`);
check("الأرقامُ الشرقية والفارسية والضجيجُ كلُّه يرجع للرمز الأصلي", digitsOk === N, `${digitsOk}/${N}`);
check("المطابقةُ بالطرفين: مخزونٌ ملوَّث × مسحةٌ نظيفة والعكس", bothSides === N, `${bothSides}/${N}`);

/* ── ٢) البحثُ بالاسم: طيُّ الإملاء ثابت، والمقطعُ يُلقى مهما كُتب ─────────── */
console.log("▸ searchable — الهمزةُ والتاءُ المربوطة والأرقام");
const NAMES = ["أموكسيسيلين ٢٥٠", "مغلّفات مياو مارت بالدجاج", "سبري حشرات خارجية", "Royal Canin Maxi 4kg", "معلبات لون ازرق 4 ب5", "دراي فود فرنسي 3 كيلو كتن"];
const variants = (s) => s.replace(/[أإآ]/g, () => pick(["ا", "أ", "إ", "آ"])).replace(/ة/g, () => pick(["ة", "ه"])).replace(/ى/g, () => pick(["ى", "ي"])).replace(/\d/g, (d) => pick([d, AR[+d]])).toUpperCase();
let sIdem = 0, sFind = 0;
for (let i = 0; i < N; i++) {
  const name = pick(NAMES);
  const q = variants(name);
  if (searchable(searchable(q)) === searchable(q)) sIdem++;
  const start = int(0, Math.max(0, name.length - 3)), len = int(2, Math.min(6, name.length - start));
  const frag = variants(name.slice(start, start + len));
  if (searchable(name).includes(searchable(frag))) sFind++;
}
check("searchable ثابتٌ بالتكرار", sIdem === N, `${sIdem}/${N}`);
check("أيُّ مقطعٍ من الاسم بأيّ إملاءٍ يُلقى", sFind === N, `${sFind}/${N}`);

/* ── ٣) دفعةُ الماسح: تصل كاملةً مع التوقّفات، ولا تصل من إنسان ─────────── */
console.log(`▸ scanBuffer — ${N} دفعةً بتوقّفاتٍ عشوائية`);
let scanOk = 0, humanOk = 0, prefixOk = 0, twoOk = 0;
for (let i = 0; i < N; i++) {
  const code = digits(int(8, 14));
  const asm = createScanAssembler();
  // فجواتٌ بسرعة الآلة (١–٢٥ ملّي)، مع توقّفاتٍ متوسّطة (٦١–٢٩٠) لا تتجاوز ربعَ الفجوات
  const gaps = code.length - 1;
  const stalls = new Set();
  const maxStalls = Math.floor(gaps / 4);
  while (stalls.size < int(0, maxStalls)) stalls.add(int(1, gaps));
  let t = 1000, got = null;
  for (let k = 0; k < code.length; k++) {
    if (k > 0) t += stalls.has(k) ? int(61, 290) : int(1, 25);
    got = asm.feed(code[k], t) ?? got;
  }
  got = asm.feed("Enter", t + int(1, 25));
  if (got === code) scanOk++;

  // إنسانٌ يكتب: ٨٠–٤٠٠ ملّي بين الضغطات
  const h = createScanAssembler();
  let th = 5000, hg = null;
  for (let k = 0; k < code.length; k++) { th += k ? int(80, 400) : 0; h.feed(code[k], th); }
  hg = h.feed("Enter", th + int(80, 400));
  if (hg === null) humanOk++;

  // «اكتب الكميّة ثم امسح»: رقمٌ بشريّ، توقّفٌ حقيقيّ ≥ ٣٠٠، ثم دفعة
  const p = createScanAssembler();
  p.feed(String(int(1, 9)), 9000);
  let tp = 9000 + int(301, 2000), pg = null;
  for (let k = 0; k < code.length; k++) { tp += k ? int(1, 25) : 0; p.feed(code[k], tp); }
  pg = p.feed("Enter", tp + int(1, 25));
  if (pg === code) prefixOk++;

  // مسحتان متتاليتان بفاصلٍ بشريّ
  const d = createScanAssembler();
  const c2 = digits(13);
  let td = 20000, out = [];
  for (let k = 0; k < code.length; k++) { td += k ? int(1, 25) : 0; d.feed(code[k], td); }
  out.push(d.feed("Enter", td + 5));
  td += int(400, 3000);
  for (let k = 0; k < c2.length; k++) { td += k ? int(1, 25) : 0; d.feed(c2[k], td); }
  out.push(d.feed("Enter", td + 5));
  if (out[0] === code && out[1] === c2) twoOk++;
}
check("دفعةُ ماسحٍ بتوقّفاتٍ ≤ ربع الفجوات تصل كاملة", scanOk === N, `${scanOk}/${N}`);
check("كتابةُ إنسانٍ (٨٠–٤٠٠ ملّي) لا تُعدّ مسحةً أبداً", humanOk === N, `${humanOk}/${N}`);
check("رقمٌ مكتوب + توقّفٌ حقيقيّ + مسحة = الرمز وحده", prefixOk === N, `${prefixOk}/${N}`);
check("مسحتان متتاليتان = رمزان صحيحان بالترتيب", twoOk === N, `${twoOk}/${N}`);

/* ── ٤) مطابقةُ الذيل: لمنتجٍ واحدٍ لا غير، ولا تكذب أبداً ─────────────────── */
console.log(`▸ matchTruncatedCode — مخازنُ عشوائية بـ٢٠٠ رمز`);
let tailOk = 0, tailNoLie = 0, tailAmbig = 0, shelfOk = 0;
const ROUNDS = Math.max(50, Math.floor(N / 10));
for (let r = 0; r < ROUNDS; r++) {
  const codes = new Set();
  while (codes.size < 200) codes.add(digits(pick([12, 13, 13, 13, 14])));
  const inv = [...codes].map((c, i) => ({ id: "p" + i, name: "n" + i, barcode: c, stock: int(0, 50), alt_codes: rnd() < 0.1 ? [digits(13)] : [] }));
  const target = pick(inv);
  const cut = int(1, 2);
  const tail = target.barcode.slice(cut);
  const expectedHits = inv.filter((p) => [p.barcode, ...(p.alt_codes ?? [])].some((c) => c.length > tail.length && c.length - tail.length <= 2 && c.endsWith(tail)));
  const got = matchTruncatedCode(inv, tail);
  if (expectedHits.length === 1 ? got?.id === target.id : got === undefined) tailOk++;
  if (expectedHits.length > 1 && got === undefined) tailAmbig++;
  // لا تكذب: ما ترجعه ينتهي بالذيل فعلاً
  if (!got || [got.barcode, ...(got.alt_codes ?? [])].some((c) => c.endsWith(tail))) tailNoLie++;
  // رقمُ رفٍّ قصير لا يُخمَّن ذيلاً
  if (matchTruncatedCode(inv, digits(int(3, 9))) === undefined) shelfOk++;
}
check("الذيلُ يلقى صاحبَه حين يكون واحداً، ولا شيءَ حين يتعدّد", tailOk === ROUNDS, `${tailOk}/${ROUNDS}`);
check("ولا يرجع منتجاً لا ينتهي رمزُه بالذيل", tailNoLie === ROUNDS, `${tailNoLie}/${ROUNDS}`);
check("وأقلُّ من عشرة أرقام لا يُخمَّن", shelfOk === ROUNDS, `${shelfOk}/${ROUNDS}`);

/* ── ٥) الديون: المدفوعُ والمستحقُّ يجمعان الفاتورة، والمرتجعُ بلا تحصيل ────── */
console.log(`▸ debt — ${N} فاتورةً بمبالغَ كسرية وأرجلِ دفعٍ عشوائية`);
let sumOk = 0, statusOk = 0, refundOk = 0, legsOk = 0, dueNonNeg = 0;
for (let i = 0; i < N; i++) {
  const total = round2(rnd() * 1_000_000);
  const mode = rnd();
  const amount_paid = mode < 0.1 ? null : mode < 0.3 ? 0 : mode < 0.6 ? total : round2(rnd() * total);
  const status = rnd() < 0.1 ? "refunded" : "paid";
  const nLegs = int(0, 4);
  const legs = Array.from({ length: nLegs }, () => ({ amount: round2((rnd() < 0.15 ? -1 : 1) * rnd() * total), at: new Date(1_700_000_000_000 + int(0, 1e9)).toISOString(), method: pick(["cash", "card", null]) }));
  const inv = { id: "i", total, amount_paid, status, created_at: new Date(1_700_000_000_000).toISOString(), payment_method: "cash", payment_details: legs };
  const paid = paidOf(inv), due = dueOf(inv);
  if (due >= 0) dueNonNeg++;
  if (amount_paid != null && amount_paid <= total ? round2(paid + due) === total : true) sumOk++;
  const st = paymentStatusOf(inv);
  const expect = paid >= total - 0.01 ? "paid" : paid <= 0.01 ? "unpaid" : "partial";
  if (st === expect && isDebt(inv) === (status !== "refunded" && due > 0.01)) statusOk++;
  const rc = receiptsOf(inv);
  if (status === "refunded" ? rc.length === 0 : true) refundOk++;
  if (status !== "refunded" && nLegs > 0) {
    const kept = legs.filter((l) => Math.abs(l.amount) > 0.01);
    const sumKept = round2(kept.reduce((s, l) => s + l.amount, 0));
    const sumRc = round2(rc.reduce((s, l) => s + l.amount, 0));
    if (sumKept === sumRc && rc.every((l) => l.at)) legsOk++;
  } else legsOk++;
}
check("المستحقُّ لا يكون سالباً أبداً", dueNonNeg === N, `${dueNonNeg}/${N}`);
check("مدفوعٌ + مستحقّ = الإجمالي (بتقريب فلسين)", sumOk === N, `${sumOk}/${N}`);
check("الحالةُ paid/partial/unpaid والدَّينُ يتّفقان مع المبالغ", statusOk === N, `${statusOk}/${N}`);
check("المرتجعُ بلا تحصيلٍ إطلاقاً", refundOk === N, `${refundOk}/${N}`);
check("أرجلُ الدفع — ومنها التصحيحُ السالب — تُجمع كما هي ولكلٍّ وقت", legsOk === N, `${legsOk}/${N}`);

/* ── ٦) رقمُ الرفّ: التعريفُ ثابت ─────────────────────────────────────────── */
console.log("▸ looksLikeShelfCode");
let shelfDef = 0;
for (let i = 0; i < N; i++) { const c = digits(int(1, 14)); if (looksLikeShelfCode(noisy(c)) === (c.length < 8)) shelfDef++; }
check("أقلُّ من ٨ خانات بعد التطبيع = رقمُ رفّ، وإلا باركود", shelfDef === N, `${shelfDef}/${N}`);

/* ── ٧) Tab فاصلاً: أضيقُ من Enter دائماً، ولا يقبل كتابةَ إنسانٍ أبداً ─────
 * الخاصّيةُ الأولى **احتواء**: ما يقبله Tab يقبله Enter قطعاً، والعكسُ ليس
 * لازماً. وهذا مقصود: Tab مفتاحُ تنقّلٍ بين الحقول، فقبولُه الخاطئ يبتلع حركةً
 * يقصدها المستخدم ويهبط سطراً بالسلّة، بينما قبولُ Enter الخاطئ لا يبتلع شيئاً.
 * والخاصّيةُ الثانية هي الجوهر: **لا كتابةَ إنسانٍ تُقرأ مسحةً عند Tab** —
 * مهما أسرع، ومهما تفاوتت فجواتُه. وهذه هي التي كانت مكسورةً وما أمسكها فحص. */
console.log(`▸ Tab فاصلاً — ${N} دفعة`);
let tabSubset = 0, noHumanTab = 0, tabKeeps = 0;
for (let i = 0; i < N; i++) {
  const code = rnd() < 0.5 ? digits(int(3, 14)) : pick(["w90", "A-12", "247", "abc123"]);
  const machine = rnd() < 0.5;
  const feedAll = (asm) => {
    let t = 1000;
    for (let k = 0; k < code.length; k++) { t += k ? (machine ? int(1, 25) : int(80, 400)) : 0; asm.feed(code[k], t); }
    return t;
  };
  const a = createScanAssembler(); const ta = feedAll(a);
  const b = createScanAssembler(); const tb = feedAll(b);
  const viaEnter = a.feed("Enter", ta + int(1, 25));
  const viaTab = b.feed("Tab", tb + int(1, 25));
  if (viaTab === null || viaTab === viaEnter) tabSubset++;

  // إنسانٌ **سريع**: ٤٥–٩٠ ملّي ثانية، وهو المدى الذي كان يُقرأ مسحةً.
  const h = createScanAssembler();
  let th = 4000;
  const typed = digits(int(4, 13));
  for (let k = 0; k < typed.length; k++) { th += k ? int(45, 90) : 0; h.feed(typed[k], th); }
  if (h.feed("Tab", th + int(1, 20)) === null) noHumanTab++;

  // وTab المرفوضُ لا يُفرغ المجمَّع — قياسٌ **فارق** لا شكليّ: أوّلُ صياغةٍ
  // كانت تقبل كلَّ النواتج فلا تفشل مهما انكسر ما تحرسه (أمسكتها المراجعة).
  // البناءُ الفاصل: فجواتٌ ٤٠–٥٥ م.ث — فوق حدّ Tab (٣٥) ودون حدّ Enter (٦٠).
  // فـTab يرفضها حتماً؛ فإن أبقى المجمَّعَ رجع Enter بعده بالرمز كاملاً، وإن
  // أفرغه رجع فارغاً — ولا سبيلَ للنجاح بالصدفة.
  const k = createScanAssembler();
  const kc = digits(int(8, 13));
  let tk = 7000;
  for (let j = 0; j < kc.length; j++) { tk += j ? int(40, 55) : 0; k.feed(kc[j], tk); }
  if (k.feed("Tab", tk + int(1, 15)) === null && k.feed("Enter", tk + int(20, 30)) === kc) tabKeeps++;
}
check("ما يقبله Tab يقبله Enter — ولا عكس (احتواءٌ لا تكافؤ)", tabSubset === N, `${tabSubset}/${N}`);
check("ولا كتابةَ إنسانٍ سريعة (٤٥–٩٠ م.ث) تُقرأ مسحةً عند Tab", noHumanTab === N, `${noHumanTab}/${N}`);
check("وTab المرفوضُ لا يُفرغ المجمَّع (تنقّلٌ لا مسحة)", tabKeeps === N, `${tabKeeps}/${N}`);

/* ── ٨) عكسُ تخطيط الكيبورد: ذهابٌ وإيابٌ بلا فقد ─────────────────────────
 * نبني نصّاً لاتينياً من محارف التخطيط، ثم نكتبه بالعربية كما يخرج من الماسح
 * والكيبوردُ عربيّ، ثم نعكسه — فيجب أن يعود كما كان حرفاً بحرف. */
console.log(`▸ layoutFix — ${N} رمزاً ذهاباً وإياباً`);
const INV = {};
for (const [ar, lat] of Object.entries(AR_LAYOUT)) if (!(lat in INV)) INV[lat] = ar;
INV["b"] = "لا";                                   // محرفان من مفتاحٍ واحد
const LATIN = Object.keys(INV);
/* الخريطةُ ليست أحاديةً بموضعٍ واحد، وهذا من طبيعة التخطيط لا من عطلٍ عندنا:
 * `لا` محرفان يخرجان من مفتاح `b`، وهما أيضاً ناتجُ `g`+`h` متتاليَين
 * (`g`→`ل` و`h`→`ا`). فالعكسُ يقرؤهما `b` دائماً — وهي القراءةُ الصحيحة
 * للماسح، لأن الماسحَ يرسل ضغطةَ مفتاحٍ واحدة لا ضغطتين.
 * فالخاصّيةُ الصادقة: العودةُ مطابقةٌ إلا أن كلَّ `gh` تعود `b`. وادّعاءُ
 * مطابقةٍ تامّة كان يفشل بواحدٍ من كلّ مئة — وهو صدقُ البيانات لا خللَ الشِفرة. */
const readBack = (lat) => lat.replace(/gh/g, "b");
let backOk = 0, cleanUntouched = 0;
for (let i = 0; i < N; i++) {
  const lat = Array.from({ length: int(4, 20) }, () => pick(LATIN)).join("");
  const mangled = [...lat].map((c) => INV[c]).join("");
  if (layoutFix(mangled) === readBack(lat)) backOk++;
  const plain = digits(int(3, 14));
  if (layoutFix(plain) === "") cleanUntouched++;
}
check("الممسوخُ يعود لاتينياً كما كان (و`لا` تُقرأ مفتاحاً واحداً)", backOk === N, `${backOk}/${N}`);
check("والسليمُ لا يُمَسّ", cleanUntouched === N, `${cleanUntouched}/${N}`);

/* ── ٩) تمييزُ المسحة الممسوخة عن الاسم العربيّ ───────────────────────────
 * الخاصّيةُ الحاسمة: **لا اسمَ عربيٌّ يُنذَر عليه**. حارسٌ ينذر على الأسماء
 * يُعلَّم الناسُ تجاهلَه، وحارسٌ يُتجاهَل أسوأ من لا حارس. */
console.log(`▸ looksLayoutMangled — ${N} حالة`);
const WORDS = ["رويال", "أموكسيسيلين", "مستشفيات", "دراي فود", "سبري حشرات", "مغلفات مياو", "بيبي", "شامبو قطط"];
let noFalseAlarm = 0, catchesUrl = 0;
for (let i = 0; i < N; i++) {
  const w = pick(WORDS) + (rnd() < 0.5 ? "" : " " + pick(WORDS));
  if (looksLayoutMangled(w) === "") noFalseAlarm++;
  // رمزٌ حقيقيّ ممسوخ: لاتينيٌّ فيه رقمٌ أو فاصلٌ، بلا مسافة، ثمانيةٌ فأكثر
  const real = Array.from({ length: int(8, 20) }, () => pick("abcdefghijklmnopqrstuvwxyz0123456789/:".split(""))).join("") + int(0, 9);
  const asAr = [...real].map((c) => INV[c] ?? c).join("");
  const got = looksLayoutMangled(asAr);
  if (got === "" || got === readBack(real)) catchesUrl++;
}
check("لا اسمَ عربيٌّ يُنذَر عليه", noFalseAlarm === N, `${noFalseAlarm}/${N}`);
check("وما يُكشف يقرأ كما كان بالضبط (لا قراءةَ مشوّهة)", catchesUrl === N, `${catchesUrl}/${N}`);

/* ── ١٠) شكلُ إكسل: يُكشف دائماً، ولا يُكشف على سليم ──────────────────────── */
console.log(`▸ excelArtifact — ${N} حالة`);
let sciOk = 0, xlTailOk = 0, sane = 0;
for (let i = 0; i < N; i++) {
  const sci = `${int(1, 9)}.${digits(int(1, 6))}E+${int(9, 14)}`;
  if (excelArtifact(sci) === "sci") sciOk++;
  const tail = `${digits(int(6, 13))}.${"0".repeat(int(1, 3))}`;
  if (excelArtifact(tail) === "trailing-zero") xlTailOk++;
  const good = digits(int(3, 14));
  if (excelArtifact(good) === null) sane++;
}
check("الصيغةُ العلمية تُكشف دائماً", sciOk === N, `${sciOk}/${N}`);
check("وذيلُ الأصفار على رقمٍ طويل", xlTailOk === N, `${xlTailOk}/${N}`);
check("وباركودٌ سليم لا يُكشف أبداً", sane === N, `${sane}/${N}`);

/* ── ١١) حدُّ المجمِّع نفسُه: النصفُ للطويل والرُّبعُ للقصير ──────────────────
 * الفحوصُ القائمة تبقى بعيدةً عن الحدّ، فتعديلٌ يقلب `? 2 : 4` أو يبدّل `<=`
 * بـ`<` يمرّ أخضرَ ويُسقط مسحاتٍ بعيادةٍ ذاتِ متصفّحٍ بطيء. فنقف على الحدّ
 * بالضبط: `tolerated` بطيئةً تُقبل، و`tolerated + 1` تُرفض. */
console.log(`▸ حدُّ المجمِّع — ${N} دفعة`);
const runWithSlow = (code, slowCount) => {
  const asm = createScanAssembler();
  const gaps = code.length - 1;
  const slots = new Set();
  while (slots.size < Math.min(slowCount, gaps)) slots.add(int(1, gaps));
  let t = 1000;
  for (let k = 0; k < code.length; k++) {
    if (k > 0) t += slots.has(k) ? int(61, 290) : int(1, 25);
    asm.feed(code[k], t);
  }
  return asm.feed("Enter", t + int(1, 25));
};
let atLimit = 0, overLimit = 0;
for (let i = 0; i < N; i++) {
  const long = rnd() < 0.5;
  const code = long ? digits(int(8, 14)) : digits(int(4, 7));
  const tolerated = Math.floor((code.length - 1) / (long ? 2 : 4));
  if (runWithSlow(code, tolerated) === code) atLimit++;
  if (runWithSlow(code, tolerated + 1) === null) overLimit++;
}
check("عند الحدّ تماماً: تصل", atLimit === N, `${atLimit}/${N}`);
check("وفوقه بواحدة: لا تصل", overLimit === N, `${overLimit}/${N}`);

/* ── ١٢) بادئةُ AIM تمرّ بالمجمِّع قبل أن تصل النجدة ───────────────────────
 * البادئةُ تصل **ضغطاتٍ** من الماسح، فتزيد الطولَ ثلاثةً وتدخل حكمَ الدفعة
 * قبل أن تراها `scanVariants` أصلاً. */
console.log(`▸ بادئةُ AIM — ${N} مسحة`);
let aimArrives = 0, aimStripped = 0;
for (let i = 0; i < N; i++) {
  const code = digits(int(8, 13));
  const prefix = pick(["]E0", "]C1", "]e0"]);
  const full = prefix + code;
  const asm = createScanAssembler();
  let t = 1000;
  for (let k = 0; k < full.length; k++) { t += k ? int(1, 25) : 0; asm.feed(full[k], t); }
  if (asm.feed("Enter", t + int(1, 25)) === full) aimArrives++;
  if (scanVariants(full).includes(matchCode(code))) aimStripped++;
}
check("المسحةُ ببادئتها تصل كاملةً للمجمِّع", aimArrives === N, `${aimArrives}/${N}`);
check("والنجدةُ تعرض الرمزَ بلا بادئة", aimStripped === N, `${aimStripped}/${N}`);

/* ── ١٣) الأطوالُ والمحارفُ الحديّة بمسار المطابقة ────────────────────────
 * الطولُ ٤٠+ (رابطُ QR ممسوح) و`:` كانا يمرّان بفحص التطبيع وحده ولا يمسّان
 * المطابقةَ — وهما بالضبط شكلُ الحالة المقيسة بالإنتاج. */
console.log(`▸ أطوالٌ ومحارفُ حديّة — ${N} حالة`);
const CH = "abcdefghijklmnopqrstuvwxyz0123456789-:./_".split("");
let longOk = 0, colonOk = 0, fragOk = 0;
for (let i = 0; i < N; i++) {
  const long = Array.from({ length: int(40, 60) }, () => pick(CH)).join("");
  const p = { id: "x", name: "مادّة", barcode: long, stock: 1 };
  if (findByCode([p], long)?.id === "x") longOk++;
  const withColon = `${digits(int(2, 5))}:${digits(int(2, 5))}`;
  const q = { id: "y", name: "مادّة", barcode: "ZZZ", alt_codes: [withColon], stock: 1 };
  if (findByCode([q], withColon)?.id === "y") colonOk++;
  // والبحثُ الجزئيّ يلقاه بمقطعٍ من وسطه
  const start = int(0, long.length - 6);
  if (codeMatcher(long.slice(start, start + 5))(p)) fragOk++;
}
check("رمزٌ بأربعين محرفاً فأكثر يُلقى كاملاً", longOk === N, `${longOk}/${N}`);
check("و`:` يُلقى بالرمز الإضافيّ كما بالأساسيّ", colonOk === N, `${colonOk}/${N}`);
check("ومقطعٌ من وسط الطويل يلقيه بالبحث الجزئيّ", fragOk === N, `${fragOk}/${N}`);

console.log(`\n${fails ? "✗" : "✓"} pos-fuzz-test: ${passes} خاصّيةً صحّت، ${fails} فشلت (${N} حالة لكلّ خاصّية)`);
process.exit(fails ? 1 : 0);
