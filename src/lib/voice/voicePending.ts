/* ============================================================================
 * علمُ «تسجيلاتٌ ما ارتفعت» المتزامن — يقرؤه شريطُ الإقلاع (VoiceChip) بلا قاعدةٍ ولا رفّ.
 *
 * وحدةٌ صغيرة وحدها: الشريطُ بحزمة الإقلاع، والرفُّ (IndexedDB، المرآة) والمسجِّلُ كسولان — استيرادُ
 * دالّةٍ واحدة من voiceShelf كان سيُدخله كلَّه الإقلاع (درسُ 0262: وحدةٌ يستورد الإقلاعُ منها دالّةً تُدخلها كلَّها).
 * ========================================================================== */
import type { PendingFlag } from "./voiceTypes";

export const PENDING_KEY = "vp_voice_pending";
export const PENDING_EVENT = "vp:voice-pending";

/** ما يعرضه الشريط: تسجيلاتي (ومنها فاشل)، وتسجيلاتُ حساباتٍ أخرى على هذا الجهاز. */
export function pendingCounts(flag: PendingFlag, user: string | null): { mine: number; mineFailed: number; others: number } {
  let mine = 0, mineFailed = 0, others = 0;
  for (const [k, [n, failed]] of Object.entries(flag)) {
    if (user && k === user) { mine += n; mineFailed += failed; } else others += n;
  }
  return { mine, mineFailed, others };
}

export function readPendingFlag(): PendingFlag {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}") as unknown;
    if (!v || typeof v !== "object") return {};
    const out: PendingFlag = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(x) && typeof x[0] === "number" && typeof x[1] === "number") out[k] = [x[0], x[1]];
    }
    return out;
  } catch { return {}; }
}
