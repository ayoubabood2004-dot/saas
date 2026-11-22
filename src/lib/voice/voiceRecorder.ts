/* ============================================================================
 * المسجِّل — متحكّمٌ بلا React ولا Supabase (0287، §C).
 *
 * يبدأ داخل الضغطة (سياقُ الصوت يُنشأ قبل أيّ await — قاعدةُ آيفون)، ويطلب المايك بإلغاء الصدى والضجيج،
 * ويسجّل بالصيغة التي تُسمع بكلّ جهاز (voiceFormat)، قطعةً كلَّ ثانية: الذاكرةُ الحقيقة وIndexedDB مرآتُها. وكلُّ
 * انقطاع (الشاشةُ انقفلت، التطبيقُ اختفى، اتصال، خطأ، الحدُّ ٥ دقائق، الخروج) **يوقف ويحفظ** — لا يرمي ما سُجّل.
 * وأثناءه: قفلٌ (Web Locks) يقول «حيّ» لكلّ تبويب، وإمساكٌ للتحديث، ونغماتُ الواجهة مكتومة، والمشغّلاتُ موقوفة.
 * وعند الإيقاف: المدّةُ من الحاوية لا من الساعة، والبصمة، والتحقّقُ من المرآة، ثمّ «على هالجهاز» بكتابةٍ مؤكَّدة،
 * ثمّ الرافع.
 * ========================================================================= */
import { cameraPhaseOf } from "../cameraCapture";
import { holdUpdates, onLeave, setLeaveGate } from "../inflight";
import { outboxInternals } from "../outbox";
import { muteSounds } from "../sounds";
import { uuid } from "../utils";
import { baseMime, codecsOf, pickFormat } from "./voiceFormat";
import { finalBytes, sha256Hex } from "./voiceMedia";
import {
  allClips, ChunkMirror, contiguousRun, deleteClipSafe, getShelf, isClipLive, keepMemoryHold, liveIds, memoryParts,
  putClipSafe, REC_LOCK, shelfChanged,
} from "./voiceShelf";
import { kickUploader } from "./voiceUploader";
import type { LocalClip, VoiceKind, VoiceMime } from "./voiceTypes";

/** أطولُ تسجيل (قرارُ المالك ٢٢/١١)، والتنبيهُ قبله بنصف دقيقة، وأقصرُ ما يُحفظ. */
export const MAX_MS = 300_000;
export const NEAR_MS = 270_000;
export const MIN_MS = 1_000;
/** صمتٌ تامّ ٣ ثوانٍ = «ما يوصل صوت للمايك». */
export const SILENT_MS = 3_000;
/** المسجِّلُ يعلن نفسَه للمشغّلات (توقف وتُعطَّل ما دام يسجّل). */
export const REC_EVENT = "vp:voice-rec";

export type RecError = "denied" | "busy" | "unavailable" | "failed" | "unsupported" | "busy_other";
export type RecPhase = "idle" | "starting" | "recording" | "saving" | "done" | "error";

export interface RecTarget {
  pet_id: string;
  visit_id: string;
  kind: VoiceKind;
  day: string | null;
  pet_label?: string;
  visit_label?: string;
}

export interface RecSnapshot {
  phase: RecPhase;
  elapsedMs: number;
  /** ٠..١ — مستوى الصوت للمؤشّر. */
  level: number;
  silent: boolean;
  near: boolean;
  memoryOnly: boolean;
  /** هل الشاشةُ ممسوكةٌ مضيئة؟ null = لم يُعرف بعد. */
  wake: boolean | null;
  error?: RecError;
  /** أقصرُ من ثانية — ما انحفظ. */
  short?: boolean;
  clip?: LocalClip;
}

let active: VoiceRecorder | null = null;
/** هل يسجّل أحدٌ بهذا التبويب الآن؟ */
export const recordingNow = (): boolean => !!active && (active.snapshot().phase === "recording" || active.snapshot().phase === "starting");

/* الخروجُ (signOut) ينتظر المسجِّلَ الشغّال حتى يحفظ؛ وتسجيلٌ بالذاكرة وحدها يمنع الخروجَ حتى يُسأل الطبيب. */
onLeave(() => active?.stop("logout"));
setLeaveGate(() => memoryParts.size > 0);
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (recordingNow() || memoryParts.size > 0) { e.preventDefault(); e.returnValue = ""; }
  });
}

