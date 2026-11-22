/* ============================================================================
 * رفُّ التسجيلات على الجهاز — ما لم يؤكّده الخادمُ بعد (IndexedDB `dv-voice`).
 *
 * القاعدة: التسجيلُ لا يُمحى من الجهاز إلا بعد أن يرجع صفُّه من الخادم بالمعرّف نفسِه ويقول الدلوُ
 * إن الملفَّ بحجمه (§D). وأثناء التسجيل الذاكرةُ هي الحقيقة وIndexedDB مرآتُها قطعةً قطعة — فإن تعطّلت
 * المرآةُ (مساحةٌ امتلأت، قاعدةٌ أُغلقت) يكمل التسجيلُ بالذاكرة وحدها ويُقال ذلك بصوت، لا يضيع بصمت.
 *
 * الشِّقُّ الصِّرف هنا مفحوصٌ بقاعدةٍ مزيّفة بالذاكرة (voice-test)؛ ومحوِّلُ IndexedDB الحقيقيّ رقيق.
 * ========================================================================== */
import type { LocalClip, PendingFlag } from "./voiceTypes";
import { PENDING_KEY, PENDING_EVENT } from "./voicePending";
export { PENDING_KEY, PENDING_EVENT, pendingCounts, readPendingFlag } from "./voicePending";

export interface ChunkRec {
  id: string;
  seq: number;
  at_ms: number;
  buf: ArrayBuffer;
}

/** ما يحتاجه الرفّ من القاعدة — الحقيقيّةُ (IndexedDB) والمزيّفةُ بالفحص بالشكل نفسِه. */
export interface ShelfStore {
  /** `strict`: لا يُقال «على هالجهاز» إلا بعد أن تثبت الكتابةُ على القرص (durability: strict). */
  putClip(c: LocalClip, strict?: boolean): Promise<void>;
  getClip(id: string): Promise<LocalClip | null>;
  listClips(): Promise<LocalClip[]>;
  putChunk(r: ChunkRec): Promise<void>;
  /** قطعُ تسجيلٍ بترتيبها. */
  getChunks(id: string): Promise<ChunkRec[]>;
  /** التسجيلُ وقطعُه بمعاملةٍ واحدة. */
  deleteClip(id: string): Promise<void>;
  /** أعِد فتحَ القاعدة بعد خطأٍ عابر (UnknownError / إغلاقٌ مفاجئ). */
  reopen(): Promise<void>;
}

export const DB_NAME = "dv-voice";
export const REC_LOCK = (id: string): string => `dv-voice-rec:${id}`;
export const UPLOAD_LOCK = "dv-voice-upload";

/** امتلاءُ المساحة لا يعالجه إعادةُ فتح — يُنقل التسجيلُ للذاكرة فوراً. */
export const isQuotaError = (e: unknown): boolean => {
  const n = (e as { name?: unknown } | null)?.name;
  return n === "QuotaExceededError" || /quota/i.test(String((e as { message?: unknown } | null)?.message ?? ""));
};

/**
 * مرآةُ القطع: كلُّ قطعةٍ تُضاف للذاكرة أوّلاً ثمّ تُكتب للقاعدة، وبإعادة فتحٍ واحدة عند الفشل. فشلٌ ثانٍ
 * أو امتلاء ⇒ `memoryOnly` (والتسجيلُ يكمل). الكتاباتُ بالترتيب — كلُّ إضافةٍ تنتظر سابقتها.
 */
