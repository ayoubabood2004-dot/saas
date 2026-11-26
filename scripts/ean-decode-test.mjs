/* ============================================================================
 * قراءةُ الباركود من صورة (src/lib/eanDecode.ts) وقصُّ الحافّة البيضاء (src/lib/imageTrim.ts) — بسلوكهما.
 *
 * الصورُ مرسومةٌ هنا كما تخرج من رسم PDF: عرضُ الوحدة كسرٌ من البكسل (تنعيم حوافّ)، وضبابٌ وضجيج، ومنتجٌ
 * ملوّن حول الباركود، ومقلوبةٌ ١٨٠° أو مدارةٌ ٩٠°. والسلبيّات: ضجيجٌ وخطوطٌ عشوائيّة وخانةُ تحقّقٍ غلط وسطرٌ
 * واحد ورمزان بالأصوات نفسِها — كلُّها «لا شيء» لا تخمين. ثمّ طفراتٌ على المصدرين يجب أن يمسكها الفحص.
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EAN = "src/lib/eanDecode.ts", TRIM = "src/lib/imageTrim.ts";
async function load(contents, sourcefile) {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: "src/lib", loader: "ts", sourcefile },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
  });
  const dir = mkdtempSync(join(tmpdir(), "ean-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}
const G = await load(readFileSync("src/lib/barcodeGen.ts", "utf8"), "barcodeGen.ts");

/* EAN-8 بالجداول القياسيّة (الرسّامُ بالمستودع لـEAN-13 وحده). */
const LC = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const RC = LC.map((p) => p.replace(/./g, (b) => (b === "1" ? "0" : "1")));
const ean8Modules = (c) => "101" + [...c.slice(0, 4)].map((d) => LC[+d]).join("") + "01010" + [...c.slice(4)].map((d) => RC[+d]).join("") + "101";
/* EAN-13 بخانة تحقّقٍ غلط: الرسّامُ يرفضه، فالوحدات تُبنى من الصالح ويُبدَّل آخرُ رقم. */
const RR = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const badCheckModules = (valid, wrongLast) => G.ean13Modules(valid).slice(0, 95 - 3 - 7) + RR[wrongLast] + "101";

/** حجرٌ عشوائيّ ثابت (LCG) — الصورُ نفسُها بكلّ تشغيل. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/**
 * صورةٌ رماديّة (قناةٌ واحدة) بحجم w×h بخلفيّةٍ «منتج» (تدرّجٌ ملوّن) وباركودٍ بعرض وحدةٍ `mod` (كسرٌ مسموح — الحافّةُ
 * بنسبة تغطيتها) من (x, y) بارتفاع bh، ثمّ ضبابٌ أفقيّ `blur` وضجيجٌ `noise`.
 */
function scene({ w = 520, h = 300, bars = [], blur = 0, noise = 0, seed = 1, bg = true }) {
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = bg ? 150 + 60 * Math.sin(x / 37) * Math.cos(y / 23) : 255;
  for (const b of bars) {
    const { modules, x: bx, y: by, mod, bh, quiet = 10 } = b;
    const x0 = bx - quiet * mod, x1 = bx + (modules.length + quiet) * mod;
    for (let y = by; y < by + bh && y < h; y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
        // تغطيةُ البكسل [x, x+1) بالأشرطة
        let ink = 0;
        for (let k = Math.max(0, Math.floor((x - bx) / mod)); k <= Math.floor((x + 1 - bx) / mod) && k < modules.length; k++) {
          if (modules[k] !== "1") continue;
          const a = Math.max(x, bx + k * mod), z = Math.min(x + 1, bx + (k + 1) * mod);
          if (z > a) ink += z - a;
        }
        d[y * w + x] = 255 * (1 - ink) + 20 * ink;
      }
    }
  }
  let out = d;
  if (blur > 0) {
    out = new Float32Array(w * h);
    const r = Math.ceil(blur * 2), ws = [];
    for (let i = -r; i <= r; i++) ws.push(Math.exp(-(i * i) / (2 * blur * blur)));
    const sum = ws.reduce((a, b) => a + b, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += d[y * w + Math.min(w - 1, Math.max(0, x + i))] * ws[i + r];
      out[y * w + x] = v / sum;
    }
  }
  const R = rng(seed);
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) data[i] = out[i] + (noise ? (R() - 0.5) * 2 * noise : 0);
  return { data, width: w, height: h, channels: 1 };
}
const rot180 = (im) => ({ ...im, data: Uint8ClampedArray.from(im.data).reverse() });
const rot90 = (im) => {
  const { width: w, height: h } = im, data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[x * h + (h - 1 - y)] = im.data[y * w + x];
  return { ...im, data, width: h, height: w };
};
const toRGBA = (im) => {
  const data = new Uint8ClampedArray(im.width * im.height * 4);
  // باركودٌ أحمر على أبيض: القناةُ الحمراء وحدها بلا تباين، والسطوعُ (٠٫٢٩٩ أحمر + ٠٫٥٨٧ أخضر + ٠٫١١٤ أزرق) يراه.
  for (let i = 0; i < im.width * im.height; i++) { const v = im.data[i]; data.set([255 - (255 - v) * 0.06, v, v, 255], i * 4); }
  return { data, width: im.width, height: im.height, channels: 4 };
};

