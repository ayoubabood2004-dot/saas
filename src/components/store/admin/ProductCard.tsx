import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Barcode, Boxes, Camera, Eye, EyeOff, ImagePlus, Pencil, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Product } from "@/types";
import { cardImagePath, catGlyph, productImageUrl, shelfLabel, shelfLook } from "@/lib/storeLib";
import { playTap } from "@/lib/sounds";
import { cn, formatNum, money } from "@/lib/utils";

/* ============================================================================
 * بطاقةُ منتجٍ بتشكيلة المتجر (متجر v1) — رفيقةُ «المتجر الإلكتروني».
 *
 * كانت الصورةُ مصغّرةً ٤٤ بكسل بصفٍّ نصّيّ: الدكتورُ لا يرى ما يراه زبونُه، فصورةٌ مقلوبةٌ أو
 * بنصفها طاولةٌ تبقى بالمتجر. الآن الصورةُ مربّعٌ كامل (`object-contain` — لا قصَّ) هو نفسُه
 * الزرّ: يفتح المحرّر، والسحبُ عليه يفتحه على الملفّ، وCtrl+V على البطاقة المؤشَّر عليها كذلك.
 * والمصغّرةُ (`cardImagePath`) هي ما يُنزَّل هنا — الكاملةُ بورقة التفاصيل وحدها.
 * ==========================================================================*/

export interface CardCat { id: string; name: string; icon: string }

