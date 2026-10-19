// ============================================================================
// حصص الاشتراك (0104، وصارت شهرية بـ0105) — كم حيوان تقدر العيادة تضيف وكم
// رسالة واتساب ترسل **بالشهر الواحد**. يحددهما مشغّل المنصّة لكل عيادة؛
// null = بلا حد (وهو الافتراضي، فالعيادات القائمة لا يتغير عليها شيء).
//
// التجديد شهري تلقائي كنموذج الاشتراكات المعروف: مع دخول كل شهر يتصفّر
// العدّاد، وغير المستهلَك يسقط ولا يتراكم. ولا شيء يُحذف من البيانات إطلاقاً —
// الحيوانات والرسائل تبقى بسجلها كاملة، والذي يتغير هو نافذة العدّ فقط.
//
// أين يُفرض كلٌّ منهما — وليسا متماثلين:
//   • الحيوانات: مفروض بمشغّل قاعدة البيانات (trigger). الفحص هنا للعرض
//     ولرسالة مبكرة مفهومة، لا للحماية — الحماية بالقاعدة.
//   • الواتساب: مفروض **هنا فقط**، ولا مفرّ. الإرسال يفتح wa.me بالمتصفح
//     قبل أن يُسجَّل، فمنع السجل بالقاعدة يوقف العدّاد لا الرسالة. الفحص
//     قبل فتح الرابط هو المكان الوحيد الذي يمنع فعلاً.
// ============================================================================
import { useEffect } from "react";
import i18n from "@/i18n";
import { sb } from "./clinicSync";
import { getActiveClinicId } from "./clinics";

export interface QuotaUsage {
  petLimit: number | null;
  petsUsed: number;
  waLimit: number | null;
  waUsed: number;
  /** بداية الاشتراك (ثابتة). */
  quotaStart: string | null;
  /** بداية شهر الحصة الجاري ونهايته — العدّاد يتصفّر عند periodEnd. */
  periodStart: string | null;
  periodEnd: string | null;
}

let cache: QuotaUsage | null = null;
let at = 0;
/** لمن الجوابُ أعلاه: مفتاحُ العيادة لحظةَ السؤال. null = ما أجاب الخادمُ بعد بهذه الجلسة.
 *  و«بلا حدود» جوابٌ أيضاً (cache = null بمفتاحٍ مختوم) — يقرؤه الفحصُ المتزامن بـsendWhatsApp. */
let answeredFor: string | null = null;
let inflight: Promise<QuotaUsage | null> | null = null;
/** آخرُ سؤالٍ بدأ، وآخرُ سؤالٍ كتب: جوابٌ أقدم يصل بعد أحدث لا يكتب فوقه. */
let seq = 0;
let wroteSeq = 0;
const TTL = 60_000; // دقيقة: كافية للدقّة، وتكفي ألا نستعلم عند كل رسالة

/** استهلاك العيادة الحالي. null = ماكو خادم أو الترحيل ما شُغّل → بلا حدود. */
export async function fetchQuota(force = false): Promise<QuotaUsage | null> {
  const client = sb();
  if (!client) return null;
  const key = getActiveClinicId();
  if (!force && answeredFor === key && Date.now() - at < TTL) return cache;
  if (!force && inflight) return inflight;
  const my = ++seq;
  const p = (async () => {
    let row: Record<string, unknown> | undefined;
    try {
      const { data, error } = await client.rpc("clinic_quota_usage");
      if (!error && data) row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    } catch { /* خطأٌ عابر — يُعامل كجوابٍ بلا صفّ تحت */ }
    if (my <= wroteSeq) return cache;
    wroteSeq = my;
    if (row) {
      cache = {
        petLimit: row.pet_limit == null ? null : Number(row.pet_limit),
        petsUsed: Number(row.pets_used) || 0,
        waLimit: row.wa_limit == null ? null : Number(row.wa_limit),
        waUsed: Number(row.wa_used) || 0,
        quotaStart: (row.quota_start as string) ?? null,
        periodStart: (row.period_start as string) ?? null,
        periodEnd: (row.period_end as string) ?? null,
      };
    } else if (answeredFor !== key) {
      // قبل 0104، أو خطأٌ ولا شيءَ معروفٌ لهذي العيادة → تصرّف كأن لا حدود (كما كان).
      // أمّا خطأٌ عابرٌ وعندنا جوابٌ سابقٌ لها فلا يمحوه: قيمةٌ قديمة أصدقُ من «بلا حدود».
      cache = null;
    }
    answeredFor = key;
    at = Date.now();
    return cache;
  })();
  inflight = p;
  void p.finally(() => { if (inflight === p) inflight = null; });
  return p;
}

