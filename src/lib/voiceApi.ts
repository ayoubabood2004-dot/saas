/* ============================================================================
 * الملاحظةُ الصوتية (0287) — بابٌ واحد للسحابة وللتجريبيّ. خارج repo.ts (حزمةُ الإقلاع وفسحتُها بضعُ مئات بايت)،
 * ومسطّحٌ بـsrc/lib لأن فحوصَ esbuild تبدّل `"./supabase"` وحده (لا `"../supabase"`).
 *
 * العقد (docs/voice-notes-plan.md §D):
 *  • القراءةُ ترمي عند أيّ فشل — لا «ماكو ملاحظات صوتية» عن خطأ (قائمةٌ ناقصة أخطرُ من خطأ ظاهر).
 *  • جدولٌ أو دالّةٌ غائبة (واجهةٌ سبقت هجرتها: 42P01/PGRST205/PGRST202) ⇒ `voice_missing` — الميزةُ تختفي بصمت.
 *  • الكتابةُ من دوالّ الخادم وحدها (definer)، وكلُّها ترجع الصفّ — حالٌ غيرُ المتوقَّع يُقال لا «تمّ».
 *  • الرفعُ XHR لا storage-js: `upload()` بالمكتبة لا يُلغى (لا تمرّ إشارةُ الإلغاء)، وXHR يعطي abort والتقدّم.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError).
 *  • لا `t(` هنا: الشريطُ (حزمةُ الإقلاع) يستورد الرافعَ كسولاً، والرافعُ يستورد هذا الباب.
 * ========================================================================= */
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { VoiceKind, VoiceMime, VoiceRow } from "./voice/voiceTypes";

export const VOICE_BUCKET = "voice-notes";
/** عمرُ الرابط الموقَّع: ساعة — يُعاد توقيعُه كلَّ ٤٥ دقيقة ما دامت الشاشةُ مفتوحة، ومحذوفٌ لا يبقى مسموعاً أكثر. */
export const SIGN_SECONDS = 3600;

export interface VoiceAddPayload {
  id: string;
  pet_id: string;
  visit_id: string;
  kind: VoiceKind;
  day: string | null;
  path: string;
  mime: VoiceMime;
  codecs: string | null;
  duration_ms: number;
  bytes: number;
  sha256: string;
  recorded_at: string;
}

export interface PutOpts {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

export interface VoiceApi {
  /** هل يسجّل هذا الحساب بهذه العيادة الآن؟ (الخادمُ يقرّر: الصلاحية، العيادةُ مفتوحة، ليس مشغّلاً). */
  canRecord(): Promise<boolean>;
  /** ملاحظاتُ الزيارة — ترمي ولا ترجع ناقصة. */
  list(visitId: string): Promise<VoiceRow[]>;
  /** تسجيلاتُ حيواناتٍ حُذفت (للمدير) — بالصفحات حتى صفحةٍ فارغة. */
  orphans(): Promise<VoiceRow[]>;
  /** روابطُ تشغيلٍ موقَّعة لساعة. مسارٌ ممنوعٌ (محذوفٌ لغير المدير) يغيب من الناتج ولا يُرمى. */
  sign(paths: string[]): Promise<Record<string, string>>;
  putObject(path: string, blob: Blob, contentType: VoiceMime, opts?: PutOpts): Promise<void>;
  /** حجمُ الملفّ بالدلو، أو null إن لم يوجد. */
  info(path: string): Promise<number | null>;
  add(p: VoiceAddPayload): Promise<VoiceRow>;
  voidNote(id: string, reason: string | null): Promise<VoiceRow>;
  restore(id: string): Promise<VoiceRow>;
  /** امسح ملفّاً يتيماً رفعه هذا الحساب — true فقط إن قال الدلوُ إنه مسحه (الرفضُ يرجع قائمةً فارغة بلا خطأ، 0236). */
  dropOrphan(path: string): Promise<boolean>;
  /** العيادةُ كما يؤكّدها الخادم (my_workspace)، أو null. */
  serverClinic(): Promise<string | null>;
  /** الزيارةُ موجودةٌ بعيادتي؟ (قبل الرفع: لا يُرفع ملفٌّ سيتيم). */
  visitExists(visitId: string): Promise<boolean>;
}

type PgErr = { message: string; code?: string; details?: string; hint?: string };
const MISSING = new Set(["42P01", "PGRST205", "PGRST202"]);
export const voiceMissing = () => Object.assign(new Error("voice_missing"), { code: "voice_missing" });
export const isVoiceMissing = (e: unknown): boolean => {
  const c = (e as { code?: string } | null)?.code;
  return c === "voice_missing" || MISSING.has(c ?? "");
};
const fail = (e: PgErr) => (MISSING.has(e.code ?? "") ? voiceMissing() : Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint }));
/** رمزُ الرفض من الخادم (raise exception 'voice_…') — رسالتُه هي الرمز. */
export const voiceCode = (e: unknown): string => {
  const m = (e as { message?: unknown } | null)?.message;
  const c = (e as { code?: unknown } | null)?.code;
  return typeof m === "string" && /^voice_[a-z_]+$/.test(m) ? m : typeof c === "string" ? c : "";
};