export class ChunkMirror {
  readonly mem: ArrayBuffer[] = [];
  memoryOnly: boolean;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly db: ShelfStore | null, private readonly id: string, private readonly now: () => number = Date.now) {
    this.memoryOnly = !db;
  }

  append(buf: ArrayBuffer): Promise<void> {
    const seq = this.mem.length;
    this.mem.push(buf);
    this.chain = this.chain.then(() => this.mirror({ id: this.id, seq, at_ms: this.now(), buf }));
    return this.chain;
  }

  private async mirror(rec: ChunkRec): Promise<void> {
    if (this.memoryOnly || !this.db) return;
    try { await this.db.putChunk(rec); return; }
    catch (e) { if (isQuotaError(e)) { this.memoryOnly = true; return; } }
    try { await this.db.reopen(); await this.db.putChunk(rec); }
    catch { this.memoryOnly = true; }
  }

  /** انتظر كلَّ ما بالطريق. */
  settled(): Promise<void> { return this.chain; }

  /**
   * عند الإيقاف: القاعدةُ تحمل القطعَ ٠..ن−١ ومجموعُ بايتاتها = مجموعُ الذاكرة؟ الناقصُ يُكتب إن أمكن،
   * وإلا فالتسجيلُ بالذاكرة وحدها. يُرجع: هل المرآةُ كاملة.
   */
  async verify(): Promise<boolean> {
    await this.settled();
    if (this.memoryOnly || !this.db) return false;
    try {
      const have = await this.db.getChunks(this.id);
      const bySeq = new Map(have.map((c) => [c.seq, c]));
      for (let seq = 0; seq < this.mem.length; seq++) {
        const c = bySeq.get(seq);
        if (!c || c.buf.byteLength !== this.mem[seq].byteLength) await this.db.putChunk({ id: this.id, seq, at_ms: this.now(), buf: this.mem[seq] });
      }
      const again = await this.db.getChunks(this.id);
      const total = again.filter((c) => c.seq < this.mem.length).reduce((n, c) => n + c.buf.byteLength, 0);
      const want = this.mem.reduce((n, b) => n + b.byteLength, 0);
      if (again.filter((c) => c.seq < this.mem.length).length !== this.mem.length || total !== want) { this.memoryOnly = true; return false; }
      return true;
    } catch { this.memoryOnly = true; return false; }
  }
}

/** ما يُسترجع من قطع تسجيلٍ انقطع: الجزءُ المتّصل من القطعة ٠ وحده (ملفٌّ صالحٌ ناقص).
 *  بلا القطعة ٠ لا رأسَ للملفّ — لا يُشغَّل، والبايتاتُ تبقى حتى يُحذف بكلمة. */
export function contiguousRun(chunks: readonly ChunkRec[]): { parts: ArrayBuffer[]; headMissing: boolean; dropped: number } {
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);
  if (!sorted.length || sorted[0].seq !== 0) return { parts: [], headMissing: sorted.length > 0, dropped: sorted.length };
  const parts: ArrayBuffer[] = [];
  let next = 0;
  for (const c of sorted) {
    if (c.seq !== next) break;
    parts.push(c.buf);
    next++;
  }
  return { parts, headMissing: false, dropped: sorted.length - parts.length };
}

/** تسجيلٌ بحالة `recording` حيٌّ أم انقطع؟ قفلُه بـWeb Locks محجوزٌ = حيّ (ولو بتبويبٍ آخر)، أو هو
 *  بمجموعة هذا التبويب؛ وبلا Web Locks (آيفون أقدم من 15.4) آخرُ قطعةٍ قبل أقلّ من ١٠ ثوانٍ. */
export function isClipLive(
  clip: Pick<LocalClip, "id" | "state" | "alive_at">,
  opts: { heldLocks: ReadonlySet<string> | null; liveIds: ReadonlySet<string>; now: number },
): boolean {
  if (clip.state !== "recording") return false;
  if (opts.liveIds.has(clip.id)) return true;
  if (opts.heldLocks) return opts.heldLocks.has(REC_LOCK(clip.id));
  return opts.now - clip.alive_at < 10_000;
}

