import { useMemo, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { EyeOff, ExternalLink, MonitorSmartphone } from "lucide-react";
import type { PhotoProduct, StoreSection } from "@/types";
import { categoryLook, productImageUrl, shelfLabel, shelfLook, storeUrl } from "@/lib/storeLib";
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
 *
 * ── وهي مرآةُ `Storefront` لا تصميمٌ ثانٍ (#43) ─────────────────────────────
 * كانت تعرض صفَّ «مختارات» منفصلاً يكرّر المميّزَ ثمّ تعيده بالشبكة، والمتجرُ الحقيقيّ أسقط هذا
 * الصفَّ عمداً (كلُّ مختارٍ كان يظهر مرّتين ويدفع أوّلَ منتجٍ خارج الشاشة) وصار يعلّمه **داخل**
 * الشبكة بشارة «اختيار العيادة» والنافدَ بـ«نافد حالياً». فالمديرُ الذي يرتّب مختاراته كان يحكم
 * على شكلٍ لا يراه زبون. الآن: نفسُ الشبكة ونفسُ الشارتين (بنفس مفاتيح `sf.*`)، ونفسُ قواعد
 * الشرائح (الكلّ بلا عدد، القسمُ بعدده، «منتجات أخرى» إن وُجد ما بلا قسم، وشريطُ الفئات حين لا
 * أقسام)، ونفسُ الترتيب (النافدُ آخراً ثمّ المختارُ أوّلاً). ومتجرٌ مطفأٌ يُقال: الزبونُ لا يرى شيئاً.
 * ==========================================================================*/

const OTHERS = "__others";

export function CustomerPreview({ rows, sections, today, storeSlug, onClose }: {
  rows: PhotoProduct[];
  sections: StoreSection[];
  today: string;
  /** رابطُ المتجر **إن كان مشغَّلاً** — StoreBoard يمرّره بشرط التشغيل، فـ`null` = الزبونُ لا يرى شيئاً. */
  storeSlug: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const storeOn = !!storeSlug;
  const [sec, setSec] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const order = useMemo(() => new Map(sections.map((s, i) => [s.id, i])), [sections]);
  const shown = useMemo(() => sortBoard(rows.filter((p) => p.store_visible && hasPrice(p) && !isExpired(p, today)), "shelf", today, order), [rows, today, order]);
  const inSection = (p: PhotoProduct) => !!p.store_section_id && order.has(p.store_section_id);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of shown) if (p.store_section_id && order.has(p.store_section_id)) m.set(p.store_section_id, (m.get(p.store_section_id) ?? 0) + 1);
    return m;
  }, [shown, order]);
  // شروطُ الشريط شروطُ store_front: القسمُ الفعّالُ الذي فيه معروض، و«منتجات أخرى» إن وُجد ما بلا قسم.
  const bar = sections.filter((s) => counts.has(s.id));
  const hasOthers = bar.length > 0 && shown.some((p) => !inSection(p));
  const cats = useMemo(() => [...new Set(shown.map((p) => p.category ?? "other"))], [shown]);
  /* النافدُ آخراً دائماً ثمّ المختارُ أوّلاً — مرآةُ `Storefront` (فرزُه المعتاد فوق ترتيب الخادم). */
  const grid = shown
    .filter((p) => (cat === "all" || (p.category ?? "other") === cat)
      && (sec === "all" || (sec === OTHERS ? !inSection(p) : p.store_section_id === sec)))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(isOut(a.p)) - Number(isOut(b.p)) || Number(!!b.p.store_featured) - Number(!!a.p.store_featured) || a.i - b.i)
    .map((x) => x.p);

  return (
    <Dialog open onClose={onClose} size="xl" title={t("sb.preview", "شوف المتجر كزبون")}
      description={t("sb.pv.sub", "هيچ راح يشوف الزبون المتجر: {{n}} منتج معروض", { n: formatNum(shown.length) })}>
      {/* بلا حشوةٍ ثانية (#45): Dialog يحشو محتواه أصلاً، والحشوةُ المكرّرة كانت تأكل ٤٨ بكسل من
          عرض شاشة ٣٦٠ — بطاقاتُ العمودين تنضغط لـ١٢٧ بكسل. */}
      <div className="space-y-4" data-preview>
        {!storeOn && (
          <p className="flex items-start gap-2 rounded-xl border border-warn-300 bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200" data-preview-off>
            <EyeOff size={14} className="mt-0.5 shrink-0" />
            {t("sb.pv.off", "المتجر مطفأ — الزبون ما يشوف شي حالياً. هذي المعاينة حتى ترتّبه قبل ما تشغّله.")}
          </p>
        )}
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
          <div className="mx-auto max-w-3xl space-y-3">
            {bar.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-preview-sections>
                <Chip active={sec === "all"} onClick={() => setSec("all")} label={t("sf.all", "الكل")} />
                {bar.map((s) => (
                  <Chip key={s.id} active={sec === s.id} onClick={() => setSec(s.id)} label={`${s.name} · ${formatNum(counts.get(s.id) ?? 0)}`} />
                ))}
                {hasOthers && <Chip active={sec === OTHERS} onClick={() => setSec(OTHERS)} label={t("sf.others", "منتجات أخرى")} />}
              </div>
            ) : cats.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <Chip active={cat === "all"} onClick={() => setCat("all")} label={t("sf.all", "الكل")} />
                {cats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={categoryLook(c).label} />)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {grid.map((p) => <PreviewCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={() => { playTap(); onClick(); }}
      className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
        active ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
      {label}
    </button>
  );
}

/** بطاقةُ `Storefront` بلا زرّ الإضافة: البلاطةُ أرضاً، والمصغّرُ فوقها (فشلُه يرجع للكاملة ثمّ
 *  يكشف البلاطة)، والشارةُ بالزاوية (النافدُ أولى من المختار)، ثمّ الاسمُ والوصفُ والفرعُ والسعر. */
function PreviewCard({ p }: { p: PhotoProduct }) {
  const { t } = useTranslation();
  const full = productImageUrl(p.image_path);
  const src = productImageUrl(thumbOf(p.image_path, p.image_meta as ImageMeta | null)) ?? full;
  const out = isOut(p);
  const shelf = shelfLook(p.name);
  const onError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (full && e.currentTarget.dataset.full !== "1" && e.currentTarget.src !== full) { e.currentTarget.dataset.full = "1"; e.currentTarget.src = full; return; }
    e.currentTarget.hidden = true;
  };
  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-1", out && "opacity-60")} data-preview-card>
      <div className={cn("relative grid aspect-square place-items-center overflow-hidden", shelf.tile)}>
        <span className={cn("px-2 text-center font-display text-base font-bold leading-tight", shelf.ink)}>{shelfLabel(p.name)}</span>
        {src && <img key={src} src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-1.5" onError={onError} />}
      </div>
      {out ? (
        <span className="absolute start-2 top-2 rounded-lg bg-ink/75 px-2 py-0.5 text-2xs font-semibold text-white">{t("sf.out", "نافد حالياً")}</span>
      ) : p.store_featured ? (
        <span className="absolute start-2 top-2 rounded-lg bg-surface-1/95 px-2 py-0.5 text-2xs font-semibold text-ink-muted shadow-soft">{t("sf.pick", "اختيار العيادة")}</span>
      ) : null}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{p.name}</p>
        {p.store_desc && <p className="line-clamp-2 text-2xs leading-relaxed text-ink-subtle">{p.store_desc}</p>}
        {p.subcategory && <span className="self-start rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{p.subcategory}</span>}
        <p className="mt-auto pt-1.5 font-display text-base font-bold tabular-nums text-ink">{money(Number(p.sell_price) || 0)}</p>
      </div>
    </div>
  );
}
