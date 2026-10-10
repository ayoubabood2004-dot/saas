/* ============================================================================
 * تبويبُ «الأدوية» بالبيع — دواءٌ بالمخزن يُباع منتجاً (جوابُ المالك ٢، ٩/١٠).
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * الدواءُ من التبويب كان سطرَ «دواء» بلا منتجٍ ولا كلفةٍ ولو كانت علبتُه على الرفّ: يُباع ولا
 * ينقص الرصيد، والربحُ كلُّه ربح، والرفُّ يكذب. والآن: منتجٌ واحدٌ بالاسم (مطبَّعاً بالطرفين) ⇒
 * سطرُ منتجٍ بالمسار العاديّ يحمل مسودّةَ السجلّ؛ عدّةٌ ⇒ الكاشيرُ يختار؛ لا شيء ⇒ السطرُ القديم.
 *
 * يفحص هذا الملفّ — بالوحدات الحقيقية من مصدرها وبالمرآة التجريبية للبيع والسجلّ:
 *  ١) المطابقة: بالمعرّف أوّلاً، ثم بالاسم بالطرفين (همزة، مسافة، حالة، أرقام شرقية)، ومخزنُ
 *     الحقل خارجها.
 *  ٢) القرار: واحد ⇒ منتج، عدّة ⇒ «اختر» (لا صامت)، المختار ⇒ هو، لا شيء ⇒ سطرُ دواء.
 *  ٣) سطرُ منتجٍ من التبويب بالإتمام: product_id وunit_cost بالفاتورة، والرصيدُ ينقص، وقيدُ
 *     العلاج بسجلّ الحيوان يُكتب **مرّةً واحدة** بملاحظته «Injection · Antibiotics».
 *  ٤) دواءٌ ليس بالمخزن: سطرُ «دواء» القديم (بلا منتجٍ ولا كلفة) والرصيدُ لا يتحرّك.
 *  ٥) شاشةُ البيع بنصّها: المسارُ يمرّ من addProduct، والمسودّةُ تُلصق بالسطر، والإتمامُ
 *     يجمع المسودّات من كلّ سطرٍ يحملها.
 *  ٧) حيوانٌ ثانٍ على نفس المنتج قيدُه يُكتب (لا «بالسلّة أصلاً» تبتلعه)، و«راجع» لا يقلب دواءَ
 *     التبويب سطرَ إرجاع — بالوحدة الحقيقية وبنصّ شاشة البيع.
 *
 *   node scripts/med-sale-test.mjs
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

/* ---- متصفّحٌ بالحدّ الأدنى (نفسُ ترتيب repo-demo-test) -------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: `export { repo } from "./src/lib/repo.ts"; export { persistMedicalEntries } from "./src/lib/medSync.ts"; export * as S from "./src/lib/medSale.ts"; export { isCustomerBound } from "./src/lib/saleCustomer.ts";`,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent", mainFields: ["module", "main"],
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(join(tmpdir(), "med-sale-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, persistMedicalEntries, S, isCustomerBound } = M;

const P = (id, name, extra = {}) => ({ id, name, barcode: null, stock: 10, purchase_price: 2000, sell_price: 3000, category: "medicine", clinic_id: "c1", farm_id: null, ...extra });

console.log("▸ ١) المطابقة بالمعرّف ثم بالاسم بالطرفين");
{
  const products = [P("a", "أموكسيسيلين ٢٥٠"), P("b", "Meloxicam"), P("f", "Meloxicam", { farm_id: "farm-1" }), P("c", "Ceftriaxone 1g")];
  check("بالمعرّف أوّلاً (ولو اختلف الاسم)", S.medProductMatches(products, { name: "شي ثاني", productId: "c" }).map((p) => p.id).join() === "c");
  check("وبالاسم بالطرفين: همزةٌ ومسافةٌ وأرقامٌ شرقية", S.medProductMatches(products, { name: "اموكسيسيلين 250 " }).map((p) => p.id).join() === "a");
  check("  وحالةُ الأحرف، ومخزنُ الحقل خارجها", S.medProductMatches(products, { name: "MELOXICAM" }).map((p) => p.id).join() === "b");
  check("  ولا شيء ⇒ []", S.medProductMatches(products, { name: "Tramadol" }).length === 0 && S.medProductMatches(products, { name: "   " }).length === 0);
}

console.log("▸ ٢) القرار — لا اختيارَ صامت");
{
  const one = [P("a", "X")], two = [P("a", "X"), P("b", "X")];
  check("منتجٌ واحد ⇒ سطرُ منتج", S.medLineDecision(one).kind === "product" && S.medLineDecision(one).product.id === "a");
  check("عدّةٌ ⇒ «اختر»", S.medLineDecision(two).kind === "choose" && S.medLineDecision(two).products.length === 2);
  check("  والمختارُ ⇒ هو", S.medLineDecision(two, "b").kind === "product" && S.medLineDecision(two, "b").product.id === "b");
  check("لا شيء ⇒ سطرُ دواء", S.medLineDecision([]).kind === "med");
}

/* ---- مخزنُ الديمو بمفتاحه الحقيقيّ ----------------------------------------- */
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const seed = (products) => mem.set(DB_KEY, JSON.stringify({
  products, companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [],
  generatedBarcodes: [], productsTrash: [], treatments: [], pets: [{ id: "pet-1", name: "بوبي", species: "dog" }], admissions: [], vaccinations: [],
}));
const db = () => JSON.parse(mem.get(DB_KEY));
const draft = (name, family = "Antibiotics") => ({ id: `med_${name}`, kind: "medication", family, name, route: "injection", dosage: "1 ml", administered: true });

