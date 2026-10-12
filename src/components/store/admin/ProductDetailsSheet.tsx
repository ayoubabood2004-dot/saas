import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Camera, Eye, EyeOff, ImagePlus, Sparkles } from "lucide-react";
import type { Product } from "@/types";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import type { CatRow } from "@/lib/storeCatIndex";
import { catGlyph, productImageUrl, shelfLabel, shelfLook } from "@/lib/storeLib";
import { playTap } from "@/lib/sounds";
import { cn, money } from "@/lib/utils";

/* ============================================================================
 * ورقةُ تفاصيل منتجٍ بالمتجر (متجر v1) — رفيقةُ «المتجر الإلكتروني».
 *
 * الوصفُ كان سطراً واحداً بسقف ١٢٠ حرفاً — والقاعدةُ تقبل ألفين منذ 0228: الشاشةُ وحدها كانت
 * السقف. هنا نصٌّ بأسطرٍ وعدّادٌ «/٢٠٠٠»، والصورةُ **الكاملة** (لا المصغّرة) كما ستُرى بورقة
 * الزبون، وتصنيفاتُ المنتج بتأشير — والحفظُ نداءٌ واحدٌ للتصنيفات (ذرّيّ) ونداءٌ للوصف.
 * ==========================================================================*/

export const DESC_MAX = 2000;

export function ProductDetailsSheet({ p, onClose, live, catsOf, canEditCats, canPrice, onPhoto, onLib, onToggle, onFeatured, onPrice, onSave, busy }: {
  p: Product | null;
  onClose: () => void;
  /** التصنيفاتُ الحيّة بترتيب العيادة. */
  live: CatRow[];
  catsOf: (pid: string) => string[];
  /** لا تصنيفات بعد (لم تُبذر/فشلت القراءة): القسمُ يقول ذلك ولا يكتب. */
  canEditCats: boolean;
  canPrice: boolean;
  onPhoto: () => void;
  onLib: () => void;
  onToggle: () => void;
  onFeatured: () => void;
  onPrice: (draft: string) => void;
  /** يحفظ ما تغيّر وحده (غائبٌ = لم يتغيّر؛ desc: null = مُسح) — والفشلُ يقوله المستدعي. */
  onSave: (change: { desc?: string | null; cats?: string[] }) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [desc, setDesc] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const pid = p?.id ?? null;
  /* تُزرع مرّةً لكلّ منتجٍ يُفتح — لا مع كلّ لقطة، وإلا محا رجوعُ التبويب ما يُكتب الآن. */
  useEffect(() => {
    if (!p) return;
    setDesc(p.store_desc ?? "");
    setSel(new Set(catsOf(p.id)));
    setPrice(String(p.sell_price ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  if (!p) return <Modal open={false} onClose={onClose} title=""><span /></Modal>;
  const before = new Set(catsOf(p.id));
  const catsChanged = before.size !== sel.size || [...sel].some((id) => !before.has(id));
  const descNext = desc.trim() ? desc.replace(/\s+$/, "") : null;
  const descChanged = (descNext ?? null) !== (p.store_desc ?? null);
  const look = shelfLook(p.name);
  const save = async () => {
    setSaving(true);
    try { await onSave({ ...(descChanged ? { desc: descNext } : {}), ...(catsChanged ? { cats: [...sel] } : {}) }); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={!!p} onClose={onClose} title={p.name} size="wide">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr)]" data-catsheet>
        <div className="space-y-2">
          <div className={cn("relative overflow-hidden rounded-2xl border border-line", p.image_path ? "bg-white" : look.tile)}>
            {p.image_path
              ? <img src={productImageUrl(p.image_path) ?? ""} alt={p.name} className="aspect-square max-h-[50vh] w-full object-contain p-2" />
              : <div className={cn("grid aspect-square max-h-[50vh] w-full place-items-center p-4 text-center font-display text-xl font-extrabold", look.ink)}>{shelfLabel(p.name)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" leftIcon={p.image_path ? <Camera size={14} /> : <ImagePlus size={14} />} onClick={() => { playTap(); onPhoto(); }}>
              {p.image_path ? t("cat.photoEdit", "بدّل صورة المنتج") : t("cat.photoAdd", "أضف صورة للمنتج")}
            </Button>
            <Button size="sm" variant="outline" leftIcon={<Boxes size={14} />} onClick={() => { playTap(); onLib(); }}>{t("pos.photoFromLib", "اختر من المكتبة")}</Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-ink-muted">
              <span>{t("cat.descLabel", "وصف يشوفه الزبون")}</span>
              <span className={cn("tabular-nums", desc.length > DESC_MAX * 0.9 ? "text-warn-600" : "text-ink-subtle")} data-desccount dir="ltr">{desc.length}/{DESC_MAX}</span>
            </label>
            <textarea rows={6} value={desc} maxLength={DESC_MAX} onChange={(e) => setDesc(e.target.value)} data-catdesc
              placeholder={t("cat.descPh", "شنو هذا المنتج؟ لمن يناسب؟ الحجم، الطريقة… (اختياري)")}
              className="input min-h-[8rem] resize-y text-sm leading-relaxed" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPrice ? (
              <label className="flex items-center gap-2 text-xs font-bold text-ink-muted">
                {t("cat.priceLabel", "السعر")}
                <input type="number" inputMode="decimal" min={0} value={price} onChange={(e) => setPrice(e.target.value)}
                  onBlur={() => onPrice(price)} onKeyDown={(e) => { if (e.key === "Enter") onPrice(price); }}
                  className="input h-9 w-28 text-end text-sm font-bold" data-sheetprice />
              </label>
            ) : (
              <span className="text-sm font-extrabold tabular-nums text-ink">{money(p.sell_price)}</span>
            )}
            <button type="button" onClick={onToggle} disabled={busy}
              className={cn("ms-auto flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition active:scale-95",
                p.store_visible ? "bg-brand-600 text-white shadow-soft" : "border border-line text-ink-muted hover:bg-surface-2")}>
              {p.store_visible ? <Eye size={14} /> : <EyeOff size={14} />}
              {p.store_visible ? t("cat.fShown", "معروض") : t("cat.fHidden", "مخفي")}
            </button>
            {p.store_visible && (
              <button type="button" onClick={onFeatured} disabled={busy}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition active:scale-95",
                  p.store_featured ? "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-200" : "border border-line text-ink-muted hover:bg-surface-2")}>
                <Sparkles size={14} /> {p.store_featured ? t("sf.featOff", "شيله من المختارات") : t("sf.featOn", "خلّيه بصفّ المختارات أعلى المتجر")}
              </button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-ink-muted">{t("cat.sheetCats", "تصنيفاته بالمتجر")}</p>
            {!canEditCats || live.length === 0 ? (
              <p className="text-xs text-ink-subtle">{t("cat.sheetNoCats", "ما اكو تصنيفات بعد — ابدأها من تبويب «التصنيفات».")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5" data-sheetcats>
                {live.map((c) => {
                  const on = sel.has(c.id);
                  return (
                    <label key={c.id} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      on ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink-muted hover:bg-surface-2")}>
                      <input type="checkbox" checked={on} className="h-3.5 w-3.5 accent-brand-600"
                        onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })} />
                      <span aria-hidden>{catGlyph(c.icon)}</span> {c.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={() => void save()} loading={saving} disabled={!descChanged && !catsChanged} data-sheetsave>
            {t("cat.save", "احفظ")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
