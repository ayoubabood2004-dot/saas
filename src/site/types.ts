/* ============================================================================
 * عقدُ محتوى الموقع التسويقيّ (٢٥/١٠) — بين من يكتب النصّ ومن يرسمه.
 *
 * كلُّ صفحةٍ ملفُّ JSON بـ`src/site/content/<lang>/` (العربيةُ البيضاء `ar` والإنكليزية `en`)،
 * وطبقاتُ اللهجة بـ`src/site/content/dialects/<dialect>/` تغطّي ما يُقنِع وحده (العناوين، الدعوات،
 * صوتُ الأسئلة) وتُدمج فوق العربية. لا نصَّ عربيّاً بملفّات الرسم (`i18n-guard`).
 *
 * قواعدُ النصّ (يفحصها `scripts/site-guard.mjs`):
 *   • كلُّ قدرةٍ تُذكر موجودةٌ بالشِفرة اليوم — ما هو «بلمسة» يُقال «بلمسة» لا «تلقائياً».
 *   • لا أرقامَ اجتماعيةٌ ولا تقييماتٌ ولا شهادات ولا «الأفضل» ولا «١٠٠ ضعف».
 *   • أرقامٌ غربية (0-9) بكلّ النسخ — سياسةُ التطبيق كلّه.
 *   • `{{var}}` نفسُها بالعربية والإنكليزية والطبقة.
 * ==========================================================================*/

export type Lang = "ar" | "en";
export type DialectId = "iq" | "gulf" | "eg" | "lev";
export type PlanTier = "all" | "advanced" | "super" | "farm";

/** فقرةٌ بعنوانٍ وجسد — الوحدةُ الأكثر تكراراً بالموقع. */
export interface TitleBody { title: string; body: string }
export interface QA { q: string; a: string }
export interface Meta { title: string; description: string }

/* ── common.json — الرأسُ والتذييل والقائمة ومحوِّلُ الدولة ──────────────── */
export interface CommonContent {
  nav: { product: string; pricing: string; why: string; security: string; faq: string; start: string; login: string; menu: string; close: string };
  /** مجموعاتُ القائمة العملاقة — `items` معرّفاتُ صفحات التصنيفات (FeatureSlug). */
  mega: { groups: { title: string; items: FeatureSlug[] }[]; featured: { title: string; body: string; slug: FeatureSlug }; all: string };
  cta: { primary: string; secondary: string; reassure: string; login: string };
  switcher: { label: string; title: string; search: string; suggest: string; yes: string; no: string; english: string; arabic: string };
  footer: { tagline: string; product: string; resources: string; company: string; legal: string; privacy: string; terms: string; rights: string; available: string; madeIn: string };
  demoLabel: string;
  breadcrumbHome: string;
  planBadge: Record<PlanTier, string>;
  learnMore: string;
  backToFeatures: string;
  related: string;
}

/* ── home.json ─────────────────────────────────────────────────────────── */
/** بطاقةُ التطعيم بالبطل — توقيعُ الموقع: سجلٌّ مختوم وجرعةٌ مستحقّة ورسالتُها جاهزةٌ بلمسة. */
export interface BookletContent {
  label: string;
  title: string;
  pet: string;
  owner: string;
  rows: { vaccine: string; date: string; status: "given" | "due" }[];
  givenStamp: string;
  dueBadge: string;
  message: string;
  send: string;
  oneTap: string;
}

export interface HomeContent {
  meta: Meta;
  hero: { badge: string; title: string; titleAccent: string; sub: string; points: string[]; card?: BookletContent };
  /** «وين عيادتك اليوم؟» — بطاقاتٌ يختار منها الزائر قصّتَه. */
  segments: { title: string; sub: string; items: (TitleBody & { key: string; link: FeatureSlug | "start" | "pricing" })[] };
  pains: { title: string; sub: string; items: { pain: string; fix: string; feature: FeatureSlug }[] };
  /** جولةُ يوم العيادة بالتبويبات. */
  tour: { title: string; sub: string; tabs: { key: string; label: string; title: string; body: string; bullets: string[]; feature: FeatureSlug }[] };
  diff: { title: string; sub: string; items: TitleBody[] };
  start: { title: string; sub: string; steps: TitleBody[]; link: string };
  pricingTeaser: { title: string; sub: string; link: string; from: string };
  security: { title: string; sub: string; items: TitleBody[]; link: string };
  faq: { title: string; items: QA[]; link: string };
  final: { title: string; sub: string };
}

