import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Camera, Check, FolderOpen, History, ImageMinus, Library, Loader2, Pencil, RotateCcw, RotateCw, Square, Crop as CropIcon, Undo2, X } from "lucide-react";
import { repo } from "@/lib/repo";
import { supabase } from "@/lib/supabase";
import { blobToDataUrl, FileTooLargeError, MAX_INPUT_MB } from "@/lib/image";
import { cardImagePath, productImageUrl, shelfLabel, shelfLook } from "@/lib/storeLib";
import {
  editPlan, renderPlan, encodeWithSteps, targets, rotatedSize, rotateBy, squareIn, dragCorner, dragMove, maskBands, editorNotice, FULL_CROP,
  type Crop, type EditorAct, type EncodedPhoto, type Rot, type SaveMode, type UploadBlob,
} from "@/lib/photoPipeline";
import { describeUploadError } from "@/lib/errors";
import { pushModal, removeModal, isTopModal } from "@/lib/modalStack";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ProductImageFile } from "@/types";

/* ============================================================================
 * محرّرُ صورة المنتج — الصورةُ تُرى كاملةً قبل أن تُحفظ (متجر v1، طلبُ المالك).
 *
 * كانت الصورةُ تُرفع لحظةَ الاختيار والمعاينةُ ٤٤ بكسل، فالمقلوبةُ والمقصوصةُ خطأً تُرى
 * بالمتجر لا قبله. هنا: مصادرُ الصورة كلُّها بمكانٍ واحد (الكاميرا، ملف، سحبٌ وإفلات، لصقٌ،
 * الصورُ السابقة، المكتبة، والحاليّةُ للتعديل)، ثم معاينةٌ بعرض الشاشة بتدويرٍ وقصٍّ (حرٌّ أو
 * مربّع) وبطاقةِ متجرٍ مصغّرة، ثم الحفظ — والإلغاءُ لا يرفع شيئاً.
 *
 * والحفظُ نفسُه شأنُ المضيف (`onPhoto`/`onPath`): المتجرُ وصفحةُ المصوّر يرفعان ويربطان فوراً،
 * ونموذجُ المخزون يحتفظ بها حتى يُحفظ المنتج — والمضيفُ **يُعلن** أيّهما (`saves`) فيقول المحرّرُ
 * ما صار فعلاً (editorNotice): «انحفظت» لما حُفظ، و«جاهزة — تنحفظ وية المنتج» لما ينتظر. **ولا بابَ حذفٍ هنا** (O4): «افصل الصورة» فكٌّ
 * وحده، والسابقةُ تُعاد من «صور سابقة». حسابُ الإطار والترميز بـphotoPipeline (مفحوصٌ بنود).
 * ==========================================================================*/

export interface PhotoTarget { id: string; name: string; image_path: string | null; clinic_id: string | null }

export interface PhotoEditorProps {
  /** المادّةُ المفتوحة — null = مغلق. */
  product: PhotoTarget | null;
  /** ملفٌّ وصل بالسحب أو اللصق على بطاقةٍ قبل الفتح ⇒ يفتح على التعديل مباشرة. */
  initialFile?: File | null;
  onClose: () => void;
  /** متى يُحفظ ما يعطيه المحرّر (إلزاميّ): `now` يرفع ويربط فوراً، `with-product` ينتظر حفظَ المنتج —
   *  وعليه تُبنى رسالتُه وزرُّه: «انحفظت الصورة» عن صورةٍ لم تُحفظ كانت تُضيّعها حين يُغلق النموذج. */
  saves: SaveMode;
  /** صورةٌ مرمَّزة ⇒ المضيفُ يرفعها ويربطها (أو يحفظها لما بعد حفظ المنتج). */
  onPhoto: (photo: EncodedPhoto) => Promise<void>;
  /** ربطُ مسارٍ قائم (صورةٌ سابقة أو من المكتبة) أو `null` = فصلُ الصورة. */
  onPath: (path: string | null) => Promise<void>;
  /** «احفظ وروح للجاية بلا صورة» — التالي من قائمة الشاشة كما فُتحت. */
  next?: PhotoTarget | null;
  onNext?: () => void;
  /** «صور سابقة» تحتاج منتجاً محفوظاً بمجلّد العيادة. */
  history?: boolean;
  /** منتقي المكتبة يفتحه المضيف (له مكوّنه). */
  onLibrary?: () => void;
}

type Decoded = { src: CanvasImageSource; w: number; h: number; close: () => void };
const MAX_PX = 40_000_000;

