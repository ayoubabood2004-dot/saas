/* ============================================================================
 * مطابقةُ اسم الدواء بالدليل — المركّبُ ليس أوّلَ مادةٍ فيه، والذيلُ ليس الدواء.
 *
 * ── الجذرُ المقيس (١٤/١٠، كلُّ اسمٍ بالإنتاج: clinic_drugs وtreatment_entries ومنتجاتُ الأدوية) ──
 * `matchMonograph` كانت تطابق بثلاث مراحل، والثالثةُ — «المكتوبُ بدايةُ اسمٍ أطول» بتعليقها —
 * كانت `key.includes(n)`: احتواءٌ لا بداية. فـ«Ronidazole» صارت ميترونيدازول (ذيلُ اسمه)،
 * و«CA» و«Calcium» صارتا غلوكونات الكالسيوم ١٠٪ الوريدية (وما يُعطى بالإنتاج باسم «CA» قطرةٌ
 * بـ١٠٠ مل ماء)، و«Medetomidine» ديكسميديتوميدين. والمرحلةُ الثانية (الاسمُ يحتوي جذعاً) أخذت
 * من كلّ مركّبٍ أوّلَ مادةٍ تعرفها: «… + Prednisolone + … (Bio-Sone)» و«(Vimespiro)» ⇒ بريدنيزولون،
 * «Florfenicol + Doxycycline» و«Tylosin + Doxycycline» و«doxycycline and flor» ⇒ دوكسيسيكلين،
 * «Ciprofloxacin + Flagyle» ⇒ ميترونيدازول، «Amoxicillin + Gentamicin» ⇒ أموكسيسيلين. فالبلاطةُ
 * عنوانُها اسمُ المادة، وformularySeed يبذر جرعتَها وعيارَ حبّتها لحظةَ الإضافة، والنافذةُ تحكم بها.
 * من ٤١٨ اسماً مميَّزاً بالإنتاج (و٧٨ بالكتالوج وحده) تغيّرت عشرةٌ (وMedetomidine بالكتالوج)، كلُّها
 * مطابقةٌ خاطئة أُزيلت؛ ولا مطابقةٌ صحيحة ضاعت.
 *
 * والأمانُ لا يضعف بالمركّب: منعُ النوع والحساسيةُ والتكرارُ والتعارضُ تُقرأ من كلّ مادةٍ يعرفها
 * الدليل فيه (ingredientMonographs) — «Paracetamol + Vitamin C» لقطّةٍ ممنوعة (وكانت تمرّ
 * بلا منع: لا جذعَ «paracetamol» وحده بالفهرس). والجرعةُ وحدها بلا دليلٍ للمركّب.
 *
 * ── الجولةُ الثانية (١٥/١٠، §٩–§١٥) ──
 * عدُّ الأجزاء لا يكفي: «Amoxicillin-Clavulanate + Paracetamol» جزآن كاسم المركّب العربي فصار
 * المركّبَ وضاع منعُ الباراسيتامول؛ فالآن كلُّ جزءٍ يُطابَق وحده، والاسمُ مونوغرافٌ واحد فقط إن
 * سمّته كلُّ أجزائه. ونصفا المركّب («Trimethoprim» و«Sulfadiazine») يُعرفان فتمسك حساسيةُ السلفا؛
 * والهمزةُ تُطوى على الطرفين («ايبوبروفين» لقطّة بالإنتاج بلا منع)؛ و«Pyrantel» دواؤه؛ و«/» و«,»
 * و«with» و«و» تعدّد كـ«+»؛ وقطرةُ الجنتاميسين ليست حقنتَه؛ والمادّةُ من صفّين تنبيهٌ واحد.
 *
 * ── الجولةُ الثالثة (١٥/١٠، §١٦–§٢١) ──
 * الفاصلُ العربيّ توأمُ اللاتينيّ («مع»، «،»، «؛»، « و »)، ودواءان بجزءٍ واحد خليطٌ مهما كان
 * الفاصل؛ والشكلُ والعبوةُ بعد الفاصل ليسا مادّة («Enrofloxacin, injectable» تبقى بسقفها)؛ والعينُ
 * والأذنُ وحدهما مكانُ مرضٍ لا شكلٌ موضعيّ، و«pour-on» تُمتصّ للدم؛ والحساسيةُ تُقرأ كلماتٍ
 * («فيتامين كومبلكس» ليست «فيتامين ك»)؛ وموادُّ الخليط الواحد تتعارض فيما بينها؛ والاسمُ يُقرأ مرّة.
 *
 *   node scripts/med-match-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
/* المرجعُ الأصليّ: §١٥ يلتقط console.error أثناء الرسم (تحذيرُ المفتاح المكرّر)، والفشلُ لا يُلتقط معه. */
const sayFail = console.error.bind(console);
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; sayFail(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
/** قسمٌ يُفحص كلُّه: دالّةٌ غائبة فشلٌ يُقال بسببه، لا انهيارٌ يُخفي الأقسامَ بعده. */
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };

/* الترجمةُ بديلٌ يستبدل {{d}} — عنوانُ المنع بالجولة يسمّي المادة، وهو ما يُفحص. */
const STUBS = {
  "@/i18n": "const fill = (s, o) => String(s).replace(/\\{\\{(\\w+)\\}\\}/g, (_, v) => (o && o[v] !== undefined ? String(o[v]) : '')); export default { t: (k, o) => fill((o && o.defaultValue) || k, o), language: 'ar' };",
  "./settings": "export const getCareProtocolsRaw = () => null; export const setCareProtocolsRaw = () => {}; export const getWorkHours = () => ({ am: null, pm: null }); export const getDoseWindow = () => ({ mode: 'auto' });",
};
const load = async (contents, extra = {}) => {
  const stubs = { ...STUBS, ...extra };
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' },
    banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        const names = Object.keys(stubs).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
        b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "med-match-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};
const F = await load([
  `export * from "./src/lib/vetFormulary.ts";`,
  `export * as I from "./src/lib/medIndex.ts";`,
  `export { MED_CATALOG } from "./src/lib/medCatalog.ts";`,
  `export { buildDraft, draftAlerts, inflate } from "./src/lib/protocols.ts";`,
].join("\n"));
const { I } = F;
/* الجولةُ بحزمتها: ترتيبُ الأقفاص يجرّ مخزنَ الاستوديو ثلاثيّ الأبعاد، ولا شأنَ له بالتنبيه. */
const R = await load(`export { alertsFor } from "./src/lib/round.ts";`, { "./cageOrder": "export const cageSortKey = () => 0;" });

/** نصُّ المصدر بلا تعليقات — شرحٌ يذكر الدالّة ليس استعمالاً. */
const src = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));

/* الغائبُ يُقال بنصّه لا بانهيار. */
const one = (n) => F.matchMonograph(n)?.id ?? null;
const ings = (n) => (F.ingredientMonographs ? F.ingredientMonographs(n).map((d) => d.id).sort().join(",") : "∅ لا ingredientMonographs");
const ban = (n, sp) => (F.bannedIngredient ? F.bannedIngredient(n, sp) : undefined);

/* أسماءُ الإنتاج كما كُتبت حرفياً (clinic_drugs، ١٤/١٠). */
const BIO_SONE = "Oxytetracycline + Thiamphenicol + Prednisolone + Lidocaine + Bromhexine (Bio-Sone)";
const VIMESPIRO = "Florfenicol + Spiramycin + Prednisolone + Lidocaine (Vimespiro)";
const MIXES = {
  [BIO_SONE]: "prednisolone",
  [VIMESPIRO]: "prednisolone",
  "Florfenicol + Doxycycline": "doxycycline",
  "Tylosin + Doxycycline": "doxycycline",
  "doxycycline and flor": "doxycycline",
  "Ciprofloxacin + Flagyle": "metronidazole",
  "Amoxicillin + Gentamicin": "amoxicillin,gentamicin",
  "دوكسي +فلورفنيكول": "doxycycline",
};