/* ── pricing.json ──────────────────────────────────────────────────────── */
export type PlanId = "basic" | "advanced" | "super";
export type Cell = boolean | string;
export interface PricingContent {
  meta: Meta;
  hero: { title: string; sub: string };
  toggle: { monthly: string; annual: string; save: string };
  perMonth: string;
  perYear: string;
  perDay: string;
  usdLine: string;
  approx: string;
  plans: Record<PlanId, { name: string; for: string; cta: string; badge?: string; highlights: string[] }>;
  includes: { title: string; items: string[] };
  compare: { title: string; plansHeader: string; groups: { title: string; rows: { label: string; basic: Cell; advanced: Cell; super: Cell }[] }[] };
  trial: { title: string; items: string[] };
  payment: { title: string; iraq: string; other: string; howTitle: string };
  roi: { title: string; sub: string; visitsLabel: string; feeLabel: string; missedLabel: string; result: string; note: string };
  faq: { title: string; items: QA[] };
  final: { title: string; sub: string };
}

/* ── features.json (الفهرس) + features/<slug>.json ─────────────────────── */
export const FEATURE_SLUGS = [
  "records", "hospital", "lab", "vaccines", "reception", "pharmacy", "pos", "credit-delivery",
  "store", "whatsapp", "owners", "reports", "team", "branches", "poultry", "printing",
] as const;
export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

export interface FeaturesIndexContent {
  meta: Meta;
  hero: { title: string; sub: string };
  cards: Record<FeatureSlug, { title: string; short: string }>;
}

export interface FeatureContent {
  meta: Meta;
  hero: { eyebrow: string; title: string; sub: string };
  pains: { title: string; items: TitleBody[] };
  steps: { title: string; items: TitleBody[] };
  caps: { title: string; groups: { title: string; items: TitleBody[] }[] };
  plan: PlanTier;
  planNote: string;
  /** شاشةٌ توضيحيةٌ مرسومة (لا صورةَ مختلقة) — عناوينُ صفوفها وأرقامُها مسمّاةٌ «بيانات توضيحية». */
  mock: { title: string; rows: { label: string; value: string; tone?: "ok" | "warn" | "bad" | "info" }[] };
  faqs: QA[];
  related: FeatureSlug[];
}

/* ── faq.json / security.json / start.json ─────────────────────────────── */
export interface FaqContent { meta: Meta; hero: { title: string; sub: string }; groups: { title: string; items: QA[] }[] }
export interface SecurityContent {
  meta: Meta;
  hero: { title: string; sub: string };
  sections: (TitleBody & { bullets: string[] })[];
  limits: { title: string; items: string[] };
}
export interface StartContent {
  meta: Meta;
  hero: { title: string; sub: string };
  steps: (TitleBody & { bullets: string[] })[];
  honest: { title: string; items: string[] };
  faq: QA[];
}

/* ── privacy.json / terms.json ─────────────────────────────────────────── */
export interface LegalContent {
  meta: Meta;
  title: string;
  updated: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
}

export interface SiteContent {
  common: CommonContent;
  home: HomeContent;
  pricing: PricingContent;
  features: FeaturesIndexContent;
  feature: Record<FeatureSlug, FeatureContent>;
  faq: FaqContent;
  security: SecurityContent;
  start: StartContent;
  privacy: LegalContent;
  terms: LegalContent;
}

/* ── الصفحاتُ المولَّدة ────────────────────────────────────────────────── */
export type PageKind = "home" | "pricing" | "features" | "feature" | "faq" | "security" | "start" | "privacy" | "terms";
export interface Route {
  /** رمزُ النسخة بالرابط (`sa`، `eg`، `en`…) — أو null للصفحات القانونية بالجذر. */
  edition: string | null;
  kind: PageKind;
  slug?: FeatureSlug;
  /** المسارُ كما يُطلب: `/sa/features/pos`. */
  path: string;
}

/** أسعارُ الباقات كما تُعرض — تُحسب ساعةَ البناء وتُحدَّث بعد التحميل من `public_pricing()`. */
export interface PlanPrice { monthly: number; annual: number }
export interface PricingData {
  /** بالدولار — مرجعُ الحساب (`plan_prices`). */
  usd: Record<PlanId, PlanPrice>;
  /** دولارٌ للدينار كما تقبض Wayl (`app_config.usd_rate`). */
  usdRate: number;
  /** أسعارٌ محلّيةٌ حدّدها المالك (`plan_local_prices`) — بالعملة ⇒ الباقة. */
  local: Record<string, Partial<Record<PlanId, PlanPrice>>>;
  /** متى قُرئت (ISO) — يظهر للزائر بدقّة «الأسعار كما في…». */
  at: string;
}