/** فكُّ الصورة بالاتّجاه الصحيح (EXIF) — `createImageBitmap` أوّلاً، و`<img>` احتياطاً.
 *  وحارسا الحجم كما بـimage.ts: ٢٥ ميغا للملفّ و٤٠ ميغابكسل للصورة (قنبلةُ فكّ). */
async function decode(file: Blob): Promise<Decoded> {
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new FileTooLargeError(MAX_INPUT_MB);
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bmp.width * bmp.height > MAX_PX) { bmp.close(); throw new FileTooLargeError(MAX_INPUT_MB); }
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch (e) {
      if (e instanceof FileTooLargeError) throw e;
      /* متصفّحٌ لا يفكّه بهذه الطريقة — نجرّب <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("The file could not be read as an image"));
      i.src = url;
    });
    if (img.naturalWidth * img.naturalHeight > MAX_PX) throw new FileTooLargeError(MAX_INPUT_MB);
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => {
  c.toBlob((b) => (b ? res(b) : rej(new Error("Image compression failed"))), "image/jpeg", q);
});
function drawTo(d: Decoded, rot: Rot, crop: Crop, edge: number): HTMLCanvasElement {
  const plan = editPlan(d.w, d.h, rot, crop, edge);
  const c = document.createElement("canvas");
  c.width = plan.outW; c.height = plan.outH;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  renderPlan(ctx, plan, d.src);
  return c;
}

export default function PhotoEditor(p: PhotoEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const open = !!p.product;
  const demo = !supabase;
  const [stage, setStage] = useState<"source" | "edit">("source");
  const [img, setImg] = useState<Decoded | null>(null);
  const [rot, setRot] = useState<Rot>(0);
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const [square, setSquare] = useState(false);
  const [busy, setBusy] = useState<"" | "load" | "save" | "link">("");
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [hist, setHist] = useState<ProductImageFile[] | "loading" | "error" | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "nw" | "ne" | "sw" | "se" | "move"; x: number; y: number; start: Crop } | null>(null);

  const reset = useCallback(() => {
    setImg((old) => { old?.close(); return null; });
    setStage("source"); setRot(0); setCrop(FULL_CROP); setSquare(false); setCardUrl(null); setBusy("");
  }, []);

  /* مادّةٌ جديدة (فتحٌ أو «الجاية») ⇒ مصدرٌ جديد؛ والملفُّ الواصلُ بالسحب يفتح التعديلَ مباشرة. */
  const productId = p.product?.id ?? null;
  useEffect(() => {
    reset();
    if (!productId) return;
    if (p.initialFile) void load(p.initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, p.initialFile]);

  /* الصورُ السابقة — قائمةٌ كاملةٌ أو خطأٌ يُقال (لا «ما اكو» عن فشل). */
  const loadHistory = useCallback(async () => {
    if (!p.product || !p.history) { setHist(null); return; }
    setHist("loading");
    try { setHist(await repo.productImageHistory(p.product.clinic_id, p.product.id)); }
    catch { setHist("error"); }
  }, [p.product, p.history]);
  useEffect(() => { if (open && stage === "source") void loadHistory(); }, [open, stage, loadHistory]);

  /* مكدّسُ النوافذ: Esc تطوي الأعلى وحدَه، والصفحةُ لا تتمرّر خلفه. */
  useEffect(() => {
    if (!open) return;
    pushModal(id);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopModal(id) && !busy) p.onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { removeModal(id); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  });

  async function load(file: Blob) {
    setBusy("load");
    try {
      const d = await decode(file);
      setImg((old) => { old?.close(); return d; });
      setRot(0); setCrop(FULL_CROP); setSquare(false);
      setStage("edit");
    } catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
    finally { setBusy(""); }
  }

  /* لصقُ صورةٍ (Ctrl+V) والمحرّرُ مفتوح. */
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((x) => x.kind === "file" && x.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (!f) return;
      e.preventDefault();
      void load(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* المعاينةُ: الصورةُ كلُّها مدوَّرة، والقصُّ إطارٌ فوقها. */
  useEffect(() => {
    if (stage !== "edit" || !img || !canvasRef.current) return;
    const plan = editPlan(img.w, img.h, rot, FULL_CROP, 1200);
    const c = canvasRef.current;
    c.width = plan.outW; c.height = plan.outH;
    const ctx = c.getContext("2d");
    if (ctx) renderPlan(ctx, plan, img.src);
  }, [stage, img, rot]);

  const rw = img ? rotatedSize(img.w, img.h, rot).w : 1;
  const rh = img ? rotatedSize(img.w, img.h, rot).h : 1;
  /* بطاقةُ المتجر المصغّرة — تُرسم عند السكون لا مع كلّ حركة إصبع. */
  const refreshCard = useCallback(() => {
    if (!img) return;
    try { setCardUrl(drawTo(img, rot, crop, 240).toDataURL("image/jpeg", 0.8)); } catch { setCardUrl(null); }
  }, [img, rot, crop]);
  useEffect(() => { if (!drag.current) refreshCard(); }, [refreshCard]);

  const rotate = (delta: 90 | -90) => {
    if (!img) return;
    playTap();
    const nr = rotateBy(rot, delta);
    const s = rotatedSize(img.w, img.h, nr);
    setRot(nr);
    setCrop(square ? squareIn(s.w, s.h) : FULL_CROP);
  };
  const toggleSquare = () => {
    playTap();
    const nx = !square;
    setSquare(nx);
    setCrop(nx ? squareIn(rw, rh) : FULL_CROP);
  };
  const down = (kind: "nw" | "ne" | "sw" | "se" | "move") => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* مؤشّرٌ غيرُ نشط (حدثٌ مصطنع) — السحبُ يكمل بلا التقاط */ }
    drag.current = { kind, x: e.clientX, y: e.clientY, start: crop };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!d || !box || !box.width || !box.height) return;
    const dxN = (e.clientX - d.x) / box.width, dyN = (e.clientY - d.y) / box.height;
    setCrop(d.kind === "move" ? dragMove(d.start, dxN, dyN) : dragCorner(d.start, d.kind, dxN, dyN, rw, rh, square));
  };
  const up = () => { if (drag.current) { drag.current = null; refreshCard(); } };

  /* الحفظ: الكاملةُ بخطواتها (تحت ١٫٨ ميغا)، والمصغّرةُ ٤٨٠ — والتجريبيُّ عنوانٌ مضمَّنٌ بحجم اليوم. */
  const encode = async (): Promise<EncodedPhoto> => {
    if (!img) throw new Error("no_image");
    const tg = targets(demo);
    const blobOf = async (edge: number, q: number): Promise<UploadBlob> => {
      const blob = await toBlob(drawTo(img, rot, crop, edge), q);
      return { blob, dataUrl: demo ? await blobToDataUrl(blob) : "", ext: "jpg", contentType: "image/jpeg" };
    };
    const { out: full } = await encodeWithSteps(tg.steps, async (s) => {
      const u = await blobOf(s.edge, s.q);
      return Object.assign(u, { size: u.blob.size });
    });
    const thumb = tg.thumb ? await blobOf(tg.thumb.edge, tg.thumb.q) : null;
    return { full: { blob: full.blob, dataUrl: full.dataUrl, ext: full.ext, contentType: full.contentType }, thumb, previewUrl: cardUrl ?? "" };
  };
  /** ما يقوله المحرّرُ بعد الفعل — بما فعله المضيفُ (`saves`)، لا «انحفظت» ثابتة. */
  const say = (act: EditorAct) => {
    const n = editorNotice(p.saves, act);
    const msg = n.key === "imged.saved" ? t("imged.saved", "انحفظت الصورة")
      : n.key === "imged.unlinked" ? t("imged.unlinked", "انفصلت الصورة — محفوظة بـ«صور سابقة»")
      : n.key === "imged.relinked" ? t("imged.relinked", "رجعت الصورة")
      : n.key === "imged.unlinkStaged" ? t("imged.unlinkStaged", "الصورة تنفصل لمّا تحفظ المنتج")
      : t("imged.staged", "الصورة جاهزة — تنحفظ وية المنتج لمّا تضغط «حفظ»");
    if (n.tone === "success") { playSuccess(); toast.success(msg); }
    else { playTap(); toast.toast({ tone: "info", title: msg }); }
  };
  const save = async (goNext: boolean) => {
    if (busy) return;
    setBusy("save");
    try {
      const photo = await encode();
      await p.onPhoto(photo);
      say("photo");
      if (goNext && p.next && p.onNext) p.onNext(); else p.onClose();
    } catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
    finally { setBusy(""); }
  };
  const link = async (path: string | null) => {
    if (busy) return;
    setBusy("link");
    try {
      await p.onPath(path);
      say(path ? "relink" : "unlink");
      p.onClose();
    } catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
    finally { setBusy(""); }
  };
  /* تعديلُ الحاليّة: الملفُّ يُجلب بايتاتٍ ثم يُفكّ — رسمُ <img> عابرٍ للأصل يلوّث اللوحة فلا تُصدَّر. */
  const editCurrent = async () => {
    const url = productImageUrl(p.product?.image_path);
    if (!url) return;
    setBusy("load");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      setBusy("");
      await load(await res.blob());
    } catch { setBusy(""); playWarning(); toast.error(t("imged.fetchFailed", "ما قدرنا نفتح الصورة الحالية للتعديل — صوّرها من جديد أو اختر ملفاً")); }
  };

  if (!p.product) return null;
  const prod = p.product;
  const look = shelfLook(prod.name);
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void load(f); };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-ink/70 sm:items-center sm:p-4" data-photoeditor
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); void load(f); } }}>
      <div role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-surface-1 sm:h-auto sm:max-h-[94vh] sm:rounded-3xl sm:border sm:border-line">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-ink">{t("imged.title", { name: prod.name, defaultValue: "صورة: {{name}}" })}</p>
          <button type="button" onClick={() => { if (!busy) p.onClose(); }} aria-label={t("imged.close", "إغلاق")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {stage === "source" ? (
            <div className="space-y-4">
              <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 p-6 text-center">
                {busy === "load" ? <Loader2 size={26} className="animate-spin text-brand-600" /> : <Camera size={26} className="text-ink-subtle" />}
                <p className="text-sm font-semibold text-ink-muted">{t("imged.dropHint", "اسحب صورة هنا أو الصقها (Ctrl+V)")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button type="button" disabled={!!busy} onClick={() => { playTap(); camRef.current?.click(); }} data-ed-camera
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
                  <Camera size={17} /> {t("imged.camera", "صوّر")}
                </button>
                <button type="button" disabled={!!busy} onClick={() => { playTap(); fileRef.current?.click(); }} data-ed-file
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50">
                  <FolderOpen size={17} /> {t("imged.file", "اختر ملف")}
                </button>
                {p.onLibrary && (
                  <button type="button" disabled={!!busy} onClick={() => { playTap(); p.onLibrary?.(); }} data-ed-library
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50">
                    <Library size={17} /> {t("imged.library", "من المكتبة")}
                  </button>
                )}
                {prod.image_path && (
                  <button type="button" disabled={!!busy} onClick={() => { playTap(); void editCurrent(); }} data-ed-current
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50">
                    <Pencil size={16} /> {t("imged.editCurrent", "عدّل الصورة الحالية")}
                  </button>
                )}
                {prod.image_path && (
                  <button type="button" disabled={!!busy} onClick={() => { playTap(); void link(null); }} data-ed-unlink
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-warn-300 px-3 text-xs font-bold text-warn-700 transition hover:bg-warn-50 disabled:opacity-50 dark:border-warn-500/40 dark:text-warn-200 dark:hover:bg-warn-500/10">
                    <ImageMinus size={16} /> {t("imged.unlink", "افصل الصورة (تبقى محفوظة)")}
                  </button>
                )}
              </div>

              {p.history && (
                <div className="space-y-2" data-ed-history>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><History size={14} /> {t("imged.history", "صور سابقة لهذه المادة")}</p>
                  {hist === "loading" || hist === null ? (
                    <div className="flex gap-2">{[0, 1, 2].map((i) => <span key={i} className="h-20 w-20 animate-pulse rounded-xl bg-surface-2" />)}</div>
                  ) : hist === "error" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-50 p-2.5 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
                      {t("imged.historyFailed", "ما وصلنا للصور السابقة — أعد المحاولة")}
                      <button type="button" onClick={() => { playTap(); void loadHistory(); }} className="rounded-lg border border-danger-300 px-2 py-1">{t("imged.retry", "أعد المحاولة")}</button>
                    </div>
                  ) : hist.length === 0 ? (
                    <p className="text-2xs text-ink-subtle">{t("imged.historyEmpty", "ما اكو صور سابقة لهذه المادة")}</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {hist.map((h) => {
                        const current = h.path === prod.image_path;
                        return (
                          <button key={h.path} type="button" disabled={!!busy || current} onClick={() => { playTap(); void link(h.path); }}
                            title={current ? t("imged.historyCurrent", "الحالية") : t("imged.relink", "رجّعها")} data-ed-hist={h.path}
                            className={cn("relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-surface-2 transition active:scale-95",
                              current ? "border-brand-500 ring-2 ring-brand-300" : "border-line hover:border-brand-400")}>
                            <img src={productImageUrl(cardImagePath(h.path)) ?? ""} alt="" loading="lazy" className="h-full w-full object-contain"
                              onError={(e) => { const u = productImageUrl(h.path); if (u && e.currentTarget.src !== u) e.currentTarget.src = u; }} />
                            {current && <span className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white"><Check size={12} /></span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid place-items-center rounded-2xl bg-surface-2 p-2">
                <div ref={wrapRef} className="relative inline-block max-w-full touch-none select-none"
                  onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                  <canvas ref={canvasRef} className="block h-auto max-h-[70vh] w-auto max-w-full" />
                  {/* القناعُ أحزمةٌ داخل الصورة وحدها (maskBands) — لا ظلٌّ بلا حدّ يُعتّم الأزرارَ والمعاينة. */}
                  {maskBands(crop).map((b, i) => (
                    <div key={i} aria-hidden className="pointer-events-none absolute bg-black/45" data-ed-mask
                      style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />
                  ))}
                  <div className="absolute border-2 border-white" data-ed-crop
                    style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                    onPointerDown={down("move")}>
                    {(["nw", "ne", "sw", "se"] as const).map((k) => (
                      <span key={k} onPointerDown={down(k)} data-ed-handle={k}
                        className={cn("absolute grid h-8 w-8 place-items-center",
                          k === "nw" && "-left-4 -top-4", k === "ne" && "-right-4 -top-4", k === "sw" && "-bottom-4 -left-4", k === "se" && "-bottom-4 -right-4")}>
                        <span className="h-4 w-4 rounded-full border-2 border-brand-600 bg-white shadow" />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-center text-2xs text-ink-subtle">{t("imged.cropHint", "اسحب الزوايا لقصّ الصورة، أو حرّك الإطار")}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => rotate(-90)} aria-label={t("imged.rotateL", "تدوير لليسار")} data-ed-rotl
                  className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink transition hover:bg-surface-2"><RotateCcw size={18} /></button>
                <button type="button" onClick={() => rotate(90)} aria-label={t("imged.rotateR", "تدوير لليمين")} data-ed-rotr
                  className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink transition hover:bg-surface-2"><RotateCw size={18} /></button>
                <button type="button" onClick={toggleSquare} data-ed-square
                  className={cn("inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition",
                    square ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink hover:bg-surface-2")}>
                  {square ? <Square size={16} /> : <CropIcon size={16} />} {square ? t("imged.square", "مربّع") : t("imged.free", "حر")}
                </button>
                <button type="button" onClick={() => { playTap(); setRot(0); setSquare(false); setCrop(FULL_CROP); }} data-ed-reset
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-ink transition hover:bg-surface-2">
                  <Undo2 size={16} /> {t("imged.reset", "إعادة")}
                </button>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                <div className={cn("relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl", look.tile)}>
                  <span className={cn("px-1 text-center text-2xs font-bold", look.ink)}>{shelfLabel(prod.name)}</span>
                  {cardUrl && <img src={cardUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />}
                </div>
                <div className="min-w-0">
                  <p className="text-2xs font-bold text-ink-subtle">{t("imged.previewCard", "هكذا تظهر بالمتجر")}</p>
                  <p className="line-clamp-2 text-sm font-bold text-ink">{prod.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {stage === "edit" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
            <button type="button" disabled={!!busy} onClick={() => void save(false)} data-ed-save
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
              {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {p.saves === "now" ? t("imged.save", "احفظ") : t("imged.use", "استعملها")}
            </button>
            {p.next && p.onNext && (
              <button type="button" disabled={!!busy} onClick={() => void save(true)} data-ed-savenext title={t("imged.nextName", { name: p.next.name, defaultValue: "الجاية: {{name}}" })}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-400 px-3 text-xs font-bold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-200 dark:hover:bg-brand-500/10">
                {t("imged.saveNext", "احفظ وروح للجاية بلا صورة")}
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => { playTap(); reset(); }} data-ed-replace
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-3 text-xs font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50">
              {t("imged.replace", "بدّل")}
            </button>
            <button type="button" disabled={!!busy} onClick={() => { playTap(); p.onClose(); }} data-ed-cancel
              className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-xs font-bold text-ink-muted transition hover:bg-surface-2 disabled:opacity-50">
              {t("imged.cancel", "إلغاء")}
            </button>
          </div>
        )}

        {/* الكاميرا مباشرةً (capture)، والألبوم/الملفّات بلاه — بالموبايل capture يُخفي الألبوم. */}
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      </div>
    </div>,
    document.body,
  );
}
