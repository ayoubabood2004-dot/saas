// ============================================================================
// حصص الاشتراك (0104) — كم حيوان تقدر العيادة تضيف، وكم رسالة واتساب ترسل،
// **خلال الاشتراك الحالي**. يحددهما مشغّل المنصّة لكل عيادة؛ null = بلا حد
// (وهو الافتراضي، فالعيادات القائمة لا يتغير عليها شيء).
//
// أين يُفرض كلٌّ منهما — وليسا متماثلين:
//   • الحيوانات: مفروض بمشغّل قاعدة البيانات (trigger). الفحص هنا للعرض
//     ولرسالة مبكرة مفهومة، لا للحماية — الحماية بالقاعدة.
//   • الواتساب: مفروض **هنا فقط**، ولا مفرّ. الإرسال يفتح wa.me بالمتصفح
//     قبل أن يُسجَّل، فمنع السجل بالقاعدة يوقف العدّاد لا الرسالة. الفحص
//     قبل فتح الرابط هو المكان الوحيد الذي يمنع فعلاً.
// ============================================================================
import { sb } from "./clinicSync";

export interface QuotaUsage {
  petLimit: number | null;
  petsUsed: number;
  waLimit: number | null;
  waUsed: number;
  quotaStart: string | null;
}

let cache: QuotaUsage | null = null;
let at = 0;
const TTL = 60_000; // دقيقة: كافية للدقّة، وتكفي ألا نستعلم عند كل رسالة

/** استهلاك العيادة الحالي. null = ماكو خادم أو الترحيل ما شُغّل → بلا حدود. */
export async function fetchQuota(force = false): Promise<QuotaUsage | null> {
  const client = sb();
  if (!client) return null;
  if (!force && cache && Date.now() - at < TTL) return cache;
  try {
    const { data, error } = await client.rpc("clinic_quota_usage");
    if (error || !data) return null; // قبل 0104 → تصرّف كأن لا حدود
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) return null;
    cache = {
      petLimit: row.pet_limit == null ? null : Number(row.pet_limit),
      petsUsed: Number(row.pets_used) || 0,
      waLimit: row.wa_limit == null ? null : Number(row.wa_limit),
      waUsed: Number(row.wa_used) || 0,
      quotaStart: (row.quota_start as string) ?? null,
    };
    at = Date.now();
    return cache;
  } catch { return null; }
}

/** أبطل المخزّن بعد كل إضافة/إرسال حتى يبقى العدّاد صادقاً. */
export function invalidateQuota() { cache = null; at = 0; }

const left = (limit: number | null, used: number) => (limit == null ? Infinity : Math.max(0, limit - used));

/** كم يتبقى للعيادة — Infinity = بلا حد. */
export async function petsLeft(): Promise<number> {
  const q = await fetchQuota();
  return q ? left(q.petLimit, q.petsUsed) : Infinity;
}
export async function waLeft(): Promise<number> {
  const q = await fetchQuota();
  return q ? left(q.waLimit, q.waUsed) : Infinity;
}

export class QuotaError extends Error {
  constructor(public kind: "pets" | "wa", public limit: number) {
    super(kind === "pets" ? "PET_QUOTA" : "WA_QUOTA");
    this.name = "QuotaError";
  }
}

/** ارمِ إن كانت حصة الرسائل انتهت — تُستدعى **قبل** فتح wa.me. */
export async function assertWaQuota(count = 1): Promise<void> {
  const q = await fetchQuota();
  if (!q || q.waLimit == null) return;
  if (q.waUsed + count > q.waLimit) throw new QuotaError("wa", q.waLimit);
}

/** رسالة عربية للحصة المنتهية. */
export function quotaMessage(e: unknown): string | null {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; kind?: string; limit?: number; message?: string };
  if (err.name === "QuotaError") {
    return err.kind === "pets"
      ? `وصلت حد الحيوانات لهذا الاشتراك (${err.limit}). راجع مزوّد الخدمة لرفع الحد.`
      : `وصلت حد رسائل الواتساب لهذا الاشتراك (${err.limit}). راجع مزوّد الخدمة لرفع الحد.`;
  }
  // رسالة مشغّل القاعدة عند تجاوز حد الحيوانات.
  if (typeof err.message === "string" && err.message.includes("pet_limit_reached")) {
    return "وصلت حد الحيوانات المسموح بهذا الاشتراك. راجع مزوّد الخدمة لرفع الحد.";
  }
  return null;
}
