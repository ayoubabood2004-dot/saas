import {
  outboxInternals, outboxDead, outboxDiscarded, needsReview, KEY_DISCARDED, DISCARDED_CAP, type OutboxOp,
} from "./outbox";

/* ============================================================================
 * قراراتُ صفحة /outbox على الرفّ (OutboxReview) — منفصلةٌ عن outbox.ts لأنها لا تُحتاج إلا
 * مع الصفحة: الطابورُ بحزمة الإقلاع (الشارة والرفع)، وهذه تُحمَّل معها كسولةً.
 *
 * كلُّ قرارٍ يكتب **ما بالتخزين الآن** (لا لقطةً أخذتها الصفحة)، ويقول صدقاً هل ثبت:
 *   • «ارفعها» — الطابورُ أوّلاً، والرفُّ لا يُفرَّغ منها إلا إن ثبت. كان الحفظُ الواحد يكتب
 *     الاثنين مستقلَّين، فطابورٌ ممتلئٌ يُرفض ورفٌّ أصغرُ يُقبل — فتضيع من الاثنين.
 *   • «احذفها» — الأرشيفُ أوّلاً (`vp_outbox_discarded_v1`)، ثم تُشال **النسخةُ التي رآها المدير**
 *     وحدها (`sameVersion`) من القائمة التي وُجدت فيها: إدخالُ يومٍ صُحّح بعدها بنفس المفتاح نسخةٌ
 *     أحدث لم يرَها أحد — كان الحذفُ بالمعرّف يأخذها معه.
 * ==========================================================================*/
const { load, whoNow, sameWho, sameVersion, announce, schedule, KEY, KEY_DEAD } = outboxInternals;

/** للداخل الآن (حسابُه وعيادتُه) — وغيرُ ذلك لا يُعاد باسمه. */
export const isMine = (op: OutboxOp): boolean => !!op.who && sameWho(op.who, whoNow());

/** عيادةُ الختم بلغة الخادم ("default" = حسابُ صاحبه — workspaceClinic.ts). */
const target = (w: { user: string; clinic: string }) => (w.clinic === "default" ? w.user : w.clinic);
/** يُسأل الخادمُ عن أثرها من هذه الجلسة؟ سحوباتُ العيادة الحاليّة وحدها تُقرأ (RLS)، فمختومةٌ بعيادةٍ
 *  أخرى «ما لكينا» عنها كذبٌ مطمئن — لا تُسأل. وبلا ختمٍ تُرفع (إن رُفعت) على العيادة الحاليّة. */
export const traceable = (op: OutboxOp): boolean => {
  const now = whoNow();
  return !!now && (!op.who || target(op.who) === target(now));
};
/** مدّةُ البحث عن أثر المرتجع: من حفظه إلى آخر محاولة. بلا ختمٍ (نسخةٌ أقدم) تاريخُ محاولاته لم
 *  يُسجَّل — حاولت الرفعَ حتى نُقلت للرفّ — فالمدّةُ إلى الآن. */
export const traceSpan = (op: OutboxOp, nowIso: string): { from: string; to: string } => {
  if (!op.who) return { from: op.queued_at, to: nowIso };
  const times = [op.queued_at, ...(op.attempts ?? []), op.reviewed_at].filter((x): x is string => !!x && Number.isFinite(Date.parse(x)));
  return { from: op.queued_at, to: times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a), op.queued_at) };
};

/** المختومةُ التي رفضتها القاعدةُ مراراً (`needsReview` قائمتُه بـoutbox.ts للشارة). */
export const outboxRejectedList = (): OutboxOp[] => outboxDead().filter((d) => !needsReview(d));

export type ShelfResult = { ok: true } | { ok: false; reason: "missing" | "no_session" | "other_owner" | "storage" };

/** «ارفعها» / «أعد المحاولة» على عمليةٍ بعينها بعد أن رآها مديرٌ بتفاصيلها.
 *  بلا ختمٍ تُختم بمن قرّر؛ ومختومةٌ بغيره لا تُعاد باسمه (لها الحذفُ وحده — والصفحةُ لا تعرض
 *  غيرَه، وهذا الحارسُ لتبويبٍ قديمٍ أو حسابٍ تبدّل بين الرسم والضغطة). */
export function outboxReviveOne(id: string, seen?: OutboxOp): ShelfResult {
  // `seen` النسخةُ التي عُرضت: رفٌّ استبدلها بعدها بنفس المفتاح ⇒ لا يُرفع ما لم يره أحد.
  const d = outboxDead().find((x) => x.id === id && (!seen || sameVersion(x, seen)));
  if (!d) return { ok: false, reason: "missing" };
  const now = whoNow();
  if (!now) return { ok: false, reason: "no_session" };
  if (d.who && !sameWho(d.who, now)) return { ok: false, reason: "other_owner" };
  const ops = load();
  /* نسخةٌ بنفس المفتاح بالطابور أحدثُ منها (يومٌ أُعيد إدخالُه): تبقى هي، وتُشال نسخةُ الرفّ. */
  if (!ops.some((o) => o.id === id)) {
    ops.push({
      ...d, tries: 0, last_error: undefined, stale: undefined, who: d.who ?? now,
      /* راجعها بشر: إدخالٌ بمفتاحٍ طبيعيّ لا يدمج فوق ما بالخادم (ربما صُحّح يدوياً بعدها)، والمرتجعُ
       * يُعفى من التوقيف ٦ أيامٍ من هذا القرار وحدها (ثم يُمسح مرجعُ محاولته بالخادم). */
      reviewed: true, reviewed_at: new Date().toISOString(),
    });
  }
  try { localStorage.setItem(KEY, JSON.stringify(ops)); }
  catch (e) { console.error("[outbox] revive did not persist — kept on the shelf:", e); return { ok: false, reason: "storage" }; }
  try { localStorage.setItem(KEY_DEAD, JSON.stringify(outboxDead().filter((x) => x.id !== id))); }
  catch { /* في القائمتين لحظةً: لا ضرر، المعرّفُ واحد والرفعُ يشيلها */ }
  announce(load(), outboxDead(), true);
  schedule();
  return { ok: true };
}

/** «احذفها»: من الرفّ، أو من الطابور (ما ينتظر حساباً لن يعود لهذا الجهاز — قرارُ المدير بعد أن
 *  رآه). `seen` النسخةُ التي عُرضت: إن تبدّلت بعدها لا يُحذف شيء (`missing` — والصفحةُ تُحدَّث). */
export function outboxDiscard(id: string, seen?: OutboxOp): ShelfResult {
  const pick = (list: OutboxOp[]) => list.find((x) => x.id === id && (!seen || sameVersion(x, seen)));
  const onShelf = pick(outboxDead());
  const d = onShelf ?? pick(load());
  if (!d) return { ok: false, reason: "missing" };
  const archive = [...outboxDiscarded(), { ...d, discarded_at: new Date().toISOString() }].slice(-DISCARDED_CAP);
  try { localStorage.setItem(KEY_DISCARDED, JSON.stringify(archive)); }
  catch (e) { console.error("[outbox] discard archive did not persist — kept:", e); return { ok: false, reason: "storage" }; }
  try {
    if (onShelf) localStorage.setItem(KEY_DEAD, JSON.stringify(outboxDead().filter((x) => !sameVersion(x, d))));
    else localStorage.setItem(KEY, JSON.stringify(load().filter((x) => !sameVersion(x, d))));
  } catch (e) { console.error("[outbox] list did not shrink after archiving (archived copy kept):", e); return { ok: false, reason: "storage" }; }
  announce(load(), outboxDead(), true);
  return { ok: true };
}
