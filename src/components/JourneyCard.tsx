/* ============================================================================
 * شريط رحلة الحيوان — تحكّم الطبيب.
 *
 * فلسفة EASE بالمستشفيات: زر واحد كبير للمرحلة التالية (الطبيب بيده قفازات)،
 * رسائل طمأنة جاهزة بضغطة، وكل شي باتجاه واحد — المالك يرد بإيموجي فقط.
 *
 * قواعد مبنية هنا لا بالتعليمات:
 *   · ولا حدث يوصل المالك بلا ضغطة صريحة من الكادر.
 *   · الأخبار الصعبة ما تنرسل: «إنهاء بهدوء» يقتل الرابط بلا أي حدث، ويذكّر
 *     الطبيب أن الهاتف هو القناة.
 * ==========================================================================*/
import { useEffect, useRef, useState } from "react";
import { PawPrint, Link2, Check, Camera, Send, Eye, PhoneCall, X, ChevronLeft } from "lucide-react";
import type { Journey, JourneyEvent, JourneyKind, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { JOURNEY_KINDS, journeyKindById, journeyStageIndex, nextJourneyStage, REASSURE_MESSAGES } from "@/lib/journey";
import { prepareUpload } from "@/lib/image";
import { appUrl } from "@/lib/appUrl";
import { cn } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";

/** «قبل ٥ د» — بلا مكتبات. */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  return h < 24 ? `قبل ${h} س` : `قبل ${Math.round(h / 24)} يوم`;
}