async function run(E, T, quiet = false) {
  let fails = 0, passes = 0;
  const check = (name, cond, detail = "") => {
    if (cond) { passes++; if (!quiet) console.log(`   ✓ ${name}`); }
    else { fails++; if (!quiet) console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
  };
  const bar = (code, extra = {}) => ({ modules: G.ean13Modules(code), x: 60, y: 90, mod: 3, bh: 90, ...extra });

  // ── خانةُ التحقّق ──
  check("خانةُ تحقّق EAN-13 / EAN-8 / UPC-A", E.checkDigitOk("4006381333931") && E.checkDigitOk("96385074") && E.checkDigitOk("036000291452"));
  check("  والغلطُ والطولُ الغريب مرفوضان", !E.checkDigitOk("4006381333932") && !E.checkDigitOk("1234567") && !E.checkDigitOk("40063813339a1"));

  // ── القراءة ──
  const codes = ["6970967773283", "4006381333931", "5000166071000", "3182550702973", "7613034152671", "6291234567894"];
  let ok = 0;
  for (const [i, c] of codes.entries()) if (E.decodeEan(scene({ bars: [bar(c)], seed: i + 1 })) === c) ok++;
  check("ستّةُ رموزٍ بوحدةٍ صحيحة فوق صورة منتج", ok === codes.length, `${ok}/${codes.length}`);
  check("وحدةٌ بكسرٍ من البكسل (٢٫٣) وضبابٌ وضجيج", E.decodeEan(scene({ bars: [bar("6970967773306", { mod: 2.3 })], blur: 0.7, noise: 14, seed: 7 })) === "6970967773306");
  check("وحدةٌ ١٫٢ بكسل (الباركودُ صغيرٌ بالصورة — الحافّةُ بكسرٍ من البكسل)", E.decodeEan(scene({ bars: [bar("6970967773276", { mod: 1.2 })], seed: 8 })) === "6970967773276");
  check("وحدةٌ ١٫٧ وضبابٌ ٠٫٨ (الشريطُ النحيف لا يبلغ السواد — الحافّةُ بالانحدار)", E.decodeEan(scene({ bars: [bar("3182550702973", { mod: 1.7 })], blur: 0.8, noise: 10, seed: 20 })) === "3182550702973");
  check("صورةٌ بأربع قنوات (RGBA من القماش، باركودٌ أحمر)", E.decodeEan(toRGBA(scene({ bars: [bar("6970967773269", { mod: 2.6 })], seed: 9 }))) === "6970967773269");
  check("مقلوبةٌ ١٨٠°", E.decodeEan(rot180(scene({ bars: [bar("4006381333931", { mod: 2.4 })], seed: 10 }))) === "4006381333931");
  check("مدارةٌ ٩٠° (علبةٌ واقفة)", E.decodeEan(rot90(scene({ bars: [bar("5000166071000", { mod: 2.4 })], seed: 11 }))) === "5000166071000");
  check("UPC-A يُحفظ ١٢ رقماً كما يُخرجه الماسح", E.decodeEan(scene({ bars: [bar("0036000291452")], seed: 12 })) === "036000291452");
  check("EAN-8", E.decodeEan(scene({ bars: [{ modules: ean8Modules("96385074"), x: 80, y: 90, mod: 3, bh: 90 }], seed: 13 })) === "96385074");

  // ── لا تخمين ──
  check("ضجيجٌ وحده ⇒ لا شيء", E.decodeEan(scene({ bars: [], noise: 90, seed: 14 })) === null);
  const R = rng(15);
  const junk = Array.from({ length: 95 }, () => (R() < 0.5 ? "1" : "0")).join("");
  check("خطوطٌ عشوائيّة بحجم باركود ⇒ لا شيء", E.decodeEan(scene({ bars: [{ modules: "101" + junk.slice(3, 92) + "101", x: 60, y: 90, mod: 3, bh: 90 }], seed: 15 })) === null);
  check("خانةُ تحقّقٍ غلط ⇒ لا شيء", E.decodeEan(scene({ bars: [{ modules: badCheckModules("4006381333931", 2), x: 60, y: 90, mod: 3, bh: 90 }], seed: 16 })) === null);
  check("سطرٌ واحد (صوتٌ واحد) ⇒ لا شيء", E.decodeEan(scene({ bars: [bar("4006381333931", { y: 90, bh: 1 })], seed: 17 })) === null);
  check("رمزان بالأصوات نفسِها ⇒ لا شيء (لا يُختار أحدُهما)", E.decodeEan(scene({ h: 300, bars: [bar("4006381333931", { y: 20, bh: 60 }), bar("5000166071000", { y: 180, bh: 60 })], seed: 18 })) === null);
  check("  وبأصواتٍ أكثر لأحدهما ⇒ الأكثر", E.decodeEan(scene({ h: 300, bars: [bar("4006381333931", { y: 20, bh: 100 }), bar("5000166071000", { y: 200, bh: 40 })], seed: 19 })) === "4006381333931");

  // ── القصّ ──
  const rgba = (w, h, fill) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(fill, i * 4); return d; };
  const paint = (d, w, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.set(c, (y * w + x) * 4); };
  const a = rgba(400, 300, [255, 255, 255, 255]);
  paint(a, 400, 100, 50, 200, 150, [200, 40, 40, 255]);
  const ra = T.trimRect(a, 400, 300, { pad: 0 });
  check("منتجٌ وسط بياض ⇒ صندوقُه وحده", ra.x >= 98 && ra.x <= 100 && ra.y >= 48 && ra.y <= 50 && ra.x + ra.w >= 200 && ra.x + ra.w <= 203 && ra.y + ra.h >= 150 && ra.y + ra.h <= 153, JSON.stringify(ra));
  const rp = T.trimRect(a, 400, 300);
  check("  والهامشُ الافتراضيّ ٢٪ حوله", rp.x < ra.x && rp.w > ra.w && rp.x >= 95, JSON.stringify(rp));
  const b = rgba(400, 300, [0, 0, 0, 0]);
  paint(b, 400, 30, 200, 90, 290, [10, 120, 30, 255]);
  const rb = T.trimRect(b, 400, 300, { pad: 0 });
  check("الشفّافُ خلفيّةٌ كالأبيض", rb.x >= 28 && rb.x <= 30 && rb.y >= 198 && rb.w <= 63 && rb.h <= 93, JSON.stringify(rb));
  const c = rgba(400, 300, [244, 244, 244, 255]);
  paint(c, 400, 150, 100, 250, 200, [30, 30, 30, 255]);
  const rc = T.trimRect(c, 400, 300, { pad: 0 });
  check("الأبيضُ المكسور (٢٤٤ — ورقُ Canva) خلفيّة", rc.w <= 103 && rc.h <= 103, JSON.stringify(rc));
  const e = T.trimRect(rgba(400, 300, [255, 255, 255, 255]), 400, 300);
  check("بلا محتوى ⇒ الصورةُ كلُّها", e.x === 0 && e.y === 0 && e.w === 400 && e.h === 300, JSON.stringify(e));
  const f = rgba(400, 300, [255, 255, 255, 255]);
  paint(f, 400, 0, 0, 40, 40, [0, 0, 0, 255]);
  const rf = T.trimRect(f, 400, 300);
  check("الهامشُ لا يخرج من الصورة", rf.x === 0 && rf.y === 0 && rf.x + rf.w <= 400 && rf.y + rf.h <= 300, JSON.stringify(rf));

  return { fails, passes };
}

