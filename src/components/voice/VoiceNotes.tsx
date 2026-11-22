/* ============================================================================
 * الملاحظاتُ الصوتية داخل الزيارة والطبلة (0287) — مالكُ نطاق vnote (hot-paths.json).
 *
 * لا يستورده أحدٌ استيراداً ثابتاً: VisitPage وApp.tsx (/voice) يحمّلانه بـpage(…, ["vnote"])، فنصوصُه
 * تصل معه (النصفُ البارد على سقفه). ورفيقاه (VoicePlayer، VoiceRecorderUi) يستوردهما هو وحده.
 *
 * ثلاثُ قواعد من التصميم (docs/voice-notes-plan.md):
 *  • **«انرفع ✓» من صفّ الخادم وحده** — تسجيلُ الجهاز يُعرض بحاله حتى يرجع صفُّه بالمعرّف نفسِه.
 *  • **القائمةُ لا تكذب**: قراءةٌ فشلت تقول «أعد المحاولة» لا «ماكو ملاحظات».
 *  • **لا حذفَ نهائيّ**: الحذفُ إلى «المحذوفة» بسببٍ اختياريّ يراه الكادر، والإرجاعُ بالمعرّف نفسِه.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, Download, Info, Loader2, Mic, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { voiceApi, voiceCode, voiceIsDemo } from "@/lib/voiceApi";
import { isConfigReadOnly } from "@/lib/clinicSync";
import { outboxInternals } from "@/lib/outbox";
import { useCanRecord, useVoiceVisit, replaceVoiceRow } from "@/lib/voice/useVoiceVisit";
import { armUploader, clipBytes, discardClip, kickUploader, requestVoid, retryClip } from "@/lib/voice/voiceUploader";
import { allClips, onShelfChange, uploadProgress } from "@/lib/voice/voiceShelf";
import { findCrashed, saveCrashed } from "@/lib/voice/voiceRecorder";
import { clipFileName, extOf, fmtDuration } from "@/lib/voice/voiceFormat";
import type { FailReason, LocalClip, VoiceKind, VoiceRow, WaitReason } from "@/lib/voice/voiceTypes";
import { VoicePlayer } from "./VoicePlayer";
import { VoiceRecorderPanel } from "./VoiceRecorderUi";

// الرافعُ يشتغل حين تُحمَّل هذه القطعة (زيارةٌ أو /voice) — والشريطُ يحمّله وحده حين يرى ما ينتظر.
armUploader();

type T = ReturnType<typeof useTranslation>["t"];
const DAY_MS = 24 * 3600_000;

const FAIL_KEY: Record<FailReason, string> = {
  forbidden: "forbidden", visit: "visit", bug: "bug", id: "id", server_file: "serverFile",
  too_big: "tooBig", format: "format", local_corrupt: "localCorrupt", no_head: "noHead",
};
const WAIT_KEY: Record<WaitReason, string> = {
  network: "waiting", server: "server", read_only: "readOnly", other_clinic: "otherClinic", other_user: "otherUser", not_ready: "notReady",
};
/** فشلٌ لا يُصلحه الانتظار: الحذفُ هنا مسحٌ من الجهاز بعد «نزّله ملف»، لا طلبُ حذفٍ يرتفع. */
const DEAD: ReadonlySet<FailReason> = new Set<FailReason>(["forbidden", "visit", "no_head", "local_corrupt", "id", "bug", "too_big", "format"]);

function errText(t: T, e: unknown): string {
  if ((e as { name?: string } | null)?.name === "ReadOnlyError") return t("vnote.readOnly");
  switch (voiceCode(e)) {
    case "voice_operator": return t("vnote.err.operator");
    case "voice_forbidden": return t("vnote.err.forbidden");
    case "voice_void_forbidden": return t("vnote.err.voidForbidden");
    case "voice_restore_forbidden": return t("vnote.err.restoreForbidden");
    case "voice_gone": return t("vnote.err.gone");
    default: return t("vnote.err.generic");
  }
}

function kindLabel(t: T, kind: VoiceKind, day: string | null, lang: string): string {
  return kind === "day" ? t("vnote.kind.day", { day: day ? formatDate(day, lang) : "" }) : t(`vnote.kind.${kind}`);
}

