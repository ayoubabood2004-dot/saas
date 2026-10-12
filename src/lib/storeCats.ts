import { useEffect, useSyncExternalStore } from "react";
import type { StoreCatOp } from "@/types";
import { repo } from "./repo";
import { getActiveClinicId } from "./clinics";
import { registerReset } from "./clinicSync";
import { applyOps, archivedCats, cmpItem, liveCats, stateFromSnapshot, type CatRow, type CatsState } from "./storeCatIndex";

/* ============================================================================
 * متجرُ تصنيفات المتجر بالشاشة (0233) — على سُنّة «أدويتي» (`clinicDrugs.ts`).
 *
 * ── القواعد ────────────────────────────────────────────────────────────
 *  • **الختمُ من الخادم.** العيادةُ التي تقولها `store_categories_list()` هي ما ترسله كلُّ
 *    كتابةٍ بعدها (`p_clinic`)؛ وإن لم تطابق العيادةَ النشطةَ بالمتصفّح (المشغّلُ لحظةَ دخوله،
 *    أو جلسةٌ لم تستقرّ — صنفُ 0153) فالحالُ `switched`: لا شيءَ يُرسم ولا كتابة، والرفضُ
 *    قبل الشبكة.
 *  • **الشاشةُ أوّلاً، والخادمُ يحكم.** كلُّ فعلٍ يُطبَّق على `view` فوراً بـ`applyOps` (مرآةُ
 *    الدالّة)، وطلبٌ واحدٌ بالطريق — ما يأتي أثناءه يُطوى بالطلب التالي. نجاحٌ ⇒ `base` = لقطةُ
 *    الخادم و`view` = اللقطة + المنتظَر. فشلٌ ⇒ `view = base`، ويسقط المنتظَر، وتُقرأ القائمةُ
 *    مرّةً، ويُرمى الخطأ — والشاشةُ تقوله بالعربية (`describeDbError` يحمل التلميح).
 *  • **القراءةُ لا تكتب أبداً** (لا بذرةَ من هنا — seed-guard)، ولا طابورَ صادر: ترتيبٌ أو
 *    تأشيرٌ بلا شبكة يفشل ويرجع ويُقال.
 *  • **قراءةٌ فاشلة حالةٌ تُقال** (`error`) وتُبقي آخرَ ما وصل — لا قائمةٌ فارغةٌ كاذبة.
 * ==========================================================================*/

export type CatsStatus = "idle" | "loading" | "ready" | "error" | "switched";

export interface StoreCatsClientState {
  status: CatsStatus;
  clinic: string | null;
  /** مرآةُ can_edit: البنيةُ والترتيب (المديرُ والطبيب). */
  canEdit: boolean;
  base: CatsState;
  view: CatsState;
  loadedAt: number;
  saving: boolean;
  error: unknown;
}

const EMPTY: CatsState = { seeded: false, cats: [], items: [] };
const blank = (): StoreCatsClientState => ({ status: "idle", clinic: null, canEdit: false, base: EMPTY, view: EMPTY, loadedAt: 0, saving: false, error: null });

let state: StoreCatsClientState = blank();
let gen = 0;
let loading: Promise<void> | null = null;
let inflight: Promise<void> | null = null;
let queue: StoreCatOp[] = [];
type Waiter = { resolve: () => void; reject: (e: unknown) => void };
let waiting: Waiter[] = [];
let reloadAfter = false;
let lastVisible = 0;

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (next: Partial<StoreCatsClientState>) => { state = { ...state, ...next }; emit(); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const getStoreCatsState = (): StoreCatsClientState => state;
export const subscribeStoreCats = subscribe;

const STALE_MS = 30_000;
export const VISIBLE_MS = 15_000;
/** المعرّفُ: الخادمُ يفرض uuid، والتجريبيُّ بمعرّفاته (prod_…) — فالشاشةُ لا تسبق الحكمَ بالشكل. */
const looseId = (x: string) => x.length > 0 && x.length <= 80;
const ctx = () => ({ canEdit: state.canEdit, isId: looseId });
/** تبدّلت العيادةُ والطلبُ بالطريق: يُرفض منتظِرُه (لا يبقى وعداً معلَّقاً لا يُحسم أبداً). */
const switchedErr = () => Object.assign(new Error("clinic_switched"), { code: "not_ready" });
const notReadyErr = () => Object.assign(new Error("not_ready"), { code: "not_ready" });
/**
 * بيدنا لقطةٌ من الخادم بختمها: `ready`، أو `error` — قراءةٌ ثانيةٌ فشلت **وأبقت** ما وصل قبلها.
 * فالختمُ ختمُ آخر قراءةٍ نجحت، والكتابةُ ترسله والخادمُ يحكم (`p_clinic = auth_clinic()`)؛ وتبديلُ
 * العيادة يمحو الحالَ كلَّه (registerReset) فلا يبقى ختمٌ قديمٌ يُرسل. كان الشرطُ `ready` وحدَه:
 * رجوعٌ للتطبيق بشبكةٍ متعثّرة يجعل كلَّ حفظٍ بعده «ما انحفظ — not_ready» حتى تُبدَّل الشاشة.
 */
export const isStamped = (s: StoreCatsClientState): boolean => !!s.clinic && (s.status === "ready" || s.status === "error");

/** يقرأ اللقطةَ من الخادم. لا يدهس تعديلاً لم يُحسم: يؤجَّل حتى يُحسم. **لا يكتب أبداً.** */
export function loadStoreCats(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && state.status === "ready" && Date.now() - state.loadedAt < STALE_MS) return Promise.resolve();
  if (inflight || queue.length) { reloadAfter = true; return Promise.resolve(); }
  const my = gen;
  if (state.status === "idle" || state.status === "switched") set({ status: "loading" });
  loading = (async () => {
    try {
      const snap = await repo.storeCategoriesList();
      if (my !== gen) return;
      if (inflight || queue.length) { reloadAfter = true; return; }
      if (snap.clinic !== (getActiveClinicId() || "default")) {
        state = { ...blank(), status: "switched" };
        emit();
        return;
      }
      const s = stateFromSnapshot(snap);
      state = { ...state, status: "ready", clinic: snap.clinic, canEdit: !!snap.can_edit, base: s, view: s, loadedAt: Date.now(), error: null };
      emit();
    } catch (e) {
      if (my !== gen) return;
      set({ status: "error", error: e });
    } finally {
      if (my === gen) loading = null;
    }
  })();
  return loading;
}

