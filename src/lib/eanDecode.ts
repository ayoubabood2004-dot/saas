// ============================================================================
// قراءةُ باركود EAN-13 / UPC-A / EAN-8 من صورة (صِرف، بلا DOM ولا مكتبة) — لصور كاتالوجات الموزّعين التي
// يُطبع فيها الباركودُ على العلبة داخل الصورة ولا نصَّ له بالملف (مقيسٌ على كاتالوج المالك ٢٥/١١: Canva،
// صفحةٌ لكلّ منتج، صفرُ نصّ). والمطابقةُ بالباركود هي «الأكيدة» بصفحة الاقتراحات — فرمزٌ يُقرأ هنا يُغني عن اسم.
//
// الطريقة القياسيّة: أسطرٌ أفقيّة (وعموديّة لصورةٍ مقلوبة) تُثنّى بعتبةٍ محلّيّة، فأطوالُ متتابعة (شريط/فراغ)،
// ثمّ نافذةٌ بعدد عناصر الرمز (٥٩ لـEAN-13، ٤٣ لـEAN-8) تُقاس على الحرّاس، وكلُّ رقمٍ أربعةُ عناصر تُطبَّع لسبع
// وحدات وتُطابَق بأقرب نمط (L/G/R)، والأوّلُ من تناوب L/G، وخانةُ التحقّق حَكَم. **وصوتان فأكثر** من أسطرٍ مختلفة
// قبل أن يُقال رمز — سطرٌ واحد يمرّ صدفةً بخانة تحقّقٍ صحيحة (١ من ١٠) فيُخترع رمزٌ لمنتجٍ آخر.
// ============================================================================

export interface Gray { data: Uint8ClampedArray | Uint8Array; width: number; height: number; /** ٤ قنوات (RGBA) أو ١ */ channels?: 1 | 4 }

/* عروضُ العناصر (٧ وحدات) لكلّ رقم: L يبدأ بفراغ، وR نفسُ العروض يبدأ بشريط، وG عكسُ R. */
const L_W = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"].map((s) => s.split("").map(Number));
const G_W = L_W.map((w) => [...w].reverse());
const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const MAX_ERR = 1.8;       // مجموعُ فروق العروض المطبَّعة المقبول لرقم (١٫٥ فوّت باركوداً من ستّة بكاتالوج المالك، ١٫٨ بلا قراءةٍ زائفة على ١٣ صفحة)
const GUARD_TOL = 0.55;    // عنصرُ الحارس ضمن ±٥٥٪ من الوحدة

export function checkDigitOk(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const k = d.pop()!;
  let s = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) s += d[i] * w;
  return (10 - (s % 10)) % 10 === k;
}

