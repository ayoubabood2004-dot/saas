/* ============================================================================
 * المسجِّل على الشاشة — رفيقُ نطاق vnote (يستورده VoiceNotes.tsx وحده).
 *
 * «وقّف» = محفوظٌ على الجهاز ثمّ يبدأ الرفع؛ لا معاينةَ تُمسك الحفظ. لا شيء يُسجَّل بلا المسجِّل على
 * الشاشة: إغلاقُ النافذة أو تبديلُ الصفحة يوقف ويحفظ ويقول ذلك. والإلغاءُ بعد خمس ثوانٍ يسأل داخل
 * النافذة (لا window.confirm). التسجيلُ نفسُه بـvoiceRecorder.ts (بلا React)؛ هنا الرسمُ وحده.
 * ========================================================================== */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Mic, Square, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fmtDuration, DEMO_VOICE_MAX_MS } from "@/lib/voice/voiceFormat";
import { MAX_MS, VoiceRecorder, type RecSnapshot, type RecTarget } from "@/lib/voice/voiceRecorder";
import { lowSpace } from "@/lib/voice/voiceShelf";
import type { LocalClip } from "@/lib/voice/voiceTypes";

const IDLE: RecSnapshot = { phase: "idle", elapsedMs: 0, level: 0, silent: false, near: false, memoryOnly: false, wake: null };

