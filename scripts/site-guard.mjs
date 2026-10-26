/* ============================================================================
 * حارسُ الموقع التسويقيّ (٢٥/١٠).
 *
 *   node scripts/site-guard.mjs          ← المحتوى (lint): التكافؤ، الطبقات، الصدق، الأرقام
 *   node scripts/site-guard.mjs --built  ← الناتج (build): الصفحاتُ المولَّدة ورؤوسُها والميزانية
 *
 * لماذا حارسٌ للنصّ لا مراجعةٌ بالعين: الصفحةُ القديمة حملت عشرين ادعاءً كاذباً أو مبالغاً
 * («تذكيرات آلية»، «5GB»، «دعمٌ بأولوية»، «صدّر بياناتك متى شئت») لم يكذّبها أحد لأن أحداً لم يقارن.
 * والموقعُ الجديد بعشرين نسخةً × أربعٍ وعشرين صفحة — ما لا يُفحص بالآلة لن يُفحص.
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { SITE_EDITIONS, SITE_PAGES, SITE_PATHS } from "./site-paths.mjs";

const BUILT = process.argv.includes("--built");
const ROOT = "src/site/content";
let fails = 0, checked = 0;
const bad = (msg) => { fails++; console.error(`   ✗ ${msg}`); };

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}
const rel = (p, base) => relative(base, p).replace(/\\/g, "/");
const load = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { bad(`${p}: JSON تالف — ${e.message}`); return null; } };

/** كلُّ النصوص بمساراتها: [["hero.title", "…"], …] */
function strings(v, path = "", out = []) {
  if (typeof v === "string") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!k.startsWith("$")) strings(x, path ? `${path}.${k}` : k, out);
  return out;
}
const vars = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(",");

/** نفسُ الشكل: المفاتيحُ نفسها، والمصفوفاتُ بالطول نفسه، والأنواعُ نفسها. */
function sameShape(a, b, path, where) {
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b) return bad(`${where}: ${path || "(الجذر)"} نوعٌ مختلف`);
  if (Array.isArray(a)) {
    if (a.length !== b.length) return bad(`${where}: ${path} طولان مختلفان (${a.length} ≠ ${b.length})`);
    a.forEach((x, i) => sameShape(x, b[i], `${path}[${i}]`, where));
  } else if (a && typeof a === "object") {
    const ka = Object.keys(a).filter((k) => !k.startsWith("$")).sort(), kb = Object.keys(b).filter((k) => !k.startsWith("$")).sort();
    const miss = ka.filter((k) => !kb.includes(k)), extra = kb.filter((k) => !ka.includes(k));
    if (miss.length || extra.length) bad(`${where}: ${path || "(الجذر)"} مفاتيحُ مختلفة (ناقص: ${miss.join(",") || "—"} · زائد: ${extra.join(",") || "—"})`);
    for (const k of ka) if (kb.includes(k)) sameShape(a[k], b[k], path ? `${path}.${k}` : k, where);
  }
}

