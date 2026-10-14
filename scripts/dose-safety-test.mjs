/* ============================================================================
 * الجرعةُ المكتوبة هي التي تُعطى — محرّكُ الجرعات (`vetFormulary`) وكُتّابُه الثلاثة.
 *
 * ── الجذرُ المقيس (خريطة الوحدات، b700fb4) ───────────────────────────────
 * أربعةُ عيوبٍ بالحساب نفسِه لا بالواجهة، كلٌّ منها يعطي جرعةً غيرَ المكتوبة
 * بلا أن يرنّ تنبيه:
 *  ١) نصُّ الخطة يمرّ من `formatNum` — دالّةُ الأعداد والمبالغ بلا كسور — فـ0.06 مل
 *     تُكتب «0 مل» و0.6 مل تُكتب «1 مل». ٤٥ صفّاً «0 مل» بالإنتاج، ٩ منها أُعطيت.
 *  ٢) الحبةُ تُقرَّب لربعٍ **بحدٍّ أدنى ربع** (`Math.max(0.25, …)`): بريدنيزولون ٢٠ ملغ
 *     لقطّةٍ ٢ كغ يصير ¼ حبة = 2.5 ملغ/كغ (النافذة حتى 2)، وفيروكوكسيب ٢٢٧ لكلبٍ ٣ كغ
 *     يصير 18.9 ملغ/كغ (الحدّ 5).
 *  ٣) الحجمُ `Math.round` عارٍ والتعليقُ فوقه يقول «ننزل قرب السقف»: إنروفلوكساسين
 *     ١٠٠ ملغ/مل لقطّةٍ 4.5 كغ يصير 0.23 مل = 5.11 ملغ/كغ — فوق خطّ العمى الشبكيّ (5).
 *  ٤) فحصُ الأمان يقرأ الجرعةَ **المقصودة** لا المُعطاة، فلا شيءَ من هذا يُنبَّه عليه.
 * ومعها `AddTaskSheet` تكتب «½ حبة قرص» لأن التسميةَ تنتهي بـ«حبة» أصلاً.
 *
 * فهذا الملفّ يقود الوحدةَ الحقيقيّة (لا نسخةً منها) بالأمثلة المقيسة بأرقامها، ويقرأ
 * نصَّ الكُتّاب ليثبت أنهم يمرّون منها — كاتبٌ يركّب نصَّه بنفسه يعيد العطبَ بصمت.
 *
 *   node scripts/dose-safety-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
/** قسمٌ يُفحص كلُّه: دالّةٌ غائبة فشلٌ يُقال بسببه، لا انهيارٌ يُخفي الأقسامَ بعده. */
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى (البروتوكولاتُ تقرأ دوامَ العيادة) -------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };

/* الترجمةُ بديلٌ يستبدل {{n}} — نصُّ الكمية المكتوب هو ما يُفحص، فلا يكفي مفتاحٌ خام. */
const STUBS = {
  "@/i18n": "const fill = (s, o) => String(s).replace(/\\{\\{(\\w+)\\}\\}/g, (_, v) => (o && o[v] !== undefined ? String(o[v]) : '')); export default { t: (k, o) => fill((o && o.defaultValue) || k, o), language: 'ar' };",
  "./settings": "export const getCareProtocolsRaw = () => null; export const setCareProtocolsRaw = () => {}; export const getWorkHours = () => ({ am: null, pm: null }); export const getDoseWindow = () => ({ mode: 'auto' });",
};
const load = async (contents) => {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' },
    banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        const names = Object.keys(STUBS).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
        b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "dose-safety-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};
const F = await load([
  `export * from "./src/lib/vetFormulary.ts";`,
  `export { amountFor } from "./src/lib/protocols.ts";`,
].join("\n"));
const drug = (id) => F.DRUG_BY_ID.get(id);

/** نصُّ المصدر بلا تعليقات — شرحٌ يذكر formatNum أو «قرص» ليس استعمالاً. */
const src = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));
/** جسمُ ثابتٍ/دالّةٍ داخليّة باسمه: من تعريفه حتى أوّل سطرٍ يعود لمسافة بادئته. */
const innerBody = (s, name) => {
  const m = new RegExp(`^([ \\t]*)(?:const\\s+${name}\\s*=|function\\s+${name}\\s*\\()`, "m").exec(s);
  if (!m) return "";
  const rest = s.slice(m.index + m[0].length);
  const end = new RegExp(`\\n${m[1]}\\S`).exec(rest);
  return rest.slice(0, end ? end.index : undefined);
};
/** «0 مل» كلمةً — لا 0.06 مل ولا 10 مل. */
const ZERO_ML = /(^|[^\d.,])0\s*مل/;
const dose = (o) => F.calcDose({ freq: 24, ...o });
/* الغائبُ يُقال بنصّه لا بانهيار: فحصٌ يسقط عند أوّل دالّةٍ ناقصة يُخفي الأمثلةَ المقيسة بعدها. */
const ceil = (id, sp, freq = 24) => F.doseCeiling?.(drug(id), F.doseFor(drug(id), sp), freq);
const plan = (c) => (F.planAmountText ? F.planAmountText(c) : "∅ لا كاتبَ موحَّداً لنصّ الخطة");
const task = (c) => (F.taskAmountText ? F.taskAmountText(c) : "∅ لا كاتبَ موحَّداً لنصّ الورقة");