/** الانتظارُ قبل المحاولة التالية: ٥ ثوانٍ ← ٣٠ ← دقيقتان ← ١٠ دقائق (سقف). */
export function backoffMs(attempts: number): number {
  const steps = [5_000, 30_000, 120_000, 600_000];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

/** ما لم يرتفع لكلّ مستخدم: [العدد (ومعه ما يُسجَّل الآن)، منها فاشل]. */
export function pendingFlag(clips: readonly LocalClip[]): PendingFlag {
  const f: PendingFlag = {};
  for (const c of clips) {
    if (c.state === "saved") continue;
    const k = c.who?.user || "?";
    const cur = f[k] ?? [0, 0];
    f[k] = [cur[0] + 1, cur[1] + (c.state === "failed" ? 1 : 0)];
  }
  return f;
}

/** اكتب العلمَ المتزامن (يقرؤه الشريطُ بلا قاعدة) وأعلنه لهذا التبويب (والتخزينُ يُعلم غيره). */
export function writePendingFlag(flag: PendingFlag): void {
  try {
    if (Object.keys(flag).length) localStorage.setItem(PENDING_KEY, JSON.stringify(flag));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* تخزينٌ مقفول — الشريطُ يقرأ الرفَّ نفسَه عند فتح /voice */ }
  try { window.dispatchEvent(new CustomEvent(PENDING_EVENT)); } catch { /* بلا نافذة (فحص) */ }
}

/** المساحةُ الحرّة أقلُّ من ~١٥ ميغا؟ (تقديرُ المتصفّح؛ بلا تقدير = لا تحذير). */
export function lowSpace(est: { quota?: number; usage?: number } | null | undefined): boolean {
  if (!est || typeof est.quota !== "number" || typeof est.usage !== "number") return false;
  return est.quota - est.usage < 15 * 1024 * 1024;
}

/* ── محوِّلُ IndexedDB الحقيقيّ ─────────────────────────────────────────── */

const reqP = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error ?? new DOMException("aborted", "AbortError")); });

/** قاعدةُ `dv-voice` (الرفُّ وصوتُ التجريبيّ) — تُنشئ مخازنَها الثلاثة أوّلَ مرّة. */
export function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(DB_NAME, 1); } catch (e) { no(e); return; }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("clips")) {
        const s = db.createObjectStore("clips", { keyPath: "id" });
        s.createIndex("user", "who.user");
        s.createIndex("visit", "visit_id");
      }
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["id", "seq"] });
      if (!db.objectStoreNames.contains("demo_audio")) db.createObjectStore("demo_audio", { keyPath: "path" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new DOMException("blocked", "AbortError"));
  });
}

/** القاعدةُ الحقيقيّة — أو رميٌ إن لم تُفتح (متصفّحٌ خاصّ، تخزينٌ معطّل): المسجِّلُ يكمل بالذاكرة. */
export async function openIdbShelf(): Promise<ShelfStore> {
  let db = await openVoiceDb();
  const watch = () => { db.onclose = () => { void openVoiceDb().then((d) => { db = d; watch(); }).catch(() => undefined); }; };
  watch();
  const tx = (stores: string[], mode: IDBTransactionMode, strict = false): IDBTransaction =>
    strict ? db.transaction(stores, mode, { durability: "strict" } as IDBTransactionOptions) : db.transaction(stores, mode);
  return {
    async putClip(c, strict = false) { const t = tx(["clips"], "readwrite", strict); t.objectStore("clips").put(c); await txDone(t); },
    async getClip(id) { const t = tx(["clips"], "readonly"); return ((await reqP(t.objectStore("clips").get(id))) as LocalClip | undefined) ?? null; },
    async listClips() { const t = tx(["clips"], "readonly"); return (await reqP(t.objectStore("clips").getAll())) as LocalClip[]; },
    async putChunk(r) { const t = tx(["chunks"], "readwrite"); t.objectStore("chunks").put(r); await txDone(t); },
    async getChunks(id) {
      const t = tx(["chunks"], "readonly");
      const all = (await reqP(t.objectStore("chunks").getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])))) as ChunkRec[];
      return all.sort((a, b) => a.seq - b.seq);
    },
    async deleteClip(id) {
      const t = tx(["clips", "chunks"], "readwrite", true);
      t.objectStore("clips").delete(id);
      t.objectStore("chunks").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      await txDone(t);
    },
    async reopen() { try { db.close(); } catch { /* مغلقة أصلاً */ } db = await openVoiceDb(); watch(); },
  };
}

/** قاعدةٌ بالذاكرة بالشكل نفسِه — للفحص، وللمتصفّح حين لا IndexedDB (التسجيلُ حينها بالذاكرة وحدها). */
export function memShelf(): ShelfStore {
  const clips = new Map<string, LocalClip>();
  const chunks = new Map<string, ChunkRec>();
  const key = (id: string, seq: number) => `${id}\u0000${seq}`;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    async putClip(c) { clips.set(c.id, clone(c)); },
    async getClip(id) { const c = clips.get(id); return c ? clone(c) : null; },
    async listClips() { return [...clips.values()].map(clone); },
    async putChunk(r) { chunks.set(key(r.id, r.seq), { ...r, buf: r.buf.slice(0) }); },
    async getChunks(id) { return [...chunks.values()].filter((c) => c.id === id).sort((a, b) => a.seq - b.seq); },
    async deleteClip(id) { clips.delete(id); for (const k of [...chunks.keys()]) if (k.startsWith(`${id}\u0000`)) chunks.delete(k); },
    async reopen() { /* لا شيء يُعاد */ },
  };
}

