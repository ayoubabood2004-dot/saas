import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, Camera, Check, Eye, EyeOff, ImageOff, Images, Library, Loader2, Maximize2, Sparkles, Star, Trash2,
} from "lucide-react";
import type { PhotoProduct, PriceReviewRow, StorePublishResult, StoreSection } from "@/types";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { refreshMyPermissions } from "@/lib/staff";
import { priceDoubt, pricePatchFrom, refusedByRole, staleWrite, type PriceDoubt } from "@/lib/storePrice";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatDate, formatNum, money } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, Dialog, useToast } from "@/components/ui";
import { ImageLightbox } from "@/components/ImageLightbox";
import { DESC_MAX, hideRisk, isExpired, isOut, readiness } from "@/lib/storeBoard";
import { metaOf, thumbOf, uploadedAt, type ImageMeta } from "@/lib/productPhoto";
import type { usePhotoFlow } from "./usePhotoFlow";
import { missText, publishToast } from "./publishToast";

/* ============================================================================
 * بطاقةُ المنتج الكاملة (0229) — كلُّ ما يخصّ المنتجَ بالمتجر بمكانٍ واحد:
 * الصورةُ وتفاصيلُها، النشرُ بقائمة جاهزيّته، المميّز، السعرُ وآخرُ تغييرٍ عليه،
 * القسمُ، والوصفُ مع معاينته كما يراه الزبون. كلُّ حقلٍ يُحفظ بزرّه ويقول نتيجتَه.
 * ==========================================================================*/

export function PhotoDetails({ path, meta }: { path: string | null; meta: ImageMeta | null }) {
  const { t } = useTranslation();
  const m = metaOf(path, meta);
  const at = uploadedAt(path);
  if (!path) return <p>{t("sb.det.none", "بلا صورة")}</p>;
  const src = m?.src ?? (path.startsWith("library/") ? "library" : null);
  const srcLabel = src === "camera" ? t("sb.det.camera", "كاميرا") : src === "album" ? t("sb.det.album", "ألبوم") : src === "library" ? t("sb.det.library", "مكتبة الصور") : null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
      {m && <><dt className="opacity-70">{t("sb.det.dims", "الأبعاد")}</dt><dd dir="ltr" className="text-end">{formatNum(m.w)}×{formatNum(m.h)}</dd></>}
      {m && <><dt className="opacity-70">{t("sb.det.size", "الحجم")}</dt><dd className="text-end">{t("sb.det.kb", "{{n}} ك.ب", { n: formatNum(Math.round(m.bytes / 1024)) })}</dd></>}
      {at && <><dt className="opacity-70">{t("sb.det.at", "انرفعت")}</dt><dd className="text-end">{formatDate(at.toISOString(), "ar")}</dd></>}
      {srcLabel && <><dt className="opacity-70">{t("sb.det.src", "المصدر")}</dt><dd className="text-end">{srcLabel}</dd></>}
      {m?.thumb && <><dt className="opacity-70">{t("sb.det.thumb", "نسخة المتجر")}</dt><dd className="text-end">{t("sb.det.thumbYes", "صغيرة وسريعة ✓")}</dd></>}
      {!m && !path.startsWith("library/") && (
        <dd className="col-span-2 opacity-80">{t("sb.det.old", "صورة قديمة (قبل التحديث) — الأفضل تتصوّر من جديد بالدقة العالية.")}</dd>
      )}
    </dl>
  );
}