console.log("▸ ٣) سطرُ منتجٍ من التبويب ⇒ الرصيدُ ينقص والكلفةُ بالفاتورة والسجلُّ مرّةً واحدة");
{
  seed([P("p-amox", "Amoxicillin 250mg", { stock: 10, purchase_price: 2000, sell_price: 3000 })]);
  const p = db().products[0];
  const pick = S.medLineDecision(S.medProductMatches([p], { name: "amoxicillin 250 mg" }));
  check("القرار: منتج", pick.kind === "product" && pick.product.id === "p-amox");
  // سطرُ المنتج كما يبنيه مسارُ المسح (addProduct) + المسودّةُ ملصقةٌ بالسطر مرّةً
  const line = { id: "p:p-amox", kind: "product", name: p.name, barcode: null, unit_price: p.sell_price, unit_cost: p.purchase_price, qty: 2, stock: p.stock, product_id: p.id, med: draft("Amoxicillin 250mg"), petId: "pet-1", petName: "بوبي" };
  const inv = await repo.retailCheckout([{ product_id: line.product_id, name: line.name, barcode: null, qty: line.qty, unit_price: line.unit_price, unit_cost: line.unit_cost, stock_qty: line.qty, unit_label: null }], { amount_paid: 6000, payment_method: "cash" });
  const after = db();
  const item = after.invoiceItems.find((i) => i.invoice_id === inv.id);
  check("الفاتورةُ تحمل product_id وunit_cost (لا كلفةَ صفر)", item?.product_id === "p-amox" && Number(item?.unit_cost) === 2000, JSON.stringify(item));
  check("والرصيدُ نقص ١٠ ⇒ ٨", Number(after.products[0].stock) === 8, String(after.products[0].stock));
  const byPet = S.medDraftsByPet([line]);
  check("مسودّةٌ واحدة للحيوان من سطر المنتج", byPet.get("pet-1")?.length === 1);
  await persistMedicalEntries("pet-1", "د. سارة", byPet.get("pet-1"));
  const tx = db().treatments.filter((x) => x.pet_id === "pet-1");
  check("وقيدُ العلاج بسجلّ الحيوان مرّةً واحدة باسمه وملاحظته", tx.length === 1 && tx[0].medication === "Amoxicillin 250mg" && tx[0].observations === "Injection · Antibiotics", JSON.stringify(tx));
}