function clipStatus(t: T, c: LocalClip, prog?: { pct: number; slow: boolean }): string {
  const s = c.state === "recording" ? t("vnote.st.recording")
    : c.state === "saving" ? t("vnote.st.saving")
    : c.state === "recorded" ? t("vnote.st.local")
    : c.state === "memory" ? t("vnote.st.memory")
    : c.state === "uploading" ? (prog?.slow ? t("vnote.st.slow") : t("vnote.st.uploading", { pct: prog?.pct ?? 0 }))
    : c.state === "waiting" ? t(`vnote.st.${WAIT_KEY[c.reason as WaitReason] ?? "waiting"}`)
    : c.state === "failed" ? t("vnote.st.failed", { why: t(`vnote.err.${FAIL_KEY[c.reason as FailReason] ?? "generic"}`) })
    : t("vnote.st.saved");
  return c.void_requested ? `${s} · ${t("vnote.st.voidPending")}` : s;
}

async function downloadClip(c: LocalClip): Promise<void> {
  const bytes = await clipBytes(c);
  if (!bytes) throw new Error("no_bytes");
  const mime = c.mime ?? "audio/mp4";
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = clipFileName(c.pet_label, c.recorded_at, c.duration_ms ?? 0, extOf(mime));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** رابطُ تشغيلٍ لتسجيل الجهاز (blob:)، يُبنى مرّةً ويُفكّ عند الخروج. `failed`: البايتاتُ ما انقرأت (بدايةٌ ناقصة). */
function useClipUrl(c: LocalClip): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = c.state !== "recording" && c.state !== "saving" && !!c.mime;
  useEffect(() => {
    if (!ready) return;
    let on = true;
    let made: string | null = null;
    void clipBytes(c).then((b) => {
      if (!on) return;
      if (!b) { setFailed(true); return; }
      made = URL.createObjectURL(new Blob([b as BlobPart], { type: c.mime ?? "audio/mp4" }));
      setUrl(made);
    }, () => { if (on) setFailed(true); });
    return () => { on = false; if (made) URL.revokeObjectURL(made); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- البايتاتُ لا تتغيّر لمعرّفٍ ثابت بعد الحفظ
  }, [c.id, ready]);
  return { url, failed };
}

/* ── تأكيدُ الحذف داخل البطاقة (لا window.confirm) ───────────────────────── */
function DeleteAsk({ text, onYes, onNo, busy }: { text: string; onYes: (reason: string | null) => void; onNo: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
      <p className="text-xs font-bold text-danger-700 dark:text-danger-200">{text}</p>
      <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("vnote.del.reason")} className="input h-9 text-xs" />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => onYes(reason.trim() || null)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60">
          {busy && <Loader2 size={12} className="animate-spin" />} {t("vnote.del.yes")}
        </button>
        <button type="button" onClick={onNo} className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink">{t("vnote.del.no")}</button>
      </div>
    </div>
  );
}

