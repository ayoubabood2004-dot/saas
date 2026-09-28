import { useEffect, useSyncExternalStore } from "react";
import type { DrugFavorite } from "@/types";
import { repo } from "@/lib/repo";
import { getActiveClinicId } from "@/lib/clinics";

/* ============================================================================
 * أدويةُ الطبيب المفضّلة (0221) — قائمةٌ واحدة يقرؤها منتقي الأدوية وبلاطاتُ خطة
 * العلاج وورقةُ مهمة الطبلة، فنجمةٌ تُضغط بواحدٍ تظهر بالكلّ بلا إعادة جلب.
 *
 * «أدويتي» القديمة آخرُ عشرةٍ بالجهاز — أثرُ استعمال. المفضّلةُ قرارُ الطبيب: بالقاعدة،
 * لكلّ طبيبٍ داخل عيادته، وتبقى حتى يشيلها. والقراءةُ الفاشلة **حالةٌ تُقال** لا قائمةٌ
 * فارغة: «ماكو مفضّلة» عن خطأٍ تُصدَّق فيُعاد بناؤها.
 * ========================================================================= */

type State = { status: "idle" | "loading" | "ready" | "error"; list: DrugFavorite[]; clinic: string | null };

let state: State = { status: "idle", list: [], clinic: null };
const subs = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const key = (name: string) => name.trim().toLowerCase();

export async function loadDrugFavorites(force = false): Promise<void> {
  const clinic = getActiveClinicId() || null;
  if (!force && state.clinic === clinic && (state.status === "ready" || state.status === "loading")) return;
  set({ status: "loading", clinic, ...(state.clinic !== clinic ? { list: [] } : {}) });
  try {
    const list = await repo.listDrugFavorites();
    if ((getActiveClinicId() || null) !== clinic) return;   // تبدّلت العيادة أثناء الجلب
    set({ status: "ready", list });
  } catch {
    set({ status: "error" });
  }
}

/** يضيف أو يشيل — تفاؤليّاً، ويرجع كما كان ويرمي إن رفض الخادم (المستدعي يقول الرسالة). */
export async function toggleDrugFavorite(name: string): Promise<boolean> {
  const n = name.trim();
  if (!n) return false;
  const had = state.list.find((f) => key(f.name) === key(n));
  const before = state.list;
  if (had) {
    set({ list: before.filter((f) => f.id !== had.id) });
    try { await repo.removeDrugFavorite(had.id); return false; }
    catch (e) { set({ list: before }); throw e; }
  }
  const temp: DrugFavorite = { id: `tmp-${n}`, name: n, created_at: new Date().toISOString() };
  set({ list: [...before, temp] });
  try {
    const row = await repo.addDrugFavorite(n);
    set({ list: state.list.map((f) => (f.id === temp.id ? row : f)) });
    return true;
  } catch (e) { set({ list: before }); throw e; }
}

export function useDrugFavorites() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => { void loadDrugFavorites(); }, []);
  const names = s.list.map((f) => f.name);
  const set_ = new Set(names.map(key));
  return {
    names,
    status: s.status,
    isFav: (name: string) => set_.has(key(name)),
    retry: () => void loadDrugFavorites(true),
  };
}
