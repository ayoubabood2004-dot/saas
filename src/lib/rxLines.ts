/* ============================================================================
 * راجيتةُ العيادة (0261) — «من خطة العلاج»: أدويةُ آخر خطةٍ مسجّلة للحيوان أسطراً تُدرج بالراجيتة.
 *
 * وحدةٌ صِرفة (بلا React ولا repo ولا نصوص): الكلمةُ الوحيدة («٧ أيام») يمرّرها المستدعي بلغته.
 * والجرعةُ تُكتب **كما حُفظت** — لا formatNum (يُسقط الكسور: 0.06 مل كانت تصير «0 مل»، dose-safety-test).
 * والخطةُ = أحدثُ ملاحظةٍ سريرية (CLINRX1) ليست «معلومات الدخول» (isIntake، intake.ts) وفيها دواء — بأحدث تاريخ لا بترتيب الوصول.
 * ========================================================================= */
import { parseClinical, type ClinicalRecord } from "./clinicalRecord";
import { isIntake } from "./intake";
import { searchable } from "./utils";

export type RxPlanItem = NonNullable<ClinicalRecord["treatment"]>[number];
export interface RxPlan { at: string; items: RxPlanItem[] }

/** أحدثُ خطة علاجٍ بأدوية من ملاحظات الحيوان (أيّاً كان ترتيبُها)، أو null — **بعد قراءةٍ نجحت** وحدها تعني «ماكو خطة». */
export function latestPlan(notes: readonly { note_text: string; created_at: string }[]): RxPlan | null {
  let best: RxPlan | null = null;
  for (const n of notes) {
    const rec = parseClinical(n.note_text).record;
    if (!rec || isIntake(rec) || !Array.isArray(rec.treatment)) continue;
    const items = rec.treatment.filter((it) => it && typeof it.name === "string" && it.name.trim());
    if (!items.length) continue;
    if (!best || n.created_at > best.at) best = { at: n.created_at, items };
  }
  return best;
}

/** سطرُ دواء: «Amoxicillin 250 mg — مرتين يومياً · 7 أيام · فموي · بعد الأكل». */
export function planLine(it: RxPlanItem, days: (n: number) => string): string {
  const head = [it.name.trim(), (it.dose ?? "").trim()].filter(Boolean).join(" ");
  const note = (it.note ?? "").trim();
  const route = (it.route ?? "").trim();
  const tail = [
    (it.freq ?? "").trim(),
    Number.isFinite(it.days) && it.days > 0 ? days(Math.round(it.days)) : "",
    note || route,
  ].filter(Boolean);
  return tail.length ? `${head} — ${tail.join(" · ")}` : head;
}

/** يضيف أسطراً بآخر النصّ (بسطرٍ جديد)، ولا يكرّر سطراً موجوداً كما هو. */
export function appendLines(body: string, lines: readonly string[]): string {
  const have = new Set(body.split("\n").map((l) => l.trim()).filter(Boolean));
  const add = lines.map((l) => l.trim()).filter((l) => l && !have.has(l));
  if (!add.length) return body;
  const base = body.replace(/\s+$/, "");
  return base ? `${base}\n${add.join("\n")}` : add.join("\n");
}

/** «أضفها هنا»: نصُّ راجيتةٍ سابقة **كما هو** كتلةً بعد سطرٍ فارغ — بلا حذف المكرّر: سطرُ الجرعة «1×1 لمدة 5 أيام»
 *  يتكرّر بين الأدوية، وحذفُه كان يُسقط جرعاتِ الراجيتة المنسوخة بصمت. */
export function appendBlock(body: string, block: string): string {
  const add = block.replace(/\r\n?/g, "\n").replace(/^\s*\n|\s+$/g, "");
  if (!add.trim()) return body;
  const base = body.replace(/\s+$/, "");
  return base ? `${base}\n\n${add}` : add;
}

/** كلماتُ اسمٍ للمطابقة: كلُّ كلمةٍ بـsearchable (الهمزة والتاء والأرقام)، بلا الألقاب ولا الحرف الواحد («د.»). */
function nameWords(s: string | null | undefined, titles: ReadonlySet<string>): string[] {
  return String(s ?? "").split(/[^\p{L}\p{M}\p{N}]+/u).map((w) => searchable(w)).filter((w) => w.length > 1 && !titles.has(w));
}

/**
 * الدكتورُ الموقّعُ افتراضاً: اسمُ الحساب بأسماء دكاترة الراجيتة **كلماتٍ كاملة وبترتيبها من أوّلها** — الاسمُ الأقصر أوّلُ
 * كلمات الأطول (الاسمُ ثمّ اسمُ الأب): «حسن» لا يطابق «محسن»، و«علي» لا يطابق «عليا» ولا «عباس علي» (علي اسمُ أبيه)، و«علي حسن»
 * لا يطابق «حسن علي» (ابنُه غالباً). ولا يُختار إلا دكتورٌ واحدٌ طابق: اثنان طابقا («علي» بـ«علي حسن» و«علي كاظم») تخمينٌ لا يُكتب
 * تحت التوقيع. وبلا مطابقة: الدكتورُ الوحيدُ بالراجيتة، وإلا لا أحد.
 * `titles`: الألقابُ التي لا تُعدّ كلمة (د، دكتور، Dr…) — من القاموس (rx.drTitles) لا من الشِفرة.
 */
export function pickDoctor(me: string | null | undefined, names: readonly string[], titles: readonly string[]): string {
  const T = new Set(titles.map((x) => searchable(x)).filter(Boolean));
  const valid = names.filter((n) => n.trim());
  const mine = nameWords(me, T);
  if (mine.length) {
    const hits = valid.filter((n) => {
      const d = nameWords(n, T);
      if (!d.length) return false;
      const [short, long] = d.length <= mine.length ? [d, mine] : [mine, d];
      return short.every((w, i) => long[i] === w);
    });
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return "";
  }
  return valid.length === 1 ? valid[0] : "";
}

/** هل الدواءُ بالنصّ؟ (منتقي الأدوية يعلّمه) — سطرٌ يبدأ باسمه كاملاً. */
export function hasDrugLine(body: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return body.split("\n").some((l) => {
    const s = l.trim().toLowerCase();
    return s === n || s.startsWith(`${n} `);
  });
}

/** يشيل سطرَ الدواء **كما أُدرج** (الاسمُ وحده) — سطرٌ كتب عليه الطبيبُ جرعةً يبقى. */
export function removeDrugLine(body: string, name: string): string {
  const n = name.trim().toLowerCase();
  return body.split("\n").filter((l) => l.trim().toLowerCase() !== n).join("\n");
}