export function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

/** عمرُ الصفّ كما يرجع (history مصفوفةٌ دائماً، والأعدادُ أعداد). */
export function readVoiceRow(r: Record<string, unknown>): VoiceRow {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  return {
    id: String(r.id), clinic_id: String(r.clinic_id ?? ""), pet_id: String(r.pet_id), visit_id: String(r.visit_id),
    kind: (s("kind") ?? "note") as VoiceKind, day: s("day"), path: String(r.path), mime: (s("mime") ?? "audio/mp4") as VoiceMime,
    codecs: s("codecs"), duration_ms: Number(r.duration_ms) || 0, bytes: Number(r.bytes) || 0, sha256: String(r.sha256 ?? ""),
    recorded_at: String(r.recorded_at ?? ""), created_at: String(r.created_at ?? ""), created_by: s("created_by"),
    doctor_name: s("doctor_name"), pet_name: s("pet_name"), voided_at: s("voided_at"), voided_by: s("voided_by"),
    voided_name: s("voided_name"), void_reason: s("void_reason"),
    history: Array.isArray(r.history) ? (r.history as VoiceRow["history"]) : [],
  };
}

const PAGE = 500;

/** الرفعُ بـXHR: إلغاءٌ حقيقيّ وتقدّم. حالةُ الردّ تُحمل على الخطأ (يصنّفها الرافع). */
function xhrPut(path: string, blob: Blob, contentType: string, token: string, opts: PutOpts): Promise<void> {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${supabaseUrl}/storage/v1/object/${VOICE_BUCKET}/${path}`);
    x.setRequestHeader("authorization", `Bearer ${token}`);
    x.setRequestHeader("apikey", supabaseAnonKey);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("content-type", contentType);
    x.setRequestHeader("cache-control", "max-age=3600");
    x.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) { ok(); return; }
      let msg = x.statusText || `HTTP ${x.status}`;
      try { const j = JSON.parse(x.responseText) as { message?: string; error?: string }; msg = j.message || j.error || msg; } catch { /* نصٌّ غيرُ JSON */ }
      no(Object.assign(new Error(msg), { status: x.status }));
    };
    x.onerror = () => no(new TypeError("Failed to fetch"));
    x.ontimeout = () => no(new TypeError("timeout"));
    x.onabort = () => no(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (opts.signal) {
      if (opts.signal.aborted) { x.abort(); return; }
      opts.signal.addEventListener("abort", () => x.abort(), { once: true });
    }
    x.send(blob);
  });
}

const cloud = (): VoiceApi => {
  const sb = supabase!;
  return {
    async canRecord() {
      try { return (await rpcJson<boolean>("voice_can_record", {})) === true; }
      catch (e) { if (isVoiceMissing(e)) throw voiceMissing(); throw e; }
    },
    async list(visitId) {
      const out: VoiceRow[] = [];
      for (let from = 0; ; ) {
        const { data, error } = await sb.from("visit_voice_notes").select("*").eq("visit_id", visitId)
          .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw fail(error);
        const rows = (data ?? []) as Record<string, unknown>[];
        if (!rows.length) break;
        out.push(...rows.map(readVoiceRow));
        from += rows.length; // بما وصل لا بما طُلب (سقفُ الخادم ألف)
      }
      return out;
    },
    async orphans() {
      const out: VoiceRow[] = [];
      for (let from = 0; ; ) {
        const { data, error } = await sb.rpc("voice_orphans").range(from, from + PAGE - 1);
        if (error) throw fail(error);
        const rows = (data ?? []) as Record<string, unknown>[];
        if (!rows.length) break;
        out.push(...rows.map(readVoiceRow));
        from += rows.length;
      }
      return out;
    },
    async sign(paths) {
      if (!paths.length) return {};
      const { data, error } = await sb.storage.from(VOICE_BUCKET).createSignedUrls(paths, SIGN_SECONDS);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out[r.path] = r.signedUrl;
      return out;
    },
    async putObject(path, blob, contentType, opts = {}) {
      writable();
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw Object.assign(new Error("JWT expired"), { status: 401 });
      await xhrPut(path, blob, contentType, token, opts);
    },
    async info(path) {
      const { data, error } = await sb.storage.from(VOICE_BUCKET).info(path);
      if (error) {
        const st = Number((error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode);
        if (st === 404 || st === 400 || /not.?found/i.test(error.message)) return null;
        throw error;
      }
      const size = Number((data as { size?: unknown } | null)?.size);
      return Number.isFinite(size) ? size : null;
    },
    async add(p) {
      writable();
      return readVoiceRow(await rpcJson<Record<string, unknown>>("voice_note_add", { p }));
    },
    async voidNote(id, reason) {
      writable();
      return readVoiceRow(await rpcJson<Record<string, unknown>>("voice_note_void", { p_id: id, p_reason: reason }));
    },
    async restore(id) {
      writable();
      return readVoiceRow(await rpcJson<Record<string, unknown>>("voice_note_restore", { p_id: id }));
    },
    async dropOrphan(path) {
      const { data, error } = await sb.storage.from(VOICE_BUCKET).remove([path]);
      if (error) throw error;
      return (data ?? []).some((o) => (o as { name?: string }).name === path);
    },
    async serverClinic() {
      const { data, error } = await sb.rpc("my_workspace");
      if (error) throw fail(error);
      const c = (data as { clinic_id?: string | null } | null)?.clinic_id;
      return typeof c === "string" && c ? c : null;
    },
    async visitExists(visitId) {
      const { data, error } = await sb.from("clinic_visits").select("id").eq("id", visitId).limit(1);
      if (error) throw fail(error);
      return (data ?? []).length > 0;
    },
  };
};

/* التجريبيّ: نفسُ العقد والحرّاس (demoVoice.ts)، كسولٌ من باب repoDemo وحده. */
const local = () => import("./repoDemo").then((m) => m.loadDemoVoice());
const demo: VoiceApi = {
  canRecord: async () => (await local()).demoVoiceCanRecord(),
  list: async (v) => (await local()).demoVoiceList(v),
  orphans: async () => (await local()).demoVoiceOrphans(),
  sign: async (p) => (await local()).demoVoiceSign(p),
  putObject: async (path, blob, type, opts) => { writable(); return (await local()).demoVoicePut(path, blob, type, opts); },
  info: async (p) => (await local()).demoVoiceInfo(p),
  add: async (p) => { writable(); return (await local()).demoVoiceAdd(p); },
  voidNote: async (id, r) => { writable(); return (await local()).demoVoiceVoid(id, r); },
  restore: async (id) => { writable(); return (await local()).demoVoiceRestore(id); },
  dropOrphan: async (p) => (await local()).demoVoiceDrop(p),
  serverClinic: async () => (await local()).demoVoiceClinic(),
  visitExists: async (v) => (await local()).demoVoiceVisitExists(v),
};

export const voiceApi: VoiceApi = supabase ? cloud() : demo;
export const voiceIsDemo = !supabase;
