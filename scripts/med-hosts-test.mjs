/* ============================================================================
 * المنتقي الموحَّد بمضيفيه — ما وجده التدقيقُ العدائيّ بعد «أدويتي»، كلٌّ بجذره.
 *
 * ── لماذا ملفٌّ مستقلّ ──────────────────────────────────────────────────
 * `clinic-drugs-test` يفحص القلبَ (الفهرس والمرآة). وما فلت كان بين القلب ومضيفيه: معرّفُ دليلٍ
 * لا يصل الطبلة، وEnter يشيل، وإفلاتٌ بالفراغ يكتب، ورسالةٌ تحت الورقة، وقائمةٌ فارغةٌ عن فشل،
 * و«استبدال» يصنع توأماً. (وما فلت بالبيع — حيوانٌ ثانٍ يُبتلع و«راجع» يقلب الدواء — بـmed-sale-test
 * §٧.) فكلُّ بندٍ هنا يقود الوحدةَ الحقيقية (بلا نسخة) وإن لزم يقرأ نصَّ المضيف ليُثبت أنه يمرّ منها:
 *  ١) الطبلة: الدليلُ كلُّه يُوصَل (Permethrin بشارة منعه للقطّ)، و«الأخيرة» و«هالمرة بس»
 *     يحملان دليلَهما، والطبلةُ تأخذه من الاسم إن غاب المعرّف — ولا autoFocus بورقتها.
 *  ٢) البروتوكول: المكتوبُ الذي يعرفه الدليل يُضاف من الدليل، وخارجُه بالاسم لا يتجاوز المنعَ بالنوع.
 *  ٣) Enter بالبحث يضيف ولا يشيل؛ والصفُّ المختار بـ«أدويتي» يُرى، و«تم · n» تنقص بالشيل.
 *  ٤) الإفلاتُ خارج الأهداف لا يكتب (dnd-kit الحقيقيّ)، والضغطةُ المطوّلة بلا حركة = اختيار.
 *  ٥) الرسالةُ فوق كلّ ورقة.
 *  ٦) فشلُ المخزن وفشلُ تحديث «أدويتي» يُقالان؛ و«فاضية» لا تُقال عن خطأٍ أو تحميلٍ أو تبدّل.
 *  ٧) «استبدال» بالمعالج لا يصنع صفّين لدواءٍ واحد.
 *
 *   node scripts/med-hosts-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* يُبنى المصدرُ الحقيقيّ بـesbuild. الإعداداتُ والترجمةُ بدائلُ صغيرة: البروتوكولُ يقرأ دوامَ
 * العيادة (افتراضُه بلا دوام) ولا يحتاج القاعدة. */
const STUBS = {
  "@/i18n": "export default { t: (k, o) => (o && o.defaultValue) || k, language: 'ar' };",
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
  const dir = mkdtempSync(join(tmpdir(), "med-hosts-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};
const M = await load([
  `export * as I from "./src/lib/medIndex.ts";`,
  `export { MED_CATALOG } from "./src/lib/medCatalog.ts";`,
  `export { FORMULARY, matchMonograph, isBannedFor } from "./src/lib/vetFormulary.ts";`,
  `export { buildDraft, inflate } from "./src/lib/protocols.ts";`,
  `export * as S from "./src/lib/medSale.ts";`,
  `export { isCustomerBound } from "./src/lib/saleCustomer.ts";`,
].join("\n"));
const { I, S, MED_CATALOG, FORMULARY, matchMonograph, isBannedFor, buildDraft, inflate, isCustomerBound } = M;

/** قسمٌ يُفحص كلُّه: وحدةٌ غائبة أو دالّةٌ ناقصة فشلٌ يُقال بسببه، لا انهيارٌ يُخفي الأقسامَ بعده. */
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};

/** نصُّ المصدر بلا تعليقات — شرحٌ يذكر autoFocus أو pick(results[0]) ليس استعمالاً. */
const src = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));
/** جسمُ دالّةٍ/مكوّنٍ باسمه حتى التالي على مستوى الملفّ. */
const fnBody = (s, name) => {
  const m = new RegExp(`^(?:export\\s+)?(?:const\\s+${name}\\s*=|function\\s+${name}\\s*\\()`, "m").exec(s);
  if (!m) return "";
  const rest = s.slice(m.index + m[0].length);
  const next = /^(?:export\s+)?(?:function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=)/m.exec(rest);
  return rest.slice(0, next ? next.index : undefined);
};

