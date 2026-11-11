/* ============================================================================
 * أخطاءُ المصادقة بكلامٍ يُفهم (F4، ٢٥/١٠).
 *
 * كان التسجيلُ وإعادةُ الإرسال وطلبُ الاستعادة وتغييرُ كلمة السرّ يعرض نصَّ Supabase
 * خاماً بالإنكليزية: «email rate limit exceeded»، «For security purposes, you can only
 * request this after 47 seconds»، «Database error saving new user». والدخولُ وحده كان
 * يمرّ من مترجم. هنا مترجمٌ واحد لكلّ نداءات صفحة الدخول، بالرمز (`error.code`) أوّلاً
 * ثم بالنصّ — ونصُّ الثواني يُقرأ رقماً فيصير عدّاداً ظاهراً لا جملةً مبهمة.
 *
 * يرجع مفتاحاً لا نصّاً: الصفحةُ (مالكةُ نطاق `signup`) هي التي تترجم.
 * ==========================================================================*/

export type AuthErr = {
  key: string;
  vars?: Record<string, string>;
  /** حالاتٌ لها تصرّفٌ لا رسالةٌ فقط. */
  kind?: "notConfirmed" | "exists" | "invalidCreds" | "wait" | "session";
  /** ثوانٍ قالها الخادمُ قبل أن يقبل طلباً جديداً. */
  seconds?: number;
};

export function authErr(message: string | null | undefined, code?: string | null): AuthErr {
  const s = (message ?? "").toLowerCase();
  const c = (code ?? "").toLowerCase();
  const wait = /after (\d+) seconds?/.exec(s);
  if (wait) return { key: "signup.err.rateWait", vars: { s: wait[1] }, kind: "wait", seconds: Number(wait[1]) };
  if (c === "over_email_send_rate_limit" || /email rate limit/.test(s)) return { key: "signup.err.emailBusy" };
  if (c.startsWith("over_") || /rate limit|too many/.test(s)) return { key: "signup.err.rateLimit" };
  if (c === "same_password" || /different from the old/.test(s)) return { key: "signup.err.samePw" };
  /* لا جلسةَ صالحة لتغيير كلمة السرّ (١١/١١): رابطُ الاستعادة جلستُه حُذفت أو انتهت أو أُبطلت (رابطٌ ثانٍ، خروج)،
   * أو «تغييرٌ آمن» يطلب دخولاً حديثاً. كلُّها كانت «ما اكتمل الطلب — جرّب مرة ثانية» — والإعادةُ لا تنجح أبداً:
   * الطلبُ بلا جلسة لا يصل الخادمَ أصلاً. الدواءُ الوحيد رابطٌ جديد (جلستُه حديثةٌ فتُرضي إعادةَ التحقّق أيضاً). */
  if (["session_not_found", "session_expired", "bad_jwt", "no_authorization", "refresh_token_not_found", "refresh_token_already_used",
    "user_not_found", "reauthentication_needed", "reauthentication_not_valid"].includes(c)
    || /auth session missing|session .*does not exist|invalid jwt|invalid refresh token|sub claim .*does not exist|requires reauthentication/.test(s)) {
    return { key: "signup.err.resetSession", kind: "session" };
  }
  if (c === "weak_password" || /password/.test(s) && /weak|should|at least|pwned|leak/.test(s)) {
    if (/pwned|leak|compromised|known to be weak/.test(s)) return { key: "signup.err.pwLeaked" };
    const n = /at least (\d+)/.exec(s);
    return n ? { key: "signup.err.pwShort", vars: { n: n[1] } } : { key: "signup.err.weakPw" };
  }
  if (c === "email_address_invalid" || /invalid format|unable to validate email|email address .*invalid/.test(s)) return { key: "signup.err.invalidEmail" };
  if (c === "user_already_exists" || c === "email_exists" || /already registered|already exists/.test(s)) return { key: "signup.err.generic", kind: "exists" };
  if (c === "email_not_confirmed" || /not confirmed/.test(s)) return { key: "signup.err.notConfirmed", kind: "notConfirmed" };
  if (c === "invalid_credentials" || /invalid login|invalid credentials/.test(s)) return { key: "auth.invalidCreds", kind: "invalidCreds" };
  if (c === "signup_disabled" || /signups? not allowed|signups? (are )?disabled/.test(s)) return { key: "signup.err.signupsOff" };
  if (/timed?\s*out|timeout/.test(s)) return { key: "signup.err.timeout" };
  if (/failed to fetch|networkerror|network error|load failed/.test(s)) return { key: "signup.err.network" };
  if (c === "unexpected_failure" || /database error|unexpected failure|internal/.test(s)) return { key: "signup.err.server" };
  return { key: "signup.err.generic" };
}

/** خطأٌ إملائيٌّ شائعٌ بنطاق البريد — «gmial.com» يضيع معها رابطُ التأكيد كلُّه. */
const DOMAIN_FIX: Record<string, string> = {
  "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmal.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmal.com": "hotmail.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "iclod.com": "icloud.com", "icloud.con": "icloud.com",
};
export function emailTypo(email: string): string | null {
  const v = email.trim();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const fix = DOMAIN_FIX[v.slice(at + 1).toLowerCase()];
  return fix ? `${v.slice(0, at)}@${fix}` : null;
}

/** زرُّ «افتح بريدك» حسب النطاق — بحثٌ عن رسالتنا لا صندوقٌ عامّ. */
export function inboxFor(email: string): { app: string; url: string } | null {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  if (d === "gmail.com" || d === "googlemail.com") return { app: "Gmail", url: "https://mail.google.com/mail/u/0/#search/in%3Aanywhere+doctorVet" };
  if (/^(outlook|hotmail|live|msn)\./.test(d)) return { app: "Outlook", url: "https://outlook.live.com/mail/0/" };
  if (/^yahoo\./.test(d) || d === "ymail.com") return { app: "Yahoo", url: "https://mail.yahoo.com/" };
  if (d === "icloud.com" || d === "me.com") return { app: "iCloud", url: "https://www.icloud.com/mail" };
  return null;
}

/** رقمٌ بصيغة E.164 لرمز الهاتف (F10): «+964 0770…» ليس رقماً يصله رمز — الصفرُ الأوّل
 *  بعد مفتاح الدولة يُشال، وكلُّ ما ليس رقماً كذلك. */
export function e164(p: string): string {
  const m = /^(\+\d+)\s*(.*)$/.exec(p.trim());
  return m ? m[1] + m[2].replace(/\D/g, "").replace(/^0+/, "") : p.trim();
}