type WakeSentinel = { release(): Promise<void>; addEventListener?(t: string, f: () => void): void };

export class VoiceRecorder {
  private snap: RecSnapshot = { phase: "idle", elapsedMs: 0, level: 0, silent: false, near: false, memoryOnly: false, wake: null };
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private mirror: ChunkMirror | null = null;
  private clip: LocalClip | null = null;
  private base: VoiceMime = "audio/mp4";
  private t0 = 0;
  private chunkChain: Promise<void> = Promise.resolve();
  private timers: ReturnType<typeof setInterval>[] = [];
  private cleanups: (() => void)[] = [];
  private wake: WakeSentinel | null = null;
  private lastSound = 0;
  private stopping: Promise<LocalClip | null> | null = null;

  /** السقف: خمسُ دقائق (قرارُ المالك)، والتجريبيُّ دقيقتان — والتنبيهُ قبله بثلاثين ثانية. */
  private readonly maxMs: number;
  private readonly nearMs: number;

  constructor(private readonly target: RecTarget, private readonly onChange: (s: RecSnapshot) => void, opts?: { maxMs?: number }) {
    this.maxMs = opts?.maxMs ?? MAX_MS;
    this.nearMs = Math.max(0, this.maxMs - (MAX_MS - NEAR_MS));
  }

  snapshot(): RecSnapshot { return this.snap; }
  private set(p: Partial<RecSnapshot>): void { this.snap = { ...this.snap, ...p }; this.onChange(this.snap); }
  private fail(error: RecError): void { this.teardown(); this.set({ phase: "error", error }); if (active === this) active = null; }

  /** ابدأ — **من داخل الضغطة**. */
  async start(): Promise<void> {
    if (active && active !== this) { this.set({ phase: "error", error: "busy_other" }); return; }
    if (this.snap.phase === "starting" || this.snap.phase === "recording") return;
    active = this;
    this.set({ phase: "starting", error: undefined, short: false, elapsedMs: 0 });
    // سياقُ الصوت قبل أيّ await (آيفون يسمح بإنشائه داخل الضغطة وحدها)
    const AC = typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    try { this.ctx = AC ? new AC() : null; } catch { this.ctx = null; }
    void this.keepAwake();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) { this.fail("unavailable"); return; }
    try {
      this.stream = await md.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const p = cameraPhaseOf(e);
      this.fail(p === "denied" ? "denied" : p === "busy" ? "busy" : p === "unavailable" ? "unavailable" : "failed");
      return;
    }
    if (active !== this) { this.teardown(); return; } // أُلغي أثناء طلب الإذن
    const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
    const fmt = MR ? pickFormat((t) => MR.isTypeSupported(t)) : null;
    if (!MR || !fmt) { this.fail("unsupported"); return; }
    try { this.rec = new MR(this.stream, { mimeType: fmt.mimeType, audioBitsPerSecond: fmt.bitsPerSecond }); }
    catch { this.fail("unsupported"); return; }

    const shelf = await getShelf().catch(() => null);
    const id = uuid();
    this.clip = {
      id, who: outboxInternals.whoNow(), pet_id: this.target.pet_id, visit_id: this.target.visit_id, kind: this.target.kind,
      day: this.target.kind === "day" ? this.target.day : null, pet_label: this.target.pet_label, visit_label: this.target.visit_label,
      recorded_at: new Date().toISOString(), state: "recording", alive_at: Date.now(), attempts: 0,
      mime: baseMime(fmt.mimeType) ?? undefined,
    };
    const stored = await putClipSafe(this.clip);
    this.mirror = new ChunkMirror(stored ? shelf : null, id);
    liveIds.add(id);
    this.lockRecording(id);
    const release = holdUpdates(Infinity);
    const unmute = muteSounds();
    this.cleanups.push(release, unmute, () => { liveIds.delete(id); });
    try { window.dispatchEvent(new CustomEvent(REC_EVENT, { detail: { on: true } })); } catch { /* بلا نافذة */ }
    this.cleanups.push(() => { try { window.dispatchEvent(new CustomEvent(REC_EVENT, { detail: { on: false } })); } catch { /* — */ } });
    try { void navigator.storage?.persist?.(); } catch { /* لا تخزينَ دائم — يبقى كما هو */ }

