import type { TFunction } from "i18next";

const TIMEOUT_NAME = "TimeoutError";

/**
 * Reject if `promise` doesn't settle within `ms`. A network drop or a paused
 * backend can leave a fetch pending forever; without this the caller's
 * try/finally never runs and a submit button spins indefinitely.
 *
 * Note: this rejects the wait, it does not cancel the underlying request — the
 * caller should treat a timeout as "unknown outcome, safe to retry".
 */
export function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`Request timed out after ${Math.round(ms / 1000)}s`);
      e.name = TIMEOUT_NAME;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function isTimeoutError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === TIMEOUT_NAME;
}

/** فشل شبكي: الطلب ما وصل السيرفر أصلاً (نت مقطوع، DNS، وكيل يرفض، CORS).
 *  supabase-js يغلّفه بنص «TypeError: Failed to fetch» — تقني، إنجليزي،
 *  وكان يظهر للطبيب كما هو مرتين (عنواناً ووصفاً). */
export function isNetworkError(e: unknown): boolean {
  const m = ((e && typeof e === "object" ? (e as { message?: string }).message : "") ?? "").toLowerCase();
  return /failed to fetch|networkerror|network error|fetch failed|load failed|err_network|err_internet/.test(m);
}

/* ── من اسم القيد إلى جملةٍ يفهمها صاحب العيادة ───────────────────────────
 *
 * القاعدة ترفض بجملةٍ إنجليزية تقنية:
 *     new row for relation "expenses" violates check constraint "expenses_amount_check"
 * وكانت تُترجم كلُّها إلى «بعض القيم غير صحيحة» — وهي أسوأ من الإنجليزية،
 * لأنها ما تقول أي قيمة ولا أي حقل. فالموظّف يجرّب ويجرّب بلا دليل.
 *
 * والحلّ ليس ترجمة الجملة، بل الالتقاط بـ**اسم القيد**: اسمٌ ثابتٌ لا يتغيّر
 * بتغيّر لغة الخادم ولا صيغته، فيصلح مفتاحاً. والنصّ نفسه يسكن ملفّات اللغة
 * فيظهر بلغة المستخدم لا بلغةٍ واحدة مفروضة — وهذا ما يجعله صحيحاً لنظامٍ
 * بثلاث لغات، لا مجرّد «تعريب».
 *
 * ولا نُغطّي القيود كلّها (٦٩ قيداً): أكثرها حرّاسُ قوائمَ يختارها البرنامج
 * نفسه (status، kind، role)، فانكسارُها عطلٌ بالشِفرة لا خطأٌ من المستخدم،
 * ورسالةٌ لطيفة له تخفي عطلاً يجب أن يُرى. المغطّى هو ما يبلغه إصبعُ إنسانٍ
 * يكتب رقماً أو اسماً.
 *
 * وما لا مفتاحَ له يسقط للرسالة العامّة كما كان — فمفتاحٌ ناقص لا يُظهر
 * أبداً اسمَ مفتاحٍ على شاشة طبيب. */
function constraintOf(err: { message?: string; details?: string }): string | null {
  const hay = `${err.message ?? ""} ${err.details ?? ""}`;
  const m = /constraint "([^"]+)"/i.exec(hay);
  return m ? m[1] : null;
}

