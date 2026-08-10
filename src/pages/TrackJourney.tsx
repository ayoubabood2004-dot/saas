/* ============================================================================
 * صفحة متابعة المالك — /t/:token
 *
 * متتبّع دومينوز لعالم العيادات: رابط عام بلا تسجيل دخول، خط زمني بمراحل
 * واضحة، ورسائل الطمأنة من الكادر. المالك يفتحها متى ما قلق — فيطمّن نفسه
 * بلا رسالة مدفوعة ولا اتصال.
 *
 * ما تعرضه محسوب بعناية: اسم الحيوان والعيادة والمراحل والطمأنات فقط —
 * ولا تشخيص ولا نتائج ولا أسعار (القصّ بالسيرفر داخل track_journey، لا هنا).
 * الرد الوحيد الممكن: إيموجي — تصميم EASE، حتى لا ينسحب الطبيب لدردشة.
 * ==========================================================================*/
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PawPrint, PhoneCall, Check, HeartPulse } from "lucide-react";
import type { JourneyPublicView } from "@/types";
import { repo } from "@/lib/repo";
import { journeyKindById, journeyStageIndex, OWNER_REACTIONS } from "@/lib/journey";
import { cn } from "@/lib/utils";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" });

export function TrackJourney() {
  const { token = "" } = useParams();
  const [view, setView] = useState<JourneyPublicView | null>(null);
  const [state, setState] = useState<"loading" | "gone" | "ok">("loading");
  const [reacting, setReacting] = useState<string | null>(null);
  const timelineEnd = useRef<HTMLDivElement>(null);

  const load = async (first = false) => {
    try {
      const v = await repo.trackJourneyPublic(token);
      if (!v) { setState("gone"); return; }
      setView(v);
      setState("ok");
      if (first) setTimeout(() => timelineEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 300);
    } catch { if (first) setState("gone"); /* فشل تحديث لاحق: نحتفظ بآخر عرض */ }
  };

  useEffect(() => {
    void load(true);
    // استطلاع مؤدب كل ١٥ ثانية — نفس إيقاع لوحات السستم الحية.
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (view) document.title = `متابعة ${view.pet_name} — ${view.clinic_name}`;
  }, [view]);

  const react = async (eventId: string, emoji: string) => {
    if (reacting) return;
    setReacting(eventId);
    try {
      const okd = await repo.reactJourneyPublic(token, eventId, emoji);
      if (okd && view) {
        setView({ ...view, events: view.events.map((e) => (e.id === eventId ? { ...e, reaction: emoji } : e)) });
      }
    } finally { setReacting(null); }
  };

  /* ── رابط ميت/منتهي: رسالة لطيفة، ما نقول «خطأ» ── */
  if (state === "gone") {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="max-w-sm space-y-3 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-500/10 text-brand-600"><PawPrint size={30} /></span>
          <h1 className="text-lg font-extrabold text-ink">انتهت هذه المتابعة</h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            رحلة حبيبك بالعيادة اكتملت والرابط انتهى. إذا عندك أي سؤال، اتصل بالعيادة مباشرة — يسعدهم يطمنونك. 🐾
          </p>
        </div>
      </div>
    );
  }

  if (state === "loading" || !view) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-ink-subtle">
          <HeartPulse size={28} className="animate-pulse text-brand-500" />
          <p className="text-sm font-bold">نجيب آخر أخبار حبيبك…</p>
        </div>
      </div>
    );
  }

  const def = journeyKindById(view.kind);
  const stages = def?.stages ?? [];
  const idx = journeyStageIndex(view.kind, view.stage);
  const closedOk = view.status === "closed";

  return (
    <div dir="rtl" className="min-h-screen bg-surface pb-24">
      {/* الترويسة */}
      <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pb-12 pt-8 text-center text-white">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/15 text-2xl backdrop-blur">{def?.emoji ?? "🐾"}</span>
        <h1 className="mt-3 text-xl font-black">{view.pet_name}</h1>
        <p className="mt-0.5 text-sm text-white/80">{view.clinic_name} · {def?.label}</p>
      </header>

      <main className="mx-auto -mt-6 max-w-md space-y-4 px-4">
        {/* بطاقة الحالة الحية */}
        <section className="card p-4">
          {closedOk ? (
            <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-success-700 dark:text-success-300">
              <Check size={17} /> اكتملت الرحلة — {view.pet_name} بالبيت مع أهله 🎉
            </p>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm font-extrabold text-brand-700 dark:text-brand-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-brand-500" />
              </span>
              {stages[idx]?.emoji} {stages[idx]?.label}
            </div>
          )}

          {/* سكة التقدّم المصغّرة */}
          <div className="mt-4 flex items-center" dir="rtl">
            {stages.map((s, i) => (
              <div key={s.id} className="flex flex-1 items-center">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[10px] transition",
                  i < idx || closedOk ? "border-brand-500 bg-brand-500 text-white"
                    : i === idx ? "border-brand-500 bg-surface-1 text-brand-600"
                      : "border-line bg-surface-1 text-ink-subtle")}>
                  {i < idx || closedOk ? <Check size={11} /> : s.emoji}
                </span>
                {i < stages.length - 1 && <span className={cn("h-0.5 flex-1", i < idx || closedOk ? "bg-brand-500" : "bg-line")} />}
              </div>
            ))}
          </div>
        </section>

        {/* الخط الزمني */}
        <section className="card space-y-1 p-4">
          <h2 className="mb-2 text-xs font-extrabold text-ink-subtle">رحلة {view.pet_name} اليوم</h2>
          {view.events.map((e) => {
            if (e.kind === "stage") {
              const sd = stages.find((s) => s.id === e.stage);
              return (
                <div key={e.id} className="flex items-center gap-2.5 py-1.5">
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs",
                    sd?.milestone ? "bg-success-100 dark:bg-success-500/20" : "bg-surface-2")}>{sd?.emoji ?? "•"}</span>
                  <p className={cn("flex-1 text-sm", sd?.milestone ? "font-extrabold text-success-700 dark:text-success-300" : "font-bold text-ink")}>
                    {sd?.label ?? e.stage}
                  </p>
                  <time className="text-2xs tabular-nums text-ink-subtle" dir="ltr">{timeOf(e.created_at)}</time>
                </div>
              );
            }
            /* رسالة/صورة طمأنة — مع أزرار الرد بالإيموجي */
            return (
              <div key={e.id} className="my-2 rounded-2xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-500/20 dark:bg-brand-500/10">
                <div className="flex items-center gap-1.5 text-2xs font-bold text-brand-700/80 dark:text-brand-300/80">
                  💬 رسالة من العيادة <time className="ms-auto tabular-nums" dir="ltr">{timeOf(e.created_at)}</time>
                </div>
                {e.body && <p className="mt-1.5 text-sm font-bold leading-relaxed text-ink">{e.body}</p>}
                {e.photo && <img src={e.photo} alt={`صورة ${view.pet_name}`} className="mt-2 w-full rounded-xl border border-line object-cover" />}
                <div className="mt-2 flex items-center gap-1.5">
                  {OWNER_REACTIONS.map((emo) => (
                    <button key={emo} type="button" disabled={reacting === e.id}
                      onClick={() => void react(e.id, emo)}
                      className={cn("grid h-8 w-8 place-items-center rounded-full text-base transition active:scale-90",
                        e.reaction === emo ? "bg-brand-600 shadow-soft" : "bg-surface-1 hover:bg-surface-2")}>
                      {emo}
                    </button>
                  ))}
                  {e.reaction && <span className="text-2xs font-bold text-brand-700 dark:text-brand-300">وصل ردك للعيادة ✓</span>}
                </div>
              </div>
            );
          })}
          <div ref={timelineEnd} />
        </section>

        {/* اتصال — القناة الثنائية الوحيدة هي الهاتف، بالتصميم */}
        {view.clinic_phone && (
          <a href={`tel:${view.clinic_phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-surface-1 p-3.5 text-sm font-extrabold text-ink transition hover:border-brand-300 active:scale-[.99]">
            <PhoneCall size={16} className="text-brand-600" /> اتصل بالعيادة
          </a>
        )}

        <p className="pt-2 text-center text-2xs text-ink-subtle">
          الصفحة تتحدّث لحالها كل شوية — خلّيها مفتوحة 💙
          <br />متابعة مقدَّمة من doctorVet 🐾
        </p>
      </main>
    </div>
  );
}