/* ── ١) «0 مل» لا يُكتب ──────────────────────────────────────────────────── */
await section("▸ ١) الحجمُ الصغير يُكتب برقمه — لا «0 مل» ولا «1 مل» عن 0.6", () => {
  // ميلوكسيكام ٥ ملغ/مل لقطّةٍ ٣ كغ بجرعتها المعتادة 0.1 — أكثرُ ما وقع بالإنتاج.
  const melox = dose({ mgPerKg: 0.1, weightKg: 3, strength: 5 });
  check("ميلوكسيكام قطّة ٣ كغ: يُسحب 0.06 مل", melox.mlRounded === 0.06, String(melox.mlRounded));
  const t1 = plan(melox);
  check("  ونصُّ الخطة «0.06 مل (0.3 mg)» — كان «0 مل (0 mg)»", t1 === "0.06 مل (0.3 mg)", t1);
  check("  ولا «0 مل» بأيّ صيغة", !ZERO_ML.test(t1), t1);
  // 0.6 مل كانت تُكتب «1 مل» — زيادةٌ ٦٧٪ يقرؤها الممرّض.
  const amox = dose({ mgPerKg: 12, weightKg: 5, strength: 100 });
  const t2 = plan(amox);
  check("0.6 مل تُكتب 0.6 لا 1", t2.startsWith("0.6 مل"), t2);
  // طائر: إنروفلوكساسين بروتوكول الطيور 10 ملغ/كغ لطائرٍ ٣٥ غم على ٢٥ ملغ/مل.
  const bird = dose({ mgPerKg: 10, weightKg: 0.035, strength: 25 });
  check("طائر ٣٥ غم: يُسحب 0.014 مل", bird.mlRounded === 0.014, String(bird.mlRounded));
  const t3 = plan(bird);
  check("  ونصُّ الخطة «0.014 مل (0.35 mg)» — كان «0 مل (0 mg)»", t3 === "0.014 مل (0.35 mg)", t3);
  check("  ونصُّ ورقة العلاج «0.014 مل»", task(bird) === "0.014 مل", task(bird));
  // حجمٌ أصغر من أن يُقاس (أقلّ من نصف جزءٍ من ألف): لا «0 مل» — بل الملغ، ويُقال إنه لا يُقاس.
  const tiny = dose({ mgPerKg: 0.01, weightKg: 0.03, strength: 1 });
  check("حجمٌ دون 0.0005 مل: لا حجمَ مكتوب (كان mlRounded = 0 فتكتب الورقة «0 مل»)", tiny.mlRounded === undefined && tiny.tooSmall === "volume", JSON.stringify({ ml: tiny.mlRounded, s: tiny.tooSmall }));
  check("  ونصّا الخطة والورقة بلا «0 مل» وبلا «0 mg»", ![plan(tiny), task(tiny)].some((x) => ZERO_ML.test(x) || /^0 /.test(x)), `${plan(tiny)} | ${task(tiny)}`);
  const alerts = F.checkSafety({ drug: drug("meloxicam"), species: "cat", weightKg: 0.03, mgPerKg: 0.01, dose: tiny });
  check("  ويُنبَّه أنه لا يُقاس", alerts.some((a) => a.id === "too-small" && a.tone === "warn"), alerts.map((a) => a.id).join(","));
});

