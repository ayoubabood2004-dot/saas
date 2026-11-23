/* ============================================================================
 * ملاحظاتُ زيارةٍ صوتية للشاشة: صفوفُ الخادم + تسجيلاتُ هذا الجهاز التي لم ترتفع + روابطُ التشغيل.
 *
 * مخزنٌ واحد لكلّ زيارة يتشاركه القسمُ ورقاقاتُ أيّام الطبلة (جلبٌ واحد). القراءةُ ترمي ⇒ «أعد المحاولة»
 * لا قائمةٌ فارغة؛ والجدولُ الغائب (واجهةٌ سبقت هجرتها) يُخفي الميزة. الروابطُ لساعة وتُجدَّد كلَّ ٤٥ دقيقة
 * وعند الرجوع للتبويب — فـ`play()` يبقى داخل الضغطة (آيفون) ولا رابطَ منتهٍ.
 * ========================================================================= */
import { useEffect, useState, useSyncExternalStore } from "react";
import { voiceApi, isVoiceMissing } from "../voiceApi";
import { outboxInternals } from "../outbox";
import { allClips, onShelfChange, uploadProgress } from "./voiceShelf";
import { findCrashed } from "./voiceRecorder";
import type { LocalClip, VoiceRow } from "./voiceTypes";

const RESIGN_MS = 45 * 60_000;

interface Entry {
  rows: VoiceRow[];
  urls: Record<string, string>;
  signedAt: number;
  loading: boolean;
  error: unknown | null;
  missing: boolean;
  local: LocalClip[];
  /** «يُسجَّل» بلا مسجِّلٍ حيّ بأيّ تبويب (انقطع) — يُعالج بـ/voice. */
  crashed: Set<string>;
  version: number;
  subs: Set<() => void>;
  inflight: Promise<void> | null;
  /** طُلب جلبٌ أثناء جلبٍ بدأ قبله (صفٌّ ارتفع بعد بدئه): يُعاد بعده، لا يُرجع القديم. */
  again: boolean;
}
const store = new Map<string, Entry>();

function entry(visitId: string): Entry {
  let e = store.get(visitId);
  if (!e) {
    e = { rows: [], urls: {}, signedAt: 0, loading: true, error: null, missing: false, local: [], crashed: new Set(), version: 0, subs: new Set(), inflight: null, again: false };
    store.set(visitId, e);
  }
  return e;
}
function bump(e: Entry): void { e.version++; for (const fn of [...e.subs]) fn(); }

async function sign(e: Entry): Promise<void> {
  const paths = e.rows.map((r) => r.path);
  e.urls = paths.length ? await voiceApi.sign(paths) : {};
  e.signedAt = Date.now();
}

/** أعد جلبَ صفوف الزيارة وروابطها. */
export function reloadVoiceVisit(visitId: string): Promise<void> {
  const e = entry(visitId);
  if (e.inflight) { e.again = true; return e.inflight; }
  e.loading = true;
  e.error = null;
  bump(e);
  e.inflight = (async () => {
    try {
      e.rows = await voiceApi.list(visitId);
      e.missing = false;
      await sign(e);
    } catch (err) {
      if (isVoiceMissing(err)) { e.missing = true; e.rows = []; } else e.error = err;
    } finally {
      e.loading = false;
      e.inflight = null;
      bump(e);
      if (e.again) { e.again = false; void reloadVoiceVisit(visitId); }
    }
  })();
  return e.inflight;
}

async function refreshLocal(visitId: string): Promise<void> {
  const e = entry(visitId);
  const me = outboxInternals.whoNow()?.user ?? null;
  const before = new Set(e.local.map((c) => c.id));
  e.local = (await allClips()).filter((c) => c.visit_id === visitId && (!me || c.who?.user === me))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  e.crashed = e.local.some((c) => c.state === "recording")
    ? new Set((await findCrashed().catch(() => [] as LocalClip[])).map((c) => c.id)) /* swallow-ok: بلا جواب = لا يُقال «انقطع» عن تسجيلٍ ربما حيّ */
    : new Set();
  // تسجيلٌ اختفى من الجهاز = ارتفع (الرافعُ لا يمحو إلا بعد الصفّ) ⇒ الصفوفُ تُجلب من جديد
  const now = new Set(e.local.map((c) => c.id));
  const left = [...before].some((id) => !now.has(id));
  bump(e);
  if (left) void reloadVoiceVisit(visitId);
}