console.log("▸ ean-decode / image-trim");
const srcE = readFileSync(EAN, "utf8"), srcT = readFileSync(TRIM, "utf8");
const base = await run(await load(srcE, "eanDecode.ts"), await load(srcT, "imageTrim.ts"));

const MUTS = [
  [EAN, "صوتٌ واحد يكفي", "filter(([, v]) => v >= 2)", "filter(([, v]) => v >= 1)"],
  [EAN, "التعادلُ يُحسم بالأوّل", "if (ranked[1] && ranked[1][1] === ranked[0][1]) return null;", ""],
  [EAN, "خانةُ التحقّق لا تُفحص", "if (checkDigitOk(code)) out.push(code);", "out.push(code);"],
  [EAN, "UPC-A بصفرِه", "const normalizeUpc = (c: string) => (c.length === 13 && c[0] === \"0\" ? c.slice(1) : c);", "const normalizeUpc = (c: string) => c;"],
  [EAN, "بلا مسحٍ عموديّ", "scan(img.height, img.width, (y, x) => lumAt(img, x, y));", ""],
  [EAN, "بلا السطر المعكوس", "const back = [...line].reverse();", "const back = line;"],
  [EAN, "بلا قراءة الانحدار", "...decodeRuns(edgeRunsOf(line, win)), ...decodeRuns(edgeRunsOf(back, win)),", ""],
  [EAN, "الحافّةُ بالبكسل الصحيح", "if (a !== b) { const f = (t - a) / (b - a); if (f >= 0 && f <= 1) edge = x - 0.5 + f; }", ""],
  [EAN, "الانحدارُ بلا قطعٍ مكافئ", "const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (pa - na)) / den)) : 0;", "const off = 0;"],
  [EAN, "تسامحٌ ضيّق (١٫٥ ⇒ ٠٫٦)", "const MAX_ERR = 1.8;", "const MAX_ERR = 0.6;"],
  [EAN, "L وG بلا تمييز", "const pick = l.err <= g.err ? { ...l, p: \"L\" } : { ...g, p: \"G\" };", "const pick = { ...l, p: \"L\" };"],
  [EAN, "EAN-8 لا يُقرأ", "if (ok && checkDigitOk(digits)) out.push(digits);", ""],
  [EAN, "RGBA يُقرأ بقناةٍ واحدة", "return c === 1 ? d[i] : (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;", "return d[i];"],
  [TRIM, "الشفّافُ محتوى", "return data[i + 3] > 16 && (", "return ("],
  [TRIM, "الأبيضُ المكسور محتوى", "const white = opts.white ?? 238", "const white = opts.white ?? 250"],
  [TRIM, "الهامشُ يخرج من الصورة", "const rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad);", "const rx = x0 - pad, ry = y0 - pad;"],
];
let caught = 0, escaped = 0;
for (const [file, name, from, to] of MUTS) {
  const src = file === EAN ? srcE : srcT;
  if (!src.includes(from)) { escaped++; console.error(`   ✗ طفرة «${name}»: ما لكيت نصَّها`); continue; }
  let res;
  try {
    const m = src.replace(from, to);
    res = await run(await load(file === EAN ? m : srcE, "e.ts"), await load(file === TRIM ? m : srcT, "t.ts"), true);
  } catch { res = { fails: 1 }; }
  if (res.fails > 0) { caught++; console.log(`   ✓ طفرة «${name}» انمسكت`); }
  else { escaped++; console.error(`   ✗ طفرة «${name}» مرّت`); }
}

const fails = base.fails + escaped;
console.log(`${fails ? "✗" : "✓"} ean-decode-test: ${base.passes} نجح، ${base.fails} فشل، وطفرات ${caught}/${MUTS.length}`);
process.exit(fails ? 1 : 0);