/* ── ٢) الحبةُ لا تُرفع إلى ربع ──────────────────────────────────────────── */
await section("▸ ٢) الحبة: لا حدَّ أدنى ربع — دون ⅛ يُقال «اختر عياراً أصغر أو سائلاً»", () => {
  const r = F.roundTablets(0.05);
  check("roundTablets(0.05) لا يصير ¼", r.value !== 0.25 && r.tooSmall === true, JSON.stringify(r));
  check("  ويقول «اختر عياراً أصغر أو سائلاً»", r.label === "اختر عياراً أصغر أو سائلاً", r.label);
  check("roundTablets(0.2) = ¼ (أقربُ ربع، لا رفعٌ قسريّ)", F.roundTablets(0.2).value === 0.25);
  check("roundTablets(1.4) = 1 و½", F.roundTablets(1.4).value === 1.5 && F.roundTablets(1.4).label === "1 و½ حبة", F.roundTablets(1.4).label);

  // بريدنيزولون ٢٠ ملغ، قطّة ٢ كغ، 0.5 ملغ/كغ = 1 ملغ = 0.05 حبة.
  const pred = dose({ mgPerKg: 0.5, weightKg: 2, strength: 20, solid: true, ceiling: ceil("prednisolone", "cat") });
  check("بريدنيزولون ٢٠ ملغ لقطّةٍ ٢ كغ: لا ¼ حبة (كانت 2.5 ملغ/كغ)", pred.tablets === undefined && pred.tabletsLabel === undefined && pred.tooSmall === "tablet", JSON.stringify({ t: pred.tablets, l: pred.tabletsLabel }));
  check("  ونصُّ الخطة بالملغ «1 mg» لا «¼ حبة (1 mg)»", plan(pred) === "1 mg", plan(pred));
  const pa = F.checkSafety({ drug: drug("prednisolone"), species: "cat", weightKg: 2, mgPerKg: 0.5, freq: 24, dose: pred });
  check("  ويُنبَّه: «اختر عياراً أصغر أو سائلاً»", pa.some((a) => a.id === "too-small" && /اختر عياراً أصغر أو سائلاً/.test(a.title)), pa.map((a) => a.id).join(","));
  // نفس الجرعة بحبة ٥ ملغ: 0.2 ⇒ ¼ = 0.625 ملغ/كغ — داخل النافذة فتُعطى.
  const pred5 = dose({ mgPerKg: 0.5, weightKg: 2, strength: 5, solid: true, ceiling: ceil("prednisolone", "cat") });
  check("  وبحبة ٥ ملغ: ¼ حبة (1.25 ملغ)", pred5.tablets === 0.25 && pred5.givenMg === 1.25, JSON.stringify({ t: pred5.tablets, g: pred5.givenMg }));

  // فيروكوكسيب ٢٢٧ ملغ، كلب ٣ كغ، 5 ملغ/كغ = 15 ملغ = 0.066 حبة.
  const firo = dose({ mgPerKg: 5, weightKg: 3, strength: 227, solid: true, ceiling: ceil("firocoxib", "dog") });
  check("فيروكوكسيب ٢٢٧ لكلبٍ ٣ كغ: لا ¼ حبة (كانت 18.9 ملغ/كغ والحدّ 5)", firo.tablets === undefined && firo.tooSmall === "tablet", JSON.stringify({ t: firo.tablets }));
  const fa = F.checkSafety({ drug: drug("firocoxib"), species: "dog", weightKg: 3, mgPerKg: 5, freq: 24, dose: firo });
  check("  ويُنبَّه عليه", fa.some((a) => a.id === "too-small"), fa.map((a) => a.id).join(","));

  // كاتبُ البروتوكول (amountFor) يمرّ من نفس الحساب: بريدنيزولون لقطّةٍ نصف كيلو بحبة ٥ ملغ.
  const proto = F.amountFor(drug("prednisolone"), "cat", 0.5);
  check("البروتوكول لقطّةٍ ٠٫٥ كغ: «0.25 ملغم» لا «¼ حبة» (كانت 5 أضعاف)", proto === "0.25 ملغم", proto);
});

