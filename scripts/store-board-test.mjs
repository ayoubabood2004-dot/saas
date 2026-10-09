/* ============================================================================
 * فحصُ لوحة المتجر والصورة (0229) — سلوكاً لا نصّاً.
 *
 * `src/lib/storeBoard.ts` يحكم العدّادَ والتصفيةَ والنشرَ الجماعيَّ بتعريفٍ واحد، و
 * `src/lib/productPhoto.ts` يحكم الصورةَ ومصغّرَها ووصفَها. فالفحصُ يشغّل الدوالَّ
 * الأصلية (بحزمةٍ لا نسخة) على حالاتٍ مصنوعة — ومنها الحالاتُ التي كانت تكذب:
 *   • عدّادٌ يقول ٢٧ وتصفيةٌ تعرض ٢٥ (تعريفان) ⇒ هنا العدّادُ = طولُ التصفية لكلّ زرّ؛
 *   • مجمَّعٌ حوضُه فارغ «متوفّرٌ» باللوحة و«نافدٌ» عند الزبون ⇒ `available` من الخادم يغلب؛
 *   • مسحُ علبةٍ برمزٍ فيه علامةُ اتجاه ⇒ التطبيعُ على الطرفين؛
 *   • وصفُ صورةٍ يصف صورةً أخرى (دمجٌ طوى الحقلين منفصلَين) ⇒ لا مصغّرَ كاذب.
 *
 *   node scripts/store-board-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const built = await esbuild.build({
  stdin: {
    contents: 'export * from "./src/lib/storeBoard"; export * from "./src/lib/productPhoto";',
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  alias: { "@": "./src" },
});
const M = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const TODAY = "2026-10-09";
const P = (o) => ({ id: o.id, name: o.name ?? o.id, store_visible: false, store_featured: false, sell_price: 1000, stock: 3, image_path: "c/x.jpg", ...o });

console.log("▸ الجاهزية — صورة + سعرٌ موجب + غيرُ منتهٍ (مرآةُ store_publish)");
{
  check("كاملٌ ⇒ جاهز", M.readiness(P({ id: "a", store_desc: "x", store_section_id: "s" }), TODAY).ok);
  check("بلا صورة ⇒ ناقصُه «صورة»", eq(M.readiness(P({ id: "a", image_path: null }), TODAY).missing, ["photo"]));
  check("سعرُ صفر ⇒ ناقصُه «سعر»", eq(M.readiness(P({ id: "a", sell_price: 0 }), TODAY).missing, ["price"]));
  check("منتهٍ أمس ⇒ ناقصُه «انتهاء»، واليومُ نفسُه صالح",
    eq(M.readiness(P({ id: "a", expiry_date: "2026-10-08" }), TODAY).missing, ["expired"]) && M.readiness(P({ id: "a", expiry_date: TODAY }), TODAY).ok);
  check("الترتيبُ: صورة ثمّ سعر ثمّ انتهاء (نفسُ ترتيب الخادم بعدّ المتخطّى)",
    eq(M.readiness(P({ id: "a", image_path: null, sell_price: 0, expiry_date: "2026-01-01" }), TODAY).missing, ["photo", "price", "expired"]));
  const w = M.readiness(P({ id: "a", stock: 0 }), TODAY);
  check("الوصفُ والقسمُ والنفادُ تنبيهٌ لا منع", w.ok && eq(w.warn, ["desc", "section", "stock"]));
  check("  وبلا أقسامٍ بالعيادة لا يُنبَّه «بلا قسم»", !M.readiness(P({ id: "a" }), TODAY, false).warn.includes("section"));
}

console.log("▸ النفاد كما يراه الزبون");
{
  check("مجمَّعٌ بلا رصيد صفٍّ وحوضُه فارغ (available=false) ⇒ نافد", M.isOut({ stock: 0, pooled: true, available: false }));
  check("ورصيدُ صفٍّ صفر وحوضُه ممتلئ (available=true) ⇒ متوفّر", !M.isOut({ stock: 0, pooled: false, available: true }));
  check("وبلا جواب الخادم: الرصيدُ والمجمَّعُ كما كان", M.isOut({ stock: 0, pooled: false }) && !M.isOut({ stock: 0, pooled: true }));
}

console.log("▸ العدّادُ = طولُ التصفية لكلّ زرّ (تعريفٌ واحد)");
{
  const rows = [
    P({ id: "1", store_visible: true }),                                   // منشور مكتمل
    P({ id: "2", store_visible: true, image_path: null }),                 // منشور بلا صورة
    P({ id: "3", store_visible: true, sell_price: 0 }),                    // منشور بلا سعر
    P({ id: "4", store_visible: true, available: false }),                 // منشور ونافد
    P({ id: "5", store_visible: true, expiry_date: "2026-01-01" }),        // منشور ومنتهي
    P({ id: "6" }),                                                         // جاهز
    P({ id: "7", image_path: null }),                                       // مخفي بلا صورة
    P({ id: "8", store_featured: true }),                                   // مميّز ومخفي
    P({ id: "9", store_visible: true, below_cost: true, store_desc: "d", store_section_id: "s1" }),
    P({ id: "10", store_visible: true, store_section_id: "gone" }),        // قسمُه مؤرشف
  ];
  const active = new Set(["s1"]);
  const counts = M.boardCounts(rows, TODAY, active);
  const bad = M.BOARD_FILTERS.filter((f) => counts[f] !== rows.filter((p) => M.inFilter(p, f, TODAY, active)).length);
  check("كلُّ الأزرار: العدّادُ يساوي ما تعرضه التصفية", bad.length === 0, bad.join(","));
  check("«بلا صورة» على المخزن كلّه، و«منشور بلا صورة» على المنشور وحده", counts.nophoto === 2 && counts.shownNoPhoto === 1);
  check("«جاهز للنشر» = مخفيٌّ مكتمل (والمميّزُ المخفيُّ المكتملُ منه)", counts.ready === 2, String(counts.ready));
  check("العيوبُ على المنشور وحده: بلا سعر ١، نافد ١، منتهي ١، تحت الكلفة ١",
    counts.noprice === 1 && counts.out === 1 && counts.expired === 1 && counts.belowCost === 1, JSON.stringify(counts));
  check("قسمٌ مؤرشف = بلا قسم", M.inFilter(rows[9], "nosection", TODAY, active) && !M.inFilter(rows[8], "nosection", TODAY, active));
  check("مميّزٌ مخفي يُقال", counts.featHidden === 1);
  check("التقدّم: المنشورُ بصورةٍ من المنشور", eq(M.progress(rows), { done: 6, total: 7 }), JSON.stringify(M.progress(rows)));
}

console.log("▸ البحثُ والمسح — التطبيعُ على الطرفين");
{
  const p = P({ id: "a", name: "أكل قطط رويال", company_name: "شركة الهدى", barcode: "6281000 247", alt_codes: ["RF-12"] });
  check("«اكل قطط» يلقى «أكل قطط» (الهمزة)", M.matchesQuery(p, "اكل قطط"));
  check("والشركة", M.matchesQuery(p, "الهدى"));
  check("والأرقامُ الشرقية تلقى اللاتينية (٢٤٧)", M.matchesQuery(p, "٢٤٧"));
  check("والرمزُ الإضافيّ", M.matchesQuery(p, "rf-12") === false && M.matchesQuery(p, "RF-12"));
  check("وسؤالٌ فارغ يطابق الكلّ", M.matchesQuery(p, "   "));
  const rows = [P({ id: "a", barcode: "6281000247" }), P({ id: "b", barcode: "111", alt_codes: ["‎8989"] }), P({ id: "c", barcode: "555" }), P({ id: "d", barcode: "555" })];
  check("المسحُ يطابق تماماً لا جزئياً", M.findByScan(rows, "6281000247")?.id === "a" && M.findByScan(rows, "628100024") === null);
  check("وعلامةُ الاتجاه الخفية بالرمز المحفوظ لا تُفشل المسح", M.findByScan(rows, "8989")?.id === "b");
  check("ورمزٌ لمنتجين (توأمان) لا يفتح أحدَهما اعتباطاً", M.findByScan(rows, "555") === null);
}

console.log("▸ الترتيب");
{
  const sec = new Map([["s1", 0], ["s2", 1]]);
  const rows = [
    P({ id: "z", name: "ب", store_section_id: "s2", store_sort: 1 }),
    P({ id: "y", name: "أ", store_section_id: "s1", store_sort: 2 }),
    P({ id: "x", name: "ت", store_section_id: "s1", store_sort: 1 }),
    P({ id: "w", name: "ث", store_featured: true }),
    P({ id: "v", name: "ج" }),
  ];
  check("كالمتجر: المميّز، ثمّ الأقسامُ بترتيبها، ثمّ الترتيبُ اليدويّ، و«بلا قسم» آخراً",
    eq(M.sortBoard(rows, "shelf", TODAY, sec).map((p) => p.id), ["w", "x", "y", "z", "v"]));
  const work = [P({ id: "1", name: "ا", store_visible: true }), P({ id: "2", name: "ب" }), P({ id: "3", name: "ت", store_visible: true, image_path: null }), P({ id: "4", name: "ث", image_path: null })];
  check("الشغلُ الناقص: المنشورُ بلا صورة، ثمّ الجاهز، ثمّ بلا صورة، ثمّ المخفي، ثمّ المنشور",
    eq(M.sortBoard(work, "work", TODAY).map((p) => p.id), ["3", "2", "4", "1"]));
  check("وتعادلُ الاسم يُحسم بالمعرّف (ترتيبٌ حاسم)", eq(M.sortBoard([P({ id: "b", name: "س" }), P({ id: "a", name: "س" })], "name").map((p) => p.id), ["a", "b"]));
  check("نقلٌ لفوق ولجوّه ولأوّل القائمة، والطرفان لا يخرجان",
    eq(M.moveInOrder(["a", "b", "c"], "c", "up"), ["a", "c", "b"]) && eq(M.moveInOrder(["a", "b", "c"], "a", "down"), ["b", "a", "c"])
    && eq(M.moveInOrder(["a", "b", "c"], "c", "top"), ["c", "a", "b"]) && eq(M.moveInOrder(["a", "b"], "a", "up"), ["a", "b"])
    && eq(M.moveInOrder(["a", "b"], "b", "down"), ["a", "b"]) && eq(M.moveInOrder(["a"], "zz", "up"), ["a"]));
}

console.log("▸ أسماءُ الأقسام — مرآةُ store_section_save");
{
  const ex = [{ id: "1", name: "أكل قطط" }, { id: "2", name: "شامبو", archived_at: "2026-10-01" }];
  check("التوأمُ بعد التطبيع مرفوض (همزة، مسافات)", M.sectionNameProblem("اكل  قطط", ex) === "dup");
  check("  والمؤرشفُ يُحسب (يُسترجع ولا يُنشأ ثانيه)", M.sectionNameProblem("شامبو", ex) === "dup");
  check("  وإعادةُ تسمية القسم باسمه ليست توأماً", M.sectionNameProblem("أكل قطط", ex, "1") === null);
  check("الفارغُ والطويلُ مرفوضان", M.sectionNameProblem("   ", ex) === "empty" && M.sectionNameProblem("ق".repeat(41), ex) === "long");
}

console.log("▸ الصورة — أبعادٌ ومصغّرٌ ووصف");
{
  check("التدويرُ يقلب الأبعاد ٩٠/٢٧٠ لا ١٨٠", eq(M.rotatedSize(4, 3, 90), { w: 3, h: 4 }) && eq(M.rotatedSize(4, 3, 180), { w: 4, h: 3 }));
  check("القصُّ المربّعُ من الوسط", eq(M.squareRect(400, 300), { x: 50, y: 0, size: 300 }) && eq(M.squareRect(300, 400), { x: 0, y: 50, size: 300 }));
  check("التصغيرُ يحفظ النسبة ولا يكبّر صورةً صغيرة", eq(M.fitDims(3200, 2400, 1600), { w: 1600, h: 1200 }) && eq(M.fitDims(500, 400, 1600), { w: 500, h: 400 }));
  check("الكاملُ ١٦٠٠ والمصغّرُ ٤٨٠ تحت سقف الدلو", M.FULL_DIM === 1600 && M.THUMB_DIM === 480 && M.MAX_BYTES < 2 * 1024 * 1024);
  // مرآةُ شرط store_set_image حرفاً: regexp_replace(v_path, '\.[A-Za-z0-9]+$', '') || '.thumb.jpg'
  const sql = (p) => p.replace(/\.[A-Za-z0-9]+$/, "") + ".thumb.jpg";
  const paths = ["c1/p1-lq3.jpg", "c1/p1-lq3.JPG", "c1/p1-lq3.png", "c1/p1-lq3.webp"];
  check("اسمُ المصغّر = ما تقبله store_set_image (الطرفان من قاعدةٍ واحدة)", paths.every((p) => M.thumbPathFor(p) === sql(p)));
  const meta = { v: 1, path: "c1/a.jpg", thumb: "c1/a.thumb.jpg", w: 1600, h: 1200, bytes: 300000, src: "camera" };
  check("الوصفُ يُصدَّق حين يصف هذه الصورة", M.thumbOf("c1/a.jpg", meta) === "c1/a.thumb.jpg" && M.metaOf("c1/a.jpg", meta) === meta);
  check("  ويُتجاهل حين يصف صورةً أخرى (دمجٌ طوى الحقلين منفصلَين)", M.thumbOf("c1/b.jpg", meta) === null && M.metaOf("c1/b.jpg", meta) === null);
  check("  وبلا مسار لا شيء", M.thumbOf(null, meta) === null);
  const ts = Date.UTC(2026, 9, 9, 12);
  check("وقتُ الرفع من اسم الملف (أساس ٣٦)", M.uploadedAt(`c1/p1-${ts.toString(36)}.jpg`)?.getTime() === ts && M.uploadedAt(`c1/p1-${ts.toString(36)}.thumb.jpg`)?.getTime() === ts);
  check("  والمكتبةُ والتجريبيُّ والأسماءُ الغريبة بلا وقت", M.uploadedAt("library/x.jpg") === null && M.uploadedAt("data:image/jpeg;base64,AA") === null && M.uploadedAt("c1/logo.png") === null);
  check("أسماءُ التعديلات: ما طُبّق فعلاً وحده",
    eq(M.editNames({ rot: 90, square: true, enhance: true, whiteBg: true }, { enhance: false, whiteBg: true }), ["rot90", "square", "white"]));
}

console.log("▸ تحسينُ الإضاءة وتبييضُ الخلفية — على بكسلاتٍ مصنوعة");
{
  const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const [r, g, b] = f(x, y); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; };
  const dim = img(20, 20, (x) => { const v = 60 + x * 5; return [v, v, v]; });
  const okDim = M.autoLevels(dim);
  check("صورةٌ خافتةٌ ضيّقةُ المدى تُمدّ إلى ٠–٢٥٥", okDim && dim[0] <= 5 && dim[(19) * 4] >= 250, `${dim[0]} ${dim[76]}`);
  const full = img(20, 20, (x) => { const v = Math.min(255, x * 14); return [v, v, v]; });
  const before = Array.from(full);
  check("وصورةٌ مداها كاملٌ لا تُمسّ", !M.autoLevels(full) && eq(Array.from(full), before));
  // علبةٌ حمراء بالوسط على خلفيةٍ رماديةٍ موحّدة ⇒ الخلفيةُ بيضاء والعلبةُ كما هي.
  const W = 40, H = 40;
  const box = img(W, H, (x, y) => (x >= 12 && x < 28 && y >= 12 && y < 28 ? [200, 20, 20] : [210, 205, 200]));
  const okWhite = M.whitenBackground(box, W, H);
  const at = (x, y) => Array.from(box.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  check("خلفيةٌ موحّدة ⇒ بيضاء، والعلبةُ لم تُمسّ", okWhite && eq(at(0, 0), [255, 255, 255]) && eq(at(20, 20), [200, 20, 20]));
  // رفٌّ مخطّط (خلفيةٌ غيرُ موحّدة) ⇒ لا تبييض.
  const shelf = img(W, H, (x, y) => ((x + y) % 4 < 2 ? [30, 30, 30] : [230, 230, 230]));
  const shelfBefore = Array.from(shelf);
  check("خلفيةٌ غيرُ موحّدة ⇒ لا تبييض (لا نأكل حافةَ علبة)", !M.whitenBackground(shelf, W, H) && eq(Array.from(shelf), shelfBefore));
}

console.log("▸ المرآةُ النصّية — ما لا يجري بـnode يُطابَق بالنصّ");
{
  const mig = readFileSync("supabase/migrations/0229_store_sections.sql", "utf8");
  check("store_publish يعدّ المتخطّى بأوّل سببٍ ناقص: صورة ثمّ سعر ثمّ انتهاء",
    /count\(\*\) filter \(where nullif\(btrim\(coalesce\(p\.image_path, ''\)\), ''\) is null\),\s*\n\s*count\(\*\) filter \(where nullif[\s\S]{0,80}is not null and coalesce\(p\.sell_price, 0\) <= 0\)/.test(mig));
  check("store_catalog2 والأقسامُ بـstore_front بشروط الكتلوج نفسِها (سعرٌ موجب، غيرُ منتهٍ ببغداد)",
    (mig.match(/coalesce\(p\.sell_price, 0\) > 0\s*\n\s*and \(p\.expiry_date is null or p\.expiry_date >= \(now\(\) at time zone 'Asia\/Baghdad'\)::date\)/g) ?? []).length >= 2);
  check("والمصغّرُ بالكتلوج حين يصف الوصفُ هذه الصورة وحدها (مرآةُ thumbOf)",
    /case when p\.image_meta->>'path' = p\.image_path then nullif\(p\.image_meta->>'thumb', ''\) end/.test(mig));
}

console.log(`\n${fails ? "✗" : "✓"} store-board-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
