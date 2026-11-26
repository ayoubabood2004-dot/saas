/* ============================================================================
 * كاتالوجُ PDF ⇒ صورٌ بأسمائها (src/lib/pdfCatalogLayout.ts و readPdfPage من pdfCatalog.ts).
 *
 * (أ) القرارُ على صفحاتٍ مصنوعة بالأشكال التي تُصنع فعلاً: شبكةُ بطاقات (الاسمُ تحت الصورة)، وجدولٌ (الرمزُ والسعرُ
 *     بأعمدةٍ بعيدة بصفّ الصورة)، وشعارٌ ورأسٌ يتكرّران، وأيقونةٌ صغيرة، وخلفيّةٌ تغطّي الصفحة، وسطرٌ عربيٌّ مقاطعُه
 *     بمواضعها، وصفحةٌ مصوّرة بلا نصّ.
 * (ب) pdf.js الحقيقيّ على ملفٍّ يصنعه jsPDF: صورٌ بمواضعها وأسماءٌ تحتها ⇒ الأسماءُ والرموزُ نفسُها.
 * ثمّ طفراتٌ على المصدر يجب أن يمسكها الفحص.
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const SRC = "src/lib/pdfCatalogLayout.ts";
async function bundle(contents, sourcefile) {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: "src/lib", loader: "ts", sourcefile },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
    external: ["pdfjs-dist/*"],
  });
  const dir = mkdtempSync(join(tmpdir(), "pdfcat-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

const W = 595, H = 842;
const img = (page, key, x0, y0, x1, y1, w = 400, h = 400) => ({ page, key, x0, y0, x1, y1, w, h });
const txt = (page, str, x0, y0, x1, size = 10, rtl) => ({ page, str, x0, y0, x1, y1: y0 + size, rtl });

/** شبكةُ ٣×٢ بطاقات بصفحة، ورأسٌ وشعارٌ وتذييلٌ بكلّ صفحة. */
function gridPages(n) {
  const pages = [];
  let k = 0;
  for (let p = 1; p <= n; p++) {
    const images = [img(p, `logo${p}`, 30, 20, 130, 60, 300, 120)];          // شعارٌ متكرّر
    const texts = [txt(p, "Pet Line Distribution — Catalog 2026", 200, 30, 450, 12), txt(p, "www.petline.example", 230, 810, 380, 8)];
    images.push(img(p, `icon${p}`, 540, 20, 556, 36, 32, 32));                  // أيقونة صغيرة
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x0 = 40 + c * 180, y0 = 100 + r * 340;
      k++;
      images.push(img(p, `g${k}`, x0, y0, x0 + 150, y0 + 150));
      texts.push(txt(p, `Product ${k} Kitten Food`, x0, y0 + 160, x0 + 140, 11));
      texts.push(txt(p, `${2 * k} kg`, x0, y0 + 175, x0 + 40, 10));
      texts.push(txt(p, String(4006381333931 + 0), x0, y0 + 190, x0 + 90, 9));   // يُبدَّل أدناه
      texts.push(txt(p, `Price: ${15000 + k} IQD`, x0, y0 + 205, x0 + 90, 9));
    }
    pages.push({ page: p, width: W, height: H, images, texts });
  }
  return pages;
}