export function VoiceRecorderPanel({ target, demo, onBusy, onSaved }: {
  target: RecTarget;
  demo: boolean;
  /** يسجّل الآن (النافذةُ لا تُغلق بالستارة ولا Esc). */
  onBusy?: (busy: boolean) => void;
  onSaved?: (clip: LocalClip) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const maxMs = demo ? DEMO_VOICE_MAX_MS : MAX_MS;
  const rec = useRef<VoiceRecorder | null>(null);
  const [snap, setSnap] = useState<RecSnapshot>(IDLE);
  const [askCancel, setAskCancel] = useState(false);
  const [explain, setExplain] = useState(false);
  const [low, setLow] = useState(false);
  const live = snap.phase === "starting" || snap.phase === "recording" || snap.phase === "saving";

  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => { onBusyRef.current?.(live); }, [live]);

  // إذنُ المايك (سطرُ شرحٍ ما دام لم يُمنح أو لا يُسأل)، والمساحة
  useEffect(() => {
    let on = true;
    const perms = (navigator as Navigator & { permissions?: { query(d: { name: string }): Promise<{ state: string }> } }).permissions;
    if (!perms?.query) setExplain(true);
    else perms.query({ name: "microphone" }).then((s) => { if (on) setExplain(s.state !== "granted"); }).catch(() => { if (on) setExplain(true); });
    navigator.storage?.estimate?.().then((e) => { if (on) setLow(lowSpace(e)); }).catch(() => undefined);
    return () => { on = false; };
  }, []);

  // الخروجُ وهو يسجّل = يوقف ويحفظ ويقولها (لا تسجيلَ بلا مسجِّلٍ على الشاشة)
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tRef = useRef(t);
  tRef.current = t;
  // بلا اعتماديات: الأثرُ يُنظَّف عند الخروج وحده (تبدّلُ `t` بوصول النصوص كان سيوقف تسجيلاً شغّالاً)
  useEffect(() => () => {
    const r = rec.current;
    if (!r) return;
    const s = r.snapshot();
    if (s.phase === "starting") { void r.cancel(); return; }
    if (s.phase === "recording") {
      const dur = fmtDuration(s.elapsedMs);
      void r.stop("closed").then((clip) => {
        if (clip) toastRef.current.toast({ tone: "info", title: tRef.current("vnote.rec.cutClosed", { dur }) });
      });
    }
    onBusyRef.current?.(false);
  }, []);

  const start = () => {
    setAskCancel(false);
    const r = new VoiceRecorder(target, (s) => {
      setSnap(s);
      if (s.phase === "done" && s.clip) onSaved?.(s.clip);
      if (s.phase === "recording") setExplain(false);
    }, { maxMs });
    rec.current = r;
    void r.start(); // داخل الضغطة: سياقُ الصوت قبل أوّل await
  };

  const stop = () => { void rec.current?.stop(); };
  const cancel = () => {
    if (snap.elapsedMs >= 5_000 && !askCancel) { setAskCancel(true); return; }
    setAskCancel(false);
    void rec.current?.cancel();
  };

  const clip = snap.phase === "done" ? snap.clip : undefined;
  const cut = clip?.interrupted;
  const remain = Math.max(0, Math.ceil((maxMs - snap.elapsedMs) / 1000));

  return (
    <div data-voice-recorder className="rounded-2xl border border-line bg-surface-2/60 p-3">
      {snap.phase === "recording" || snap.phase === "saving" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3" dir="ltr">
            <span className={cn("h-3 w-3 shrink-0 rounded-full bg-danger-500", snap.phase === "recording" && "animate-pulse")} aria-hidden />
            <span data-voice-timer className={cn("text-lg font-extrabold tabular-nums", snap.near ? "text-warn-600" : "text-ink")}>
              {fmtDuration(snap.elapsedMs)} / {fmtDuration(maxMs)}
            </span>
            <span className="flex h-6 items-end gap-0.5" aria-hidden>
              {[0.1, 0.25, 0.45, 0.65, 0.85].map((th, i) => (
                <span key={i} className={cn("w-1.5 rounded-sm transition-colors", snap.level >= th ? "bg-brand-500" : "bg-line-strong")} style={{ height: `${8 + i * 4}px` }} />
              ))}
            </span>
            <span className="ms-auto text-2xs font-bold text-ink-subtle">{snap.phase === "saving" ? t("vnote.st.saving") : t("vnote.rec.live")}</span>
          </div>
          {snap.near && snap.phase === "recording" && <p className="text-xs font-bold text-warn-700 dark:text-warn-200">{t("vnote.rec.near", { s: remain })}</p>}
          {snap.silent && snap.phase === "recording" && <Warn>{t("vnote.rec.silent")}</Warn>}
          {snap.memoryOnly && <Warn>{t("vnote.rec.memoryOnly")}</Warn>}
          {snap.wake === false && snap.phase === "recording" && <p className="text-2xs text-ink-subtle">{t("vnote.rec.wakeWarn")}</p>}
          {askCancel ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2 dark:border-danger-500/30 dark:bg-danger-500/10">
              <span className="text-xs font-bold text-danger-700 dark:text-danger-200">{t("vnote.rec.cancelAsk", { dur: fmtDuration(snap.elapsedMs) })}</span>
              <button type="button" onClick={cancel} className="rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-extrabold text-white">{t("vnote.rec.cancelYes")}</button>
              <button type="button" onClick={() => setAskCancel(false)} className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink">{t("vnote.rec.cancelNo")}</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" data-voice-stop onClick={stop} disabled={snap.phase === "saving"} style={{ minHeight: 56 }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-danger-600 px-4 text-sm font-extrabold text-white shadow-soft transition hover:bg-danger-700 disabled:opacity-60">
                {snap.phase === "saving" ? <Loader2 size={18} className="animate-spin" /> : <Square size={16} />} {t("vnote.rec.stop")}
              </button>
              <button type="button" onClick={cancel} disabled={snap.phase === "saving"} style={{ minHeight: 56 }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-4 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-60">
                <X size={15} /> {t("vnote.rec.cancel")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" data-voice-start onClick={start} disabled={snap.phase === "starting"}
            aria-label={t("vnote.rec.start")}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-danger-600 text-white shadow-soft transition hover:bg-danger-700 disabled:opacity-60">
            {snap.phase === "starting" ? <Loader2 size={22} className="animate-spin" /> : <Mic size={22} />}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-extrabold text-ink">{snap.phase === "starting" ? t("vnote.rec.starting") : clip && cut === "limit" ? t("vnote.rec.again") : t("vnote.rec.start")}</p>
            <p className="text-2xs text-ink-subtle">{t("vnote.rec.hint", { max: fmtDuration(maxMs) })}</p>
            {explain && snap.phase !== "error" && <p className="text-2xs font-semibold text-ink-muted">{t("vnote.rec.explain")}</p>}
            {low && <p className="text-2xs font-bold text-warn-700 dark:text-warn-200">{t("vnote.rec.lowSpace")}</p>}
          </div>
          {snap.phase === "error" && snap.error && (
            <div className="basis-full"><Warn>{snap.error === "busy_other" ? t("vnote.rec.busyOther") : t(`vnote.mic.${snap.error}`)}</Warn></div>
          )}
          {snap.phase === "done" && snap.short && <p className="basis-full text-xs font-bold text-warn-700 dark:text-warn-200">{t("vnote.rec.short")}</p>}
          {clip && (
            <p className="basis-full text-xs font-bold text-brand-700 dark:text-brand-300" role="status">
              {cut === "limit" ? t("vnote.rec.limit", { max: fmtDuration(maxMs) })
                : cut === "hidden" ? t("vnote.rec.cutHidden")
                : cut === "track" ? t("vnote.rec.cutTrack")
                : t("vnote.rec.saved")}
              {clip.maybe_cut ? ` · ${t("vnote.rec.maybeCut")}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-warn-50 px-2.5 py-1.5 text-xs font-bold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200" role="status">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </p>
  );
}
