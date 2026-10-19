/* ============================================================================
 * رسمُ باركودٍ يُمسح من الورقة — لورقة الجرد وتقرير فحص المخزن.
 *
 * لماذا: جردُ «ابن الهيثم» اليدويّ (١٠/١٩) طُبع وكلُّ مادةٍ بباركودها **مرسوماً**، فيمسح العادّ
 * الورقةَ ويتأكّد أن العلبة بيده هي الصفّ نفسُه — وورقةُ التطبيق كانت تكتب الرقمَ نصّاً. والرسمُ
 * بمعيار العلبة نفسِه: EAN-13 للمصنع، وUPC-A (هو EAN-13 بصفرٍ أوّل — نفسُ الأعمدة، فالماسحُ يُخرج
 * ما يُخرجه من العلبة)، وEAN-8، والرمزُ المكتوب باليد (رقمُ رفّ، `w90`) بـCode 128 — فمسحُ الورقة
 * يرسل الرمزَ كما هو مخزونٌ حرفاً، ويجد المادة.
 *
 * مفحوصٌ بقارئٍ مستقلّ (ZXing) ساعةَ كُتب: ١٬٠١٣ رمزاً حقيقياً من عيادة + حالاتٌ حدّية رجعت
 * حرفاً بحرف، ومن صورة الصفحة المطبوعة نفسِها. والحزمةُ تفحص البنيةَ بفكٍّ مستقلّ
 * (`scripts/barcode-draw-test.mjs`).
 *
 * لا نصَّ هنا (أرقامٌ وSVG): العنوانُ والملاحظةُ عند من يستدعي.
 * ==========================================================================*/
import { ean13Modules, isValidEan13 } from "./barcodeGen";
import { normalizeCode } from "./utils";

/* ── EAN-8 ─────────────────────────────────────────────────────────────────── */
const L8 = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R8 = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

export function isValidEan8(c: string): boolean {
  if (!/^\d{8}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 7; i++) s += Number(c[i]) * (i % 2 ? 1 : 3);
  return (10 - (s % 10)) % 10 === Number(c[7]);
}

function ean8Modules(c: string): string {
  let m = "101";
  for (let i = 0; i < 4; i++) m += L8[Number(c[i])];
  m += "01010";
  for (let i = 4; i < 8; i++) m += R8[Number(c[i])];
  return m + "101";
}

/* ── Code 128 (B + C) ──────────────────────────────────────────────────────── */
/** عروضُ العناصر (شريطٌ ففراغٌ بالتناوب) للقيم ٠–١٠٦ — الجدولُ القياسيّ. */
export const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212",
  "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323",
  "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123",
  "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113",
  "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142",
  "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341",
  "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232",
  "2331112"];
const START_B = 104, START_C = 105, TO_C = 99, TO_B = 100, STOP = 106;

const ascii = (s: string): boolean => /^[\x20-\x7E]+$/.test(s);

/** قيمُ Code 128: C لسلاسل الأرقام الطويلة (≥٤ بطرف، ≥٦ بالوسط، أو الرمزُ كلُّه أرقامٌ)، وB لغيرها. */
export function code128Values(s: string): number[] {
  if (!ascii(s)) throw new Error("not encodable in Code128");
  const vals: number[] = [];
  let set: "B" | "C" | null = null;
  let i = 0;
  const run = (k: number): number => { let n = 0; while (k + n < s.length && /\d/.test(s[k + n])) n++; return n; };
  while (i < s.length) {
    const r = run(i);
    const atStart = i === 0, toEnd = i + r === s.length;
    const useC = r >= 2 && (atStart && toEnd ? true : (atStart || toEnd) ? r >= 4 : r >= 6);
    if (useC) {
      let n = r - (r % 2);
      if (r % 2 === 1 && atStart && set === null) {
        vals.push(START_B); set = "B";
        vals.push(s.charCodeAt(i) - 32); i++;
        n = r - 1;
      }
      if (set === null) { vals.push(START_C); set = "C"; } else if (set !== "C") { vals.push(TO_C); set = "C"; }
      for (let k = 0; k < n; k += 2) vals.push(Number(s.substr(i + k, 2)));
      i += n;
    } else {
      if (set === null) { vals.push(START_B); set = "B"; } else if (set !== "B") { vals.push(TO_B); set = "B"; }
      vals.push(s.charCodeAt(i) - 32); i++;
    }
  }
  let sum = vals[0];
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
  vals.push(sum % 103);
  vals.push(STOP);
  return vals;
}