/* ── ١) الذيلُ ليس الدواء، والقصيرُ لا يُخمَّن ─────────────────────────────── */
await section("▸ ١) الإكمالُ بدايةٌ حقيقية لاسمٍ من كلمة، بأربعة أحرفٍ فأكثر، ولدواءٍ واحد", () => {
  check("«Ronidazole» ⇒ لا شيء (كانت ميترونيدازول: ذيلُ اسمه)", one("Ronidazole") === null, String(one("Ronidazole")));
  check("«Medetomidine» ⇒ لا شيء (كانت ديكسميديتوميدين — دواءٌ آخر بنصف جرعته)", one("Medetomidine") === null, String(one("Medetomidine")));
  check("«CA» ⇒ لا شيء (كانت غلوكونات الكالسيوم ١٠٪)", one("CA") === null, String(one("CA")));
  check("«Calcium» ⇒ لا شيء — مكمّلُ الدواجن الفمويّ ليس الغلوكونات الوريدية", one("Calcium") === null, String(one("Calcium")));
  check("  ولا «Calc» ولا «Vitamin» (كانت فيتامين ك١)", one("Calc") === null && one("Vitamin") === null, `${one("Calc")} ${one("Vitamin")}`);
  check("«Calcium Gluconate» ⇒ غلوكونات الكالسيوم (حرفياً)", one("Calcium Gluconate") === "calcium-gluconate", String(one("Calcium Gluconate")));
  check("«pred» ⇒ لا شيء: بريدنيزولون أم بريدنيزون؟ (كانت ميثيل بريدنيزولون)", one("pred") === null, String(one("pred")));
  check("«ace» و«fur» (ثلاثة أحرف) ⇒ لا شيء (كانت «ace» باراسيتامول)", one("ace") === null && one("fur") === null, `${one("ace")} ${one("fur")}`);
  // ما كان صحيحاً يبقى — أسماءُ الإنتاج التي مرّت من الإكمال.
  check("«Itraconazol» (٦٠ سطراً بالإنتاج) ⇒ إيتراكونازول", one("Itraconazol") === "itraconazole");
  check("«parac» ⇒ باراسيتامول (فمنعُه للقطّ يبقى)", one("parac") === "paracetamol" && !!ban("parac", "cat"));
  check("«Paracetamol (dogs only)» ⇒ باراسيتامول — حرفياً الآن (المترادفان جذعان)", one("Paracetamol (dogs only)") === "paracetamol");
  check("«doxy» و«enro» و«dexa» ⇒ دواؤها", one("doxy") === "doxycycline" && one("enro") === "enrofloxacin" && one("dexa") === "dexamethasone");
  check("«Amox» ⇒ أموكسيسيلين لا المركّب (كانت أموكسيسيلين + كلافولانيك)", one("Amox") === "amoxicillin", String(one("Amox")));
});

/* ── ٢) المركّبُ ليس أوّلَ مادةٍ فيه ──────────────────────────────────────── */
await section("▸ ٢) اسمٌ يعدّد مادّتين فأكثر لا يصير مادةً واحدة", () => {
  for (const name of Object.keys(MIXES)) check(`«${name}» ⇒ لا مونوغرافَ واحد`, one(name) === null, String(one(name)));
  check("الفواصل: «+» بفراغٍ وبلاه، و«&»، وكلمة «and» — لا «-»",
    F.ingredientParts?.("a + b").length === 2 && F.ingredientParts?.("Derma paste+zinc").length === 2 && F.ingredientParts?.("Vitamins Mineral & Probiotic").length === 2
    && F.ingredientParts?.("vitamin c and b2").length === 2 && F.ingredientParts?.("Amoxicillin-Clavulanate").length === 1
    && F.ingredientParts?.(BIO_SONE).length === 5,
    F.ingredientParts ? JSON.stringify(F.ingredientParts(BIO_SONE)) : "∅ لا ingredientParts");
  // «/» فاصلٌ (§١١)، والمترادفان بها مونوغرافٌ واحد لأنّ جزأيه يسمّيانه كليهما.
  check("حارس: «Paracetamol / Acetaminophen» ⇒ باراسيتامول (مترادفان: كلُّ جزءٍ يسمّيه)", one("Paracetamol / Acetaminophen") === "paracetamol");
  // ما يبقى: الاسمُ الحرفيّ لمونوغرافٍ مركّب، والوثيقُ «Amoxicillin 250mg».
  check("«Amoxicillin 250mg» ⇒ أموكسيسيلين (لا المركّب — نافذتُه الأعرض تبلع الجرعةَ الزائدة)", one("Amoxicillin 250mg") === "amoxicillin");
  check("«Amoxicillin-Clavulanate» ⇒ أموكسيسيلين + كلافولانيك", one("Amoxicillin-Clavulanate") === "amoxi-clav");
  check("«أموكسيسيلين + كلافولانيك» و«…-…» (١٦ و٢٠ سطراً بالإنتاج) ⇒ المركّب نفسُه — حرفياً قبل فحص الفواصل", one("أموكسيسيلين + كلافولانيك") === "amoxi-clav" && one("أموكسيسيلين-كلافولانيك") === "amoxi-clav");
  check("«Trimethoprim-Sulfadiazine» و«Trimethoprim + Sulfadiazine» ⇒ ترايميثوبريم + سلفا (مركّبٌ بعدد موادّه)", one("Trimethoprim-Sulfadiazine") === "tmps" && one("Trimethoprim + Sulfadiazine") === "tmps");
  check("  و«Amoxicillin + Clavulanate + Gentamicin» ليس أموكسيسيلين + كلافولانيك (مادةٌ ثالثة)", one("Amoxicillin + Clavulanate + Gentamicin") === null);
  check("«Synulox (amoxicillin + clavulanate)» ⇒ المركّب (القوسان اسمٌ لا قائمة)", one("Synulox (amoxicillin + clavulanate)") === "amoxi-clav");
  check("  و«Synulox + Gentamicin» ليس المركّب وحده (اسمٌ تجاريّ بكلمةٍ واحدة لا يغطّي مادّتين)، وموادُّه الاثنان",
    one("Synulox + Gentamicin") === null && ings("Synulox + Gentamicin") === "amoxi-clav,gentamicin", `${one("Synulox + Gentamicin")} | ${ings("Synulox + Gentamicin")}`);
});

/* ── ٣) موادُّ المركّب ─────────────────────────────────────────────────────── */
await section("▸ ٣) ingredientMonographs: كلُّ مادةٍ يعرفها الدليل، ومفردُ الدواء نفسُه", () => {
  for (const [name, want] of Object.entries(MIXES)) check(`«${name}» ⇒ ${want}`, ings(name) === want, ings(name));
  check("مفردٌ ⇒ نفسُه، ومجهولٌ ⇒ لا شيء", ings("Meloxicam") === "meloxicam" && ings("Ronidazole") === "" && ings("Vitamin C + B2") === "", `${ings("Meloxicam")}|${ings("Ronidazole")}|${ings("Vitamin C + B2")}`);
});

/* ── ٤) الأمانُ لا يضعف ─────────────────────────────────────────────────── */
await section("▸ ٤) المنعُ والحساسيةُ والتعارضُ تُقرأ من كلّ مادة", () => {
  const PC = "Paracetamol + Vitamin C";
  check(`«${PC}» لقطّة ⇒ ممنوع، والسببُ يسمّي الباراسيتامول (كانت تمرّ بلا منع)`, /باراسيتامول/.test(ban(PC, "cat") ?? ""), String(ban(PC, "cat")));
  check("  ولكلبٍ لا منع", ban(PC, "dog") === undefined);
  check("«Aspirin + Vitamin C» لقطّة ⇒ ممنوعٌ (كانت ممنوعةً بالأسبرين — لا تراجع)", !!ban("Aspirin + Vitamin C", "cat"));
  const safety = (name, o = {}) => (F.checkIngredientSafety ? F.checkIngredientSafety({ ingredients: F.ingredientMonographs(name), species: "cat", ...o }) : []);
  const pc = safety(PC);
  check("checkIngredientSafety: المنعُ حرجٌ ويوقف (blocking)", pc.some((a) => a.id === "paracetamol:banned" && a.tone === "critical" && a.blocking), pc.map((a) => a.id).join(","));
  const vim = safety(VIMESPIRO, { species: "dog", concurrent: ["meloxicam"] });
  check("«Vimespiro» مع ميلوكسيكام بالخطة ⇒ تعارض كورتيزون + NSAID حرج", vim.some((a) => a.id === "prednisolone:pair-meloxicam" && a.tone === "critical"), vim.map((a) => a.id).join(","));
  check("  ولا حكمَ جرعةٍ على الخليط (لا نافذة ولا «ما عندنا جرعة»)", !vim.some((a) => /in-range|overdose|underdose|no-window|hard-max|daily-max|route/.test(a.id)), vim.map((a) => a.id).join(","));
  const melox = F.checkSafety({ drug: F.DRUG_BY_ID.get("meloxicam"), species: "dog", mgPerKg: 0, dose: undefined, concurrent: F.ingredientMonographs(VIMESPIRO).map((d) => d.id) });
  check("  ومن جهة ميلوكسيكام: موادُّ الصفّ الآخر معرّفاتُه (كان matchMonograph(اسم الخليط) = بريدنيزولون)", melox.some((a) => a.id === "pair-prednisolone"), melox.map((a) => a.id).join(","));
  const alg = safety("Amoxicillin + Gentamicin", { species: "dog", allergies: ["Penicillin"] });
  check("حساسيةُ البنسلين تمسك الأموكسيسيلين داخل «Amoxicillin + Gentamicin»", alg.some((a) => a.id === "amoxicillin:allergy-penicillin" && a.blocking), alg.map((a) => a.id).join(","));
  const dup = safety("Florfenicol + Doxycycline", { species: "dog", concurrent: ["doxycycline"] });
  check("دوكسيسيكلين بصفٍّ والمركّبُ بآخر ⇒ تكرارُ نفس الدواء", dup.some((a) => a.id === "doxycycline:dup-same"), dup.map((a) => a.id).join(","));
});

