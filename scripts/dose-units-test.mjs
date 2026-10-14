/* ============================================================================
 * منتقي الجرعة — الوحداتُ والسلالمُ والنصُّ المحفوظ (قرارُ المالك D5/D5+، ١٤/١٠).
 *
 * ── الجذرُ المقيس ─────────────────────────────────────────────────────────
 *  ١) خانةُ الجرعة نصٌّ حرّ: «1 ml» و«1 مل» و«1مل» ثلاثةُ صفوفٍ بالطبلة لأمرٍ واحد، و«½ حبة»
 *     و«نص حبة» و«1 و½ حبة» ثلاثُ كتابات لكمّيةٍ واحدة.
 *  ٢) الوحدةُ لا تتبع الطريق: «حبة» وريدية تُكتب بلا اعتراض، وتغييرُ الطريق لا يمسح الرقم.
 *  ٣) أزرارُ البطاقة تسعُ كمّياتٍ (¼…10) وسبعُ وحدات — و٥٩ جرعة مل تحت ٠٫١ بالإنتاج بلا زرّ.
 *
 * يقود `doseUnits.ts` و`flowsheet.ts` الحقيقيّين، ويقرأ نصَّ المضيفين الأربعة.
 *
 *   node scripts/dose-units-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};
const STUBS = { "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };" };
const load = async (contents) => {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^@\/i18n$/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "dose-units-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};
const src = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const bodyOf = (text, head) => {
  const i = text.indexOf(head);
  if (i < 0) return "";
  const m = /\)\s*(?:=>\s*)?\{/.exec(text.slice(i));
  if (!m) return "";
  let depth = 0, started = false;
  for (let j = i + m.index + m[0].length - 1; j < text.length; j++) {
    const c = text[j];
    if (c === "{") { depth++; started = true; } else if (c === "}") { depth--; if (started && depth === 0) return text.slice(i, j + 1); }
  }
  return text.slice(i);
};

const D = existsSync("src/lib/doseUnits.ts") ? await load(`export * from "./src/lib/doseUnits.ts";`) : {};

await section("▸ ١) الطريقُ يحدّد الوحدات، والافتراضيُّ أوّلاً", async () => {
  const want = {
    po: ["tab", "cap", "ml", "drop", "sachet"], iv: ["ml", "iu"], im: ["ml", "iu"], sc: ["ml", "iu"],
    ocular: ["drop", "cm"], otic: ["drop", "ml"], topical: ["app", "puff", "tube"], nasal: ["drop", "puff"],
    rectal: ["supp", "ml"], inhaled: ["puff", "ml"], water: ["mlL", "gL"],
  };
  check("أحدَ عشرَ طريقاً بترتيب الطبلة", JSON.stringify(D.DOSE_ROUTES) === JSON.stringify(["iv", "im", "sc", "po", "topical", "inhaled", "ocular", "otic", "nasal", "rectal", "water"]));
  for (const [r, units] of Object.entries(want)) check(`${r} ⇒ ${units.join("/")}`, JSON.stringify(D.unitsFor(r, "Meloxicam")) === JSON.stringify(units), JSON.stringify(D.unitsFor(r, "Meloxicam")));
  check("كلُّ افتراضيٍّ بقائمة طريقه", Object.keys(want).every((r) => D.unitsFor(r).includes(D.defaultUnit(r))));
  for (const n of ["Insulin", "إنسولين", "انسولين", "Insulin glargine"]) {
    check(`«${n}» تحت الجلد/وريدي/عضلي ⇒ وحدة دولية أوّلاً`, ["sc", "iv", "im"].every((r) => D.defaultUnit(r, n) === "iu"));
  }
  check("  وغيرُ الإنسولين ⇒ مل", D.defaultUnit("sc", "Ceftriaxone") === "ml");
  check("طريقُ المعالج ⇒ طريقُ الطبلة (oral⇒po…)، و«عين / أذن» ⇒ null بقطرة/سم/مل", D.planRouteToDose("oral") === "po" && D.planRouteToDose("im") === "im" && D.planRouteToDose("eye_ear") === null && JSON.stringify(D.EYE_EAR_UNITS) === JSON.stringify(["drop", "cm", "ml"]));
});

await section("▸ ٢) السلالم: كلُّ درجةٍ زرّ، بلا ضجيجٍ عشريّ", async () => {
  const L = (u, sp) => D.laddersFor(u, sp);
  const ml = L("ml", "cat");
  const range = (a, b, s) => { const o = []; for (let i = Math.round(a * 100); i <= Math.round(b * 100); i += Math.round(s * 100)) o.push(i / 100); return o; };
  check("مل: خمسةُ تبويبات (0.01–0.1، 0.1–1، 1–5، 5–10، 10–60)", ml.map((x) => x.label).join(",") === "0.01–0.1,0.1–1,1–5,5–10,10–60", ml.map((x) => x.label).join(","));
  check("  0.01…0.10 بخطوة 0.01 (10)", JSON.stringify(ml[0].values) === JSON.stringify(range(0.01, 0.1, 0.01)) && ml[0].values.length === 10);
  check("  0.10…1.00 بخطوة 0.05 (19)", JSON.stringify(ml[1].values) === JSON.stringify(range(0.1, 1, 0.05)) && ml[1].values.length === 19);
  check("  1.0…5.0 بخطوة 0.1 (41)", JSON.stringify(ml[2].values) === JSON.stringify(range(1, 5, 0.1)) && ml[2].values.length === 41);
  check("  5…10 بخطوة 0.5 (11)", JSON.stringify(ml[3].values) === JSON.stringify(range(5, 10, 0.5)) && ml[3].values.length === 11);
  check("  10…30 بخطوة 1 ثم 35…60 بخمسة (27)", JSON.stringify(ml[4].values) === JSON.stringify([...range(10, 30, 1), 35, 40, 45, 50, 55, 60]) && ml[4].values.length === 27);
  check("  و«60+» للخيل والأبقار وحدها", L("ml", "horse").at(-1).label === "60+" && L("ml", "cow").at(-1).values.join(",") === "70,80,90,100,120,150,200,250,300,400,500" && !L("ml", "dog").some((x) => x.label === "60+"));
  const tab = L("tab");
  check("حبة: «¼–2» أرباعاً (8) و«2–10» أنصافاً (17)", tab.map((x) => x.label).join(",") === "¼–2,2–10" && tab[0].values.join(",") === "0.25,0.5,0.75,1,1.25,1.5,1.75,2" && tab[1].values.length === 17 && tab[1].values[0] === 2 && tab[1].values.at(-1) === 10);
  check("كيس مثلُ الحبة", JSON.stringify(L("sachet")) === JSON.stringify(tab));
  for (const u of ["cap", "drop", "puff", "supp", "app", "tube"]) check(`${u}: 1…20 شبكةٌ واحدة`, L(u).length === 1 && L(u)[0].values.join(",") === range(1, 20, 1).join(","));
  const iu = L("iu");
  check("وحدة دولية: 0.5–5 (10)، 5–10 (11)، 10–25 (16)، 25–50 (26)", iu.map((x) => x.values.length).join(",") === "10,11,16,26" && iu[0].values[0] === 0.5 && iu[3].values.at(-1) === 50);
  check("سم: 0.25…5 (10 درجات)", L("cm")[0].values.join(",") === "0.25,0.5,0.75,1,1.5,2,2.5,3,4,5");
  const w = L("mlL");
  check("ماء الشرب: 0.1–1 (12)، 1–5 (11)، 5–20 (9) — ومثلُه غم/لتر", w.map((x) => x.values.length).join(",") === "12,11,9" && JSON.stringify(L("gL")) === JSON.stringify(w));
  const all = D.DOSE_UNITS.flatMap((u) => L(u, "horse").map((x) => [u, x]));
  check("كلُّ تبويبٍ تصاعديٌّ تماماً", all.every(([, x]) => x.values.every((v, i) => i === 0 || v > x.values[i - 1])));
  check("ولا ضجيجَ عشريّ (0.15 لا 0.15000000000000002)", all.every(([, x]) => x.values.every((v) => String(v).length <= 6)), all.flatMap(([, x]) => x.values).filter((v) => String(v).length > 6).slice(0, 3).join(","));
  check("التسمياتُ بأرقامٍ غربية", all.every(([, x]) => !/[٠-٩]/.test(x.label)));
  check("التبويبُ الأوّل: المثبّتُ أوّلاً، وإلا الأشيع (مل 0.1–1، حبة ¼–2، وحدة 0.5–5)", D.initialTab(ml, "ml", 0.05) === "0.01-0.1" && D.initialTab(ml, "ml", null) === "0.1-1" && D.initialTab(tab, "tab", null) === "0.25-2" && D.initialTab(iu, "iu", null) === "0.5-5" && D.initialTab(ml, "ml", 12) === "10-60" && D.initialTab(ml, "ml", 0.1) === "0.1-1" && D.initialTab(ml, "ml", 1) === "1-5");
});

await section("▸ ٣) النصُّ المحفوظ بكلماته", async () => {
  const F = (qty, unit) => D.formatAmount({ qty, unit });
  const tab = { 0.25: "¼ حبة", 0.5: "½ حبة", 0.75: "¾ حبة", 1: "حبة واحدة", 1.25: "حبة و¼", 1.5: "حبة ونص", 1.75: "حبة و¾", 2: "حبتين", 2.25: "حبتين و¼", 2.5: "حبتين ونص", 3: "3 حبات", 3.5: "3 حبات ونص", 10: "10 حبات", 11: "11 حبة" };
  const bad = Object.entries(tab).filter(([q, w]) => F(Number(q), "tab") !== w).map(([q]) => `${q}⇒${F(Number(q), "tab")}`);
  check("الحبة: ¼ ½ ¾، واحدة، و¼/ونص/و¾، حبتين، 3–10 حبات، 11+ حبة", bad.length === 0, bad.join(" · "));
  check("الكيس: كيس واحد/كيسين/N أكياس/N كيس", [F(1, "sachet"), F(2, "sachet"), F(3, "sachet"), F(11, "sachet")].join("|") === "كيس واحد|كيسين|3 أكياس|11 كيس");
  const words = {
    cap: "كبسولة واحدة|كبسولتين|3 كبسولات|11 كبسولة", drop: "قطرة واحدة|قطرتين|3 قطرات|11 قطرة", puff: "بخّة واحدة|بخّتين|3 بخّات|11 بخّة",
    supp: "تحميلة واحدة|تحميلتين|3 تحميلات|11 تحميلة", app: "تطبيق واحد|تطبيقين|3 تطبيقات|11 تطبيق", tube: "أنبوبة واحدة|أنبوبتين|3 أنابيب|11 أنبوبة",
  };
  for (const [u, w] of Object.entries(words)) check(`${u}: ${w.replace(/\|/g, " / ")}`, [1, 2, 3, 11].map((n) => F(n, u)).join("|") === w, [1, 2, 3, 11].map((n) => F(n, u)).join("|"));
  check("القياس: «0.25 مل»، «2.5 وحدة دولية»، «0.5 سم»، «0.25 مل/لتر»، «1.5 غم/لتر»", [F(0.25, "ml"), F(2.5, "iu"), F(0.5, "cm"), F(0.25, "mlL"), F(1.5, "gL")].join("|") === "0.25 مل|2.5 وحدة دولية|0.5 سم|0.25 مل/لتر|1.5 غم/لتر");
  check("  و«0 مل» مستحيل: بلا كمّية ⇒ نصٌّ فارغ", F(null, "ml") === "" && F(0.05, "ml") === "0.05 مل");
});

await section("▸ ٤) القراءة: كلُّ درجةٍ تعود كما كانت، والقديمُ يُقرأ", async () => {
  const misses = [];
  for (const u of D.DOSE_UNITS) for (const x of D.laddersFor(u, "horse")) for (const v of x.values) {
    const p = D.parseAmount(D.formatAmount({ qty: v, unit: u }));
    if (!p || p.unit !== u || Math.abs(p.qty - v) > 1e-9) misses.push(`${u}:${v}⇒${JSON.stringify(p)}`);
  }
  check("parseAmount(formatAmount(v)) = v لكلّ درجةٍ بكلّ وحدة", misses.length === 0, misses.slice(0, 5).join(" · "));
  const legacy = [
    ["1 ml", 1, "ml"], ["1ml", 1, "ml"], ["1 مل", 1, "ml"], ["1مل", 1, "ml"], ["1cc", 1, "ml"], ["½ مل", 0.5, "ml"],
    ["¼ حبة (5 mg)", 0.25, "tab"], ["0.06 مل (0.3 mg)", 0.06, "ml"], ["1 و½ حبة", 1.5, "tab"], ["2 حبة", 2, "tab"], ["نص حبة", 0.5, "tab"],
    ["حبتين", 2, "tab"], ["قطرتين", 2, "drop"], ["١٫٥ مل", 1.5, "ml"], ["½ قرص", 0.5, "tab"], ["3 قطرات", 3, "drop"], ["2 وحدة دولية", 2, "iu"],
  ];
  for (const [t, q, u] of legacy) { const p = D.parseAmount(t); check(`«${t}» ⇒ ${q} ${u}`, !!p && p.qty === q && p.unit === u, JSON.stringify(p)); }
  check("«ملعقة شاي» ⇒ null (يبقى نصّاً)", D.parseAmount("ملعقة شاي") === null && D.parseAmount("") === null);
  check("amountKey: «1 ml» و«1 مل» و«1مل» مفتاحٌ واحد، والغامضُ نفسُه", D.amountKey("1 ml") === D.amountKey("1 مل") && D.amountKey("1مل") === "1|ml" && D.amountKey(" ملعقة شاي ") === "ملعقة شاي");
});

await section("▸ ٥) تبديلُ الطريق يمسح الرقمَ إلا بين الحقن", async () => {
  const v = (route, unit, qty) => ({ route, unit, qty });
  const a = D.switchRoute(v("im", "ml", 0.25), "sc", "Ceftriaxone");
  check("عضلي ⇒ تحت الجلد: الرقمُ يبقى بلا تنبيه", a.value.qty === 0.25 && a.value.unit === "ml" && a.changed === null);
  const b = D.switchRoute(v("po", "ml", 2), "iv", "Ceftriaxone");
  check("فموي مل ⇒ وريدي: الرقمُ يُمسح (تغييرُ شكل)", b.value.qty === null && b.value.unit === "ml" && b.changed?.kind === "form" && b.changed.from === "po" && b.changed.to === "iv");
  const c = D.switchRoute(v("po", "tab", 1.5), "iv", "Ceftriaxone");
  check("فموي حبة ⇒ وريدي: الوحدةُ مل والرقمُ يُمسح (تغييرُ وحدة)", c.value.qty === null && c.value.unit === "ml" && c.changed?.kind === "unit" && c.changed.from === "tab" && c.changed.to === "ml");
  const f = D.switchRoute(v("sc", "ml", 0.05), "po", "Meloxicam");
  check("تحت الجلد مل ⇒ فموي: حبة (افتراضيُّ الفموي) والرقمُ يُمسح ويُقال «تغيّرت الوحدة»", f.value.unit === "tab" && f.value.qty === null && f.changed?.kind === "unit" && f.changed.from === "ml" && f.changed.to === "tab");
  const d = D.switchRoute(v("ocular", "drop", 2), "otic", "x");
  check("عين ⇒ أذن: قطرةٌ والرقمُ يُمسح", d.value.unit === "drop" && d.value.qty === null && d.changed?.kind === "form");
  const e = D.switchRoute(v(null, "ml", 0.3), "im", "x");
  check("أوّلُ طريق: المحسوبةُ تبقى إن سُمحت وحدتُها", e.value.qty === 0.3 && e.value.unit === "ml" && e.changed === null);
  check("وحدةٌ بيد تمسح الرقم", D.pickUnit(v("po", "tab", 1), "cap").qty === null && D.pickUnit(v("po", "tab", 1), "tab").qty === 1);
});

await section("▸ ٦) الكتابةُ باليد تُفحص بالوحدة", async () => {
  check("0.3 حبة ⇒ quarter", D.validQty("tab", 0.3)?.code === "quarter");
  check("1.5 قطرة ⇒ whole", D.validQty("drop", 1.5)?.code === "whole");
  check("0.75 وحدة دولية ⇒ half", D.validQty("iu", 0.75)?.code === "half");
  check("مل: 0.001…100 (1000 للخيل)، ثلاثُ خاناتٍ عشرية", D.validQty("ml", 0.005) === null && D.validQty("ml", 0.0005)?.code === "range" && D.validQty("ml", 150)?.code === "range" && D.validQty("ml", 150, "horse") === null && D.validQty("ml", 1.2345)?.code === "range");
  check("حبة ¼…20، وعددٌ صحيح 1…50، وماء 0.01…50", D.validQty("tab", 20) === null && D.validQty("tab", 20.25)?.code === "range" && D.validQty("drop", 51)?.code === "range" && D.validQty("gL", 0.01) === null && D.validQty("gL", 50.5)?.code === "range");
});

await section("▸ ٧) الطبلة: «1 ml» و«1 مل» و«1مل» صفٌّ واحد", async () => {
  const F = await load(`export { buildRows, routeShort } from "./src/lib/flowsheet.ts";`);
  const e = (id, amount, time) => ({ id, pet_id: "p", day: "2026-10-14", time, medication: "Meloxicam", amount, task_type: "drug", route: "sc", created_at: "" });
  const rows = F.buildRows([e("a", "1 ml", "08:00"), e("b", "1 مل", "14:00"), e("c", "1مل", "20:00"), e("d", "0.5 مل", "08:00")]);
  check("ثلاثُ كتاباتٍ لكمّيةٍ واحدة ⇒ صفٌّ واحد بثلاث خانات، و«0.5 مل» صفٌّ ثانٍ", rows.length === 2 && rows.find((r) => r.amount === "1 ml")?.all.length === 3, rows.map((r) => `${r.amount}:${r.all.length}`).join(","));
  check("  والمعروضُ نصُّ أوّل صفّ", rows.some((r) => r.amount === "1 ml"));
  check("والطرقُ الجديدة باختصارها (عين، شرج، ماء)", F.routeShort("ocular") === "عين" && F.routeShort("rectal") === "شرج" && F.routeShort("water") === "ماء");
});

await section("▸ ٨) المضيفون الأربعة يكتبون بالمنتقي، والطريقُ يُكتب", async () => {
  const visit = src("src/pages/VisitPage.tsx");
  const flow = src("src/components/Flowsheet.tsx");
  const card = src("src/components/treatment/DrugCard.tsx");
  check("نافذةُ «إضافة دواء» ترسم <DosePicker", /<DosePicker/.test(bodyOf(visit, "function AddDrugModal(")));
  check("نافذةُ التعديل ترسم <DosePicker، والنصُّ القديم يُقال ويبقى (vbk.doseKeep)", /<DosePicker/.test(bodyOf(visit, "function EditDrugModal(")) && /vbk\.doseKeep/.test(bodyOf(visit, "function EditDrugModal(")));
  check("ورقةُ الطبلة ترسم <DosePicker للدواء", /<DosePicker/.test(bodyOf(flow, "export function AddTaskSheet(")) && /type === "drug" \? \(/.test(bodyOf(flow, "export function AddTaskSheet(")));
  check("  والمحسوبةُ تدخل المنتقي (parseAmount(taskAmountText(c))) وتُثبَّت بطريقها، ولا تُكتب خفيّةً (لا setAmount(taskAmountText))",
    /parseAmount\(taskAmountText\(c\)\)/.test(flow) && /kind: "calc" as const, route: r/.test(flow) && !/setAmount\(taskAmountText\(/.test(flow));
  check("  والورقةُ تحفظ للدواء ما يقوله المنتقي (formatAmount(dose)) وطريقَه", /amount: type === "drug" \? formatAmount\(dose\)/.test(flow) && /route: type === "drug" \? \(dose\.route \?\? null\)/.test(flow));
  check("بطاقةُ الدواء: المنتقي بطريقها المقفول، ولا QTYS ولا UNIT_KEYS", /<DosePicker[^>]*routeLocked/.test(card) && !/\bQTYS\b/.test(card) && !/\bUNIT_KEYS\b/.test(card));
  check("  وتغييرُ طريقها يمرّ من switchRoute (cardRouteChange)", /cardRouteChange\(/.test(card) && /export function cardRouteChange[\s\S]{0,1200}switchRoute\(/.test(src("src/lib/doseUnits.ts")));
  check("addDrug يكتب الطريق", /route: d\.route \?\? null/.test(bodyOf(visit, "const addDrug = async (")));
  check("editDrug يكتب الطريقَ والكميةَ حين تغيّرا", /patch\.route !== undefined \? \{ route: patch\.route \}/.test(bodyOf(visit, "const editDrug = async (")) && /patch\.amount !== undefined/.test(bodyOf(visit, "const editDrug = async (")));
  check("savePlan يكتب الطريق (route: m.route ?? null)", /route: m\.route \?\? null/.test(bodyOf(visit, "const savePlan = async (")));
  check("  والمعالجُ يحمله بالسجلّ (planRouteToDose)", /route: planRouteToDose\(r\.route\)/.test(src("src/components/TreatmentPlan.tsx")));
  check("الورقةُ تكتب الطريق (route: route || null)", /: \(route \|\| null\)/.test(flow));
  check("repo.ts لا يستورد doseUnits (وزنُ الإقلاع)", !/doseUnits/.test(readFileSync("src/lib/repo.ts", "utf8")));
  check("آخرُ جرعةٍ قراءةٌ ترمي، بمرآة، ومسموحةٌ بالقراءة فقط — ولهذا المريض وحده (pet_id)", /async lastDoseOf\(name, petId\)[\s\S]{0,600}listOrThrow<[\s\S]{0,200}\.eq\("pet_id", petId\)/.test(readFileSync("src/lib/repo.ts", "utf8")) && /"lastDoseOf"/.test(readFileSync("src/lib/repo.ts", "utf8"))
    && /async lastDoseOf\(name: string, petId: string\)[\s\S]{0,300}t\.pet_id === petId/.test(readFileSync("src/lib/repoDemo.ts", "utf8")));
});

await section("▸ ٩) المنتقي نفسُه", async () => {
  const dp = src("src/components/treatment/DosePicker.tsx");
  check("الشبكة grid-cols-5 sm:grid-cols-8 وأزرارُها ≥48px وأرقامُها bdi", /grid-cols-5[^"]*sm:grid-cols-8/.test(dp) && /min-h-\[48px\]/.test(dp) && /<bdi dir="ltr">/.test(dp));
  check("التبويباتُ بحاويةٍ تتمرّر وحدها (overflow-x-auto min-w-0)", /min-w-0 overflow-x-auto|overflow-x-auto min-w-0/.test(dp));
  check("«رقم ثاني» بلوحةٍ تفحص بالوحدة (validate)", /validate=\{\(n\) =>/.test(dp) && /validQty\(/.test(dp));
  check("لا autoFocus ولا حقلَ كتابة", !/autoFocus/.test(dp) && !/<input/.test(dp));
  check("«آخر مرة» تُبلَع بسببٍ مكتوب (قيمةٌ افتراضية)", /swallow-ok:/.test(readFileSync("src/components/treatment/DosePicker.tsx", "utf8")));
  check("لا يستورده نموذجُ البيع (MedSaleForm)", !/DosePicker/.test(readFileSync("src/components/retail/MedSaleForm.tsx", "utf8")));
});

await section("▸ ١٠) نافذةُ القلم والبطاقةُ والمثبّت: الرقمُ الممسوح لا يُكتب له طريقٌ جديد", async () => {
  const E = (amount, route, dose) => D.editDosePatch({ amount, route }, dose);
  const v = (route, unit, qty) => ({ route, unit, qty });
  // كلُّ تبديلٍ يمرّ من switchRoute كما بالمنتقي — ثم ما يُكتب.
  const tap = (amount, route, next) => { const p = D.parseAmount(amount); return E(amount, route, D.switchRoute(v(route, p?.unit ?? null, p?.qty ?? null), next, "x").value); };
  check("«حبة واحدة» فموي ⇒ وريدي ⇒ حفظ: ممنوع حتى تُختار الكمية (كان {route:iv} فوق «حبة واحدة»)", tap("حبة واحدة", "po", "iv").ok === false, JSON.stringify(tap("حبة واحدة", "po", "iv")));
  check("«2 مل» فموي ⇒ وريدي: ممنوع (لا تحويلَ بين شكلين)", tap("2 مل", "po", "iv").ok === false);
  check("«0.5 مل» تحت الجلد ⇒ فموي: ممنوع", tap("0.5 مل", "sc", "po").ok === false);
  check("«0.1 مل» تحت الجلد ⇒ فموي (tx_t12): ممنوع", tap("0.1 مل", "sc", "po").ok === false);
  check("«حبة واحدة» بلا طريق ⇒ وريدي، و«0.5 مل» بلا طريق ⇒ عين: ممنوعان", tap("حبة واحدة", null, "iv").ok === false && tap("0.5 مل", null, "ocular").ok === false);
  check("نصٌّ قديم «ملعقة شاي» فموي ⇒ وريدي: ممنوع (يبقى النصُّ ويتبدّل الطريق)", E("ملعقة شاي", "po", v("iv", "ml", null)).ok === false);
  check("وحدةٌ بيدٍ بلا كمية (حبة ⇒ كبسولة): ممنوع — كان «تعدّلت ١ جرعة» ولا شيء", E("حبة واحدة", "po", D.pickUnit(v("po", "tab", 1), "cap")).ok === false);
  const inj = tap("0.25 مل", "im", "sc");
  check("عضلي ⇒ تحت الجلد: الرقمُ باقٍ والطريقُ وحده يُكتب", inj.ok && inj.route === "sc" && inj.amount === undefined, JSON.stringify(inj));
  const picked = E("حبة واحدة", "po", v("iv", "ml", 2));
  check("اختيارُ كميةٍ بعد التبديل ⇒ الكميةُ والطريقُ معاً", picked.ok && picked.amount === "2 مل" && picked.route === "iv", JSON.stringify(picked));
  check("تعديلُ الوقت وحده على «0.23 مل (11.5 mg)» ⇒ لا يُكتب فوقه «0.23 مل»", JSON.stringify(E("0.23 مل (11.5 mg)", "sc", v("sc", "ml", 0.23))) === '{"ok":true}');
  check("  ولا على «¼ حبة (5 mg)» بلا طريق، ولا «1 و½ حبة (30 mg)»", JSON.stringify(E("¼ حبة (5 mg)", null, v(null, "tab", 0.25))) === '{"ok":true}' && JSON.stringify(E("1 و½ حبة (30 mg)", "po", v("po", "tab", 1.5))) === '{"ok":true}');
  check("  وكميةٌ جديدة تُكتب (والملغ القديم يذهب معها)", E("0.23 مل (11.5 mg)", "sc", v("sc", "ml", 0.3)).amount === "0.3 مل");
  check("نصٌّ قديمٌ بلا مسّ ⇒ لا شيء يُكتب", JSON.stringify(E("ملعقة شاي", "po", v("po", null, null))) === '{"ok":true}');
  check("سطرُ «الجرعة الحالية» حين لا يرسمها المنتقي كما هي: بلا طريق، بملاحظة ملغ، قديمٌ لا يُفهم",
    !D.pickerShowsAmount("0.23 مل (11.5 mg)", "sc") && !D.pickerShowsAmount("0.25 مل", null) && !D.pickerShowsAmount("ملعقة شاي", "po") && D.pickerShowsAmount("0.25 مل", "sc") && D.pickerShowsAmount("", "po"));

  const C = (route, dose, next) => D.cardRouteChange({ route, dose, name: "x" }, next, true);
  check("البطاقة: إطفاءُ «فموي» على «2 مل» يمسح الرقم (كان يبقى فيصير وريدياً بالضغطة التالية)", C("oral", "2 مل", undefined).dose === "" && C("oral", "2 مل", undefined).route === undefined);
  check("  فموي ⇒ وريدي مباشرةً يمسحه، وعضلي ⇒ تحت الجلد يُبقيه", C("oral", "2 مل", "iv").dose === "" && C("im", "0.5 مل", "sc").dose === undefined);
  check("  وجرعةٌ محسوبة (لا يدوية) لا يمسّها الطريق", JSON.stringify(D.cardRouteChange({ route: "oral", dose: "", name: "x" }, "iv", false)) === '{"route":"iv"}');
  check("الجرعةُ اليدوية لا تقلب عيارَ الحبّة سائلاً (لا solid بالرقعة)", !("solid" in D.manualDosePatch(v("po", "ml", 0.5))) && D.manualDosePatch(v("po", "ml", 0.5)).dose === "0.5 مل");
  check("بماء الشرب بالمعالج ⇒ طريقُ الطبلة water (مل/لتر، غم/لتر)", D.planRouteToDose("water") === "water" && D.unitsFor("water").join(",") === "mlL,gL");

  const pin = (route, kind = "calc") => ({ qty: 0.26, unit: "ml", kind, route });
  check("المحسوبةُ بطريقها: فموي تحت «فموي» نعم، وتحت «تحت الجلد» لا", D.pinFits(pin("po"), ["po"], D.unitsFor("po")) && !D.pinFits(pin("po"), ["sc"], D.unitsFor("sc")));
  check("  والمحسوبةُ بلا طريقٍ معروف لا تُعرض، و«آخر مرة» القديمةُ بلا طريق تُعرض بوحدةٍ مسموحة", !D.pinFits(pin(null), ["sc"], D.unitsFor("sc")) && D.pinFits(pin(null, "last"), ["sc"], D.unitsFor("sc")));
  const rows = [{ amount: "2 مل", route: "po" }, { amount: "0.5 مل", route: "iv" }, { amount: "حبة واحدة", route: null }];
  check("«آخر مرة» لهذا الطريق: وريدي ⇒ 0.5 مل (لا 2 مل الفموية)، فموي ⇒ 2 مل", D.lastFor(rows, ["iv"], D.unitsFor("iv"))?.qty === 0.5 && D.lastFor(rows, ["po"], D.unitsFor("po"))?.qty === 2);
});

/* ── المكوّناتُ نفسُها بلا متصفّح (react-mini-host): الطفراتُ داخل المكوّن تُمسك هنا لا بالنصّ ── */
await section("▸ ١١) المنتقي والبطاقة يُرسمان ويُضغطان", async () => {
  const { loadUI } = await import("./react-mini.mjs");
  const UI = await loadUI(`
    import { useState, createElement as h } from "react";
    import { DosePicker } from "./src/components/treatment/DosePicker.tsx";
    import { DrugCard } from "./src/components/treatment/DrugCard.tsx";
    export function PickerH(p) { const [v, setV] = useState(p.initial); globalThis.__v = v; return h(DosePicker, { ...p, value: v, onChange: setV }); }
    export function CardH(p) { const [r, setR] = useState(p.initial); globalThis.__row = r; return h(DrugCard, { ...p, row: r, open: true, onToggle() {}, onRemove() {}, onReplace() {}, onNeedWeight() {}, onPatch: (x) => setR((o) => ({ ...o, ...x })) }); }
  `, {
    "@/lib/repo": "export const repo = { lastDoseOf: (n, p) => { (globalThis.__lastCalls ||= []).push([n, p]); return Promise.resolve(globalThis.__lastRows || []); } };",
    "./NumberPadSheet": "export const NumberPadSheet = () => null;",
    "@/lib/flowsheet": "export const routeName = (r) => r;",
    "@/components/DoseBlock": "export const DoseAlertRow = () => null;",
  });
  const h = UI.React.createElement;
  const picker = async (props) => { const ui = UI.mount(h(UI.PickerH, { drugName: "Meloxicam", ...props })); await ui.settle(); return ui; };

  let ui = await picker({ initial: { route: "po", unit: "ml", qty: 2 } });
  ui.click(ui.find("data-dose-route", "iv"));
  check("المنتقي: فموي «2 مل» ⇒ وريدي يمسح الرقم", globalThis.__v.route === "iv" && globalThis.__v.qty === null, JSON.stringify(globalThis.__v));
  ui = await picker({ initial: { route: "po", unit: "tab", qty: 1 } });
  ui.click(ui.find("data-dose-unit", "cap"));
  check("  ورقاقةُ وحدةٍ ثانية (حبة ⇒ كبسولة) تمسحه", globalThis.__v.unit === "cap" && globalThis.__v.qty === null, JSON.stringify(globalThis.__v));
  ui = await picker({ initial: { route: "im", unit: "ml", qty: 0.25 } });
  ui.click(ui.find("data-dose-route", "sc"));
  check("  وعضلي ⇒ تحت الجلد يُبقيه", globalThis.__v.route === "sc" && globalThis.__v.qty === 0.25);

  ui = await picker({ initial: { route: "po", unit: "ml", qty: 0.26 }, pinned: { qty: 0.26, unit: "ml", kind: "calc", route: "po" } });
  check("«المحسوبة» ظاهرةٌ بطريقها (فموي)", !!ui.find("data-dose-pin", "calc"));
  ui.click(ui.find("data-dose-route", "sc"));
  check("  وتختفي تحت «تحت الجلد» (كانت أوّلَ زرٍّ: 0.26 مل بعيار الفموي)", !ui.find("data-dose-pin"), ui.find("data-dose-pin") ? "ظاهرة" : "");

  globalThis.__lastCalls = []; globalThis.__lastRows = [{ amount: "2 مل", route: "po" }];
  ui = await picker({ initial: { route: "iv", unit: "ml", qty: null } });
  check("«آخر مرة» بلا مريض: لا سؤال ولا زرّ (كانت آخرَ جرعةٍ بالعيادة لأيّ حيوان)", globalThis.__lastCalls.length === 0 && !ui.find("data-dose-pin"));
  ui = await picker({ initial: { route: "iv", unit: "ml", qty: null }, petId: "pet-1" });
  check("  بالمريض: تُسأل بالحيوان", JSON.stringify(globalThis.__lastCalls.at(-1)) === '["Meloxicam","pet-1"]', JSON.stringify(globalThis.__lastCalls));
  check("  و«2 مل» الفموية لا تُعرض تحت «وريدي»", !ui.find("data-dose-pin"));
  ui.click(ui.find("data-dose-route", "po"));
  await ui.settle();
  check("  وتُعرض تحت «فموي»", ui.find("data-dose-pin", "last") && ui.text(ui.find("data-dose-pin", "last")).includes("2 مل"));
  globalThis.__lastRows = [];

  const ROUTES = [["oral", "فموي"], ["sc", "تحت الجلد"], ["im", "عضلي"], ["iv", "وريدي"], ["topical", "موضعي"], ["eye_ear", "عين / أذن"], ["water", "بماء الشرب"]].map(([id, label]) => ({ id, key: `r.${id}`, label }));
  const FREQS = [{ id: "1", key: "f1", label: "مرة يومياً", perDay: 1 }];
  const card = async (row, extra = {}) => { const u = UI.mount(h(UI.CardH, { initial: { id: "r1", freq: "1", days: 3, ...row }, species: "cat", concurrent: [], planDays: 3, routes: ROUTES, freqs: FREQS, ...extra })); await u.settle(); return u; };
  const btn = (u, label) => u.all().find((n) => n.type === "button" && u.text(n).trim() === label);
  /** رقاقةُ الطريق داخل مجموعتها (data-routegroup) — لا كلمةُ الجملة فوقها بنفس الاسم. */
  const route = (u, label) => { const g = u.find("data-routegroup"); const walk = (n) => (n.type === "button" && u.text(n).trim() === label ? n : n.children.map(walk).find(Boolean)); return g ? walk(g) : null; };
  let c = await card({ name: "Amoxicillin", route: "oral", doseMode: "manual", dose: "2 مل" });
  c.click(route(c, "فموي"));
  c.click(route(c, "وريدي"));
  check("البطاقة: «2 مل» فموي ⇒ إطفاء ⇒ وريدي: الرقمُ ممسوح (كان «2 مل» وريدياً)", globalThis.__row.route === "iv" && globalThis.__row.dose === "", JSON.stringify({ r: globalThis.__row.route, d: globalThis.__row.dose }));
  c = await card({ name: "Amoxicillin", route: "oral", doseMode: "manual", dose: "2 مل" });
  c.click(route(c, "وريدي"));
  check("  وفموي ⇒ وريدي مباشرةً كذلك", globalThis.__row.dose === "");
  c = await card({ name: "Prednisolone", route: "oral", doseMode: "weight", dose: "", mgPerKg: 0.5, strength: 5, strengthConfirmed: true, solid: true }, { weight: 4 });
  check("  بريدنيزولون ٤ كغ بالوزن ⇒ «½ حبة»", c.text().includes("½ حبة"), c.text().slice(0, 80));
  c.click(btn(c, "جرعة يدوية"));
  c.click(c.find("data-dose-unit", "ml"));
  await c.settle();   // تبويبُ السلّم يُفتح بأثرٍ بعد الرسم (0.1–1)
  c.click(c.find("data-dose-val", "0.5"));
  c.click(btn(c, "احسبها بالوزن"));
  check("  يدويّاً «مل» ثم «احسبها بالوزن» ⇒ الحبّةُ حبّة (كان «0.4 مل (2 mg)» من عيار الحبّة)", globalThis.__row.solid !== false && c.text().includes("½ حبة") && !/0\.4\s*مل/.test(c.text()), JSON.stringify({ solid: globalThis.__row.solid, dose: globalThis.__row.dose }));
  c = await card({ name: "Enrofloxacin", route: "water", doseMode: "manual", dose: "" }, { species: "bird" });
  check("  «بماء الشرب» بالبطاقة ⇒ مل/لتر وغم/لتر", !!c.find("data-dose-unit", "mlL") && !!c.find("data-dose-unit", "gL") && !!route(c, "بماء الشرب"));
});