export function JourneyCard({ pet, doctor }: { pet: Pet; doctor?: string | null }) {
  const toast = useToast();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const j = await repo.getActiveJourney(pet.id);
      setJourney(j);
      setEvents(j ? await repo.listJourneyEvents(j.id) : []);
    } catch { /* عابر */ }
  };
  useEffect(() => {
    void load();
    // ردود المالك (الإيموجي) وحالة «شوهد» تتحدّث وأنت واقف على الصفحة.
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.id]);

  const start = async (kind: JourneyKind) => {
    if (busy) return;
    setBusy(true);
    try {
      await repo.createJourney(pet.id, kind, doctor ?? null);
      playSuccess();
      await load();
    } catch { playWarning(); toast.error("تعذّر بدء الرحلة"); }
    finally { setBusy(false); }
  };

  const advance = async () => {
    if (!journey || busy) return;
    const nxt = nextJourneyStage(journey.kind, journey.stage);
    if (!nxt) return;
    setBusy(true);
    try {
      await repo.advanceJourney(journey.id, nxt.id, doctor ?? null);
      playSuccess();
      await load();
    } catch { playWarning(); toast.error("تعذّر تحديث المرحلة"); }
    finally { setBusy(false); }
  };

  const reassure = async (body: string) => {
    if (!journey || busy) return;
    setBusy(true);
    try {
      await repo.addJourneyNote(journey.id, { body }, doctor ?? null);
      playSuccess();
      toast.success("وصلت الطمأنة لصفحة المتابعة");
      await load();
    } catch { playWarning(); toast.error("تعذّر الإرسال"); }
    finally { setBusy(false); }
  };

  const sendPhoto = async (f: File) => {
    if (!journey) return;
    setBusy(true);
    try {
      // صغيرة عمداً: صفحة المالك تفتح على موبايل ببيانات محدودة.
      const p = await prepareUpload(f, { maxDim: 800, quality: 0.6 });
      await repo.addJourneyNote(journey.id, { photo: p.dataUrl }, doctor ?? null);
      playSuccess();
      toast.success("وصلت الصورة — أجمل طمأنة 📸");
      await load();
    } catch { playWarning(); toast.error("تعذّر رفع الصورة"); }
    finally { setBusy(false); }
  };

  const copyLink = () => {
    if (!journey) return;
    const url = `${window.location.origin}${appUrl(`/t/${journey.token}`)}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true); playTap();
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => toast.error("انسخ يدوياً: " + url));
  };

  const finish = async (silent: boolean) => {
    if (!journey || busy) return;
    setBusy(true);
    try {
      await repo.closeJourney(journey.id, { silent });
      playTap();
      setConfirmEnd(false);
      await load();
    } catch { playWarning(); toast.error("تعذّر الإنهاء"); }
    finally { setBusy(false); }
  };

  /* ── لا رحلة نشطة: صف بدء مختصر ── */
  if (!journey) {
    return (
      <section className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-700 dark:text-brand-300"><PawPrint size={16} /></span>
          <p className="text-sm font-extrabold text-ink">ابدأ رحلة متابعة للمالك</p>
          <p className="hidden text-2xs text-ink-subtle sm:block">المالك يتابع حالة حبيبه برابط — بلا اتصالات «شنو صار؟»</p>
          <div className="ms-auto flex flex-wrap gap-1.5">
            {JOURNEY_KINDS.map((k) => (
              <button key={k.id} type="button" disabled={busy} onClick={() => void start(k.id)}
                className="rounded-full bg-surface-2 px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/15 dark:hover:text-brand-300">
                {k.emoji} {k.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const def = journeyKindById(journey.kind);
  const stages = def?.stages ?? [];
  const idx = journeyStageIndex(journey.kind, journey.stage);
  const nxt = nextJourneyStage(journey.kind, journey.stage);
  const atEnd = !nxt;
  const lastReaction = [...events].reverse().find((e) => e.reaction)?.reaction;

  return (
    <section className="card overflow-hidden p-0">
      {/* الترويسة: النوع + الرابط + الإنهاء */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/50 px-4 py-2.5">
        <span className="text-base">{def?.emoji}</span>
        <p className="text-sm font-extrabold text-ink">رحلة {def?.label}</p>
        <span className="text-2xs text-ink-subtle" dir="ltr">{ago(journey.started_at)}</span>

        {/* «شاف/ما شاف» — يمنع اتصالات القلق قبل ما تصير */}
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold",
          journey.last_seen_at ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-1 text-ink-subtle")}>
          <Eye size={11} /> {journey.last_seen_at ? `المالك شاف ${ago(journey.last_seen_at)}` : "المالك بعد ما فتح الرابط"}
        </span>
        {lastReaction && <span className="text-sm" title="آخر رد من المالك">{lastReaction}</span>}

        <div className="ms-auto flex items-center gap-1.5">
          <button type="button" onClick={copyLink}
            className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1.5 text-2xs font-extrabold text-white transition hover:bg-brand-700">
            {copied ? <Check size={13} /> : <Link2 size={13} />} {copied ? "انتسخ — دزه واتساب" : "رابط المتابعة"}
          </button>
          {confirmEnd ? (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => void finish(false)}
                className="rounded-full bg-success-600 px-2.5 py-1.5 text-2xs font-extrabold text-white transition hover:bg-success-700">تم التسليم ✓</button>
              <button type="button" onClick={() => void finish(true)}
                title="الرابط يموت فوراً بلا أي رسالة — للحالات الصعبة: الهاتف هو القناة"
                className="rounded-full bg-surface-1 px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:text-ink">إنهاء بهدوء</button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle hover:text-ink"><X size={13} /></button>
            </span>
          ) : (
            <button type="button" onClick={() => { playTap(); setConfirmEnd(true); }}
              className="rounded-full bg-surface-1 px-2.5 py-1.5 text-2xs font-bold text-ink-subtle transition hover:text-ink">إنهاء</button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* سكة المراحل */}
        <div className="flex items-start" dir="rtl">
          {stages.map((s, i) => {
            const done = i < idx, now = i === idx;
            return (
              <div key={s.id} className="relative flex flex-1 flex-col items-center gap-1">
                {i > 0 && <span className={cn("absolute top-[13px] end-1/2 w-full h-0.5", i <= idx ? "bg-brand-500" : "bg-line")} />}
                <span className={cn("relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-xs transition",
                  done ? "border-brand-500 bg-brand-500 text-white"
                    : now ? "border-brand-500 bg-surface-1 text-brand-600 shadow-[0_0_0_4px_rgba(18,102,216,.12)]"
                      : "border-line bg-surface-1 text-ink-subtle")}>
                  {done ? <Check size={13} /> : s.emoji}
                </span>
                <span className={cn("px-0.5 text-center text-[10px] font-bold leading-tight",
                  now ? "text-brand-700 dark:text-brand-300" : done ? "text-ink" : "text-ink-subtle")}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* الزر الكبير: المرحلة التالية */}
        {!atEnd && (
          <button type="button" disabled={busy} onClick={() => void advance()}
            className={cn("flex w-full items-center justify-center gap-2 rounded-2xl p-3.5 text-base font-extrabold text-white shadow-soft transition active:scale-[.99] disabled:opacity-60",
              nxt?.milestone ? "bg-success-600 hover:bg-success-700" : "bg-brand-600 hover:bg-brand-700")}>
            <ChevronLeft size={18} /> {nxt?.emoji} {nxt?.label}
          </button>
        )}
        {atEnd && (
          <p className="rounded-xl bg-success-50 px-3 py-2 text-center text-xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
            🎉 وصلنا آخر مرحلة — اضغط «إنهاء» بعد التسليم.
          </p>
        )}

        {/* طمأنة بضغطة — باتجاه واحد، رسائل إيجابية فقط بالتصميم */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-extrabold text-ink-subtle"><Send size={11} className="inline" /> طمّن المالك:</span>
          {REASSURE_MESSAGES.map((m) => (
            <button key={m.id} type="button" disabled={busy} onClick={() => void reassure(m.body)}
              className="rounded-full bg-surface-2 px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:bg-success-50 hover:text-success-700 dark:hover:bg-success-500/15 dark:hover:text-success-300">
              {m.label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => photoInput.current?.click()}
            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1.5 text-2xs font-extrabold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300">
            <Camera size={12} /> صورة
          </button>
          <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendPhoto(f); }} />
        </div>

        {/* تذكير الأخبار الصعبة — دائم، صغير، وواضح */}
        <p className="flex items-center gap-1.5 text-2xs text-ink-subtle">
          <PhoneCall size={11} className="shrink-0" />
          الأخبار الصعبة ما تنرسل برسالة أبداً — «إنهاء بهدوء» يقتل الرابط، والهاتف هو القناة.
        </p>
      </div>
    </section>
  );
}
