import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud, CloudOff, Loader2, Check, AlertTriangle, History, RotateCcw, Laptop, ShieldQuestion,
} from "lucide-react";
import {
  cageStudio, useCageStudio, cageLayoutHistory, legacyDeviceLayout, flushCageLayout,
} from "@/components/cage3d/store";
import { parseLayout, flatRooms } from "@/lib/cageLayout";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { cn, formatNum, formatDate, dateLocale } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * LayoutSync — «قل للعيادة أين ترتيبُها، وأرجعه لها إن ضاع».
 *
 * الطلب حرفياً: «سويلي طريقة ناكد فيها ان الاقفاص ترتبت بالشكل الي تريده
 * العيادة على نفس الحاسبة بكل مكان». والطريقةُ ليست وعداً بالشِفرة — هي سطرٌ
 * يقوله البرنامج: **محفوظ بالسحابة · النسخة كذا · قبل كذا**، وزرٌّ يقارن ما
 * على الشاشة بما بالسحابة فعلاً ويقول «مطابق» أو «مو مطابق».
 *
 * وثلاثةُ أبوابٍ للخروج من أيّ خطأٍ سابق:
 *   • **سجلُّ الترتيب**: كلُّ نسخةٍ كانت، من سجلّ التدقيق — تُعاين وتُرجَع.
 *   • **التعارض**: جهازان حفظا معاً ⇒ لا حسمَ تلقائيّ، تُعرض النسختان ويُختار.
 *   • **مرآةُ هذا الجهاز**: تخطيطٌ رسمته العيادةُ قبل الإصلاح وبقي محلّياً —
 *     يُعرض ويُرفع **بقرارها**، لا تلقائياً (المفتاحُ القديم بلا اسم عيادة،
 *     فرفعُه تلقائياً يهبط بعيادةٍ غيرِ صاحبته — درس 0153 حرفياً).
 * ==========================================================================*/

const rel = (ms: number | null, t: (k: string, d: string, o?: Record<string, unknown>) => string): string => {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return t("cages.justNow", "هسّه");
  const m = Math.round(s / 60);
  if (m < 60) return t("cages.minsAgo", "قبل {{n}} دقيقة", { n: formatNum(m) });
  return t("cages.hrsAgo", "قبل {{n}} ساعة", { n: formatNum(Math.round(m / 60)) });
};

/** ملخّصٌ يُقرأ بلمحة: كم غرفة وكم قفص، وأسماءُ أوّل الغرف. */
function summarize(raw: string | null): { rooms: number; cages: number; names: string } {
  const l = parseLayout(raw);
  const flat = flatRooms(l);
  return {
    rooms: flat.length,
    cages: l.cages.length,
    names: flat.slice(0, 3).map((r) => r.name).join(" · "),
  };
}