/* ── تسجيلٌ على هذا الجهاز لم يرتفع بعد ──────────────────────────────────── */
function LocalClipCard({ clip, lang, showPet = false }: { clip: LocalClip; lang: string; showPet?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { url, failed: unreadable } = useClipUrl(clip);
  const [ask, setAsk] = useState<"void" | "discard" | null>(null);
  const [busy, setBusy] = useState(false);
  const prog = uploadProgress.get(clip.id);
  const dead = clip.state === "failed" && DEAD.has(clip.reason as FailReason);
  const tone = clip.state === "failed" ? "text-danger-600" : clip.state === "memory" ? "text-warn-700 dark:text-warn-200" : "text-ink-muted";
  const dur = fmtDuration(clip.duration_ms ?? clip.clock_ms ?? 0);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setAsk(null); } catch { toast.error(t("vnote.err.generic")); } finally { setBusy(false); }
  };

  return (
    <div data-voice-local={clip.id} className={cn("rounded-xl border border-dashed border-line-strong bg-surface-1 p-3", clip.void_requested && "opacity-60")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-subtle">
        {showPet && clip.pet_label && <span className="font-extrabold text-ink">{clip.pet_label}</span>}
        <span className="font-semibold text-ink-muted">{kindLabel(t, clip.kind, clip.day, lang)}</span>
        <span>{formatDate(clip.recorded_at, lang)} · {formatTime(clip.recorded_at, lang)}</span>
      </div>
      {unreadable ? <p className="text-2xs font-bold text-danger-600">{t("vnote.shelf.noHead")}</p> : clip.mime && clip.state !== "recording" && (
        <VoicePlayer id={`l:${clip.id}`} url={url} mime={clip.mime} codecs={clip.codecs ?? null} durationMs={clip.duration_ms ?? 0}
          bytes={async () => { const b = await clipBytes(clip); return b ? (b.slice().buffer as ArrayBuffer) : null; }} />
      )}
      <p className={cn("mt-1.5 text-2xs font-bold", tone)} role="status">
        {clipStatus(t, clip, prog)}{clip.maybe_cut ? ` · ${t("vnote.rec.maybeCut")}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(clip.state === "waiting" || (clip.state === "failed" && !dead)) && (
          <button type="button" onClick={() => void run(() => retryClip(clip))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-2xs font-bold text-ink">
            <RefreshCw size={12} /> {t("vnote.st.retry")}
          </button>
        )}
        {clip.state !== "recording" && clip.state !== "saving" && (
          <button type="button" onClick={() => void downloadClip(clip).catch(() => toast.error(t("vnote.err.noHead")))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-2xs font-bold text-ink">
            <Download size={12} /> {t("vnote.shelf.download")}
          </button>
        )}
        {!clip.void_requested && clip.state !== "recording" && clip.state !== "saving" && (
          <button type="button" onClick={() => setAsk(dead ? "discard" : "void")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-2xs font-bold text-danger-600">
            <Trash2 size={12} /> {dead ? t("vnote.shelf.discard") : t("vnote.del.btn")}
          </button>
        )}
      </div>
      {ask === "void" && (
        <DeleteAsk busy={busy} text={t("vnote.del.ask", { dur, who: user?.full_name || "—", time: `${formatDate(clip.recorded_at, lang)} ${formatTime(clip.recorded_at, lang)}` })}
          onNo={() => setAsk(null)} onYes={(r) => void run(() => requestVoid(clip, r))} />
      )}
      {ask === "discard" && (
        <div className="mt-2 space-y-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-xs font-bold text-danger-700 dark:text-danger-200">{t("vnote.shelf.discardAsk", { dur, pet: clip.pet_label ?? "" })}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(() => discardClip(clip.id))} className="rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60">{t("vnote.shelf.discardYes")}</button>
            <button type="button" onClick={() => setAsk(null)} className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink">{t("vnote.shelf.keep")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ملاحظةٌ وصلت الخادم ─────────────────────────────────────────────────── */
function RowCard({ row, url, visitId, ended, lang, showPet = false, readonly = false, resign }: {
  row: VoiceRow; url: string | undefined; visitId: string | null; ended: boolean; lang: string; showPet?: boolean;
  /** تسجيلُ حيوانٍ انحذف: سماعٌ فقط (الحيوانُ لا يُسترجع). */
  readonly?: boolean;
  resign?: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { role } = usePermissions();
  const me = outboxInternals.whoNow()?.user ?? null;
  const manager = role === "manager";
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const voided = !!row.voided_at;
  const now = Date.now();
  const canVoid = !readonly && !voided && (manager || (row.created_by === me && now - Date.parse(row.created_at) < DAY_MS && !ended));
  const canRestore = !readonly && voided && (manager || (row.voided_by === me && now - Date.parse(row.voided_at!) < DAY_MS));
  const late = Date.parse(row.created_at) - Date.parse(row.recorded_at) > 10 * 60_000;
  const dur = fmtDuration(row.duration_ms);

  const act = async (fn: () => Promise<VoiceRow>, done: string) => {
    setBusy(true);
    try {
      const next = await fn();
      if (visitId) replaceVoiceRow(visitId, next);
      toast.success(done);
      setAsk(false);
    } catch (e) { toast.error(errText(t, e)); } finally { setBusy(false); }
  };

  return (
    <div data-voice-row={row.id} className={cn("rounded-xl border border-line bg-surface-1 p-3", voided && "bg-surface-2/60")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-subtle">
        {showPet && row.pet_name && <span className="font-extrabold text-ink">{row.pet_name}</span>}
        <span className="font-semibold text-ink-muted">{kindLabel(t, row.kind, row.day, lang)}</span>
        <span className="font-semibold text-ink-muted">{row.doctor_name || "—"}</span>
        <span>{formatDate(row.recorded_at, lang)} · {formatTime(row.recorded_at, lang)}</span>
        {late && <span className="text-warn-700 dark:text-warn-200">{t("vnote.play.late", { time: `${formatDate(row.created_at, lang)} ${formatTime(row.created_at, lang)}` })}</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t("vnote.del.details")} className="ms-auto rounded-full p-1 text-ink-subtle hover:text-ink">
          <Info size={13} />
        </button>
      </div>
      {voided && !url
        ? <p className="text-2xs font-bold text-ink-subtle">{t("vnote.play.hidden")}</p>
        : <VoicePlayer id={row.id} url={url ?? null} mime={row.mime} codecs={row.codecs} durationMs={row.duration_ms} resign={resign} />}
      {voided && (
        <p className="mt-1.5 text-2xs font-semibold text-ink-muted">
          {t("vnote.del.by", { who: row.voided_name || "—", time: `${formatDate(row.voided_at!, lang)} ${formatTime(row.voided_at!, lang)}` })}
          {row.void_reason ? ` · ${t("vnote.del.why", { why: row.void_reason })}` : ""}
        </p>
      )}
      {open && (
        <div className="mt-2 space-y-0.5 rounded-lg bg-surface-2 p-2 text-2xs text-ink-muted">
          <p>{t("vnote.del.fmt", { fmt: row.codecs ? `${row.mime} (${row.codecs})` : row.mime, size: Math.max(1, Math.round(row.bytes / 1024)) })}</p>
          {row.history.map((h, i) => (
            <p key={i}>{t(h.a === "void" ? "vnote.del.histVoid" : "vnote.del.histRestore", { time: `${formatDate(h.at, lang)} ${formatTime(h.at, lang)}`, who: h.name || "—" })}{h.reason ? ` · ${h.reason}` : ""}</p>
          ))}
        </div>
      )}
      {(canVoid || canRestore) && !ask && (
        <div className="mt-2 flex gap-1.5">
          {canVoid && (
            <button type="button" onClick={() => setAsk(true)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-2xs font-bold text-danger-600">
              <Trash2 size={12} /> {t("vnote.del.btn")}
            </button>
          )}
          {canRestore && (
            <button type="button" disabled={busy} onClick={() => void act(() => voiceApi.restore(row.id), t("vnote.del.restored"))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-2xs font-bold text-brand-700 disabled:opacity-60 dark:text-brand-300">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} {t("vnote.del.restore")}
            </button>
          )}
        </div>
      )}
      {ask && (
        <DeleteAsk busy={busy}
          text={t("vnote.del.ask", { dur, who: row.doctor_name || "—", time: `${formatDate(row.recorded_at, lang)} ${formatTime(row.recorded_at, lang)}` })}
          onNo={() => setAsk(false)} onYes={(r) => void act(() => voiceApi.voidNote(row.id, r), t("vnote.del.done"))} />
      )}
    </div>
  );
}

/** توقيعٌ جديد لمسارٍ واحد (الرابطُ انتهى أو فشل نقلُه). */
const resignOf = (path: string) => async (): Promise<string | null> => (await voiceApi.sign([path]))[path] ?? null;

/* ── زرُّ «ملاحظة صوتية» بشريط الزيارة ───────────────────────────────────── */
export function VoiceRecordButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const can = useCanRecord();
  if (!can || isConfigReadOnly()) return null;
  return (
    <button type="button" data-voice-btn onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
      <Mic size={15} /> {t("vnote.btn")}
    </button>
  );
}

/* ── المسجِّلُ داخل نافذة الملاحظة ─────────────────────────────────────────── */
export function VoiceNoteRecorder({ petId, petName, visitId, kind, day, onBusy }: {
  petId: string; petName?: string; visitId: string; kind: VoiceKind; day: string | null; onBusy?: (busy: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const can = useCanRecord();
  const v = useVoiceVisit(visitId);
  const [mine, setMine] = useState<string[]>([]);
  if (v.missing || !can) return null;
  if (isConfigReadOnly()) return <p className="text-2xs font-bold text-ink-subtle">{t("vnote.readOnly")}</p>;
  const target = { pet_id: petId, visit_id: visitId, kind, day, pet_label: petName };
  return (
    <div className="space-y-2">
      <VoiceRecorderPanel target={target} demo={voiceIsDemo} onBusy={onBusy} onSaved={(c) => setMine((m) => [...m, c.id])} />
      {voiceIsDemo && <p className="text-2xs text-ink-subtle">{t("vnote.demo")}</p>}
      {mine.map((id) => {
        const row = v.rows.find((r) => r.id === id);
        const clip = v.local.find((c) => c.id === id);
        if (row) return <p key={id} className="text-2xs font-bold text-brand-700 dark:text-brand-300">{fmtDuration(row.duration_ms)} · {t("vnote.st.saved")}</p>;
        if (clip) return <LocalClipCard key={id} clip={clip} lang={i18n.language} />;
        return null;
      })}
    </div>
  );
}

/* ── قسمُ «الملاحظات الصوتية» بصفحة الزيارة ─────────────────────────────── */
export function VoiceNotesPanel({ visitId, ended }: { visitId: string; ended: boolean }) {
  const { t, i18n } = useTranslation();
  const v = useVoiceVisit(visitId);
  const [trashOpen, setTrashOpen] = useState(false);
  useEffect(() => { kickUploader(); }, []);
  const lang = i18n.language;
  const ids = useMemo(() => new Set(v.rows.map((r) => r.id)), [v.rows]);
  const live = v.rows.filter((r) => !r.voided_at);
  const trash = v.rows.filter((r) => r.voided_at);
  const local = v.local.filter((c) => !ids.has(c.id));
  if (v.missing) return null;
  if (v.error && !v.rows.length) {
    return (
      <section data-voice-panel className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
        <p className="text-xs font-bold text-danger-700 dark:text-danger-200">{t("vnote.list.failed")}</p>
        <button type="button" onClick={v.reload} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink">
          <RefreshCw size={12} /> {t("vnote.list.retry")}
        </button>
      </section>
    );
  }
  if (!live.length && !trash.length && !local.length) return null;
  return (
    <section data-voice-panel className="mt-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600 dark:from-rose-500/25 dark:to-rose-500/10 dark:text-rose-300"><Mic size={16} /></span>
        {t("vnote.titleN", { n: live.length + local.length })}
        {v.loading && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {local.map((c) => <LocalClipCard key={c.id} clip={c} lang={lang} />)}
        {live.map((r) => <RowCard key={r.id} row={r} url={v.urls[r.path]} visitId={visitId} ended={ended} lang={lang} resign={resignOf(r.path)} />)}
      </div>
      {trash.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setTrashOpen((o) => !o)} aria-expanded={trashOpen}
            className="inline-flex items-center gap-1 text-xs font-bold text-ink-subtle hover:text-ink">
            <ChevronDown size={13} className={cn("transition", trashOpen && "rotate-180")} /> {t("vnote.list.trash", { n: trash.length })}
          </button>
          {trashOpen && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {trash.map((r) => <RowCard key={r.id} row={r} url={v.urls[r.path]} visitId={visitId} ended={ended} lang={lang} resign={resignOf(r.path)} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── رقاقاتُ يومٍ بالطبلة ─────────────────────────────────────────────────── */
export function VoiceDayChips({ visitId, day }: { visitId: string; day: string }) {
  const v = useVoiceVisit(visitId);
  const rows = v.rows.filter((r) => r.kind === "day" && r.day === day && !r.voided_at);
  if (v.missing || !rows.length) return null;
  return (
    <div data-voice-day={day} className="mt-1 space-y-1">
      {rows.map((r) => (
        <VoicePlayer key={r.id} id={`d:${r.id}`} url={v.urls[r.path] ?? null} mime={r.mime} codecs={r.codecs} durationMs={r.duration_ms} resign={resignOf(r.path)} compact />
      ))}
    </div>
  );
}

/* ── /voice: ما على هذا الجهاز، وما انقطع، وتسجيلاتُ حيواناتٍ انحذفت ─────── */
export function VoiceShelfPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { signOut } = useAuth();
  const { role } = usePermissions();
  const [params] = useSearchParams();
  const leave = params.get("leave") === "1";
  const me = outboxInternals.whoNow()?.user ?? null;
  const [clips, setClips] = useState<LocalClip[]>([]);
  const [crashed, setCrashed] = useState<LocalClip[]>([]);
  const [orph, setOrph] = useState<{ rows: VoiceRow[]; urls: Record<string, string> } | null>(null);
  const [orphErr, setOrphErr] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    const all = await allClips();
    setClips(all);
    setCrashed(await findCrashed());
  }, []);
  useEffect(() => {
    void refresh();
    kickUploader(true);
    return onShelfChange(() => { void refresh(); });
  }, [refresh]);

  const loadOrphans = useCallback(async () => {
    setOrphErr(false);
    try {
      const rows = await voiceApi.orphans();
      const urls = rows.length ? await voiceApi.sign(rows.map((r) => r.path)) : {};
      setOrph({ rows, urls });
    } catch { setOrphErr(true); }
  }, []);
  useEffect(() => { if (role === "manager") void loadOrphans(); }, [role, loadOrphans]);

  const crashedIds = new Set(crashed.map((c) => c.id));
  const mine = clips.filter((c) => c.who?.user === me && !crashedIds.has(c.id));
  const others = clips.filter((c) => c.who?.user !== me).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink"><Mic size={20} className="text-rose-600" /> {t("vnote.shelf.title")}</h1>
        <p className="mt-1 text-xs text-ink-muted">{t("vnote.shelf.hint")}</p>
      </header>

      {leave && mine.length > 0 && (
        <div data-voice-leave className="space-y-2 rounded-2xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-sm font-extrabold text-danger-700 dark:text-danger-200">{t("vnote.leave.title")}</p>
          <p className="text-xs text-danger-700 dark:text-danger-200">{t("vnote.leave.body", { n: mine.length })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => kickUploader(true)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-extrabold text-white">{t("vnote.leave.upload")}</button>
            <button type="button" onClick={() => signOut({ force: true })} className="rounded-lg border border-danger-300 bg-surface-1 px-3 py-1.5 text-xs font-bold text-danger-700">{t("vnote.leave.anyway")}</button>
          </div>
        </div>
      )}

      {crashed.map((c) => (
        <div key={c.id} className="space-y-2 rounded-xl border border-warn-300 bg-warn-50 p-3 dark:border-warn-500/30 dark:bg-warn-500/10">
          <p className="text-xs font-bold text-warn-700 dark:text-warn-200">{c.pet_label ? `${c.pet_label} · ` : ""}{t("vnote.shelf.crashed")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveCrashed(c).then(refresh).catch(() => toast.error(t("vnote.shelf.noHead")))} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-extrabold text-white">{t("vnote.shelf.save")}</button>
            <button type="button" onClick={() => void discardClip(c.id).then(refresh)} className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs font-bold text-danger-600">{t("vnote.shelf.discard")}</button>
          </div>
        </div>
      ))}

      {mine.length === 0 && crashed.length === 0
        ? <p className="rounded-xl border border-line bg-surface-1 p-4 text-sm font-semibold text-ink-muted">{t("vnote.shelf.empty")}</p>
        : (
          <div className="space-y-2">
            {mine.map((c) => (
              <div key={c.id} className="space-y-1">
                <LocalClipCard clip={c} lang={lang} showPet />
                <Link to={`/pet/${c.pet_id}/visit/${c.visit_id}`} className="text-2xs font-bold text-brand-700 hover:underline dark:text-brand-300">{t("vnote.shelf.open")}</Link>
              </div>
            ))}
          </div>
        )}

      {others > 0 && <p className="text-xs font-semibold text-ink-muted">{t("vnote.shelf.others", { n: others })}</p>}

      {role === "manager" && (
        <section className="space-y-2">
          <h2 className="text-sm font-extrabold text-ink">{t("vnote.orph.title", { n: orph?.rows.length ?? 0 })}</h2>
          {orphErr ? (
            <div className="flex items-center gap-2 text-xs font-bold text-danger-600">
              {t("vnote.list.failed")}
              <button type="button" onClick={() => void loadOrphans()} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-ink"><RefreshCw size={12} /> {t("vnote.list.retry")}</button>
            </div>
          ) : !orph ? <Loader2 size={16} className="animate-spin text-ink-subtle" />
            : !orph.rows.length ? <p className="text-xs text-ink-subtle">{t("vnote.orph.empty")}</p>
            : orph.rows.map((r) => <RowCard key={r.id} row={r} url={orph.urls[r.path]} visitId={null} ended lang={lang} showPet readonly resign={resignOf(r.path)} />)}
        </section>
      )}
    </div>
  );
}