function lumAt(img: Gray, x: number, y: number): number {
  const c = img.channels ?? 4;
  const i = (y * img.width + x) * c;
  const d = img.data;
  return c === 1 ? d[i] : (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
}

/** الأدنى والأعلى بنافذة ±win حول كلّ بكسل — بطابورٍ رتيب (O(n)): النافذةُ لكلّ بكسل كانت ثوانيَ للصورة (مقيسٌ على الكاتالوج). */
function minMax(line: ArrayLike<number>, win: number): { lo: Float32Array; hi: Float32Array } {
  const n = line.length;
  const lo = new Float32Array(n), hi = new Float32Array(n);
  const qMin = new Int32Array(n), qMax = new Int32Array(n);
  let h1 = 0, t1 = 0, h2 = 0, t2 = 0, r = 0;
  for (let x = 0; x < n; x++) {
    const right = Math.min(n - 1, x + win), left = x - win;
    for (; r <= right; r++) {
      const v = line[r];
      while (t1 > h1 && line[qMin[t1 - 1]] >= v) t1--;
      qMin[t1++] = r;
      while (t2 > h2 && line[qMax[t2 - 1]] <= v) t2--;
      qMax[t2++] = r;
    }
    while (qMin[h1] < left) h1++;
    while (qMax[h2] < left) h2++;
    lo[x] = line[qMin[h1]]; hi[x] = line[qMax[h2]];
  }
  return { lo, hi };
}

/** سطرٌ ⇒ أطوالٌ متتابعة تبدأ بفراغ (فاتح). العتبةُ محلّيّة (وسطُ أدنى وأعلى بنافذة ±win)، وما بلا تباين فاتح. */
export function runsOf(line: ArrayLike<number>, win: number): number[] {
  const n = line.length;
  const { lo, hi } = minMax(line, win);
  // الحافّةُ بكسرٍ من البكسل: موضعُ عبور العتبة بين مركزَي البكسلين (استيفاءٌ خطّيّ). بالعدّ الصحيح كان شريطُ
  // وحدةٍ بعرض ١٫٦ بكسل يُقرأ ١ أو ٢ فيخرج الرقمُ عن نمطه.
  const runs: number[] = [];
  let cur = 0, start = 0;
  for (let x = 0; x < n; x++) {
    const thr = (lo[x] + hi[x]) / 2;
    const dark = hi[x] - lo[x] >= 40 && line[x] < thr ? 1 : 0;
    if (dark === cur) continue;
    let edge = x;
    if (x > 0) {
      const a = line[x - 1], b = line[x], t = ((lo[x - 1] + hi[x - 1]) / 2 + thr) / 2;
      if (a !== b) { const f = (t - a) / (b - a); if (f >= 0 && f <= 1) edge = x - 0.5 + f; }
    }
    if (edge < start) edge = start;
    runs.push(edge - start); start = edge; cur = dark;
  }
  runs.push(n - start);
  return runs;
}

/**
 * القراءةُ الثانية: الحافّةُ حيث الانحدارُ أشدّ (قمّةُ الفرق بين بكسلين متجاورين، بكسرٍ بقطعٍ مكافئ) لا حيث تُعبر
 * العتبة. الضبابُ يُبقي الأشدَّ بمكانه ويُقصّر ما تحت العتبة: شريطُ وحدةٍ لا يبلغ السوادَ الكامل فيُقرأ بالعتبة أنحفَ
 * من جيرانه — هكذا فشل باركودُ صفحة ٨ بكاتالوج المالك (أشرطةٌ ٠٫٨–١٫٢ لوحدةٍ ٢٫٢، والحارسُ الأوسط خارج حدّه).
 */
export function edgeRunsOf(line: ArrayLike<number>, win: number): number[] {
  const n = line.length;
  if (n < 3) return [n];
  const { lo, hi } = minMax(line, win);
  const g = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) g[i] = line[i + 1] - line[i];
  const pos: number[] = [], sgn: number[] = [], mag: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const v = g[i], a = Math.abs(v);
    const span = Math.max(hi[i], hi[i + 1]) - Math.min(lo[i], lo[i + 1]);
    if (span < 40 || a < Math.max(8, span * 0.12)) continue;
    const pa = i > 0 && Math.sign(g[i - 1]) === Math.sign(v) ? Math.abs(g[i - 1]) : 0;
    const na = i < n - 2 && Math.sign(g[i + 1]) === Math.sign(v) ? Math.abs(g[i + 1]) : 0;
    if (a < pa || a <= na) continue;                         // القمّةُ وحدها (والهضبةُ بأوّلها)
    const den = pa - 2 * a + na;
    const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (pa - na)) / den)) : 0;
    const x = i + 0.5 + off, s = v < 0 ? -1 : 1;              // −١: فاتحٌ ⇒ داكن (بدايةُ شريط)
    const k = sgn.length - 1;
    if (k >= 0 && sgn[k] === s) { if (a > mag[k]) { pos[k] = x; mag[k] = a; } continue; }   // حافّتان بالاتجاه نفسِه: الأشدّ
    pos.push(x); sgn.push(s); mag.push(a);
  }
  const runs: number[] = [];
  let start = 0;
  if (sgn[0] === 1) runs.push(0);                            // السطرُ يبدأ داكناً: فراغٌ أوّلٌ بطول صفر
  for (const x of pos) { runs.push(x - start); start = x; }
  runs.push(n - start);
  return runs;
}

function matchDigit(w: number[], table: number[][]): { d: number; err: number } {
  const s = w[0] + w[1] + w[2] + w[3];
  let best = -1, bestErr = Infinity;
  for (let d = 0; d < 10; d++) {
    const p = table[d];
    let e = 0;
    for (let j = 0; j < 4; j++) e += Math.abs((w[j] * 7) / s - p[j]);
    if (e < bestErr) { bestErr = e; best = d; }
  }
  return { d: best, err: bestErr };
}

const guardOk = (rs: number[], m: number) => rs.every((r) => Math.abs(r - m) <= m * GUARD_TOL + 0.75);

