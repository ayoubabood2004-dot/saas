/* ============================================================================
 * رافعُ الملاحظات الصوتية — من رفّ الجهاز إلى الدلو والجدول (0287، §D).
 *
 * الترتيبُ لكلّ تسجيل: الهويّة (مَن سجّل = مَن الداخل، والعيادةُ كما يؤكّدها الخادم) ← الإذن والزيارة قبل أيّ
 * رفع (لا ملفَّ يتيم) ← البايتاتُ تُجمع وبصمتُها تُعاد وتُطابَق ← الرفعُ (XHR، يُلغى إن وقف التقدّم) ← الصفّ
 * (`voice_note_add`، إعادةٌ = الصفُّ نفسُه) ← حجمُ الملفّ بالدلو يطابق ← «حذف» ضُغط قبل الوصول يُنفَّذ ← وحينها
 * فقط يُمحى من الجهاز. الفشلُ الدائم لا يُمحى أبداً (يُنزَّل ملفّاً أو يُحذف بكلمة الطبيب)، والعابرُ يعود وحده
 * بانتظارٍ متزايد. ومحاولةٌ واحدة لكلّ تسجيل في وقتٍ واحد، ورافعٌ واحدٌ عبر التبويبات (Web Locks).
 *
 * لا `t(` هنا (الشريطُ بالإقلاع يستورده كسولاً) — الحالاتُ رموزٌ تترجمها الشاشة.
 * ========================================================================= */
import { voiceApi, voiceCode, voiceMissing, isVoiceMissing, type VoiceAddPayload } from "../voiceApi";
import { isNetworkError, outboxInternals, UNCONFIRMED } from "../outbox";
import { holdUntil } from "../inflight";
import { isConfigReadOnly } from "../clinicSync";
import { extOf } from "./voiceFormat";
import { finalBytes, sha256Hex } from "./voiceMedia";
import { allClips, backoffMs, contiguousRun, deleteClipSafe, getShelf, memoryParts, notifyShelf, putClipSafe, releaseMemoryHold, shelfChanged, uploadProgress, UPLOAD_LOCK } from "./voiceShelf";
import type { FailReason, LocalClip, WaitReason } from "./voiceTypes";

export type Verdict =
  | { kind: "waiting"; reason: WaitReason }
  | { kind: "failed"; reason: FailReason }
  | { kind: "uploaded" }
  | { kind: "orphan" };

const msgOf = (e: unknown): string => String((e as { message?: unknown } | null)?.message ?? e ?? "");
const statusOf = (e: unknown): number => Number((e as { status?: unknown; statusCode?: unknown } | null)?.status ?? (e as { statusCode?: unknown } | null)?.statusCode);

/** خطأُ الرفع إلى الدلو ⇒ ماذا نفعل. */
export function classifyUpload(e: unknown): Verdict {
  if ((e as { name?: unknown } | null)?.name === "ReadOnlyError") return { kind: "waiting", reason: "read_only" };
  if ((e as { name?: unknown } | null)?.name === "AbortError" || isNetworkError(e)) return { kind: "waiting", reason: "network" };
  const st = statusOf(e);
  const m = msgOf(e);
  if (st === 409 || /duplicate|already exists/i.test(m)) return { kind: "uploaded" };
  if (/bucket not found/i.test(m)) return { kind: "waiting", reason: "not_ready" };
  if (outboxInternals.transientReject(e)) return { kind: "waiting", reason: "server" };
  if ((st === 400 || st === 403) && /row-level security|violates|unauthorized|not allowed/i.test(m)) return { kind: "failed", reason: "forbidden" };
  if (st === 413 || /too large|maximum allowed size|payload too large/i.test(m)) return { kind: "failed", reason: "too_big" };
  if (st === 415 || /mime|content.?type/i.test(m)) return { kind: "failed", reason: "format" };
  return { kind: "waiting", reason: "server" };
}

/** خطأُ دالّةٍ بالخادم ⇒ ماذا نفعل. */
export function classifyRpc(e: unknown): Verdict {
  if ((e as { name?: unknown } | null)?.name === "ReadOnlyError") return { kind: "waiting", reason: "read_only" };
  if (isNetworkError(e)) return { kind: "waiting", reason: "network" };
  if (isVoiceMissing(e)) return { kind: "waiting", reason: "not_ready" };
  if (outboxInternals.transientReject(e)) return { kind: "waiting", reason: "server" };
  const code = voiceCode(e);
  const sql = String((e as { code?: unknown } | null)?.code ?? "");
  switch (code) {
    case "voice_forbidden": case "voice_operator": return { kind: "failed", reason: "forbidden" };
    case "voice_visit": return { kind: "failed", reason: "visit" };
    case "voice_bad": case "voice_path": return { kind: "failed", reason: "bug" };
    case "voice_id_taken": return { kind: "failed", reason: "id" };
    case "voice_object_missing": case "voice_size": return { kind: "orphan" };
  }
  if (sql === "23514") return { kind: "failed", reason: "bug" };
  if (sql === "42501") return { kind: "failed", reason: "forbidden" };
  return { kind: "waiting", reason: "server" };
}