export function code128Modules(s: string): string {
  let m = "";
  for (const v of code128Values(s)) {
    const w = C128[v];
    for (let k = 0; k < w.length; k++) m += (k % 2 === 0 ? "1" : "0").repeat(Number(w[k]));
  }
  return m;
}

/* ── SVG ───────────────────────────────────────────────────────────────────── */
/** مسارٌ واحد (صغيرُ الحجم) بأبعادٍ بالمليمتر: الوحدةُ ٠٫٣ مم افتراضاً — تُقرأ بطابعةٍ عادية بحجم ١٠٠٪. */
function svgOf(modules: string, o: { quiet: number; guards?: [number, number][]; label: string; heightMm: number; moduleMm: number }): string {
  const total = modules.length + o.quiet * 2;
  const H = 100;
  let d = "";
  for (let i = 0; i < modules.length;) {
    if (modules[i] !== "1") { i++; continue; }
    let j = i;
    while (j < modules.length && modules[j] === "1") j++;
    const tall = o.guards?.some(([a, b]) => i >= a && i < b);
    d += `M${i + o.quiet} 0h${j - i}v${tall ? H + 8 : H}h-${j - i}z`;
    i = j;
  }
  const h = o.guards ? H + 8 : H;
  const w = (total * o.moduleMm).toFixed(1), hm = (o.heightMm * (o.guards ? 1.08 : 1)).toFixed(1);
  const label = o.label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<svg class="bc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none" style="width:${w}mm;height:${hm}mm" role="img" aria-label="${label}"><rect width="${total}" height="${h}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export type BarcodeSymbology = "EAN-13" | "UPC-A" | "EAN-8" | "Code128";

/**
 * الباركودُ مرسوماً بمعيار العلبة، أو `null` إن كان فارغاً أو لا يُرسم (حرفٌ عربيّ — الكيبوردُ
 * كان عربياً ساعةَ المسح؛ يُقال بالنصّ عند من يستدعي). `text` = ما يُكتب تحت الأعمدة وما يُرسله
 * الماسحُ عند مسح الورقة.
 */
export function drawBarcode(raw: string | null | undefined, opts: { heightMm?: number; moduleMm?: number } = {}): { svg: string; text: string; symbology: BarcodeSymbology } | null {
  const c = normalizeCode(raw);
  if (!c) return null;
  const heightMm = opts.heightMm ?? 12, moduleMm = opts.moduleMm ?? 0.3;
  const eanGuards: [number, number][] = [[0, 3], [45, 50], [92, 95]];
  try {
    if (/^\d{13}$/.test(c) && isValidEan13(c)) return { svg: svgOf(ean13Modules(c), { quiet: 11, guards: eanGuards, label: c, heightMm, moduleMm }), text: c, symbology: "EAN-13" };
    if (/^\d{12}$/.test(c) && isValidEan13("0" + c)) return { svg: svgOf(ean13Modules("0" + c), { quiet: 11, guards: eanGuards, label: c, heightMm, moduleMm }), text: c, symbology: "UPC-A" };
    if (isValidEan8(c)) return { svg: svgOf(ean8Modules(c), { quiet: 7, guards: [[0, 3], [31, 36], [64, 67]], label: c, heightMm, moduleMm }), text: c, symbology: "EAN-8" };
    if (ascii(c)) return { svg: svgOf(code128Modules(c), { quiet: 10, label: c, heightMm, moduleMm }), text: c, symbology: "Code128" };
  } catch {
    /* swallow-ok: رمزٌ لا يُرسم يُكتب نصّاً عند من يستدعي — الورقةُ لا تسقط برمزٍ واحد */
  }
  return null;
}