const NOW = "2026-10-10T00:00:00.000Z";
const row = (id, name, o = {}) => ({ id, name, family: "other", in_mine: false, pos: null, archived_at: null, created_at: NOW, updated_at: NOW, ...o });
const mono = (q) => FORMULARY.find((m) => m.en === q);

/* ── ١) الطبلة: الدليلُ يصل ─────────────────────────────────────────────────── */
await section("▸ ١) الطبلة: الدليلُ كلُّه يُوصَل، ودليلُ المختار يصل ولو بلا معرّف", async () => {
  const ix = I.buildMedIndex({ catalog: MED_CATALOG, rows: [], species: "cat", formulary: "all", stockMode: "hide" });
  const only = ["Ibuprofen", "Aspirin", "Permethrin"].map((n) => ix.all.find((x) => x.name === n));
  check("formulary=all: Ibuprofen وAspirin وPermethrin بلاطاتٌ يُوصَل إليها", only.every(Boolean), only.map((x) => x?.name ?? "—").join(","));
  check("  بشارة منعها للقطّ (لا تُختار بلا تحذير)", only.every((x) => x && typeof x.banned === "string" && x.banned.length > 0));
  check("  والكتالوجُ كلُّه باقٍ (ما بلا دليلٍ لا يُحذف كما بوضع «الموثَّق»)", ix.all.length === 123 + 3 && ix.all.some((x) => !x.monographId), String(ix.all.length));
  check("  ووضعُ الافتراض كما هو (١٢٣ بلا الثلاثة)", I.buildMedIndex({ catalog: MED_CATALOG, rows: [], stockMode: "hide" }).all.length === 123);

  const melox = matchMonograph("ميلوكسيكام");
  const rix = I.buildMedIndex({ catalog: MED_CATALOG, rows: [], recent: ["ميلوكسيكام", "ترامادول", "شي ما يعرفه الدليل"], species: "dog", stockMode: "hide" });
  const rc = rix.recent.find((x) => x.name === "ميلوكسيكام");
  check("«الأخيرة» باسمٍ كتبته العيادة تحمل دليلَها (ميلوكسيكام ⇒ meloxicam)", !!melox && rc?.monographId === melox.id && I.pickedFrom(rc, "recent").monographId === melox.id, `${rc?.monographId ?? "—"}`);
  check("  وما لا يعرفه الدليل يبقى بلا دليل (لا ادّعاء)", !rix.recent.find((x) => x.name === "شي ما يعرفه الدليل")?.monographId);
  const perm = mono("Permethrin");
  check("«هالمرة بس» بـPermethrin تحمل دليلَها — فالمنعُ للقطّ يصل", I.freePicked("Permethrin", "other").monographId === perm.id && !!isBannedFor(perm, "cat"));
  check("monographOf: المعرّفُ أوّلاً، وإلا الاسم", I.monographOf({ name: "ميلوكسيكام" })?.id === melox.id
    && I.monographOf({ name: "x", monographId: perm.id })?.id === perm.id && I.monographOf({ name: "شي ثاني" }) === undefined);

  const flow = src("src/components/Flowsheet.tsx");
  const sheet = fnBody(flow, "AddTaskSheet");
  check("الطبلةُ تأخذ الدليلَ بـmonographOf (لا بالمعرّف وحده)", /const mono = monographOf\(m\);/.test(sheet) && !/m\.monographId \? DRUG_BY_ID/.test(sheet));
  check("  ومنتقيها بالدليل كلِّه (formulary=\"all\") — والورقةُ تمرّره لفهرسها", /<MedField[^>]*formulary="all"/.test(sheet)
    && /useMedIndex\(\{[\s\S]*?formulary: p\.formulary[\s\S]*?\}\)/.test(src("src/components/meds/MedPickerSheet.tsx")));
  check("  ولا autoFocus بورقتها: شريحةُ «الحرارة» لا تفتح الكيبورد", sheet.length > 0 && !/\bautoFocus\b/.test(sheet));
});

