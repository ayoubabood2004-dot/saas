import { repo } from "@/lib/repo";
import { localISO } from "@/lib/utils";
import { scanShape, isGs1Shape, sampleOf } from "@/lib/gs1";

/* ============================================================================
 * عدّادُ صيغ المسح — صامتٌ تماماً (م٣ القياس، 0213).
 *
 * لا يغيّر مسحةً ولا يُظهر شيئاً ولا يكتب للخادم مع كلّ مسحة: يعدّ بالجهاز
 * (localStorage) ويرفع الدفعةَ مرّةً بالساعة على الأكثر. وفشلُ الرفع لا يُقال —
 * هذا قياسٌ لا عمل؛ يبقى العدُّ بالجهاز ويُعاد لاحقاً.
 *
 * **والعدُّ مختومٌ بالعيادة**: الجهازُ يتبدّل عليه أهلُه (درسُ الطابور)، فعدُّ
 * عيادةٍ لا يُرفع بهويّة عيادةٍ أخرى — والخادمُ يرفض بنفسه إن اختلفتا.
 * ========================================================================= */

const KEY = "vp_scan_shapes_v1";
const FLUSH_EVERY = 60 * 60 * 1000;
const MAX_SAMPLES = 5;

interface Bucket { counts: Record<string, number>; samples: string[] }
/** { "<clinic>|<day>": Bucket, __last?: number } */
type Store = Record<string, Bucket | number | undefined> & { __last?: number };

const load = (): Store => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
};
const save = (s: Store): void => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* مخزنٌ ممتلئ: القياسُ يُسقَط لا العمل */ }
};

/** تُنادى مع كلّ مسحة (البيع والشراء). لا ترمي أبداً. */
export function noteScan(raw: string, surface: "sale" | "purchase", clinicId: string | null | undefined): void {
  try {
    if (!clinicId) return;
    const shape = scanShape(raw);
    if (!shape) return;
    const s = load();
    const k = `${clinicId}|${localISO()}`;
    const b = (s[k] as Bucket | undefined) ?? { counts: {}, samples: [] };
    const ck = `${surface}:${shape}`;
    b.counts[ck] = (b.counts[ck] ?? 0) + 1;
    if (isGs1Shape(shape) && b.samples.length < MAX_SAMPLES) b.samples.push(sampleOf(raw));
    s[k] = b;
    save(s);
    if (Date.now() - (s.__last ?? 0) > FLUSH_EVERY) void flushScanStats(clinicId);
  } catch { /* القياسُ لا يكسر مسحة */ }
}

/** يرفع دفعاتِ هذه العيادة وحدَها. يأخذها من المخزن **قبل** الإرسال ويعيدها إن فشل. */
export async function flushScanStats(clinicId: string): Promise<void> {
  const s = load();
  const mine = Object.keys(s).filter((k) => k.startsWith(`${clinicId}|`));
  s.__last = Date.now();
  const taken: Record<string, Bucket> = {};
  for (const k of mine) { taken[k] = s[k] as Bucket; delete s[k]; }
  save(s);
  for (const [k, b] of Object.entries(taken)) {
    try {
      await repo.noteScanShapes(k.split("|")[1], b.counts, b.samples, clinicId);
    } catch {
      // يرجع للمخزن مجموعاً مع ما عُدّ أثناء الإرسال.
      const now = load();
      const cur = (now[k] as Bucket | undefined) ?? { counts: {}, samples: [] };
      for (const [c, n] of Object.entries(b.counts)) cur.counts[c] = (cur.counts[c] ?? 0) + n;
      cur.samples = [...b.samples, ...cur.samples].slice(0, MAX_SAMPLES);
      now[k] = cur;
      save(now);
    }
  }
}