/* ── ٣) التقريبُ لا يعبر الخطّ الصلب ─────────────────────────────────────── */
await section("▸ ٣) التقريبُ لا يحمل الجرعةَ فوق السقف الصلب", () => {
  check("roundVolume بلا سقف كما كان: 0.225 ⇒ 0.23", F.roundVolume(0.225) === 0.23, String(F.roundVolume(0.225)));
  check("roundVolume بسقف 0.225 ⇒ 0.22", F.roundVolume(0.225, 0.225) === 0.22, String(F.roundVolume(0.225, 0.225)));
  check("  وما يساوي السقفَ تماماً لا يُنزَل (0.29 يبقى 0.29)", F.roundVolume(0.29, 0.29) === 0.29, String(F.roundVolume(0.29, 0.29)));
  check("سقفُ إنروفلوكساسين بالقطط 5 ملغ/كغ", ceil("enrofloxacin", "cat") === 5, String(ceil("enrofloxacin", "cat")));
  // إنروفلوكساسين ١٠٠ ملغ/مل، قطّة 4.5 كغ، 5 ملغ/كغ = 0.225 مل.
  const enro = dose({ mgPerKg: 5, weightKg: 4.5, strength: 100, ceiling: ceil("enrofloxacin", "cat") });
  check("إنروفلوكساسين قطّة 4.5 كغ: 0.22 مل لا 0.23 (5.11 ملغ/كغ فوق خطّ العمى)", enro.mlRounded === 0.22, String(enro.mlRounded));
  check("  والمُعطى ≤ 5 ملغ/كغ", enro.givenMgPerKg <= 5, String(enro.givenMgPerKg));
  const ea = F.checkSafety({ drug: drug("enrofloxacin"), species: "cat", weightKg: 4.5, mgPerKg: 5, freq: 24, dose: enro });
  check("  ونقصُ ٢٪ من التقريب لا يُسمّى «تحت الجرعة» (دقّةُ السرنجة لا جرعةٌ أخرى)", !ea.some((a) => a.tone === "critical" || a.id === "underdose"), ea.map((a) => a.id).join(","));
  // مسحٌ لا مثال: كلُّ وزنٍ من نصف كيلو إلى عشرة (بخطوة 10 غم) وكلُّ عيارٍ بالدليل، على السقف نفسه.
  const sweep = [];
  for (const [id, sp] of [["enrofloxacin", "cat"], ["meloxicam", "cat"]]) {
    const d = drug(id), w = F.doseFor(d, sp), c0 = ceil(id, sp);
    for (const strength of d.strengths) {
      for (let g = 500; g <= 10000; g += 10) {
        const kg = g / 1000;
        const c = dose({ mgPerKg: w.hardMax, weightKg: kg, strength, ceiling: c0 });
        const a = F.checkSafety({ drug: d, species: sp, weightKg: kg, mgPerKg: w.hardMax, freq: 24, dose: c });
        // المُعطى من الحجم نفسه (لا من حقلٍ يحسبه المحرّك) — فالمسحُ يمسك المحرّكَ القديم أيضاً.
        const given = ((c.mlRounded ?? 0) * strength) / kg;
        if (given > w.hardMax * (1 + 1e-9) || a.some((x) => x.id === "hard-max")) sweep.push(`${id} ${strength} ${kg}kg ⇒ ${c.mlRounded} مل = ${given.toFixed(3)}`);
      }
    }
  }
  check("مسح ٩٥١ وزناً × كلّ عيار (إنروفلوكساسين وميلوكسيكام بالقطط على سقفهما): المُعطى لا يعبر السقف ولا «تجاوزت» واحدة", sweep.length === 0, sweep.slice(0, 4).join(" · "));
  // ومساواةُ الخطّ ليست عبوراً: 0.45 مل × 50 ÷ 4.5 = 5 بالضبط.
  const at = dose({ mgPerKg: 5, weightKg: 4.5, strength: 50, ceiling: ceil("enrofloxacin", "cat") });
  const aa = F.checkSafety({ drug: drug("enrofloxacin"), species: "cat", weightKg: 4.5, mgPerKg: 5, freq: 24, dose: at });
  check("على الخطّ تماماً (0.45 مل من ٥٠) لا يُسمّى تجاوزاً", at.mlRounded === 0.45 && !aa.some((x) => x.tone === "critical"), aa.map((x) => x.id).join(","));
  // السقفُ اليوميّ خطٌّ صلبٌ أيضاً: ميترونيدازول 25 ملغ/كغ كلّ ١٢ ساعة = 50 باليوم بالضبط.
  const metro = dose({ mgPerKg: 25, weightKg: 4, strength: 250, solid: true, freq: 12, ceiling: ceil("metronidazole", "cat", 12) });
  check("ميترونيدازول ٢٥٠ لقطّةٍ ٤ كغ ×٢: ¼ لا ½ (½ = 62.5 ملغ/كغ باليوم، السقف 50)", metro.tablets === 0.25, String(metro.tablets));
});

/* ── ٤) الأمانُ يحكم على المُعطى ─────────────────────────────────────────── */
await section("▸ ٤) فحصُ الأمان يقرأ الجرعةَ المُعطاة لا المقصودة", () => {
  // كاتبٌ نسي السقف: 0.23 مل تصل — فالفحصُ يمسكها بنفسه.
  const raw = dose({ mgPerKg: 5, weightKg: 4.5, strength: 100 });
  check("بلا سقف: 0.23 مل", raw.mlRounded === 0.23, String(raw.mlRounded));
  const a1 = F.checkSafety({ drug: drug("enrofloxacin"), species: "cat", weightKg: 4.5, mgPerKg: 5, freq: 24, dose: raw });
  const hard = a1.find((a) => a.id === "hard-max");
  check("  ⇒ «تجاوزت السقف» حرجٌ مانع (كان «ضمن النطاق»)", !!hard && hard.tone === "critical" && hard.blocking === true, a1.map((a) => `${a.id}:${a.tone}`).join(","));
  check("  والعنوانُ بالمُعطى 5.11", !!hard && /5\.11/.test(hard.title), hard?.title);
  // بريدنيزولون 1.5 ملغ/كغ لقطّةٍ ٢ كغ بحبة ٢٠: 0.15 ⇒ ¼ = 2.5 ملغ/كغ، والنافذة حتى 2.
  const pred = dose({ mgPerKg: 1.5, weightKg: 2, strength: 20, solid: true, ceiling: ceil("prednisolone", "cat") });
  check("بريدنيزولون 1.5 ملغ/كغ: ¼ حبة = 2.5 ملغ/كغ مُعطاة", pred.tablets === 0.25 && pred.givenMgPerKg === 2.5, JSON.stringify({ t: pred.tablets, g: pred.givenMgPerKg }));
  const a2 = F.checkSafety({ drug: drug("prednisolone"), species: "cat", weightKg: 2, mgPerKg: 1.5, freq: 24, dose: pred });
  check("  ⇒ «فوق النطاق المعتاد» (كان «ضمن النطاق» على 1.5 المقصودة)", a2.some((a) => a.id === "overdose") && !a2.some((a) => a.id === "in-range"), a2.map((a) => a.id).join(","));
  check("  والتفصيلُ يقول إن التقريبَ هو السبب", a2.some((a) => a.id === "overdose" && /التقريب/.test(a.detail ?? "")), a2.find((a) => a.id === "overdose")?.detail);
  // السقفُ اليوميّ على المُعطى: ½ حبة ميترونيدازول بلا سقف = 62.5 ملغ/كغ باليوم.
  const metro = dose({ mgPerKg: 25, weightKg: 4, strength: 250, solid: true, freq: 12 });
  const a3 = F.checkSafety({ drug: drug("metronidazole"), species: "cat", weightKg: 4, mgPerKg: 25, freq: 12, dose: metro });
  check("ميترونيدازول ½ حبة ×٢ بلا سقف ⇒ «فوق السقف اليومي» حرج", a3.some((a) => a.id === "daily-max" && a.blocking), a3.map((a) => a.id).join(","));
  // والقطعيّ يبقى كما كان: جرعةٌ مقصودةٌ فوق السقف تُمسك وإن لم يُمرَّر حساب.
  const a4 = F.checkSafety({ drug: drug("enrofloxacin"), species: "cat", weightKg: 4.5, mgPerKg: 6, freq: 24 });
  check("بلا حساب: المقصودُ 6 فوق 5 يبقى حرجاً", a4.some((a) => a.id === "hard-max"), a4.map((a) => a.id).join(","));
});