/* ── ٢) البروتوكول ─────────────────────────────────────────────────────────── */
await section("▸ ٢) البروتوكول: المكتوبُ الذي يعرفه الدليل لا يتجاوز منعَه", async () => {
  const proto = inflate({ id: "custom-x", name: "جرب", indication: "", species: ["cat", "dog"], days: 1,
    steps: [{ kind: "drug", ref: "", label: "Permethrin", amount: "1 ml", perDay: 1 }, { kind: "drug", ref: "", label: "دواء محلّي", amount: "2 ml", perDay: 1 }] });
  const cat = buildDraft(proto, { species: "cat", current_weight_kg: 4 }, "2026-10-10");
  const dog = buildDraft(proto, { species: "dog", current_weight_kg: 20 }, "2026-10-10");
  check("«Permethrin» مكتوبةً حرّاً لا تُدرَج لقطّ (كمنعِها من الدليل)", !cat.some((r) => r.medication === "Permethrin"), cat.map((r) => r.medication).join(","));
  check("  وتُدرَج لكلبٍ بكميته المكتوبة وبدليلها (للحساسية)", dog.some((r) => r.medication === "Permethrin" && r.amount === "1 ml" && r.drugId === mono("Permethrin").id));
  check("  وما لا يعرفه الدليل يبقى كما كتبه الطبيب", cat.some((r) => r.medication === "دواء محلّي" && r.amount === "2 ml" && !r.drugId));
  const ed = src("src/components/ProtocolEditor.tsx");
  check("المحرّر: المكتوبُ الذي يعرفه الدليل يُعرض «من الدليل» فوق «خارج الدليل»", /const typedMono = q\.trim\(\)\.length >= 2 \? matchMonograph\(q\.trim\(\)\)/.test(ed)
    && /data-protodrughit=\{typedMono\.id\} onClick=\{\(\) => addDrug\(typedMono\)\}/.test(ed) && ed.indexOf("data-protodrughit") < ed.indexOf("data-protofreedrug"));
});