/* ── الرفُّ المشترك بين المسجِّل والرافع والشاشة ─────────────────────────── */

let shelfP: Promise<ShelfStore> | null = null;
/** القاعدةُ الواحدة للتبويب: IndexedDB، أو الذاكرة إن لم تُفتح (يُقال «بالذاكرة بس» على كلّ تسجيل). */
export function getShelf(): Promise<ShelfStore> {
  if (!shelfP) shelfP = openIdbShelf().catch(() => memShelf());
  return shelfP;
}

/** بايتاتُ تسجيلاتٍ بالذاكرة وحدها (المرآةُ فشلت) — يرفع منها الرافع، وتُمسح بعد أن يرتفع. */
export const memoryParts = new Map<string, ArrayBuffer[]>();

/** تقدّمُ الرفع لكلّ تسجيل (للشاشة). */
export const uploadProgress = new Map<string, { pct: number; slow: boolean }>();

const listeners = new Set<() => void>();
/** اسمع كلَّ تغيّرٍ بالرفّ (حالة، تقدّم). يرجع دالّةَ الإلغاء. */
export function onShelfChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** أعلن تغيّراً: العلمُ المتزامن يُعاد حسابُه من الرفّ كلّه، والمستمعون يُبلَّغون. */
export async function shelfChanged(): Promise<void> {
  try { writePendingFlag(pendingFlag(await allClips())); } catch { /* الرفُّ لا يُقرأ — الشاشةُ تسأله ثانيةً */ }
  for (const fn of [...listeners]) { try { fn(); } catch { /* مستمعٌ معطوب لا يوقف غيره */ } }
}
export function notifyShelf(): void { for (const fn of [...listeners]) { try { fn(); } catch { /* — */ } } }

/** تسجيلاتٌ ما قدرت القاعدةُ تحفظ صفَّها (IndexedDB فشل حتى للصفّ) — الذاكرةُ وحدها حتى ترتفع. */
export const memoryClips = new Map<string, LocalClip>();
/** معرّفاتُ التسجيلات الشغّالة بهذا التبويب (احتياطُ الحياة مع Web Locks). */
export const liveIds = new Set<string>();

/** احفظ صفَّ التسجيل: بالقاعدة، وإلا بالذاكرة (لا يضيع بصمت ولا يرمي). يرجع: هل ثبت بالقاعدة. */
export async function putClipSafe(c: LocalClip, strict = false): Promise<boolean> {
  try { await (await getShelf()).putClip(c, strict); memoryClips.delete(c.id); return true; }
  catch { memoryClips.set(c.id, c); return false; }
}
/** امسح التسجيلَ وقطعَه من كلّ مكان. */
export async function deleteClipSafe(id: string): Promise<void> {
  memoryClips.delete(id);
  memoryParts.delete(id);
  uploadProgress.delete(id);
  try { await (await getShelf()).deleteClip(id); } catch { /* القاعدةُ معطوبة — لا شيءَ فيها يُمسح */ }
}
/** كلُّ تسجيلات الجهاز (القاعدةُ والذاكرة، والقاعدةُ تغلب على المعرّف نفسِه). */
export async function allClips(): Promise<LocalClip[]> {
  let stored: LocalClip[] = [];
  try { stored = await (await getShelf()).listClips(); } catch { stored = []; }
  const ids = new Set(stored.map((c) => c.id));
  return [...stored, ...[...memoryClips.values()].filter((c) => !ids.has(c.id))];
}

/** إمساكُ التحديث لتسجيلٍ بالذاكرة وحدها — لا يُفلت إلا حين يرتفع (تحميلُ الصفحة يضيّعه). */
const memoryHolds = new Map<string, () => void>();
export function keepMemoryHold(id: string, release: () => void): void { memoryHolds.get(id)?.(); memoryHolds.set(id, release); }
export function releaseMemoryHold(id: string): void { memoryHolds.get(id)?.(); memoryHolds.delete(id); }