function flush(): void {
  if (inflight || !queue.length) return;
  const clinic = state.clinic;
  const batch = queue;
  const mine = waiting;
  queue = [];
  waiting = [];
  if (!clinic) { fail(new Error("no_clinic"), mine); return; }
  const my = gen;
  set({ saving: true });
  inflight = (async () => {
    try {
      const snap = await repo.storeCategoriesApply(clinic, batch);
      if (my !== gen) { mine.forEach((w) => w.reject(switchedErr())); return; }
      const base = stateFromSnapshot(snap);
      let view = base;
      try { view = applyOps(base, queue, ctx()); }
      catch (e) {
        // ما ينتظر صار مستحيلاً على اللقطة الجديدة: يسقط ويُقال، والمؤكَّدُ يبقى.
        const dropped = waiting;
        queue = []; waiting = [];
        dropped.forEach((w) => w.reject(e));
        view = base;
      }
      // لقطةُ الكتابة قراءةٌ كاملةٌ ناجحة: تُنهي «آخر تحديث فشل» كما تُنهيه القراءة.
      state = { ...state, status: "ready", canEdit: !!snap.can_edit, base, view, saving: queue.length > 0, error: null, loadedAt: Date.now() };
      emit();
      mine.forEach((w) => w.resolve());
    } catch (e) {
      if (my !== gen) { mine.forEach((w) => w.reject(switchedErr())); return; }
      fail(e, mine);
    } finally {
      if (my === gen) {
        inflight = null;
        if (queue.length) flush();
        else if (reloadAfter) { reloadAfter = false; void loadStoreCats(true); }
      }
    }
  })();
}

/** رفضٌ أو شبكة: الشاشةُ ترجع لآخر ما أكّده الخادم، ويسقط المنتظَر، ونقرأ مرّةً، ونرمي. */
function fail(e: unknown, batchWaiters: Waiter[]): void {
  const dropped = waiting;
  queue = [];
  waiting = [];
  state = { ...state, view: state.base, saving: false };
  emit();
  [...batchWaiters, ...dropped].forEach((w) => w.reject(e));
  reloadAfter = false;
  inflight = null;
  void loadStoreCats(true);
}

/** يطبّق عملياتٍ على الشاشة فوراً ويرسلها دفعةً واحدة. يرمي إن رفضها الخادم (أو المرآةُ قبله). */
export function applyStoreCatOps(ops: StoreCatOp[]): Promise<void> {
  if (!ops.length) return Promise.resolve();
  if (state.status === "switched") return Promise.reject(switchedErr());
  if (!isStamped(state)) {
    /* لا لقطةَ بعد (أوّلُ قراءةٍ لم تصل أو فشلت): نقرأ مرّةً ثم نكتب — لا رفضٌ يتكرّر بلا قراءةٍ
     * تُصلحه. وفشلُ القراءة يُرمى هو (شبكةٌ، صلاحيةٌ — يقوله describeDbError) لا رمزٌ خام. */
    return loadStoreCats(true).then(() => {
      if (state.status === "switched") throw switchedErr();
      if (!isStamped(state)) throw state.error ?? notReadyErr();
      return applyStoreCatOps(ops);
    });
  }
  let view: CatsState;
  try { view = applyOps(state.view, ops, ctx()); }
  catch (e) { return Promise.reject(e); }   // نفسُ رفض الخادم قبل أن يُرسل
  queue.push(...ops);
  set({ view, saving: true });
  const p = new Promise<void>((resolve, reject) => { waiting.push({ resolve, reject }); });
  queueMicrotask(flush);
  return p;
}