/* ── ٣) Enter، والصفُّ المختار، و«تم · n» ───────────────────────────────────── */
await section("▸ ٣) Enter يضيف ولا يشيل؛ والمختارُ بـ«أدويتي» يُرى؛ و«تم · n» صادقة", async () => {
  const res = [{ key: "amoxclav" }, { key: "amox250" }];
  const sel = (it) => it.key === "amoxclav";
  check("multi + الأوّلُ مختار ⇒ «موجود» لا شيل", I.searchEnter(res, sel, "multi")?.act === "already");
  check("  وغيرُ المختار ⇒ يُضاف", I.searchEnter([{ key: "amox250" }], sel, "multi")?.act === "pick");
  check("  وsingle ⇒ اختيار، ولا نتائج ⇒ لا شيء", I.searchEnter(res, sel, "single")?.act === "pick" && I.searchEnter([], sel, "multi") === null);
  const sh = src("src/components/meds/MedPickerSheet.tsx");
  check("حقلُ البحث يمرّ من searchEnter — لا pick(results[0]) يشيل", /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter" && results\[0\]\) \{ e\.preventDefault\(\); enterPick\(\); \} \}\}/.test(sh) && /searchEnter\(results,/.test(sh) && !/pick\(results\[0\]\)/.test(sh));
  check("«أدويتي» بالورقة تعرف المختار (isSelected للوحة)", /<MyMedsBoard[\s\S]*?isSelected=\{p\.isSelected \?/.test(sh));
  const board = src("src/components/meds/MyMedsBoard.tsx");
  check("  والصفُّ المختار يُرسم مختاراً (aria-pressed وشارة «أُضيف ✓»)", /selected=\{mode === "pick" && !!isSelected\?\.\(it\)\}/.test(board) && /"aria-pressed": selected/.test(board) && /data-mymed-added/.test(board));
  check("«تم · n» من مجموعة المفاتيح: الشيلُ يُنقصها", /useState<ReadonlySet<string>>/.test(sh) && /p\.onUnpick\?\.\(m\); markAdded\(m\.key, false\)/.test(sh) && /added\.size > 0/.test(sh) && !/setAdded\(\(n\) => n \+ 1\)/.test(sh));
});

/* ── ٤) الإفلاتُ بـdnd-kit الحقيقيّ ─────────────────────────────────────────── */
await section("▸ ٤) الإفلاتُ بالفراغ لا يكتب، والضغطةُ المطوّلة بلا حركة اختيار", async () => {
  // بـ@dnd-kit/core الحقيقيّ (pointerWithin وclosestCenter كما بالمتصفّح).
  const D = await load(`export * from "./src/components/meds/medDnd.ts";`);
  const rect =(left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const drops = [
    { id: "rail-mine", rect: rect(900, 100, 120, 48), data: { kind: "end" } },
    { id: "mine-bar", rect: rect(300, 1000, 300, 56), data: { kind: "end" } },
    { id: "slot:d1", rect: rect(40, 100, 240, 56), data: { kind: "slot", id: "d1" } },
  ];
  const containers = drops.map((d) => ({ id: d.id, key: d.id, data: { current: d.data }, disabled: false, node: { current: null }, rect: { current: d.rect } }));
  const droppableRects = new Map(drops.map((d) => [d.id, d.rect]));
  const args = (pointer) => ({
    active: { id: "tile:amikacin", data: { current: { kind: "tile", item: { key: "amikacin" } } }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(pointer ? pointer.x - 120 : 500, pointer ? pointer.y - 36 : 500, 240, 72),
    droppableRects, droppableContainers: containers, pointerCoordinates: pointer,
  });
  const onTile = D.medCollision(args({ x: 520, y: 520 }));
  check("إصبعٌ رُفع فوق بلاطةٍ (لا هدف تحته) ⇒ لا هدف — كان «الأقرب» دائماً", onTile.length === 0, onTile.map((c) => c.id).join(","));
  const onRail = D.medCollision(args({ x: 950, y: 120 }));
  check("  وفوق «★ أدويتي» ⇒ هو", onRail.length === 1 && onRail[0].id === "rail-mine");
  check("  والكيبورد (بلا مؤشّر) ⇒ الأقرب كما كان", D.medCollision(args(null)).length > 0);
  const item = { key: "amikacin", name: "Amikacin", family: "antibiotics", inMine: true, drugId: "d1" };
  const ev = (over) => ({ active: { id: "tile:amikacin", data: { current: { kind: "tile", item } }, rect: { current: { initial: null, translated: null } } }, over });
  check("dropOp بلا هدف ⇒ لا عملية (لا put ولا move)", D.dropOp(["d1", "d2"], ev(null), () => "new") === null);
  check("  وعلى الرفّ ⇒ عمليةٌ واحدة كما كانت (نقلٌ لآخرها)", D.dropOp(["d1", "d2"], ev({ id: "rail-mine", rect: drops[0].rect, data: { current: { kind: "end" } } }), () => "new")?.op === "move");
  check("ضغطٌ مطوَّل بإصبعٍ بلا حركة ⇒ ضغطة", D.isStillPress({ touches: [] }, { x: 3, y: -4 }) === true);
  check("  وحركةٌ ⇒ سحب، والفأرةُ لا تُحسب ضغطة", D.isStillPress({ touches: [] }, { x: 0, y: 40 }) === false && D.isStillPress({ clientX: 1 }, { x: 0, y: 0 }) === false);
  const sh = src("src/components/meds/MedPickerSheet.tsx");
  check("الورقة: إفلاتٌ بلا عملية + ضغطةٌ ساكنة ⇒ تختار البلاطة", /if \(d\.kind === "tile" && isStillPress\(e\.activatorEvent, e\.delta\)\) pick\(d\.item, d\.via, true\);/.test(sh));
  check("  واللوحةُ والورقةُ على اصطدام medDnd (لا closestCenter احتياطاً بغيره)", /from "\.\/medDnd"/.test(sh) && /from "\.\/medDnd"/.test(src("src/components/meds/MyMedsBoard.tsx")) && !/closestCenter/.test(src("src/components/meds/MyMedsBoard.tsx")));
});

/* ── ٥) الرسالةُ فوق كلّ ورقة ─────────────────────────────────────────────── */
await section("▸ ٥) التوستُ فوق كلّ طبقة", async () => {
  const toastZ = Number(/fixed bottom-4 right-4 z-\[(\d+)\]/.exec(readFileSync("src/components/ui/Toast.tsx", "utf8"))?.[1] ?? 0);
  const overlays = [];
  (function walk(d) {
    for (const e of readdirSyncSafe(d)) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(p) && !p.endsWith("ui/Toast.tsx")) {
        for (const m of readFileSync(p, "utf8").matchAll(/fixed inset-0 z-\[(\d+)\]/g)) overlays.push({ p, z: Number(m[1]) });
      }
    }
  })("src");
  const top = overlays.reduce((a, b) => (b.z > a.z ? b : a), { z: 0, p: "" });
  check(`التوست (z-${toastZ}) فوق أعلى ورقة (${top.p.replace(/^src\//, "")} z-${top.z}) — «تراجع» تُضغط من داخل المنتقي`, toastZ > top.z && toastZ > 90);
});
function readdirSyncSafe(d) { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } }

/* ── ٦) ما فشل يُقال ───────────────────────────────────────────────────────── */
await section("▸ ٦) فشلُ المخزن والتحديث يُقالان، و«فاضية» لا تُقال عن خطأ", async () => {
  check("mineState: خطأٌ أو تحميلٌ أو تبدّلٌ بلا صفوف ليس «فاضية»", I.mineState("error", 0) === "error" && I.mineState("loading", 0) === "loading" && I.mineState("idle", 0) === "loading" && I.mineState("switched", 0) === "switched" && I.mineState("switched", 3) === "switched");
  check("  و«فاضية» حين قرأ الخادمُ القائمةَ فعلاً", I.mineState("ready", 0) === "empty" && I.mineState("ready", 2) === "list" && I.mineState("error", 2) === "list");
  const n = (o) => I.pickerNotices({ status: "ready", readOnly: false, rows: 4, stock: "ok", ...o });
  check("تحديثٌ فشل والصفوفُ قديمة ⇒ «stale» (النجمةُ موقوفةٌ بسببها)", n({ status: "error" }).includes("stale") && !n({ status: "error", rows: 0 }).includes("stale"));
  check("المخزنُ لم يصل ⇒ «stockFail» (لا «ماكو»)", n({ stock: "failed" }).includes("stockFail") && !n({ stock: "hidden" }).includes("stockFail") && n({}).length === 0);
  check("  والتبدّلُ والاشتراكُ كما كانا", n({ status: "switched" })[0] === "switched" && n({ readOnly: true })[0] === "readOnly");
  const sh = src("src/components/meds/MedPickerSheet.tsx");
  check("الورقة: فشلُ المخزن حالٌ تُقال لا [] صامتة", /setStockState\("failed"\)/.test(sh) && !/setStock\(\[\]\)/.test(sh) && /stock: showStock \? stockState : "hidden"/.test(sh));
  check("  ولافتاتُها من pickerNotices بـ«إعادة المحاولة» للتحديث والمخزن", /notices\.map\(\(n\) =>/.test(sh) && /data-mednotice-retry/.test(sh) && /getStock\(true\)/.test(sh));
  check("  و«ماكو بهالاسم» لا تُقال والمخزنُ لم يصل", /stockFailed\s*\?\s*t\("mymeds\.noResultsStockFail"/.test(sh));
  check("  ولوحتُها الفارغة من mineState (التبدّلُ ليس «فاضية»)", /const st = mineState\(status, 0\);/.test(sh));
  const st = fnBody(src("src/pages/Settings.tsx"), "MyMedsSettings");
  check("الإعدادات: «فاضية» و«ماكو» والعددُ بعد قراءةٍ ناجحة وحدها", /const mine = mineState\(drugs\.status, ix\.mine\.length\);/.test(st)
    && /empty=\{mine === "empty"/.test(st) && /knownEmpty\s*\?\s*<p[^>]*data-mymeds-custom-empty/.test(st) && /\(mine === "list" \|\| mine === "empty"\) && \(/.test(st));
});

/* ── ٧) «استبدال» ──────────────────────────────────────────────────────────── */
await section("▸ ٧) «استبدال» لا يصنع صفّين لدواءٍ واحد", async () => {
  const rows = [{ id: "a", name: "Amoxicillin 250mg" }, { id: "m", name: "Meloxicam" }, { id: "e", name: "" }];
  check("المختارُ بصفٍّ آخر ⇒ يبقى ذاك ويُشال المستبدَل", JSON.stringify(I.replaceDecision(rows, "a", "meloxicam ")) === JSON.stringify({ kind: "dup", keep: "m" }));
  check("  ونفسُ الصفّ ⇒ لا شيء، وغيرُه ⇒ استبدال", I.replaceDecision(rows, "a", "amoxicillin 250 mg").kind === "same" && I.replaceDecision(rows, "a", "Tramadol").kind === "replace");
  const tp = src("src/components/TreatmentPlan.tsx");
  check("المعالج يمرّ منه قبل أن يسمّي الصفّ", /const d = replaceDecision\(rows, picker\.replaceId, m\.name\);/.test(tp) && /if \(d\.kind === "dup"\) \{\s*removeRow\(picker\.replaceId\);/.test(tp) && /else if \(d\.kind === "replace"\) \{\s*setRow\(picker\.replaceId/.test(tp));
});

console.log(fails ? `\n✗ med-hosts-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ med-hosts-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
