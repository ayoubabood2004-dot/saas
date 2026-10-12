/* ============================================================================
 * محرّرُ صورة المنتج — الهندسةُ والترميزُ والترتيب، على الشِفرة الحقيقية (photoPipeline.ts).
 *
 * ما لا تراه العينُ ويراه الزبون: قصٌّ بعد تدويرٍ يأخذ ركناً غيرَ الذي اختاره المصوّر،
 * أو ملفٌّ فوق سقف الدلو يُرفض بعد أن ظنّه محفوظاً، أو صورةٌ كاملةٌ بلا مصغّرة (البطاقةُ تنزّل
 * الكاملة)، أو PNG شفّافٌ يصير أسودَ بـJPEG. كلُّها حسابٌ خالص — فتُفحص هنا بلا متصفّح.
 *
 *   node scripts/photo-pipeline-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const built = await esbuild.build({ entryPoints: ["src/lib/photoPipeline.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
const P = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;

console.log("▸ الأحجام");
{
  const f = P.editPlan(4000, 3000, 0, P.FULL_CROP, 1600);
  const s = P.editPlan(4000, 3000, 0, P.FULL_CROP, 480);
  check("٤٠٠٠×٣٠٠٠ ⇒ الكاملة ١٦٠٠×١٢٠٠ والمصغّرة ٤٨٠×٣٦٠", f.outW === 1600 && f.outH === 1200 && s.outW === 480 && s.outH === 360, `${f.outW}×${f.outH} / ${s.outW}×${s.outH}`);
  const small = P.editPlan(600, 400, 0, P.FULL_CROP, 1600);
  check("  وصورةٌ أصغرُ من الحدّ لا تُكبَّر", small.outW === 600 && small.outH === 400);
  const r = P.editPlan(4000, 3000, 90, P.FULL_CROP, 1600);
  check("  والتدويرُ ٩٠ يقلب الأبعاد (١٢٠٠×١٦٠٠)", r.outW === 1200 && r.outH === 1600, `${r.outW}×${r.outH}`);
}

console.log("▸ القصُّ تحت التدوير — الركنُ المختار هو ما يُرسم");
{
  const W = 4000, H = 3000;
  const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
  /* لكلّ تدوير: النقطةُ بالمصدر التي تقع عند ركن القصّ الأعلى الأيسر (بالصورة المدوَّرة) تُرسم عند (٠،٠)،
   * والتي عند الركن الأسفل الأيمن تُرسم عند (outW، outH). والمعكوسُ يُحسب يدوياً من تعريف الدوران. */
  const srcOf = (rot, rx, ry) => {   // نقطةٌ بالصورة المدوَّرة ⇒ نقطتُها بالمصدر
    if (rot === 0) return [rx, ry];
    if (rot === 90) return [ry, H - rx];
    if (rot === 180) return [W - rx, H - ry];
    return [W - ry, rx];
  };
  for (const rot of [0, 90, 180, 270]) {
    const { w: rw, h: rh } = P.rotatedSize(W, H, rot);
    const plan = P.editPlan(W, H, rot, crop, 1600);
    const [x0, y0] = P.mapPoint(plan.matrix, ...srcOf(rot, crop.x * rw, crop.y * rh));
    const [x1, y1] = P.mapPoint(plan.matrix, ...srcOf(rot, (crop.x + crop.w) * rw, (crop.y + crop.h) * rh));
    check(`تدوير ${rot}: ركنُ القصّ ⇒ (٠،٠) والمقابلُ ⇒ (${plan.outW}،${plan.outH})`,
      near(x0, 0) && near(y0, 0) && near(x1, plan.outW) && near(y1, plan.outH), `(${x0.toFixed(1)},${y0.toFixed(1)}) (${x1.toFixed(1)},${y1.toFixed(1)})`);
  }
  check("rotateBy يدور ويلفّ", P.rotateBy(270, 90) === 0 && P.rotateBy(0, -90) === 270);
}

