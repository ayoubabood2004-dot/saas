import { useEffect, useSyncExternalStore } from "react";
import type { ClinicDrug, ClinicDrugOp, DrugFamilyKey, MedicineStock } from "@/types";
import { repo } from "./repo";
import { getActiveClinicId } from "./clinics";
import { registerReset } from "./clinicSync";
import { applyOps, drugErrorCode, drugKey, mineOrder } from "./medIndex";
import { uuid } from "./utils";

/* ============================================================================
 * متجرُ «أدويتي» (0229) — على سُنّة متجر الأقفاص (`cage3d/store.ts`).
 *
 * ── القواعد ────────────────────────────────────────────────────────────
 *  • **الختمُ من الخادم.** العيادةُ التي تقولها `clinic_drugs_list()` هي ما ترسله كلُّ
 *    كتابةٍ بعدها؛ وإن لم تطابق العيادةَ النشطةَ بالمتصفّح (المشغّلُ لحظةَ دخوله، أو
 *    جلسةٌ لم تستقرّ — صنفُ 0153) فالحالُ `switched`: لا صفَّ يُرسم ولا كتابة.
 *  • **الشاشةُ أوّلاً، والخادمُ يحكم.** كلُّ فعلٍ يُطبَّق على `view` فوراً بـ`applyOps`
 *    (مرآةُ الدالّة)، وطلبٌ واحدٌ بالطريق — ما يأتي أثناءه يُطوى بالطلب التالي. ونجاحٌ
 *    ⇒ `base` = لقطةُ الخادم و`view` = اللقطة + المنتظَر. وفشلٌ ⇒ `view = base`، ويُسقط
 *    المنتظَر، وتُقرأ القائمةُ مرّةً، ويُرمى الخطأ — الشاشةُ تقوله بـ`describeDbError`.
 *  • **القراءةُ لا تكتب أبداً**، ولا طابورَ صادر: نجمةٌ أو سحبٌ بلا شبكة يفشل ويرجع.
 *  • **قراءةٌ فاشلة حالةٌ تُقال** (`error`) وتُبقي آخرَ ما وصل — لا `[]` كاذبة.
 * ==========================================================================*/

export type DrugsStatus = "idle" | "loading" | "ready" | "error" | "switched";

export interface DrugsState {
  status: DrugsStatus;
  /** ختمُ العيادة كما قاله الخادم. */
  clinic: string | null;
  /** آخرُ ما أكّده الخادم. */
  base: ClinicDrug[];
  /** ما تراه الشاشة: base + ما لم يُحسم بعد. */
  view: ClinicDrug[];
  loadedAt: number;
  saving: boolean;
  error: unknown;
}

const blank = (): DrugsState => ({ status: "idle", clinic: null, base: [], view: [], loadedAt: 0, saving: false, error: null });

let state: DrugsState = blank();
let gen = 0;
let loading: Promise<void> | null = null;
let inflight: Promise<void> | null = null;
let queue: ClinicDrugOp[] = [];
type Waiter = { resolve: () => void; reject: (e: unknown) => void };
let waiting: Waiter[] = [];
let reloadAfter = false;
let lastVisible = 0;

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (next: Partial<DrugsState>) => { state = { ...state, ...next }; emit(); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const getDrugsState = (): DrugsState => state;
export const subscribeDrugs = subscribe;

const STALE_MS = 30_000;
const VISIBLE_MS = 15_000;

/** يقرأ القائمةَ من الخادم. لا يدهس تعديلاً لم يُحسم: يؤجَّل حتى يُحسم. */
export function loadClinicDrugs(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && state.status === "ready" && Date.now() - state.loadedAt < STALE_MS) return Promise.resolve();
  if (inflight || queue.length) { reloadAfter = true; return Promise.resolve(); }
  const my = gen;
  if (state.status === "idle" || state.status === "switched") set({ status: "loading" });
  loading = (async () => {
    try {
      const snap = await repo.listClinicDrugs();
      if (my !== gen) return;
      if (inflight || queue.length) { reloadAfter = true; return; }
      if (snap.clinic !== (getActiveClinicId() || "default")) {
        state = { ...blank(), status: "switched" };
        emit();
        return;
      }
      state = { ...state, status: "ready", clinic: snap.clinic, base: snap.rows, view: snap.rows, loadedAt: Date.now(), error: null };
      emit();
    } catch (e) {
      if (my !== gen) return;
      // تبقى الصفوفُ الأخيرة إن وصلت — الفشلُ يُقال ولا يُرسم قائمةً فارغة.
      set({ status: "error", error: e });
    } finally {
      if (my === gen) loading = null;
    }
  })();
  return loading;
}

