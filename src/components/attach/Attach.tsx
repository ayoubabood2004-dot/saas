/* ============================================================================
 * المرفقات: «صوّر / من الجهاز» بكلّ مكانٍ يُرفع منه تحليلٌ أو أشعة، ومرفقاتُ الزيارة (0263).
 *
 * مالكُ نطاق att (hot-paths.json): لا يستورده أحدٌ استيراداً ثابتاً — يُحمَّل بـpage(…, ["att"]) من الزيارة
 * وخزنة الحيوان ونموذج التحاليل، فتصل نصوصُه معه لا مع كلّ صفحة (النصفُ البارد على سقفه).
 *
 * طلبُ المالك (٦/١١): داخل الزيارة نرفق التحاليلَ اللي سوّيناها (مختبرٌ خارجيّ: ورقة أو PDF) وصورَ الأشعة
 * — إرفاقٌ لا إدخالُ قيم. والملفُّ يبقى ملكَ الحيوان: يُرفع لخزنته (`media_items`) ويُختم بزيارته (`visit_id`)،
 * فيظهر بالاثنين. والإرفاقُ من الخزنة والفكُّ تحديثٌ **بشرط حاله كما رآه الطبيب** — صفرُ صفوفٍ يُسمع.
 * ========================================================================== */
import "./attach.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Check, ExternalLink, FileText, FolderOpen, ImagePlus, Loader2, Paperclip, RotateCcw, Unlink } from "lucide-react";
import type { MediaItem, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { prepareUpload } from "@/lib/image";
import { withTimeout, describeUploadError, describeDbError } from "@/lib/errors";
import { acceptFor } from "@/lib/cameraCapture";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatDate, formatNum } from "@/lib/utils";
import { CameraSheet } from "./CameraSheet";

type Kind = MediaItem["kind"];

/** ألوانُ أنواع الملفّات — نفسُ أصناف خزنة الحيوان (PetPassport) حرفاً، فلا صنفَ جديد بورقة الإقلاع. */
const KIND_TONE: Record<string, string> = {
  photo: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  xray: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  ultrasound: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  lab: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200",
  document: "bg-surface-2 text-ink-muted",
};
const isPdf = (m: MediaItem) => m.url.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(m.url) || !!m.caption?.toLowerCase().endsWith(".pdf");
const noRow = (e: unknown) => (e as { code?: string } | null)?.code === "no_row_updated";

/* ── «صوّر» و«من الجهاز» ──────────────────────────────────────────────────────── */

/**
 * زرّان صريحان: «صوّر» يفتح كاميرا داخل السستم، و«من الجهاز» منتقٍ بلا `capture` (صورةٌ محفوظة أو PDF).
 * `lg` زرّان كبيران متجاوران (الرفع)، و`sm` شارتان (صورةُ ورقة الجهاز بنموذج التحليل).
 */