console.log("▸ المربّع والسحب");
{
  const sq = P.squareIn(4000, 3000);
  check("المربّعُ بالبكسل بالوسط (٣٠٠٠×٣٠٠٠ ⇒ ٠٫٧٥ × ١)", near(sq.w * 4000, 3000, 1e-6) && near(sq.h * 3000, 3000, 1e-6) && near(sq.x, 0.125, 1e-9) && sq.y === 0);
  const d = P.dragCorner(sq, "se", -0.2, -0.05, 4000, 3000, true);
  check("  وسحبُ زاويةٍ بالمربّع يبقيه مربّعاً بالبكسل والزاويةُ المقابلةُ ثابتة",
    near(d.w * 4000, d.h * 3000, 1e-6) && near(d.x, sq.x, 1e-9) && near(d.y, sq.y, 1e-9), JSON.stringify(d));
  const free = P.dragCorner(P.FULL_CROP, "nw", 0.3, 0.1, 4000, 3000, false);
  check("  والحرُّ يتبع الإصبعَ بالبعدين", near(free.x, 0.3, 1e-9) && near(free.y, 0.1, 1e-9) && near(free.w, 0.7, 1e-9) && near(free.h, 0.9, 1e-9));
  const tiny = P.dragCorner(P.FULL_CROP, "se", -2, -2, 4000, 3000, false);
  check("  ولا يصغر تحت الحدّ الأدنى ولا يخرج من الصورة", near(tiny.w * 4000, P.MIN_CROP_PX, 1e-6) && near(tiny.h * 3000, P.MIN_CROP_PX, 1e-6) && tiny.x === 0);
  const mv = P.dragMove({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1);
  check("  والإطارُ المسحوبُ يقف عند الحافة", near(mv.x, 0.6, 1e-9) && mv.y === 0);
}

console.log("▸ الترميز — تحت ١٫٨ ميغا، وخطوةٌ خطوة، وسقفُ الدلو خطأٌ يُقال");
{
  const MB = 1024 * 1024;
  const seq = (sizes) => { const seen = []; return { seen, at: async (s) => { seen.push(`${s.edge}/${s.q}`); return { size: sizes[seen.length - 1] }; } }; };
  const a = seq([1.2 * MB]);
  const ra = await P.encodeWithSteps(P.FULL_STEPS, a.at);
  check("أوّلُ خطوةٍ (١٦٠٠/٠٫٨٢) تكفي إن كانت تحت ١٫٨", ra.step.edge === 1600 && ra.step.q === 0.82 && a.seen.length === 1);
  const b = seq([2.1 * MB, 1.9 * MB, 1.1 * MB]);
  const rb = await P.encodeWithSteps(P.FULL_STEPS, b.at);
  check("  وإلا ٠٫٧٢ ثم ١٢٨٠ — بهذا الترتيب", b.seen.join() === "1600/0.82,1600/0.72,1280/0.72" && rb.step.edge === 1280, b.seen.join());
  const c = seq([2.5 * MB, 2.4 * MB, 2.2 * MB]);
  let thrown = null;
  try { await P.encodeWithSteps(P.FULL_STEPS, c.at); } catch (e) { thrown = e; }
  check("  وفوق سقف الدلو (٢) بعد آخر خطوة ⇒ خطأُ «كبير» يُقال لا رفعٌ يفشل", thrown?.name === "FileTooLargeError" && thrown?.maxMb === 2);
  check("المصغّرةُ ٤٨٠ بجودة ٠٫٧٨، والكاملةُ تبدأ ١٦٠٠/٠٫٨٢", P.THUMB.edge === 480 && P.THUMB.q === 0.78 && P.FULL_STEPS[0].edge === 1600 && P.FULL_STEPS[0].q === 0.82);
  const demo = P.targets(true);
  check("والتجريبيُّ ≤ ٨٠٠ بلا مصغّرة (حصّةُ الجهاز خمسةُ ميغا)", demo.thumb === null && demo.steps.every((s) => s.edge <= 800));
  check("  والسحابيُّ بمصغّرة", P.targets(false).thumb?.edge === 480);
}

console.log("▸ الرسم — أبيضُ قبل الصورة");
{
  const calls = [];
  const ctx = {
    fillStyle: "#000", imageSmoothingEnabled: false, imageSmoothingQuality: "low",
    setTransform: (...m) => calls.push(`T:${m.join(",")}`),
    fillRect: (x, y, w, h) => calls.push(`F:${ctx.fillStyle}:${x},${y},${w},${h}`),
    drawImage: () => calls.push("D"),
  };
  const plan = P.editPlan(100, 50, 0, P.FULL_CROP, 1600);
  P.renderPlan(ctx, plan, {});
  const fi = calls.findIndex((c) => c.startsWith("F:#fff:0,0,100,50"));
  check("PNG شفّافٌ بـJPEG لا يصير أسود: تعبئةٌ بيضاء بكامل اللوحة قبل الرسم", fi >= 0 && fi < calls.indexOf("D"), calls.join(" | "));
  check("  وبتنعيمٍ عالٍ", ctx.imageSmoothingEnabled === true && ctx.imageSmoothingQuality === "high");
}

console.log("▸ الحفظ — الرفعُ (المصغّرةُ أوّلاً بداخله) ثم الربط، وفشلُ الرفع لا يربط شيئاً");
{
  const log = [];
  const okRepo = {
    uploadProductPhoto: async (c, p, ph) => { log.push(ph.thumb ? "thumb" : "no-thumb", "full"); return `${c}/${p}-x.hd.jpg`; },
    setProductImage: async (p, path) => { log.push(`set:${path}`); },
  };
  const photo = { full: { blob: {}, dataUrl: "", ext: "jpg", contentType: "image/jpeg" }, thumb: { blob: {}, dataUrl: "", ext: "jpg", contentType: "image/jpeg" }, previewUrl: "" };
  const path = await P.commitPhoto(okRepo, "c1", "p1", photo);
  check("المصغّرةُ ثم الكاملةُ ثم الربطُ بالمسار الراجع", log.join() === "thumb,full,set:c1/p1-x.hd.jpg" && path === "c1/p1-x.hd.jpg", log.join());
  const log2 = [];
  const badRepo = {
    uploadProductPhoto: async () => { log2.push("thumb"); throw new Error("upload_failed"); },
    setProductImage: async () => { log2.push("set"); },
  };
  let err = null;
  try { await P.commitPhoto(badRepo, "c1", "p1", photo); } catch (e) { err = e; }
  check("  وفشلُ المصغّرة ⇒ لا كاملةَ ولا ربط، والخطأُ يُرمى", err?.message === "upload_failed" && log2.join() === "thumb");
}

console.log("▸ «احفظ وروح للجاية بلا صورة»");
{
  const has = new Set(["b", "d"]);
  const q = ["a", "b", "c", "d", "e"];
  check("التالي بعد الحاليّ مما بلا صورةٍ الآن (b عنده صورة)", P.nextWithoutPhoto(q, "a", (id) => has.has(id)) === "c");
  check("  والقائمةُ لحظةَ الفتح لا تتبدّل بالترتيب الجديد", P.nextWithoutPhoto(q, "c", (id) => has.has(id)) === "e");
  check("  وبآخرها لا شيء", P.nextWithoutPhoto(q, "e", () => false) === null);
}

console.log("▸ كلُّ رفعةٍ لصورة منتجٍ تمرّ من المحرّر");
{
  const files = ["src/pages/ClinicStore.tsx", "src/pages/ProductPhotos.tsx", "src/pages/Inventory.tsx"].map((f) => [f, readFileSync(f, "utf8")]);
  check("لا prepareUpload ولا uploadProductImage بالشاشات الثلاث", files.every(([, s]) => !/prepareUpload\(|uploadProductImage\(/.test(s)), files.filter(([, s]) => /prepareUpload\(|uploadProductImage\(/.test(s)).map(([f]) => f).join());
  check("  وكلُّها تفتح المحرّرَ الكسول", files.every(([, s]) => /lazy\(\(\) => import\("@\/components\/photo\/PhotoEditor"\)\)/.test(s) && s.includes("<PhotoEditor")));
  const repo = readFileSync("src/lib/repo.ts", "utf8") + readFileSync("src/lib/repoDemo.ts", "utf8");
  check("  ولا uploadProductImage بالمستودعين (بابُ الرفع الواحد uploadProductPhoto)", !/uploadProductImage/.test(repo.replace(/\/\*[\s\S]*?\*\//g, "")));
  const ed = readFileSync("src/components/photo/PhotoEditor.tsx", "utf8");
  check("  والمحرّرُ يرمّز بالخطوات ويرسم بـrenderPlan (الأبيض) ويحرس ٢٥ ميغا و٤٠ ميغابكسل",
    /encodeWithSteps\(tg\.steps/.test(ed) && /renderPlan\(ctx, plan/.test(ed) && /MAX_INPUT_MB/.test(ed) && /40_000_000/.test(ed) && /imageOrientation: "from-image"/.test(ed));
  check("  وتعديلُ الحاليّة بايتاتٌ تُجلب (لا <img> عابرٌ يلوّث اللوحة)", /await fetch\(url\)[\s\S]{0,200}res\.blob\(\)/.test(ed));
  check("  ولا framer-motion بالمحرّر (حزمتُه صغيرة)", !/framer-motion/.test(ed));
}

console.log("▸ قناعُ القصّ داخل الصورة وحدها — لا يُعتّم الأزرارَ وبطاقةَ «هكذا تظهر بالمتجر»");
try {
  const ed = readFileSync("src/components/photo/PhotoEditor.tsx", "utf8");
  /* الجذر (لقطةٌ بالوضع الفاتح): ظلُّ 9999px على إطار القصّ لا يقصّه إلا أوّلُ سلفٍ يقصّ — منطقةُ التمرير
   * كلُّها — فالتلميحُ وأزرارُ التدوير والقصّ وبطاقةُ المعاينة تحت حجابٍ أسود ٤٥٪: تبدو معطَّلة، والبطاقةُ
   * التي وُضعت لتُري الصورةَ كما هي تُريها أغمق. */
  check("لا ظلَّ قناعٍ بلا حدّ (9999px) بالمحرّر", !/9999px/.test(ed));
  check("  والقناعُ أحزمةُ maskBands داخل غلاف الصورة نفسِه", /maskBands\(crop\)\.map\(/.test(ed) && /data-ed-mask/.test(ed));
  const B = P.maskBands;
  if (typeof B !== "function") throw new Error("maskBands غير موجودة");
  const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
  const inside = (r) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9 && r.w >= -1e-9 && r.h >= -1e-9;
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const c of [{ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, P.FULL_CROP, P.squareIn(4000, 3000), { x: 0, y: 0.5, w: 1, h: 0.5 }, { x: 0.7, y: 0, w: 0.3, h: 0.25 }]) {
    const bands = B(c);
    const sum = bands.reduce((s, r) => s + area(r), 0);
    const pairs = bands.flatMap((a, i) => bands.slice(i + 1).map((b) => overlap(a, b)));
    check(`قصّ ${JSON.stringify(c)}: الأحزمةُ تغطّي ما حوله بالضبط (${(1 - area(c)).toFixed(3)}) داخل الصورة، ولا تمسّ القصّ ولا بعضَها`,
      Math.abs(sum - (1 - area(c))) < 1e-9 && bands.every(inside) && bands.every((r) => overlap(r, c) < 1e-12) && pairs.every((o) => o < 1e-12), `${sum}`);
  }
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

console.log("▸ المحرّرُ يقول ما فعله مضيفُه: «انحفظت» حين حُفظت، و«جاهزة — تنحفظ وية المنتج» حين تنتظر");
try {
  const ed = readFileSync("src/components/photo/PhotoEditor.tsx", "utf8");
  const inv = readFileSync("src/pages/Inventory.tsx", "utf8");
  const hosts = { "src/pages/ClinicStore.tsx": "now", "src/pages/ProductPhotos.tsx": "now", "src/pages/Inventory.tsx": "with-product" };
  /* الجذر (قيس بالتجريبيّ): نموذجُ المخزون يحتفظ بالصورة حتى يُحفظ المنتج، والمحرّرُ يقول «انحفظت الصورة»
   * بصوت النجاح على أيّ حال — فالطبيبُ يصدّق ويُغلق النموذج (X/Esc) وimage_path ما زال null بلا سؤال. */
  check("المحرّرُ يطلب من كلّ مضيفٍ أن يُعلن متى يُحفظ (saves إلزاميّ)", /\bsaves: SaveMode;/.test(ed));
  check("  والمضيفون الثلاثة يُعلنون: المتجرُ وصفحةُ المصوّر الآن، والمخزونُ مع المنتج",
    Object.entries(hosts).every(([f, m]) => new RegExp(`<PhotoEditor[\\s\\S]{0,400}?saves="${m}"`).test(readFileSync(f, "utf8"))));
  check("  ورسالتُه بعد الحفظ والفكّ والإرجاع من editorNotice وحدها (لا «انحفظت» ثابتة)",
    /const n = editorNotice\(p\.saves, act\);/.test(ed) && /await p\.onPhoto\(photo\);\s*say\("photo"\);/.test(ed) && /await p\.onPath\(path\);\s*say\(path \? "relink" : "unlink"\);/.test(ed)
    && !/toast\.success\(t\("imged\.(saved|unlinked|relinked)"/.test(ed));
  check("نموذجُ المخزون: البلاطةُ تقول «ما انحفظت بعد» ما دامت صورةٌ تنتظر حفظَ المنتج", /photoPending &&[\s\S]{0,300}data-photopending/.test(inv));
  check("  وإغلاقُه وصورةٌ تنتظر يسأل بورقة (confirmClose) — لا تضيع بلا كلمة ولا window.confirm",
    /confirmClose=\{confirmPhotoClose\}/.test(inv) && /data-photoleave/.test(inv) && /const confirmPhotoClose = \(\) => \{ if \(!photoPending\) return true; setAskPhoto\(true\); return false; \};/.test(inv));
  const N = P.editorNotice;
  if (typeof N !== "function") throw new Error("editorNotice غير موجودة");
  const kinds = ["photo", "unlink", "relink"];
  check("editorNotice «now»: انحفظت/انفصلت/رجعت بنبرة النجاح",
    JSON.stringify(kinds.map((k) => N("now", k))) === JSON.stringify([{ key: "imged.saved", tone: "success" }, { key: "imged.unlinked", tone: "success" }, { key: "imged.relinked", tone: "success" }]));
  check("  و«with-product»: لا «انحفظت» ولا نبرةُ نجاح — تنتظر حفظَ المنتج",
    kinds.every((k) => { const n = N("with-product", k); return n.tone === "info" && !["imged.saved", "imged.unlinked", "imged.relinked"].includes(n.key); }));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

console.log(fails ? `\n✗ photo-pipeline-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ photo-pipeline-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