/** يُنادى عند فتح المنتقي: قراءةٌ جديدة إن كانت اللقطةُ أقدمَ من ٣٠ث. */
export const refreshIfStale = () => loadClinicDrugs(false);

const remap = (o: ClinicDrugOp, ids: Map<string, string>): ClinicDrugOp => {
  const id = ids.get(o.id) ?? o.id;
  if ((o.op === "move" || o.op === "put") && typeof o.after === "string" && ids.has(o.after)) return { ...o, id, after: ids.get(o.after) as string };
  return id === o.id ? o : { ...o, id };
};

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
      const snap = await repo.applyClinicDrugs(clinic, batch);
      if (my !== gen) return;
      /* الخادمُ طوى «أضف» على صفٍّ قائمٍ بنفس المفتاح: معرّفُنا المؤقّت لا وجودَ له عنده —
         ما ينتظر بعده يُرسل بمعرّف الخادم، وإلا رُفض «drug_row_gone» على شيءٍ موجود. */
      const ids = new Map<string, string>();
      for (const o of batch) {
        if (o.op !== "put" || snap.rows.some((r) => r.id === o.id)) continue;
        const k = drugKey(o.name);
        const hit = snap.rows.find((r) => r.archived_at == null && drugKey(r.name) === k);
        if (hit) ids.set(o.id, hit.id);
      }
      if (ids.size) queue = queue.map((o) => remap(o, ids));
      let view = snap.rows;
      try { view = applyOps(snap.rows, queue); }
      catch (e) {
        // ما ينتظر صار مستحيلاً على اللقطة الجديدة: يسقط ويُقال، والمؤكَّدُ يبقى.
        const dropped = waiting;
        queue = []; waiting = [];
        dropped.forEach((w) => w.reject(e));
        view = snap.rows;
      }
      state = { ...state, base: snap.rows, view, saving: queue.length > 0, error: null, loadedAt: Date.now() };
      emit();
      mine.forEach((w) => w.resolve());
    } catch (e) {
      if (my !== gen) return;
      fail(e, mine);
    } finally {
      if (my === gen) {
        inflight = null;
        if (queue.length) flush();
        else if (reloadAfter) { reloadAfter = false; void loadClinicDrugs(true); }
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
  void loadClinicDrugs(true);
}

/** يطبّق عملياتٍ على الشاشة فوراً ويرسلها. يرمي إن رفضها الخادم (أو المرآةُ قبله). */
export function applyDrugOps(ops: ClinicDrugOp[]): Promise<void> {
  if (!ops.length) return Promise.resolve();
  if (state.status !== "ready" || !state.clinic) {
    return Promise.reject(Object.assign(new Error(state.status === "switched" ? "clinic_switched" : "not_ready"), { code: "not_ready" }));
  }
  let view: ClinicDrug[];
  try { view = applyOps(state.view, ops); }
  catch (e) { return Promise.reject(e); }   // نفسُ رفض الخادم قبل أن يُرسل
  queue.push(...ops);
  set({ view, saving: true });
  const p = new Promise<void>((resolve, reject) => { waiting.push({ resolve, reject }); });
  queueMicrotask(flush);
  return p;
}

/* ── قراءةٌ ثانية عند الرجوع للتبويب (كلَّ ١٥ث على الأكثر) — بلا realtime ─────────── */
export function onDrugsVisible(now = Date.now()): void {
  if (state.status === "idle") return;
  if (now - lastVisible < VISIBLE_MS) return;
  lastVisible = now;
  void loadClinicDrugs(true);
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onDrugsVisible(); });
}