/** مسارُ الملفّ بالدلو — يطابق قيدَ الجدول حرفاً. */
export const clipPath = (clinic: string, clip: Pick<LocalClip, "pet_id" | "id" | "mime">): string =>
  `${clinic}/${clip.pet_id}/${clip.id}.${extOf(clip.mime ?? "audio/mp4")}`;

/** البايتاتُ كما سجّلها الجهاز: من الذاكرة إن كانت وحدها، وإلا من القطع المحفوظة (الجزءُ المتّصلُ من ٠). */
export async function clipBytes(clip: LocalClip): Promise<Uint8Array | null> {
  const mem = memoryParts.get(clip.id);
  let parts: ArrayBuffer[];
  if (mem) parts = mem;
  else {
    const run = contiguousRun(await (await getShelf()).getChunks(clip.id));
    if (run.headMissing || !run.parts.length) return null;
    parts = run.parts;
  }
  return finalBytes(parts, clip.mime ?? "audio/mp4", clip.clock_ms ?? clip.duration_ms ?? 0).bytes;
}

/** حدُّ الوقوف: بلا تقدّمٍ ٢٠ ثانية = «النت بطيء — يكمل»، و٦٠ = يُلغى ويُعاد لاحقاً. */
export const SLOW_MS = 20_000;
export const STALL_MS = 60_000;

const inFlight = new Set<string>();

async function save(clip: LocalClip): Promise<void> {
  await putClipSafe(clip, true);
  await shelfChanged();
}

async function park(clip: LocalClip, v: Verdict): Promise<void> {
  uploadProgress.delete(clip.id);
  if (v.kind === "failed") await save({ ...clip, state: "failed", reason: v.reason });
  else if (v.kind === "waiting") {
    const attempts = (clip.attempts ?? 0) + 1;
    await save({ ...clip, state: "waiting", reason: v.reason, attempts, next_at: Date.now() + backoffMs(attempts) });
  }
}

/** ارفع تسجيلاً واحداً حتى يُمحى من الجهاز أو يُركن بسببه. لا يرمي. */
export async function uploadClip(clip0: LocalClip): Promise<void> {
  if (inFlight.has(clip0.id)) return; // محاولةٌ واحدة في وقتٍ واحد
  inFlight.add(clip0.id);
  let clip = clip0;
  try {
    const mime = clip.mime, sha = clip.sha256, nbytes = clip.bytes;
    if (!mime || !sha || !nbytes) return; // لم يكتمل حفظُه بعد
    if (isConfigReadOnly()) { await park(clip, { kind: "waiting", reason: "read_only" }); return; }
    const me = outboxInternals.whoNow();
    if (!me || !clip.who || clip.who.user !== me.user) { await park(clip, { kind: "waiting", reason: "other_user" }); return; }
    let server: string | null;
    try { server = await voiceApi.serverClinic(); } catch (e) { await park(clip, classifyRpc(e)); return; }
    if (!server) { await park(clip, { kind: "waiting", reason: "server" }); return; }
    if (clip.who.clinic !== UNCONFIRMED && clip.who.clinic !== server) { await park(clip, { kind: "waiting", reason: "other_clinic" }); return; }

    // قبل أيّ رفع: الإذنُ والزيارة (لا ملفَّ يتيم يُترك)
    try {
      if (!(await voiceApi.canRecord())) { await park(clip, { kind: "failed", reason: "forbidden" }); return; }
      if (!(await voiceApi.visitExists(clip.visit_id))) { await park(clip, { kind: "failed", reason: "visit" }); return; }
    } catch (e) { await park(clip, classifyRpc(e)); return; }

    const bytes = await clipBytes(clip);
    if (!bytes) { await park(clip, { kind: "failed", reason: "no_head" }); return; }
    if ((await sha256Hex(bytes)) !== sha || bytes.length !== nbytes) { await park(clip, { kind: "failed", reason: "local_corrupt" }); return; }

    const path = clipPath(server, clip);
    clip = { ...clip, state: "uploading", reason: undefined };
    await save(clip);
    const payload: VoiceAddPayload = {
      id: clip.id, pet_id: clip.pet_id, visit_id: clip.visit_id, kind: clip.kind, day: clip.day, path, mime,
      codecs: clip.codecs ?? null, duration_ms: clip.duration_ms ?? 0, bytes: nbytes, sha256: sha, recorded_at: clip.recorded_at,
    };

    for (let round = 0; round < 2; round++) {
      const put = await putWithWatchdog(clip.id, path, bytes, mime);
      if (put.kind !== "uploaded") { await park(clip, put); return; }
      let row;
      try { row = await voiceApi.add(payload); }
      catch (e) {
        const v = classifyRpc(e);
        if (v.kind === "orphan") {
          // الملفُّ غائبٌ أو بحجمٍ آخر: يُمسح (إن قال الدلوُ إنه مسحه) ويُعاد رفعُه مرّةً واحدة
          let dropped = false;
          try { dropped = await voiceApi.dropOrphan(path); } catch { dropped = false; }
          if (dropped && round === 0) continue;
          await park(clip, { kind: "failed", reason: "server_file" });
          return;
        }
        await park(clip, v);
        return;
      }
      if (row.id !== clip.id) { await park(clip, { kind: "failed", reason: "id" }); return; }
      let size: number | null;
      try { size = await voiceApi.info(path); } catch (e) { await park(clip, classifyUpload(e)); return; }
      if (size !== nbytes) { await park(clip, { kind: "waiting", reason: "server" }); return; }
      if (clip.void_requested) {
        try { await voiceApi.voidNote(clip.id, clip.void_requested.reason); }
        catch (e) { await park(clip, classifyRpc(e)); return; }
      }
      // الآن فقط: يُمحى من الجهاز
      await deleteClipSafe(clip.id);
      releaseMemoryHold(clip.id);
      await shelfChanged();
      return;
    }
  } catch (e) {
    await park(clip, isVoiceMissing(e) ? { kind: "waiting", reason: "not_ready" } : { kind: "waiting", reason: "server" }).catch(() => undefined);
  } finally {
    inFlight.delete(clip0.id);
  }
}

