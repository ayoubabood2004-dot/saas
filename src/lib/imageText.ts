// ============================================================================
// «اقرا النص من الصورة» لاستيراد PDF المكتبة — بطلب، لصورةٍ واحدة، واقتراحٌ يُضغط لا اسمٌ يُكتب وحده.
//
// مقيسٌ على كاتالوج المالك (٢٥/١١، Canva، الاسمُ مطبوعٌ على العلبة داخل الصورة): القراءةُ العادية حروفٌ عشوائية؛
// والرماديُّ مقلوباً (النصُّ الأبيض على لونٍ يصير أسود) بنمط «نصٌّ متفرّق» (PSM 11) وكلماتٌ بثقة ٧٠٪ فأكثر قرأت
// «Rabbit andCranberry» و«Salmon andGoat Milk» و«PATE CHICKEN +PUMPKIN» — وفوّتت غيرَها أو قرأت «MewMert». فالأسطرُ
// تُعرض رقاقاتٍ تُضاف للاسم بضغطة، والخانةُ لا تُملأ وحدها: اسمٌ غلطٌ بالمكتبة يُصدَّق، والفارغُ يمنع الرفع.
// ============================================================================
/* مساراتُ المحرّك المستضاف نفسُها بـlabOcr.ts (public/tesseract/ — سياسةُ المحتوى تمنع الـCDN والـblob workers). نسخةٌ هنا
 * عمداً: وحدةٌ مشتركة بين قطعتين كسولتين تصير قطعةً ثالثة يُكتب اسمُها بقوائم تحميل حزمة الإقلاع (+٦٤ بايتاً، مقيسٌ بالبناء). */
const TESS_OPTS = { workerPath: "/tesseract/worker.min.js", corePath: "/tesseract", langPath: "/tesseract/lang" } as const;

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let worker: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    const T = await import("tesseract.js");
    const w = await T.createWorker("eng", 1, { ...TESS_OPTS });
    await w.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT });
    return w;
  })().catch((e) => { worker = null; throw e; });
  return worker;
}

/** العاملُ يُطفأ حين تُغلق شاشةُ الاستيراد — ذاكرتُه (عشرات الميغا) لا تبقى. */
export async function closeImageText(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) { try { await (await w).terminate(); } catch { /* أُطفئ أصلاً */ } }
}

async function grayCanvas(src: Blob, invert: boolean): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const k = Math.min(2, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (invert) y = 255 - y;
    p[i] = p[i + 1] = p[i + 2] = y;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** أسطرُ النصّ المقروءة بثقة (كلماتٌ ٧٠٪ فأكثر، حرفان فأكثر)، من القراءتين بلا تكرار وبترتيب ظهورها. */
export async function readImageLines(src: Blob): Promise<string[]> {
  const w = await getWorker();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const invert of [false, true]) {
    const c = await grayCanvas(src, invert);
    try {
      const { data } = await w.recognize(c, {}, { blocks: true });
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
        const line = l.words.filter((x) => x.confidence >= 70 && /[A-Za-z\u0600-\u06FF0-9]{2,}/.test(x.text)).map((x) => x.text).join(" ").trim();
        const k = line.toLowerCase();
        if (line && !seen.has(k)) { seen.add(k); out.push(line); }
      }
    } finally { c.width = 0; c.height = 0; }
  }
  return out;
}
