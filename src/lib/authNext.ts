/* ============================================================================
 * إلى أين بعد الدخول؟ (F13، ٢٥/١٠)
 *
 * موظّفٌ فتح رابطَ دعوةٍ وهو غيرُ داخل كان يُرسَل إلى `/login` بلا طريق رجوع، ويُقال له
 * «افتح الرابط مرّةً ثانية» — والرمزُ بـsessionStorage يضيع حين يفتح رابطُ تأكيد البريد
 * تبويباً جديداً. فالدعوةُ تحفظ رمزَها بالجهاز ستَّ ساعات، وصفحةُ الدخول تحمل `next`، والرئيسيةُ
 * تُرجع صاحبَ الرمز إلى دعوته مرّةً واحدة.
 * ==========================================================================*/

const JOIN_KEY = "vp_join_code";
/** ستُّ ساعات تكفي لتأكيد البريد والعودة، ولا تُبقي دعوةً بالجهاز ليومٍ كامل. */
const TTL = 6 * 3_600_000;

/** `?next=` إن كان مساراً داخلياً — لا رابطَ لموقعٍ آخر ولا `//host`. */
export function safeNext(): string | null {
  try {
    const n = new URLSearchParams(window.location.search).get("next") ?? "";
    return /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : null;
  } catch {
    return null;
  }
}

export function rememberJoinCode(code: string) {
  try { localStorage.setItem(JOIN_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* ignore */ }
}

/** قراءةٌ بلا أثر (تُنادى من الرسم). صفحةُ الدعوة تمسحه حين تستلمه بالرابط — فالرجوعُ
 *  مرّةً واحدة، ولا تحبسه دعوةٌ فاشلة بكلّ فتحةٍ للرئيسية. */
export function peekJoinCode(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(JOIN_KEY) ?? "null") as { code?: string; at?: number } | null;
    return v?.code && Date.now() - (v.at ?? 0) < TTL ? v.code : null;
  } catch {
    return null;
  }
}

export function forgetJoinCode() {
  try { localStorage.removeItem(JOIN_KEY); } catch { /* ignore */ }
}
