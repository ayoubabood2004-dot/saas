/* ============================================================================
 * صيغةُ التسجيل — ما يُقرَّر قبل أن يبدأ المسجِّل (صِرفٌ ومفحوصٌ بسلوكه: voice-test).
 *
 * الملفُّ يُسمع على جهازٍ غير الذي سجّله: آيفون يسمع ما سجّله أندرويد والعكس. فالترتيبُ يفضّل
 * AAC داخل MP4 (يُشغَّل بكلّ متصفّح) ثمّ Opus داخل WebM (كروم/فايرفوكس — والآيفون الأقدمُ من 17.4
 * يسمعه بفكّ الترميز اليدويّ، §E)، ثمّ Ogg، ثمّ MP4 العامّ (كروم لينكس يضع فيه Opus). المعدّلُ مضبوطٌ
 * دائماً: ٦٤ ك.ب/ث لـAAC و٣٢ لـOpus — صوتُ كلامٍ واضح بنصف ميغا للدقيقة أو أقلّ.
 * ========================================================================== */
import type { VoiceMime } from "./voiceTypes";

export interface RecFormat {
  /** ما يُعطى لـMediaRecorder. */
  mimeType: string;
  bitsPerSecond: number;
}

/** ترتيبُ الصيغ — الأولى التي يقبلها المتصفّح. */
export const FORMAT_ORDER: readonly RecFormat[] = [
  { mimeType: "audio/mp4;codecs=mp4a.40.2", bitsPerSecond: 64_000 },
  { mimeType: "audio/webm;codecs=opus", bitsPerSecond: 32_000 },
  { mimeType: "audio/ogg;codecs=opus", bitsPerSecond: 32_000 },
  { mimeType: "audio/mp4", bitsPerSecond: 64_000 },
];

/** أوّلُ صيغةٍ يقبلها المسجِّل، أو null = هذا المتصفّحُ لا يسجّل صوتاً. */
export function pickFormat(isTypeSupported: (t: string) => boolean): RecFormat | null {
  for (const f of FORMAT_ORDER) {
    try { if (isTypeSupported(f.mimeType)) return f; } catch { /* متصفّحٌ يرمي بدل false — نكمل */ }
  }
  return null;
}

/** الأساسُ الذي يُخزَّن (بلا معاملات): `audio/x-m4a` = MP4؛ وما ليس صوتاً من الثلاثة = null. */
export function baseMime(mime: string | null | undefined): VoiceMime | null {
  const b = String(mime ?? "").split(";")[0].trim().toLowerCase();
  if (b === "audio/mp4" || b === "audio/x-m4a" || b === "audio/m4a") return "audio/mp4";
  if (b === "audio/webm") return "audio/webm";
  if (b === "audio/ogg") return "audio/ogg";
  return null;
}

/** امتدادُ الملفّ بالدلو — يطابق قيدَ المسار بالخادم حرفاً. */
export function extOf(base: VoiceMime): "m4a" | "webm" | "ogg" {
  return base === "audio/mp4" ? "m4a" : base === "audio/webm" ? "webm" : "ogg";
}

/** الترميزُ من `;codecs=…` (بلا اقتباس وبحروفٍ صغيرة)، أو null إن غاب أو لم يطابق قيدَ الخادم. */
export function codecsOf(mime: string | null | undefined): string | null {
  const m = /;\s*codecs\s*=\s*"?([^";]+)"?/i.exec(String(mime ?? ""));
  const c = m ? m[1].trim().toLowerCase() : "";
  return /^[a-z0-9.]{1,24}$/.test(c) ? c : null;
}

/** المدّةُ `0:42` / `12:05` بأرقامٍ غربية (كلّ أرقام الشاشة). */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** هل يشغّل `<audio>` هذا الملفَّ هنا؟ «صيغةٌ لا تُشغَّل» تُقرَّر من هنا وحده — لا من خطأ تشغيلٍ
 *  قد يكون رابطاً انتهى (§E). */
export function canPlayHere(mime: VoiceMime, codecs: string | null, canPlayType: (t: string) => string): boolean {
  try {
    const full = codecs ? `${mime}; codecs="${codecs}"` : mime;
    return canPlayType(full) !== "" || (!codecs && canPlayType(mime) !== "");
  } catch { return false; }
}

/** اسمُ الملفّ المنزَّل: `<الحيوان>-<yyyy-mm-dd>-<m-ss>.<ext>` بلا محارفَ يرفضها نظامُ الملفّات. */
export function clipFileName(pet: string | null | undefined, isoDay: string, ms: number, ext: string): string {
  const safe = String(pet ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 40) || "voice";
  const day = /^\d{4}-\d{2}-\d{2}/.test(isoDay) ? isoDay.slice(0, 10) : "0000-00-00";
  return `${safe}-${day}-${fmtDuration(ms).replace(":", "-")}.${ext}`;
}