export function PhotoSource({ onFile, accept = "image/*", busy = false, disabled = false, cameraLabel, deviceLabel, size = "lg", cameraTitle }: {
  onFile: (f: File) => void;
  accept?: string;
  busy?: boolean;
  disabled?: boolean;
  cameraLabel?: string;
  deviceLabel?: string;
  size?: "lg" | "sm";
  cameraTitle?: string;
}) {
  const { t } = useTranslation();
  const [cam, setCam] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const off = busy || disabled;
  const closeCam = useCallback(() => setCam(false), []);
  const lg = size === "lg";
  return (
    <>
      <div className={lg ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2"} data-photo-source>
        <button type="button" disabled={off} onClick={() => { playTap(); setCam(true); }} data-source-camera
          className={lg ? "btn-primary gap-2 py-3 text-sm" : "chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink"}>
          {busy ? <Loader2 size={lg ? 18 : 13} className="animate-spin" /> : <Camera size={lg ? 18 : 13} />} {cameraLabel ?? t("att.src.camera")}
        </button>
        <button type="button" disabled={off} onClick={() => { playTap(); input.current?.click(); }} data-source-device
          className={lg ? "btn-secondary gap-2 py-3 text-sm" : "chip bg-surface-2 text-2xs font-bold text-ink-muted transition hover:text-ink"}>
          <ImagePlus size={lg ? 18 : 13} /> {deviceLabel ?? t("att.src.device")}
        </button>
      </div>
      <input ref={input} type="file" accept={accept} className="hidden" data-source-input
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      <CameraSheet open={cam} onClose={closeCam} onFile={onFile} accept={accept} title={cameraTitle} />
    </>
  );
}

/** نوعُ الملفّ ثمّ مصدرُه — والنوعُ يُختم لحظةَ البدء (تبديلُه أثناء الرفع لا يغيّر ما بالطريق). */
export function MediaUploader({ kinds, initialKind, onUpload }: {
  kinds: Kind[];
  initialKind?: Kind;
  onUpload: (f: File, kind: Kind) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>(initialKind ?? kinds[0]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = async (f: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await onUpload(f, kind); } finally { busyRef.current = false; setBusy(false); }
  };
  return (
    <div className="space-y-2" data-media-uploader>
      <div role="radiogroup" aria-label={t("att.up.kind")} className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-bold text-ink-subtle">{t("att.up.kind")}</span>
        {kinds.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={busy} data-kind={k}
            onClick={() => { playTap(); setKind(k); }}
            className={cn("chip text-xs transition", kind === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {t(`media.kind.${k}`)}
          </button>
        ))}
      </div>
      <PhotoSource onFile={(f) => void run(f)} accept={acceptFor(kind)} busy={busy} cameraTitle={t(`media.kind.${kind}`)} />
      {busy && <p className="text-2xs font-bold text-ink-subtle" role="status">{t("att.up.uploading")}</p>}
    </div>
  );
}

/** الرفعُ نفسُه — مضغوطٌ بالجهاز (الصورُ الطبّيةُ بدقّةٍ أعلى: تُكبَّر للتفاصيل)، وبمهلةٍ تسقط بدل أن تدور. */
async function uploadFile(petId: string, file: File, kind: Kind, visitId: string | null): Promise<MediaItem> {
  const prepared = await prepareUpload(file, { maxDim: kind === "photo" ? 1600 : 2400 });
  return withTimeout(repo.uploadMedia(petId, prepared, kind, file.name, visitId), 20000);
}

/** رفعُ خزنة الحيوان (تبويبُ الوسائط) — نفسُ المصدرين، والملفُّ للحيوان وحده (بلا زيارة). */
export function VaultUploader({ petId, kinds, onUploaded }: { petId: string; kinds: Kind[]; onUploaded: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <MediaUploader kinds={kinds} onUpload={async (file, kind) => {
      try {
        await uploadFile(petId, file, kind, null);
        playSuccess();
        toast.success(t("media.uploaded", "Image added to the vault"));
        onUploaded();
      } catch (err) {
        playWarning();
        const detail = err instanceof Error && err.name !== "FileTooLargeError" && err.name !== "TimeoutError" ? err.message : undefined;
        toast.error(describeUploadError(err, t), detail);
      }
    }} />
  );
}

/* ── مرفقاتُ الزيارة ───────────────────────────────────────────────────────────── */

const VISIT_KINDS: Kind[] = ["lab", "xray", "ultrasound", "photo", "document"];

function Thumb({ m, onClick, pressed }: { m: MediaItem; onClick: () => void; pressed?: boolean }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="att-thumb" onClick={onClick} aria-pressed={pressed} data-attachment={m.id}
      aria-label={`${t(`media.kind.${m.kind}`)} ${m.caption ?? ""}`}>
      {isPdf(m)
        ? <span className="att-thumb-pdf"><FileText size={26} /><span className="att-thumb-name">{m.caption}</span></span>
        : <img src={m.url} alt={m.caption ?? ""} loading="lazy" decoding="async" />}
      <span className={cn("chip att-thumb-kind text-[10px]", KIND_TONE[m.kind] ?? KIND_TONE.document)}>{t(`media.kind.${m.kind}`)}</span>
      {pressed !== undefined && <span className="att-thumb-check"><Check size={13} strokeWidth={3} /></span>}
    </button>
  );
}

export function VisitAttachments({ pet, visitId, canEdit }: { pet: Pet; visitId: string; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const lang = i18n.language;
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MediaItem | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const seq = useRef(0);

  /* القائمةُ كلُّها أو «ما انحملت» — لا نصفُ قائمة: مرفقٌ غائبٌ عن شاشةٍ تبدو كاملة يُعاد رفعُه. */
  const load = useCallback(async () => {
    const my = ++seq.current;
    setFailed(false);
    try {
      const xs = await repo.listMedia(pet.id);
      if (my === seq.current) setItems(xs);
    } catch {
      if (my === seq.current) setFailed(true);
    }
  }, [pet.id]);
  useEffect(() => { void load(); }, [load]);

  const mine = useMemo(() => (items ?? []).filter((m) => m.visit_id === visitId), [items, visitId]);
  const loose = useMemo(() => (items ?? []).filter((m) => !m.visit_id), [items]);

  const upload = async (file: File, kind: Kind) => {
    try {
      const m = await uploadFile(pet.id, file, kind, visitId);
      // يظهر فوراً إن كانت القائمةُ معروضة، ثمّ قراءةٌ كاملة تُبطل ما بدأ قبل الرفع (لا قائمةَ من المرفق وحده).
      setItems((xs) => (xs ? [{ ...m, visit_id: m.visit_id ?? visitId }, ...xs] : xs));
      void load();
      playSuccess();
      toast.success(t("att.up.done"));
    } catch (err) {
      playWarning();
      const detail = err instanceof Error && err.name !== "FileTooLargeError" && err.name !== "TimeoutError" ? err.message : undefined;
      toast.error(describeUploadError(err, t), detail);
    }
  };

  const unlink = async (m: MediaItem) => {
    setWorking(true);
    try {
      await repo.setMediaVisit(m.id, null, visitId);
      setItems((xs) => xs?.map((x) => (x.id === m.id ? { ...x, visit_id: null } : x)) ?? xs);
      void load();
      setView(null);
      playSuccess();
      toast.success(t("att.visit.unlinked"));
    } catch (e) {
      playWarning();
      toast.error(noRow(e) ? t("att.visit.changed") : describeDbError(e, t));
      void load();
    } finally {
      setWorking(false);
    }
  };

  const attachPicked = async () => {
    setWorking(true);
    let ok = 0;
    let moved = 0;
    try {
      for (const id of picked) {
        try {
          await repo.setMediaVisit(id, visitId, null);
          ok++;
        } catch (e) {
          if (noRow(e)) { moved++; continue; }
          playWarning();
          toast.error(describeDbError(e, t));
          break;
        }
      }
    } finally {
      setWorking(false);
      setPicked([]);
      setPicking(false);
      await load();
    }
    if (ok) { playSuccess(); toast.success(t("att.visit.attached", { n: formatNum(ok) })); }
    if (moved) toast.toast({ tone: "info", title: t("att.visit.moved") });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-3 sm:p-4" data-visit-attachments>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-brand-600 dark:from-brand-500/25 dark:to-brand-500/10 dark:text-brand-300"><Paperclip size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
            {t("att.visit.title")}
            {mine.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-black text-ink-muted">{formatNum(mine.length)}</span>}
          </h2>
          {canEdit && <p className="text-2xs text-ink-subtle">{t("att.visit.hint")}</p>}
        </div>
        {canEdit && loose.length > 0 && (
          <button type="button" onClick={() => { playTap(); setPicked([]); setPicking(true); }} data-attach-from-file
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-brand-700">
            <FolderOpen size={14} /> {t("att.visit.fromFile", { n: formatNum(loose.length) })}
          </button>
        )}
      </div>

      {canEdit && (
        <div className="mb-3">
          <MediaUploader kinds={VISIT_KINDS} initialKind="lab" onUpload={upload} />
        </div>
      )}

      {failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 text-xs dark:border-danger-500/30 dark:bg-danger-500/10" data-attachments-failed>
          <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">{t("att.visit.loadFailed")}</span>
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={() => void load()}>{t("common.retry")}</Button>
        </div>
      ) : items === null ? (
        <p className="flex items-center gap-2 text-2xs text-ink-subtle"><Loader2 size={13} className="animate-spin" /> {t("att.visit.loading")}</p>
      ) : mine.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-2xs text-ink-subtle" data-attachments-empty>{t("att.visit.empty")}</p>
      ) : (
        <div className="att-grid" data-attachments-grid>
          {mine.map((m) => <Thumb key={m.id} m={m} onClick={() => { playTap(); setView(m); }} />)}
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} size="wide"
        title={view ? `${t(`media.kind.${view.kind}`)} · ${formatDate(view.created_at, lang)}` : ""}>
        {view && (
          <div className="space-y-3" data-attachment-view>
            {isPdf(view)
              ? <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted"><FileText size={18} /> {view.caption}</p>
              : <img src={view.url} alt={view.caption ?? ""} className="att-view-img" />}
            <div className="flex flex-wrap items-center gap-2">
              <a href={view.url} target="_blank" rel="noreferrer" className="btn-secondary gap-2 text-sm">
                <ExternalLink size={15} /> {t("att.visit.open")}
              </a>
              {canEdit && (
                <button type="button" disabled={working} onClick={() => void unlink(view)} data-attachment-unlink
                  className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-bold text-ink-muted transition hover:border-danger-300 hover:text-danger-600 disabled:opacity-50">
                  <Unlink size={14} /> {t("att.visit.unlink")}
                </button>
              )}
            </div>
            {canEdit && <p className="text-end text-2xs text-ink-subtle">{t("att.visit.unlinkHint")}</p>}
          </div>
        )}
      </Modal>

      <Modal open={picking} onClose={() => { if (!working) setPicking(false); }} size="wide" title={t("att.visit.pickTitle", { name: pet.name })}>
        <div className="space-y-3" data-attach-picker>
          <p className="text-xs text-ink-subtle">{t("att.visit.pickHint")}</p>
          <div className="att-grid">
            {loose.map((m) => (
              <Thumb key={m.id} m={m} pressed={picked.includes(m.id)}
                onClick={() => { playTap(); setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id])); }} />
            ))}
          </div>
          <div className="flex justify-end border-t border-line pt-3">
            <Button leftIcon={<Paperclip size={16} />} disabled={!picked.length} loading={working} onClick={() => void attachPicked()} data-attach-picked>
              {t("att.visit.attachN", { n: formatNum(picked.length) })}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
