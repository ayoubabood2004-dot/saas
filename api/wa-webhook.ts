/**
 * نقطة استقبال واتساب الرسمي (Meta Cloud API) — /api/wa-webhook
 *
 * ميتا تنادي هذا العنوان مرّتين بحياته:
 *   ١) مرّة واحدة عند الضغط على «تحقق واحفظ» — طلب GET فيه تحدٍّ نُعيده كما هو.
 *   ٢) وبعدها POST مع كل رسالة واردة وكل تحديث حالة.
 *
 * ── لماذا هنا لا بدالة سوبابيس ──────────────────────────────────────────────
 * لأن Vercel تنشر هذا الملف تلقائياً مع كل دفعة إلى main — نفس عادة المشروع.
 * دالة سوبابيس تحتاج أوامر CLI لم تُستعمل بهذا المشروع ولا مرة، وكل خطوة نشر
 * يدوية هي خطوة تُنسى فيتوقّف الاستقبال بصمت. والاعتراض التقني الوحيد على
 * Vercel (تعذّر قراءة الجسم الخام) لا ينطبق على `runtime: "edge"`: الدالة
 * تستلم Request قياسياً و`req.text()` يعطي البايتات كما وصلت حرفياً — وهذا
 * بالضبط ما يحتاجه التحقّق من التوقيع.
 *
 * ── القواعد التي لا تُكسر ───────────────────────────────────────────────────
 * ١) **التوقيع قبل أي تفسير.** HMAC-SHA256 على الجسم الخام بمفتاح App Secret،
 *    ومقارنة ثابتة الزمن. إعادة تحويل JSON إلى نصّ تغيّر البايتات فيفشل
 *    التحقّق دائماً — لذلك لا نلمس الجسم قبل حسابه.
 * ٢) **الجسم لا يحدّد العيادة.** الطلب يصل بلا هوية ولا JWT، فنسبة الرسالة
 *    تتمّ حصراً عبر phone_number_id مقابل صفٍّ سجّلناه نحن في wa_accounts.
 *    رقم مجهول ⇒ يُحفظ خاماً بلا توجيه، ولا يُنسب لأحد بالتخمين.
 * ٣) **نردّ 200 بسرعة.** ميتا تعيد الإرسال عند أي خطأ، وخطؤنا الداخلي لا يجوز
 *    أن يتحوّل إلى عاصفة إعادة محاولة. الاستثناء الوحيد توقيعٌ فاسد: ذاك ليس
 *    ميتا أصلاً، فيُرفض 401 ولا يُخزَّن إلا كأثر.
 * ٤) **التكرار غير مؤذٍ.** ميتا قد تُسلّم الحدث نفسه أكثر من مرة؛ التفرّد على
 *    wa_message_id بقاعدة البيانات يجعل الإعادة لا تنتج صفّاً ثانياً.
 *
 * متغيّرات البيئة المطلوبة (Vercel → Settings → Environment Variables):
 *   WA_VERIFY_TOKEN             رمز التحقّق — نفسه المكتوب بشاشة ميتا
 *   WA_APP_SECRET               App Secret من App Settings → Basic
 *   SUPABASE_URL                عنوان المشروع
 *   SUPABASE_SERVICE_ROLE_KEY   مفتاح الخدمة (خادمي فقط — لا يصل المتصفّح
 *                               لأن Vite لا يكشف إلا ما يبدأ بـVITE_)
 */
export const config = { runtime: "edge" };

const enc = new TextEncoder();

/** مقارنة ثابتة الزمن — المقارنة العادية تسرّب طول البادئة الصحيحة. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** عنوان المشروع: نقبل VITE_SUPABASE_URL الموجود أصلاً بالنشر — فمتغيّرٌ أقل
 *  يضيفه المشغّل يدوياً هو خطوةٌ أقل تُنسى. البادئة VITE_ تخصّ ما يُكشف
 *  للمتصفّح، ولا تمنع الخادم من قراءته. */
const sbUrl = () =>
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");

/** كتابة عبر PostgREST بمفتاح الخدمة — لا عميل ثقيل داخل حافة الشبكة. */
async function sbInsert(table: string, rows: unknown, prefer = "return=minimal"): Promise<Response | null> {
  const url = sbUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", Prefer: prefer,
    },
    body: JSON.stringify(rows),
  });
}