/* ── قراءةٌ ثانية عند الرجوع للتبويب (كلَّ ١٥ث على الأكثر) — بلا realtime ─────────── */
export function onStoreCatsVisible(now = Date.now()): void {
  if (state.status === "idle") return;
  if (now - lastVisible < VISIBLE_MS) return;
  lastVisible = now;
  void loadStoreCats(true);
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onStoreCatsVisible(); });
}

registerReset(() => {
  gen++;
  const dropped = waiting;
  state = blank();
  queue = [];
  waiting = [];
  inflight = null;
  loading = null;
  reloadAfter = false;
  lastVisible = 0;
  emit();
  dropped.forEach((w) => w.reject(switchedErr()));
});

/* ── ما تشتقّه الشاشات (مخبَّأٌ بهويّة الحالة) ─────────────────────────────── */
export interface CatsView {
  live: CatRow[];
  archived: CatRow[];
  /** أعضاءُ كلّ تصنيفٍ بترتيبه. */
  members: Map<string, string[]>;
  /** تصنيفاتُ كلّ منتجٍ بترتيب العيادة. */
  byProduct: Map<string, string[]>;
}
const derived = new WeakMap<CatsState, CatsView>();
export function viewOf(s: CatsState): CatsView {
  const hit = derived.get(s);
  if (hit) return hit;
  const live = liveCats(s);
  const members = new Map<string, string[]>();
  for (const m of [...s.items].sort(cmpItem)) {
    const a = members.get(m.category_id);
    if (a) a.push(m.product_id); else members.set(m.category_id, [m.product_id]);
  }
  const byProduct = new Map<string, string[]>();
  for (const c of live) for (const pid of members.get(c.id) ?? []) {
    const a = byProduct.get(pid);
    if (a) a.push(c.id); else byProduct.set(pid, [c.id]);
  }
  const out = { live, archived: archivedCats(s), members, byProduct };
  derived.set(s, out);
  return out;
}

/** فرقُ قائمتين ⇒ عمليتا add/remove لتصنيفٍ واحد (دفعةٌ واحدة، ذرّية). */
export function diffOps(cat: string, before: ReadonlySet<string>, after: ReadonlySet<string>): StoreCatOp[] {
  const add = [...after].filter((id) => !before.has(id));
  const remove = [...before].filter((id) => !after.has(id));
  const ops: StoreCatOp[] = [];
  if (add.length) ops.push({ op: "add", cat, ids: add });
  if (remove.length) ops.push({ op: "remove", cat, ids: remove });
  return ops;
}

/**
 * تأشيرُ ورقة المنتج ⇒ عملياتٌ لمنتجٍ واحد: `toggles` نيّاتُ المستخدم (ما لمسه وحده: تصنيف ⇒
 * مؤشَّر/مشطوب) تُطبَّق على العضوية **الحيّة لحظةَ الحفظ** (`before`). ما لم يُلمس لا يُرسل أبداً.
 * كانت الورقةُ تُزرع مرّةً من العضوية لحظةَ الفتح وتُرسل «المجموعةَ كما رُئيت»: فتحٌ قبل وصول اللقطة
 * (أوّلُ تحميل، أو بعد قراءةٍ فاشلة) ثم حفظُ الوصف وحده = إزالةُ المادة من كلّ رفوفها بصمت.
 */
export function toggleOps(pid: string, before: ReadonlySet<string>, toggles: ReadonlyMap<string, boolean>): StoreCatOp[] {
  const ops: StoreCatOp[] = [];
  for (const [cat, on] of toggles) {
    if (on && !before.has(cat)) ops.push({ op: "add", cat, ids: [pid] });
    else if (!on && before.has(cat)) ops.push({ op: "remove", cat, ids: [pid] });
  }
  return ops;
}

/* ── الخطّاف ─────────────────────────────────────────────────────────────── */
export function useStoreCats() {
  const s = useSyncExternalStore(subscribe, getStoreCatsState, getStoreCatsState);
  useEffect(() => { void loadStoreCats(); }, []);
  const v = viewOf(s.view);
  return {
    status: s.status,
    /** لقطةُ خادمٍ بختمها بيدنا — الكتابةُ تمرّ (حتى بعد قراءةٍ ثانيةٍ فاشلة). */
    writable: isStamped(s),
    error: s.error,
    saving: s.saving,
    canEdit: s.canEdit,
    seeded: s.view.seeded,
    ...v,
    membersOf: (cat: string) => v.members.get(cat) ?? [],
    catsOf: (pid: string) => v.byProduct.get(pid) ?? [],
    apply: applyStoreCatOps,
    retry: () => void loadStoreCats(true),
  };
}