/** أطوالُ سطر ⇒ رموزٌ مقروءة (قد تكون صفراً أو أكثر). runs[i] فاتحٌ لـi زوجيّ. */
export function decodeRuns(runs: readonly number[]): string[] {
  const out: string[] = [];
  // EAN-13 / UPC-A: ٥٩ عنصراً يبدأ بشريط (فهرسٌ فرديّ)
  for (let i = 1; i + 59 <= runs.length; i += 2) {
    const seg = runs.slice(i, i + 59);
    const m = seg.reduce((a, b) => a + b, 0) / 95;
    if (m < 0.8) continue;
    if (runs[i - 1] < m * 3 && i - 1 !== 0) continue;               // منطقةٌ هادئة قبله
    if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(27, 32), m) || !guardOk(seg.slice(56, 59), m)) continue;
    let parity = "", digits = "", ok = true;
    for (let k = 0; k < 6 && ok; k++) {
      const w = seg.slice(3 + 4 * k, 7 + 4 * k);
      const l = matchDigit(w, L_W), g = matchDigit(w, G_W);
      const pick = l.err <= g.err ? { ...l, p: "L" } : { ...g, p: "G" };
      if (pick.err > MAX_ERR) ok = false;
      parity += pick.p; digits += pick.d;
    }
    for (let k = 0; k < 6 && ok; k++) {
      const r = matchDigit(seg.slice(32 + 4 * k, 36 + 4 * k), L_W);
      if (r.err > MAX_ERR) ok = false;
      digits += r.d;
    }
    if (!ok) continue;
    const first = FIRST.indexOf(parity);
    if (first < 0) continue;
    const code = first + digits;
    if (checkDigitOk(code)) out.push(code);
  }
  // EAN-8: ٤٣ عنصراً
  for (let i = 1; i + 43 <= runs.length; i += 2) {
    const seg = runs.slice(i, i + 43);
    const m = seg.reduce((a, b) => a + b, 0) / 67;
    if (m < 0.8) continue;
    if (runs[i - 1] < m * 3 && i - 1 !== 0) continue;
    if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(19, 24), m) || !guardOk(seg.slice(40, 43), m)) continue;
    let digits = "", ok = true;
    for (let k = 0; k < 4 && ok; k++) { const r = matchDigit(seg.slice(3 + 4 * k, 7 + 4 * k), L_W); if (r.err > MAX_ERR) ok = false; digits += r.d; }
    for (let k = 0; k < 4 && ok; k++) { const r = matchDigit(seg.slice(24 + 4 * k, 28 + 4 * k), L_W); if (r.err > MAX_ERR) ok = false; digits += r.d; }
    if (ok && checkDigitOk(digits)) out.push(digits);
  }
  return out;
}

/**
 * الرمزُ بالصورة أو null. أسطرٌ أفقيّة كلَّ `step` بكسل (ومعكوسةً: الصورةُ مقلوبة ١٨٠°)، ثمّ عموديّة إن لم يكفِ.
 * الرمزُ يحتاج صوتين من سطرين مختلفين؛ ورمزان مختلفان بأصواتٍ كافية ⇒ الأكثر، والتعادلُ ⇒ لا شيء (لا تخمين).
 */
export function decodeEan(img: Gray, opts: { step?: number } = {}): string | null {
  const step = opts.step ?? 2;
  const votes = new Map<string, number>();
  const scan = (len: number, count: number, at: (i: number, k: number) => number) => {
    const line = new Float32Array(len);
    for (let k = 0; k < count; k += step) {
      for (let i = 0; i < len; i++) line[i] = at(i, k);
      const win = Math.max(6, Math.round(len / 60));
      const back = [...line].reverse();
      // قراءتان لكلّ سطر (العتبة والانحدار) وبالاتجاهين، والسطرُ صوتٌ واحد مهما تكرّر فيه الرمز.
      const found = new Set([
        ...decodeRuns(runsOf(line, win)), ...decodeRuns(runsOf(back, win)),
        ...decodeRuns(edgeRunsOf(line, win)), ...decodeRuns(edgeRunsOf(back, win)),
      ]);
      for (const c of found) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
  };
  scan(img.width, img.height, (x, y) => lumAt(img, x, y));
  const pick = () => {
    const ranked = [...votes.entries()].filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return null;
    if (ranked[1] && ranked[1][1] === ranked[0][1]) return null;
    return ranked[0][0];
  };
  const h = pick();
  if (h) return normalizeUpc(h);
  scan(img.height, img.width, (y, x) => lumAt(img, x, y));
  const v = pick();
  return v ? normalizeUpc(v) : null;
}

/** UPC-A يُقرأ EAN-13 بصفرٍ أوّل — يُحفظ كما يُخرجه الماسح (١٢ رقماً)، فيطابق باركودَ المنتج بالمخزن. */
const normalizeUpc = (c: string) => (c.length === 13 && c[0] === "0" ? c.slice(1) : c);
