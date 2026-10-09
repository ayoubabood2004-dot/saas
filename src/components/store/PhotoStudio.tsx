import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Crop, Eye, Loader2, RotateCcw, RotateCw, Sparkles, SunMedium } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { cn, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { describeUploadError } from "@/lib/errors";
import {
  FULL_DIM, NO_EDIT, encodeProductPhoto, fitDims, loadPhoto, releasePhoto, renderPhoto, rotatedSize, squareRect,
  type EncodedPhoto, type PhotoEdit, type PhotoSource, type Rotation,
} from "@/lib/productPhoto";

/* ============================================================================
 * المعاينةُ قبل الرفع (0229) — «ما ينرفع شي ما شافه».
 *
 * كانت الصورةُ تُرفع لحظةَ التقاطها: صورةٌ مائلة أو مظلمة أو بإصبعٍ على العدسة
 * تصير صورةَ المتجر، والمصوّرُ يعرف بعدين أو لا يعرف. هنا يراها كبيرةً أوّلاً،
 * يدوّرها ويقصّها مربّعاً ويحسّن إضاءتها ويبيّض خلفيتها، ثمّ يعتمد — أو يعيد.
 * والتعديلُ يُرسم على نسخةٍ مصغّرة للمعاينة، ويُعاد بالأبعاد الكاملة عند الحفظ.
 *
 * والمقارنةُ بالأصل **دوسةٌ تقلب** لا ضغطةٌ مطوّلة: الضغطُ المطوّل على صورةٍ بالموبايل
 * ملكُ النظام (قائمةُ «احفظ/انسخ/Lens» بأندرويد، ومعاينةُ آيفون) — تفتح فوق الاستوديو بعد
 * نصف ثانية وتلغي الإصبعَ، فترجع الصورةُ للمعدّلة والمصوّرُ ما شاف الأصل. فالسطحُ يكتم
 * قائمةَ الصورة، والتبديلُ زرٌّ بحالته (`aria-pressed`) ودوسةٌ على الصورة نفسِها.
 * ==========================================================================*/

const PREVIEW_DIM = 1000;

export function PhotoStudio({ file, productName, source, onRetake, onCancel, onSave }: {
  file: File | null;
  productName: string;
  source: PhotoSource;
  onRetake?: () => void;
  onCancel: () => void;
  onSave: (photo: EncodedPhoto, source: PhotoSource) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  /** سببُ تعذّر العرض بكلماته — لا «مو صورة» عن كلّ شيء: صورةُ ٢٠٠ ميغابكسل صورة. */
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(NO_EDIT);
  const [preview, setPreview] = useState<string | null>(null);
  const [applied, setApplied] = useState({ enhance: false, whiteBg: false });
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  /* الأسبابُ بأسمائها (0229 بعد تدقيق): صورةُ «الدقة القصوى» كانت تُقال «مو صورة يقدر يقراها
   * الجهاز» فيجرّب المصوّرُ صورةً ثانيةً من نفس الكاميرا وتُرفض أيضاً. الحجمُ والرسمُ يمرّان
   * من `describeUploadError` كبقيّة الرفع، والملفُّ غيرُ المقروء وحدَه «مو صورة». */
  const photoErrorText = (e: unknown): string => {
    const x = (e && typeof e === "object" ? e : {}) as { name?: string; megapixels?: number };
    if (x.name === "TooManyPixelsError") {
      return t("sb.studio.tooBig", "دقة الصورة عالية كلش على هذا الجهاز ({{mp}} ميغابكسل) — صوّرها بدقة أقل (مو وضع الدقة القصوى).", { mp: formatNum(x.megapixels ?? 0) });
    }
    if (x.name === "FileTooLargeError" || x.name === "ImageEncodeError") return describeUploadError(e, t);
    return t("sb.studio.unreadable", "هذا الملف مو صورة يقدر يقراها الجهاز — جرّب صورة ثانية.");
  };

  useEffect(() => {
    let alive = true;
    setImg(null); setLoadErr(null); setEdit(NO_EDIT); setPreview(null); setErr(null); setComparing(false);
    if (!file) return;
    void loadPhoto(file).then((el) => {
      if (!alive) { releasePhoto(el); return; }
      imgRef.current = el;
      setImg(el);
    }).catch((e) => { if (alive) setLoadErr(photoErrorText(e)); });
    return () => { alive = false; releasePhoto(imgRef.current); imgRef.current = null; };
  }, [file]);

  /* المعاينةُ تُعاد مع كلّ تعديل — مؤجّلةً إطاراً كي لا تتراكم ضغطاتُ التدوير المتتالية. */
  useEffect(() => {
    if (!img) return;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      try {
        const r = renderPhoto(img, edit, PREVIEW_DIM);
        setApplied(r.applied);
        setPreview(r.canvas.toDataURL("image/jpeg", 0.86));
      } catch (e) { setLoadErr(photoErrorText(e)); }
    });
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [img, edit]);

  const sw = img?.naturalWidth ?? 0, sh = img?.naturalHeight ?? 0;
  const base = edit.square ? squareRect(sw, sh).size : 0;
  const r = rotatedSize(edit.square ? base : sw, edit.square ? base : sh, edit.rot);
  const out = fitDims(r.w, r.h, FULL_DIM);
  const small = img && Math.max(sw, sh) < 700;

  // تعديلٌ جديد يُرى فوراً: من كان على «الأصل» يرجع للمعدّلة وإلا ظنّ الزرَّ ما اشتغل.
  const rot = (d: 1 | -1) => { playTap(); setComparing(false); setEdit((e) => ({ ...e, rot: (((e.rot + d * 90) % 360 + 360) % 360) as Rotation })); };
  const flip = (k: "square" | "enhance" | "whiteBg") => { playTap(); setComparing(false); setEdit((e) => ({ ...e, [k]: !e[k] })); };
  const flipCompare = () => { if (!preview) return; playTap(); setComparing((c) => !c); };

  const save = async () => {
    if (!img || saving) return;
    setSaving(true); setErr(null);
    try {
      let photo: EncodedPhoto;
      // الترميزُ خطوةٌ مستقلّة: فشلُه (ذاكرة، canvas) يُقال بلغة المستخدم لا بنصّ المتصفّح الخامّ.
      try { photo = await encodeProductPhoto(img, edit, false); }
      catch (e) { setErr(describeUploadError(e, t)); return; }
      // والحفظُ (`usePhotoFlow`) يرمي رسالتَه موصوفةً أصلاً.
      await onSave(photo, source);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("sb.studio.saveFailed", "ما انحفظت — جرّب مرة ثانية"));
    } finally { setSaving(false); }
  };

  const tool = (on: boolean) => cn(
    "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition active:scale-95",
    on ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200"
      : "border-line bg-surface-1 text-ink-muted hover:text-ink",
  );

  return (
    <Dialog open={!!file} onClose={() => { if (!saving) onCancel(); }} size="lg"
      title={t("sb.studio.title", "معاينة الصورة قبل الحفظ")}
      description={productName}>
      {/* بلا حشوةٍ ثانية: Dialog يحشو `px-6 pb-6` أصلاً — والصورةُ التي يُحكم عليها تأخذ العرضَ كلَّه. */}
      <div className="space-y-3" data-photo-studio>
        <div className="relative grid aspect-square w-full touch-manipulation select-none place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2"
          style={{ WebkitTouchCallout: "none" }} onContextMenu={(e) => e.preventDefault()} onClick={flipCompare} data-compare-surface>
          {loadErr ? (
            <p className="p-6 text-center text-sm font-semibold text-danger-600">{loadErr}</p>
          ) : !preview ? (
            <Loader2 size={28} className="animate-spin text-brand-600" />
          ) : (
            <img src={comparing && img ? img.src : preview} alt={productName} className="h-full w-full select-none object-contain" draggable={false} />
          )}
          {preview && (
            <button type="button" data-compare-toggle aria-pressed={comparing} aria-label={t("sb.studio.original", "الأصل")}
              onClick={(e) => { e.stopPropagation(); flipCompare(); }}
              className="absolute start-2 top-2 inline-flex items-center rounded-full bg-black/60 p-0.5 text-2xs font-bold text-white backdrop-blur">
              <span className={cn("rounded-full px-2.5 py-1 transition", comparing && "bg-white text-ink")}>{t("sb.studio.original", "الأصل")}</span>
              <span className={cn("rounded-full px-2.5 py-1 transition", !comparing && "bg-white text-ink")}>{t("sb.studio.result", "بعد التعديل")}</span>
            </button>
          )}
        </div>

        <p className="text-center text-2xs text-ink-subtle">{t("sb.studio.compareHint", "دوس على الصورة (أو «الأصل») حتى تقارنها بالمعدّلة")}</p>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button type="button" className={tool(false)} onClick={() => rot(-1)} disabled={!img} aria-label={t("sb.studio.rotL", "دوّر لليسار")}><RotateCcw size={15} /></button>
          <button type="button" className={tool(false)} onClick={() => rot(1)} disabled={!img} aria-label={t("sb.studio.rotR", "دوّر لليمين")}><RotateCw size={15} /></button>
          <button type="button" className={tool(edit.square)} onClick={() => flip("square")} disabled={!img} aria-pressed={edit.square}>
            <Crop size={15} /> {t("sb.studio.square", "قصّ مربّع")}
          </button>
          <button type="button" className={tool(edit.enhance)} onClick={() => flip("enhance")} disabled={!img} aria-pressed={edit.enhance}>
            <SunMedium size={15} /> {t("sb.studio.enhance", "حسّن الإضاءة")}
          </button>
          <button type="button" className={tool(edit.whiteBg)} onClick={() => flip("whiteBg")} disabled={!img} aria-pressed={edit.whiteBg}>
            <Sparkles size={15} /> {t("sb.studio.white", "خلفية بيضاء")}
          </button>
        </div>

        {edit.whiteBg && preview && !applied.whiteBg && (
          <p className="rounded-xl bg-warn-50 p-2.5 text-center text-2xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">
            {t("sb.studio.whiteSkipped", "الخلفية مو لون واحد (رف، يد، طاولة) — ما تبيّضت حتى ما تنأكل حافة العلبة. صوّرها على سطح أبيض.")}
          </p>
        )}
        {edit.enhance && preview && !applied.enhance && (
          <p className="text-center text-2xs text-ink-subtle">{t("sb.studio.enhanceSkipped", "الإضاءة زينة أصلاً — ما احتاجت تحسين.")}</p>
        )}
        {small && (
          <p className="rounded-xl bg-warn-50 p-2.5 text-center text-2xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">
            {t("sb.studio.small", "الصورة صغيرة ({{w}}×{{h}}) — راح تطلع ضبابية لمن الزبون يكبّرها. الأفضل تصوّرها من جديد.", { w: formatNum(sw), h: formatNum(sh) })}
          </p>
        )}

        {img && (
          <p className="text-center text-2xs text-ink-subtle tabular-nums" dir="auto">
            {t("sb.studio.outDims", "تنحفظ بـ {{w}}×{{h}} بكسل + نسخة صغيرة للمتجر", { w: formatNum(out.w), h: formatNum(out.h) })}
          </p>
        )}
        {err && <p className="rounded-xl bg-danger-50 p-2.5 text-center text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">{err}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>{t("common.cancel", "إلغاء")}</Button>
          {onRetake && (
            <Button variant="outline" size="sm" onClick={() => { playTap(); onRetake(); }} disabled={saving} leftIcon={<Camera size={15} />}>
              {t("sb.studio.retake", "أعد التصوير")}
            </Button>
          )}
          <Button className="ms-auto" onClick={() => void save()} loading={saving} disabled={!img || !!loadErr} leftIcon={<Eye size={16} />} data-photo-approve>
            {t("sb.studio.approve", "اعتمد واحفظ")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
