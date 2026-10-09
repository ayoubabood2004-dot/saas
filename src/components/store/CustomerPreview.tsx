import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, ImageOff, MonitorSmartphone, Star } from "lucide-react";
import type { PhotoProduct, StoreSection } from "@/types";
import { productImageUrl, storeUrl } from "@/lib/storeLib";
import { cn, formatNum, money } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { Dialog } from "@/components/ui";
import { hasPrice, isExpired, isOut, sortBoard } from "@/lib/storeBoard";
import { thumbOf, type ImageMeta } from "@/lib/productPhoto";

/* ============================================================================
 * «شوف المتجر كزبون» (0229) — قبل أن يُعطى الرابطُ لأحد.
 *
 * من بيانات اللوحة نفسها لا من الكتلوج العام: المصوّرُ ممنوعٌ من store_catalog
 * بالبوّابة، والمتجرُ المطفأ لا يُعرض للزبون أصلاً — والمعاينةُ لازمةٌ قبل التفعيل
 * بالذات. فالشروطُ شروطُ store_catalog2 حرفاً (منشور، سعرٌ موجب، غيرُ منتهٍ)،
 * والترتيبُ ترتيبُها (`sortBoard(…, "shelf")`): المميّزُ ثمّ الأقسامُ ثمّ الاسم.
 * ==========================================================================*/

export function CustomerPreview({ rows, sections, today, storeSlug, onClose }: {
  rows: PhotoProduct[];
  sections: StoreSection[];
  today: string;
  storeSlug: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sec, setSec] = useState<string | "all" | "none">("all");
  const order = useMemo(() => new Map(sections.map((s, i) => [s.id, i])), [sections]);
  const shown = useMemo(() => sortBoard(rows.filter((p) => p.store_visible && hasPrice(p) && !isExpired(p, today)), "shelf", today, order), [rows, today, order]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of shown) if (p.store_section_id && order.has(p.store_section_id)) m.set(p.store_section_id, (m.get(p.store_section_id) ?? 0) + 1);
    return m;
  }, [shown, order]);
  const bar = sections.filter((s) => counts.has(s.id));
  const others = shown.filter((p) => !(p.store_section_id && order.has(p.store_section_id)));
  // النافدُ آخراً دائماً — مرآةُ Storefront (يبقى ظاهراً ولا يتصدّر الرفّ).
  const grid = (sec === "all" ? shown : sec === "none" ? others : shown.filter((p) => p.store_section_id === sec))
    .map((p, i) => ({ p, i })).sort((a, b) => Number(isOut(a.p)) - Number(isOut(b.p)) || a.i - b.i).map((x) => x.p);
  const featured = shown.filter((p) => p.store_featured);

  return (
    <Dialog open onClose={onClose} size="xl" title={t("sb.preview", "شوف المتجر كزبون")}
      description={t("sb.pv.sub", "هيچ يطلع المتجر للزبون بالضبط: {{n}} منتج معروض", { n: formatNum(shown.length) })}>
      <div className="space-y-4 px-6 pb-6" data-preview>
        {storeSlug && (
          <a href={storeUrl(storeSlug)} target="_blank" rel="noreferrer" onClick={() => playTap()}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-surface-2">
            <ExternalLink size={13} /> {t("sb.pv.openReal", "افتح المتجر الحقيقي")}
          </a>
        )}
        {shown.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-12 text-center text-sm font-semibold text-ink-subtle">
            <MonitorSmartphone size={30} className="opacity-40" />
            {t("sb.pv.empty", "الزبون راح يشوف رف فارغ — انشر منتجات عليها صورة وسعر أوّل.")}
          </p>
        ) : (
          <>
            {bar.length > 0 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {([["all", t("sb.pv.all", "الكل"), shown.length] as const, ...bar.map((s) => [s.id, s.name, counts.get(s.id) ?? 0] as const),
                  ...(others.length ? [["none", t("sb.pv.others", "منتجات أخرى"), others.length] as const] : [])]).map(([id, name, n]) => (
                  <button key={id} type="button" onClick={() => { playTap(); setSec(id); }}
                    className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                      sec === id ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted")}>
                    {name} <span className="opacity-70 tabular-nums">{formatNum(n)}</span>
                  </button>
                ))}
              </div>
            )}
            {sec === "all" && featured.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><Star size={15} className="fill-warn-400 text-warn-500" /> {t("sb.pv.featured", "مختارات")}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {featured.map((p) => <PreviewCard key={p.id} p={p} today={today} compact />)}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {grid.map((p) => <PreviewCard key={p.id} p={p} today={today} />)}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function PreviewCard({ p, today, compact }: { p: PhotoProduct; today: string; compact?: boolean }) {
  const { t } = useTranslation();
  void today;
  const full = productImageUrl(p.image_path);
  const src = productImageUrl(thumbOf(p.image_path, p.image_meta as ImageMeta | null)) ?? full;
  const out = isOut(p);
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-soft", compact && "w-36 shrink-0", out && "opacity-70")}>
      <div className="grid aspect-square place-items-center bg-surface-2">
        {src ? <img src={src} alt={p.name} loading="lazy" className="h-full w-full object-contain"
          onError={(e) => { if (full && e.currentTarget.src !== full) e.currentTarget.src = full; }} />
          : <ImageOff size={24} className="text-ink-subtle" />}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-xs font-bold text-ink">{p.name}</p>
        {!compact && p.store_desc && <p className="line-clamp-2 text-2xs leading-relaxed text-ink-subtle">{p.store_desc}</p>}
        <div className="flex items-center gap-1.5">
          <p className="font-display text-sm font-extrabold tabular-nums text-ink">{money(Number(p.sell_price) || 0)}</p>
          {out && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-bold text-ink-muted">{t("sb.out", "نافد")}</span>}
        </div>
      </div>
    </div>
  );
}
