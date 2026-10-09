import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, History, ImageOff, Loader2, RotateCw, Search, Tag } from "lucide-react";
import type { PhotoProduct, PriceReviewRow } from "@/types";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { cn, formatDate, formatNum, money } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, useToast } from "@/components/ui";
import { matchesQuery } from "@/lib/storeBoard";
import { thumbOf, type ImageMeta } from "@/lib/productPhoto";

/* ============================================================================
 * مراجعةُ الأسعار (0229) — قبل أن يرى الزبونُ السعر: هل هو صحيح، ومتى تغيّر، ومن غيّره.
 *
 * «آخرُ تغيير» من الخادم (`store_price_review`): تعديلُ اليد من سجلّ التدقيق والرفعُ
 * بنسبةٍ من سطوره — والقائمةُ تُجلب حين تُفتح الشاشة، وفشلُها يُقال لا يُخفى. و«تحت
 * الكلفة» علامةٌ بلا رقم، ولمن يرى الكلفةَ أصلاً (لا تصل المصوّر — 0229).
 * ==========================================================================*/

type F = "all" | "recent" | "belowCost" | "noprice";

export function PriceReview({ rows, prices, loadPrices, canPrice, priceViaStore, onPatch, onOpen }: {
  rows: PhotoProduct[];
  prices: Map<string, PriceReviewRow> | null;
  loadPrices: () => Promise<void>;
  canPrice: boolean;
  priceViaStore: boolean;
  onPatch: (id: string, p: Partial<PhotoProduct>) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<"loading" | "ready" | "error">(prices ? "ready" : "loading");
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchPrices = async () => {
    setState("loading");
    try { await loadPrices(); setState("ready"); } catch { setState("error"); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchPrices(); }, []);

  const week = Date.now() - 7 * 86400000;
  const shown = useMemo(() => rows.filter((p) => p.store_visible), [rows]);
  const recent = (p: PhotoProduct) => { const r = prices?.get(p.id); return !!r && new Date(r.changed_at).getTime() >= week; };
  const counts = {
    all: shown.length,
    recent: shown.filter(recent).length,
    belowCost: shown.filter((p) => p.below_cost).length,
    noprice: shown.filter((p) => (Number(p.sell_price) || 0) <= 0).length,
  };
  const list = shown.filter((p) => (f === "all" || (f === "recent" ? recent(p) : f === "belowCost" ? !!p.below_cost : (Number(p.sell_price) || 0) <= 0))
    && matchesQuery(p, q))
    .sort((a, b) => Number(!!b.below_cost) - Number(!!a.below_cost)
      || (prices?.get(b.id)?.changed_at ?? "").localeCompare(prices?.get(a.id)?.changed_at ?? "")
      || a.name.localeCompare(b.name, "ar"));

  const save = async (p: PhotoProduct) => {
    if (!edit || busy) return;
    const raw = edit.v.trim();
    setEdit(null);
    if (!raw) return;
    const v = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(v) || v <= 0) { playWarning(); toast.error(t("sb.badPrice", "السعر لازم رقم أكبر من صفر")); return; }
    if (v === (p.sell_price ?? 0)) return;
    setBusy(p.id);
    try {
      if (priceViaStore) await repo.setStorePrice(p.id, v, p.sell_price ?? null);
      else await repo.updateProduct(p.id, { sell_price: v }, { sell_price: p.sell_price ?? 0 });
      onPatch(p.id, { sell_price: v });
      playSuccess();
      toast.success(t("sb.priceSaved", "انحفظ السعر: {{p}}", { p: money(v) }));
      void fetchPrices();
    } catch (e) { playWarning(); toast.error(t("sb.saveFailed", "ما انحفظ — أعد المحاولة"), describeDbError(e, t)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-3" data-price-review>
      <div className="card space-y-1 p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-ink"><Tag size={17} className="text-brand-600" /> {t("sb.pr.title", "أسعار المنشور بالمتجر")}</p>
        <p className="text-xs text-ink-subtle">{t("sb.pr.hint", "هذا نفس سعر الكاشير — أي تعديل هنا يتغيّر بالبيع أيضاً. تأكّد قبل ما تحفظ.")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["all", t("sb.pr.all", "كل المنشور")],
          ["recent", t("sb.pr.recent", "تغيّر آخر ٧ أيام")],
          ...(counts.belowCost > 0 || f === "belowCost" ? [["belowCost", t("sb.f.belowCost", "تحت الكلفة")] as const] : []),
          ...(counts.noprice > 0 || f === "noprice" ? [["noprice", t("sb.f.noprice", "منشور بلا سعر")] as const] : []),
        ] as Array<readonly [F, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => { playTap(); setF(id); }}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              f === id ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2",
              f !== id && id === "belowCost" && "border-danger-300 text-danger-700 dark:border-danger-500/40 dark:text-danger-300")}>
            {label} <span className={cn("tabular-nums", f === id ? "text-white/80" : "text-ink-subtle")}>{formatNum(counts[id])}</span>
          </button>
        ))}
        <div className="relative ms-auto min-w-[180px]">
          <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sb.search", "ابحث بالاسم أو الباركود أو الشركة")} className="input h-9 w-full ps-8 text-xs" />
        </div>
      </div>

      {state === "error" && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="flex-1 text-xs font-semibold text-danger-700 dark:text-danger-300">{t("sb.pr.failed", "ما وصلنا لتاريخ الأسعار — الأسعار نفسها صحيحة، بس «آخر تغيير» ما ينعرض.")}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); void fetchPrices(); }}><RotateCw size={14} /> {t("common.retry", "أعد المحاولة")}</Button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-ink-subtle">{t("sb.p.none", "ماكو منتجات بهذا البحث.")}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((p) => {
            const r = prices?.get(p.id);
            const src = productImageUrl(thumbOf(p.image_path, p.image_meta as ImageMeta | null)) ?? productImageUrl(p.image_path);
            return (
              <div key={p.id} className={cn("card flex flex-wrap items-center gap-3 p-2.5", p.below_cost && "border-danger-300 dark:border-danger-500/40")} data-price-row={p.id}>
                <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2">
                    {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff size={16} className="text-ink-subtle" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                      {state === "loading" ? <Loader2 size={11} className="animate-spin" />
                        : r ? (
                          <span className="inline-flex items-center gap-1 tabular-nums"><History size={11} />
                            {t("sb.lastChange", "آخر تغيير: {{when}} — {{from}} ← {{to}}{{by}}", {
                              when: formatDate(r.changed_at, "ar"),
                              from: r.old_price != null ? money(r.old_price) : "—",
                              to: r.new_price != null ? money(r.new_price) : "—",
                              by: r.by_name ? ` · ${r.by_name}` : "",
                            })}
                            {r.via === "raise" && <> · {t("sb.viaRaise", "رفع أسعار")}</>}
                          </span>
                        ) : state === "ready" ? <span>{t("sb.pr.noChange", "ما تغيّر آخر ٩٠ يوم")}</span> : null}
                      {p.below_cost && <span className="inline-flex items-center gap-1 font-bold text-danger-600 dark:text-danger-300"><AlertTriangle size={11} /> {t("sb.belowCost", "تحت الكلفة")}</span>}
                    </span>
                  </span>
                </button>
                {edit?.id === p.id ? (
                  <input autoFocus type="number" inputMode="decimal" min={0} value={edit.v} onChange={(e) => setEdit({ id: p.id, v: e.target.value })}
                    onBlur={() => void save(p)} onKeyDown={(e) => { if (e.key === "Enter") void save(p); if (e.key === "Escape") setEdit(null); }}
                    className="input h-9 w-28 text-end text-sm font-bold" />
                ) : (
                  <button type="button" disabled={!canPrice || busy === p.id} onClick={() => { playTap(); setEdit({ id: p.id, v: String(p.sell_price ?? "") }); }}
                    className={cn("rounded-lg px-2 py-1 font-display text-sm font-extrabold tabular-nums transition", canPrice && "hover:bg-surface-2",
                      (Number(p.sell_price) || 0) > 0 ? "text-ink" : "text-danger-600")}>
                    {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : (Number(p.sell_price) || 0) > 0 ? money(Number(p.sell_price)) : t("sb.noPrice", "بلا سعر")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