/* ── ٥) البلاطةُ والجولةُ والبروتوكول ────────────────────────────────────── */
await section("▸ ٥) المنتقي والجولة والبروتوكول: العنوانُ اسمُ المركّب، والمنعُ من موادّه", () => {
  const NOW = "2026-10-14T00:00:00.000Z";
  const row = (id, name) => ({ id, name, family: "other", in_mine: true, pos: 1, archived_at: null, created_at: NOW, updated_at: NOW });
  const ix = I.buildMedIndex({ catalog: F.MED_CATALOG, rows: [row("d1", BIO_SONE), row("d2", "Paracetamol + Vitamin C"), row("d3", "Ronidazole")], species: "cat", stockMode: "hide" });
  const bio = ix.all.find((x) => x.name === BIO_SONE);
  check("بلاطةُ Bio-Sone عنوانُها اسمُها (كان «بريدنيزولون»)، بلا دليلٍ ولا جرعة", bio?.label === BIO_SONE && !bio.monographId && !bio.dosed, JSON.stringify({ label: bio?.label, mono: bio?.monographId }));
  const ron = ix.all.find((x) => x.name === "Ronidazole");
  check("بلاطةُ Ronidazole عنوانُها اسمُها (كان «ميترونيدازول»)", ron?.label === "Ronidazole" && !ron.monographId, String(ron?.label));
  const pc = ix.all.find((x) => x.name === "Paracetamol + Vitamin C");
  check("بلاطةُ «Paracetamol + Vitamin C» لقطّة بشارة «ممنوع»", typeof pc?.banned === "string" && /باراسيتامول/.test(pc.banned), String(pc?.banned));
  check("  والبحثُ بالعربي باسم مادةٍ فيه يجدها («بريدنيزولون» ⇒ Bio-Sone)", ix.search("بريدنيزولون").some((x) => x.name === BIO_SONE));
  check("الدليلُ كلُّه فوق الكتالوج كما كان (١٢٣ + ٣) — Medetomidine لم تكن الطريقَ الوحيد لديكسميديتوميدين",
    I.buildMedIndex({ catalog: F.MED_CATALOG, rows: [], species: "cat", formulary: "all", stockMode: "hide" }).all.length === 126);

  const pet = { species: "cat", allergies: [] };
  const entry = (m) => ({ medication: m });
  const r1 = R.alertsFor(entry("Paracetamol + Vitamin C"), pet);
  check("الجولة: «Paracetamol + Vitamin C» لقطّة ⇒ «ممنوع منعاً باتاً — باراسيتامول»", r1.some((a) => a.id === "banned" && /باراسيتامول/.test(a.title)), r1.map((a) => a.title).join(" | "));
  const r2 = R.alertsFor(entry(BIO_SONE), { species: "dog", allergies: [] });
  check("  وBio-Sone لكلب: لا «المدى الموثَّق» لبريدنيزولون (كان ٠٫٥–٢ ملغم/كغ)", !r2.some((a) => a.id === "window" || a.id === "ceiling"), r2.map((a) => a.title).join(" | "));
  const r3 = R.alertsFor(entry("Amoxicillin + Gentamicin"), { species: "dog", allergies: ["Penicillin"] });
  check("  وحساسيةُ البنسلين على «Amoxicillin + Gentamicin» تُقال", r3.some((a) => a.id.startsWith("allergy-") && a.blocking), r3.map((a) => a.id).join(","));

  const proto = F.inflate({ id: "custom-m", name: "x", indication: "", species: ["cat", "dog"], days: 1,
    steps: [{ kind: "drug", ref: "", label: "Paracetamol + Vitamin C", amount: "1 ml", perDay: 1 }, { kind: "drug", ref: "", label: "Amoxicillin + Gentamicin", amount: "1 ml", perDay: 1 }] });
  const cat = F.buildDraft(proto, { species: "cat", current_weight_kg: 4 }, "2026-10-14");
  check("البروتوكول: «Paracetamol + Vitamin C» لا يُدرَج لقطّة (كمنعِ الباراسيتامول وحده)", !cat.some((r) => r.medication === "Paracetamol + Vitamin C"), cat.map((r) => r.medication).join(","));
  const dog = F.buildDraft(proto, { species: "dog", current_weight_kg: 20 }, "2026-10-14");
  const al = F.draftAlerts(dog, { species: "dog", allergies: ["Penicillin"] });
  check("  وحساسيةُ البنسلين على «Amoxicillin + Gentamicin» الحرّة تُقال قبل الكتابة", al.some((a) => a.id === "allergy-amoxicillin"), al.map((a) => a.id).join(","));
});

/* ── ٦) الإضافةُ للخطة: لا بذرةَ جرعةٍ لخليط ───────────────────────────────── */
await section("▸ ٦) formularySeed: إضافةُ Bio-Sone لا تبذر ملغ/كغ ولا عياراً", async () => {
  const { loadUI } = await import("./react-mini.mjs");
  const TP = await loadUI(`export * as TP from "./src/components/TreatmentPlan.tsx";`, {
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playStepDone = n;",
    "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
  }).then((m) => m.TP);
  check("formularySeed مُصدَّرة للفحص", typeof TP.formularySeed === "function");
  const seed = TP.formularySeed(BIO_SONE, "dog");
  check("Bio-Sone لكلب ⇒ لا mgPerKg ولا strength ولا solid ولا route (كانت 0.5 ملغ/كغ وحبة ٥ ملغ)",
    seed.mgPerKg === undefined && seed.strength === undefined && seed.solid === undefined && seed.route === undefined, JSON.stringify(seed));
  const vim = TP.formularySeed(VIMESPIRO, "cat");
  check("Vimespiro لقطّة ⇒ لا بذرة", Object.keys(vim).length === 0, JSON.stringify(vim));
  const pred = TP.formularySeed("Prednisolone", "dog");
  check("  وبريدنيزولون وحدها تُبذر كما كانت (0.5 ملغ/كغ، حبة ٥)", pred.mgPerKg === 0.5 && pred.strength === 5 && pred.solid === true, JSON.stringify(pred));
  const amox = TP.formularySeed("Amoxicillin 250mg", "dog");
  check("  و«Amoxicillin 250mg» ببذرة الأموكسيسيلين", amox.mgPerKg === F.DRUG_BY_ID.get("amoxicillin").doses[0].typical, JSON.stringify(amox));
});

/* ── ٧) البطاقةُ بالخطة ترسم المنعَ والتعارض ──────────────────────────────── */
await section("▸ ٧) DrugCard: الخليطُ بلا عنوانِ مادة، ومنعُ مادته وتعارضُها مرسومان", async () => {
  const { loadUI } = await import("./react-mini.mjs");
  const UI = await loadUI(`
    import { useState, createElement as h } from "react";
    import { DrugCard } from "./src/components/treatment/DrugCard.tsx";
    export function CardH(p) { const [r, setR] = useState(p.initial); return h(DrugCard, { ...p, row: r, open: true, onToggle() {}, onRemove() {}, onReplace() {}, onNeedWeight() {}, onPatch: (x) => setR((o) => ({ ...o, ...x })) }); }
  `, {
    "@/lib/repo": "export const repo = { lastDoseOf: () => Promise.resolve([]) };",
    "./NumberPadSheet": "export const NumberPadSheet = () => null;",
    "@/lib/flowsheet": "export const routeName = (r) => r;",
    "@/components/DoseBlock": "import { createElement as h } from 'react'; export const DoseAlertRow = ({ alert }) => h('div', { 'data-alert': alert.id, 'data-tone': alert.tone }, alert.title);",
  });
  const h = UI.React.createElement;
  const ROUTES = [{ id: "oral", key: "r.oral", label: "فموي" }];
  const FREQS = [{ id: "1", key: "f1", label: "مرة يومياً", perDay: 1 }];
  const card = async (name, species, concurrent = [], extra = {}) => {
    const u = UI.mount(h(UI.CardH, { initial: { id: "r1", name, dose: "", freq: "1", days: 3 }, species, concurrent, planDays: 3, routes: ROUTES, freqs: FREQS, ...extra }));
    await u.settle(); return u;
  };
  let c = await card("Paracetamol + Vitamin C", "cat");
  const banRow = c.findAll("data-alert").find((n) => /banned$/.test(n.props["data-alert"]));
  check("«Paracetamol + Vitamin C» لقطّة: سطرُ المنع حرجٌ ويسمّي الباراسيتامول", !!banRow && banRow.props["data-tone"] === "critical" && /باراسيتامول/.test(c.text(banRow)), c.findAll("data-alert").map((n) => n.props["data-alert"]).join(","));
  c = await card(BIO_SONE, "dog", [], { weight: 20 });
  const head = c.find("data-drugcardhead", "r1");
  check("بطاقةُ Bio-Sone: العنوانُ اسمُها لا «بريدنيزولون»", !!head && c.text(head).includes("Bio-Sone") && !c.text(head).includes("بريدنيزولون"), head ? c.text(head).slice(0, 90) : "∅");
  check("  وبلا بلاطات جرعةٍ من نافذة بريدنيزولون", !c.find("data-dosetile"));
  c = await card(VIMESPIRO, "dog", ["Meloxicam"]);
  check("Vimespiro مع «Meloxicam» بالخطة ⇒ تعارضٌ حرج بالبطاقة", c.findAll("data-alert").some((n) => /pair-meloxicam$/.test(n.props["data-alert"]) && n.props["data-tone"] === "critical"), c.findAll("data-alert").map((n) => n.props["data-alert"]).join(","));
  c = await card("Meloxicam", "dog", [VIMESPIRO]);
  check("  وبطاقةُ ميلوكسيكام ترى بريدنيزولون الخليط (الأسماءُ تُقرأ معرّفاتٍ — كانت تُمرَّر أسماءً فلا تعارضَ بالبطاقة أبداً)", c.findAll("data-alert").some((n) => n.props["data-alert"] === "pair-prednisolone"), c.findAll("data-alert").map((n) => n.props["data-alert"]).join(","));
});

