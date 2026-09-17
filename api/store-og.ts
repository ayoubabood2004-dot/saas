/**
 * معاينة رابط الستور — /s/:slug
 *
 * المشكلة: التطبيق SPA وكل المسارات ترجع index.html بميتا تاغات doctorVet
 * العامة، فرابط البايو بالانستغرام/واتساب كان يطلع «doctorVet» بدل اسم
 * العيادة. واتساب وفيسبوك ما يشغّلون جافاسكربت — يقرأون الـHTML الخام فقط.
 *
 * الحل: هذه الدالة تلتقط /s/:slug، تسأل store_front (نفس الـRPC العامة الي
 * يستعملها المتصفح)، وتعيد index.html نفسه بعد استبدال بلوك الميتا باسم
 * العيادة ووصفها. الصفحة تبقى SPA عادية — بس المعاينة تصير صحيحة.
 *
 * لو أي شيء فشل (env ناقصة، السحابة ما ردت، slug مو موجود) نرجع index.html
 * كما هو — نفس سلوك اليوم بالضبط، فما في وضع أسوأ من الحالي.
 *
 * ── الصورة (0190/ت٨): «ما في وضع أسوأ» كان غلطاً ─────────────────────────
 * البلوكُ أعلاه يمسح **كلَّ** وسوم og و twitter من القالب ثم يكتب مجموعةً
 * بلا og:image. والقالبُ فيه صورةٌ ١٢٠٠×٦٣٠ (`/og.jpg`) — فرابطُ متجرِ عيادةٍ
 * كان يُشارَك **أسوأ** من رابط الموقع العام: بطاقةٌ نصّيةٌ بلا صورة، وهو ما
 * يصل زبونَها بالواتساب والانستغرام. الترتيب الآن:
 *
 *   ١) شعارُ العيادة إن كان **مساراً** بالدلو ⇒ صورةُ البطاقة، وبطاقةٌ
 *      مربّعة (`summary`): الشعارُ مربّعٌ تقريباً، وحشرُه بإطار ١٢٠٠×٦٣٠
 *      يقصّه أو يحيطه بفراغ.
 *   ٢) شعارٌ بصيغة `data:` (السبعةُ القديمة قبل ت٧) ⇒ **يُتخطّى**: زاحفُ
 *      واتساب يطلب رابطاً بشبكةٍ ولا يقرأ عنواناً مضمَّناً، ووضعُه بالرأس
 *      يضيف مئةَ كيلوبايتٍ لكلّ زحفة. زرُّ «انقل الشعار» بالإعدادات هو
 *      طريقُهنّ إلى المسار الحقيقي.
 *   ٣) بلا شعار ⇒ `/og.jpg` كما بالقالب — استرجاعُ ما كان يُمحى لا أكثر.
 */
import { shelfLook, shelfLabel } from "../src/lib/storeLib";

export const config = { runtime: "edge" };

/** عددُ موادِّ البذرة — مرآةُ `PAGE` بـStorefront.tsx (الصفحةُ الأولى). */
const BOOT_PAGE = 24;
/** ما يُرسم بالمستند نفسِه: ما يملأ شاشةَ هاتفٍ ونصفاً — الباقي يرسمه React. */
const PAINT_ROWS = 8;

type Row = { id: string; name: string; price: number; available?: boolean; image_path?: string | null; featured?: boolean; subcategory?: string | null };

/**
 * رفٌّ مرسومٌ بالـHTML — يظهر قبل أن تنزل جافاسكربت بحرف.
 *
 * ── لماذا ────────────────────────────────────────────────────────────────
 * المقيس بمتصفّحٍ حقيقيّ بمعالجٍ مبطّأ ×٤: أوّلُ منتجٍ عند الزبون بعد **٣٬٦٠٠ms
 * على 4G بطيء** و**١٢٬٤٠٠ms على 3G**، و«أوّلُ رسم» يقع باللحظة نفسها — أي أنّ
 * الوقتَ كلَّه تنزيلُ الحزمة وتشغيلُها على هاتفٍ رخيص، لا الخادمُ ولا القاعدة.
 * وبذرةُ البيانات وحدَها لم تنفع (٣٬٦٠٣ ⇒ ٣٬٥٩٩): تُقرأ داخل React، فتنتظر
 * ما تنتظره الصفحةُ كلُّها.
 *
 * فما دام المستندُ يحمل البضاعةَ أصلاً، فليحملها **مرسومة**: HTML وCSS تُرسمان
 * بمئات الملّي ثانية، وReact يستبدلها حين يجهز. والزبونُ يرى رفَّه فوراً.
 *
 * ── ولماذا لا يُخشى «الوميض» ─────────────────────────────────────────────
 * الأصنافُ هنا منسوخةٌ حرفياً عن `Storefront.tsx`، و`shelfLook`/`shelfLabel`
 * مستورَدتان من نفس الوحدة المشتركة — فما يستبدله React يشبه ما استبدله.
 * و`store-paint-guard` يفشّل البناءَ إن انحرف صنفٌ عن أصله.
 *
 * وسعرُ العملة بالافتراض العراقيّ: الواجهةُ نفسُها تقرؤه من تفضيل الجهاز لا من
 * العيادة، وافتراضُها هو هذا — فإن اختلف صحّحه React بلحظة تركيبه.
 */