/** أبطل التوقيت لا المعلوم: القراءةُ التالية تسأل الخادم، وآخرُ جوابٍ يبقى للفحص المتزامن. */
export function invalidateQuota() { at = 0; }

/** سخّن الحصّة حين تظهر شاشةٌ ترسل واتساب: تجدها الضغطةُ معروفةً فيُفتح بلحظتها (انظر sendWhatsApp). */
export function useWarmWaQuota(): void {
  useEffect(() => { void fetchQuota(); }, []);
}

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

/** المتصفّح منع فتح الواتساب — لا شيء انبعث، ولا شيء سُجّل. */
export class WaBlockedError extends Error {
  constructor() {
    super("WA_BLOCKED");
    this.name = "WaBlockedError";
  }
}

/** ارمِ إن كانت حصة الرسائل انتهت — تُستدعى **قبل** فتح wa.me. */
export async function assertWaQuota(count = 1): Promise<void> {
  const q = await fetchQuota();
  if (!q || q.waLimit == null) return;
  if (q.waUsed + count > q.waLimit) throw new QuotaError("wa", q.waLimit);
}

/** رسالة عربية لرفض الإرسال: الحصة انتهت، أو المتصفّح منع فتح الواتساب. */
export function quotaMessage(e: unknown): string | null {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; kind?: string; limit?: number; message?: string };
  // الرقم لا يُذكر بقصد: حدود الاشتراك معلومة تخصّ مشغّل المنصّة، والعيادة
  // تُوجَّه للمراجعة لا تُطلَع على سقفها.
  if (err.name === "QuotaError") {
    return err.kind === "pets"
      ? "ما تكدر تضيف حيوانات إضافية حالياً. راجع مزوّد الخدمة."
      : "ما تكدر ترسل رسائل إضافية حالياً. راجع مزوّد الخدمة.";
  }
  if (err.name === "WaBlockedError") {
    return i18n.t("waSend.blocked", "ما انفتح الواتساب — المتصفّح منعه. اضغط الزر مرّة ثانية.");
  }
  // رسالة مشغّل القاعدة عند تجاوز حد الحيوانات.
  if (typeof err.message === "string" && err.message.includes("pet_limit_reached")) {
    return "ما تكدر تضيف حيوانات إضافية حالياً. راجع مزوّد الخدمة.";
  }
  return null;
}

