// ============================================================================
// استبدالُ صور المكتبة بنسخٍ أوضح من مجلّد — لوحةٌ بشاشة المكتبة (رفيقُ ImageLibraryManager بالنطاق `libm`).
//
// صورُ الإكسل مصغّراتٌ بـ٩٠ بكسل، والأصلُ عند المالك ملفّاتٌ «اسم المنتج__الباركود.png». يختار المجلّدَ (أو الصور)
// من جهازه، فتُرى **الخطّةُ قبل أيّ رفع** (planReplace): كم انربط بالباركود وكم بالاسم، وما لم ينربط بأسمائه،
// وما يطابق أكثرَ من صورة فلا يُلمس، و«قبل ← بعد» لأوّلها. والرفعُ ثلاثٌ بالمرّة، بخلفيةٍ بيضاء (PNG شفّافٌ يصير
// أسودَ بـJPEG بلاها) وبحجمٍ أكبر من الاستيراد (١٢٠٠)، ويقف بضغطة أو عند انقطاع الشبكة، والمتبدّلُ بالجولة لا يُعاد.
// الصورُ لا تمرّ إلا من المتصفّح إلى مخزن العيادة نفسِه.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, ImagePlus, RefreshCw, Square, ArrowLeft } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { prepareUpload } from "@/lib/image";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError, describeUploadError, isNetworkError } from "@/lib/errors";
import { holdUntil } from "@/lib/inflight";
import { cleanLibName } from "@/lib/libraryLevels";
import { cn, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { mediaType, planReplace, type ReplacePlan } from "@/lib/libraryImport";
import type { LibraryImage } from "@/types";

type Run = { done: number; total: number; failed: number; firstError: string | null; stopped: null | "user" | "network" };
const PREVIEW = 8;

export function LibraryReplace({ library, onChanged }: { library: LibraryImage[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMiss, setShowMiss] = useState(false);
  const stopRef = useRef(false);
  /** صفوفٌ تبدّلت بهذه الجولة — إعادةُ «استبدل» بعد وقوفٍ تكمل الباقي ولا ترفع ما رُفع مرّةً ثانية. */
  const doneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const plan: ReplacePlan<File> | null = useMemo(() => (files.length ? planReplace(files, library) : null), [files, library]);
  const todo = useMemo(() => (plan ? plan.matched.filter((m) => !doneRef.current.has(m.row.id)) : []), [plan, run]);   // eslint-disable-line react-hooks/exhaustive-deps

  // «قبل ← بعد» لأوّل الصور: عنوانٌ محلّيّ للملفّ يُحرَّر حين تتبدّل القائمة.
  const previews = useMemo(() => (plan ? plan.matched.slice(0, PREVIEW).map((m) => ({ ...m, url: URL.createObjectURL(m.file) })) : []), [plan]);
  useEffect(() => () => { for (const p of previews) URL.revokeObjectURL(p.url); }, [previews]);

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    playTap();
    doneRef.current = new Set();
    setRun(null); setShowMiss(false);
    setFiles([...list]);
  };

  const replace = async () => {
    if (busy || todo.length === 0) return;
    playTap();
    stopRef.current = false;
    setBusy(true);
    const state: Run = { done: 0, total: todo.length, failed: 0, firstError: null, stopped: null };
    setRun({ ...state });
    let next = 0;
    const worker = async () => {
      while (!stopRef.current && !state.stopped) {
        const i = next++;
        if (i >= todo.length) return;
        const m = todo[i];
        // أكبر من الاستيراد (١٢٠٠ لا ٨٠٠) وبخلفيةٍ بيضاء: صورُ المنتجات PNG بخلفيةٍ شفّافة تصير سوداء بـJPEG.
        let photo: Awaited<ReturnType<typeof prepareUpload>> | null = null;
        // ملفّاتُ المجلّد قد تصل بلا نوع (مقيس: كروميوم يختار مجلّداً فيعطي type فارغاً) فيقرؤها الترميزُ «مو صورة» —
        // النوعُ من الامتداد حين يغيب، والاسمُ نفسُه بالخطّة قال إنها صورة (isImageFileName).
        const file = m.file.type.startsWith("image/") ? m.file : new File([m.file], m.file.name, { type: mediaType(m.file.name) });
        try { photo = await prepareUpload(file, { maxDim: 1200, quality: 0.85, background: "#ffffff" }); }
        catch (e) { state.failed++; state.firstError ??= `${m.file.name}: ${describeUploadError(e, t)}`; }
        if (photo) {
          try {
            await repo.replaceLibraryImage(m.row, photo);
            doneRef.current.add(m.row.id);
            state.done++;
          } catch (e) {
            if (isNetworkError(e)) { state.stopped = "network"; return; }
            state.failed++;
            state.firstError ??= `${m.file.name}: ${describeDbError(e, t)}`;
          }
        }
        setRun({ ...state });
      }
    };
    try {
      await holdUntil(Promise.all([worker(), worker(), worker()]));
    } finally {
      if (stopRef.current && !state.stopped) state.stopped = "user";
      setRun({ ...state });
      setBusy(false);
      onChanged();
    }
    if (state.stopped === "network") playWarning();
    else if (!state.stopped && state.failed === 0) { playSuccess(); toast.success(t("libm.rep.done", { n: formatNum(state.done) })); }
  };

  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  const byCode = plan ? plan.matched.filter((m) => m.by === "barcode").length : 0;

  return (
    <div className="card space-y-3 p-4" data-libreplace>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><RefreshCw size={16} className="text-brand-600" /> {t("libm.rep.title")}</h3>
          <p className="mt-0.5 text-2xs text-ink-subtle">{t("libm.rep.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<FolderOpen size={14} />} disabled={busy} onClick={() => { playTap(); folderRef.current?.click(); }} data-libreplace-folder>
            {t("libm.rep.pickFolder")}
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<ImagePlus size={14} />} disabled={busy} onClick={() => { playTap(); filesRef.current?.click(); }} data-libreplace-files>
            {t("libm.rep.pickFiles")}
          </Button>
        </div>
        {/* المجلّدُ بـwebkitdirectory (كروم وإيدج وفايرفوكس وسفاري الحاسوب)، والصورُ بالتحديد المتعدّد لمن لا يدعمه. */}
        <input ref={folderRef} type="file" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
        <input ref={filesRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </div>

      {plan && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3" data-libreplace-plan>
          <ul className="space-y-0.5 text-sm">
            <li className="font-extrabold text-ink" data-rep-matched={plan.matched.length}>
              {t("libm.rep.matched", { n: formatNum(plan.matched.length), b: formatNum(byCode), m: formatNum(plan.matched.length - byCode) })}
            </li>
            {plan.unmatched.length > 0 && (
              <li className="text-warn-700">
                {t("libm.rep.unmatched", { n: formatNum(plan.unmatched.length) })}{" "}
                <button type="button" className="underline" onClick={() => { playTap(); setShowMiss((v) => !v); }} data-rep-showmiss>{t("libm.rep.showUnmatched")}</button>
              </li>
            )}
            {plan.ambiguous.length > 0 && <li className="text-warn-700">{t("libm.rep.ambiguous", { n: formatNum(plan.ambiguous.length) })}</li>}
            {plan.dupFiles.length > 0 && <li className="text-ink-muted">{t("libm.rep.dup", { n: formatNum(plan.dupFiles.length) })}</li>}
            {plan.notImage.length > 0 && <li className="text-2xs text-ink-subtle">{t("libm.rep.notImage", { n: formatNum(plan.notImage.length) })}</li>}
          </ul>
          {showMiss && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-surface-1 p-2 text-2xs text-ink-muted" data-rep-misslist>
              {[...plan.unmatched, ...plan.ambiguous.map((a) => a.file)].map((f, i) => <li key={i} dir="auto" className="truncate">{f.name}</li>)}
            </ul>
          )}

          {previews.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-2xs font-bold text-ink-muted">{t("libm.rep.preview")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-rep-previews>
                {previews.map((p) => (
                  <div key={p.row.id} className="rounded-xl border border-line bg-surface-1 p-1.5">
                    <div className="flex items-center gap-1">
                      <img src={productImageUrl(p.row.path) ?? undefined} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain" />
                      <ArrowLeft size={14} className="shrink-0 text-ink-subtle ltr:rotate-180" />
                      <img src={p.url} alt="" className="h-14 min-w-0 flex-1 rounded-lg bg-white object-contain" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-2xs font-bold text-ink" dir="auto">{cleanLibName(p.row.name)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {run && (
            <div className="space-y-1" data-libreplace-run>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="text-2xs font-bold text-ink-muted">
                {busy ? t("libm.rep.running", { done: formatNum(run.done), n: formatNum(run.total) })
                  : run.stopped === "network" ? t("libm.network")
                  : run.stopped === "user" ? t("libm.rep.stopped", { done: formatNum(run.done), n: formatNum(run.total) })
                  : t("libm.rep.done", { n: formatNum(run.done) })}
              </p>
              {run.failed > 0 && <p className="text-2xs font-bold text-warn-700">{t("libm.rep.failed", { n: formatNum(run.failed) })}{run.firstError ? ` — ${run.firstError}` : ""}</p>}
            </div>
          )}

          <p className="text-2xs text-ink-subtle">{t("libm.rep.keepOld")}</p>
          <div className="flex flex-wrap gap-2">
            {busy ? (
              <Button size="sm" variant="secondary" leftIcon={<Square size={14} />} onClick={() => { playTap(); stopRef.current = true; }} data-libreplace-stop>
                {t("libm.stop")}
              </Button>
            ) : (
              <Button size="sm" leftIcon={<RefreshCw size={14} />} disabled={todo.length === 0} onClick={() => void replace()} data-libreplace-go
                className={cn(todo.length === 0 && "opacity-60")}>
                {t("libm.rep.go", { n: formatNum(todo.length) })}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