async function run(L, quiet = false) {
  let fails = 0, passes = 0;
  const check = (name, cond, detail = "") => {
    if (cond) { passes++; if (!quiet) console.log(`   ✓ ${name}`); }
    else { fails++; if (!quiet) console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
  };

  // ── خانةُ التحقّق ──
  check("EAN-13 صالح (4006381333931)", L.gtinValid("4006381333931"));
  check("UPC-A صالح (036000291452)", L.gtinValid("036000291452"));
  check("EAN-8 صالح (96385074)", L.gtinValid("96385074"));
  check("رقمٌ أخيرٌ غلط مرفوض", !L.gtinValid("4006381333932"));
  check("تسعةُ أرقام ليست GTIN", !L.gtinValid("123456789"));

  // ── سطرُ المنتج ──
  const e1 = L.parseEntry(["Royal Canin Kitten", "2 kg", "Barcode: 3182550702973", "Price: 45,000 IQD"]);
  check("الاسمُ أسطرٌ مجموعة بلا السعر ولا عنوان الرمز", e1.name === "Royal Canin Kitten 2 kg", e1.name);
  check("  والباركودُ من «Barcode: …»", e1.barcode === "3182550702973", String(e1.barcode));
  const e2 = L.parseEntry(["Whiskas ١٢٣٤٥٦٧٨٩٠١٢٨ Tuna"]);
  check("رمزٌ وسط السطر بأرقامٍ شرقية يُستخرج ويُشال من الاسم", e2.barcode === "1234567890128" && e2.name === "Whiskas Tuna", JSON.stringify(e2));
  const e3 = L.parseEntry(["Felix 12345678", "4006381333931"]);
  check("الصالحُ بخانة التحقّق يتقدّم على غيره", e3.barcode === "4006381333931", String(e3.barcode));
  const e4 = L.parseEntry(["السعر 12,000 دينار", "رويال كانين قطط"]);
  check("سطرُ سعرٍ عربيّ لا يدخل الاسم", e4.name === "رويال كانين قطط", e4.name);
  const e6 = L.parseEntry(["Felix Salmon", "Barcode 7613034152671"]);
  check("«Barcode 761…» بلا فاصل: العنوانُ لا يدخل الاسم", e6.name === "Felix Salmon" && e6.barcode === "7613034152671", JSON.stringify(e6));
  const e5 = L.parseEntry(["15,000", "2026/01/01"]);
  check("أرقامٌ وحدها ليست اسماً", e5.name === "", e5.name);

  // ── الأسطر ──
  const rtl = L.linesOf([txt(1, "كانين", 150, 100, 200), txt(1, "رويال", 210, 100, 255), txt(1, "قطط", 100, 100, 140)]);
  check("سطرٌ عربيٌّ يُقرأ يميناً ⇐ يساراً", rtl.length === 1 && rtl[0].text === "رويال كانين قطط", JSON.stringify(rtl.map((x) => x.text)));
  const twoCols = L.linesOf([txt(1, "Name A", 100, 100, 160), txt(1, "4006381333931", 400, 100, 480)]);
  check("خانتا جدولٍ متباعدتان سطران لا سطر", twoCols.length === 2, JSON.stringify(twoCols.map((x) => x.text)));

  // ── الشبكة ──
  const pages = gridPages(3);
  // رمزٌ صالحٌ مختلفٌ لكلّ بطاقة (خانةُ تحقّقٍ محسوبة)
  const ean = (n) => { const b = String(629000000000 + n); let s = 0; for (let i = 0; i < 12; i++) s += +b[i] * (i % 2 ? 3 : 1); return b + ((10 - (s % 10)) % 10); };
  let k = 0;
  for (const pg of pages) for (const t of pg.texts) if (t.str === "4006381333931") t.str = ean(++k);
  const r = L.readCatalog(pages);
  check("١٨ منتجاً من ٣ صفحات (٦ بكلّ صفحة)", r.entries.length === 18, String(r.entries.length));
  check("  والشعارُ المتكرّر والأيقونةُ خارجها", r.dropped.repeated === 3 && r.dropped.small === 3, JSON.stringify(r.dropped));
  const g5 = r.entries.find((e) => e.image.key === "g5");
  check("بطاقة ٥: الاسمُ والحجمُ تحتها", g5?.name === "Product 5 Kitten Food 10 kg", g5?.name);
  check("  ورمزُها رمزُها (لا رمزُ جارتها)", g5?.barcode === ean(5), String(g5?.barcode));
  check("  والسعرُ ليس من الاسم", !/price|iqd/i.test(g5?.name ?? ""));
  check("الرأسُ والتذييلُ المتكرّران لا يدخلان أيَّ اسم", r.entries.every((e) => !/catalog|www/i.test(e.name)));
  check("كلُّ الرموز صالحةٌ ومختلفة", new Set(r.entries.map((e) => e.barcode)).size === 18 && r.entries.every((e) => L.gtinValid(e.barcode)));

  // ── كاتالوجٌ بصفحتين: الشعارُ والرأسُ على الاثنتين ──
  const two = L.readCatalog(gridPages(2));
  check("صفحتان: الشعارُ خارجها والرأسُ ليس اسماً", two.entries.length === 12 && two.dropped.repeated === 2 && two.entries.every((e) => !/catalog/i.test(e.name)), JSON.stringify(two.dropped));

  // ── خلفيّةٌ تغطّي الصفحة ──
  const bg = L.readCatalog([{ page: 1, width: W, height: H, images: [img(1, "bg", 0, 0, W, H, 2000, 2800), img(1, "a", 100, 100, 250, 250)], texts: [txt(1, "Item A", 100, 260, 160)] }]);
  check("الخلفيّةُ خارجها والصورةُ التي فوقها تبقى", bg.dropped.background === 1 && bg.entries.length === 1 && bg.entries[0].name === "Item A", JSON.stringify(bg.entries.map((e) => e.name)));

  // ── كاتالوجٌ مصمَّم (Canva — مقيسٌ على كاتالوج المالك ٢٥/١١): صورةٌ واحدة لكلّ صفحة، أعرضُ من الصفحة، وصفرُ نصّ ──
  const canva = L.readCatalog([1, 2, 3].map((p) => ({ page: p, width: 810, height: 1012, texts: [],
    images: [img(p, `c${p}`, -726, -40, 1536, 1052, 2400, 1074)] })));
  check("صورةٌ وحدها تغطّي الصفحة هي المنتج لا خلفيّة", canva.entries.length === 3 && canva.dropped.background === 0, JSON.stringify(canva.dropped));
  const c1 = canva.entries[0]?.image;
  check("  وصندوقُها مقصوصٌ بحدود الصفحة", c1 && c1.x0 === 0 && c1.y0 === 0 && c1.x1 === 810 && c1.y1 === 1012, JSON.stringify(c1));
  check("  ودقّتُها من صندوقها قبل القصّ (٢٤٠٠ بكسل على ٢٬٢٦٢ نقطة)", c1 && Math.abs(c1.ppu - 2400 / 2262) < 1e-9, String(c1?.ppu));
  check("  والصفحاتُ بلا نصّ تُقال", canva.scanned.join() === "1,2,3", canva.scanned.join());
  check("  والصورةُ نفسُها بموضعها بكلّ صفحة ليست شعاراً (لا بهامش)", canva.dropped.repeated === 0);
  const twoBig = L.readCatalog([{ page: 1, width: W, height: H, texts: [], images: [img(1, "bgA", 0, 0, W, H, 2000, 2800), img(1, "bgB", -20, -20, W + 20, H + 20, 2000, 2800)] }]);
  check("صورتان تغطّيان الصفحة وحدهما تبقيان (لا شيءَ غيرُهما يُحمى)", twoBig.entries.length === 2, String(twoBig.entries.length));

  // ── الجدول: صورةٌ بعمود، والاسمُ والرمزُ والسعرُ بأعمدةٍ جنبها ──
  const table = { page: 1, width: W, height: H, images: [], texts: [] };
  for (let i = 0; i < 5; i++) {
    const y = 80 + i * 90;
    table.images.push(img(1, `t${i}`, 40, y, 110, y + 70));
    table.texts.push(txt(1, `Dog Shampoo ${i + 1}`, 130, y + 30, 250, 10));
    table.texts.push(txt(1, ean(100 + i), 400, y + 30, 480, 9));
    table.texts.push(txt(1, `${9000 + i} IQD`, 510, y + 30, 560, 9));
  }
  const tr = L.readCatalog([table]);
  const t3 = tr.entries.find((e) => e.image.key === "t3");
  check("جدول: الاسمُ من خانته", t3?.name === "Dog Shampoo 4", t3?.name);
  check("  والرمزُ من عمودٍ بعيد بصفّها", t3?.barcode === ean(103), String(t3?.barcode));
  check("  ولكلّ صفٍّ رمزُه", tr.entries.every((e, i) => e.barcode === ean(100 + Number(e.image.key.slice(1)))));

  // ── سطرٌ بين صورتين: الاسمُ تحت الأولى أقربُ لها من الثانية تحته ──
  const between = L.readCatalog([{ page: 1, width: W, height: H, images: [img(1, "up", 100, 100, 250, 250), img(1, "down", 100, 300, 250, 450)],
    texts: [txt(1, "Upper Name", 100, 262, 200), txt(1, "Lower Name", 100, 460, 200)] }]);
  check("سطرٌ بين صورتين للتي فوقه (الاسمُ تحت الصورة)", between.entries.find((e) => e.image.key === "up")?.name === "Upper Name" && between.entries.find((e) => e.image.key === "down")?.name === "Lower Name");

  // شبكةٌ ضيّقة: الاسمُ ١٨ نقطة تحت صورته والصفُّ التالي يبدأ ١٥ نقطة تحته — الأقربُ هندسيّاً التي تحته،
  // والاسمُ للتي فوقه (وزنُ الجهة).
  const tight = L.readCatalog([{ page: 1, width: W, height: H, images: [img(1, "down", 100, 293, 250, 443), img(1, "up", 100, 100, 250, 250)],
    texts: [txt(1, "Tight Name", 100, 268, 200)] }]);
  check("شبكةٌ ضيّقة: الاسمُ للصورة فوقه ولو كانت التي تحته أقرب", tight.entries.find((e) => e.image.key === "up")?.name === "Tight Name", JSON.stringify(tight.entries.map((e) => [e.image.key, e.name])));

  // ── صفحةٌ مصوّرة ──
  const sc = L.readCatalog([{ page: 1, width: W, height: H, images: [img(1, "scan", 0, 0, W, H, 2480, 3508)], texts: [] }, { page: 2, width: W, height: H, images: [img(2, "x", 50, 50, 200, 200)], texts: [txt(2, "Item X", 50, 210, 100)] }]);
  check("صفحةٌ بلا نصّ تُعدّ مصوّرة", sc.scanned.join() === "1");
  check("  وصورةٌ بلا سطرٍ قريب اسمُها فارغ (تُصحَّح بالمراجعة)", L.readCatalog([{ page: 1, width: W, height: H, images: [img(1, "lonely", 50, 50, 150, 150)], texts: [txt(1, "Far away note", 400, 780, 500)] }]).entries[0].name === "");

  return { fails, passes };
}

console.log("▸ pdf-catalog (أ) القرار");
const src = readFileSync(SRC, "utf8");
const base = await run(await bundle(src, "pdfCatalogLayout.ts"));

/* ── (ب) pdf.js الحقيقيّ على ملفٍّ يصنعه jsPDF ── */
console.log("▸ pdf-catalog (ب) pdf.js على ملفٍّ مصنوع");
let realFails = 0, realPasses = 0;
const rcheck = (name, cond, detail = "") => {
  if (cond) { realPasses++; console.log(`   ✓ ${name}`); } else { realFails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
{
  // PNG صغيرٌ بلونٍ واحد (IHDR/IDAT/IEND)
  const png = (w, h, rgb) => {
    const crc = (b) => { const t = zlib.crc32(b); const o = Buffer.alloc(4); o.writeUInt32BE(t >>> 0); return o; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([len, td, crc(td)]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const items = [["Royal Canin Kitten", "3182550702973"], ["Whiskas Tuna Pouch", "5000166071001"], ["Pro Plan Adult", "7613035120402"], ["Felix Salmon", "7613034152671"]];
  items.forEach(([name, code], i) => {
    const x = 60 + (i % 2) * 260, y = 80 + Math.floor(i / 2) * 300;
    const data = "data:image/png;base64," + png(120, 120, [40 * i, 120, 200 - 30 * i]).toString("base64");
    doc.addImage(data, "PNG", x, y, 180, 180);
    doc.setFontSize(12); doc.text(name, x, y + 200);
    doc.setFontSize(9); doc.text(code, x, y + 215);
    doc.text(`Price ${10000 + i * 500} IQD`, x, y + 228);
  });
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const C = await bundle(readFileSync("src/lib/pdfCatalog.ts", "utf8").replace('import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")', 'Promise.resolve({ default: "" })'), "pdfCatalog.ts");
  const L = await bundle(src, "pdfCatalogLayout.ts");
  const page = await C.readPdfPage(pdfjs.OPS, await pdf.getPage(1), 1);
  rcheck("أربعُ صورٍ بمواضعها", page.images.length === 4, String(page.images.length));
  const first = page.images.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)[0];
  rcheck("  أوّلُها عند (60، 80) بعرض ١٨٠ من أعلى الصفحة", Math.abs(first.x0 - 60) < 1 && Math.abs(first.y0 - 80) < 1 && Math.abs(first.x1 - first.x0 - 180) < 1, JSON.stringify(first));
  rcheck("  وأبعادُها الأصليّة ١٢٠×١٢٠", first.w === 120 && first.h === 120, `${first.w}x${first.h}`);
  const r = L.readCatalog([page]);
  for (const [name, code] of items) {
    const e = r.entries.find((x) => x.barcode === code);
    rcheck(`«${name}» برمزه ${code}`, e?.name === name, JSON.stringify(e && { name: e.name, lines: e.lines }));
  }
  await pdf.destroy();
}

// ── طفرات ──
const MUTS = [
  ["الشعارُ المتكرّر يبقى", "if (margin && (seen.get(shapeKey(raw))?.size ?? 0) >= repeatMin(pages.length)) { dropped.repeated++; continue; }", ""],
  ["التكرارُ وحده شعار (الشبكةُ تُرمى)", "if (margin && (seen.get(shapeKey(raw))?.size ?? 0) >= repeatMin(pages.length))", "if ((seen.get(shapeKey(raw))?.size ?? 0) >= repeatMin(pages.length))"],
  ["ملفٌّ بصفحتين بلا تكرار", "const repeatMin = (pages: number) => Math.max(2, Math.ceil(pages / 2));", "const repeatMin = (pages: number) => Math.max(3, Math.ceil(pages / 2));"],
  ["«Item A» يفقد أوّلَه", "\\s*[:：#-]\\s*/iu; /* i18n-data: عناوينُ الحقول بأوراق الموزّعين تُشال من الاسم */", "\\s*[:：#-]?\\s*/iu; /* i18n-data: عناوينُ الحقول بأوراق الموزّعين تُشال من الاسم */"],
  ["عنوانُ الرمز وحده يدخل الاسم", "if (!rest || LABEL_ONLY.test(rest) || NUMERIC_ONLY.test(rest)", "if (!rest || NUMERIC_ONLY.test(rest)"],
  ["خانةُ الجدول البعيدة لا تُنسب", "const lim = sameRow(l, im) ? Infinity : Math.max(im.x1 - im.x0, im.y1 - im.y0) * 0.9;", "const lim = Math.max(im.x1 - im.x0, im.y1 - im.y0) * 0.9;"],
  ["العربيُّ بترتيب المواضع", "const ordered = rtl ? [...g].reverse() : g;", "const ordered = g;"],
  ["فوقَ الصورة كتحتها", "const wy = above > 0 && above >= below ? 1.5 : 1;", "const wy = 1;"],
  ["الرمزُ الأوّل لا الصالح", "const barcode = codes.find(gtinValid) ?? codes[0] ?? null;", "const barcode = codes[0] ?? null;"],
  ["السعرُ يدخل الاسم", "NUMERIC_ONLY.test(rest) || PRICE.test(rest)) continue;", "NUMERIC_ONLY.test(rest)) continue;"],
  ["الرأسُ المتكرّر يدخل", "const lines = allLines[idx].filter((l) => !repeatedLine(l.text));", "const lines = allLines[idx];"],
  ["الخلفيّةُ تبقى", "if (hasOthers && isBg(im)) { dropped.background++; continue; }", ""],
  ["صورةُ Canva الوحيدة تُرمى خلفيّةً", "const hasOthers = kept.some((im) => !isBg(im));", "const hasOthers = true;"],
  ["الصورةُ الأعرضُ من الصفحة لا تُقصّ", "x0: Math.max(0, raw.x0), y0: Math.max(0, raw.y0), x1: Math.min(pg.width, raw.x1), y1: Math.min(pg.height, raw.y1)", "x0: raw.x0, y0: raw.y0, x1: raw.x1, y1: raw.y1"],
  ["الدقّةُ من الصندوق المقصوص", "const rw = raw.x1 - raw.x0, rh = raw.y1 - raw.y0;", "const rw = Math.min(pg.width, raw.x1) - Math.max(0, raw.x0), rh = Math.min(pg.height, raw.y1) - Math.max(0, raw.y0);"],
  ["الصفُّ لا ينقسم بالفجوة", "if (prev && it.x0 - prev.x1 <= Math.max(prev.hgt, it.hgt) * 2) g.push(it); else groups.push([it]);", "if (prev) g.push(it); else groups.push([it]);"],
];
let caught = 0, escaped = 0;
for (const [name, from, to] of MUTS) {
  if (!src.includes(from)) { escaped++; console.error(`   ✗ طفرة «${name}»: ما لكيت نصَّها`); continue; }
  let res;
  try { res = await run(await bundle(src.replace(from, to), "m.ts"), true); } catch { res = { fails: 1 }; }
  if (res.fails > 0) { caught++; console.log(`   ✓ طفرة «${name}» انمسكت`); }
  else { escaped++; console.error(`   ✗ طفرة «${name}» مرّت`); }
}

const fails = base.fails + realFails + escaped;
console.log(`${fails ? "✗" : "✓"} pdf-catalog-test: ${base.passes + realPasses} نجح، ${base.fails + realFails} فشل، وطفرات ${caught}/${MUTS.length}`);
process.exit(fails ? 1 : 0);
