export const config = { runtime: "edge" };

/* ============================================================================
 * /api/track — قياس صفحة الهبوط للزائر المجهول.
 *
 * لماذا خادمٌ وسيط بدل الكتابة المباشرة على القاعدة: نقطةٌ عامة تكتب بمفتاح
 * مجهول تُملأ ضجيجاً بيومٍ واحد. فالمتصفّح يرسل هنا، والدالة وحدها تحمل
 * مفتاح service_role وتفرض قائمة الأحداث المغلقة وتُشتقّ بصمة اليوم.
 *
 * ── الخصوصية بالتصميم ────────────────────────────────────────────────────
 * لا كوكيز، ولا معرّف يُخزَّن بجهاز الزائر، ولا IP محفوظ. البصمة
 * = SHA-256(IP + متصفّح + تاريخ اليوم + سرّ)، أي أنها **تتبدّل كل منتصف
 * ليل** فلا يُتتبَّع أحدٌ عبر الأيام حتى لو أردنا. وهذا قيدٌ مقصود: نريد
 * «كم زائراً مختلفاً اليوم»، لا سيرة زائرٍ بعينه.
 *
 * ويرجع 204 دائماً — حتى عند الفشل. القياس خدمةٌ ثانوية، وسقوطه يجب ألّا
 * يُظهر خطأً بوجه زائرٍ جاء ليقرأ عرضاً.
 * ==========================================================================*/

const EVENTS = new Set(["page_view", "cta_click", "signup_start", "signup_done", "trial_start"]);

const sbUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const sbKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const nothing = () => new Response(null, { status: 204 });

/** أول نطاقٍ للمُحيل بلا مسار ولا معاملات — «من أين جاء» لا «ماذا كان يقرأ». */
function refHost(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const h = new URL(raw).hostname.replace(/^www\./, "");
    return h.slice(0, 120) || null;
  } catch { return null; }
}

async function dayHash(ip: string, ua: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.TRACK_SALT || sbKey().slice(0, 24) || "dv";
  const data = new TextEncoder().encode(`${ip}|${ua}|${day}|${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).slice(0, 10)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return nothing();
  if (!sbUrl() || !sbKey()) return nothing();   // غير مُعَدّ بعد — لا نُزعج الزائر

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2000) return nothing();     // حمولةٌ كهذه ليست قياساً
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch { return nothing(); }

  const event = String(body.event ?? "");
  if (!EVENTS.has(event)) return nothing();      // قائمة مغلقة — والقيد مكرّر بالجدول

  const ua = req.headers.get("user-agent") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "";

  const row = {
    event,
    path: String(body.path ?? "/").slice(0, 200),
    ref_host: refHost(req.headers.get("referer")),
    lang: String(body.lang ?? "").slice(0, 12) || null,
    device: /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop",
    visitor_day: await dayHash(ip, ua),
    // مساحةٌ صغيرة لتفصيلٍ يخصّ الحدث (أي زرٍّ ضُغط مثلاً) — لا بيانات شخصية.
    meta: body.meta && typeof body.meta === "object"
      ? JSON.parse(JSON.stringify(body.meta).slice(0, 500))
      : null,
  };

  try {
    await fetch(`${sbUrl()}/rest/v1/landing_events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: sbKey(),
        authorization: `Bearer ${sbKey()}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch { /* القياس لا يُسقط تجربة الزائر أبداً */ }

  return nothing();
}
