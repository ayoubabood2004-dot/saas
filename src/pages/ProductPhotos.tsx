import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ImageIcon, ImageOff, Images, Library, RotateCw, Search, Trash2 } from "lucide-react";
import type { PhotoProduct } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { prepareUpload } from "@/lib/image";
import { productImageUrl } from "@/lib/storeLib";
import { ImageLibraryPicker } from "@/components/inventory/ImageLibraryPicker";
import { describeDbError, describeUploadError } from "@/lib/errors";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum, searchable } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * صورُ المنتجات — شاشةُ موظّف التصوير (0222)، ولمن يملك الإذن من الكادر.
 *
 * المنتجاتُ من `photo_products()` بأعمدةٍ آمنة (لا سعرَ شراء)، والصورةُ تُكتب بـ
 * `set_product_image` وحدَها — الخادمُ يسأل الإذنَ ويحصر المسارَ بمجلّد العيادة.
 * الافتراضيُّ «بلا صورة»: هذا شغلُ المصوّر، وما عنده صورةٌ لا يحتاجه أوّلاً.
 * والقائمةُ الفاشلةُ حالةٌ تُقال مع «أعد المحاولة» — لا «ماكو منتجات» عن خطأ.
 * ========================================================================= */

const PAGE = 120;
type Filter = "missing" | "all";

