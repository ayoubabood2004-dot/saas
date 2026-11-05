/* ============================================================================
 * راجيتةُ العيادة (0261) — «من خطة العلاج»: أدويةُ آخر خطةٍ مسجّلة للحيوان أسطراً تُدرج بالراجيتة.
 *
 * وحدةٌ صِرفة (بلا React ولا repo ولا نصوص): الكلمةُ الوحيدة («٧ أيام») يمرّرها المستدعي بلغته.
 * والجرعةُ تُكتب **كما حُفظت** — لا formatNum (يُسقط الكسور: 0.06 مل كانت تصير «0 مل»، dose-safety-test).
 * والخطةُ = أحدثُ ملاحظةٍ سريرية (CLINRX1) ليست «معلومات الدخول» (isIntake، intake.ts) وفيها دواء — بأحدث تاريخ لا بترتيب الوصول.
 * ========================================================================= */
import { parseClinical, type ClinicalRecord } from "./clinicalRecord";
import { isIntake } from "./intake";

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