/* ── ٥) الكُتّاب يمرّون من الحساب الواحد ─────────────────────────────────── */
await section("▸ ٥) الكُتّاب: نصُّ الخطة وورقةُ العلاج والبروتوكول من مصدرٍ واحد", () => {
  const half = dose({ mgPerKg: 15, weightKg: 8, strength: 250, solid: true, freq: 12 });
  check("ورقةُ العلاج: «½ حبة» لا «½ حبة قرص»", task(half) === "½ حبة", task(half));

  const tp = src("src/components/TreatmentPlan.tsx");
  const doseText = innerBody(tp, "doseText");
  check("TreatmentPlan: doseText موجودة", doseText.length > 0);
  check("  وتكتب عبر planAmountText", /planAmountText\(/.test(doseText), doseText.slice(0, 160).replace(/\s+/g, " "));
  check("  ولا formatNum على حجمٍ أو ملغ", !/formatNum\(/.test(doseText), doseText.slice(0, 160).replace(/\s+/g, " "));

  const fl = src("src/components/Flowsheet.tsx");
  check("Flowsheet: لا «قرص» بعد tabletsLabel", !/tabletsLabel\}?\s*قرص/.test(fl) && !/tabletsLabel[^\n]{0,40}قرص/.test(fl));
  check("  والكمية عبر taskAmountText", /setAmount\(\s*taskAmountText\(/.test(fl));
  check("  والمعاينةُ لا تلبس «{{n}} قرص» (flow.doseTabs)", !/flow\.doseTabs/.test(fl));
  for (const lang of ["ar", "en"]) {
    const j = JSON.parse(readFileSync(`src/i18n/${lang}.json`, "utf8"));
    check(`  و${lang}.json بلا flow.doseTabs`, j.flow?.doseTabs === undefined, j.flow?.doseTabs);
  }
  const pr = src("src/lib/protocols.ts");
  check("protocols: لا Math.round على ملغ البروتوكول (1.5 ملغ كانت تُكتب 2)", !/Math\.round\(c\.mg\)/.test(pr));
});

/* ── ٦) كلُّ نداءٍ يمرّر ما يجعل الحكمَ صادقاً ─────────────────────────────── */
await section("▸ ٦) كلُّ calcDose يمرّر السقف، وكلُّ checkSafety بجرعةٍ يمرّر حسابَها", () => {
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && !/vetFormulary\.ts$/.test(p)) files.push(p.replace(/\\/g, "/"));
    }
  })("src");
  /** وسائطُ النداء حتى قوسه المقابل. */
  const callArgs = (s, at) => {
    let depth = 0;
    for (let j = at; j < s.length; j++) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")" && --depth === 0) return s.slice(at, j + 1);
    }
    return s.slice(at);
  };
  const noCeiling = [], noDose = [];
  let nCalc = 0, nSafety = 0;
  for (const f of files) {
    const s = src(f);
    for (const m of s.matchAll(/\bcalcDose\(/g)) {
      nCalc++;
      // `ceiling: x` أو المختصر `ceiling,` / `ceiling }` — لا `row.ceiling` ولا اسمٌ ينتهي به.
      if (!/(?<![.\w])ceiling\s*[:,}]/.test(callArgs(s, m.index + m[0].length - 1))) noCeiling.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
    }
    for (const m of s.matchAll(/\bcheckSafety\(/g)) {
      const args = callArgs(s, m.index + m[0].length - 1);
      if (/mgPerKg:\s*0\b/.test(args)) continue; // فحصُ منعٍ وحساسيةٍ قبل الجرعة — لا جرعةَ يُحكم عليها
      nSafety++;
      if (!/(?<![.\w])dose\s*[:,}]/.test(args)) noDose.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
    }
  }
  check(`كلُّ calcDose (${nCalc}) يمرّر ceiling — بلاه يعبر التقريبُ السقف`, nCalc > 0 && noCeiling.length === 0, noCeiling.join(" · "));
  check(`كلُّ checkSafety بجرعة (${nSafety}) يمرّر dose — بلاه يُحكم على المقصود`, nSafety > 0 && noDose.length === 0, noDose.join(" · "));
  // judgedMgPerKg يأخذ الحسابَ كلَّه: givenMgPerKg وحده يُسقط `held` فتعود البلاطةُ تصرخ «تحت الجرعة».
  const bare = [];
  let nJudged = 0;
  for (const f of files) {
    const s = src(f);
    for (const m of s.matchAll(/\bjudgedMgPerKg\(/g)) {
      nJudged++;
      if (/givenMgPerKg/.test(callArgs(s, m.index + m[0].length - 1))) bare.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
    }
  }
  check(`كلُّ judgedMgPerKg (${nJudged}) يأخذ الحسابَ كلَّه لا givenMgPerKg وحده`, nJudged > 0 && bare.length === 0, bare.join(" · "));
});

