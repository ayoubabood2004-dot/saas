// ============================================================================
// محرك مساعد doctorVet — الفهم والاسترجاع والحكم، كله على الجهاز.
//
// المساعد لازم يفتهم «اشلون اضيف حيوان» و«شلون أضيف حيوان جديد؟» و«how to add
// pet» ويوصل لنفس الجواب. الطريق: تطبيع إملائي (normalizeAr) + قاموس مرادفات
// لهجة/فصحى/إنكليزي + تسجيل نقاط على مقالات قاعدة المعرفة (assistantKb).
//
// الحكم بثلاث درجات:
//   answer  — مقال واحد واضح فوق الباقي → جاوب مباشرة.
//   options — كم مقال متقارب → «تقصد وحدة من هاي؟» بدل تخمين غلط.
//   unknown — ماكو تطابق مقنع → اعترف بصراحة واعرض رفع طلب تطوير.
//
// «ما أعرف» الصادقة أثمن من جواب مفبرك — هاي القاعدة الأولى بالمحرك.
// ============================================================================
import { KB, type KbArticle } from "./assistantKb";
import { normalizeAr } from "./utils";

export type { KbArticle };

export interface AssistantReply {
  kind: "answer" | "options" | "smalltalk" | "unknown";
  /** النص الي يُعرض ببالونة المساعد. */
  text: string;
  article?: KbArticle;
  /** بدائل متقاربة — تُعرض چبسات «تقصد …؟». */
  options?: KbArticle[];
  route?: string;
  /** true → أعرض زر «ارفعلي طلب تطوير». */
  offerRequest?: boolean;
}

/* ---------------------------- تطبيع الاستفهام ---------------------------- */

/** كلمات استفهام وحشو ما تميّز موضوعاً — تنحذف قبل التسجيل. */
const STOPWORDS = new Set([
  "شلون", "اشلون", "كيف", "كيفية", "وين", "أين", "اين", "شنو", "شو", "ما", "ماذا", "هل",
  "منو", "من", "ليش", "لماذا", "متى", "چم", "كم", "هو", "هي", "انا", "أنا", "انت",
  "اريد", "أريد", "ابي", "ابغى", "بغيت", "ممكن", "اقدر", "أقدر", "تقدر", "يمكن",
  "لو", "سمحت", "رجاء", "بليز", "الله", "يخليك", "عندي", "عدنا", "اكو", "ماكو", "في", "يوجد",
  "الي", "اللي", "التي", "الذي", "هذا", "هذي", "هاي", "ذاك", "على", "عن", "الى", "إلى",
  "مال", "مالت", "بال", "بيه", "بيها", "منه", "منها", "له", "لها", "احتاج", "أحتاج", "لازم",
  "how", "to", "do", "i", "can", "the", "a", "an", "is", "what", "where", "why", "want",
]);

/**
 * مرادفات: كل مجموعة تنطوي على «كلمة قانونية» وحدة، فـ«زريقة» و«حقنة» و«ابرة»
 * كلها تصير «جرعة» قبل المطابقة. المفاتيح والقيم كلها بصيغة normalizeAr.
 */