await section("▸ ١٢) المضيفون يمرّون من القواعد", async () => {
  const visit = src("src/pages/VisitPage.tsx");
  const edit = bodyOf(visit, "function EditDrugModal(");
  check("نافذةُ القلم: ما يُكتب من editDosePatch، والحفظُ مقفولٌ ورقمُه ممسوح", /const dosePatch = editDosePatch\(/.test(edit) && /!dosePatch\.ok/.test(edit) && /const \{ amount, route \} = dosePatch;/.test(edit) && !/text !== \(entry\.amount/.test(edit));
  check("  وسطرُ «الجرعة الحالية» بـpickerShowsAmount، و«آخر مرة» للمريض", /pickerShowsAmount\(entry\.amount, entry\.route/.test(edit) && /<DosePicker[^>]*petId=\{entry\.pet_id\}/.test(edit));
  check("«إضافة دواء» ترسل المريض للمنتقي", /<DosePicker[^>]*petId=\{petId\}/.test(bodyOf(visit, "function AddDrugModal(")) && /<AddDrugModal[^>]*petId=\{pet\.id\}/.test(visit));
  const card = src("src/components/treatment/DrugCard.tsx");
  check("البطاقة: الطريقُ من cardRouteChange والجرعةُ من manualDosePatch (لا solid)", /cardRouteChange\(/.test(card) && /onPatch\(manualDosePatch\(v\)\)/.test(card) && !/solid: false/.test(card));
  check("  والمعالجُ يمرّر المريض، وطرقُه فيها «بماء الشرب»", /<DrugCard[\s\S]{0,200}petId=\{petId\}/.test(src("src/components/TreatmentPlan.tsx")) && /\{ id: "water", key: "flow\.route\.water"/.test(src("src/components/TreatmentPlan.tsx")));
  check("ورقةُ الطبلة: المريضُ للمنتقي، والطبلاتُ تمرّره", /<DosePicker[^>]*petId=\{petId\}/.test(src("src/components/Flowsheet.tsx")) && /<AddTaskSheet[\s\S]{0,200}petId=\{addFor\}/.test(src("src/pages/Charts.tsx")));
});

console.log(`\n${fails ? "✗" : "✓"} dose-units-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
