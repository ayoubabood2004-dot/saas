/* ============================================================================
 * رفوفُ الزائر (متجر v1) — الترتيب، والتسعيرُ من كلّ ما وصل، وصورةُ البطاقة، وطبقاتُ الرجوع.
 *
 * التصنيفُ صار رفّاً بترتيب العيادة (0233/0234): داخله لا يقفز «المختار» فوق ما رتّبته يدُها،
 * والنافدُ آخِراً دائماً. والسلّةُ تُسعَّر من كلّ الرفوف — مادّةٌ من صفحةٍ ثانيةٍ لتصنيفٍ لم
 * تصلها «الكل» بعد كانت تُسعَّر صفراً. والبطاقةُ تطلب المصغّرة (.sm.jpg) لصورةٍ من المحرّر وما
 * عداها كما هو (O4). وزرُّ الرجوع يُغلق الطبقات بالترتيب (storeLayers — يفصّلها back-layers-test).
 *
 *   node scripts/storefront-shelf-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const stub = {
  name: "stub",
  setup(b) {
    b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "rr", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const useLocation = () => ({}); export const useNavigate = () => () => {};", loader: "js" }));
  },
};
let M;
try {
  const built = await esbuild.build({
    stdin: { contents: 'export * from "./src/lib/storeLib.ts"; export { layersAfter, readLayers } from "./src/lib/storeLayers.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", plugins: [stub],
  });
  M = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
} catch (e) {
  console.error(`✗ storefront-shelf-test: ما انبنت الوحدات — ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
}
const ids = (xs) => xs.map((x) => x.id).join(",");
const I = (id, o = {}) => ({ id, name: id, price: 10, available: true, featured: false, ...o });

console.log("▸ orderShelf");
{
  if (typeof M.orderShelf !== "function") { check("orderShelf موجودة", false); }
  else {
    const server = [I("a"), I("b", { featured: true }), I("c", { available: false }), I("d")];
    check("داخل تصنيف: ترتيبُ العيادة كما وصل، والنافدُ آخِراً — المختارُ لا يقفز",
      ids(M.orderShelf(server, { sort: "default", inCategory: true })) === "a,b,d,c", ids(M.orderShelf(server, { sort: "default", inCategory: true })));
    check("  وبـ«الكل»: المختارُ يتصدّر المتوفّر (كما كان)", ids(M.orderShelf(server, { sort: "default", inCategory: false })) === "b,a,d,c");
    const priced = [I("x", { price: 30 }), I("y", { price: 10, available: false }), I("z", { price: 20 })];
    check("  والسعرُ تصاعدياً بعد التوفّر", ids(M.orderShelf(priced, { sort: "priceAsc", inCategory: true })) === "z,x,y");
    check("  وتنازلياً", ids(M.orderShelf(priced, { sort: "priceDesc", inCategory: false })) === "x,z,y");
    check("  ولا يغيّر المدخل", ids(server) === "a,b,c,d");
  }
}

console.log("▸ mergeKnown — السلّةُ تُسعَّر من كلّ ما وصل");
{
  if (typeof M.mergeKnown !== "function") { check("mergeKnown موجودة", false); }
  else {
    const all = [I("p1", { price: 5 })];
    const shelfCat = [I("p1", { price: 5 }), I("p77", { price: 4500 })];   // p77 بصفحةٍ ثانيةٍ للتصنيف وحده
    const known = M.mergeKnown([all, shelfCat]);
    const cart = [{ id: "p77", qty: 2 }, { id: "p1", qty: 1 }];
    const subtotal = cart.reduce((s, l) => s + (known.get(l.id)?.price ?? 0) * l.qty, 0);
    check("مادّةٌ معروفةٌ من رفّ تصنيفٍ وحده تُسعَّر وتُسمّى", known.get("p77")?.name === "p77" && subtotal === 9005, String(subtotal));
  }
  const sf = readFileSync("src/pages/Storefront.tsx", "utf8");
  check("  وStorefront تسعّر السلّةَ والمجموعَ منها", /const byId = useMemo\(\(\) => mergeKnown\(/.test(sf));
  check("  والتشذيبُ ما زال ينتظر «الكل» كاملاً (لا يحذف ما بصفحةٍ لم تصل)",
    /if \(state !== "open" \|\| !allShelf\.loaded \|\| allShelf\.hasMore \|\| allShelf\.loading \|\| allShelf\.failed\) return;/.test(sf) && /!allById\.get\(l\.id\)\?\.available/.test(sf));
  check("  والعددُ لا يُقال إلا لرفٍّ كامل", /\{complete \? `\$\{formatNum\(shown\.length\)\}/.test(sf));
  check("  والبحثُ يُكمل صفحاتِ الرفّ الحاليّ قبل «ما لكينا»", /if \(!searching \|\| !cur\.loaded \|\| !cur\.hasMore \|\| cur\.loading \|\| cur\.failed\) return;\s*void loadShelf\(cat\);/.test(sf));
  check("  والتصنيفُ بالخادم (store_catalog_in) لا تصفيةَ قائمةٍ جزئية", /storeApi\.storeCatalogInPublic\(slug, key, limit, offset\)/.test(sf) && !/c\.category \?\? "other"/.test(sf));
  check("  وcat_gone: يُقال، و«الكل»، والرقائقُ تُقرأ من جديد",
    /message === "cat_gone"\) \{ onCatGone\(key\)/.test(sf) && /setCat\("all"\);/.test(sf) && /storeApi\.storeFrontPublic\(slug\)\.then/.test(sf));
  check("  والرفُّ الفارغ «ما بهذا التصنيف شي حالياً» لا «ما لكينا»", /sf\.catEmpty/.test(sf));
}

console.log("▸ cardImagePath");
{
  const C = M.cardImagePath;
  check("…hd.jpg ⇒ …sm.jpg", C("c1/p1-k9.hd.jpg") === "c1/p1-k9.sm.jpg");
  check("  والقديمُ .jpg كما هو", C("c1/p1-abc.jpg") === "c1/p1-abc.jpg");
  check("  والمكتبةُ كما هي", C("library/royal/maxi.jpg") === "library/royal/maxi.jpg");
  check("  وdata: كما هي", C("data:image/jpeg;base64,AAA") === "data:image/jpeg;base64,AAA");
  check("  وفارغٌ ⇒ null", C(null) === null && C("") === null);
  const sf = readFileSync("src/pages/Storefront.tsx", "utf8");
  check("الشبكةُ والسلّةُ تطلبان المصغّرة، والفشلُ يبدّل للكاملة مرّةً ثم يُخفي",
    (sf.match(/productImageUrl\(cardImagePath\(/g) || []).length >= 3 && /onError=\{swapOnce\(productImageUrl\(p\.image_path\)\)\}/.test(sf) && /el\.dataset\.fb !== "1"/.test(sf));
  check("  والورقةُ تعرض الكاملةَ مربّعةً حتى ٥٥٪ والمصغّرةَ تحتها", /aspect-square max-h-\[55vh\]/.test(sf) && /thumb && thumb !== img/.test(sf));
  check("  والوصفُ بأسطره (whitespace-pre-line) بتمريرٍ حتى max-h-60", /max-h-60 overflow-y-auto whitespace-pre-line/.test(sf));
}

console.log("▸ layersAfter");
{
  const A = M.layersAfter;
  if (typeof A !== "function") check("layersAfter موجودة", false);
  else {
    check("فتحُ الورقة ⇒ دفعُ مدخل", JSON.stringify(A([], { type: "open", layer: "sheet" })) === JSON.stringify({ layers: ["sheet"], nav: { push: ["sheet"] } }));
    check("  وفتحُ العارض فوقها ⇒ مدخلٌ ثانٍ", JSON.stringify(A(["sheet"], { type: "open", layer: "zoom" }).nav) === JSON.stringify({ push: ["sheet", "zoom"] }));
    check("  وفتحُ المفتوح ⇒ لا شيء", A(["sheet"], { type: "open", layer: "sheet" }).nav === null);
    check("الإغلاقُ من الواجهة ⇒ go(-1) مرّةً واحدة", JSON.stringify(A(["sheet", "zoom"], { type: "close" })) === JSON.stringify({ layers: ["sheet"], nav: { go: -1 } }));
    check("  وبلا طبقات ⇒ لا شيء (الخروجُ شأنُ المتصفّح)", A([], { type: "close" }).nav === null);
    check("السلّة ⇒ الإتمام تبديلٌ بنفس العمق", JSON.stringify(A(["cart"], { type: "swap", layer: "checkout" })) === JSON.stringify({ layers: ["checkout"], nav: { replace: ["checkout"] } }));
    check("إعادةُ التحميل بطبقتين ⇒ go(-2) للأساس", JSON.stringify(A(["sheet", "zoom"], { type: "reload" })) === JSON.stringify({ layers: [], nav: { go: -2 } }));
    check("وبعد الطلب ⇒ go(-عمق) (لا مدخلَ يتسرّب)", JSON.stringify(A(["checkout"], { type: "placed" })) === JSON.stringify({ layers: [], nav: { go: -1 } }));
    check("readLayers يُسقط الغريب", JSON.stringify(M.readLayers({ layers: ["sheet", "hack", 3] })) === '["sheet"]' && M.readLayers(null).length === 0);
  }
}

console.log(fails ? `\n✗ storefront-shelf-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ storefront-shelf-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