const SYNONYMS: Record<string, string> = {
  // أفعال شائعة
  "اسوي": "اضيف", "أسوي": "اضيف", "اعمل": "اضيف", "انشئ": "اضيف", "اسجل": "اضيف", "ادخل": "اضيف",
  "امسح": "احذف", "اشيل": "احذف", "الغي": "احذف",
  "اعدل": "اغير", "ابدل": "اغير", "احدث": "اغير",
  // مفردات المجال
  "زريقه": "جرعه", "حقنه": "جرعه", "ابره": "جرعه", "دوا": "دواء", "علاجات": "دواء",
  "فاكسين": "لقاح", "تطعيم": "لقاح", "تلقيح": "لقاح", "vaccine": "لقاح",
  "طبله": "طبله", "لوحه": "طبله", "چارت": "طبله", "chart": "طبله", "تشارت": "طبله",
  "مختبر": "تحليل", "لاب": "تحليل", "lab": "تحليل", "فحص": "تحليل", "فحوصات": "تحليل",
  "مواعيد": "حجز", "موعد": "حجز", "booking": "حجز", "appointment": "حجز",
  "زبون": "مربي", "عميل": "مربي", "صاحب": "مربي", "owner": "مربي", "client": "مربي",
  "قطو": "قطه", "قطط": "قطه", "بزونه": "قطه", "cat": "قطه",
  "چلب": "كلب", "كلاب": "كلب", "dog": "كلب",
  "فلوس": "فاتوره", "حساب": "فاتوره", "بيع": "فاتوره", "كاشير": "فاتوره", "pos": "فاتوره",
  "مخزن": "مخزون", "بضاعه": "مخزون", "ستوك": "مخزون", "stock": "مخزون", "inventory": "مخزون",
  "واتس": "واتساب", "واتس اب": "واتساب", "whatsapp": "واتساب",
  "پرنت": "طباعه", "برنت": "طباعه", "print": "طباعه", "اطبع": "طباعه",
  "باسورد": "كلمه السر", "password": "كلمه السر",
  "عمليه": "عمليات", "جراحه": "عمليات", "surgery": "عمليات",
  "وصفه": "خطه العلاج", "روشته": "خطه العلاج", "prescription": "خطه العلاج",
  "اشتراك": "باقه", "دفع": "باقه", "subscription": "باقه",
};