export function ProductCard({ p, picked, onPick, busy, bulkBusy, cats, canPrice, onPhoto, onLib, onToggle, onFeatured, onDetails, onPrice, onArm, codeHit = null }: {
  p: Product;
  /** الرمزُ الذي طابق البحثَ حين لم يطابق الاسم (0243) — يُقال على البطاقة كي لا تبدو نتيجةً عشوائية. */
  codeHit?: string | null;
  picked: boolean;
  onPick: (v: boolean) => void;
  busy: boolean;
  bulkBusy: boolean;
  /** تصنيفاتُ المنتج الحيّة بترتيب العيادة. */
  cats: CardCat[];
  canPrice: boolean;
  onPhoto: (file: File | null) => void;
  onLib: () => void;
  onToggle: () => void;
  onFeatured: () => void;
  onDetails: () => void;
  onPrice: (draft: string) => void;
  /** «هذه البطاقةُ المقصودة» للصق (Ctrl+V) — بالمرور أو التركيز. */
  onArm: () => void;
}) {
  const { t } = useTranslation();
  const [pricing, setPricing] = useState(false);
  const [draft, setDraft] = useState("");
  const out = p.stock <= 0 && !p.pooled;
  const look = shelfLook(p.name);
  const commit = () => { setPricing(false); onPrice(draft); };
  return (
    <div onMouseEnter={onArm} onFocus={onArm} data-catcard
      className={cn("card flex flex-col overflow-hidden p-0 transition",
        p.store_visible && "border-brand-300 dark:border-brand-500/40", picked && "ring-2 ring-brand-400")}>
      <div className="relative">
        <button type="button" onClick={() => { playTap(); onPhoto(null); }} disabled={busy} data-catphoto
          onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
          onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); onPhoto(f); } }}
          title={p.image_path ? t("cat.photoEdit", "بدّل صورة المنتج") : t("cat.photoAdd", "أضف صورة للمنتج")}
          className={cn("group relative block aspect-square w-full overflow-hidden transition",
            p.image_path ? "bg-white" : cn("border-b border-dashed border-line-strong", look.tile))}>
          {p.image_path
            ? <img src={productImageUrl(cardImagePath(p.image_path)) ?? ""} alt="" loading="lazy" className="h-full w-full object-contain p-2"
                onError={(e) => { const u = productImageUrl(p.image_path); if (u && e.currentTarget.src !== u) e.currentTarget.src = u; else e.currentTarget.hidden = true; }} />
            : <span className={cn("flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center font-display text-base font-extrabold leading-snug", look.ink)}>
                {shelfLabel(p.name)}
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-1/80 px-2.5 py-1 text-2xs font-bold text-ink-muted"><ImagePlus size={13} /> {t("cat.photoAddShort", "أضف صورة")}</span>
              </span>}
          <span className="absolute inset-0 grid place-items-center bg-ink/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {p.image_path ? <Camera size={22} /> : <ImagePlus size={22} />}
          </span>
        </button>
        <label className="absolute start-2 top-2 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-surface-1/90 shadow-soft">
          <input type="checkbox" checked={picked} disabled={bulkBusy} onChange={(e) => { playTap(); onPick(e.target.checked); }}
            aria-label={t("cat.pickOne", "اختر {{name}}", { name: p.name })} className="h-4 w-4 accent-brand-600" />
        </label>
        {p.store_visible && (
          <button type="button" onClick={onFeatured} disabled={busy} data-featstar
            title={p.store_featured ? t("sf.featOff", "شيله من المختارات") : t("sf.featOn", "خلّيه بصفّ المختارات أعلى المتجر")}
            className={cn("absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full shadow-soft transition active:scale-95",
              p.store_featured ? "bg-warn-100 text-warn-700 dark:bg-warn-500/30 dark:text-warn-100" : "bg-surface-1/90 text-ink-subtle hover:text-ink")}>
            <Sparkles size={14} />
          </button>
        )}
        <button type="button" onClick={() => { playTap(); onLib(); }} data-catlib
          title={t("pos.photoFromLib", "اختر من المكتبة")} aria-label={t("pos.photoFromLib", "اختر من المكتبة")}
          className="absolute bottom-2 end-2 grid h-8 w-8 place-items-center rounded-full bg-surface-1/90 text-ink-subtle shadow-soft transition hover:text-ink">
          <Boxes size={14} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink" title={p.name} dir="auto">{p.name}</p>
        {codeHit && (
          <span data-cardcode className="inline-flex max-w-full items-center gap-1 self-start truncate rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" dir="ltr">
            <Barcode size={11} className="shrink-0" /> <span className="truncate">{codeHit}</span>
          </span>
        )}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1" data-cardcats>
            {cats.slice(0, 2).map((c) => (
              <span key={c.id} className="inline-flex max-w-full items-center gap-0.5 truncate rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
                <span aria-hidden>{catGlyph(c.icon)}</span> <span className="truncate">{c.name}</span>
              </span>
            ))}
            {cats.length > 2 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-subtle">+{formatNum(cats.length - 2)}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-1">
          {pricing ? (
            <input autoFocus type="number" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)}
              onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setPricing(false); }}
              aria-label={t("cat.priceLabel", "السعر")} className="input h-8 w-full text-end text-sm font-bold" />
          ) : canPrice ? (
            <button type="button" onClick={() => { playTap(); setDraft(String(p.sell_price)); setPricing(true); }} data-catprice
              title={t("cat.priceEdit", "اضغط لتعديل السعر")} className="group flex items-center gap-1 rounded-lg px-1 py-0.5 transition hover:bg-surface-2">
              <span className="font-display text-sm font-extrabold tabular-nums text-ink">{money(p.sell_price)}</span>
              <Pencil size={11} className="text-ink-subtle opacity-60 group-hover:opacity-100" />
            </button>
          ) : (
            <span className="px-1 font-display text-sm font-extrabold tabular-nums text-ink">{money(p.sell_price)}</span>
          )}
          {!pricing && (
            <span className={cn("shrink-0 text-2xs", out ? "font-bold text-danger-500" : "text-ink-subtle")}>
              {out ? t("cat.outOfStock", "نافد") : t("cat.stockN", "المخزون: {{n}}", { n: formatNum(p.stock) })}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={onToggle} disabled={busy} data-catvisible
            className={cn("flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-extrabold transition active:scale-95",
              p.store_visible ? "bg-brand-600 text-white shadow-soft" : "border border-line text-ink-muted hover:bg-surface-2")}>
            {p.store_visible ? <Eye size={13} /> : <EyeOff size={13} />}
            {p.store_visible ? t("cat.fShown", "معروض") : t("cat.fHidden", "مخفي")}
          </button>
          <button type="button" onClick={() => { playTap(); onDetails(); }} data-catdetails
            className="flex items-center justify-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-2">
            <SlidersHorizontal size={13} /> {t("cat.details", "تفاصيل")}
          </button>
        </div>
      </div>
    </div>
  );
}
