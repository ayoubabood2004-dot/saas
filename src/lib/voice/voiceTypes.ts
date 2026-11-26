/* ============================================================================
 * الملاحظةُ الصوتية — الأنواعُ المشتركة (0287، docs/voice-notes-plan.md).
 *
 * هنا وحدها لأن مكوّناتِ النطاق المملوك `vnote` لا يستوردها أحدٌ من خارجها ولو `import type`
 * (i18n-owned-guard) — فالصفحاتُ والشِفرةُ الصِّرفة تأخذ الأنواعَ من هنا.
 * ========================================================================== */

/** نوعُ الملاحظة: للزيارة، ليومٍ بالطبلة، لخطّة التشخيص، أو لإغلاق الزيارة (محجوزٌ بلا واجهة بعد). */
export type VoiceKind = "note" | "day" | "plan" | "closing";

/** الأنواعُ الثلاثة التي يقبلها الدلوُ والجدول — الأساسُ بلا `;codecs`. */
export type VoiceMime = "audio/mp4" | "audio/webm" | "audio/ogg";

/** سطرٌ بسجلّ الحذف والإرجاع على الصفّ — تكتبه دوالُّ الخادم وحدها. */
export interface VoiceHistoryEntry {
  a: "void" | "restore";
  at: string;
  by: string | null;
  name?: string | null;
  reason?: string | null;
}

/** صفُّ `visit_voice_notes` كما يرجعه الخادم. */
export interface VoiceRow {
  id: string;
  clinic_id: string;
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
  created_at: string;
  created_by: string | null;
  doctor_name: string | null;
  pet_name: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_name: string | null;
  void_reason: string | null;
  history: VoiceHistoryEntry[];
}

/** إشارةٌ لملاحظةٍ صوتية داخل الخطّة (`ClinicalRecord.voice`) — المعرّفُ والمدّة والمسجِّل، فجهازٌ ثانٍ
 *  يقول «تسجيل د. علي (0:42) ما ارتفع بعد» عمّا لم يصل الخادمَ بعد. */
export interface VoiceRef {
  id: string;
  ms: number;
  by?: string;
}

/** هويّةُ من سجّل — ختمُ الطابور نفسُه (outbox `whoNow`): لا يُرفع التسجيلُ إلا بها. */
export interface VoiceWho {
  user: string;
  clinic: string;
}

/** أين التسجيلُ الآن. `memory`: ما قدر الجهازُ يحفظه (IndexedDB فشل) — بالذاكرة وحدها حتى يرتفع. */
export type ClipState = "recording" | "saving" | "recorded" | "memory" | "uploading" | "saved" | "waiting" | "failed";

/** لماذا ينتظر (يعود وحده). */
export type WaitReason = "network" | "server" | "read_only" | "other_clinic" | "other_user" | "not_ready";

/** لماذا فشل (يحتاج الطبيب — لا يُمحى أبداً بلا كلمته). */
export type FailReason =
  | "forbidden" | "visit" | "bug" | "id" | "server_file" | "too_big" | "format" | "local_corrupt" | "no_head";

/** تسجيلٌ على هذا الجهاز لم يُؤكَّد بالخادم بعد. */
export interface LocalClip {
  id: string;
  who: VoiceWho | null;
  pet_id: string;
  visit_id: string;
  kind: VoiceKind;
  day: string | null;
  /** اسمُ الحيوان وتاريخُ الزيارة كما رآهما الطبيب — لتسمية التسجيل بـ/voice والملفّ المنزَّل. */
  pet_label?: string;
  visit_label?: string;
  recorded_at: string;
  state: ClipState;
  reason?: WaitReason | FailReason;
  mime?: VoiceMime;
  codecs?: string | null;
  bytes?: number;
  sha256?: string;
  /** مدّةُ الوسيط من الحاوية (لا `audio.duration`) — وبالساعة إن تعذّر قراءتُها. */
  duration_ms?: number;
  /** مدّةُ الساعة من البدء للإيقاف — لفحص الانقطاع (الوسيطُ أقلُّ من ٦٠٪ منها). */
  clock_ms?: number;
  /** آخرُ قطعةٍ وصلت (ساعةُ الجهاز) — احتياطُ الحياة بلا Web Locks وحده. */
  alive_at: number;
  attempts: number;
  next_at?: number;
  /** ضُغط «حذف» قبل أن يصل الخادم: يرتفع ثم يُحذف (يبقى قابلاً للإرجاع). */
  void_requested?: { at: string; reason: string | null };
  /** لماذا وقف التسجيلُ وحده (انقفلت الشاشة، اتصال، …). */
  interrupted?: "hidden" | "track" | "error" | "limit" | "closed" | "logout";
  /** الوسيطُ أقصرُ كثيراً من الساعة — «يمكن انقطع، اسمعه قبل ما تعتمد عليه». */
  maybe_cut?: boolean;
  /** IndexedDB فشل أثناء التسجيل — البايتاتُ بالذاكرة وحدها. */
  memory_only?: boolean;
}

/** عدُّ ما لم يرتفع لكلّ مستخدم: [العدد، منها فاشل]. */
export type PendingFlag = Record<string, [number, number]>;
