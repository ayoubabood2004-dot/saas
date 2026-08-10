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
 */
export const config = { runtime: "edge" };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  const origin = url.origin;

  // index.html عبر الـrewrite العام — أي مسار غير موجود يرجع الصفحة الأساس.
  const shellRes = await fetch(`${origin}/index.html`);
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

  try {
    const r = await fetch(`${supaUrl}/rest/v1/rpc/store_front`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey, authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return asHtml(shell, 60);
    const front = (await r.json()) as { ok?: boolean; name?: string; bio?: string };
    if (!front?.ok || !front.name) return asHtml(shell, 60);

    const title = esc(`${front.name} — المتجر`);
    const desc = esc(front.bio?.trim() || `تصفح منتجات ${front.name} واطلب توصيلاً حتى باب البيت.`);
    const pageUrl = esc(`${origin}/s/${slug}`);

    const meta = [
      `<title>${title}</title>`,
      `<meta name="description" content="${desc}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="doctorVet" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:url" content="${pageUrl}" />`,
      `<meta property="og:locale" content="ar_IQ" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${desc}" />`,
    ].join("\n    ");

    // نستبدل من <title> إلى آخر تاغ twitter — البلوك المتعاقب بالـhead.
    const patched = shell
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .replace(/<meta name="description"[^>]*\/>\s*/g, "")
      .replace(/<meta (?:property="og:|name="twitter:)[^>]*\/>\s*/g, "")
      .replace("</head>", `  ${meta}\n  </head>`);
    return asHtml(patched, 300);
  } catch {
    return asHtml(shell, 60);
  }
}