console.log("▸ ٤) دواءٌ ليس بالمخزن ⇒ سطرُ «دواء» القديم");
{
  seed([P("p-other", "Something else", { stock: 5 })]);
  const d = draft("Sevoflurane", "Anesthetics & Sedatives");
  const decision = S.medLineDecision(S.medProductMatches(db().products, { name: d.name }));
  const line = S.medOnlyLine(d, 1500.004, 1, { id: "pet-1", name: "بوبي" });
  check("القرار: سطرُ دواء", decision.kind === "med");
  check("  بلا منتجٍ ولا كلفةٍ ولا رصيد، وبمعرّف m:", line.kind === "med" && line.product_id === null && line.unit_cost === 0 && line.stock === null && line.id === `m:${d.id}` && line.unit_price === 1500);
  const inv = await repo.retailCheckout([{ product_id: null, name: line.name, barcode: null, qty: 1, unit_price: line.unit_price, unit_cost: 0, stock_qty: 0, unit_label: null }], { amount_paid: 1500, payment_method: "cash" });
  const after = db();
  check("  والفاتورةُ بلا منتج والرصيدُ لم يتحرّك", after.invoiceItems.find((i) => i.invoice_id === inv.id)?.product_id == null && Number(after.products[0].stock) === 5);
  check("  وقيدُه بالسجلّ مسودّةٌ واحدة كذلك", S.medDraftsByPet([line]).get("pet-1")?.length === 1);
}

console.log("▸ ٥) لا قيدَ مزدوجاً ولا ضائعاً");
{
  const d1 = draft("A"), d2 = draft("B");
  const m = S.medDraftsByPet([
    { med: d1, petId: "p1" }, { med: d2, petId: "p1" }, { med: draft("C"), petId: null },
    { med: draft("R"), petId: "p1", ret: true }, { petId: "p1" },
  ]);
  check("مسودّةٌ لكلّ سطرٍ يحمل دواءً لحيوانٍ معروف — لا أكثر ولا أقل", m.get("p1")?.length === 2 && m.size === 1);
}

