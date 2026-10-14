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
 *   node scripts/med-match-test.mjs
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
  check("الفواصل: «+» بفراغٍ وبلاه، و«&»، وكلمة «and» — لا «-» ولا «/»",
    F.ingredientParts?.("a + b").length === 2 && F.ingredientParts?.("Derma paste+zinc").length === 2 && F.ingredientParts?.("Vitamins Mineral & Probiotic").length === 2
    && F.ingredientParts?.("vitamin c and b2").length === 2 && F.ingredientParts?.("Amoxicillin-Clavulanate").length === 1
    && F.ingredientParts?.("Paracetamol / Acetaminophen").length === 1 && F.ingredientParts?.(BIO_SONE).length === 5,
    F.ingredientParts ? JSON.stringify(F.ingredientParts(BIO_SONE)) : "∅ لا ingredientParts");
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
  check("فحصُ الخطة: الصفوفُ الأخرى بموادّها (flatMap ingredientMonographs)، والخليطُ بـcheckIngredientSafety",
    /\.flatMap\(\(x\) => ingredientMonographs\(x\.name\)\.map\(\(d\) => d\.id\)\)/.test(tp) && /checkIngredientSafety\(\{ ingredients: ingredientMonographs\(r\.name\)/.test(tp) && !/if \(!drug\) continue;/.test(tp));
  const flow = src("src/components/Flowsheet.tsx");
  check("ورقةُ الطبلة: منعُ مادةٍ في الخليط يُقال (bannedIngredient) بسطر data-drugbanned", /bannedIngredient\(med\.name/.test(flow) && /\{bannedWhy && \(\s*<p data-drugbanned/.test(flow));
  const card = src("src/components/treatment/DrugCard.tsx");
  check("البطاقة: checkSafety يأخذ concurrentIds لا الأسماء", !/concurrent, dose/.test(card) && !/flags, concurrent,\n/.test(card) && /concurrent: concurrentIds/.test(card));
});

console.log(fails ? `\n✗ med-match-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ med-match-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