export function LayoutSync({ canEdit }: { canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const s = useCageStudio();
  const toast = useToast();
  const [histOpen, setHistOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ at: string; actor: string | null; layout: string }> | null>(null);
  const [histErr, setHistErr] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // «قبل كذا» يشيخ بلا إعادة رسم — دقّةٌ كل نصف دقيقة تكفي ولا تكلّف شيئاً.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  /* ما لم يُحفظ لا يضيع بإغلاق التاب: المهلةُ تُفرَغ عند الإخفاء. */
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") flushCageLayout(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flushCageLayout);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flushCageLayout);
    };
  }, []);

  /* مرآةُ الجهاز القديمة تُعرض مرّةً واحدة: تخطيطٌ حقيقيٌّ رسمته العيادة قبل
     الإصلاح وما كان يصل السحابةَ أبداً — ولا يُرفع إلا بضغطتها. */
  const legacy = useMemo(() => {
    if (!s.ready || !canEdit) return null;
    const raw = legacyDeviceLayout();
    if (!raw) return null;
    const mine = summarize(null);
    void mine;
    const sum = summarize(raw);
    return sum.cages > s.cages.length ? { raw, ...sum } : null;
  }, [s.ready, s.cages.length, canEdit]);

  const openHistory = async () => {
    playTap();
    setHistOpen(true);
    setRows(null);
    setHistErr(false);
    try { setRows(await cageLayoutHistory(40)); } catch { setHistErr(true); }
  };

  const verify = async () => {
    playTap();
    await cageStudio.reload();
    if (cageStudio.matchesCloud()) {
      playSuccess();
      toast.success(
        t("cages.verifyOk", "مطابق — الي على الشاشة هو نفسه المحفوظ بالسحابة"),
        t("cages.verifyOkHint", "أيّ حاسبة تفتح غرفة الأقفاص راح تشوف نفس هذا الترتيب."),
      );
    } else {
      playWarning();
      toast.error(
        t("cages.verifyDiff", "مو مطابق — حمّلنا نسخة السحابة"),
        t("cages.verifyDiffHint", "الي كان على الشاشة ما كان محفوظاً. شوف «سجلّ الترتيب» إذا تريد ترجعه."),
      );
    }
  };

  if (!s.ready && s.sync === "loading") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-surface-1 px-3.5 py-2.5 text-xs font-bold text-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> {t("cages.syncLoading", "نجيب ترتيب الأقفاص من السحابة…")}
      </div>
    );
  }

  const tone =
    s.sync === "conflict" || s.sync === "error" ? "warn"
    : s.sync === "saved" ? "ok" : "mute";

  return (
    <>
      <div
        data-layoutsync={s.sync}
        className={cn(
          "mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold",
          tone === "ok" && "border-line bg-surface-1 text-ink-muted",
          tone === "mute" && "border-line bg-surface-2 text-ink-muted",
          tone === "warn" && "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
        )}
      >
        {s.sync === "saved" && <><Cloud size={15} className="shrink-0 text-success-600" />
          <span>{t("cages.syncSaved", "محفوظ بالسحابة · النسخة {{n}} · {{when}}", { n: formatNum(s.rev), when: rel(s.savedAt, t) })}</span></>}
        {s.sync === "dirty" && <><Cloud size={15} className="shrink-0" />
          <span>{t("cages.syncDirty", "في تعديل ما انحفظ بعد…")}</span></>}
        {s.sync === "saving" && <><Loader2 size={15} className="shrink-0 animate-spin" />
          <span>{t("cages.syncSaving", "نحفظ…")}</span></>}
        {s.sync === "offline" && <><CloudOff size={15} className="shrink-0" />
          <span>{t("cages.syncOffline", "نسخة تجريبية — الترتيب محفوظ على هذا الجهاز فقط")}</span></>}
        {s.sync === "error" && <><AlertTriangle size={15} className="shrink-0" />
          <span>{t("cages.syncError", "ما وصلنا الخادم — الترتيب محفوظ على الجهاز وراح نعيد المحاولة")}</span></>}
        {s.sync === "conflict" && <><ShieldQuestion size={15} className="shrink-0" />
          <span>{t("cages.syncConflict", "انحفظ ترتيب من حاسبة ثانية — أيّهما تريد؟")}</span></>}

        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          <button type="button" data-layoutverify onClick={() => void verify()}
            title={t("cages.verifyHint", "يعيد قراءة الترتيب من السحابة ويقارنه بالي على الشاشة")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-2xs font-bold text-ink-muted transition hover:text-ink">
            <Check size={13} /> {t("cages.verify", "تحقّق")}
          </button>
          {canEdit && (
            <button type="button" data-layouthistory onClick={() => void openHistory()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-2xs font-bold text-ink-muted transition hover:text-ink">
              <History size={13} /> {t("cages.history", "سجلّ الترتيب")}
            </button>
          )}
        </div>

        {s.sync === "conflict" && s.conflict && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-warn-200 pt-2 dark:border-warn-500/30">
            <span className="text-2xs font-semibold">
              {t("cages.conflictWhat", "نسخة السحابة: {{r}} غرفة · {{c}} قفص. الي على شاشتك: {{mr}} غرفة · {{mc}} قفص.", {
                r: formatNum(s.conflict.layout.rooms.length), c: formatNum(s.conflict.layout.cages.length),
                mr: formatNum(s.rooms.length), mc: formatNum(s.cages.length),
              })}
            </span>
            <Button size="sm" variant="secondary" onClick={() => { playTap(); cageStudio.resolveConflict("cloud"); }}>
              {t("cages.takeCloud", "خذ نسخة السحابة")}
            </Button>
            <Button size="sm" onClick={() => { playTap(); cageStudio.resolveConflict("mine"); }}>
              {t("cages.takeMine", "احفظ نسختي فوقها")}
            </Button>
          </div>
        )}
      </div>

      {legacy && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-xs font-bold text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
          <Laptop size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {t("cages.legacyFound", "لكينا ترتيباً محفوظاً على هذه الحاسبة ({{r}} غرفة · {{c}} قفص) ما كان يوصل باقي الأجهزة.", {
              r: formatNum(legacy.rooms), c: formatNum(legacy.cages),
            })}
            {legacy.names && <span className="font-normal opacity-80"> — {legacy.names}</span>}
          </span>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); setLegacyOpen(true); }}>
            {t("cages.legacyReview", "عاينه")}
          </Button>
        </div>
      )}

      <Modal open={legacyOpen} onClose={() => setLegacyOpen(false)} title={t("cages.legacyTitle", "ترتيب محفوظ على هذه الحاسبة")}>
        <p className="mb-3 text-sm text-ink-muted">
          {t("cages.legacyBody", "هذا ترتيب رسمته من هذه الحاسبة قبل ما نصلّح المزامنة، وكان محفوظاً عليها وحدها. إذا هو الترتيب الصحيح، ارفعه ليصير ترتيب العيادة بكل الأجهزة.")}
        </p>
        {legacy && (
          <ul className="mb-4 max-h-60 space-y-1 overflow-auto rounded-xl border border-line bg-surface-2 p-3 text-xs">
            {flatRooms(parseLayout(legacy.raw)).map((r) => (
              <li key={r.id} className="flex items-baseline gap-2">
                <span className="font-extrabold text-ink">{r.name}</span>
                <span className="text-ink-subtle tabular-nums">{formatNum(r.cages.length)}</span>
                <span className="min-w-0 flex-1 truncate font-normal text-ink-subtle">{r.cages.join(t("common.listSep", "، "))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLegacyOpen(false)}>{t("common.cancel", "إلغاء")}</Button>
          <Button onClick={() => {
            if (!legacy) return;
            playSuccess();
            cageStudio.loadDraft(legacy.raw);
            setLegacyOpen(false);
            toast.success(t("cages.legacyLoaded", "انحمّل — راجعه وراح ينحفظ للعيادة كلها"));
          }}>{t("cages.legacyUse", "اعتمده للعيادة")}</Button>
        </div>
      </Modal>

      <Modal open={histOpen} onClose={() => setHistOpen(false)} title={t("cages.historyTitle", "سجلّ ترتيب الأقفاص")}>
        <p className="mb-3 text-sm text-ink-muted">
          {t("cages.historyBody", "كل نسخة كانت محفوظة قبل أي تغيير. اختر وحدة لتعاينها على الشاشة — ما تنحفظ إلا بعد ما تشوفها.")}
        </p>
        {histErr && (
          <div className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm font-bold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
            {t("cages.historyFailed", "ما قدرنا نجيب السجلّ — أعد المحاولة.")}
          </div>
        )}
        {!histErr && rows === null && (
          <div className="flex items-center gap-2 py-6 text-sm text-ink-subtle"><Loader2 size={16} className="animate-spin" /> {t("common.loading", "جاري التحميل…")}</div>
        )}
        {!histErr && rows?.length === 0 && (
          <p className="py-6 text-sm text-ink-subtle">{t("cages.historyEmpty", "ماكو نسخ سابقة مسجّلة بعد.")}</p>
        )}
        {!histErr && !!rows?.length && (
          <ul className="max-h-[60vh] space-y-2 overflow-auto">
            {rows.map((r, i) => {
              const sum = summarize(r.layout);
              return (
                <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-ink">
                      {formatDate(r.at, dateLocale(i18n.language))}
                    </div>
                    <div className="truncate text-2xs text-ink-subtle">
                      {t("cages.histSum", "{{r}} غرفة · {{c}} قفص", { r: formatNum(sum.rooms), c: formatNum(sum.cages) })}
                      {sum.names && ` — ${sum.names}`}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />}
                    onClick={() => {
                      playTap();
                      cageStudio.loadDraft(r.layout);
                      setHistOpen(false);
                      toast.success(t("cages.histLoaded", "انحمّلت النسخة — راجعها وراح تنحفظ للعيادة كلها"));
                    }}>
                    {t("cages.histRestore", "ارجع لها")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