export function ProductSheet({ row, sections, canStore, canPrice, priceViaStore, hideCost, today, flow, price, loadPrices, onClose, onPatch, onPublish, onStale }: {
  row: PhotoProduct;
  sections: StoreSection[];
  canStore: boolean;
  canPrice: boolean;
  priceViaStore: boolean;
  /** جهازٌ مقفولٌ بوضع الاستقبال أو المصوّر: لا «تحت الكلفة» أبداً — علامةٌ تنقلب مع كلّ سعرٍ
   *  يُجرَّب تكشف الكلفةَ بالتجريب (0154، 0229). */
  hideCost: boolean;
  today: string;
  flow: ReturnType<typeof usePhotoFlow>;
  price: PriceReviewRow | null;
  /** يجدّد خريطةَ «آخر تغيير» بعد حفظ سعرٍ هنا — بلاه تبقى الخريطةُ على التغيير السابق. */
  loadPrices?: () => Promise<void>;
  onClose: () => void;
  onPatch: (id: string, p: Partial<PhotoProduct>) => void;
  onPublish: (ids: string[], on: boolean) => Promise<StorePublishResult | null>;
  /** الصفُّ المعروض قديم (price_moved، منتجٌ لم يعد) — اللوحةُ تعيد القراءة. */
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [desc, setDesc] = useState(row.store_desc ?? "");
  const [priceDraft, setPriceDraft] = useState(row.sell_price ? String(row.sell_price) : "");
  /** سعرٌ مشبوهٌ ينتظر تأكيداً صريحاً (رمزٌ ممسوح، أو قفزةٌ فوق عشرة أضعاف). */
  const [priceAsk, setPriceAsk] = useState<{ v: number; doubt: PriceDoubt } | null>(null);
  /** رُفض الحفظُ بـprice_moved على هذا السعر — حين يصل الجديدُ بإعادة القراءة يُقال بالرقم. */
  const [movedFrom, setMovedFrom] = useState<{ was: number | null } | null>(null);
  /** «آخر تغيير» لما حُفظ هنا للتوّ — يُعرض حتى تصل الخريطةُ المجدَّدة (`basis` ما كانت عليه). */
  const [justSaved, setJustSaved] = useState<{ line: PriceReviewRow; basis: PriceReviewRow | null } | null>(null);
  /* بطاقةٌ مفتوحة ومنتجُها تغيّر من مكانٍ آخر (صورةٌ انرفعت، سعرٌ انحفظ): المسوّداتُ تتبع ما
   * لم يُلمس — حقلٌ بدأ المستخدمُ يكتبه لا يُداس. */
  useEffect(() => { setDesc((d) => (d === "" || d === (row.store_desc ?? "") ? row.store_desc ?? "" : d)); }, [row.store_desc]);
  useEffect(() => { setPriceDraft(row.sell_price ? String(row.sell_price) : ""); setPriceAsk(null); }, [row.sell_price]);
  // خريطةٌ جديدةٌ وصلت ⇒ هي الحكم؛ وفشلُ تجديدها (null) لا يمحو ما حُفظ فعلاً.
  useEffect(() => { setJustSaved((s) => (s && price && price !== s.basis ? null : s)); }, [price]);
  const lastChange = justSaved?.line ?? price;

  const full = productImageUrl(row.image_path);
  const thumb = productImageUrl(thumbOf(row.image_path, row.image_meta as ImageMeta | null));
  const r = readiness(row, today, sections.length > 0);
  const expired = isExpired(row, today);
  const sectionName = sections.find((s) => s.id === row.store_section_id)?.name ?? null;
  const photoBusy = flow.busyId === row.id;
  const missingText = r.missing.map((m) => missText(t, m)).join(t("sb.sep", "، "));

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); }
    catch (e) {
      playWarning();
      const stale = staleWrite(e);
      if (stale === "price_moved") {
        // ما رآه المستخدمُ ليس ما بالقاعدة: اللوحةُ تعيد القراءة، والسعرُ الجديدُ يُقال حين يصل.
        setMovedFrom({ was: row.sell_price ?? null });
        toast.error(t("sb.saveFailed", "ما انحفظ — أعد المحاولة"), t("sb.priceMoved", "السعر تغيّر من جهاز ثاني (مثلاً رفع أسعار) — ما انحفظ شي. حدّثنا القائمة: شوف السعر الجديد وعدّل عليه."));
      } else {
        toast.error(t("sb.saveFailed", "ما انحفظ — أعد المحاولة"), describeDbError(e, t));
      }
      if (stale) onStale();
      // الإذنُ سُحب والشاشةُ مفتوحة: الخبيئةُ تُجدَّد فتختفي الأزرارُ التي لم تعد له.
      if (refusedByRole(e)) void refreshMyPermissions(user?.email);
    }
    finally { setBusy(null); }
  };

  /* الإخفاءُ بلا شرط والنشرُ بشروطه (0229): منشورٌ ناقصٌ (بلا صورة — ٩٩ من ١١٣ بأكبر متجر —
   * أو بلا سعر أو منتهٍ) إذا انخفى ما يرجع إلا لمن يكمل. فيُقال قبل الضغطة الثانية لا بعدها،
   * وبالسطر نفسه لا بنافذة متصفّحٍ تُقبل بلا قراءة. والتعريفُ واحدٌ للمسارات الثلاثة (البطاقةُ
   * والجماعيُّ وهنا): `hideRisk`. */
  const risky = hideRisk(row, today);
  // اكتمل الناقصُ والسؤالُ مفتوح (صوّره من هذي البطاقة، أو سعّره): السؤالُ يزول وزرُّ الإخفاء يرجع —
  // كان يبقى معطّلاً بلا سببٍ ظاهر وبلا «خلّيه منشور» يفكّه، فلا إخفاءَ إلا بإغلاق البطاقة.
  useEffect(() => { if (!risky) setConfirmHide(false); }, [risky]);
  const togglePublish = (sure = false) => {
    if (risky && !sure) { playWarning(); setConfirmHide(true); return; }
    setConfirmHide(false);
    return run("pub", async () => {
      const res = await onPublish([row.id], !row.store_visible);
      if (res) publishToast(toast, t, res, !row.store_visible, true);
    });
  };
  const toggleFeatured = () => run("feat", async () => {
    await repo.setStoreFeatured(row.id, !row.store_featured);
    onPatch(row.id, { store_featured: !row.store_featured });
    row.store_featured ? playTap() : playSuccess();
  });
  const saveDesc = () => run("desc", async () => {
    const v = desc.trim() || null;
    if (v === (row.store_desc ?? null)) return;
    await repo.setStoreDesc(row.id, v);
    onPatch(row.id, { store_desc: v });
    playSuccess();
    toast.success(t("sb.descSaved", "انحفظ الوصف"));
  });
  const savePrice = (sure = false) => run("price", async () => {
    // حقلٌ ممسوحٌ ليس صفراً (0228): Number("") = 0 كان يكتب سعرَ الكاشير صفراً.
    if (!priceDraft.trim()) return;
    const v = Math.round(Number(priceDraft) * 100) / 100;
    if (!Number.isFinite(v) || v <= 0) { playWarning(); toast.error(t("sb.badPrice", "السعر لازم رقم أكبر من صفر")); return; }
    if (v === (row.sell_price ?? 0)) return;
    // رمزٌ ممسوحٌ بالحقل ثمّ Enter، أو صفرٌ زائد: يُسأل بزرٍّ صريح — Enter وحدُه لا يؤكّد أبداً.
    const doubt = priceDoubt(priceDraft, v, row.sell_price);
    if (doubt && !(sure && priceAsk?.v === v)) { playWarning(); setPriceAsk({ v, doubt }); return; }
    setPriceAsk(null);
    const was = row.sell_price ?? null;
    let saved = v;
    // بشرط أنّ السعرَ ما زال ما فُتح عليه — رفعُ أسعارٍ أو جهازٌ آخر غيّره ⇒ price_moved لا دَوس.
    if (priceViaStore) {
      await repo.setStorePrice(row.id, v, row.sell_price ?? null);
      onPatch(row.id, { sell_price: v });
    } else {
      // «تحت الكلفة» من الصفّ الراجع (مرآةُ الخادم) — لا تبقى العلامةُ على السعر القديم.
      const patch = pricePatchFrom(await repo.updateProduct(row.id, { sell_price: v }, { sell_price: row.sell_price ?? 0 }), v);
      saved = patch.sell_price;
      onPatch(row.id, patch);
    }
    setMovedFrom(null);
    setJustSaved({ line: { product_id: row.id, changed_at: new Date().toISOString(), old_price: was, new_price: saved, by_name: null, via: "edit" }, basis: price });
    if (loadPrices) void loadPrices().catch(() => { /* swallow-ok: السطرُ المحلّيّ صادقٌ بما حُفظ، و«مراجعة الأسعار» تقول فشلَ جلبها بنفسها */ });
    playSuccess();
    toast.success(t("sb.priceSaved", "انحفظ السعر: {{p}}", { p: money(saved) }));
  });
  const setSection = (sectionId: string | null) => run("sec", async () => {
    if ((row.store_section_id ?? null) === sectionId) return;
    await repo.assignStoreSection([row.id], sectionId);
    onPatch(row.id, { store_section_id: sectionId, store_sort: null });
    playSuccess();
  });

  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} size="lg" title={row.name}
      description={[row.company_name, row.barcode].filter(Boolean).join(" · ") || undefined}>
      <div className="space-y-5" data-product-sheet={row.id}>
        {/* ── الصورة ── */}
        <section className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
          <button type="button" onClick={() => { if (full) { playTap(); setZoom(true); } }} disabled={!full}
            className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2">
            {full
              ? <img src={thumb ?? full} alt={row.name} className="h-full w-full object-contain"
                  onError={(e) => { if (e.currentTarget.src !== full) e.currentTarget.src = full; }} />
              : <span className="flex flex-col items-center gap-1 text-ink-subtle"><ImageOff size={34} /><span className="text-xs font-bold">{t("sb.noPhoto", "بلا صورة")}</span></span>}
            {full && <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-2xs font-bold text-white"><Maximize2 size={12} /> {t("sb.zoom", "كبّر الصورة")}</span>}
            {photoBusy && <span className="absolute inset-0 grid place-items-center bg-surface-1/60"><Loader2 size={24} className="animate-spin text-brand-600" /></span>}
          </button>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => flow.openCamera(row)} disabled={photoBusy} leftIcon={<Camera size={15} />}>
                {full ? t("sb.retake", "صوّر من جديد") : t("sb.p.shoot", "صوّر")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => flow.openAlbum(row)} disabled={photoBusy} leftIcon={<Images size={15} />}>
                {t("sb.p.gallery", "من الألبوم")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => flow.openLibrary(row)} disabled={photoBusy} leftIcon={<Library size={15} />}>
                {t("sb.p.library", "من المكتبة")}
              </Button>
              {full && !confirmRemove && (
                <Button size="sm" variant="ghost" onClick={() => { playTap(); setConfirmRemove(true); }} disabled={photoBusy} leftIcon={<Trash2 size={15} />}>
                  {t("sb.p.remove", "شيل الصورة")}
                </Button>
              )}
            </div>
            {/* الإزالةُ تُقال بما تشيله — لا نافذةَ متصفّحٍ تُقبل بلا قراءة (درسُ «اختفى»). */}
            {confirmRemove && full && (
              <div className="flex items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10" data-remove-confirm>
                <img src={thumb ?? full} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />
                <p className="flex-1 text-xs font-semibold text-danger-700 dark:text-danger-300">
                  {row.store_visible
                    ? t("sb.removeAskShown", "تشيل صورة «{{name}}»؟ المنتج منشور — الزبون راح يشوفه بلا صورة.", { name: row.name })
                    : t("sb.removeAsk", "تشيل صورة «{{name}}»؟", { name: row.name })}
                </p>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" variant="danger" onClick={() => { setConfirmRemove(false); void flow.remove(row); }}>{t("sb.removeYes", "شيلها")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>{t("common.cancel", "إلغاء")}</Button>
                </div>
              </div>
            )}
            <div className="rounded-2xl bg-surface-2 p-3 text-xs text-ink-muted">
              <PhotoDetails path={row.image_path ?? null} meta={(row.image_meta as ImageMeta | null) ?? null} />
            </div>
          </div>
        </section>

        {canStore && (
          <>
            {/* ── النشر بقائمة جاهزيّته ── */}
            <section className="space-y-2 rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-extrabold",
                  row.store_visible ? "bg-success-600 text-white" : "bg-surface-2 text-ink-muted")}>
                  {row.store_visible ? t("sb.badge.shown", "منشور") : t("sb.badge.hidden", "مخفي")}
                </span>
                <Button size="sm" className="ms-auto" variant={row.store_visible ? "outline" : "primary"} loading={busy === "pub"}
                  onClick={() => void togglePublish()} disabled={(!row.store_visible && !r.ok) || (confirmHide && risky)}
                  leftIcon={row.store_visible ? <EyeOff size={15} /> : <Eye size={15} />} data-sheet-publish>
                  {row.store_visible ? t("sb.hideOne", "اخفِ من المتجر") : t("sb.showOne", "انشر بالمتجر")}
                </Button>
                <button type="button" onClick={() => void toggleFeatured()} disabled={busy === "feat" || (!row.store_visible && !row.store_featured)}
                  title={!row.store_visible ? t("sb.featNeedsShown", "المميّز يطلع أعلى المتجر — انشره أوّل") : undefined}
                  className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-40",
                    row.store_featured ? "border-warn-300 bg-warn-50 text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/15 dark:text-warn-200" : "border-line text-ink-muted hover:text-ink")}>
                  <Star size={14} className={row.store_featured ? "fill-current" : ""} /> {row.store_featured ? t("sb.featOn", "مميّز") : t("sb.featOff", "خلّيه مميّز")}
                </button>
              </div>
              {confirmHide && risky && (
                <div className="space-y-2 rounded-2xl border border-warn-300 bg-warn-50 p-3 dark:border-warn-500/40 dark:bg-warn-500/10" data-hide-confirm>
                  <p className="text-xs font-semibold text-warn-700 dark:text-warn-200">
                    {t("sb.hideAsk", "«{{name}}» ناقصه {{what}} — إذا انخفى ما يرجع للمتجر إلا لمن يكمل.", { name: row.name, what: missingText })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="danger" onClick={() => void togglePublish(true)}>{t("sb.hideYes", "اخفِه")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { playTap(); setConfirmHide(false); }}>{t("sb.hideKeep", "خلّيه منشور")}</Button>
                  </div>
                </div>
              )}
              {row.store_featured && !row.store_visible && (
                <p className="text-2xs font-semibold text-warn-700 dark:text-warn-200">{t("sb.featHiddenWarn", "مميّز بس مخفي — ما يطلع للزبون أصلاً. انشره أو شيل التمييز.")}</p>
              )}
              <ul className="grid gap-1 text-xs sm:grid-cols-2">
                {(["photo", "price", "expired"] as const).map((k) => {
                  const bad = r.missing.includes(k);
                  return (
                    <li key={k} className={cn("flex items-center gap-1.5", bad ? "font-bold text-danger-600 dark:text-danger-300" : "text-success-700 dark:text-success-300")}>
                      {bad ? <AlertTriangle size={13} /> : <Check size={13} />}
                      {k === "photo" ? (bad ? t("sb.chk.noPhoto", "بلا صورة — صوّره") : t("sb.chk.photo", "عليه صورة"))
                        : k === "price" ? (bad ? t("sb.chk.noPrice", "بلا سعر") : t("sb.chk.price", "عليه سعر"))
                          : (bad ? t("sb.chk.expired", "منتهي — المتجر ما يعرضه") : t("sb.chk.valid", "صلاحيته سارية"))}
                    </li>
                  );
                })}
                {r.warn.map((w) => (
                  <li key={w} className="flex items-center gap-1.5 text-warn-700 dark:text-warn-200">
                    <AlertTriangle size={13} />
                    {w === "desc" ? t("sb.chk.noDesc", "بلا وصف (اختياري بس يفيد)") : w === "section" ? t("sb.chk.noSection", "بلا قسم — يطلع تحت «منتجات أخرى»") : t("sb.chk.out", "نافد — يطلع للزبون «نافد»")}
                  </li>
                ))}
              </ul>
              {!row.store_visible && !r.ok && (
                <p className="text-2xs text-ink-subtle">{t("sb.cantPublish", "ما ينتشر قبل يكمل: {{what}}", { what: missingText })}</p>
              )}
            </section>

            {/* ── السعر والقسم ── */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 rounded-2xl border border-line p-4">
                <label className="text-xs font-bold text-ink-muted" htmlFor={`price-${row.id}`}>{t("sb.price", "سعر البيع (نفس سعر الكاشير)")}</label>
                <div className="flex gap-2">
                  <input id={`price-${row.id}`} type="number" inputMode="decimal" min={0} value={priceDraft} disabled={!canPrice}
                    onChange={(e) => { setPriceDraft(e.target.value); setPriceAsk(null); }} onKeyDown={(e) => { if (e.key === "Enter") void savePrice(); }}
                    className="input h-10 flex-1 text-end font-display font-extrabold tabular-nums" />
                  {canPrice && (
                    <Button size="sm" onClick={() => void savePrice()} loading={busy === "price"}
                      disabled={!priceDraft.trim() || Number(priceDraft) === (row.sell_price ?? 0) || !!priceAsk}>{t("common.save", "حفظ")}</Button>
                  )}
                </div>
                {priceAsk && (
                  <div className="space-y-2 rounded-xl border border-warn-300 bg-warn-50 p-2.5 dark:border-warn-500/40 dark:bg-warn-500/10" data-price-doubt>
                    <p className="text-2xs font-bold text-warn-700 dark:text-warn-200">
                      {priceAsk.doubt === "code"
                        ? t("sb.doubt.code", "{{p}} يشبه باركود ممسوح مو سعر — متأكد هذا سعر البيع؟", { p: money(priceAsk.v) })
                        : t("sb.doubt.jump", "{{p}} أكثر من ١٠ أضعاف السعر الحالي ({{was}}) — متأكد؟", { p: money(priceAsk.v), was: money(Number(row.sell_price) || 0) })}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="danger" onClick={() => void savePrice(true)} loading={busy === "price"}>{t("sb.doubt.yes", "إي، احفظ {{p}}", { p: money(priceAsk.v) })}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { playTap(); setPriceAsk(null); setPriceDraft(row.sell_price ? String(row.sell_price) : ""); }}>{t("sb.doubt.no", "لا، رجّع السعر")}</Button>
                    </div>
                  </div>
                )}
                {movedFrom && (
                  <p className="text-2xs font-bold text-warn-700 dark:text-warn-200" data-price-moved>
                    {(row.sell_price ?? null) !== movedFrom.was
                      ? t("sb.movedTo", "السعر تغيّر من جهاز ثاني — صار {{p}}. راجعه قبل ما تعدّل.", { p: (Number(row.sell_price) || 0) > 0 ? money(Number(row.sell_price)) : t("sb.noPrice", "بلا سعر") })
                      : t("sb.movedWait", "السعر تغيّر من جهاز ثاني — نجيب السعر الجديد…")}
                  </p>
                )}
                {!hideCost && row.below_cost && (
                  <p className="flex items-center gap-1 text-2xs font-bold text-danger-600 dark:text-danger-300"><AlertTriangle size={12} /> {t("sb.belowCostLine", "السعر أقل من كلفة الشراء")}</p>
                )}
                {lastChange && (
                  <p className="text-2xs text-ink-subtle tabular-nums">
                    {t("sb.lastChange", "آخر تغيير: {{when}} — {{from}} ← {{to}}{{by}}", {
                      when: formatDate(lastChange.changed_at, "ar"),
                      from: lastChange.old_price != null ? money(lastChange.old_price) : "—",
                      to: lastChange.new_price != null ? money(lastChange.new_price) : "—",
                      // الاسمُ لمن يحقّ له (0229: المصوّرُ يستلمه null) — غيابُه لا يُرسم «· null».
                      by: lastChange.by_name ? ` · ${lastChange.by_name}` : "",
                    })}
                    {lastChange.via === "raise" && <> · {t("sb.viaRaise", "رفع أسعار")}</>}
                  </p>
                )}
                {!canPrice && <p className="text-2xs text-ink-subtle">{t("sb.priceLocked", "تعديل السعر للمدير والطبيب وموظف التصوير.")}</p>}
              </div>
              <div className="space-y-1.5 rounded-2xl border border-line p-4">
                <label className="text-xs font-bold text-ink-muted" htmlFor={`sec-${row.id}`}>{t("sb.section", "القسم بالمتجر")}</label>
                <select id={`sec-${row.id}`} value={row.store_section_id && sections.some((s) => s.id === row.store_section_id) ? row.store_section_id : ""}
                  onChange={(e) => void setSection(e.target.value || null)} disabled={busy === "sec"}
                  className="input h-10 w-full">
                  <option value="">{t("sb.sec.none", "بلا قسم")}</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {sections.length === 0 && <p className="text-2xs text-ink-subtle">{t("sb.secNone", "ما عندك أقسام بعد — سوّها من «الأقسام والترتيب».")}</p>}
                {sectionName && <p className="text-2xs text-ink-subtle">{t("sb.secOrderHint", "ترتيبه داخل القسم من «الأقسام والترتيب».")}</p>}
              </div>
            </section>

            {/* ── الوصف ومعاينته ── */}
            <section className="grid gap-3 sm:grid-cols-[1fr_minmax(0,13rem)]">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-ink-muted" htmlFor={`desc-${row.id}`}>{t("sb.desc", "الوصف للزبون")}</label>
                  {!desc && (
                    <button type="button" className="ms-auto inline-flex items-center gap-1 text-2xs font-bold text-brand-600 hover:underline"
                      onClick={() => { playTap(); setDesc([row.name, row.company_name].filter(Boolean).join(" — ")); }}>
                      <Sparkles size={12} /> {t("sb.descSuggest", "ابدأ من الاسم والشركة")}
                    </button>
                  )}
                </div>
                <textarea id={`desc-${row.id}`} rows={5} maxLength={DESC_MAX} value={desc} onChange={(e) => setDesc(e.target.value)}
                  placeholder={t("sb.descPh", "مثلاً: للقطط البالغة · ٢ كيلو · يقوّي المناعة ويلمّع الفرو")} className="input w-full resize-y py-2 text-sm leading-relaxed" />
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-ink-subtle tabular-nums">{formatNum(desc.length)} / {formatNum(DESC_MAX)}</span>
                  <Button size="sm" className="ms-auto" onClick={() => void saveDesc()} loading={busy === "desc"}
                    disabled={(desc.trim() || null) === (row.store_desc ?? null)}>{t("sb.saveDesc", "احفظ الوصف")}</Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xs font-bold text-ink-subtle">{t("sb.asCustomer", "هيچ يشوفها الزبون")}</p>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-soft">
                  <div className="grid aspect-square place-items-center bg-surface-2">
                    {full ? <img src={thumb ?? full} alt="" className="h-full w-full object-contain" /> : <ImageOff size={26} className="text-ink-subtle" />}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="line-clamp-2 text-xs font-bold text-ink">{row.name}</p>
                    {desc.trim() && <p className="line-clamp-2 text-2xs leading-relaxed text-ink-subtle">{desc.trim()}</p>}
                    <div className="flex items-center gap-1.5">
                      <p className="font-display text-sm font-extrabold tabular-nums text-ink">{(Number(priceDraft) || 0) > 0 ? money(Number(priceDraft)) : "—"}</p>
                      {isOut(row) && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-bold text-ink-muted">{t("sb.out", "نافد")}</span>}
                      {expired && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-2xs font-bold text-danger-700">{t("sb.expired", "منتهي")}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {zoom && full && (
        <ImageLightbox src={full} caption={row.name} onClose={() => setZoom(false)}
          details={<PhotoDetails path={row.image_path ?? null} meta={(row.image_meta as ImageMeta | null) ?? null} />} />
      )}
    </Dialog>
  );
}
