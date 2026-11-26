// ============================================================================
// بياناتُ «صور مقترحة لمنتجاتك»: منتجاتُ صفحة الصور (`photo_products`) والمكتبة كلُّها (العامّة ومكتبة
// العيادة — السياسةُ ترجع الاثنتين). مشتركةٌ بين الصفحة والشريط (صفحةُ الصور والمتجر) بخبيئةٍ واحدة:
// الشريطُ يحسب العددَ، والضغطةُ تفتح الصفحةَ على البيانات نفسِها بلا جلبٍ ثانٍ.
//
// المفتاحُ العيادة: خبيئةٌ من عيادةٍ تبدّلت (المشغّلُ يتنقّل) ليست نتيجة. والفشلُ يُقال — قائمةٌ ناقصة
// أخطرُ من خطأ ظاهر (CLAUDE.md §٣): «ماكو صور مقترحة» عن فشل جلبٍ كذبة.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { repo } from "./repo";
import type { LibraryImage, PhotoProduct } from "@/types";

export interface MatchData { products: PhotoProduct[]; library: LibraryImage[] }
interface Snap extends MatchData { key: string; at: number }

const TTL = 5 * 60_000;
let cache: Snap | null = null;
let inflight: { key: string; p: Promise<Snap> } | null = null;
const subs = new Set<() => void>();
const ping = () => { for (const f of subs) f(); };

export async function loadMatchData(key: string, force = false): Promise<MatchData> {
  if (!force && cache && cache.key === key && performance.now() - cache.at < TTL) return cache;
  if (inflight && inflight.key === key) return inflight.p;
  const p = (async () => {
    const [products, library] = await Promise.all([repo.listPhotoProducts(), repo.listImageLibrary()]);
    const snap: Snap = { key, at: performance.now(), products, library };
    // جلبٌ لعيادةٍ لم تعد الحاليّة لا يُكتب فوق خبيئتها.
    if (!inflight || inflight.key === key) cache = snap;
    return snap;
  })();
  inflight = { key, p };
  try { return await p; } finally { if (inflight?.p === p) inflight = null; }
}

/** صورةٌ انكتبت: الخبيئةُ تتبعها (الشريطُ ينقص بلا جلب)، ومشتركو الصفحة يُنبَّهون. */
export function patchMatchImage(key: string, productId: string, path: string | null): void {
  if (!cache || cache.key !== key) return;
  cache = { ...cache, products: cache.products.map((p) => (p.id === productId ? { ...p, image_path: path } : p)) };
  ping();
}
/** حالُ الخادم بعد «اقبل الكل» (القائمةُ الطازجةُ التي سُئلت قبلها، مرقَّعةً بما كُتب). */
export function replaceMatchProducts(key: string, products: PhotoProduct[]): void {
  if (!cache || cache.key !== key) return;
  cache = { ...cache, products, at: performance.now() };
  ping();
}

export type MatchState = "loading" | "error" | MatchData;
export function useMatchData(key: string | null, enabled: boolean): { state: MatchState; reload: () => void } {
  const [state, setState] = useState<MatchState>(() =>
    key && cache && cache.key === key && performance.now() - cache.at < TTL ? cache : "loading");
  const run = useCallback((force: boolean) => {
    if (!key || !enabled) return;
    let alive = true;
    setState((s) => (typeof s === "object" && !force ? s : "loading"));
    loadMatchData(key, force).then((d) => { if (alive) setState(d); }, () => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [key, enabled]);
  useEffect(() => run(false), [run]);
  useEffect(() => {
    const f = () => { if (key && cache && cache.key === key) setState(cache); };
    subs.add(f);
    return () => { subs.delete(f); };
  }, [key]);
  return { state, reload: () => { run(true); } };
}