async function sbSelect(path: string): Promise<unknown[]> {
  const url = sbUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as unknown[];
}

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  /* ── ١) المصافحة: تُنادى مرة واحدة عند حفظ العنوان بشاشة ميتا ───────────
   * الردّ **قيمة hub.challenge نصّاً خاماً** — لا JSON ولا أقواس. تغليفها
   * يُفشل التحقّق، وهي أكثر غلطة متكرّرة بهذه الخطوة. */
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    /* التشذيب مقصود: لصق القيمة بلوحة تحكّم النشر على جهاز لوحي يُلحق سطراً
     * جديداً أو مسافة بلا أن يراها أحد — والقيمة تُخزَّن «حسّاسة» فلا يمكن
     * قراءتها لاحقاً للتأكّد. مقارنةٌ حرفية هنا تعني فشلاً دائماً بلا سبب
     * ظاهر، وهو أسوأ من خطأ صريح. */
    const expected = (process.env.WA_VERIFY_TOKEN ?? "").trim();
    if (!expected) return text("not_configured", 500);
    if (mode === "subscribe" && safeEqual(token.trim(), expected)) return text(challenge, 200);
    /* تشخيصٌ لا يسرّب السرّ: الطول، وبصمةٌ من ثماني خانات لتجزئة SHA-256.
     * البصمة تُحسم بها المسألة: إن طابقت البصمةَ المعروفة فالمخزَّن صحيح
     * والخلل بما كُتب في الرابط؛ وإن اختلفت فالمخزَّن نفسه قيمةٌ أخرى.
     * استرجاع ٦٤ حرفاً عشوائياً من ٣٢ بت مستحيل عملياً. */
    const fp = (await hmacHex("fp", expected)).slice(0, 8);
    return text(`forbidden (stored length: ${expected.length}, fp: ${fp})`, 403);
  }

  if (req.method !== "POST") return text("method_not_allowed", 405);

  // الجسم الخام أولاً وقبل كل شيء — أي تحليل قبل الحساب يكسر التوقيع.
  const raw = await req.text();
  const secret = process.env.WA_APP_SECRET ?? "";
  const header = req.headers.get("x-hub-signature-256") ?? "";

  let signatureOk = false;
  if (secret && header.startsWith("sha256=")) {
    signatureOk = safeEqual(header.slice(7).toLowerCase(), await hmacHex(secret, raw));
  }

  if (!signatureOk) {
    // أثرٌ بلا حمولة: طلبٌ غير موقّع ليس من ميتا، فلا نمنحه مساحة تخزين.
    await sbInsert("wa_webhook_events", [{ signature_ok: false, note: "bad_signature" }]).catch(() => null);
    return text("bad_signature", 401);
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { /* نُخزّنه خاماً أدناه */ }

  /* ── ٢) التوجيه: من رقم المستقبِل إلى العيادة، لا من الجسم ────────────── */
  type Change = { field?: string; value?: Record<string, unknown> };
  const entries = (payload.entry as Array<{ changes?: Change[] }> | undefined) ?? [];
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  let routed: string | null = null;

  for (const e of entries) {
    for (const ch of e.changes ?? []) {
      const v = (ch.value ?? {}) as Record<string, unknown>;
      const meta = (v.metadata ?? {}) as Record<string, string>;
      const pnid = meta.phone_number_id;
      if (!pnid) { notes.push("no_phone_number_id"); continue; }

      const found = await sbSelect(
        `wa_accounts?select=id,clinic_id&status=eq.active&phone_number_id=eq.${encodeURIComponent(pnid)}`,
      ) as Array<{ id: string; clinic_id: string }>;
      const acc = found[0];
      if (!acc) { notes.push("unknown_number"); continue; }
      routed = acc.clinic_id;

      // الاسم كما يعرضه واتساب — للعرض فقط، لا يُبنى عليه أي قرار.
      const contacts = (v.contacts as Array<{ wa_id?: string; profile?: { name?: string } }> | undefined) ?? [];
      const nameOf = (waId?: string) =>
        contacts.find((c) => c.wa_id === waId)?.profile?.name ?? null;

      for (const m of (v.messages as Array<Record<string, unknown>> | undefined) ?? []) {
        const type = String(m.type ?? "");
        const media = (m[type] ?? {}) as Record<string, unknown>;
        rows.push({
          clinic_id: acc.clinic_id, account_id: acc.id,
          wa_message_id: m.id ?? null, direction: "in",
          peer_phone: m.from ?? null, peer_name: nameOf(m.from as string | undefined),
          msg_type: type || null,
          body: type === "text" ? ((m.text as { body?: string } | undefined)?.body ?? null) : null,
          media_id: typeof media.id === "string" ? media.id : null,
          wa_ts: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
        });
      }

      // تحديثات الحالة تصل بنفس الحقل — نميّزها بوجود statuses لا بنوع الحدث.
      for (const st of (v.statuses as Array<Record<string, unknown>> | undefined) ?? []) {
        const errs = (st.errors as Array<{ title?: string; message?: string }> | undefined) ?? [];
        rows.push({
          clinic_id: acc.clinic_id, account_id: acc.id,
          wa_message_id: st.id ?? null, direction: "out",
          peer_phone: st.recipient_id ?? null,
          status: st.status ?? null,
          err: errs[0]?.message ?? errs[0]?.title ?? null,
          wa_ts: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : null,
        });
      }
    }
  }

  // الخام دائماً — هو ما يجعل ما لم نفهمه اليوم قابلاً للإصلاح غداً.
  await sbInsert("wa_webhook_events", [{
    signature_ok: true, routed_clinic: routed,
    note: notes[0] ?? (rows.length ? "ok" : "empty"),
    payload,
  }]).catch(() => null);

  /* التكرار: ميتا قد تُعيد الحدث نفسه. `merge-duplicates` مع التفرّد على
   * wa_message_id يجعل الإعادة تحديثاً لا صفّاً ثانياً — ولذلك أيضاً تصل
   * حالة «delivered» بعد «sent» فتحدّث السطر نفسه. */
  if (rows.length) {
    await sbInsert("wa_inbox", rows, "return=minimal,resolution=merge-duplicates").catch(() => null);
  }

  // 200 دائماً بعد قبول التوقيع: خطؤنا الداخلي لا يجوز أن يصير عاصفة إعادة.
  return text("ok", 200);
}
