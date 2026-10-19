/* ============================================================================
 * رسمُ الباركود (src/lib/barcodeDraw.ts) — يُفكّ ما يُرسم ويُقارن بالرمز حرفاً.
 *
 * ساعةَ كُتب الراسمُ قُرئ بقارئٍ مستقلّ (ZXing) على ١٬٠١٣ رمزاً حقيقياً ومن صورة الصفحة المطبوعة.
 * هنا حارسُ الرجوع: فكٌّ من الوحدات المرسومة نفسِها (المسارُ بالـSVG، لا الدوالّ الداخلية):
 *   • EAN-13/UPC-A/EAN-8: الأعمدةُ تُقرأ بجداول L/G/R ونمطِ أوّل رقم، ورقمُ التحقق يُحسب من جديد.
 *   • Code 128: العروضُ تُقرأ ستّاً ستّاً، والمجموعُ المرجَّح (mod 103) يطابق رمزَ التحقق.
 *   • ما لا يُرسم (حرفٌ عربيّ، فارغ) = null لا رسمٌ خاطئ.
 *
 *   node scripts/barcode-draw-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const dir = mkdtempSync(join(tmpdir(), "bcdraw-"));
const out = join(dir, "bc.mjs");
await esbuild.build({
  entryPoints: ["src/lib/barcodeDraw.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") },
});
const { drawBarcode, C128 } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

/* ── الوحدات من المسار المرسوم ─────────────────────────────────────────────── */
function modulesOf(svg) {
  const total = Number(/viewBox="0 0 (\d+) /.exec(svg)[1]);
  const bits = new Array(total).fill("0");
  for (const m of svg.matchAll(/M(\d+) 0h(\d+)v/g)) for (let x = Number(m[1]); x < Number(m[1]) + Number(m[2]); x++) bits[x] = "1";
  const s = bits.join("");
  return s.slice(s.indexOf("1"), s.lastIndexOf("1") + 1);
}

/* ── فكّ EAN ───────────────────────────────────────────────────────────────── */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => [...p].reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const ck13 = (d12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1); return (10 - (s % 10)) % 10; };
function decodeEan13(m) {
  if (m.length !== 95 || !m.startsWith("101") || m.slice(45, 50) !== "01010" || !m.endsWith("101")) return null;
  let left = "", pat = "";
  for (let i = 0; i < 6; i++) {
    const w = m.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(w), g = G.indexOf(w);
    if (l >= 0) { left += l; pat += "L"; } else if (g >= 0) { left += g; pat += "G"; } else return null;
  }
  let right = "";
  for (let i = 0; i < 6; i++) { const r = R.indexOf(m.slice(50 + i * 7, 57 + i * 7)); if (r < 0) return null; right += r; }
  const first = FIRST.indexOf(pat);
  if (first < 0) return null;
  const code = first + left + right;
  return ck13(code.slice(0, 12)) === Number(code[12]) ? code : null;
}
function decodeEan8(m) {
  if (m.length !== 67 || m.slice(31, 36) !== "01010") return null;
  let c = "";
  for (let i = 0; i < 4; i++) { const l = L.indexOf(m.slice(3 + i * 7, 10 + i * 7)); if (l < 0) return null; c += l; }
  for (let i = 0; i < 4; i++) { const r = R.indexOf(m.slice(36 + i * 7, 43 + i * 7)); if (r < 0) return null; c += r; }
  let s = 0; for (let i = 0; i < 7; i++) s += Number(c[i]) * (i % 2 ? 1 : 3);
  return (10 - (s % 10)) % 10 === Number(c[7]) ? c : null;
}

/* ── فكّ Code 128 ──────────────────────────────────────────────────────────── */
/* جدولُ العروض مستقلٌّ عن الوحدة (من جدول ZXing، القيم ٠–١٠٥): الفكُّ بجدول الوحدة نفسِها كان
 * يُمرّر خانةً غلطاً بالجدول — ترسم غلطاً وتُفكّ بالغلط نفسه فتبدو صحيحة. */
const REF128 = [
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222",
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321",
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121",
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224",
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111",
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113",
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232",
].join(" ").split(" ");
function decode128(m) {
  const widths = [];
  for (let i = 0; i < m.length;) { let j = i; while (j < m.length && m[j] === m[i]) j++; widths.push(j - i); i = j; }
  if (widths.length < 13 || (widths.length - 7) % 6 !== 0) return null;
  const vals = [];
  for (let i = 0; i + 6 <= widths.length - 7; i += 6) {
    const v = REF128.indexOf(widths.slice(i, i + 6).join(""));
    if (v < 0 || widths.slice(i, i + 6).reduce((a, b) => a + b, 0) !== 11) return null;
    vals.push(v);
  }
  if (widths.slice(-7).join("") !== "2331112") return null;
  const check = vals.pop();
  let sum = vals[0];
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
  if (sum % 103 !== check) return null;
  let set = vals[0] === 105 ? "C" : vals[0] === 104 ? "B" : null, s = "";
  if (!set) return null;
  for (const v of vals.slice(1)) {
    if (v === 99) { set = "C"; continue; }
    if (v === 100) { set = "B"; continue; }
    s += set === "C" ? String(v).padStart(2, "0") : String.fromCharCode(v + 32);
  }
  return s;
}

const decode = (svg) => { const m = modulesOf(svg); return decodeEan13(m) ?? decodeEan8(m) ?? decode128(m); };

/* ── الحالات: رموزٌ حقيقيةٌ من جرد عيادة وحدودٌ صعبة ──────────────────────── */
const cases = [
  ["8859387702357", "EAN-13"], ["3182550787963", "EAN-13"], ["2000000000015", "EAN-13"],
  ["850030015952", "UPC-A"], ["074198615766", "UPC-A"],
  ["96385074", "EAN-8"],
  ["w90", "Code128"], ["W90", "Code128"], ["00", "Code128"], ["7", "Code128"], ["1003", "Code128"], ["10030", "Code128"],
  ["123461", "Code128"], ["A5-12", "Code128"], ["12345678901", "Code128"], ["abc1234567def", "Code128"],
  ["0096446292846292846292800964", "Code128"], ["355601501202020", "Code128"], ["8551234567890", "Code128"],
];
for (const [code, sym] of cases) {
  const b = drawBarcode(code);
  if (!b) { check(`${code} يُرسم`, false, "null"); continue; }
  const got = decode(b.svg);
  const back = sym === "UPC-A" && got && got.length === 13 ? got.slice(1) : got;
  check(`${code} → ${sym} ويُفكّ حرفاً`, b.symbology === sym && back === code && b.text === code, `${b.symbology} / ${got}`);
}
check("حرفٌ عربيّ لا يُرسم (null)", drawBarcode("تشرشسةؤابيق") === null);
check("الفارغ لا يُرسم", drawBarcode("") === null && drawBarcode(null) === null);
check("المحارفُ الخفيّة والمسافاتُ تُشال قبل الرسم", drawBarcode("‏8859387702357 ")?.text === "8859387702357");
check("الوسمُ يُهرَّب", !drawBarcode("a<b")?.svg.includes('aria-label="a<b"'));
check("جدولُ Code 128 بالوحدة = الجدولُ المرجعيّ خانةً خانة (٠–١٠٥)", REF128.length === 106 && REF128.every((w, i) => C128[i] === w),
  String(REF128.findIndex((w, i) => C128[i] !== w)));

console.log(`\n${fails ? "✗" : "✓"} barcode-draw-test: ${passes} ✓${fails ? ` · ${fails} ✗` : ""}`);
if (fails) process.exit(1);