/* ── ٨) المضيفون يمرّون من موادّ الخليط ───────────────────────────────────── */
await section("▸ ٨) المضيفون: فحصُ الخطة وورقةُ الطبلة يقرآن موادّ الخليط", () => {
  const tp = src("src/components/TreatmentPlan.tsx");
  check("فحصُ الخطة: الصفوفُ الأخرى بموادّها (concurrentIds)، والخليطُ بـcheckIngredientSafety",
    /concurrentIds\(filledRows\.filter\(\(x\) => x\.id !== r\.id\)\.map\(\(x\) => x\.name\)\)/.test(tp) && /checkIngredientSafety\(\{ ingredients: ingredientMonographs\(r\.name\)/.test(tp) && !/if \(!drug\) continue;/.test(tp));
  const flow = src("src/components/Flowsheet.tsx");
  check("ورقةُ الطبلة: منعُ مادةٍ في الخليط يُقال (bannedIngredient) بسطر data-drugbanned", /bannedIngredient\(med\.name/.test(flow) && /\{bannedWhy && \(\s*<p data-drugbanned/.test(flow));
  const card = src("src/components/treatment/DrugCard.tsx");
  check("البطاقة: checkSafety يأخذ معرّفاتِ الصفوف الأخرى (concurrentIds) لا الأسماء", !/concurrent, dose/.test(card) && !/flags, concurrent,\n/.test(card) && /concurrentIds\(concurrent\)/.test(card) && /concurrent: otherIds/.test(card));
});

/* ════════════════════════════════════════════════════════════════════════════
 * الجولةُ الثانية (١٥/١٠) — ما بقي بعد الأولى، مقيساً على ٤١٨ اسماً بالإنتاج و٧٨ بالكتالوج.
 * الدوالُّ الجديدة (concurrentIds، isLocalForm) لها بديلٌ هنا يحاكي ما كان المضيفون يفعلونه قبلها
 * (flatMap ingredientMonographs، ولا شكلَ موضعيّ) — فيفشل الفحصُ على الشِفرة القديمة بسببه هو.
 * ══════════════════════════════════════════════════════════════════════════ */
const cids = (names) => (F.concurrentIds ? F.concurrentIds(names) : names.flatMap((n) => F.ingredientMonographs(n).map((d) => d.id)));
const isLocal = (n) => (F.isLocalForm ? F.isLocalForm(n) : false);
const mixSafety = (name, o) => F.checkIngredientSafety({ ingredients: F.ingredientMonographs(name), local: isLocal(name), ...o });
const NOW2 = "2026-10-15T00:00:00.000Z";
const tile = (name, species) => I.buildMedIndex({ catalog: [], rows: [{ id: "t1", name, family: "other", in_mine: true, pos: 1, archived_at: null, created_at: NOW2, updated_at: NOW2 }], species, stockMode: "hide" }).all.find((x) => x.name === name);

/* ── ٩) مركّبٌ بشَرطةٍ ومعه مادّة: «A-B + C» مادّتان لا المركّبُ وحده ─────────────────── */
await section("▸ ٩) «Amoxicillin-Clavulanate + X»: المركّبُ مادةٌ والـX مادةٌ — عددُ الأجزاء لا يكفي", () => {
  const AC_PC = "Amoxicillin-Clavulanate + Paracetamol";
  check(`«${AC_PC}» ⇒ لا مونوغرافَ واحد (كان أموكسيسيلين + كلافولانيك: جزآن كاسمه العربي)`, one(AC_PC) === null, String(one(AC_PC)));
  check("  وموادُّه المركّبُ والباراسيتامول", ings(AC_PC) === "amoxi-clav,paracetamol", ings(AC_PC));
  check("  ولقطّةٍ ممنوعٌ باسم الباراسيتامول (كان صامتاً بكلّ مسار)", /باراسيتامول/.test(ban(AC_PC, "cat") ?? ""), String(ban(AC_PC, "cat")));
  const TS_PC = "Trimethoprim-Sulfadiazine + Paracetamol";
  check(`«${TS_PC}» لقطّة ⇒ ممنوع (كان TMPS وحده)`, one(TS_PC) === null && /باراسيتامول/.test(ban(TS_PC, "cat") ?? ""), `${one(TS_PC)} | ${ban(TS_PC, "cat")}`);
  for (const G of ["أموكسيسيلين-كلافولانيك + جنتاميسين", "Amoxicillin-Clavulanate + Gentamicin", "Amoxicillin/Clavulanate + Gentamicin", "Trimethoprim-Sulfadiazine + Gentamicin"]) {
    const a = mixSafety(G, { species: "dog", flags: { dehydrated: true } });
    check(`«${G}» لكلبٍ مجفّف ⇒ «أمينوغلايكوزيد مع جفاف» حرجٌ يوقف`, one(G) === null && a.some((x) => x.id === "gentamicin:amino-renal" && x.blocking), `${one(G)} | ${a.map((x) => x.id).join(",")}`);
  }
  const AC_MX = "Amoxicillin-Clavulanate + Meloxicam";
  const fromPred = F.checkSafety({ drug: F.DRUG_BY_ID.get("prednisolone"), species: "dog", mgPerKg: 0, dose: undefined, concurrent: cids([AC_MX]) });
  check(`صفُّ بريدنيزولون مع «${AC_MX}» ⇒ تعارضُ كورتيزون + NSAID حرج`, fromPred.some((a) => a.id === "pair-meloxicam" && a.tone === "critical"), fromPred.map((a) => a.id).join(","));
  const fromMix = mixSafety(AC_MX, { species: "dog", concurrent: ["prednisolone"] });
  check("  ومن جهة الخليط نفسِه", fromMix.some((a) => a.id === "meloxicam:pair-prednisolone"), fromMix.map((a) => a.id).join(","));
  const r = R.alertsFor({ medication: AC_PC }, { species: "cat", allergies: [] });
  check("  والجولة: «ممنوع منعاً باتاً — باراسيتامول»", r.some((a) => a.id === "banned" && /باراسيتامول/.test(a.title)), r.map((a) => a.title).join(" | "));
  const t = tile(AC_PC, "cat");
  check("  وبلاطةُ المنتقي: عنوانُها اسمُها وعليها «ممنوع»", t?.label === AC_PC && /باراسيتامول/.test(t?.banned ?? ""), JSON.stringify({ label: t?.label, banned: t?.banned }));
  const proto = F.inflate({ id: "custom-x", name: "x", indication: "", species: ["cat"], days: 1, steps: [{ kind: "drug", ref: "", label: AC_PC, amount: "1 ml", perDay: 1 }] });
  check("  والبروتوكول لا يُدرجه لقطّة", !F.buildDraft(proto, { species: "cat", current_weight_kg: 4 }, "2026-10-15").some((x) => x.medication === AC_PC));
});

/* ── ١٠) نصفا المركّب مادّتان يعرفهما الدليل ─────────────────────────────────── */
await section("▸ ١٠) «Trimethoprim + Sulfadiazine + X» فيه TMPS، و«Trimethoprim» وحدها TMPS", () => {
  const sulfa = { species: "dog", allergies: ["Sulfa"] };
  for (const [name, want] of [["Trimethoprim + Sulfadiazine + Dexamethasone", "dexamethasone,tmps"], ["Trimethoprim + Sulfadiazine + Colistin", "tmps"], ["Sulfadimidine + Trimethoprim", "tmps"]]) {
    check(`«${name}» ⇒ موادُّه ${want}، لا مونوغرافَ واحد`, one(name) === null && ings(name) === want, `${one(name)} | ${ings(name)}`);
    const a = mixSafety(name, sulfa);
    check(`  وحساسيةُ السلفا تمسكه (كانت صامتة)`, a.some((x) => x.id.startsWith("tmps:allergy-") && x.blocking), a.map((x) => x.id).join(","));
    const r = R.alertsFor({ medication: name }, sulfa);
    check("  وبالجولة", r.some((x) => x.id.startsWith("allergy-") && x.blocking), r.map((x) => x.id).join(","));
  }
  check("«Trimethoprim» ⇒ ترايميثوبريم + سلفا (كانت قبل الجولة الأولى؛ ضاعت بها)", one("Trimethoprim") === "tmps", String(one("Trimethoprim")));
  check("  و«Amoxicillin + Clavulanic acid» ⇒ المركّب (موادُّه بأسمائها)", one("Amoxicillin + Clavulanic acid") === "amoxi-clav", String(one("Amoxicillin + Clavulanic acid")));
  const proto = F.inflate({ id: "custom-s", name: "x", indication: "", species: ["dog"], days: 1, steps: [{ kind: "drug", ref: "", label: "Trimethoprim + Sulfadiazine + Colistin", amount: "1 ml", perDay: 1 }] });
  const al = F.draftAlerts(F.buildDraft(proto, { species: "dog", current_weight_kg: 20 }, "2026-10-15"), sulfa);
  check("  والبروتوكول يقول حساسيةَ السلفا قبل الكتابة", al.some((a) => a.id === "allergy-tmps"), al.map((a) => a.id).join(","));
});

/* ── ١١) الهمزةُ تُطوى على الطرفين ──────────────────────────────────────────── */
await section("▸ ١١) «ايبوبروفين» بلا همزة هو «آيبوبروفين» — والمنعُ معه", () => {
  check("«ايبوبروفين» (٧ أسطر لقطّة بالإنتاج) ⇒ آيبوبروفين", one("ايبوبروفين") === "ibuprofen", String(one("ايبوبروفين")));
  check("  ولقطّة ممنوع", !!ban("ايبوبروفين", "cat"));
  check("«اسبرين» لقطّة ⇒ ممنوع، و«اموكسيسيلين» ⇒ أموكسيسيلين، و«انروفلوكساسين» ⇒ إنروفلوكساسين",
    !!ban("اسبرين", "cat") && one("اموكسيسيلين") === "amoxicillin" && one("انروفلوكساسين") === "enrofloxacin", `${ban("اسبرين", "cat")} ${one("اموكسيسيلين")} ${one("انروفلوكساسين")}`);
  const r = R.alertsFor({ medication: "ايبوبروفين" }, { species: "cat", allergies: [] });
  check("  والجولة: «ممنوع منعاً باتاً»", r.some((a) => a.id === "banned"), r.map((a) => a.id).join(","));
  const t = tile("ايبوبروفين", "cat");
  check("  وبلاطةُ المنتقي عليها «ممنوع»", typeof t?.banned === "string", JSON.stringify({ banned: t?.banned }));
  check("الحساسيةُ المكتوبة بلا همزة تمسك الدواء (اموكسيسيلين ⇐ أموكسيسيلين، اسبرين ⇐ أسبرين)",
    !!F.allergyHit(F.DRUG_BY_ID.get("amoxicillin"), "اموكسيسيلين") && !!F.allergyHit(F.DRUG_BY_ID.get("aspirin"), "اسبرين"));
  check("«غلوكونات الكالسيوم» ⇒ الغلوكونات (الرقمُ والنسبةُ العربيّان عيارٌ لا اسم)", one("غلوكونات الكالسيوم") === "calcium-gluconate", String(one("غلوكونات الكالسيوم")));
  check("والرقمُ الملتصق بالحرف من الاسم: «Vitamin K3» ليست K1، و«Vitamin K» و«فيتامين ك١» هي",
    one("Vitamin K3") === null && one("Vitamin K") === "vitamin-k1" && one("فيتامين ك١") === "vitamin-k1", `${one("Vitamin K3")} ${one("Vitamin K")} ${one("فيتامين ك١")}`);
});

/* ── ١٢) أوّلُ كلمةٍ من اسمٍ بكلمتين، والوصفُ ليس مادّة ──────────────────────── */
await section("▸ ١٢) «Pyrantel» و«Tolfenamic» دواؤهما، و«Meloxicam for dogs and cats» ميلوكسيكام", async () => {
  for (const [name, want] of [["Pyrantel", "pyrantel"], ["Pyrantel 50mg", "pyrantel"], ["Tolfenamic", "tolfenamic"], ["التولفيناميك", "tolfenamic"],
    ["Meloxicam for dogs and cats", "meloxicam"], ["Meloxicam - dogs & cats", "meloxicam"], ["Calcium glucon", "calcium-gluconate"]]) {
    check(`«${name}» ⇒ ${want}`, one(name) === want, String(one(name)));
  }
  const m = F.checkSafety({ drug: F.matchMonograph("Meloxicam for dogs and cats") ?? F.DRUG_BY_ID.get("paracetamol"), species: "cat", weightKg: 4, mgPerKg: 0.3, dose: undefined });
  check("  فسقفُ الميلوكسيكام للقطّ يُقال عليه", m.some((a) => a.id === "hard-max"), m.map((a) => a.id).join(","));
  const { loadUI } = await import("./react-mini.mjs");
  const TP = await loadUI(`export * as TP from "./src/components/TreatmentPlan.tsx";`, {
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playStepDone = n;",
    "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
  }).then((x) => x.TP);
  const py = TP.formularySeed("Pyrantel 50mg", "dog");
  check("  وإضافةُ «Pyrantel 50mg» تبذر ٥ ملغ/كغ فموي", py.mgPerKg === 5 && py.route === "oral", JSON.stringify(py));
});

/* ── ١٣) «/» و«,» و«with» و«و» تعدّد الموادّ كـ«+» ─────────────────────────── */
await section("▸ ١٣) الفواصلُ كما تُكتب: «/» و«,» و«with» و«و» قبل اسم مادة", async () => {
  for (const name of ["Florfenicol/Doxycycline", "Amoxicillin/Gentamicin", "Amoxicillin, Gentamicin", "Amoxicillin with Gentamicin", "أموكسيسيلين وجنتاميسين"]) {
    const a = name === "Florfenicol/Doxycycline" ? [] : mixSafety(name, { species: "cat", flags: { renal: true } });
    check(`«${name}» ⇒ لا مونوغرافَ واحد${a.length || name !== "Florfenicol/Doxycycline" ? "، وجنتاميسينُه يوقف مع الكلى" : ""}`,
      one(name) === null && (name === "Florfenicol/Doxycycline" || a.some((x) => x.id === "gentamicin:amino-renal")), `${one(name)} | ${a.map((x) => x.id).join(",")}`);
  }
  for (const name of ["Paracetamol/Vitamin C", "Paracetamol with Vitamin C", "Paracetamol, Vitamin C", "Acetaminophen/Codeine"]) {
    check(`«${name}» ⇒ لا باراسيتامولَ واحد (المترادفُ الجديد لم يصِر دبّوساً)، ومنعُه للقطّ باقٍ`, one(name) === null && /باراسيتامول/.test(ban(name, "cat") ?? ""), `${one(name)} | ${ban(name, "cat")}`);
  }
  check("لا تُقسَم: «Amoxicillin 250mg/5ml» و«Meloxicam 1.5mg/ml» (نسبةُ عيار) و«انروفلوكساسين حبوب قطط وكلاب» («و» قبل وصف)",
    one("Amoxicillin 250mg/5ml") === "amoxicillin" && one("Meloxicam 1.5mg/ml") === "meloxicam" && one("انروفلوكساسين حبوب قطط وكلاب") === "enrofloxacin",
    `${one("Amoxicillin 250mg/5ml")} ${one("Meloxicam 1.5mg/ml")} ${one("انروفلوكساسين حبوب قطط وكلاب")}`);
  const { loadUI } = await import("./react-mini.mjs");
  const TP = await loadUI(`export * as TP from "./src/components/TreatmentPlan.tsx";`, {
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playStepDone = n;",
    "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
  }).then((x) => x.TP);
  for (const name of ["Paracetamol/Vitamin C", "Amoxicillin-Clavulanate + Gentamicin"]) {
    const s = TP.formularySeed(name, "dog");
    check(`إضافةُ «${name}» لا تبذر جرعةً ولا عياراً (كانت ${name.startsWith("P") ? "حبةَ ٥٠٠ و١٠ ملغ/كغ" : "١٢٫٥ ملغ/كغ وعيار ٥٠"})`, Object.keys(s).length === 0, JSON.stringify(s));
  }
});

/* ── ١٤) قطرةُ العين ليست الحقنة ────────────────────────────────────────────── */
await section("▸ ١٤) «Gentamicin eye/ear drop» (منتجان بالمخزون): لا جرعةَ حقنٍ ولا منعَ جفاف — والحساسيةُ باقية", async () => {
  for (const name of ["Gentamicin eye drop", "Gentamicin ear drop", "Gentamicin (eye drops)"]) {
    check(`«${name}» ⇒ لا مونوغرافَ جنتاميسين الحقن، ومادّتُه جنتاميسين`, one(name) === null && ings(name) === "gentamicin", `${one(name)} | ${ings(name)}`);
  }
  const dry = mixSafety("Gentamicin eye drop", { species: "cat", flags: { dehydrated: true }, concurrent: ["meloxicam"] });
  check("  قطّةٌ مجفّفة: لا «أمينوغلايكوزيد مع جفاف» ولا تعارض", !dry.some((a) => /amino-renal|pair-/.test(a.id)), dry.map((a) => a.id).join(","));
  const alg = mixSafety("Gentamicin eye drop", { species: "cat", allergies: ["Gentamicin"] });
  check("  حارس: وحساسيةُ الجنتاميسين المسجّلة تُقال (الشكلُ الموضعيّ لا يُسكتها)", alg.some((a) => a.id.startsWith("gentamicin:allergy-") && a.blocking), alg.map((a) => a.id).join(","));
  check("  ولا تُحسب بالدم لصفٍّ آخر (أميكاسين لا «تكرار»)", !cids(["Gentamicin eye drop"]).includes("gentamicin"), JSON.stringify(cids(["Gentamicin eye drop"])));
  const t = tile("Gentamicin eye drop", "cat");
  check("  وبلاطتُها باسمها، بلا جرعة", t?.label === "Gentamicin eye drop" && !t.monographId && !t.dosed, JSON.stringify({ label: t?.label, mono: t?.monographId }));
  check("حارس: «Permethrin spray» موضعيٌّ ودواؤه موضعيّ ⇒ بيرميثرين، ومنعُه للقطّ", one("Permethrin spray") === "permethrin" && !!ban("Permethrin spray", "cat"));
  const { loadUI } = await import("./react-mini.mjs");
  const TP = await loadUI(`export * as TP from "./src/components/TreatmentPlan.tsx";`, {
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playStepDone = n;",
    "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
  }).then((x) => x.TP);
  const s = TP.formularySeed("Gentamicin eye drop", "cat");
  check("  وإضافتُها لا تبذر ٦ ملغ/كغ وريدي بعيار ٤٠", Object.keys(s).length === 0, JSON.stringify(s));
  const tp = src("src/components/TreatmentPlan.tsx"), card = src("src/components/treatment/DrugCard.tsx");
  check("  وفحصُ الخطة والبطاقة يمرّران الشكلَ الموضعيّ (local)", /local: isLocalForm\(r\.name\)/.test(tp) && /isLocalForm\(row\.name\)/.test(card) && /concurrent: otherIds, local \}/.test(card));
});

/* ── ١٥) المادّةُ الواحدة من صفّين أخريين تنبيهٌ واحد ──────────────────────────── */
await section("▸ ١٥) Bio-Sone وVimespiro معاً: بريدنيزولونٌ واحد، لا تنبيهان بمفتاحٍ واحد", async () => {
  check("concurrentIds: كلُّ معرّفٍ مرّة", JSON.stringify(cids([BIO_SONE, VIMESPIRO])) === '["prednisolone"]', JSON.stringify(cids([BIO_SONE, VIMESPIRO])));
  const dupIn = F.checkSafety({ drug: F.DRUG_BY_ID.get("meloxicam"), species: "dog", mgPerKg: 0, dose: undefined, concurrent: ["prednisolone", "prednisolone"] });
  check("checkSafety نفسُه: معرّفٌ مكرّرٌ بالمدخل ⇒ تنبيهٌ واحد", dupIn.filter((a) => a.id === "pair-prednisolone").length === 1, dupIn.map((a) => a.id).join(","));
  const { loadUI } = await import("./react-mini.mjs");
  const UI = await loadUI(`
    import { useState, createElement as h } from "react";
    import { DrugCard } from "./src/components/treatment/DrugCard.tsx";
    export function CardH(p) { const [r, setR] = useState(p.initial); return h(DrugCard, { ...p, row: r, open: true, onToggle() {}, onRemove() {}, onReplace() {}, onNeedWeight() {}, onPatch: (x) => setR((o) => ({ ...o, ...x })) }); }
  `, {
    "@/lib/repo": "export const repo = { lastDoseOf: () => Promise.resolve([]) };",
    "./NumberPadSheet": "export const NumberPadSheet = () => null;",
    "@/lib/flowsheet": "export const routeName = (r) => r;",
    "@/components/DoseBlock": "import { createElement as h } from 'react'; export const DoseAlertRow = ({ alert }) => h('div', { 'data-alert': alert.id, 'data-tone': alert.tone }, alert.title);",
  });
  const h = UI.React.createElement;
  const ROUTES = [{ id: "oral", key: "r.oral", label: "فموي" }];
  const FREQS = [{ id: "1", key: "f1", label: "مرة يومياً", perDay: 1 }];
  const dupKeys = (u) => {
    const byParent = new Map();
    for (const n of u.findAll("data-alert")) { const l = byParent.get(n.parent) ?? []; l.push(n.props["data-alert"]); byParent.set(n.parent, l); }
    return [...byParent.values()].flatMap((l) => l.filter((x, i) => l.indexOf(x) !== i));
  };
  const said = [];
  const err = console.error;
  console.error = (...a) => { said.push(String(a[0])); };
  try {
    for (const [name, concurrent, id] of [["Meloxicam", [BIO_SONE, VIMESPIRO], "pair-prednisolone"], ["Doxycycline", ["Florfenicol + Doxycycline", "Tylosin + Doxycycline"], "dup-same"]]) {
      const u = UI.mount(h(UI.CardH, { initial: { id: "r1", name, dose: "", freq: "1", days: 3 }, species: "dog", concurrent, planDays: 3, routes: ROUTES, freqs: FREQS }));
      await u.settle();
      const d = dupKeys(u);
      check(`بطاقةُ ${name} مع خليطين فيهما المادّة: «${id}» مرّةً بكلّ قائمة`, d.length === 0 && u.findAll("data-alert").some((n) => n.props["data-alert"] === id), `مكرّر: ${d.join(",")}`);
    }
  } finally { console.error = err; }
  check("  ولا «Encountered two children with the same key»", !said.some((s) => /same key/.test(s)), said.filter((s) => /same key/.test(s)).length + " تحذير");
  check("  ولافتةُ الخطة مفتاحُها معرّفُ الصفّ لا اسمُه (صفّان باسمٍ واحد)", /key=\{`\$\{s\.id\}-\$\{a\.id\}`\}/.test(src("src/components/TreatmentPlan.tsx")));
});

/* ════════════════════════════════════════════════════════════════════════════
 * الجولةُ الثالثة (١٥/١٠، §١٦–§٢١) — ستُّ فجواتٍ بعد الثانية. كلُّ فحصٍ هنا فشل على 2406d33
 * قبل إصلاحه، إلا ما وُسم «حارس»: ما كان صحيحاً ويجب أن يبقى بعد الإصلاح.
 * ══════════════════════════════════════════════════════════════════════════ */
let cardUI = null, tpUI = null;
/** معرّفاتُ تنبيهات بطاقة الدواء بالخطة، كما تُرسم. */
const cardAlerts = async (name, species, concurrent = [], extra = {}, row = {}) => {
  if (!cardUI) {
    const { loadUI } = await import("./react-mini.mjs");
    cardUI = await loadUI(`
      import { useState, createElement as h } from "react";
      import { DrugCard } from "./src/components/treatment/DrugCard.tsx";
      export function CardH(p) { const [r, setR] = useState(p.initial); return h(DrugCard, { ...p, row: r, open: true, onToggle() {}, onRemove() {}, onReplace() {}, onNeedWeight() {}, onPatch: (x) => setR((o) => ({ ...o, ...x })) }); }
    `, {
      "@/lib/repo": "export const repo = { lastDoseOf: () => Promise.resolve([]) };",
      "./NumberPadSheet": "export const NumberPadSheet = () => null;",
      "@/lib/flowsheet": "export const routeName = (r) => r;",
      "@/components/DoseBlock": "import { createElement as h } from 'react'; export const DoseAlertRow = ({ alert }) => h('div', { 'data-alert': alert.id, 'data-tone': alert.tone, 'data-blocking': alert.blocking ? '1' : '' }, alert.title);",
    });
  }
  const h = cardUI.React.createElement;
  const u = cardUI.mount(h(cardUI.CardH, {
    initial: { id: "r1", name, dose: "", freq: "1", days: 3, ...row }, species, concurrent, planDays: 3,
    routes: [{ id: "oral", key: "r.oral", label: "فموي" }], freqs: [{ id: "1", key: "f1", label: "مرة يومياً", perDay: 1 }], ...extra,
  }));
  await u.settle();
  return u.findAll("data-alert").map((n) => n.props["data-alert"]);
};
const seedOf = async (name, species) => {
  if (!tpUI) {
    const { loadUI } = await import("./react-mini.mjs");
    tpUI = await loadUI(`export * as TP from "./src/components/TreatmentPlan.tsx";`, {
      "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playStepDone = n;",
      "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
    }).then((x) => x.TP);
  }
  return tpUI.formularySeed(name, species);
};
const byId = (id) => F.DRUG_BY_ID.get(id);

/* ── ١٦) الفاصلُ بالعربي كالفاصل بالإنجليزي — والدواءان بلا فاصلٍ ليسا أوّلَهما ─────────── */
await section("▸ ١٦) «مع» و«،» و«؛» و« و » توائمُ «with» و«,» و«;» و«and» — ودواءان بجزءٍ واحد خليطٌ لا أوّلُهما", async () => {
  for (const name of ["أموكسيسيلين مع جنتاميسين", "أموكسيسيلين، جنتاميسين", "أموكسيسيلين؛ جنتاميسين", "Amoxicillin; Gentamicin"]) {
    const a = mixSafety(name, { species: "cat", flags: { dehydrated: true } });
    check(`«${name}» ⇒ لا أموكسيسيلينَ واحد، وموادُّه الاثنان، وقطّةٌ مجفّفة تُوقَف بـ«أمينوغلايكوزيد مع جفاف»`,
      one(name) === null && ings(name) === "amoxicillin,gentamicin" && a.some((x) => x.id === "gentamicin:amino-renal" && x.blocking),
      `${one(name)} | ${ings(name)} | ${a.map((x) => x.id).join(",")}`);
  }
  const MG = "ميلوكسيكام مع جنتاميسين";
  const mg = mixSafety(MG, { species: "dog", flags: { renal: true } });
  check(`«${MG}» لكلبٍ كلاه متعبة ⇒ لا ميلوكسيكامَ واحد، وجنتاميسينُه يوقف`, one(MG) === null && mg.some((x) => x.id === "gentamicin:amino-renal" && x.blocking),
    `${one(MG)} | ${mg.map((x) => x.id).join(",")}`);
  // التكافؤ: كلُّ فاصلٍ لاتينيّ وتوأمُه العربي يقسمان الاسمَ نفسَه — ومنها مادّةٌ لا يعرفها الدليل بعد «و» المنفصلة.
  for (const [lat, ar, a2, b2] of [[", ", "، ", "Gentamicin", "جنتاميسين"], ["; ", "؛ ", "Gentamicin", "جنتاميسين"], [" with ", " مع ", "Gentamicin", "جنتاميسين"],
    [" and ", " و ", "Florfenicol", "فلورفنيكول"]]) {
    const L = `Doxycycline${lat}${a2}`, A = `دوكسيسيكلين${ar}${b2}`;
    check(`التكافؤ: «${lat.trim()}» و«${ar.trim()}» يقسمان مثل بعض، ولا يصير الاسمُ دوكسيسيكلين`,
      F.ingredientParts(L).length === 2 && F.ingredientParts(A).length === 2 && one(L) === null && one(A) === null,
      `${JSON.stringify(F.ingredientParts(L))} ${one(L)} | ${JSON.stringify(F.ingredientParts(A))} ${one(A)}`);
  }
  for (const [name, want] of [["Amoxicillin Gentamicin", "amoxicillin,gentamicin"], ["Amoxicillin - Gentamicin", "amoxicillin,gentamicin"],
    ["أموكسيسيلين جنتاميسين", "amoxicillin,gentamicin"], ["Meloxicam. Gentamicin", "gentamicin,meloxicam"], ["Amoxicillin Clavulanate Gentamicin", "amoxi-clav,gentamicin"]]) {
    check(`«${name}» (دواءان بلا فاصلٍ يُعرف) ⇒ لا أطولُهما، وموادُّه ${want}`, one(name) === null && ings(name) === want, `${one(name)} | ${ings(name)}`);
  }
  check("حارس: اسمان لدواءٍ واحد ليسا خليطاً («Metacam Meloxicam»)، والاسمُ الأطول يغطّي ما بداخله («ميثيل بريدنيزولون» ليس بريدنيزولون معه، «Amoxicillin Clavulanate» المركّبُ وحده)",
    one("Metacam Meloxicam") === "meloxicam" && one("ميثيل بريدنيزولون") === "methylprednisolone" && ings("ميثيل بريدنيزولون") === "methylprednisolone"
    && one("Amoxicillin Clavulanate 250mg") === "amoxi-clav" && ings("Amoxicillin Clavulanate 250mg") === "amoxi-clav",
    `${one("Metacam Meloxicam")} ${one("ميثيل بريدنيزولون")} ${ings("ميثيل بريدنيزولون")} ${one("Amoxicillin Clavulanate 250mg")}`);
  check("حارس: الفاصلةُ بين رقمين كسرٌ بالخطّين («ميلوكسيكام ١،٥ ملغ»، «Meloxicam 1,5 mg»)، و«مع» قبل وصفٍ لا تصنع مادّة («ميلوكسيكام مع الأكل»)",
    one("ميلوكسيكام ١،٥ ملغ") === "meloxicam" && one("Meloxicam 1,5 mg") === "meloxicam" && one("ميلوكسيكام مع الأكل") === "meloxicam",
    `${one("ميلوكسيكام ١،٥ ملغ")} ${one("Meloxicam 1,5 mg")} ${one("ميلوكسيكام مع الأكل")}`);
  const s = await seedOf("أموكسيسيلين مع جنتاميسين", "cat");
  check("إضافةُ «أموكسيسيلين مع جنتاميسين» لا تبذر جرعةَ الأموكسيسيلين ولا عيارَه", Object.keys(s).length === 0, JSON.stringify(s));
});

/* ── ١٧) الشكلُ والعبوةُ بعد الفاصل ليسا مادّة ─────────────────────────────────── */
await section("▸ ١٧) «, injectable» و«/vial» و«w/v» و«with dosing syringe» ليست موادّ — والدواءُ يبقى بنافذته وسقفه", () => {
  for (const [name, want] of [["Ceftriaxone 1g/vial", "ceftriaxone"], ["Amoxicillin 500mg/cap", "amoxicillin"], ["Furosemide 50mg/amp", "furosemide"],
    ["Dexamethasone 4mg/ampoule", "dexamethasone"], ["Ivermectin 1% w/v", "ivermectin"], ["Enrofloxacin 10% w/v", "enrofloxacin"], ["Omeprazole 20mg/cap", "omeprazole"],
    ["Doxycycline 100mg/cap", "doxycycline"], ["Meloxicam, oral suspension", "meloxicam"], ["Meloxicam 1.5 mg/mL, oral suspension", "meloxicam"],
    ["Enrofloxacin, injectable", "enrofloxacin"], ["Tramadol, 50mg tabs", "tramadol"], ["Furosemide, 10 mg/mL injection", "furosemide"],
    ["Enrofloxacin 50 mg/tab, 10 tabs", "enrofloxacin"], ["Aspirin, low dose", "aspirin"], ["Carprofen / chewable", "carprofen"],
    ["Meloxicam with dosing syringe", "meloxicam"], ["Ibuprofen 5% w/w gel", "ibuprofen"], ["ميلوكسيكام ١٫٥ ملغ/مل", "meloxicam"]]) {
    check(`«${name}» ⇒ ${want} (كما على main)`, one(name) === want, `${one(name)} parts=${JSON.stringify(F.ingredientParts(name))}`);
  }
  check("حارس: «إنروفلوكساسين، حقن» ⇒ إنروفلوكساسين — الفاصلةُ العربيةُ (§١٦) لا تجعل الشكلَ مادّة", one("إنروفلوكساسين، حقن") === "enrofloxacin",
    `${one("إنروفلوكساسين، حقن")} parts=${JSON.stringify(F.ingredientParts("إنروفلوكساسين، حقن"))}`);
  const enro = F.matchMonograph("Enrofloxacin, injectable");
  const a = enro ? F.checkSafety({ drug: enro, species: "cat", weightKg: 4, mgPerKg: 10, dose: undefined }) : [];
  check("قطّةٌ ٤ كغ بـ١٠ ملغ/كغ من «Enrofloxacin, injectable» ⇒ «تجاوزت السقف» الحاجب (عمى الشبكية)", a.some((x) => x.id === "hard-max" && x.blocking), a.map((x) => x.id).join(","));
  const mx = F.matchMonograph("Meloxicam, oral suspension");
  const b = mx ? F.checkSafety({ drug: mx, species: "cat", weightKg: 4, mgPerKg: 0.2, dose: undefined }) : [];
  check("  و«Meloxicam, oral suspension» لقطّة بـ٠٫٢ ⇒ سقفُ الميلوكسيكام للقطّ", b.some((x) => x.id === "hard-max"), b.map((x) => x.id).join(","));
  check("حارس: الخليطُ يبقى خليطاً — «Florfenicol, injectable» لا شيء، و«Amoxicillin, Gentamicin injection» مادّتان، و«Paracetamol, Vitamin C tablets» ممنوعٌ للقطّ",
    one("Florfenicol, injectable") === null && one("Amoxicillin, Gentamicin injection") === null && ings("Amoxicillin, Gentamicin injection") === "amoxicillin,gentamicin"
    && one("Paracetamol, Vitamin C tablets") === null && /باراسيتامول/.test(ban("Paracetamol, Vitamin C tablets", "cat") ?? ""),
    `${one("Florfenicol, injectable")} ${one("Amoxicillin, Gentamicin injection")} ${ings("Amoxicillin, Gentamicin injection")} ${one("Paracetamol, Vitamin C tablets")}`);
});

/* ── ١٨) الشكلُ الموضعيّ يعلنه الشكل، لا مكانُ المرض ─────────────────────────────── */
await section("▸ ١٨) «injection (ear infection)» حقنة، و«pour-on»/«spot-on» تُمتصّ للدم — والقطرةُ تبقى قطرة", async () => {
  for (const [name, want] of [["Gentamicin injection (ear infection)", "gentamicin"], ["Enrofloxacin (ear infection)", "enrofloxacin"],
    ["Doxycycline (eye infection)", "doxycycline"], ["Clindamycin (ear/skin)", "clindamycin"], ["Cephalexin for skin and ear infections", "cephalexin"],
    ["Ivermectin pour-on", "ivermectin"], ["Ivermectin spot-on", "ivermectin"], ["جنتاميسين حقن لالتهاب الاذن", "gentamicin"]]) {
    check(`«${name}» ⇒ ${want}، لا شكلَ موضعيّ`, one(name) === want && !isLocal(name), `${one(name)} local=${isLocal(name)}`);
  }
  const G = "Gentamicin injection (ear infection)";
  const melox = F.checkSafety({ drug: byId("meloxicam"), species: "cat", mgPerKg: 0, dose: undefined, concurrent: cids([G]) });
  check(`صفُّ ميلوكسيكام مع «${G}» ⇒ تعارض NSAID + أمينوغلايكوزيد (كان الصفُّ يُترك كأنه قطرة)`, melox.some((a) => a.id === "pair-gentamicin"), melox.map((a) => a.id).join(","));
  const c = await cardAlerts(G, "cat", ["Meloxicam"], { flags: { dehydrated: true }, weight: 4 });
  check("  وبطاقتُه لقطّةٍ مجفّفة: «أمينوغلايكوزيد مع جفاف» وتعارضُ الميلوكسيكام", c.includes("amino-renal") && c.includes("pair-meloxicam"), c.join(","));
  const iv = await cardAlerts("Ivermectin pour-on", "dog", ["Ivermectin"]);
  check("«Ivermectin pour-on» مع حقنة «Ivermectin» ⇒ «موصوف أصلاً» الحاجب", iv.includes("dup-same"), iv.join(","));
  for (const name of ["Gentamicin eye drop", "Gentamicin ear drop", "Gentamicin (eye drops)", "قطرة جنتاميسين للعين", "جنتاميسين قطرة عين", "مرهم عين جنتاميسين", "Gentamicin ophthalmic ointment"]) {
    check(`حارس: «${name}» موضعيّ — لا جنتاميسينَ الحقن، ومادّتُه جنتاميسين`, isLocal(name) && one(name) === null && ings(name) === "gentamicin", `${isLocal(name)} ${one(name)} ${ings(name)}`);
  }
});

/* ── ١٩) الحساسيةُ تُقرأ كلماتٍ لا حروفاً ──────────────────────────────────────── */
await section("▸ ١٩) «فيتامين كومبلكس» ليست «فيتامين ك» — الحساسيةُ لا توقف ترياقَ سمّ الفئران", () => {
  const K1 = byId("vitamin-k1");
  for (const a of ["فيتامين كومبلكس", "فيتامين كالسيوم", "Vitamin K3", "vitamin kit"]) {
    check(`حساسيةُ «${a}» لا توقف فيتامين ك١`, !F.allergyHit(K1, a), String(F.allergyHit(K1, a)));
  }
  const r = R.alertsFor({ medication: "Vitamin K1" }, { species: "dog", allergies: ["فيتامين كومبلكس"] });
  check("  والجولة: «Vitamin K1» مع «فيتامين كومبلكس» بالملفّ بلا «حساسية مسجّلة»", !r.some((a) => a.id.startsWith("allergy-")), r.map((a) => a.id).join(","));
  check("«لا» و«-» بخانة الحساسية لا توقفان أموكسيسيلين + كلافولانيك ولا الميدازولام (حرفان داخل «كلافولانيك» و«Amoxicillin-clavulanate»)",
    !F.allergyHit(byId("amoxi-clav"), "لا") && !F.allergyHit(byId("midazolam"), "لا") && !F.allergyHit(byId("amoxi-clav"), "-"),
    `${F.allergyHit(byId("amoxi-clav"), "لا")} | ${F.allergyHit(byId("midazolam"), "لا")} | ${F.allergyHit(byId("amoxi-clav"), "-")}`);
  for (const [id, a] of [["vitamin-k1", "Vitamin K"], ["vitamin-k1", "فيتامين ك"], ["vitamin-k1", "Vitamin K1"], ["vitamin-k1", "فيتامين ك١"], ["vitamin-k1", "حساسية من فيتامين ك"],
    ["amoxicillin", "اموكسيسيلين"], ["amoxicillin", "Amox"], ["dexamethasone", "حساسية للديكساميثازون"], ["dexamethasone", "بنسلين وديكساميثازون"],
    ["epinephrine", "أدرينالين"], ["paracetamol", "Acetaminophen"], ["amoxi-clav", "Synulox"], ["prednisolone", "Prednisolone acetate"], ["gentamicin", "Gentamicin"]]) {
    check(`حارس: حساسيةُ «${a}» تمسك ${id}`, !!F.allergyHit(byId(id), a));
  }
});

/* ── ٢٠) موادُّ الخليط الواحد تتعارض فيما بينها ───────────────────────────────── */
await section("▸ ٢٠) «ميلوكسيكام وديكساميثازون» بصفٍّ واحد كصفّين: «NSAID مع كورتيزون» يوقف", async () => {
  for (const [name, species, pair] of [["ميلوكسيكام وديكساميثازون", "dog", "meloxicam:pair-dexamethasone"], ["Meloxicam + Dexamethasone", "dog", "meloxicam:pair-dexamethasone"],
    ["Meloxicam + Ketoprofen", "cat", "meloxicam:pair-ketoprofen"], ["Gentamicin + Furosemide", "dog", "gentamicin:pair-furosemide"]]) {
    const a = mixSafety(name, { species });
    check(`«${name}» ⇒ ${pair}، مرّةً واحدةً بالصفّ`, a.some((x) => x.id === pair) && a.filter((x) => /:pair-/.test(x.id)).length === 1, a.map((x) => x.id).join(","));
  }
  const crit = mixSafety("ميلوكسيكام وديكساميثازون", { species: "dog" }).find((x) => /:pair-/.test(x.id));
  check("  والتعارضُ حرجٌ يوقف (كصفّين)", crit?.tone === "critical" && crit?.blocking === true, JSON.stringify(crit));
  const c = await cardAlerts("ميلوكسيكام وديكساميثازون", "dog");
  check("  وبطاقتُه بالخطة ترسمه", c.includes("meloxicam:pair-dexamethasone"), c.join(","));
  const loc = mixSafety("Dexamethasone + Gentamicin eye drops", { species: "dog" });
  check("حارس: قطرةُ عينٍ بمادّتين لا تعارضَ بينهما بالدم", !loc.some((x) => /pair-/.test(x.id)), loc.map((x) => x.id).join(","));
  const ag = mixSafety("Amoxicillin + Gentamicin", { species: "dog" });
  check("حارس: «Amoxicillin + Gentamicin» لا تعارضَ مخترَع", !ag.some((x) => /pair-|dup-/.test(x.id)), ag.map((x) => x.id).join(","));
});

/* ── ٢١) المنتقي يقرأ الاسمَ مرّة ───────────────────────────────────────────── */
await section("▸ ٢١) buildMedIndex يقرأ كلَّ اسمٍ مرّةً واحدة (كان ثلاثاً: الدليل، ثم المنع، ثم البحث)", () => {
  if (typeof F.nameReadCount !== "function") { check("nameReadCount: عدّادُ قراءات الأسماء مُصدَّر", false, "∅ لا nameReadCount"); return; }
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: `q${i}`, name: `Clinic mix ${i} + Vitamin C`, family: "other", in_mine: true, pos: i, archived_at: null, created_at: NOW2, updated_at: NOW2 }));
  const stock = Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, name: `Stock ${i} صنف`, stock: 2 }));
  const r0 = F.nameReadCount();
  const t0 = performance.now();
  I.buildMedIndex({ catalog: [], rows, stock, species: "cat" });
  const t1 = performance.now();
  const first = F.nameReadCount() - r0;
  check(`أوّلُ بناء: ${first} قراءة لـ٣٠٠ اسمٍ جديد (اسمٌ = قراءة)`, first === 300, String(first));
  const r1 = F.nameReadCount();
  I.buildMedIndex({ catalog: [], rows, stock, species: "dog" });
  check("  وإعادةُ البناء لنوعٍ آخر لا تقرأ اسماً من جديد", F.nameReadCount() - r1 === 0, String(F.nameReadCount() - r1));
  console.log(`     (أوّلُ بناء ${(t1 - t0).toFixed(1)} ms)`);
});

console.log(fails ? `\n✗ med-match-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ med-match-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
