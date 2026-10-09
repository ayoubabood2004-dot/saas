import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { repo } from "@/lib/repo";
import { describeDbError, describeUploadError, rejectedBeforeCommit } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";
import { formatNum } from "@/lib/utils";
import { ImageLibraryPicker } from "@/components/inventory/ImageLibraryPicker";
import { PhotoStudio } from "./PhotoStudio";
import { thumbOf, type EncodedPhoto, type ImageMeta, type PhotoSource } from "@/lib/productPhoto";

/* ============================================================================
 * مسارُ الصورة الواحد (0229): كاميرا أو ألبوم ⇒ معاينة ⇒ رفعُ ملفّين ⇒ ربطٌ
 * بالمنتج مع وصفها ⇒ حذفُ القديم. والمكتبةُ ربطٌ بلا رفع، والإزالةُ فكٌّ بلا
 * ملفٍّ جديد. تستعمله اللوحةُ والبطاقةُ والتصويرُ المتتابع — نسخةٌ واحدة، لأن
 * ثلاثَ نسخٍ من «احذف القديمَ بعد نجاح الربط وحدَه» تنحرف عند أوّل تعديل.
 *
 * الترتيبُ مقصود: الملفّان أوّلاً، ثمّ الربطُ (نداءٌ واحدٌ يكتب المسارَ والوصفَ
 * معاً)، ثمّ حذفُ القديم بعد نجاح الربط وحدَه — و`repo` تسأل الخادمَ هل ما زال
 * منتجٌ آخرُ يشير إليه (توأمٌ مطويّ يعود من السلّة بنفس الصورة).
 * ==========================================================================*/

export interface PhotoTarget {
  id: string;
  name: string;
  image_path?: string | null;
  image_meta?: ImageMeta | null;
}