/* ============================================================================
 * نقطة الإرسال الوحيدة — كل رسالة واتساب من العيادة تمرّ من هنا.
 *
 * الحراسات المتفرقة كانت تغطي ثلاثة مواضع من تسعة، والستة الباقية ما تسجّل
 * الرسالة أصلاً — فالعدّاد نفسه كان يكذب: عيادة ترسل من الاستقبال مئة رسالة
 * ويبقى صفراً. نقطة واحدة تحلّ الاثنين: تفحص الحصة، تفتح الرابط، ثم تسجّل.
 *
 * الترتيب مقصود: الفحص **قبل** الفتح (بعده الرسالة راحت)، والتسجيل **بعده**
 * (لا نعدّ رسالة ما انفتحت).
 *
 * **والفتحُ داخل اللمسة، بلا انتظارٍ قبله (١٩/١٠).** «بالآيفون والآيباد التذكير ما
 * يودّي للواتساب». كان الفحصُ يسأل الخادمَ (`await`) ثم يفتح، وكان المخزنُ يُصفَّر بعد
 * كلّ رسالة فكلُّ ضغطةٍ تنتظر الشبكة. وسفاري (WebKit: آيفون، آيباد، ماك، وكلُّ متصفّحٍ
 * على iOS) لا يفتح نافذةً إلا والضغطةُ ما زالت جارية — والانتظارُ يمرّ بقفل الجلسة
 * فتضيع قبل الطلب نفسه — فيمنعها **بصمت**، و`noopener` يجعل window.open ترجع null
 * فتحت أو مُنعت، فسُجّلت الرسالةُ «انبعثت» وخُتم التذكيرُ «أُرسلت» على كلّ جهاز. المقيس:
 * ٨ من ١٣ إرسالاً من أجهزة آبل (١–١٩/١٠) أعادت نفسَ التذكير خلال دقائق (أربعٌ بأقلّ من
 * ثانية، والصفحةُ لم تغادر)، ولا إعادةَ بأقلّ من ٢٠ ثانية بـ١١٣ من غيرها (كروم يُبقي
 * الضغطةَ ٥ ثوانٍ فيمرّ).
 * فالفحصُ صار **متزامناً** على آخر حصّةٍ معروفة (`roomNow`): تُسخَّن عند ظهور الشاشة
 * (`useWarmWaQuota`) وتُحدَّث بعد كلّ رسالة بعدٍّ محلّيّ لا بتصفير. وحين لا نعرف بما
 * يكفي نسأل الخادمَ أوّلاً كما كان — والفتحُ بعدها قد يُمنع، فيُقال ويُعاد بضغطةٍ تجد
 * الحصّةَ معروفة. والثمن المقبول: جهازٌ آخر أرسل منذ آخر سؤال لا يراه هذا إلا بعد رسالته.
 * و**انقضاءُ شهر الحصّة لا يُسأل عنه**: شهرٌ جديد يصفّر العدَّ فيزيد المتاحَ ولا ينقصه، وبلوغُ
 * السقف يُسأل عنه قبل الرفض أصلاً. وكان سؤالُه فخّاً: الخادمُ نفسُه يرجع نهايةَ شهرٍ **ماضية**
 * أيّاماً بالشهر لعيادةٍ بدأت حصّتُها يومَ ٢٩–٣١ (حسابُ age() بـ0105)، وساعةُ جهازٍ متقدّمة
 * تفعلها كلَّ شهر — فتبقى كلُّ ضغطةٍ بالطريق البطيء ويُمنع كلُّ فتح (أمسكه تدقيقٌ عدائيّ).
 * والمنعُ صار **يُسمع**: بلا noopener ترجع النافذة (فيُقطع opener يدوياً، ويصل wa.me
 * أصلُ الموقع لا مساره)، وnull بلا مغادرةٍ للصفحة = `WaBlockedError` — لا سجلّ ولا ختم.
 * ========================================================================== */
export interface WaSend {
  /** الرقم بصيغة wa.me (أرقام فقط). فاضي = رابط مشاركة بلا مستلم. */
  phone: string;
  text?: string;
  petId?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** نوع التذكير للسجل: 'birthday' | 'vaccine' | 'booking' | 'manual'… */
  kind?: string | null;
}

/** هل تسمح آخرُ حصّةٍ معروفة برسالةٍ أخرى — **الآن، بلا انتظار**؟ false = لا نعرف بما يكفي:
 *  ما سُئل الخادمُ بهذه الجلسة، أو الجوابُ لعيادةٍ أخرى، أو بلغ السقفَ (وقد يكون رُفع أو
 *  تجدّد الشهر — فيُسأل الخادمُ قبل الرفض). ولا نهايةَ شهرٍ هنا — انظر أعلاه. */
function roomNow(): boolean {
  if (!sb()) return true; // بلا خادم = بلا حدود، كما fetchQuota
  if (answeredFor !== getActiveClinicId()) return false;
  if (!cache || cache.waLimit == null) return true;
  return cache.waUsed + 1 <= cache.waLimit;
}