/** Map a thrown DB/network error to a short, human-readable message for a toast. */
export function describeDbError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; code?: string; message?: string; details?: string; hint?: string };
  // رفضٌ مقصودٌ من دالّةِ قاعدةٍ يشرح نفسَه: `raise … using hint = '…'` يضع
  // الرمزَ اللاتينيّ بـmessage والشرحَ العربيَّ بـhint. وبلا هذا السطر يقرأ
  // المديرُ «invoice_has_open_delivery» بالحرف — رسالةٌ لا تُفهم ولا تُعالَج.
  // الشرطُ P0001 وحده: أخطاءُ بوستغريس العامّة hint فيها إنكليزيٌّ تقنيّ.
  if (err.code === "P0001" && typeof err.hint === "string" && err.hint.trim()) {
    return err.hint.trim();
  }
  // اشتراك منتهٍ: العملية رُفضت بقصد — الرسالة تشرح السبب والحل، لا «خطأ».
  if (err.name === "ReadOnlyError" || err.message === "READ_ONLY") {
    return t("errors.readOnly", "انتهى اشتراك العيادة — الحساب بوضع القراءة فقط. تقدر تشوف وتطبع كل بياناتك، بس الإضافة والتعديل يحتاجان تجديد الاشتراك.");
  }
  // حصص الاشتراك (0104): رفض مقصود من مشغّل القاعدة — نشرح الحد والحل.
  // تحديثٌ لم يمسّ صفاً (سياسةُ الصفوف ردّته، أو الصفُّ لعيادةٍ غير التي يقصدها
  // الخادم): كان يمرّ «نجاحاً» صامتاً بالتوصيل — فصار خطأً باسمه (0157 واجهة).
  if (typeof err.message === "string" && err.message.includes("no_row_updated")) {
    return t("errors.noRowUpdated", "ما انحفظ التغيير — الخادم ما لكى الطلب ضمن عيادتك أو رفضه. حدّث الصفحة وأعد المحاولة؛ وإذا كنت داخلاً لعيادةٍ من لوحة المنصّة تأكد أنك بنفس العيادة.");
  }
  if (typeof err.message === "string" && err.message.includes("pet_limit_reached")) {
    return t("errors.petQuota", "ما تكدر تضيف حيوانات إضافية حالياً. راجع مزوّد الخدمة.");
  }
  if (err.name === "QuotaError") {
    return t("errors.quota", "ما تكدر تكمّل هذي العملية حالياً. راجع مزوّد الخدمة.");
  }
  if (err.name === TIMEOUT_NAME) {
    return t("errors.timeout", "The request timed out — check your connection and try again.");
  }
  if (isNetworkError(e)) {
    return t("errors.network", "ما وصلنا للسيرفر — تأكد من الإنترنت وحاول من جديد. لو تكررت: جرّب بيانات الموبايل، وتأكد أن ساعة الحاسوب صحيحة.");
  }
  // اسمُ القيد أدقُّ من رمز الخطأ: يقول أي حقلٍ بالضبط، لا «قيمةٌ ما».
  // فيُجرَّب قبل الرموز العامّة، ويسقط إليها إن لم يكن له نصّ.
  const cname = constraintOf(err);
  if (cname) {
    const said = t(`errors.c.${cname}`, { defaultValue: "" });
    if (said) return said;
  }
  switch (err.code) {
    case "23505": // unique_violation — duplicate cage, phone, serial, etc.
      return t("errors.duplicate", "This conflicts with an existing record — a cage or number may already be in use.");
    case "23503": // foreign_key_violation
      return t("errors.linkMissing", "A linked record is missing. Refresh and try again.");
    case "23502": // not_null_violation
    case "23514": // check_violation
      return t("errors.invalidValue", "Some values are invalid. Please review and try again.");
    case "42501": // RLS / insufficient_privilege
    case "PGRST301":
      return t("errors.unauthorized", "Your session may have expired. Sign in again and retry.");
    // PGRST202: الواجهة تنادي دالّةً غير موجودة بالقاعدة — أي أن هجرةً لم
    // تُطبَّق بعد. الرسالة الخام إنجليزية وتذكر اسم الدالة، وهي بلا معنى لمن
    // يقف على الشاشة. الميزة **اختيارية بطبيعتها**: ما عداها يعمل كما هو.
    case "PGRST202":
      return t("errors.featureNotInstalled", "هذي الميزة لسّه ما مفعّلة على قاعدة بياناتك — تحتاج تحديث من مزوّد الخدمة. باقي النظام يشتغل عادي.");
  }
  if (typeof err.message === "string" && err.message.trim()) return err.message;
  return t("errors.database", "Database error. Please try again.");
}

/** Friendly message for a media-upload failure (file too large, network, storage, …). */
export function describeUploadError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; maxMb?: number; message?: string };
  if (err.name === "FileTooLargeError") {
    return t("errors.fileTooLarge", "File is too large (max {{mb}} MB). Try a smaller image.", { mb: err.maxMb ?? 25 });
  }
  // حصص الاشتراك (0104): رفض مقصود من مشغّل القاعدة — نشرح الحد والحل.
  if (typeof err.message === "string" && err.message.includes("pet_limit_reached")) {
    return t("errors.petQuota", "ما تكدر تضيف حيوانات إضافية حالياً. راجع مزوّد الخدمة.");
  }
  if (err.name === "QuotaError") {
    return t("errors.quota", "ما تكدر تكمّل هذي العملية حالياً. راجع مزوّد الخدمة.");
  }
  if (err.name === TIMEOUT_NAME) {
    return t("errors.timeout", "The request timed out — check your connection and try again.");
  }
  if (typeof err.message === "string" && /fetch|network|storage|bucket|object|cors|load failed|not found/i.test(err.message)) {
    return t("errors.uploadFailed", "Upload failed — check your connection and try again.");
  }
  return describeDbError(e, t);
}

/** Friendly message for a sign-in failure (invalid credentials, timeout, network…). */
export function describeAuthError(raw: string | null | undefined, t: TFunction): string {
  const s = (raw ?? "").toLowerCase();
  if (!raw) return t("auth.genericError", "Couldn't sign in. Please try again.");
  if (/timed?\s*out|timeout/.test(s)) return t("errors.timeout", "The request timed out — check your connection and try again.");
  if (/invalid login|invalid credentials|invalid email or password/.test(s)) return t("auth.invalidCreds", "Invalid email or password.");
  if (/email not confirmed|not confirmed/.test(s)) return t("auth.notConfirmed", "Please verify your email before signing in.");
  if (/failed to fetch|networkerror|network error|fetch/.test(s)) return t("auth.networkError", "Network error — check your connection.");
  if (/rate|too many/.test(s)) return t("auth.rateLimited", "Too many attempts. Please wait a moment and try again.");
  return raw;
}