export function usePhotoFlow({ clinicId, onApplied, quiet = false }: {
  clinicId: string | null;
  /** بعد نجاح الربط: المسارُ الجديد (أو null بعد الإزالة) والوصف. */
  onApplied: (productId: string, path: string | null, meta: ImageMeta | null) => void;
  /** بلا توست نجاح — التصويرُ المتتابع يقولها بلوحته (التوستُ كان يغطّي أزرارَها بالموبايل). */
  quiet?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const camRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const forRef = useRef<PhotoTarget | null>(null);
  const afterRef = useRef<(() => void) | null>(null);
  const [studio, setStudio] = useState<{ target: PhotoTarget; file: File; source: PhotoSource } | null>(null);
  const [libFor, setLibFor] = useState<PhotoTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** `after` يُنادى بعد حفظٍ ناجح — التصويرُ المتتابعُ ينتقل به للتالي. */
  const openCamera = (p: PhotoTarget, after?: () => void) => { playTap(); forRef.current = p; afterRef.current = after ?? null; camRef.current?.click(); };
  const openAlbum = (p: PhotoTarget, after?: () => void) => { playTap(); forRef.current = p; afterRef.current = after ?? null; albumRef.current?.click(); };
  const openLibrary = (p: PhotoTarget, after?: () => void) => { playTap(); afterRef.current = after ?? null; setLibFor(p); };

  const onFile = (source: PhotoSource) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; const p = forRef.current;
    e.target.value = "";
    if (f && p) setStudio({ target: p, file: f, source });
  };

  const dropOld = (p: PhotoTarget, next: string | null) => {
    const old = p.image_path ?? null;
    if (!old || old === next) return;
    // المصغّرُ القديم معه — من وصفه إن كان يصفه، وإلا لا شيء (صورةٌ قبل 0229 بلا مصغّر).
    const oldThumb = thumbOf(old, p.image_meta ?? null);
    void repo.deleteProductImage(clinicId, p.id, old, oldThumb);
  };

  const save = async (photo: EncodedPhoto, source: PhotoSource) => {
    const s = studio;
    if (!s) return;
    const p = s.target;
    setBusyId(p.id);
    try {
      const up = await repo.uploadProductPhoto(clinicId, p.id, photo.full, photo.thumb);
      const meta: ImageMeta = { v: 1, path: up.path, thumb: up.thumb, w: photo.w, h: photo.h, bytes: photo.bytes, src: source, edits: photo.edits };
      try { await repo.setProductImage(p.id, up.path, meta); }
      catch (e) {
        /* الملفّان ارتفعا والربطُ رُفض: منتجٌ انحذف بجهازٍ ثانٍ، وصفٌ مرفوض، صلاحيةٌ سُحبت. كلُّ
         * «أعد المحاولة» يرفع زوجاً جديداً باسمٍ جديد — فالرفضُ الحاسم يشيل زوجَه (أفضلُ جهد،
         * و`deleteProductImage` تسأل الخادمَ قبلها هل يشير إليه أحد). أما انقطاعٌ أو مهلة فمصيرُ
         * الربط مجهول — قد يكون ثُبّت والردُّ ضاع — فلا يُلمس الملفّ: يتيمٌ أهونُ من صورةٍ مكسورة. */
        if (rejectedBeforeCommit(e)) void repo.deleteProductImage(clinicId, p.id, up.path, up.thumb);
        throw e;
      }
      dropOld(p, up.path);
      onApplied(p.id, up.path, meta);
      playSuccess();
      if (!quiet) {
        toast.success(t("sb.photo.saved", "انحفظت صورة {{name}}", { name: p.name }),
          t("sb.photo.savedSize", "{{w}}×{{h}} · {{kb}} ك.ب", { w: formatNum(photo.w), h: formatNum(photo.h), kb: formatNum(Math.round(photo.bytes / 1024)) }));
      }
      setStudio(null);
      const after = afterRef.current; afterRef.current = null;
      after?.();
    } catch (e) {
      playWarning();
      // الاستوديو يبقى مفتوحاً بصورته: إعادةُ المحاولة ضغطةٌ لا تصويرٌ من جديد.
      throw new Error(describeUploadError(e, t));
    } finally { setBusyId(null); }
  };

  const fromLibrary = async (p: PhotoTarget, path: string) => {
    setBusyId(p.id);
    try {
      await repo.setProductImage(p.id, path, null);
      dropOld(p, path);
      onApplied(p.id, path, null);
      playSuccess();
      if (!quiet) toast.success(t("sb.photo.saved", "انحفظت صورة {{name}}", { name: p.name }));
      const after = afterRef.current; afterRef.current = null;
      after?.();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t)); }
    finally { setBusyId(null); setLibFor(null); }
  };

  const remove = async (p: PhotoTarget) => {
    setBusyId(p.id);
    try {
      await repo.setProductImage(p.id, null, null);
      dropOld(p, null);
      onApplied(p.id, null, null);
      playTap();
      toast.success(t("sb.photo.removed", "انشالت صورة {{name}}", { name: p.name }));
    } catch (e) { playWarning(); toast.error(describeDbError(e, t)); }
    finally { setBusyId(null); }
  };

  const ui = (
    <>
      {/* حقلان مخفيّان: الكاميرا مباشرةً (capture)، والألبوم والملفّات بلاه — `capture`
          يُخفي الألبومَ بالموبايل (0228). */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile("camera")} data-cam-input />
      <input ref={albumRef} type="file" accept="image/*" className="hidden" onChange={onFile("album")} data-gallery-input />
      <PhotoStudio file={studio?.file ?? null} productName={studio?.target.name ?? ""} source={studio?.source ?? "camera"}
        onRetake={studio?.source === "camera" ? () => { const tg = studio.target; setStudio(null); openCamera(tg, afterRef.current ?? undefined); } : undefined}
        onCancel={() => { setStudio(null); afterRef.current = null; }}
        onSave={save} />
      <ImageLibraryPicker open={!!libFor} onClose={() => { setLibFor(null); afterRef.current = null; }}
        onPick={(row) => { if (libFor) void fromLibrary(libFor, row.path); }} />
    </>
  );

  return { openCamera, openAlbum, openLibrary, remove, busyId, ui };
}