/** كم ننتظر أثرَ الفتح حين ترجع window.open فارغة (انظر leftPage). */
const LEFT_MS = 1500;

/** window.open ترجع null حين يمنعها المتصفّح — وقد ترجعها وقد فتحت (تطبيقُ الشاشة الرئيسية
 *  بآيفون، أو انتقالٌ للتطبيق مباشرة). فالحكمُ الثاني بالأثر: غادر المستخدمُ الصفحةَ خلال لحظة؟
 *  الأحداثُ بعد النداء وحدها — صفحةٌ مخفيّة أو غائبةُ التركيز من قبلُ ليست دليلاً. */
function leftPage(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let timer = 0;
    const finish = (v: boolean) => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pagehide", onLeave);
      resolve(v);
    };
    const onVis = () => { if (document.visibilityState === "hidden") finish(true); };
    const onLeave = () => finish(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    timer = window.setTimeout(() => finish(false), ms);
  });
}

/**
 * أرسل رسالة واتساب من العيادة. ترمي QuotaError إذا الحصة انتهت، وWaBlockedError إذا
 * المتصفّح منع الفتح — نادِها داخل try واعرض quotaMessage(e).
 *
 * **نادِها من داخل الضغطة نفسها وقبل أيّ await** — وإلا ففتحُها بعد انتظارٍ يُمنع بسفاري
 * (انظر أعلاه). ونداءٌ بعد حفظٍ (await) يُمنع هناك فترمي WaBlockedError ولا يُعدّ — ومناديها
 * يعرض زرّاً يعيدها بضغطةٍ جديدة (`useWaAfterSave` بالتوصيل)، لا `catch {}` يبلعها.
 *
 * ملاحظة: هذي للرسائل التي **ترسلها العيادة**. روابط «تواصل معنا» بصفحة
 * المتجر أو لوحة الزبون لا تمرّ من هنا: الزبون هو المرسِل، وعدّها على حصة
 * العيادة خطأ محاسبي.
 */
export async function sendWhatsApp(m: WaSend): Promise<void> {
  const qs = m.text ? `?text=${encodeURIComponent(m.text)}` : "";
  const url = `https://wa.me/${m.phone}${qs}`;
  if (!roomNow()) {
    const q = await fetchQuota(true);
    if (q && q.waLimit != null && q.waUsed + 1 > q.waLimit) throw new QuotaError("wa", q.waLimit);
  }
  const w = window.open(url, "_blank");
  if (w) {
    try { w.opener = null; } catch { /* نافذةٌ لا تقبل — wa.me لا يقرأ opener أصلاً */ }
  } else if (!(await leftPage(LEFT_MS))) {
    throw new WaBlockedError();
  }
  // انبعثت: تُعدّ هنا فوراً فلا تمرّ الرسالةُ التالية على عدٍّ قديم، ثم يصحّحه الخادمُ بعد السجل.
  // وكلُّ جوابٍ طُلب قبلها يسقط (wroteSeq): تسخينٌ أو تحديثُ رسالةٍ سابقة يصل بعدها بعدِّ ما
  // قبلها كان يمحو هذا العدّ فتمرّ التاليةُ فوق السقف. الذي يكتب الآن سؤالُ ما بعد السجل وحده.
  if (cache && answeredFor === getActiveClinicId()) {
    cache = { ...cache, waUsed: cache.waUsed + 1 };
    wroteSeq = seq;
  }
  // التسجيل تابع لا شرط: لو فشل، الرسالة راحت فعلاً ولا نُفشل العملية.
  try {
    const { repo } = await import("./repo");
    await repo.logWhatsApp({
      pet_id: m.petId ?? null,
      owner_name: m.ownerName ?? null,
      owner_phone: m.ownerPhone ?? null,
      reminder_type: m.kind ?? "manual",
    });
  } catch { /* السجل ثانوي */ }
  void fetchQuota(true);
}
