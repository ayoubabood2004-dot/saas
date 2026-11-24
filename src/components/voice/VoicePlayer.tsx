/* ============================================================================
 * مشغّلُ الملاحظة الصوتية — رفيقُ نطاق vnote (يستورده VoiceNotes.tsx وحده).
 *
 * التشغيلُ **داخل الضغطة** (آيفون لا يشغّل بعد await): الرابطُ موقَّعٌ مسبقاً (يُجدَّد كلَّ ٤٥ دقيقة)
 * فـ`play()` متزامن. واحدٌ يشتغل بوقتٍ واحد، ولا شيء أثناء التسجيل. «الصيغةُ ما تشتغل» يحكمها
 * `canPlayHere` وحده — الخطأُ ٤ على صيغةٍ تشتغل = الرابطُ انتهى أو النقلُ فشل، فيُعاد توقيعه مرّة.
 * وOpus حيث لا يشغّله `<audio>` (آيفون ≤ 17.3): فكٌّ بـWebAudio بلا سرعة (تغيّر طبقةَ الصوت).
 * المدّةُ المعروضة مخزّنةٌ من الحاوية لا `audio.duration` (كروم يرجعها Infinity لـWebM).
 * ========================================================================== */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { canPlayHere, fmtDuration } from "@/lib/voice/voiceFormat";
import { REC_EVENT } from "@/lib/voice/voiceRecorder";
import type { VoiceMime } from "@/lib/voice/voiceTypes";

/* ── واحدٌ يشتغل، ولا شيء أثناء التسجيل ─────────────────────────────────── */
let current: { key: string; stop: () => void } | null = null;
let recOn = false;
const recSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener(REC_EVENT, (e) => {
    recOn = !!(e as CustomEvent<{ on?: boolean }>).detail?.on;
    if (recOn) { current?.stop(); current = null; }
    for (const f of [...recSubs]) f();
  });
}
const useRecOn = () => useSyncExternalStore((cb) => { recSubs.add(cb); return () => { recSubs.delete(cb); }; }, () => recOn);

const RATE_KEY = "vp_voice_rate";
const RATES = [1, 1.5, 2] as const;
const readRate = (): number => {
  try { const v = Number(localStorage.getItem(RATE_KEY)); return (RATES as readonly number[]).includes(v) ? v : 1; } catch { return 1; }
};

type AudioSessionNav = Navigator & { audioSession?: { type: string } };
const sessionType = (t: "playback" | "auto") => {
  try { const s = (navigator as AudioSessionNav).audioSession; if (s) s.type = t; } catch { /* — */ }
};

export interface PlayerProps {
  /** هويّةُ ما يُشغَّل (المعرّف) — لإيقاف غيره. */
  id: string;
  /** رابطٌ موقَّع أو blob: — null = لم يجهز بعد. */
  url: string | null;
  mime: VoiceMime;
  codecs: string | null;
  durationMs: number;
  /** وقّع الرابطَ ثانيةً (انتهى/فشل نقلُه) — يرجع الجديد. */
  resign?: () => Promise<string | null>;
  /** البايتاتُ مباشرةً (تسجيلُ الجهاز) — لفكّ Opus بلا fetch(blob:) الذي تمنعه السياسة. */
  bytes?: () => Promise<ArrayBuffer | null>;
  compact?: boolean;
}