/* ── خبيئتان مشتركتان (٦٠ث): المخزنُ والأخيرة — للمنتقي وشارة المعالج ─────────────── */
type Cached<T> = { clinic: string; at: number; p: Promise<T> };
let stockCache: Cached<MedicineStock[]> | null = null;
let recentCache: Cached<string[]> | null = null;
const CACHE_MS = 60_000;
const fresh = <T>(c: Cached<T> | null, clinic: string) => !!c && c.clinic === clinic && Date.now() - c.at < CACHE_MS;

export function loadMedicineStock(force = false): Promise<MedicineStock[]> {
  const clinic = getActiveClinicId() || "default";
  if (!force && fresh(stockCache, clinic)) return (stockCache as Cached<MedicineStock[]>).p;
  const entry: Cached<MedicineStock[]> = { clinic, at: Date.now(), p: repo.listMedicineStock() };
  stockCache = entry;
  // فشلٌ لا يُخبَّأ: المرّةُ القادمة تسأل من جديد.
  entry.p.catch(() => { if (stockCache === entry) stockCache = null; });
  return entry.p;
}
export function loadRecentMeds(force = false): Promise<string[]> {
  const clinic = getActiveClinicId() || "default";
  if (!force && fresh(recentCache, clinic)) return (recentCache as Cached<string[]>).p;
  const entry: Cached<string[]> = { clinic, at: Date.now(), p: repo.recentMedNames(30) };
  recentCache = entry;
  entry.p.catch(() => { if (recentCache === entry) recentCache = null; });
  return entry.p;
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
  stockCache = null;
  recentCache = null;
  emit();
  dropped.forEach((w) => w.reject(Object.assign(new Error("clinic_switched"), { code: "not_ready" })));
});

/* ── الخطّاف ─────────────────────────────────────────────────────────────── */
export interface DrugRef { drugId?: string; name: string; family: DrugFamilyKey }

export function useClinicDrugs() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => { void loadClinicDrugs(); }, []);
  const mine = mineOrder(s.view);
  const mineKeys = new Set(mine.map((r) => drugKey(r.name)));
  return {
    status: s.status,
    error: s.error,
    saving: s.saving,
    rows: s.view,
    mine,
    archived: s.view.filter((r) => r.archived_at != null),
    isMine: (key: string) => mineKeys.has(key),
    /** نجمةٌ: بآخر «أدويتي» (أو بعد صفٍّ بعينه، أو أوّلَها بـnull). */
    star: (it: DrugRef, after?: string | null) => applyDrugOps([{
      op: "put", id: it.drugId ?? uuid(), name: it.name, family: it.family, mine: true, ...(after !== undefined ? { after } : {}),
    }]),
    unstar: (id: string) => applyDrugOps([{ op: "unmine", id }]),
    move: (id: string, after: string | null) => applyDrugOps([{ op: "move", id, after }]),
    addCustom: (x: { name: string; family: DrugFamilyKey; mine: boolean }) =>
      applyDrugOps([{ op: "put", id: uuid(), name: x.name, family: x.family, mine: x.mine }]),
    edit: (id: string, patch: { name?: string; family?: DrugFamilyKey }) => applyDrugOps([{ op: "edit", id, ...patch }]),
    archive: (id: string) => applyDrugOps([{ op: "archive", id }]),
    restore: (id: string) => applyDrugOps([{ op: "restore", id }]),
    apply: applyDrugOps,
    retry: () => void loadClinicDrugs(true),
  };
}

/** رمزُ رفضٍ معروف؟ (للشاشة: «تراجع» بعد صفٍّ شالته جهازٌ ثانٍ ⇒ بآخر القائمة). */
export const isDrugError = (e: unknown, code: string) => drugErrorCode(e) === code;