/* ── الصدق: ما يُمنع قولُه بأيّ نسخة ── */
const FORBID = [
  [/(يرسل|ترسل|يُرسل|تُرسل|إرسال|ارسال|تنرسل|ينرسل)[^.،؛\n]{0,30}(تلقائي|آلي)|(تلقائي|آلي)[^.،؛\n]{0,30}(يرسل|ترسل|إرسال|ارسال|تنرسل|رسائل|رسالة)/, "إرسالٌ «تلقائي» — كلُّ رسالةٍ تُرسل بلمسة"],
  [/automatic(ally)?[^.;\n]{0,30}(send|sent|messag|remind)|(send|sent|messag)\w*[^.;\n]{0,20}automatic/i, "automatic sending — every message is one tap"],
  [/ذكاء اصطناعي|\bAI\b|artificial intelligence|machine learning/i, "ذكاءٌ اصطناعي — القواعدُ ثابتة"],
  [/الأفضل|رقم\s*1\b|#1\b|\bthe best\b|\bbest-in-class\b/i, "تفضيلٌ بلا دليل"],
  [/(100|١٠٠)\s*(ضعف|x\b)|100x/i, "«100 ضعف»"],
  [/(يعمل|تعمل|يشتغل|تشتغل|تبيع|يبيع)[^.،؛\n]{0,20}(بدون|بلا|من غير)\s*(ال)?(إنترنت|انترنت|نت)|works? offline|without (an )?internet( connection)?/i, "«يعمل بلا إنترنت» — البيعُ يحتاج اتصالاً"],
  [/(ألغِ|الغِ|إلغاء|تلغي)[^.،؛\n]{0,15}(أي|بأي|متى) ?(وقت|ما)|cancel (any ?time|at any time)/i, "«ألغِ متى شئت» — لا تجديدَ تلقائيّ أصلاً"],
  [/\d+\s*(GB|TB|جيجا|غيغا)|(\d+\s*(users|seats))|(\d+\s*(مستخدم|مستخدمين))/i, "حدودُ مستخدمين أو مساحة غيرُ مفروضة"],
  [/الأكثر (شيوعاً|شيوعا|مبيعاً|طلباً)|most popular/i, "«الأكثر شيوعاً» بلا قياس"],
  [/دعم (بأولوية|أولوية)|priority support/i, "«دعمٌ بأولوية» بلا قناة"],
  // «كل» وحدها كانت تمسك «تُخرج طبلة كلّ حيوان إلى Excel» — وهي صدق؛ الادعاءُ «كلُّ البيانات» لا «كلُّ سجلّ».
  [/(صدّر|تصدير|export)[^.،؛\n]{0,25}(كامل|كلّ?\s+(ال)?(بيانات|شي|سجلات|ملفات)|بياناتك كلها|\ball\s+(of\s+)?(your\s+|the\s+)?(data|records)|everything)|full (data )?export/i, "تصديرٌ كامل غيرُ موجود"],
  [/[٠-٩]/, "أرقامٌ شرقية — الأرقامُ غربيةٌ بكلّ النسخ"],
  [/(عيادة|عيادات|clinics?)\s*\+?\d{2,}|\d{2,}\+?\s*(عيادة|clinics)/i, "عددُ عياداتٍ بلا مصدر"],
  // اسمٌ لاتينيّ يليه رقمٌ بسطرٍ فيه عربيّة يصيران كتلةً واحدةً من اليسار: «جرّب doctorVet 14 يوماً» تُرى
  // «جرّب 14 doctorVet» — وكذلك «doctorVet: 14» وسطرٌ يبدأ بالاسم (تدقيقٌ عدائيّ).
  // وبينهما أيُّ ما ليس حرفاً («»، —، ؛، /، علامات) وبأيّ حالة — إلا قوسٌ يغلق الاسم.
  [/^(?=[\s\S]*[؀-ۿ])[\s\S]*doctorVet[^\p{L}()[\]{}]*\d/iu, "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
];
/* النفيُ يُعفي الجملةَ حين يسبق الادعاءَ مباشرةً، لا حين يقع في أيّ مكانٍ بها: «لا يوجد بعدُ تصديرٌ لكلّ
 * بياناتك» صدقٌ، و«كلُّ ما تحتاجه: إرسالٌ تلقائيّ» ادعاء — كان «ما» الموصولة (و«no» و«yet» بأيّ موضع)
 * تعفيها (تدقيقٌ عدائيّ). النفيُ القويّ بآخر خمس كلماتٍ قبله في المقطع نفسه أو داخله، و«ما»/«no»/«yet»
 * بالكلمة التي تسبقه وحدها. («بلا/بدون/without» ليست نفياً — هي من صلب «يعمل بلا إنترنت».)
 * ونفيُ اللهجات نفيٌ أيضاً: «مش» المصرية والشامية، و«مو» و«ماكو» العراقية، و«مب» و«مافي» الخليجية. */
const NEG_STRONG = /(^|\s)[وف]?(لا|ليس|ليست|لم|لن|غير|غيرُ|ممنوع|لسّه|بعدُ|مش|مو|مب|ماكو|مافي|مارح)(?=\s|$)|(^|\s)ما\s+(في|فيه|راح|رح)(?=\s|$)|\b(not|isn't|aren't|doesn't|don't|won't|wouldn't|didn't|cannot|can't|never|nothing|none)\b/i;
const NEG_WEAK = /^[وف]?ما$|^yet$/i;
// و«no» تحكم اسمَها وإن فصلتها صفات: «There is no single full export» — بآخر ثلاث كلمات.
const NEG_NO = /^no$/i;
// فاصلُ عبارة: علامات، وأدواتُ عطفٍ واستدراك — نفيٌ قبلها لا يحكم ما بعدها («لا نحتاج إعداداً وتُرسل…»).
const CLAUSE = /[.؟?!؛\n،,:—–]|\s(?:but|because|as|so|and|لكن|لأن|بس)\s/i;
const NO_EXEMPT = new Set(["أرقامٌ شرقية — الأرقامُ غربيةٌ بكلّ النسخ", "عددُ عياداتٍ بلا مصدر", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"]);
/** ما يدّعيه النصّ ممّا يُمنع — بعد إعفاء المنفيّ. */
function negated(s, m) {
  let words = s.slice(0, m.index).split(CLAUSE).pop().trim().split(/\s+/).filter(Boolean);
  // كلمةٌ تبدأ بواو أو فاء العطف (أو هي «و» ملتصقةٌ بالفعل المطابَق) تبدأ عبارةً جديدة.
  // («وتُرسل» عطفٌ على فعل؛ «في» و«فيه» و«وين» ليست عطفاً.)
  const conj = words.findLastIndex((w) => /^[وف]$/.test(w) || (w.length >= 4 && /^[وف][تينأ]/.test(w) && !/^(فيها|فيهم|فيما|وياه|ويّاه)$/.test(w)));
  if (conj >= 0) words = words.slice(conj + 1);
  const head = m[0].split(/\s+/).slice(0, 3).join(" ");
  return NEG_STRONG.test(words.slice(-5).join(" ")) || NEG_STRONG.test(head) || NEG_WEAK.test(words.at(-1) ?? "") || words.slice(-3).some((w) => NEG_NO.test(w));
}
function claims(raw) {
  const s = raw.replace(/[’‘]/g, "'");
  const out = [];
  for (const [re, why] of FORBID) {
    // كلُّ موضعٍ يطابق يُحكم وحده: نفيُ الأوّل كان يعفي النصَّ كلَّه وفيه ادعاءٌ ثانٍ غيرُ منفيّ.
    const all = [...s.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
    if (all.some((m) => NO_EXEMPT.has(why) || !negated(s, m))) out.push(why);
  }
  return out;
}
/* الحكمُ نفسُه يُفحص: ما يجب أن يُمسك، وما هو صدقٌ يجب أن يمرّ. */
for (const [s, want] of [
  ["تصديرٌ كامل لبياناتك بضغطة", "تصديرٌ كامل غيرُ موجود"],
  ["صدّر كل بياناتك متى شئت", "تصديرٌ كامل غيرُ موجود"],
  ["Export all your data in one click", "تصديرٌ كامل غيرُ موجود"],
  ["Full export of your clinic", "تصديرٌ كامل غيرُ موجود"],
  ["تُخرج طبلة كل حيوان وجرد المخزن إلى Excel", null],
  ["Export each pet's record to Excel", null],
  ["جرّب doctorVet 14 يوماً بجانب نظامك", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
  ["جرّب doctorVet لمدة 14 يوماً", null],
  ["Try doctorVet 14 days alongside your system", null],
  ["جرّب doctorVet: 14 يوماً مجاناً", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
  ["doctorVet 14 يوماً بكل الميزات", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
  ["جرّب (doctorVet) لمدة 14 يوماً", null],
  // النفيُ: يُعفي حين يسبق الادعاءَ، لا «ما» الموصولة ولا «no» بعيدة.
  ["لا يوجد بعدُ تصديرٌ لكلّ بياناتك", null],
  ["الرسالة ما تنرسل تلقائياً", null],
  ["Messages are never sent automatically", null],
  ["No messages are sent automatically", null],
  ["كل ما تحتاجه: إرسال تلقائي للتذكيرات", "إرسالٌ «تلقائي» — كلُّ رسالةٍ تُرسل بلمسة"],
  ["Reminders are sent automatically, no setup needed", "automatic sending — every message is one tap"],
  ["No setup: reminders are sent automatically", "automatic sending — every message is one tap"],
  ["There is no single full export of clients today", null],
  ["No hassle — export all your data in one click", "تصديرٌ كامل غيرُ موجود"],
  // كلُّ موضعٍ وحده، والعطفُ يقطع النفي، ونفيٌ بلهجةٍ أو بفاصلةٍ معقوفة.
  ["No messages are sent automatically. Reminders are sent automatically.", "automatic sending — every message is one tap"],
  ["لا نحتاج إعداداً وتُرسل الرسائل تلقائياً", "إرسالٌ «تلقائي» — كلُّ رسالةٍ تُرسل بلمسة"],
  ["Setup is not needed and reminders are sent automatically", "automatic sending — every message is one tap"],
  ["Reminders aren’t sent automatically", null],
  ["Reminders won't be sent automatically", null],
  ["ما في إرسال تلقائي للرسائل", null],
  ["الرسالة ما راح تنرسل تلقائياً", null],
  ["جرّب «doctorVet» 14 يوماً", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
  ["جرّب doctorvet — 14 يوماً", "«doctorVet» يليه رقمٌ بسطرٍ عربيّ — ينقلب ترتيبُهما على الشاشة"],
]) {
  const hit = claims(s)[0] ?? null;
  if (hit !== want) bad(`قاعدةُ الصدق تحكم على «${s}» بـ«${hit ?? "مرور"}» والمطلوب «${want ?? "مرور"}»`);
}
function honest(file, s, path) {
  for (const why of claims(s)) bad(`${file} ${path}: ${why} — «${s.slice(0, 90)}»`);
  if (!s.trim()) bad(`${file} ${path}: نصٌّ فارغ`);
}

/* ═══════════════════════ المحتوى ═══════════════════════ */
const ar = new Map(walk(join(ROOT, "ar")).map((p) => [rel(p, join(ROOT, "ar")), p]));
const en = new Map(walk(join(ROOT, "en")).map((p) => [rel(p, join(ROOT, "en")), p]));
if (!ar.size) bad("لا محتوى عربيّاً بـsrc/site/content/ar");
for (const [k, pa] of ar) {
  const pe = en.get(k);
  if (!pe) { bad(`${k}: بالعربية بلا إنكليزية`); continue; }
  const A = load(pa), B = load(pe);
  if (!A || !B) continue;
  checked++;
  sameShape(A, B, "", k);
  const sa = new Map(strings(A)), se = new Map(strings(B));
  for (const [p, s] of sa) { honest(`ar/${k}`, s, p); const t = se.get(p); if (t !== undefined && vars(s) !== vars(t)) bad(`${k} ${p}: المتغيّرات {{}} مختلفة بين اللغتين`); }
  for (const [p, s] of se) honest(`en/${k}`, s, p);
}
for (const k of en.keys()) if (!ar.has(k)) bad(`${k}: بالإنكليزية بلا عربية`);

/* طبقاتُ اللهجة: جزئيّة، لا تضيف مفتاحاً غيرَ موجودٍ بالعربية، وقوائمُها بطول الأساس */
const DIALECTS = ["iq", "gulf", "eg", "lev"];
const AR_TEXT = /[؀-ۿ]/;
function overlayOk(over, base, path, where) {
  if (Array.isArray(over)) {
    if (!Array.isArray(base)) return bad(`${where}: ${path} مصفوفةٌ فوق غير مصفوفة`);
    if (over.length !== base.length) return bad(`${where}: ${path} طولُها ${over.length} والأساسُ ${base.length}`);
    // تُدمج عنصراً عنصراً (content.ts): null = كما بالأساس، والكائنُ جزئيٌّ كأيّ طبقة.
    over.forEach((x, i) => { if (x !== null) overlayOk(x, base[i], `${path}[${i}]`, where); });
    return;
  }
  if (over && typeof over === "object") {
    if (!base || typeof base !== "object" || Array.isArray(base)) return bad(`${where}: ${path} كائنٌ فوق غير كائن`);
    for (const [k, v] of Object.entries(over)) {
      if (k.startsWith("$")) continue;
      if (!(k in base)) { bad(`${where}: ${path ? path + "." : ""}${k} ليس بالعربية البيضاء — الطبقةُ لا تضيف`); continue; }
      overlayOk(v, base[k], path ? `${path}.${k}` : k, where);
    }
    return;
  }
  // اللهجةُ تغيّر الكلامَ العربيّ وحده: رابطٌ أو مفتاحٌ أو باقةٌ أو خانةُ مقارنة أو تاريخٌ — وقائمةُ روابط
  // (`related`) عنصراً عنصراً — يبقى كما بالأساس، فلا يُوجَّه رابطٌ بلهجةٍ لغير وجهته بلا أن يُرى.
  if (typeof base !== "string" || !AR_TEXT.test(base)) bad(`${where}: ${path} ليس كلاماً عربيّاً بالأساس — الطبقةُ لا تغيّره`);
  else if (typeof over !== "string") bad(`${where}: ${path} نوعٌ مختلف عن الأساس`);
  else if (vars(over) !== vars(base)) bad(`${where}: ${path} متغيّراتٌ مختلفة عن الأساس`);
  // نسخةٌ من الأساس بالطبقة لا تضيف شيئاً اليوم، وغداً تُخفي تصحيحَ الأساس عن صفحات هذه اللهجة.
  else if (over === base) bad(`${where}: ${path} نسخةٌ من الأساس — احذفها (أو null داخل القائمة)`);
}
/* كلُّ سطر لهجةٍ يحمل بصمةَ سطر الأساس الذي ترجمه (`$base`: المسار ⇒ بصمتُه). الدمجُ بالموضع (عنصراً
 * عنصراً)، فأساسٌ أُعيد ترتيبُه كان سيُلبس سؤالَ لهجةٍ جوابَ غيره بصمت، وأساسٌ صُحّح يبقى سطرُ لهجته على
 * القديم (تدقيقٌ عدائيّ). تغيّرت البصمة ⇒ يفشل الحارس حتى يراجع كاتبُ اللهجة السطرَ ثم يختم:
 *   node scripts/site-guard.mjs --stamp
 * وما يأتي من الأساس وحده (جوابٌ لم تترجمه الطبقة) يتبع الأساسَ بلا ختم. */
const STAMP = process.argv.includes("--stamp");
const fp = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const at = (obj, path) => (path.match(/[^.[\]]+/g) ?? []).reduce((o, t) => (o == null ? undefined : o[/^\d+$/.test(t) ? Number(t) : t]), obj);
let layers = 0, stamped = 0;
for (const d of DIALECTS) {
  for (const p of walk(join(ROOT, "dialects", d))) {
    const k = rel(p, join(ROOT, "dialects", d));
    const base = ar.get(k) ? load(ar.get(k)) : null;
    if (!base) { bad(`dialects/${d}/${k}: لا أساسَ عربيٌّ له`); continue; }
    let over = load(p);
    if (!over) continue;
    layers++;
    const leaves = strings(over);
    if (STAMP) {
      const { $base: _old, ...rest } = over;
      over = { $base: Object.fromEntries(leaves.map(([path]) => [path, fp(String(at(base, path)))])), ...rest };
      writeFileSync(p, JSON.stringify(over, null, 2) + "\n");
      stamped++;
    }
    overlayOk(over, base, "", `dialects/${d}/${k}`);
    for (const [path, s] of leaves) {
      honest(`dialects/${d}/${k}`, s, path);
      const b = at(base, path);
      if (typeof b === "string" && over.$base?.[path] !== fp(b)) bad(`dialects/${d}/${k} ${path}: الأساسُ تغيّر (أو تحرّك) بعد كتابة سطر اللهجة — راجعه ثم اختم: node scripts/site-guard.mjs --stamp`);
    }
  }
}
if (STAMP) console.log(`   ✓ خُتمت ${stamped} طبقةً ببصمات أسطر الأساس`);

/* قيمٌ مغلقة: الباقة، والتصنيفاتُ المرتبطة، ومجموعاتُ القائمة */
const SLUGS = ["records", "hospital", "lab", "vaccines", "reception", "pharmacy", "pos", "credit-delivery", "store", "whatsapp", "owners", "reports", "team", "branches", "poultry", "printing"];
for (const lang of ["ar", "en"]) {
  for (const s of SLUGS) {
    const f = lang === "ar" ? ar.get(`features/${s}.json`) : en.get(`features/${s}.json`);
    if (!f) { bad(`${lang}/features/${s}.json مفقود`); continue; }
    const j = load(f);
    if (!j) continue;
    if (!["all", "advanced", "super", "farm"].includes(j.plan)) bad(`${lang}/features/${s}: plan «${j.plan}» ليست باقة`);
    for (const r of j.related ?? []) if (!SLUGS.includes(r) || r === s) bad(`${lang}/features/${s}: related «${r}»`);
    for (const row of j.mock?.rows ?? []) if (row.tone && !["ok", "warn", "bad", "info"].includes(row.tone)) bad(`${lang}/features/${s}: tone «${row.tone}»`);
  }
  const common = (lang === "ar" ? ar : en).get("common.json");
  const cj = common && load(common);
  if (cj) {
    const all = cj.mega.groups.flatMap((g) => g.items).concat(cj.mega.featured.slug);
    for (const s of all) if (!SLUGS.includes(s)) bad(`${lang}/common: mega «${s}» ليس تصنيفاً`);
    for (const s of SLUGS) if (!all.includes(s)) bad(`${lang}/common: التصنيف «${s}» غائبٌ عن القائمة`);
  }
  const home = (lang === "ar" ? ar : en).get("home.json");
  const hj = home && load(home);
  if (hj) {
    for (const t of hj.tour?.tabs ?? []) if (!SLUGS.includes(t.feature)) bad(`${lang}/home: tour «${t.feature}»`);
    for (const p of hj.pains?.items ?? []) if (!SLUGS.includes(p.feature)) bad(`${lang}/home: pains «${p.feature}»`);
    for (const s of hj.segments?.items ?? []) if (!SLUGS.includes(s.link) && !["start", "pricing"].includes(s.link)) bad(`${lang}/home: segment «${s.link}»`);
    for (const r of hj.hero?.card?.rows ?? []) if (!["given", "due"].includes(r.status)) bad(`${lang}/home: card status «${r.status}»`);
  }
}

/* ═══════════════════════ الناتج ═══════════════════════ */
let pages = 0;
if (BUILT) {
  const EDS = SITE_EDITIONS;
  const htmls = [];
  const collect = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) collect(p); else if (n === "index.html") htmls.push(p); } };
  for (const e of [...EDS, "privacy", "terms"]) if (existsSync(join("dist", e))) collect(join("dist", e)); else bad(`dist/${e} مفقود — التوليدُ لم يجرِ`);
  for (const p of htmls) {
    const h = readFileSync(p, "utf8");
    pages++;
    if (!/<html lang="(ar-[A-Z]{2}|en)" dir="(rtl|ltr)">/.test(h)) bad(`${p}: lang/dir`);
    if (!/<link rel="canonical" href="https:\/\/www\.doctorvet\.vet\//.test(h)) bad(`${p}: canonical`);
    if (!/<title>[^<]{8,}<\/title>/.test(h)) bad(`${p}: title`);
    // مدخلاتُ الجُزُر (`data-props`) قوالبُ يملؤها المتصفّح ({{country}} باقتراح النسخة) فتُفحص بلا {{}}؛
    // والنصُّ المعروض بعدها لا يحمل قالباً واحداً.
    const props = [...h.matchAll(/data-props="([^"]*)"/g)].map((m) => m[1]).join(" ");
    const shown = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/data-props="[^"]*"/g, "");
    if (/undefined|\[object Object\]|NaN|\{\{\w+\}\}/.test(shown)) bad(`${p}: بقايا (undefined / NaN / {{var}})`);
    if (/undefined|\[object Object\]|NaN/.test(props)) bad(`${p}: مدخلاتُ جزيرةٍ فيها undefined / NaN`);
    const isEd = !/dist[\\/](privacy|terms)[\\/]/.test(p);
    if (isEd && (h.match(/hreflang="/g) ?? []).length !== EDS.length + 1) bad(`${p}: hreflang ${(h.match(/hreflang="/g) ?? []).length} ≠ ${EDS.length + 1}`);
    if (/name="site-head"/.test(h)) bad(`${p}: علامةُ القالب باقية`);
    // سعرُ الرئيسية وعدٌ يُسأل حيّاً (جزيرةٌ تقرأ public_pricing) — رقمٌ ثابتٌ يبقى قديماً بعد تعديل المالك.
    if (/dist[\\/][a-z]{2}[\\/]index\.html$/.test(p) && !h.includes('data-island="PriceFrom"')) bad(`${p}: «يبدأ من» بلا جزيرة السعر الحيّ`);
  }
  if (!existsSync("dist/sitemap.xml") || (readFileSync("dist/sitemap.xml", "utf8").match(/<loc>/g) ?? []).length !== pages) bad(`sitemap.xml: عددُ الروابط ≠ ${pages}`);
  /* الميزانية: مستندٌ مولَّدٌ نموذجيّ + كلُّ ما ينزل لإقلاعه — المدخلُ وما يستورده، وكلُّ جزيرةٍ بالصفحة
   * وما تستورده (`main.tsx` يحييها كلَّها لحظةَ التحميل). كان العدُّ لما يعلنه المستندُ وحده، فالجُزُرُ
   * المحمَّلةُ بـimport() خارج الحساب و«بلا supabase» ادّعاءٌ عن ملفّاتٍ لم تُقرأ (تدقيقٌ عدائيّ). تنزل ولا تصعد. */
  const BUDGET = 120_000;
  const MAN = "dist/site-manifest.json";
  if (!existsSync(MAN)) bad(`${MAN} مفقود — بناءُ الموقع (vite.site.config.ts) لم يجرِ`);
  else {
    const man = JSON.parse(readFileSync(MAN, "utf8"));
    const seen = new Set(), files = new Set();
    // الجزيرةُ وما تستورده — ثابتاً ومؤجَّلاً (import() داخلها ينزل حين تُحيا). ومدخلُ الموقع بثابته وحده:
    // مؤجَّلاتُه هي الجُزُرُ كلُّها، ولا ينزل منها إلا ما بالصفحة.
    const visit = (key, deep) => {
      const e = man[key];
      if (!e) return bad(`${key}: ليس بخريطة بناء الموقع`);
      if (seen.has(key)) return;
      seen.add(key); files.add(e.file);
      for (const c of e.css ?? []) files.add(c);
      for (const i of e.imports ?? []) visit(i, deep);
      if (deep) for (const i of e.dynamicImports ?? []) visit(i, deep);
    };
    const entry = Object.keys(man).find((k) => man[k].isEntry && /site\.html$/.test(k));
    if (!entry) bad("لا مدخلَ site.html بخريطة البناء");
    else {
      /* كلُّ صفحةٍ مولَّدة تُوزن (المستندُ + المدخلُ + جُزُرُها وما تجرّه)، لا عيّنتان: الأثقلُ قد يكون نسخةً
       * بلهجةٍ أطول أو صفحةَ ميزةٍ بجزيرةٍ جديدة. ضغطُ الملفّ المشترك يُحسب مرّةً واحدة. */
      const gz = new Map();
      const size = (f) => { if (!gz.has(f)) gz.set(f, gzipSync(readFileSync(join("dist", f))).length); return gz.get(f); };
      const covered = new Set();
      let heaviest = ["", 0, 0, 0], over = 0;
      for (const p of htmls) {
        seen.clear(); files.clear();
        const doc = readFileSync(p, "utf8");
        const islands = [...new Set([...doc.matchAll(/data-island="(\w+)"/g)].map((m) => m[1]))];
        visit(entry, false);
        if (!doc.includes(`/${man[entry].file}`)) bad(`${p}: لا يحمّل مدخلَ الموقع المبنيّ (${man[entry].file})`);
        for (const n of islands) { visit(`src/site/islands/${n}.tsx`, true); covered.add(n); }
        const total = gzipSync(doc).length + [...files].reduce((n, f) => n + size(f), 0);
        if (total > BUDGET) { over++; if (over <= 5) bad(`${p}: ${total.toLocaleString("en")} بايتاً مضغوطة > ${BUDGET.toLocaleString("en")}`); }
        if (total > heaviest[1]) heaviest = [p, total, files.size, islands.length];
      }
      if (!over) console.log(`   ✓ ${htmls.length} صفحةً وُزنت؛ أثقلُها ${heaviest[0].replace(/^dist[\\/]/, "/").replace(/index\.html$/, "").replace(/\\/g, "/")}: ${heaviest[1].toLocaleString("en")} بايتاً مضغوطة من ${BUDGET.toLocaleString("en")} (المستند + ${heaviest[2]} ملفاً، منها ${heaviest[3]} جُزُر)`);
      const all = Object.keys(man).filter((k) => /^src\/site\/islands\/\w+\.tsx$/.test(k));
      for (const k of all) if (!covered.has(k.match(/(\w+)\.tsx$/)[1])) bad(`${k}: جزيرةٌ لا تقع بأيّ صفحةٍ مولَّدة`);
      // وكلُّ ملفّات الموقع (المدخلُ وكلُّ جزيرة وما تجرّه) بمجلّده لا بحزم التطبيق. والمكتباتُ الممنوعة
      // (Supabase، الحركة، الرسوم) يرفضها بناءُ الموقع نفسُه بمسار الوحدة — الاسمُ لا ينجو من التصغير.
      seen.clear(); files.clear();
      visit(entry, false);
      for (const k of all) visit(k, true);
      for (const f of files) if (!f.startsWith("site-assets/")) bad(`${f}: خارج site-assets/ — بناءُ الموقع اختلط بالتطبيق`);
      console.log(`   ✓ ${all.length} جُزُر وزنت وكلُّ ملفّات الموقع (${files.size}) بـsite-assets/؛ ومكتباتُ التطبيق يرفضها البناء (vite.site.config.ts)`);
    }
  }

  /* العاملُ المبنيّ يترك مساراتِ الموقع للخادم — باستعلامها. القائمةُ في sw.js هي القائمةُ المشتركة
   * حرفاً بحرف، ولا يحمل تخزينُه المسبق ملفاً من الموقع (يُبنى بعده). */
  if (!existsSync("dist/sw.js")) bad("dist/sw.js مفقود");
  else {
    const sw = readFileSync("dist/sw.js", "utf8");
    if (!sw.includes(SITE_PATHS.source)) bad("العاملُ المبنيّ لا يحمل قائمةَ مسارات الموقع (scripts/site-paths.mjs)");
    else console.log("   ✓ العاملُ المبنيّ يحمل قائمةَ مسارات الموقع، فـ/sa?fbclid=… يصل للخادم");
    // كلُّ مدخلٍ بقائمة التخزين المسبق (`url:"…"`) — لا صفحةُ نسخة ولا ملفٌّ من الموقع.
    const pre = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
    if (pre.length < 5) bad(`dist/sw.js: قائمةُ التخزين المسبق لم تُقرأ (${pre.length}) — تغيّر شكلُها؟`);
    const siteRe = new RegExp(`^(${[...SITE_EDITIONS, ...SITE_PAGES].join("|")})/|^(site\\.html|site-manifest\\.json|sitemap\\.xml)$|^site-assets/`);
    const leaked = pre.filter((u) => siteRe.test(u));
    if (leaked.length) bad(`التخزينُ المسبق للعامل يحمل ملفّاتٍ من الموقع: ${leaked.slice(0, 4).join("، ")}`);
    else console.log(`   ✓ تخزينُ العامل المسبق (${pre.length} ملفّاً) بلا صفحةٍ ولا ملفٍّ من الموقع`);
  }
}

/* قوائمُ النسخ كلُّها قائمةٌ واحدة: المسارات (العامل)، والنسخ (editions.ts)، وvercel.json. نسخةٌ تُضاف بمكانٍ
 * وتُنسى بآخر = صفحةٌ يخدمها العاملُ من قشرة التطبيق، أو مسارٌ يقع على `/(.*)` فيحمّل التطبيق. */
{
  const eds = readFileSync("src/site/editions.ts", "utf8");
  const fromEditions = [...eds.matchAll(/E\("([a-z]{2})"/g)].map((m) => m[1]).concat(/code: "en"/.test(eds) ? ["en"] : []);
  if (fromEditions.join() !== SITE_EDITIONS.join()) bad(`editions.ts (${fromEditions.join()}) ≠ site-paths.mjs (${SITE_EDITIONS.join()})`);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const lists = vercel.rewrites.map((r) => /^\/:(?:cc|page)\(([a-z|]+)\)/.exec(r.source)?.[1]).filter(Boolean);
  const ccLists = lists.filter((l) => l.split("|").includes("iq"));
  if (ccLists.length !== 2 || ccLists.some((l) => l !== SITE_EDITIONS.join("|"))) bad(`vercel.json: قائمةُ النسخ ≠ site-paths.mjs (${ccLists.join(" / ")})`);
  if (!lists.includes(SITE_PAGES.join("|"))) bad(`vercel.json: صفحاتُ ${SITE_PAGES.join("/")} بلا إعادة كتابة`);
  const catchAll = vercel.rewrites.findIndex((r) => r.source === "/(.*)");
  if (vercel.rewrites.findIndex((r) => /^\/:cc\(/.test(r.source)) > catchAll) bad("vercel.json: إعادةُ كتابة النسخ بعد `/(.*)` فلا تُبلغ");
  console.log(`   ✓ ${SITE_EDITIONS.length} نسخةً: editions.ts = site-paths.mjs = vercel.json (والبوّابةُ يقارنها signup-test)`);
}

console.log(fails
  ? `✗ site-guard: ${fails} مشكلةً`
  : `✓ site-guard: ${checked} صفحةً بلغتين متكافئتين، ${layers} طبقةَ لهجةٍ داخل الأساس مختومةً بأسطره، بلا ادعاءٍ ممنوع${BUILT ? `، و${pages} صفحةً مولَّدةً برؤوسها` : ""}`);
if (fails) process.exit(1);