async function putWithWatchdog(id: string, path: string, bytes: Uint8Array, mime: NonNullable<LocalClip["mime"]>): Promise<Verdict> {
  const ctl = new AbortController();
  let last = Date.now();
  uploadProgress.set(id, { pct: 0, slow: false });
  notifyShelf();
  const timer = setInterval(() => {
    const idle = Date.now() - last;
    const cur = uploadProgress.get(id);
    if (idle >= STALL_MS) ctl.abort();
    else if (cur && idle >= SLOW_MS && !cur.slow) { uploadProgress.set(id, { ...cur, slow: true }); notifyShelf(); }
  }, 1000);
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    await holdUntil(voiceApi.putObject(path, blob, mime, {
      signal: ctl.signal,
      onProgress: (loaded, total) => { last = Date.now(); uploadProgress.set(id, { pct: total ? Math.round((loaded / total) * 100) : 0, slow: false }); notifyShelf(); },
    }));
    return { kind: "uploaded" };
  } catch (e) {
    return classifyUpload(e);
  } finally {
    clearInterval(timer);
  }
}

let running = false;
let again = false;

/** جولةٌ على تسجيلات الداخل الجاهزة للرفع (والمنتظرة التي حان وقتُها، أو `force`). */
async function sweep(force: boolean): Promise<void> {
  const me = outboxInternals.whoNow();
  if (!me) return;
  const now = Date.now();
  const due = (await allClips())
    .filter((c) => c.who?.user === me.user)
    .filter((c) => c.state === "recorded" || c.state === "memory" || c.state === "uploading"
      || (c.state === "waiting" && (force || !c.next_at || c.next_at <= now)))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  for (const c of due) await uploadClip(c);
}

/** شغّل الرافع (بعد الحفظ، رجوعُ النت، رجوعُ التبويب، فتحُ الزيارة أو /voice). جولةٌ واحدة بالتبويب وعبر التبويبات. */
export function kickUploader(force = false): void {
  if (running) { again = true; return; }
  running = true;
  const run = async () => {
    do {
      again = false;
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      if (locks?.request) await locks.request(UPLOAD_LOCK, { ifAvailable: true }, async (lock) => { if (lock) await sweep(force); });
      else await sweep(force);
    } while (again);
  };
  void run().catch(() => undefined).finally(() => { running = false; });
}

let armed = false;
/** المؤقّتُ والمستمعون (مرّةً للتبويب): النتُّ يرجع، التبويبُ يظهر، وكلَّ ٣٠ ثانية للمنتظِرة. */
export function armUploader(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  window.addEventListener("online", () => kickUploader(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kickUploader(); });
  setInterval(() => kickUploader(), 30_000);
  kickUploader();
}

/** «حذف» على تسجيلٍ ما ارتفع بعد: لا يُمحى — يُختم طلبُ الحذف فيرتفع محذوفاً (يرجّعه المدير). */
export async function requestVoid(clip: LocalClip, reason: string | null): Promise<void> {
  await save({ ...clip, void_requested: { at: new Date().toISOString(), reason } });
  kickUploader(true);
}

/** امسح تسجيلاً من الجهاز بقرار الطبيب (ما ارتفع ولن يرتفع: «احذفه» بعد «نزّله ملف»). */
export async function discardClip(id: string): Promise<void> {
  await deleteClipSafe(id);
  releaseMemoryHold(id);
  await shelfChanged();
}

/** «أعد المحاولة» على تسجيلٍ منتظر أو فاشل: يُرجع للرفع الآن. */
export async function retryClip(clip: LocalClip): Promise<void> {
  await save({ ...clip, state: clip.memory_only ? "memory" : "recorded", reason: undefined, next_at: undefined });
  kickUploader(true);
}

export { voiceMissing };