console.log("▸ ٦) شاشةُ البيع بنصّها");
{
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8").replace(/\r\n/g, "\n");
  const fn = /const addMedProduct = async \(p: Product, draft: MedicalDraft, qty: number\) => \{([\s\S]*?)\n  \};/.exec(sb)?.[1] ?? "";
  check("دواءٌ بالمخزن يمرّ من sellOrExplain — مسارُ المسح والكرت نفسُه (لا رصيدَ موازٍ)", /await sellOrExplain\(p,/.test(fn) && !/setCart\(\(c\) => \[\.\.\.c,/.test(fn) && !/\baddProduct\(/.test(fn));
  /* كان العقدُ «مرّةً لكلّ سطر» (`had?.med` ⇒ زادت الكمية والمسودّةُ تسقط) — فحيوانٌ ثانٍ على نفس
   * المنتج يُباع ولا يُكتب. العقدُ الآن: الأولى لا تُستبدل، وكلُّ إضافةٍ بعدها قيدُها (med-hosts-test). */
  const kept = S.attachMedDraft([{ id: "p:x", med: draft("أوّل"), petId: "p1" }], "p:x", { med: draft("ثانٍ"), petId: "p2", petName: null })[0];
  check("  والمسودّةُ تُلصق بالسطر (attachMedDraft): الأولى لا تُستبدل والتاليةُ لا تسقط", /attachMedDraft\(/.test(fn) && !/had\?\.med/.test(fn)
    && kept.med.name === "أوّل" && kept.petId === "p1" && kept.medMore?.length === 1 && kept.medMore[0].petId === "p2");
  check("والإتمامُ يجمع المسودّات من كلّ سطرٍ يحملها (medDraftsByPet)", /const medByPet = medDraftsByPet\(cart\);/.test(sb) && !/l\.kind !== "med" \|\| !l\.med \|\| !l\.petId/.test(sb));
  check("وسطرُ الدواء القديم من medOnlyLine (بلا منتجٍ ولا كلفة)", /medOnlyLine\(draft, price, qty/.test(sb));
  const form = readFileSync("src/components/retail/MedSaleForm.tsx", "utf8");
  check("ونموذجُ التبويب يقرّر بـmedLineDecision ولا يطلب سعراً لما بالمخزن", /medLineDecision\(/.test(form) && /onAddProduct\(d\.product, draft/.test(form));
}

/* ── ٧) قيدٌ لكلّ إضافة، و«راجع» لا يقلب دواءَ التبويب ───────────────────────── */
console.log("▸ ٧) قيدٌ لكلّ إضافة (حيوانٌ ثانٍ على نفس المنتج)، و«راجع» لا يقلب دواءَ التبويب");
{
  const draft = (id, dose) => ({ id, kind: "medication", family: "NSAIDs & Analgesics", name: "Meloxicam", route: "injection", dosage: dose, administered: true });
  let cart = [{ id: "p:melox", kind: "product", name: "Meloxicam", qty: 1, product_id: "melox" }, { id: "s:x", kind: "service", name: "فحص", qty: 1 }];
  cart = S.attachMedDraft(cart, "p:melox", { med: draft("d1", "1 ml"), petId: "luna", petName: "Luna" });
  cart = S.attachMedDraft(cart, "p:melox", { med: draft("d2", "2 ml"), petId: "bobby", petName: "Bobby" });
  cart = S.attachMedDraft(cart, "p:melox", { med: draft("d3", "0.5 ml"), petId: "bobby", petName: "Bobby" });
  const byPet = S.medDraftsByPet(cart);
  check("حيوانان على نفس المنتج ⇒ قيدٌ لكلٍّ منهما (لا يُبتلع الثاني)", byPet.get("luna")?.map((d) => d.id).join() === "d1" && byPet.get("bobby")?.map((d) => d.id).join() === "d2,d3", JSON.stringify([...byPet].map(([k, v]) => [k, v.map((d) => d.id)])));
  check("  والسطرُ واحدٌ للرصيد، وأسماؤه بالوصل كلُّها", cart.filter((l) => l.id === "p:melox").length === 1 && S.linePetNames(cart[0]).join(" + ") === "Luna + Bobby");
  check("  والراجعُ لا يكتب علاجاً (ولا ما لُصق به)", S.medDraftsByPet([{ ...cart[0], ret: true }]).size === 0);
  check("  ومسحُ الزبون يرفع سطراً ربطته مسودّةٌ لاحقة بحيوان", isCustomerBound({ id: "p:z", kind: "product", name: "z", petId: null, medMore: [{ petId: "bobby" }] }) && !isCustomerBound({ id: "p:z", kind: "product", name: "z", petId: null, medMore: [{ petId: null }] }));
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const fn = /const addMedProduct = async \(p: Product, draft: MedicalDraft, qty: number\) => \{([\s\S]*?)\n  \};/.exec(sb)?.[1] ?? "";
  check("التبويبُ يبيع ولو كان «راجع» مشغّلاً (sale: true)", /await sellOrExplain\(p, Math\.max\(1, qty\), null, \{ sale: true \}\)/.test(fn));
  check("  وaddProduct وsellOrExplain يحترمانه (لا addReturn بسطر بيع)", /const ret = retMode && !opt\?\.sale;\s*if \(p\.sold_by_weight\)[^\n]*\n\s*return ret \? addReturn\(p, n\)/.test(sb) && /needsServerCheck\(product, lineBefore, n, ret\)/.test(sb) && /retMode: ret,/.test(sb));
  check("  والمسودّةُ تُلصق بالسطر الذي أُضيف إليه فعلاً، ولا «بالسلّة أصلاً» تبتلعها", /attachMedDraft\(c, r\.lineId as string,/.test(fn) && !/had\?\.med/.test(fn) && !/posOneEntry/.test(sb));
  check("  والوصلُ يسمّي حيوانات السطر كلَّها", (sb.match(/linePetNames\(l\)\.join\(" \+ "\)/g) ?? []).length >= 3);
}

console.log(fails ? `\n✗ med-sale-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ med-sale-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
