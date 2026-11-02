/* ============================================================================
 * بندُ مختبرٍ ← خدمةُ الكتالوج التي تُفوتِره (جسرُ LabCenter ← شاشة البيع).
 *
 * التحليلُ يحمل اسمَ لوحته من labCatalog («تحليل البول»، «فحص سريع Snap»…)، والخدمةُ
 * اسمَها بيد العيادة («تحليل بول»، «فحص براز»…)، ولا رابطَ بالمعرّف بينهما.
 *
 * كانت المطابقةُ «أكثرُ كلماتٍ مشتركة، والأوّلُ بالقائمة يفوز بالتعادل»، بلا تطبيع: «البول» ≠ «بول»،
 * فتعادلت «تحليل البول» مع «تحليل دم شامل (CBC)» على كلمة «تحليل» وفاز الأوّل — بولٌ يُفوتَر بسعر CBC؛
 * و«فحص سريع Snap» صار «فحص براز» على كلمة «فحص»، و«تحليل حر» صار CBC. هذا بالكتالوج الافتراضيّ نفسِه.
 * ومنذ 0252 معرّفُ الخدمة يقرّر أيَّ وصفةٍ تنخصم: المطابقةُ الخاطئةُ لا تخطئ السعرَ وحده، بل تخصم
 * بصمتٍ كواشفَ تحليلٍ لم يُعمل وتترك كواشفَ الذي عُمل.
 *
 * القاعدة (الطرفان من طيٍّ واحد: foldAr والأرقام، وأداةُ التعريف تُقشَر من كلّ كلمة):
 *   ١) الاسمُ نفسُه بعد الطيّ ⇒ هي. وإن حملته خدمتان فلا حكم.
 *   ٢) وإلا الأقربُ **وحدَه** بالكلمات الخاصّة (الكلمةُ العامّة لا تُقرّب: «تحليل فيروس بارفو» من «فحص بارفو»
 *      لا من «تحليل دم») — والتعادلُ لا يُحسم بترتيب القائمة — وبينهما كلمةٌ **مميِّزة**: لا تحملها خدمةٌ أخرى
 *      بالكتالوج. «فحص» أو «تحليل» وحدها لا تجعل فحصاً فحصاً آخر.
 *   ٣) وإلا null: البندُ يهبط باسم التحليل بلا خدمة — سعرٌ صفر يراه الكاشير، ولا خصم.
 *      المجهولُ يُقال، لا يُخمَّن: خصمٌ خاطئ يُصدَّق، وسعرٌ صفر يُرى.
 * ==========================================================================*/
import { foldAr } from "./utils";
import { normalizeDigits } from "./digits";

/** كلماتٌ تسمّي **نوعَ** الشيء لا الشيءَ نفسَه: تُحسب بالقرب ولا تكفي وحدها للحكم. مطويّةٌ كما تُطوى الأسماء. */
const GENERIC = new Set(["فحص", "تحليل", "تحاليل", "لوحه", "اختبار", "test", "panel"]); /* i18n-data: كلماتٌ تُطابَق بها أسماءُ التحاليل، لا نصٌّ معروض */

/** كلماتُ الاسم بعد الطيّ: لا تشكيلَ ولا ترقيم، والأرقامُ موحّدة، و«ال» مقشورةٌ من الكلمة («البول» = «بول»). */
export function labWords(s: string): string[] {
  return foldAr(normalizeDigits(String(s ?? "")))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w)) /* i18n-data: أداةُ التعريف تُقشَر للمطابقة، لا نصٌّ معروض */
    .filter((w) => w.length >= 2);
}

/** خدمةُ الكتالوج لبندِ مختبرٍ باسمه، أو null حين لا يُعرف بلا تخمين (أعلاه). */
export function matchLabService<S extends { id: string; name: string }>(label: string, services: readonly S[]): S | null {
  const want = labWords(label);
  if (!want.length) return null;
  const words = services.map((s) => labWords(s.name));

  const key = want.join(" ");
  const same = services.filter((_, i) => words[i].join(" ") === key);
  if (same.length) return same.length === 1 ? same[0] : null;

  const wanted = new Set(want.filter((w) => !GENERIC.has(w)));   // القربُ بالكلمات الخاصّة وحدها
  const carriers = new Map<string, number>();                     // كلمة ← كم خدمةً تحملها
  for (const ws of words) for (const w of new Set(ws)) carriers.set(w, (carriers.get(w) ?? 0) + 1);

  let best = -1, bestScore = 0, tie = false;
  words.forEach((ws, i) => {
    const score = new Set(ws.filter((w) => wanted.has(w))).size;
    if (score > bestScore) { best = i; bestScore = score; tie = false; }
    else if (score > 0 && score === bestScore) tie = true;
  });
  if (best < 0 || tie) return null;
  const telling = words[best].some((w) => wanted.has(w) && carriers.get(w) === 1);
  return telling ? services[best] : null;
}