/* ── ٧) ما يمسكه الحدُّ يُقال باسمه ───────────────────────────────────────────
 * السقفُ يُنزل التقريبَ علامةً — وهذا مقصود — لكنّ ما بعده قرأه كأنه تقريبٌ حرّ:
 *  أ) الحبةُ التي يمنع الحدُّ ربعَها تصير «صفراً» فيقول التنبيه «أقل من ⅛ الحبة» وهي
 *     0.126، و«ربعُها أضعافُ الجرعة» وهو 1.98 ضعفاً. السببُ الحقيقيّ — السقفُ اليوميّ —
 *     مخفيّ، ومعه البديلُ الذي يعرفه الطبيب: وسّع الفاصل.
 *  ب) النزولُ تحت الحدّ يحرّك الجرعةَ **علامةً كاملة** لا نصفَها (0.10 عن 0.1075 = 7٪)،
 *     وتسامحُ التقريب ٥٪ مبنيٌّ على نصف علامة — فإنروفلوكساسين القطّة بجرعتها المعتادة
 *     صار «تحت الجرعة» بثلاثٍ وسبعين وزناً، وزرُّ + الوحيد يعبر الحدّ. */
await section("▸ ٧) ما يمسكه الحدُّ يُقال باسمه — لا «أقل من ⅛» ولا «تحت الجرعة»", () => {
  const metro = drug("metronidazole");
  // ميترونيدازول ٢٥٠ لقطّةٍ 2.1 كغ بـ15 ملغ/كغ ×٢ (بروتوكول التهاب المعدة): 0.126 حبة — فوق الثُّمن.
  const m1 = dose({ mgPerKg: 15, weightKg: 2.1, strength: 250, solid: true, freq: 12, ceiling: ceil("metronidazole", "cat", 12) });
  check("ميترونيدازول ٢٥٠ لقطّةٍ 2.1 كغ ×٢: لا حبة — ربعُها يعبر السقف اليومي", m1.tooSmall === "tablet" && m1.tablets === undefined, JSON.stringify({ t: m1.tablets, s: m1.tooSmall }));
  const a1 = F.checkSafety({ drug: metro, species: "cat", weightKg: 2.1, mgPerKg: 15, freq: 12, dose: m1 });
  const t1 = a1.find((a) => a.id === "too-small");
  check("  والتنبيهُ لا يقول «أقل من ⅛ الحبة» (هي 0.126)", !!t1 && !/⅛/.test(t1.title), t1?.title);
  check("  بل يسمّي السقفَ اليوميّ (50)", !!t1 && /اليومي/.test(t1.title) && /\b50\b/.test(t1.title), t1?.title);
  check("  وبأرقامه: الربعُ 29.8 ملغ/كغ للجرعة و59.5 باليوم", /29\.8/.test(t1?.detail ?? "") && /59\.5/.test(t1?.detail ?? ""), t1?.detail);
  check("  ولا «أضعافُ الجرعة» (الربعُ 1.98 ضعفاً)", !/أضعاف/.test(t1?.detail ?? ""), t1?.detail);
  check("  ويذكر البديلَ: وسّع الفاصل بين الجرعات", /وسّع الفاصل/.test(t1?.detail ?? ""), t1?.detail);
  // ٥٠٠ لقطّةٍ 4.5 كغ بـ15 ×٢: 0.135 حبة؛ ربعُها 27.8 ×٢ = 55.6 فوق 50.
  const m2 = dose({ mgPerKg: 15, weightKg: 4.5, strength: 500, solid: true, freq: 12, ceiling: ceil("metronidazole", "cat", 12) });
  const t2 = F.checkSafety({ drug: metro, species: "cat", weightKg: 4.5, mgPerKg: 15, freq: 12, dose: m2 }).find((a) => a.id === "too-small");
  check("ميترونيدازول ٥٠٠ لقطّةٍ 4.5 كغ ×٢ (0.135 حبة): السقفُ اليوميّ لا «⅛»، والربعُ 27.8 و55.6", !!t2 && !/⅛/.test(t2.title) && /اليومي/.test(t2.title) && /27\.8/.test(t2.detail ?? "") && /55\.6/.test(t2.detail ?? ""), `${t2?.title} | ${t2?.detail}`);
  // كلب 3.5 كغ بـ10 ×٣: السقفُ للجرعة 16.7؛ ربعُ ٢٥٠ = 17.9 ×٣ = 53.6.
  const m3 = dose({ mgPerKg: 10, weightKg: 3.5, strength: 250, solid: true, freq: 8, ceiling: ceil("metronidazole", "dog", 8) });
  const t3 = F.checkSafety({ drug: metro, species: "dog", weightKg: 3.5, mgPerKg: 10, freq: 8, dose: m3 }).find((a) => a.id === "too-small");
  check("ميترونيدازول ٢٥٠ لكلبٍ 3.5 كغ ×٣ (0.14 حبة): السقفُ اليوميّ، والربعُ 17.9 و53.6", !!t3 && !/⅛/.test(t3.title) && /اليومي/.test(t3.title) && /17\.9/.test(t3.detail ?? "") && /53\.6/.test(t3.detail ?? ""), `${t3?.title} | ${t3?.detail}`);
  // الثُّمنُ يبقى ثُمناً: بريدنيزولون ٢٠ لقطّةٍ ٢ كغ بـ0.5 = 0.05 حبة، ولا حدَّ هنا.
  const p = dose({ mgPerKg: 0.5, weightKg: 2, strength: 20, solid: true, ceiling: ceil("prednisolone", "cat") });
  const tp = F.checkSafety({ drug: drug("prednisolone"), species: "cat", weightKg: 2, mgPerKg: 0.5, freq: 24, dose: p }).find((a) => a.id === "too-small");
  check("ودون الثُّمن حقاً (بريدنيزولون 0.05 حبة) يبقى «أقل من ⅛ الحبة»", !!tp && /⅛/.test(tp.title) && !p.held, `${tp?.title} · held=${p.held}`);
  // وسقفُ النوع للجرعة الواحدة (لا دواءَ صلباً بالدليل يحمله اليوم — فدواءٌ مفترض): ربعُ ٢٠ لقطّةٍ ٢ كغ = 2.5 فوق 2.
  const capped = { ...drug("prednisolone"), doses: [{ species: ["cat"], min: 0.5, max: 2, typical: 1, freq: 24, routes: ["PO"], hardMax: 2, hardMaxReason: "سببُ الحدّ." }] };
  const ch = F.doseCeiling(capped, capped.doses[0], 24);
  const h = dose({ mgPerKg: 1.5, weightKg: 2, strength: 20, solid: true, ceiling: ch });
  const th = F.checkSafety({ drug: capped, species: "cat", weightKg: 2, mgPerKg: 1.5, freq: 24, dose: h }).find((a) => a.id === "too-small");
  check("وسقفُ النوع يُسمّى سقفاً (0.15 حبة، ربعُها 2.5 والحدّ 2) ومعه سببُه", h.tooSmall === "tablet" && !!th && !/⅛/.test(th.title) && /\b2\b/.test(th.title) && /2\.5/.test(th.detail ?? "") && /سببُ الحدّ/.test(th.detail ?? ""), `${th?.title} | ${th?.detail}`);

  // مسحٌ لا أمثلة: كلُّ دواءٍ صلبٍ له حدّ × نوع × عيار × (أدنى/معتاد/أعلى) × تكرار × وزن 0.5–80 كغ.
  // «⅛» بالعنوان إن وفقط إن كانت الجرعةُ دون ثُمن الحبة.
  let held = 0;
  const lies = [];
  for (const d of F.FORMULARY.filter((x) => x.solid)) {
    for (const sp of ["dog", "cat"]) {
      const win = F.doseFor(d, sp);
      if (!win) continue;
      for (const freq of [8, 12, 24]) {
        const c0 = F.doseCeiling(d, win, freq);
        if (c0 === undefined) continue;
        for (const strength of d.strengths) {
          for (const rate of new Set([win.min, win.typical ?? win.min, win.max])) {
            for (let g = 500; g <= 80000; g += 10) {
              const kg = g / 1000;
              const c = dose({ mgPerKg: rate, weightKg: kg, strength, solid: true, freq, ceiling: c0 });
              if (c.tooSmall !== "tablet") continue;
              const count = (rate * kg) / strength;
              const ts = F.checkSafety({ drug: d, species: sp, weightKg: kg, mgPerKg: rate, freq, dose: c }).find((a) => a.id === "too-small");
              if (count >= 0.125) held++;
              if (!ts || /⅛/.test(ts.title) !== count < 0.125) lies.push(`${d.id} ${sp} ${strength} ${rate}×q${freq} ${kg}kg ⇒ ${count.toFixed(3)} حبة: ${ts?.title ?? "∅"}`);
            }
          }
        }
      }
    }
  }
  check(`مسحُ الأدوية الصلبة ذات الحدّ: ${held} حالةً يمنع الحدُّ ربعَها — ولا «⅛» إلا دون الثُّمن`, held > 0 && lies.length === 0, `${lies.length}: ${lies.slice(0, 3).join(" · ")}`);

  // ب) إنروفلوكساسين ١٠٠ لقطّةٍ 2.15 كغ بجرعتها المعتادة 5: 0.1075 مل؛ أقربُ علامةٍ 0.11 = 5.12 فوق الحدّ.
  const enro = drug("enrofloxacin");
  const e = dose({ mgPerKg: 5, weightKg: 2.15, strength: 100, ceiling: ceil("enrofloxacin", "cat") });
  check("إنروفلوكساسين قطّة 2.15 كغ: 0.10 مل (0.11 تعبر الحدّ)", e.mlRounded === 0.1, String(e.mlRounded));
  check("  والحسابُ يقول إن الحدَّ أنزلها (held)", e.held === true, String(e.held));
  const ea = F.checkSafety({ drug: enro, species: "cat", weightKg: 2.15, mgPerKg: 5, freq: 24, dose: e });
  check("  ونزولُ علامةٍ تحت الحدّ (7٪) لا يُسمّى «تحت الجرعة»", !ea.some((a) => a.id === "underdose") && ea.some((a) => a.id === "in-range"), ea.map((a) => a.id).join(","));
  check("  والبلاطةُ تُحكم بما يحكم به الفحص (judgedMgPerKg = 5)", F.judgedMgPerKg(5, e) === 5, String(F.judgedMgPerKg(5, e)));
  const sweep = { 25: [], 50: [], 100: [] };
  for (const strength of enro.strengths) {
    for (let g = 300; g <= 8000; g += 10) {
      const kg = g / 1000;
      const c = dose({ mgPerKg: 5, weightKg: kg, strength, ceiling: ceil("enrofloxacin", "cat") });
      const a = F.checkSafety({ drug: enro, species: "cat", weightKg: kg, mgPerKg: 5, freq: 24, dose: c });
      const bad = a.some((x) => x.id === "underdose" || x.id === "hard-max") || c.givenMgPerKg > 5 * (1 + 1e-9) || F.outsideWindow(F.judgedMgPerKg(5, c), F.doseFor(enro, "cat"));
      if (bad) sweep[strength].push(`${kg}kg ⇒ ${c.mlRounded} مل = ${c.givenMgPerKg.toFixed(2)}`);
    }
  }
  const nBad = Object.values(sweep).reduce((n, l) => n + l.length, 0);
  check("مسحُ القطط 0.3–8 كغ × ٢٥/٥٠/١٠٠ بالجرعة المعتادة: لا «تحت الجرعة»، ولا عبورَ للحدّ، والبلاطةُ داخل الدليل", nBad === 0,
    Object.entries(sweep).filter(([, l]) => l.length).map(([s, l]) => `${s}: ${l.length} (${l.slice(0, 2).join("، ")})`).join(" · "));
  // والتسامحُ علامةٌ واحدة لا أكثر: ما حرّكه التقريبُ الحرّ ٨٪ جرعةٌ أخرى، وما أنزله الحدُّ ١٢٪ كذلك.
  check("تقريبٌ حرّ حرّك 8٪: يُحكم على المُعطى", F.judgedMgPerKg(5, { givenMgPerKg: 4.6 }) === 4.6, String(F.judgedMgPerKg(5, { givenMgPerKg: 4.6 })));
  check("نزولٌ تحت الحدّ حرّك 12٪ (أكثرُ من علامة): يُحكم على المُعطى", F.judgedMgPerKg(5, { givenMgPerKg: 4.4, held: true }) === 4.4, String(F.judgedMgPerKg(5, { givenMgPerKg: 4.4, held: true })));
});

console.log(`\n${fails ? "✗" : "✓"} dose-safety: ${passes} نجح، ${fails} فشل`);
if (fails) process.exit(1);