const esc2 = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iqd = (n: number) => `${new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0))} د.ع`;

function paintShelf(front: { name?: string }, rows: Row[], supaUrl: string): string {
  const cards = rows.slice(0, PAINT_ROWS).map((p) => {
    const shelf = shelfLook(p.name);
    const img = p.image_path && !p.image_path.startsWith("data:")
      ? `<img src="${esc2(`${supaUrl}/storage/v1/object/public/product-images/${p.image_path}`)}" alt="" width="400" height="400" class="absolute inset-0 h-full w-full object-contain p-1.5" />`
      : "";
    return `<div class="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-1${p.available === false ? " opacity-60" : ""}">
      <div class="relative grid aspect-square place-items-center overflow-hidden ${shelf.tile}">
        <span class="px-2 text-center font-display text-base font-bold leading-tight ${shelf.ink}">${esc2(shelfLabel(p.name))}</span>${img}
      </div>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <p class="line-clamp-2 text-sm font-bold leading-snug text-ink">${esc2(p.name)}</p>
        ${p.subcategory ? `<span class="self-start rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">${esc2(p.subcategory)}</span>` : ""}
        <div class="mt-auto grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2 pt-1.5">
          <p class="font-display text-base font-bold tabular-nums text-ink">${esc2(iqd(p.price))}</p>
          <span class="grid h-11 w-11 justify-self-end place-items-center rounded-xl bg-brand-600"></span>
        </div>
      </div>
    </div>`;
  }).join("");

  return `<div dir="rtl" class="min-h-screen bg-surface pb-28">
    <header class="bg-brand-700 px-4 pb-3 pt-4 text-white">
      <div class="mx-auto flex max-w-3xl items-center gap-3">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15"></span>
        <div class="min-w-0 flex-1"><h1 class="line-clamp-2 font-display text-lg font-bold leading-tight">${esc2(front.name)}</h1></div>
      </div>
    </header>
    <div class="mx-auto max-w-3xl px-4 pt-3">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">${cards}</div>
    </div>
  </div>`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  const origin = url.origin;

  // قالبُ **مدخل الزائر** لا قالبَ تطبيق العيادة (ت١١): `/s/*` صار له مستندٌ
  // خاصٌّ لا يعرف تطبيقَ العيادة — ١٤٤ كيلو مضغوطة بدل ٤٦٣. وجلبُ `index.html`
  // هنا كان سيلغي المدخلَ الثاني بصمت: الزاحفُ يقرأ الوسوم كما هي والزبونُ
  // ينزّل القشرةَ الثقيلة نفسَها.
  const shellRes = await fetch(`${origin}/store.html`);
  const shell = await shellRes.text();
  const asHtml = (html: string, cacheSeconds: number) =>
    new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=600`,
      },
    });

  const supaUrl = (process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug) || !supaUrl || !anonKey) {
    return asHtml(shell, 60);
  }

  const rpc = (fn: string, args: Record<string, unknown>) => fetch(`${supaUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anonKey, authorization: `Bearer ${anonKey}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4000),
  });

  try {
    /* الكتلوجُ بالتوازي مع الواجهة، لا بعدها: الطلبان من الحافة إلى القاعدة
     * جارَان (ملّي ثوانٍ)، والانتظارُ المتسلسلُ كان سيضيف واحداً بلا سبب.
     * وإن كان المتجرُ مغلقاً نرمي الكتلوجَ ولا نستعمله. */
    const [r, rc] = await Promise.all([
      rpc("store_front", { p_slug: slug }),
      rpc("store_catalog", { p_slug: slug, p_limit: BOOT_PAGE, p_offset: 0 }).catch(() => null),
    ]);
    if (!r.ok) return asHtml(shell, 60);
    const front = (await r.json()) as { ok?: boolean; name?: string; bio?: string; logo_url?: string | null };
    if (!front?.ok || !front.name) return asHtml(shell, 60);
    const catalog = rc && rc.ok ? await rc.json().catch(() => null) : null;

    const title = esc(`${front.name} — المتجر`);
    const desc = esc(front.bio?.trim() || `تصفح منتجات ${front.name} واطلب توصيلاً حتى باب البيت.`);
    const pageUrl = esc(`${origin}/s/${slug}`);

    // مسارٌ لا عنوانٌ مضمَّن ولا رابطٌ جاهز: العمودُ يحمل مساراً داخل الدلو
    // (0190)، والرابطُ العامّ يُبنى هنا بنفس صيغة `productImageUrl` حرفياً.
    const logoPath = (front.logo_url || "").trim();
    const clinicLogo = logoPath && !logoPath.startsWith("data:") && !/^https?:/i.test(logoPath)
      ? `${supaUrl}/storage/v1/object/public/product-images/${logoPath}`
      : "";
    const image = esc(clinicLogo || `${origin}/og.jpg`);
    const imageMeta = clinicLogo
      ? [
          `<meta property="og:image" content="${image}" />`,
          `<meta property="og:image:alt" content="${title}" />`,
          `<meta name="twitter:card" content="summary" />`,
          `<meta name="twitter:image" content="${image}" />`,
        ]
      : [
          `<meta property="og:image" content="${image}" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta property="og:image:alt" content="${title}" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:image" content="${image}" />`,
        ];

    const meta = [
      `<title>${title}</title>`,
      `<meta name="description" content="${desc}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="doctorVet" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:url" content="${pageUrl}" />`,
      `<meta property="og:locale" content="ar_IQ" />`,
      ...imageMeta,
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${desc}" />`,
    ].join("\n    ");

    /* ── بذرةُ البيانات بالمستند نفسِه ─────────────────────────────────
     * المقيس: أوّلُ منتجٍ يظهر بعد ٣٬٦٠٣ms على 4G بطيء، و**طلبُ البيانات يبدأ
     * بلحظة أوّلِ رسم** — أي أنّ الوقتَ كلَّه تنزيلُ الحزمة وتشغيلُها، ثمّ
     * ذهابٌ وإيابٌ آخرُ للقاعدة (٢٥٠–٦٠٠ms) قبل أن يُرسم منتج.
     * والحافةُ تملك الجوابَ أصلاً (تجلبه لبناء وسوم المشاركة)، فوضعُه هنا
     * يلغي ذلك الذهابَ والإياب مجّاناً: يُرسم الرفُّ مع أوّل رسمٍ للصفحة.
     *
     * و**البذرةُ لا تُصدَّق نهائياً**: الصفحةُ مخبوءةٌ بالحافة خمسَ دقائق، فقد
     * تحمل منتجاً أُخفي للتوّ. فالواجهةُ ترسمها فوراً ثمّ تُحدّث من الخادم
     * وتستبدلها. ولا خطرَ على المال: `store_place_order` تتحقّق من `store_visible`
     * لحظةَ الطلب، فما لا يُنشر لا يُباع مهما رُسم.
     *
     * والحدُّ: أربعٌ وعشرون مادّةً (نفسُ صفحة الواجهة الأولى)، وتُترك البذرةُ
     * كلُّها إن تجاوز الحجمُ ٦٤ كيلو — مستندٌ منتفخٌ يبطئ أكثرَ ممّا يسرّع. */
    let boot = "";
    if (Array.isArray(catalog)) {
      const json = JSON.stringify({ slug, front, catalog });
      if (json.length <= 64_000) {
        // `<` مهرَّبٌ كي لا يُنهيَ `</script>` داخل نصٍّ الوسمَ مبكّراً.
        boot = `\n    <script type="application/json" id="store-boot">${json.replace(/</g, "\\u003c")}</script>`;
      }
    }

    // الرفُّ المرسوم داخل `#root` — `createRoot().render()` يمسحه عند التركيب،
    // فلا تراكمَ ولا وميضَ: ما بعده يشبه ما قبله.
    const painted = Array.isArray(catalog) && catalog.length
      ? paintShelf(front, catalog as Row[], supaUrl)
      : "";

    // نستبدل من <title> إلى آخر تاغ twitter — البلوك المتعاقب بالـhead.
    const patched = shell
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .replace(/<meta name="description"[^>]*\/>\s*/g, "")
      .replace(/<meta (?:property="og:|name="twitter:)[^>]*\/>\s*/g, "")
      .replace("</head>", `  ${meta}${boot}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${painted}</div>`);
    return asHtml(patched, 300);
  } catch {
    return asHtml(shell, 60);
  }
}
