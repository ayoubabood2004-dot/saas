/* ============================================================================
 * formDraft — ما كتبه الطبيب ينجو من إعادة التحميل، ويُعرض عليه ليرجّعه.
 *
 * «بنصّ ما أسجّل الحالة السستم يرجع يحمل ويعيد كل الشغل من الصفر» (١٧/١٠):
 * نموذجُ «حالة جديدة» كان يعيش بحالة المكوّن وحدها، فأيُّ تحميلٍ — نسخةٌ جديدة،
 * قطعةٌ انحذفت بعد نشر، المستخدمُ نفسُه ضغط F5 — يمحوه بصمت. `swUpdate.ts` أوقف
 * التحميلَ تحت اليد؛ وهذا خطُّ الدفاع الثاني: لا تحميلَ — مهما كان سببُه — يُسقط
 * ما كُتب.
 *
 * التصميم:
 *  - النطاق: النموذج + العيادة + المستخدم. مسودّةُ عيادةٍ لا تُعرض بأخرى، ولا
 *    مسودّةُ طبيبٍ على زميلٍ يشاركه الجهاز.
 *  - **لكلّ فتحةٍ للنموذج مسودّتُها** (معرّف): تبويبان، أو حالةٌ ثانية بُدئت قبل
 *    حسم الأولى — لا تكتب واحدةٌ فوق الأخرى. فالعرضُ لا يُستبدل بالكتابة الجديدة.
 *  - العرض لا الاسترجاع الصامت: حالةُ أمس لا تهبط على مريض اليوم. يُعرض أحدثُها
 *    بما فيها (المالك، الحيوانات، الوقت) و«رجّعها» أو «احذفها».
 *  - تنتهي بعد ٧ أيام، وأقصاها ٥ بالنطاق (الأقدمُ يُطوى). والحفظُ الناجح يمسح مسودّتَه.
 *  - امتلأ التخزين؟ تُحفظ بلا الصور (`lighten`) ويُقال ذلك عند العرض.
 * ==========================================================================*/

const PREFIX = "vp_draft:";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const DRAFT_MAX_PER_SCOPE = 5;

/** ما يلزم من `localStorage` — تكفيه خريطةٌ بالفحص. */
export interface DraftStorage {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface DraftScope { form: string; clinic: string | null | undefined; user: string | null | undefined }

export interface DraftRecord<T> {
  id: string;
  savedAt: number;
  data: T;
  /** حُفظت بلا الصور لأن التخزين امتلأ. */
  lightened?: boolean;
}

const seg = (s: string | null | undefined) => (s ? String(s).replace(/:/g, "_") : "-");
export const scopePrefix = (s: DraftScope) => `${PREFIX}${seg(s.form)}:${seg(s.clinic)}:${seg(s.user)}:`;
const keyOf = (s: DraftScope, id: string) => scopePrefix(s) + id;

const defaultStorage = (): DraftStorage | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

/** مسودّاتُ النطاق، الأحدثُ أوّلاً — والمنتهيةُ والتالفةُ تُمسح بالطريق. */
export function listDrafts<T>(scope: DraftScope, store: DraftStorage | null = defaultStorage(), now = Date.now()): DraftRecord<T>[] {
  if (!store) return [];
  const pre = scopePrefix(scope);
  const keys: string[] = [];
  try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(pre)) keys.push(k); } } catch { return []; }
  const out: DraftRecord<T>[] = [];
  for (const k of keys) {
    let rec: DraftRecord<T> | null = null;
    try { rec = JSON.parse(store.getItem(k) ?? "null") as DraftRecord<T> | null; } catch { rec = null; }
    if (!rec || typeof rec.savedAt !== "number" || rec.id !== k.slice(pre.length) || now - rec.savedAt > DRAFT_MAX_AGE_MS) {
      try { store.removeItem(k); } catch { /* ignore */ }
      continue;
    }
    out.push(rec);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * اكتب مسودّةَ هذه الفتحة. امتلأ التخزين ⇒ مرّةً ثانية بـ`lighten` (بلا الصور).
 * يرجع ما حُفظ فعلاً: "full" | "light" | "failed" — والفشلُ لا يرمي: الكتابةُ بالنموذج
 * أهمُّ من مسودّتها.
 */
export function saveDraft<T>(scope: DraftScope, id: string, data: T, opts: { lighten?: (d: T) => T; store?: DraftStorage | null; now?: number } = {}): "full" | "light" | "failed" {
  const store = opts.store === undefined ? defaultStorage() : opts.store;
  if (!store) return "failed";
  const now = opts.now ?? Date.now();
  const put = (rec: DraftRecord<T>) => { store.setItem(keyOf(scope, id), JSON.stringify(rec)); };
  let result: "full" | "light" | "failed" = "failed";
  try { put({ id, savedAt: now, data }); result = "full"; } catch {
    if (opts.lighten) {
      try { put({ id, savedAt: now, data: opts.lighten(data), lightened: true }); result = "light"; } catch { result = "failed"; }
    }
  }
  if (result !== "failed") {
    // سقفُ النطاق: الأقدمُ يُطوى (ولا تُطوى هذه الفتحة نفسُها).
    const all = listDrafts<T>(scope, store, now).filter((d) => d.id !== id);
    for (const d of all.slice(DRAFT_MAX_PER_SCOPE - 1)) { try { store.removeItem(keyOf(scope, d.id)); } catch { /* ignore */ } }
  }
  return result;
}

export function dropDraft(scope: DraftScope, id: string, store: DraftStorage | null = defaultStorage()): void {
  try { store?.removeItem(keyOf(scope, id)); } catch { /* ignore */ }
}

export function newDraftId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