export function VoicePlayer({ id, url, mime, codecs, durationMs, resign, bytes, compact = false }: PlayerProps) {
  const { t } = useTranslation();
  const rec = useRecOn();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(readRate);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const retried = useRef(false);
  const srcRef = useRef<string | null>(url);
  // الرابطُ يتبع الخاصيّةَ حين **تتغيّر** وحدها: كتابتُه بكلّ رسمة كانت تدوس رابطاً أعاد المشغّلُ توقيعَه (بعد خطأ ٤)
  // فترجع الضغطةُ التالية بالمنتهي — «ما انحمّل» على آيفون بعد «اضغط تشغيل مرّة ثانية».
  useEffect(() => { if (url) { srcRef.current = url; retried.current = false; } }, [url]);

  // WebAudio (Opus على جهازٍ لا يشغّله): البفرُ مفكوكٌ مرّةً، والموضعُ يُحسب من ساعة السياق.
  const wa = useRef<{ ctx: AudioContext; buf: AudioBuffer | null; node: AudioBufferSourceNode | null; t0: number; off: number; timer: ReturnType<typeof setInterval> | null } | null>(null);
  const [fallback, setFallback] = useState(false);

  const native = useCallback((): boolean => {
    const a = audio.current;
    return !a || canPlayHere(mime, codecs, (x) => a.canPlayType(x));
  }, [mime, codecs]);

  const stopAll = useCallback(() => {
    const a = audio.current;
    if (a && !a.paused) a.pause();
    const w = wa.current;
    if (w?.node) {
      w.off = Math.min(durationMs / 1000, w.ctx.currentTime - w.t0);
      try { w.node.onended = null; w.node.stop(); } catch { /* — */ }
      w.node = null;
      if (w.timer) { clearInterval(w.timer); w.timer = null; }
      setPlaying(false);
      sessionType("auto");
    }
  }, [durationMs]);

  useEffect(() => () => {
    stopAll();
    if (current?.key === id) current = null;
    try { void wa.current?.ctx.close(); } catch { /* — */ }
  }, [id, stopAll]);

  const claim = () => {
    if (current && current.key !== id) current.stop();
    current = { key: id, stop: stopAll };
  };

  /* ── WebAudio ─────────────────────────────────────────────────────────── */
  const waStart = (offSec: number) => {
    const w = wa.current;
    if (!w?.buf) return;
    const node = w.ctx.createBufferSource();
    node.buffer = w.buf;
    node.connect(w.ctx.destination);
    node.onended = () => { if (w.node === node) { w.node = null; w.off = 0; setPos(0); setPlaying(false); sessionType("auto"); if (w.timer) { clearInterval(w.timer); w.timer = null; } } };
    w.node = node;
    w.t0 = w.ctx.currentTime - offSec;
    node.start(0, offSec);
    if (w.timer) clearInterval(w.timer);
    w.timer = setInterval(() => setPos(Math.min(durationMs, (w.ctx.currentTime - w.t0) * 1000)), 200);
    setPlaying(true);
  };

  const playFallback = () => {
    // السياقُ داخل الضغطة (آيفون)، والفكُّ بعدها
    if (!wa.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) { setMsg(t("vnote.play.cant", { fmt: "opus" })); return; }
      wa.current = { ctx: new AC(), buf: null, node: null, t0: 0, off: 0, timer: null };
    }
    const w = wa.current;
    void w.ctx.resume();
    claim();
    sessionType("playback");
    if (w.buf) { waStart(w.off); return; }
    setBusy(true);
    void (async () => {
      try {
        let data: ArrayBuffer | null = bytes ? await bytes() : null;
        if (!data && srcRef.current && !srcRef.current.startsWith("blob:")) data = await (await fetch(srcRef.current)).arrayBuffer();
        if (!data) throw new Error("no_bytes");
        w.buf = await w.ctx.decodeAudioData(data.slice(0));
        if (current?.key === id) waStart(w.off);
      } catch {
        setMsg(t("vnote.play.cant", { fmt: "opus" }));
      } finally { setBusy(false); }
    })();
  };

  /* ── <audio> ──────────────────────────────────────────────────────────── */
  const toggle = () => {
    setMsg(null);
    if (rec) return;
    if (playing) { stopAll(); return; }
    if (fallback || !native()) { setFallback(true); playFallback(); return; }
    const a = audio.current;
    const src = srcRef.current;
    if (!a || !src) return;
    claim();
    if (a.getAttribute("src") !== src) a.src = src;
    a.preload = "auto";
    a.playbackRate = rate;
    sessionType("playback");
    const p = a.play();
    if (p) p.catch((e: unknown) => {
      if ((e as { name?: string } | null)?.name === "NotAllowedError") setMsg(t("vnote.play.again"));
    });
  };

  const onError = () => {
    const a = audio.current;
    setPlaying(false);
    if (!a?.error) return;
    if (!native()) { setFallback(true); setMsg(null); return; }
    // صيغةٌ تشتغل هنا وخطأ ⇒ الرابطُ انتهى أو النقلُ فشل: يُعاد توقيعه مرّةً وتُعاد المحاولة
    if (resign && !retried.current) {
      retried.current = true;
      void resign().then((next) => {
        if (!next || !audio.current) { setMsg(t("vnote.play.loadFailed")); return; }
        srcRef.current = next;
        audio.current.src = next;
        audio.current.playbackRate = rate;
        const p = audio.current.play();
        if (p) p.catch(() => setMsg(t("vnote.play.again")));
      }).catch(() => setMsg(t("vnote.play.loadFailed")));
      return;
    }
    setMsg(t("vnote.play.loadFailed"));
  };

  const seek = (ms: number) => {
    if (fallback) {
      const w = wa.current;
      if (!w?.buf) return;
      const was = !!w.node;
      if (was) { try { w.node!.onended = null; w.node!.stop(); } catch { /* — */ } w.node = null; }
      w.off = ms / 1000;
      setPos(ms);
      if (was) waStart(w.off);
      return;
    }
    const a = audio.current;
    if (!a) return;
    const s = ms / 1000;
    // داخل ما يُقفز إليه فقط — بلا مدى (WebM بلا فهرس) الشريطُ يعرض التقدّم وحده
    for (let i = 0; i < a.seekable.length; i++) {
      if (s >= a.seekable.start(i) && s <= a.seekable.end(i)) { a.currentTime = s; setPos(ms); return; }
    }
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    setRate(next);
    try { localStorage.setItem(RATE_KEY, String(next)); } catch { /* — */ }
    if (audio.current) audio.current.playbackRate = next;
  };

  const off = rec || !url;
  return (
    <div className="min-w-0">
      <div className={cn("flex items-center gap-2", compact && "gap-1.5")} dir="ltr">
        <button
          type="button"
          data-voice-play={id}
          onClick={toggle}
          disabled={off}
          title={rec ? t("vnote.play.busyRec") : undefined}
          aria-label={playing ? t("vnote.play.pause") : t("vnote.play.play")}
          className={cn("grid shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-45",
            compact ? "h-9 w-9" : "h-11 w-11")}
        >
          {busy || (!url && !rec) ? <Loader2 size={16} className="animate-spin" /> : playing ? <Pause size={16} /> : <Play size={16} className="ms-0.5" />}
        </button>
        <input
          type="range" min={0} max={Math.max(1, durationMs)} step={100} value={Math.min(pos, durationMs)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={off}
          aria-label={t("vnote.play.seek")}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand-600"
        />
        <span className="shrink-0 text-2xs font-bold tabular-nums text-ink-muted">{fmtDuration(pos)} / {fmtDuration(durationMs)}</span>
        {!compact && !fallback && (
          <button type="button" onClick={cycleRate} aria-label={t("vnote.play.speed")}
            className="shrink-0 rounded-full border border-line px-2 py-1 text-2xs font-extrabold tabular-nums text-ink-muted transition hover:text-ink">
            {rate}×
          </button>
        )}
      </div>
      {msg && <p className="mt-1 text-2xs font-bold text-danger-600" role="status">{msg}</p>}
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); sessionType("auto"); }}
        onEnded={() => { setPlaying(false); setPos(0); sessionType("auto"); if (current?.key === id) current = null; }}
        onTimeUpdate={(e) => setPos(Math.min(durationMs, e.currentTarget.currentTime * 1000))}
        onError={onError}
        className="hidden"
      />
    </div>
  );
}