/** توكِنة السؤال: تطبيع → حذف الحشو → تبديل المرادفات. */
export function tokenize(q: string): string[] {
  return q
    .split(/[\s،؟?!.,:;()«»"']+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w) && !STOPWORDS.has(normalizeAr(w)))
    .map((w) => {
      const n = normalizeAr(w);
      return SYNONYMS[n] ?? n;
    })
    .filter((w) => w.length > 1);
}

/* ------------------------------- التسجيل -------------------------------- */

interface Scored { article: KbArticle; score: number; hits: number }

function scoreArticle(tokens: string[], art: KbArticle): Scored {
  const keys = art.keywords.map((k) => normalizeAr(k));
  const title = normalizeAr(art.title);
  const answer = normalizeAr(art.answer);
  let score = 0;
  let hits = 0;
  for (const t of tokens) {
    let best = 0;
    for (const k of keys) {
      if (k === t) { best = Math.max(best, 3); break; }
      if (k.length > 2 && t.length > 2 && (k.includes(t) || t.includes(k))) best = Math.max(best, 2);
    }
    if (title.includes(t)) best = Math.max(best, 2.5);
    if (best === 0 && t.length > 2 && answer.includes(t)) best = 0.5;
    if (best > 0) hits++;
    score += best;
  }
  // مكافأة التغطية للأسئلة الطويلة فقط: سؤال من ٥ كلمات انطبقت منه وحدة مشكوك،
  // أما «مصروف» لوحدها فضربة مفتاحية كاملة وما تستاهل عقوبة على قِصَرها.
  const coverage = tokens.length ? hits / tokens.length : 0;
  const adjusted = tokens.length >= 4 ? score * (0.6 + 0.4 * coverage) : score;
  return { article: art, score: adjusted, hits };
}

/* ------------------------------ حوار خفيف ------------------------------- */

// ملاحظة: \b لا يعمل مع الحروف العربية (ليست ضمن \w) — نفحص أول كلمة بمجموعة.
const GREETINGS = new Set(["هلو", "هلا", "هاي", "مرحبا", "مرحبه", "سلام", "السلام", "شلونك", "شونك", "صباح", "مساء", "hi", "hello", "hey"]);
const isGreeting = (raw: string): boolean => {
  const first = normalizeAr(raw.split(/[\s،!؟?.]+/)[0] ?? "");
  return GREETINGS.has(first) && raw.trim().split(/\s+/).length <= 4;
};
const THANKS_RE = /(شكرا|تسلم|عاشت ايدك|ممنون|يعطيك العافيه|thank)/i;
const WHO_RE = /(منو انت|من انت|شنو انت|شنو تسوي|شتسوي|بيش تفيدني|شلون تساعدني|who are you|what can you do)/i;
/** صيغ «أريد ميزة» — تُدفع مباشرة نحو رفع طلب إذا ماكو مقال يغطيها. */
const WISH_RE = /(اتمنى|ياريت|يا ريت|لو تضيفون|ممكن تضيفون|ليش ماكو|لا يوجد|مو موجود|مطلوب اضافه|اقترح|اقتراح)/;

/* ------------------------------- الواجهة -------------------------------- */

const CONFIDENT = 3;   // ضربة مفتاحية كاملة وحدة (=٣) تكفي كجواب واثق
const CLOSE_RATIO = 0.75; // البدائل ضمن 75% من الأول تُعرض كخيارات

export function ask(question: string): AssistantReply {
  const raw = question.trim();
  if (!raw) return { kind: "smalltalk", text: "اكتب سؤالك وأنا حاضر 🙂" };

  if (isGreeting(raw)) {
    return { kind: "smalltalk", text: "هلو دكتور 👋 آني مساعد doctorVet — أعرف كل زاوية بالسستم.\nاسألني أي شيء: «شلون أضيف حيوان؟»، «وين أشوف اللقاحات؟»، «شلون أسوي خطة علاج؟»…" };
  }
  if (THANKS_RE.test(raw) && raw.length < 30) {
    return { kind: "smalltalk", text: "تدلل دكتور 🌟 أي وقت تحتاجني، آني هنا." };
  }
  if (WHO_RE.test(raw)) {
    return {
      kind: "smalltalk",
      text: "آني المساعد الذكي مال doctorVet 🤖\n• أجاوبك على أي سؤال بالسستم خطوة بخطوة\n• أدلك وين تلگي أي شاشة أو زر\n• وإذا سألت عن شيء مو موجود — أرفع طلبك لفريق التطوير مباشرة\nجرب اسألني بأي صيغة تريحك، عربي أو إنكليزي أو لهجة.",
    };
  }

  const tokens = tokenize(raw);
  const scored = KB.map((a) => scoreArticle(tokens, a)).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const wish = WISH_RE.test(raw);

  // ماكو إشارة كافية → صراحة + عرض الطلب
  if (!top || top.score < CONFIDENT || tokens.length === 0) {
    if (wish) {
      return {
        kind: "unknown",
        text: "فهمت عليك — هاي تبين ميزة جديدة مو موجودة حالياً بالسستم.\nتريدني أرفعلك طلب رسمي بيها لفريق التطوير؟ طلبات الدكاترة هي الي ترسم شكل التحديثات الجاية 🚀",
        offerRequest: true,
      };
    }
    return {
      kind: "unknown",
      text: "صراحةً ما لگيت جواب دقيق لسؤالك 🤔 — يا إما ما فهمته زين، يا إما الشيء الي تسأل عنه مو موجود بالسستم.\nجرب تصيغه بكلمات ثانية، أو اضغط الزر وأرفعلك طلب لفريق التطوير.",
      offerRequest: true,
    };
  }

  // كم مقال متقارب → خيارات بدل تخمين
  const close = scored.slice(1, 4).filter((s) => s.score >= top.score * CLOSE_RATIO && s.score >= CONFIDENT);
  if (close.length > 0 && top.score < CONFIDENT * 2.5) {
    return {
      kind: "options",
      text: "سؤالك يحتمل أكثر من موضوع — تقصد وحدة من هاي؟",
      options: [top.article, ...close.map((s) => s.article)],
    };
  }

  return {
    kind: "answer",
    text: top.article.answer,
    article: top.article,
    route: top.article.route,
  };
}

/** جواب مقال محدد (لما يختار المستخدم من چبسات «تقصد؟»). */
export function answerFor(articleId: string): AssistantReply {
  const art = KB.find((a) => a.id === articleId);
  if (!art) return { kind: "unknown", text: "ما لگيت هالموضوع.", offerRequest: true };
  return { kind: "answer", text: art.answer, article: art, route: art.route };
}

/** أسئلة مقترحة للبداية — أوسع المواضيع استخداماً. */
export function suggestedQuestions(): KbArticle[] {
  const ids = ["add-new-pet-owner", "wizard-overview", "give-dose", "add-vaccine-schedule-booster", "make-sale-pos", "feature-request-how"];
  const picked = ids.map((id) => KB.find((a) => a.id === id)).filter(Boolean) as KbArticle[];
  return picked.length >= 4 ? picked : KB.slice(0, 6);
}
