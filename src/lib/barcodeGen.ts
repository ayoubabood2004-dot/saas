// ============================================================================
// مولد الباركود — EAN-13 داخلي دقيق يقرأه أي ماسح ضوئي.
//
// الصيغة: 20 + تسلسل من 10 أرقام + رقم تحقق EAN قياسي = 13 رقماً.
// البادئة «20» من مدى الاستخدام الداخلي الرسمي (20–29 محجوز عالمياً للمتاجر
// تطبع باركوداتها بنفسها) — فما تتصادم أبداً مع بضاعة أصلية من المصنع.
//
// اللاتكرار مضمون بثلاث طبقات:
//   1. التسلسل يكمل من أعلى رقم مولّد سابقاً (يُستنتج من السجل نفسه).
//   2. كل كود مقترح يُفحص ضد مجموعة «المحجوز» (باركودات المنتجات + السجل).
//   3. قيد unique بقاعدة البيانات (0094) كصمام أخير.
//
// الرسم: مشفّر EAN-13 كامل (جداول L/G/R القياسية) يطلع SVG حقيقياً —
// مو صورة تقريبية — فالملصق المطبوع يُمسح من أول مرة.
// ============================================================================

export const INTERNAL_PREFIX = "20";

/** رقم تحقق EAN-13 القياسي لـ12 رقماً. */
export function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** هل هذا كود EAN-13 سليم البنية والتحقق؟ */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** ابنِ كوداً من رقم تسلسلي (0 … 9,999,999,999). */
export function barcodeFromSeq(seq: number): string {
  const payload = String(Math.max(0, Math.floor(seq))).padStart(10, "0");
  const d12 = INTERNAL_PREFIX + payload;
  return d12 + String(ean13CheckDigit(d12));
}

/** استنتج التسلسل التالي من الأكواد المولدة سابقاً (أعلى تسلسل + 1). */
export function nextSeqFrom(existing: Iterable<string>): number {
  let max = -1;
  for (const c of existing) {
    if (c.length === 13 && c.startsWith(INTERNAL_PREFIX) && /^\d{13}$/.test(c)) {
      const n = Number(c.slice(2, 12));
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * ولّد `count` كوداً جديداً، كلها صحيحة وفريدة، ولا واحد منها موجود
 * بمجموعة «المحجوز» (باركودات المنتجات الحالية + سجل المولدة سابقاً).
 */
export function generateBarcodes(count: number, taken: Set<string>, startSeq: number): string[] {
  const out: string[] = [];
  let seq = Math.max(0, startSeq);
  let guard = 0;
  while (out.length < count) {
    if (++guard > count + 100000) throw new Error("barcode space exhausted"); // مستحيل عملياً (10 مليارات)
    const code = barcodeFromSeq(seq++);
    if (taken.has(code)) continue;
    taken.add(code); // يمنع التكرار داخل نفس الدفعة أيضاً
    out.push(code);
  }
  return out;
}

/* ------------------------------ رسم EAN-13 ------------------------------ */
// الجداول القياسية: كل رقم = 7 وحدات (bars/spaces). L وG للنصف الأيسر، R للأيمن.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** الرقم الأول يحدد نمط L/G للأرقام 2-7. */
const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** سلسلة الوحدات الكاملة (95 وحدة): حارس + 6 يسار + وسط + 6 يمين + حارس. */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error(`invalid EAN-13: ${code}`);
  const first = Number(code[0]);
  const pattern = FIRST[first];
  let m = "101"; // start guard
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    m += pattern[i - 1] === "L" ? L[d] : G[d];
  }
  m += "01010"; // center guard
  for (let i = 7; i <= 12; i++) m += R[Number(code[i])];
  m += "101"; // end guard
  return m; // 95 وحدة
}

/**
 * SVG جاهز للعرض والطباعة: أعمدة الباركود + الأرقام تحته بالتوزيع القياسي.
 * `moduleW` بالوحدات (px)، والحواف الصامتة (quiet zones) محسوبة داخلياً.
 */
export function ean13Svg(code: string, opts: { moduleW?: number; height?: number; fontSize?: number } = {}): string {
  const moduleW = opts.moduleW ?? 2;
  const height = opts.height ?? 56;
  const fontSize = opts.fontSize ?? 11;
  const modules = ean13Modules(code);
  const quiet = 9 * moduleW; // منطقة صامتة قياسية
  const width = 95 * moduleW + quiet * 2;
  const textY = height + fontSize + 1;
  const totalH = textY + 2;
  // الحوارس تنزل أوطأ من الأعمدة العادية (المظهر القياسي)
  const guardIdx = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let bars = "";
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== "1") continue;
    const h = guardIdx.has(i) ? height + fontSize / 2 : height;
    bars += `<rect x="${quiet + i * moduleW}" y="0" width="${moduleW}" height="${h}"/>`;
  }
  const digitsLeft = code.slice(1, 7).split("").map((d, i) =>
    `<text x="${quiet + (3 + i * 7 + 3.5) * moduleW}" y="${textY}" text-anchor="middle">${d}</text>`).join("");
  const digitsRight = code.slice(7).split("").map((d, i) =>
    `<text x="${quiet + (50 + i * 7 + 3.5) * moduleW}" y="${textY}" text-anchor="middle">${d}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalH}" width="${width}" height="${totalH}" role="img" aria-label="${code}">` +
    `<rect width="${width}" height="${totalH}" fill="#fff"/>` +
    `<g fill="#000">${bars}</g>` +
    `<g fill="#000" font-family="ui-monospace, Consolas, monospace" font-size="${fontSize}">` +
    `<text x="${quiet - 2}" y="${textY}" text-anchor="end">${code[0]}</text>${digitsLeft}${digitsRight}</g>` +
    `</svg>`;
}