    const rec = this.rec;
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const blob = e.data;
      this.chunkChain = this.chunkChain.then(async () => {
        const buf = await blob.arrayBuffer();
        await this.mirror?.append(buf);
        if (this.clip) { this.clip = { ...this.clip, alive_at: Date.now() }; if (!this.mirror?.memoryOnly) void putClipSafe(this.clip); }
        if (this.mirror?.memoryOnly && !this.snap.memoryOnly) this.set({ memoryOnly: true });
      }).catch(() => undefined);
    };
    rec.onerror = () => { void this.stop("error"); };
    const track = this.stream.getAudioTracks()[0];
    if (track) {
      const onEnd = () => { void this.stop("track"); };
      track.addEventListener("ended", onEnd);
      track.addEventListener("mute", onEnd);
      this.cleanups.push(() => { track.removeEventListener("ended", onEnd); track.removeEventListener("mute", onEnd); });
    }
    const onHide = () => { if (document.visibilityState === "hidden") void this.stop("hidden"); };
    const onPageHide = () => { void this.stop("hidden"); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    this.cleanups.push(() => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); });

    this.meter();
    try { rec.start(1000); } catch { this.fail("failed"); return; }
    this.t0 = Date.now();
    this.lastSound = this.t0;
    this.set({ phase: "recording", memoryOnly: !!this.mirror.memoryOnly });
    this.timers.push(setInterval(() => {
      const el = Date.now() - this.t0;
      const silent = Date.now() - this.lastSound >= SILENT_MS;
      if (el !== this.snap.elapsedMs || silent !== this.snap.silent) this.set({ elapsedMs: el, near: el >= this.nearMs, silent });
      if (el >= this.maxMs) void this.stop("limit");
    }, 250));
  }

  /** مستوى الصوت (RMS ~١٥ مرّة بالثانية) — المحلِّلُ غيرُ موصولٍ بالسمّاعة. */
  private meter(): void {
    if (!this.ctx || !this.stream) return;
    try {
      const src = this.ctx.createMediaStreamSource(this.stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const data = new Float32Array(an.fftSize);
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.timers.push(setInterval(() => {
        an.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.004) this.lastSound = Date.now();
        const level = Math.min(1, rms * 8);
        if (Math.abs(level - this.snap.level) > 0.02) this.set({ level });
      }, 66));
    } catch { /* بلا مؤشّر — التسجيلُ يكمل */ }
  }

  /** الشاشةُ تبقى مضيئة (Wake Lock، يُعاد عند الرجوع). بدونه: تحذيرٌ بالشاشة (`wake: false`). */
  private async keepAwake(): Promise<void> {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeSentinel> } }).wakeLock;
    if (!wl) { this.set({ wake: false }); return; }
    try { this.wake = await wl.request("screen"); this.set({ wake: true }); }
    catch { this.set({ wake: false }); }
  }

  /** قفلُ «حيّ» للتسجيل طوالَ عمره — تبويبٌ آخر يسأل `locks.query()` فيعرف أنه لم ينقطع. */
  private lockRecording(id: string): void {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks?.request) return;
    let release: (() => void) | null = null;
    const held = new Promise<void>((ok) => { release = ok; });
    void locks.request(REC_LOCK(id), () => held).catch(() => undefined);
    this.cleanups.push(() => release?.());
  }

  private teardown(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* — */ }
    try { void this.ctx?.close(); } catch { /* — */ }
    try { void this.wake?.release(); } catch { /* — */ }
    this.wake = null;
    for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* — */ } }
  }

  /** أوقِف واحفظ. `reason` = لماذا وقف وحده (يُقال للطبيب). يرجع التسجيلَ المحفوظ أو null (قصير/فشل). */
  stop(reason?: LocalClip["interrupted"]): Promise<LocalClip | null> {
    if (this.stopping) return this.stopping;
    if (this.snap.phase !== "recording") return Promise.resolve(null);
    this.stopping = this.finish(reason);
    return this.stopping;
  }

  private async finish(reason?: LocalClip["interrupted"]): Promise<LocalClip | null> {
    this.set({ phase: "saving" });
    const rec = this.rec!;
    const stopped = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    try { if (rec.state !== "inactive") { rec.requestData(); rec.stop(); } } catch { /* أُوقف أصلاً */ }
    await Promise.race([stopped, new Promise((ok) => setTimeout(ok, 3000))]);
    await this.chunkChain;
    const clockMs = Date.now() - this.t0;
    const mirror = this.mirror!;
    const clip0 = this.clip!;
    const mimeBase = baseMime(rec.mimeType) ?? "audio/mp4";
    this.base = mimeBase;
    this.teardown();
    if (active === this) active = null;
    const parts = mirror.mem.slice();
    if (!parts.length) { await deleteClipSafe(clip0.id); this.set({ phase: "error", error: "failed" }); await shelfChanged(); return null; }
    const { bytes, durationMs } = finalBytes(parts, mimeBase, clockMs);
    if (durationMs < MIN_MS) { await deleteClipSafe(clip0.id); this.set({ phase: "done", short: true }); await shelfChanged(); return null; }
    const sha256 = await sha256Hex(bytes);
    const mirrored = await mirror.verify();
    if (!mirrored) {
      memoryParts.set(clip0.id, parts);
      keepMemoryHold(clip0.id, holdUpdates(Infinity));
    }
    const clip: LocalClip = {
      ...clip0, state: mirrored ? "recorded" : "memory", mime: mimeBase, codecs: codecsOf(rec.mimeType), bytes: bytes.length, sha256,
      duration_ms: durationMs, clock_ms: clockMs, interrupted: reason, maybe_cut: durationMs < clockMs * 0.6, memory_only: !mirrored, alive_at: Date.now(),
    };
    const persisted = await putClipSafe(clip, true);
    if (!persisted && !memoryParts.has(clip.id)) { memoryParts.set(clip.id, parts); keepMemoryHold(clip.id, holdUpdates(Infinity)); }
    this.clip = clip;
    this.set({ phase: "done", clip, memoryOnly: !mirrored || !persisted });
    await shelfChanged();
    kickUploader();
    return clip;
  }

  /** ألغِ: لا يُحفظ شيء. */
  async cancel(): Promise<void> {
    const id = this.clip?.id;
    try { if (this.rec && this.rec.state !== "inactive") { this.rec.ondataavailable = null; this.rec.stop(); } } catch { /* — */ }
    this.teardown();
    if (active === this) active = null;
    if (id) await deleteClipSafe(id);
    this.set({ phase: "idle", elapsedMs: 0, level: 0, silent: false, near: false });
    await shelfChanged();
  }

  get mime(): VoiceMime { return this.base; }
}