export function ProductPhotos() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id ?? null;
  const allowed = can("manageProductPhotos") || can("manageStore");

  const [rows, setRows] = useState<PhotoProduct[] | "loading" | "error">("loading");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("missing");
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [libFor, setLibFor] = useState<PhotoProduct | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* الألبوم (0228، طلبُ المالك): `capture` يفتح الكاميرا وحدها بالموبايل ويُخفي الألبوم والملفّات —
   * فحقلٌ ثانٍ بلا capture لصورٍ محفوظة. الخادمُ لا يفرّق بينهما: نفسُ الرفع ونفسُ set_product_image. */
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileFor = useRef<PhotoProduct | null>(null);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; const p = fileFor.current;
    e.target.value = "";
    if (f && p) void upload(p, f);
  };

  const load = async () => {
    setRows((r) => (Array.isArray(r) ? r : "loading"));
    try { setRows(await repo.listPhotoProducts()); }
    catch { setRows("error"); }
  };
  useEffect(() => { if (allowed) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [allowed]);

  const list = Array.isArray(rows) ? rows : [];
  const missing = list.filter((p) => !p.image_path).length;
  const visible = useMemo(() => {
    const needle = searchable(q.trim());
    return list.filter((p) => (filter === "all" || !p.image_path)
      && (!needle || searchable(`${p.name} ${p.barcode ?? ""} ${p.company_name ?? ""}`).includes(needle)));
  }, [list, q, filter]);

  /** يستبدل الصورةَ ثم يحذف القديمةَ بعد نجاح التحويل وحده — و`repo` تسأل الخادمَ هل
   *  ما زال منتجٌ آخر يشير إليها، فلا يُكسر توأمٌ مطويّ. */
  const apply = async (p: PhotoProduct, next: string | null) => {
    const old = p.image_path ?? null;
    await repo.setProductImage(p.id, next);
    if (old && old !== next) void repo.deleteProductImage(clinicId, p.id, old);
    setRows((r) => (Array.isArray(r) ? r.map((x) => (x.id === p.id ? { ...x, image_path: next } : x)) : r));
  };

  const upload = async (p: PhotoProduct, file: File) => {
    setBusyId(p.id);
    try {
      const prepared = await prepareUpload(file, { maxDim: 800, quality: 0.72 });
      const path = await repo.uploadProductImage(clinicId, p.id, prepared);
      await apply(p, path);
      playSuccess();
      toast.success(t("photos.saved", { name: p.name, defaultValue: "انحفظت صورة {{name}}" }));
    } catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
    finally { setBusyId(null); }
  };

  const fromLibrary = async (p: PhotoProduct, path: string) => {
    setBusyId(p.id);
    try { await apply(p, path); playSuccess(); toast.success(t("photos.saved", { name: p.name, defaultValue: "انحفظت صورة {{name}}" })); }
    catch (e) { playWarning(); toast.error(describeDbError(e, t)); }
    finally { setBusyId(null); setLibFor(null); }
  };

  const remove = async (p: PhotoProduct) => {
    setBusyId(p.id);
    try { await apply(p, null); playTap(); toast.success(t("photos.removed", { name: p.name, defaultValue: "انشالت صورة {{name}}" })); }
    catch (e) { playWarning(); toast.error(describeDbError(e, t)); }
    finally { setBusyId(null); }
  };

  if (!allowed) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-sm font-bold text-ink-muted">{t("photos.noAccess", "هاي الصفحة لمن عنده صلاحية صور المنتجات. راجع مدير العيادة.")}</p>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-photos>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Camera size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("photos.title", "صور المنتجات")}</h1>
          <p className="text-sm text-ink-subtle">
            {Array.isArray(rows)
              ? t("photos.summary", { missing: formatNum(missing), total: formatNum(list.length), defaultValue: "{{missing}} بلا صورة من {{total}} منتج" })
              : t("photos.sub", "صوّر المنتج، أو اختار صورته من الألبوم أو المكتبة — الصورة تطلع بالمتجر والمخزون")}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
            placeholder={t("photos.search", "ابحث بالاسم أو الباركود أو الشركة")}
            className="input h-11 w-full ps-9" />
        </div>
        {(["missing", "all"] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => { playTap(); setFilter(f); setShown(PAGE); }}
            className={cn("h-11 rounded-2xl px-4 text-sm font-bold transition",
              filter === f ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink")}>
            {f === "missing" ? t("photos.fMissing", "بلا صورة") : t("photos.fAll", "الكل")}
          </button>
        ))}
      </div>

      {rows === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : rows === "error" ? (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("photos.failed", "ما وصلنا للمنتجات — المشكلة بالاتصال. ما ضاع شي.")}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => { playTap(); void load(); }}><RotateCw size={14} /> {t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm font-bold text-ink-subtle">
          {filter === "missing" && !q ? t("photos.allDone", "كل المنتجات عدها صور ✓") : t("photos.none", "ماكو منتجات بهذا البحث.")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.slice(0, shown).map((p) => {
              const url = productImageUrl(p.image_path);
              const busy = busyId === p.id;
              return (
                <div key={p.id} data-photo-card={p.id} className={cn("card overflow-hidden", busy && "opacity-60")}>
                  <div className="grid aspect-square place-items-center bg-surface-2">
                    {url
                      ? <img src={url} alt={p.name} loading="lazy" className="h-full w-full object-contain" />
                      : <ImageOff size={34} className="text-ink-subtle" aria-hidden />}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink" title={p.name}>{p.name}</p>
                      <p className="truncate text-2xs text-ink-subtle" dir="auto">{[p.company_name, p.barcode].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} data-photo-upload={p.id}
                        onClick={() => { playTap(); fileFor.current = p; fileRef.current?.click(); }}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
                        <Camera size={14} /> {url ? t("photos.replace", "بدّل") : t("photos.shoot", "صوّر")}
                      </button>
                      <button type="button" disabled={busy} data-photo-gallery={p.id}
                        onClick={() => { playTap(); fileFor.current = p; galleryRef.current?.click(); }}
                        title={t("photos.gallery", "من الألبوم")} aria-label={t("photos.gallery", "من الألبوم")}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-muted transition hover:text-brand-600 disabled:opacity-50">
                        <Images size={16} />
                      </button>
                      <button type="button" disabled={busy} onClick={() => { playTap(); setLibFor(p); }}
                        title={t("photos.library", "من المكتبة")} aria-label={t("photos.library", "من المكتبة")}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-muted transition hover:text-brand-600 disabled:opacity-50">
                        <Library size={16} />
                      </button>
                      {url && (
                        <button type="button" disabled={busy} onClick={() => void remove(p)}
                          title={t("photos.remove", "شيل الصورة")} aria-label={t("photos.remove", "شيل الصورة")}
                          className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-muted transition hover:text-danger-600 disabled:opacity-50">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {visible.length > shown && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => { playTap(); setShown((n) => n + PAGE); }}>
                <ImageIcon size={15} /> {t("photos.more", { n: formatNum(visible.length - shown), defaultValue: "اعرض الباقي ({{n}})" })}
              </Button>
            </div>
          )}
        </>
      )}

      {/* حقلان مخفيّان لكلّ البطاقات: الكاميرا مباشرةً (capture)، والألبوم/الملفّات بلاه. */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-gallery-input />
      <ImageLibraryPicker open={!!libFor} onClose={() => setLibFor(null)}
        onPick={(row) => { if (libFor) void fromLibrary(libFor, row.path); }} />
    </div>
  );
}