/** بدّل صفّاً بعد حذفٍ أو إرجاع (الخادمُ رجّعه) — بلا جلبٍ جديد. */
export function replaceVoiceRow(visitId: string, row: VoiceRow): void {
  const e = entry(visitId);
  e.rows = e.rows.map((r) => (r.id === row.id ? row : r));
  bump(e);
  void sign(e).then(() => bump(e)).catch(() => undefined); /* swallow-ok: الروابطُ القديمة تبقى، ورابطٌ انتهى يُعاد توقيعُه عند الضغط (المشغّل) أو يقول «ما انحمّل — أعد» */
}

export interface VoiceVisit {
  rows: VoiceRow[];
  local: LocalClip[];
  crashed: Set<string>;
  urls: Record<string, string>;
  loading: boolean;
  error: unknown | null;
  missing: boolean;
  progress: Map<string, { pct: number; slow: boolean }>;
  reload: () => void;
}

export function useVoiceVisit(visitId: string): VoiceVisit {
  const e = entry(visitId);
  useSyncExternalStore((cb) => { e.subs.add(cb); return () => { e.subs.delete(cb); }; }, () => e.version);
  useEffect(() => {
    // كلُّ فتحٍ يجلب: الخبيئةُ تعيش عمرَ التبويب، وطبيبٌ ثانٍ سجّل من هاتفه — كانت تُعاد فقط إن فرغت (القسمُ يختفي فارغاً
    // فلا زرَّ «أعد»). وما وصل يبقى معروضاً أثناء الجلب.
    void reloadVoiceVisit(visitId);
    void refreshLocal(visitId);
    const off = onShelfChange(() => { void refreshLocal(visitId); });
    const tick = () => { if (Date.now() - e.signedAt > RESIGN_MS && e.rows.length) void sign(e).then(() => bump(e)).catch(() => undefined); }; /* swallow-ok: تجديدٌ دوريّ — فشلُه يُعاد بالدقيقة التالية، والمشغّلُ يعيد التوقيع عند الضغط */
    tick(); // روابطُ خبيئةٍ قديمة تُجدَّد عند الفتح لا بعد دقيقة (المشغّلُ يُشغّل داخل الضغطة برابطٍ صالح)
    const iv = setInterval(tick, 60_000);
    const vis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { off(); clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [visitId, e]);
  return {
    rows: e.rows, local: e.local, crashed: e.crashed, urls: e.urls, loading: e.loading, error: e.error, missing: e.missing,
    progress: uploadProgress, reload: () => { void reloadVoiceVisit(visitId); },
  };
}

const CAN_KEY = "vp_voice_can";
/** هل يظهر زرُّ التسجيل؟ الخادمُ يقرّر (voice_can_record)، وآخرُ جوابٍ محفوظٌ لكلّ حسابٍ وعيادة للعرض بلا نت —
 *  وجوابٌ لم يُؤكَّد قطّ يُخفي الزرّ. */
export function useCanRecord(): boolean {
  const who = outboxInternals.whoNow();
  const key = who ? `${who.user}:${who.clinic}` : "";
  const cached = (): boolean => {
    try { return !!key && (JSON.parse(localStorage.getItem(CAN_KEY) || "{}") as Record<string, boolean>)[key] === true; } catch { return false; }
  };
  const [can, setCan] = useState<boolean>(cached);
  useEffect(() => {
    if (!key) { setCan(false); return; }
    let live = true;
    voiceApi.canRecord().then((v) => {
      if (!live) return;
      setCan(v);
      try {
        const m = JSON.parse(localStorage.getItem(CAN_KEY) || "{}") as Record<string, boolean>;
        m[key] = v;
        localStorage.setItem(CAN_KEY, JSON.stringify(m));
      } catch { /* بلا تخزين — الجوابُ لهذه الجلسة */ }
    }).catch(() => { /* بلا نت: آخرُ جوابٍ مؤكَّد */ });
    return () => { live = false; };
  }, [key]);
  return can;
}
