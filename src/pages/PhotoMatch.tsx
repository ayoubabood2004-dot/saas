import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Barcode, Camera, Check, ImageOff, Loader2, RotateCw, Sparkles, Type, X } from "lucide-react";
import type { LibraryImage, PhotoProduct } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { cardImagePath, productImageUrl } from "@/lib/storeLib";
import { describeDbError, isNetworkError } from "@/lib/errors";
import { freshSplit, loadRejects, matchAll, rejectKey, saveRejects, type MatchItem } from "@/lib/imageMatch";
import { patchMatchImage, replaceMatchProducts, useMatchData } from "@/lib/photoMatchData";
import { Button, Dialog, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * صورٌ مقترحة لمنتجات العيادة (طلبُ المالك ٢٥/١١) — من المكتبة العامّة ومكتبة العيادة.
 *
 * ثلاثةُ أقسام (imageMatch.ts): بالباركود (المنتجُ نفسُه)، بالاسم (تخمينٌ يُرى بصورته)، وما عنده صورة
 * وبالمكتبة صورةٌ أخرى له. وقراراتُ المالك: «اقبلها كلها» بالباركود، وواحدةً واحدة، و«اقبل الكل» حتى
 * بالاسم بعد نافذةٍ تقول كم منها تخمين — لا `window.confirm` (يُقبل بلا قراءة، CLAUDE.md §٣).
 *
 * الكتابةُ `set_product_image` نفسُها (الخادمُ يسأل الإذنَ ويحصر المسار)، والصورةُ مرجعٌ لا نسخة. وقبل
 * «اقبل الكل» تُسأل المنتجاتُ طازجةً: ما تبدّلت صورتُه أثناء الصفحة لا يُكتب فوقه (`freshSplit`).
 * و«مو هاي» تُحفظ بالجهاز للعيادة فلا يرجع الاقتراحُ نفسُه.
 * ========================================================================= */

type Tab = "code" | "name" | "replace";
type Item = MatchItem<PhotoProduct, LibraryImage>;
const PAGE = 40;
const WORKERS = 4;

export function PhotoMatch() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const key = user?.clinic_id ?? user?.id ?? null;
  const allowed = can("manageProductPhotos") || can("manageStore");
  const { state, reload } = useMatchData(key, allowed);

  const [rejects, setRejects] = useState<Set<string>>(() => (key ? loadRejects(key) : new Set()));
  /** بديلٌ اختاره المستخدمُ بدل الأوّل — يبقى بعد إعادة الحساب ما دام بين المرشّحين. */
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState<Tab | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ items: Item[]; kind: "code" | "name" | "sure" | "replace" } | null>(null);
  const [bulk, setBulk] = useState<{ d: number; n: number } | null>(null);
  const stopRef = useRef(false);

  const data = typeof state === "object" ? state : null;
  const result = useMemo(() => {
    if (!data) return null;
    return matchAll(data.products, data.library, { skip: (pid, path) => rejects.has(rejectKey(pid, path)) });
  }, [data, rejects]);

  /** البديلُ المختار يتقدّم (إن بقي مرشّحاً). */
  const view = (it: Item): Item => {
    const want = chosen.get(it.product.id);
    if (!want || it.best.path === want) return it;
    const alt = it.alts.find((a) => a.path === want);
    return alt ? { ...it, best: alt, alts: [it.best, ...it.alts.filter((a) => a !== alt)] } : it;
  };
  const lists: Record<Tab, Item[]> = {
    code: (result?.code ?? []).map(view),
    name: (result?.name ?? []).map(view),
    replace: (result?.replace ?? []).map(view),
  };
  const active: Tab = tab ?? (lists.code.length ? "code" : lists.name.length ? "name" : lists.replace.length ? "replace" : "code");
  const list = lists[active];

  const accept = async (it: Item) => {
    if (!key) return;
    setBusyId(it.product.id);
    try {
      await repo.setProductImage(it.product.id, it.best.path);
      playSuccess();
      toast.success(t("pmatch.savedOne", { name: it.product.name }));
      patchMatchImage(key, it.product.id, it.best.path);
    } catch (e) { playWarning(); toast.error(describeDbError(e, t)); }
    finally { setBusyId(null); }
  };
  const reject = (it: Item) => {
    if (!key) return;
    playTap();
    const next = new Set(rejects);
    next.add(rejectKey(it.product.id, it.best.path));
    setRejects(next);
    saveRejects(key, next);
    setChosen((m) => { if (!m.has(it.product.id)) return m; const n = new Map(m); n.delete(it.product.id); return n; });
  };
  const pick = (it: Item, alt: LibraryImage) => { playTap(); setChosen((m) => new Map(m).set(it.product.id, alt.path)); };

  /** «اقبل الكل»: المنتجاتُ طازجةً أوّلاً، ثمّ أربعةُ كتّابٍ بالتوازي؛ انقطاعُ النتّ يوقف والباقي يبقى. */
  const runBulk = async (items: Item[]) => {
    if (!key || !items.length) return;
    setAsk(null);
    stopRef.current = false;
    setBulk({ d: 0, n: items.length });
    let fresh: PhotoProduct[];
    try { fresh = await repo.listPhotoProducts(); }
    catch (e) { setBulk(null); playWarning(); toast.error(describeDbError(e, t)); return; }
    const { go, changed, gone } = freshSplit(items, new Map(fresh.map((p) => [p.id, p.image_path ?? null])));
    setBulk({ d: 0, n: go.length });
    const queue = [...go];
    const applied = new Map<string, string>();
    let failed = 0, net = false;
    const worker = async () => {
      while (queue.length && !stopRef.current && !net) {
        const it = queue.shift()!;
        try { await repo.setProductImage(it.product.id, it.best.path); applied.set(it.product.id, it.best.path); }
        catch (e) { if (isNetworkError(e)) { net = true; queue.unshift(it); } else failed++; }
        setBulk((b) => (b ? { ...b, d: b.d + 1 } : b));
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    replaceMatchProducts(key, fresh.map((p) => (applied.has(p.id) ? { ...p, image_path: applied.get(p.id)! } : p)));
    setBulk(null);
    const n = formatNum(applied.size);
    if (net) { playWarning(); toast.error(t("pmatch.net", { n })); }
    else if (stopRef.current) toast.success(t("pmatch.stopped", { n }));
    else { playSuccess(); toast.success(t("pmatch.doneMsg", { n })); }
    if (changed) toast.success(t("pmatch.skippedChanged", { n: formatNum(changed) }));
    if (gone) toast.success(t("pmatch.skippedGone", { n: formatNum(gone) }));
    if (failed) toast.error(t("pmatch.failedSome", { n: formatNum(failed) }));
  };

  if (!allowed) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-sm font-bold text-ink-muted">{t("pmatch.noAccess")}</p>;
  }

  const total = lists.code.length + lists.name.length;
  const sure = lists.name.filter((x) => x.sure);
  const tabs: [Tab, string, typeof Barcode][] = [
    ["code", t("pmatch.tabCode", { n: formatNum(lists.code.length) }), Barcode],
    ["name", t("pmatch.tabName", { n: formatNum(lists.name.length) }), Type],
    ["replace", t("pmatch.tabReplace", { n: formatNum(lists.replace.length) }), RotateCw],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6" data-pmatch>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Sparkles size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("pmatch.title")}</h1>
          <p className="text-sm text-ink-subtle" data-pmatch-summary>
            {result
              ? t("pmatch.summary", { n: formatNum(total), code: formatNum(lists.code.length), name: formatNum(lists.name.length) })
              : t("pmatch.sub")}
          </p>
        </div>
        <Link to="/photos" onClick={() => playTap()}
          className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-4 text-sm font-bold text-ink-muted transition hover:text-ink">
          <Camera size={16} /> {t("pmatch.back")}
        </Link>
      </div>

      {state === "loading" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : state === "error" || !result ? (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-pmatch-failed>
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("pmatch.failed")}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => { playTap(); reload(); }}><RotateCw size={14} /> {t("common.retry")}</Button>
        </div>
      ) : total + lists.replace.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface-1 p-6 text-center" data-pmatch-empty>
          <p className="text-sm font-bold text-ink">{t("pmatch.noneAtAll")}</p>
          {result.none > 0 && <p className="mt-1 text-xs text-ink-subtle">{t("pmatch.noneCount", { n: formatNum(result.none) })}</p>}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2" role="tablist">
            {tabs.map(([k, label, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={active === k} data-pmatch-tab={k}
                onClick={() => { playTap(); setTab(k); setShown(PAGE); }}
                className={cn("inline-flex h-11 items-center gap-1.5 rounded-2xl px-4 text-sm font-bold transition",
                  active === k ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink")}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 p-3">
            <p className="min-w-0 flex-1 text-xs font-semibold text-ink-muted">
              {active === "code" ? t("pmatch.explainCode") : active === "name" ? t("pmatch.explainName") : t("pmatch.explainReplace")}
            </p>
            {list.length > 0 && !bulk && (
              active === "code" ? (
                <Button size="sm" leftIcon={<Check size={15} />} data-pmatch-all="code" onClick={() => { playTap(); setAsk({ items: list, kind: "code" }); }}>
                  {t("pmatch.acceptAllCode", { n: formatNum(list.length) })}
                </Button>
              ) : active === "name" ? (
                <>
                  {sure.length > 0 && (
                    <Button size="sm" leftIcon={<Check size={15} />} data-pmatch-all="sure" onClick={() => { playTap(); setAsk({ items: sure, kind: "sure" }); }}>
                      {t("pmatch.acceptSure", { n: formatNum(sure.length) })}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" data-pmatch-all="name" onClick={() => { playTap(); setAsk({ items: list, kind: "name" }); }}>
                    {t("pmatch.acceptAll", { n: formatNum(list.length) })}
                  </Button>
                </>
              ) : (
                <Button size="sm" leftIcon={<RotateCw size={15} />} data-pmatch-all="replace" onClick={() => { playTap(); setAsk({ items: list, kind: "replace" }); }}>
                  {t("pmatch.replaceAll", { n: formatNum(list.length) })}
                </Button>
              )
            )}
            {bulk && (
              <div className="flex items-center gap-2" data-pmatch-bulk>
                <Loader2 size={16} className="animate-spin text-brand-600" />
                <span className="text-sm font-bold text-ink">{t("pmatch.working", { d: formatNum(bulk.d), n: formatNum(bulk.n) })}</span>
                <Button size="sm" variant="secondary" onClick={() => { playTap(); stopRef.current = true; }}>{t("pmatch.stop")}</Button>
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <p className="py-12 text-center text-sm font-bold text-ink-subtle">{t("pmatch.emptyTab")}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.slice(0, shown).map((it) => (
                  <MatchCard key={it.product.id} it={it} busy={busyId === it.product.id || !!bulk}
                    onAccept={() => void accept(it)} onReject={() => reject(it)} onPick={(a) => pick(it, a)} />
                ))}
              </div>
              {list.length > shown && (
                <div className="mt-4 text-center">
                  <Button variant="secondary" onClick={() => { playTap(); setShown((n) => n + PAGE); }}>
                    {t("pmatch.more", { n: formatNum(list.length - shown) })}
                  </Button>
                </div>
              )}
            </>
          )}
          {active !== "replace" && result.none > 0 && (
            <p className="mt-4 text-center text-xs text-ink-subtle">{t("pmatch.noneCount", { n: formatNum(result.none) })}</p>
          )}
        </>
      )}

      <Dialog open={!!ask} onClose={() => setAsk(null)} title={t("pmatch.confirmTitle")} size="sm"
        footer={ask && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { playTap(); setAsk(null); }}>{t("pmatch.cancel")}</Button>
            <Button data-pmatch-go onClick={() => { playTap(); void runBulk(ask.items); }}>{t("pmatch.go")}</Button>
          </div>
        )}>
        {ask && (
          <p className="text-sm leading-relaxed text-ink" data-pmatch-ask={ask.kind}>
            {ask.kind === "code" ? t("pmatch.confirmCode", { n: formatNum(ask.items.length) })
              : ask.kind === "replace" ? t("pmatch.confirmReplace", { n: formatNum(ask.items.length) })
              : ask.kind === "sure" ? t("pmatch.confirmSure", { n: formatNum(ask.items.length) })
              : t("pmatch.confirmName", { n: formatNum(ask.items.length), guess: formatNum(ask.items.filter((x) => !x.sure).length) })}
          </p>
        )}
      </Dialog>
    </div>
  );
}

function Img({ path, alt, thumb }: { path: string | null | undefined; alt: string; thumb?: boolean }) {
  const full = productImageUrl(path);
  const small = productImageUrl(cardImagePath(path)) ?? full;
  if (!full) return <ImageOff size={30} className="text-ink-subtle" aria-hidden />;
  return (
    <img src={thumb ? small ?? full : full} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-contain"
      onError={(e) => { if (e.currentTarget.src !== full) e.currentTarget.src = full; }} />
  );
}

function MatchCard({ it, busy, onAccept, onReject, onPick }: {
  it: Item; busy: boolean; onAccept: () => void; onReject: () => void; onPick: (a: LibraryImage) => void;
}) {
  const { t } = useTranslation();
  const p = it.product;
  const has = !!p.image_path;
  const badge = it.how === "code" ? t("pmatch.byCode")
    : it.sure ? t("pmatch.sure") : t("pmatch.guess", { pct: formatNum(Math.round(it.score * 100)) });
  return (
    <div className={cn("card flex flex-col overflow-hidden", busy && "opacity-60")} data-match={p.id} data-match-how={it.how}>
      <div className="flex items-start gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-ink" dir="auto" title={p.name}>{p.name}</p>
          <p className="truncate text-2xs text-ink-subtle" dir="auto">{[p.company_name, p.barcode].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold",
          it.how === "code" || it.sure ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200")}
          data-match-badge>{badge}</span>
      </div>
      <div className={cn("grid gap-2 px-3", has ? "grid-cols-2" : "grid-cols-1")}>
        {has && (
          <figure className="min-w-0">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-surface-2"><Img path={p.image_path} alt={p.name} thumb /></div>
            <figcaption className="mt-1 text-center text-2xs font-semibold text-ink-subtle">{t("pmatch.current")}</figcaption>
          </figure>
        )}
        <figure className="min-w-0">
          <div className={cn("grid place-items-center overflow-hidden rounded-xl bg-surface-2", has ? "aspect-square" : "aspect-[4/3]")} data-match-img={it.best.path}>
            <Img path={it.best.path} alt={it.best.name} />
          </div>
          <figcaption className="mt-1 truncate text-center text-2xs font-semibold text-ink-muted" dir="auto" title={it.best.name}>
            {it.best.name} · {it.best.clinic_id ? t("pmatch.mine") : t("pmatch.public")}
          </figcaption>
        </figure>
      </div>
      {it.alts.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <span className="text-2xs font-semibold text-ink-subtle">{t("pmatch.alts")}</span>
          {it.alts.map((a) => (
            <button key={a.path} type="button" disabled={busy} onClick={() => onPick(a)} title={a.name} aria-label={a.name} data-match-alt={a.path}
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 transition hover:border-brand-400 disabled:opacity-50">
              <Img path={a.path} alt={a.name} thumb />
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto flex gap-1.5 p-3">
        <button type="button" disabled={busy} onClick={onAccept} data-match-accept={p.id}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
          <Check size={15} /> {has ? t("pmatch.replaceOne") : t("pmatch.accept")}
        </button>
        <button type="button" disabled={busy} onClick={onReject} data-match-reject={p.id}
          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-ink-muted transition hover:text-danger-600 disabled:opacity-50">
          <X size={15} /> {t("pmatch.reject")}
        </button>
      </div>
    </div>
  );
}