/** تسجيلاتٌ انقطعت (تبويبٌ انسدّ أو الجهازُ طفى وهي «تُسجَّل») — لا تُمحى بلا كلمة. */
export async function findCrashed(): Promise<LocalClip[]> {
  const clips = await allClips();
  const rec = clips.filter((c) => c.state === "recording");
  if (!rec.length) return [];
  let held: Set<string> | null = null;
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.query) {
    try { const q = await locks.query(); held = new Set((q.held ?? []).map((l) => l.name ?? "")); } catch { held = null; }
  }
  return rec.filter((c) => !isClipLive(c, { heldLocks: held, liveIds, now: Date.now() }));
}

/** «احفظه»: ما وصل من القطع المتّصلة من ٠ يصير تسجيلاً يُرفع. بلا رأس ⇒ فشلٌ يُقال ولا يُمحى. */
export async function saveCrashed(clip: LocalClip, mimeHint?: string): Promise<LocalClip> {
  const shelf = await getShelf();
  const run = contiguousRun(await shelf.getChunks(clip.id));
  if (run.headMissing || !run.parts.length) {
    const failed: LocalClip = { ...clip, state: "failed", reason: "no_head" };
    await putClipSafe(failed, true);
    await shelfChanged();
    return failed;
  }
  const base = clip.mime ?? baseMime(mimeHint) ?? sniffBase(run.parts[0]);
  const { bytes, durationMs } = finalBytes(run.parts, base, 0);
  const saved: LocalClip = {
    ...clip, state: "recorded", mime: base, bytes: bytes.length, sha256: await sha256Hex(bytes), duration_ms: durationMs,
    clock_ms: durationMs, interrupted: "closed", alive_at: Date.now(),
  };
  await putClipSafe(saved, true);
  await shelfChanged();
  kickUploader();
  return saved;
}

/** الصيغةُ من أوّل البايتات حين لم تُحفظ (انقطع قبل الإيقاف): EBML = WebM، ftyp = MP4، OggS = Ogg. */
export function sniffBase(first: ArrayBuffer): VoiceMime {
  const b = new Uint8Array(first.slice(0, 12));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  return "audio/mp4";
}
