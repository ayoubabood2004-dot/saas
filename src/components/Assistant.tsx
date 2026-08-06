import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, X, Send, ArrowLeft, Loader2, Inbox, MessageCircleQuestion, Check, Clock, Ban, Hammer,
} from "lucide-react";
import type { AssistantReply, KbArticle } from "@/lib/assistant";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicName } from "@/lib/settings";
import type { FeatureRequest } from "@/types";
import { formatDate, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

/**
 * مساعد doctorVet — زر عائم بكل شاشات العيادة يفتح شات يعرف السستم كله.
 *
 * القرارات المعمارية:
 *  • المحرك محلي بالكامل (assistant.ts + assistantKb.ts) — يشتغل أوفلاين
 *    وبالديمو، بلا مفاتيح ولا تكاليف، وجوابه فوري.
 *  • «ما أعرف» صادقة دائماً، ومعها زر يرفع طلب تطوير حقيقي يوصل لمشغّل
 *    المنصة — فالسؤال الي عجز عنه المساعد يصير خارطة طريق.
 *  • المحادثة تعيش بـ sessionStorage: تنطفي بغلق التبويب، فما تتراكم.
 */

interface Msg {
  who: "user" | "bot";
  text: string;
  /** چبسات «تقصد؟» */
  options?: { id: string; title: string }[];
  route?: string;
  offerRequest?: boolean;
  /** السؤال الي ولّد عرض الطلب — يُرفق بالطلب حتى يفتهم الأدمن السياق. */
  question?: string;
}

const SS_KEY = "vp_assistant_chat";
const loadMsgs = (): Msg[] => {
  try { const v = JSON.parse(sessionStorage.getItem(SS_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
};

/** محرك المساعد + قاعدة معرفته (~100KB) يتحمّلان عند أول فتح، مو مع التطبيق. */
type Engine = typeof import("@/lib/assistant");

const STATUS_META: Record<FeatureRequest["status"], { label: string; cls: string; icon: typeof Check }> = {
  new: { label: "جديد", cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", icon: Clock },
  planned: { label: "بالخطة", cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", icon: Hammer },
  done: { label: "تم تنفيذه 🎉", cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", icon: Check },
  declined: { label: "معتذرين", cls: "bg-surface-2 text-ink-muted", icon: Ban },
};

export function Assistant() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "requests">("chat");
  const [msgs, setMsgs] = useState<Msg[]>(loadMsgs);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [reqDraft, setReqDraft] = useState<{ question?: string; text: string } | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [myRequests, setMyRequests] = useState<FeatureRequest[] | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !engine) void import("@/lib/assistant").then(setEngine).catch(() => {});
  }, [open, engine]);

  useEffect(() => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, thinking, reqDraft]);

  useEffect(() => {
    if (open && view === "requests" && myRequests === null) {
      repo.listFeatureRequests().then(setMyRequests).catch(() => setMyRequests([]));
    }
  }, [open, view, myRequests]);

  const suggestions = useMemo<KbArticle[]>(() => (engine ? engine.suggestedQuestions() : []), [engine]);

  const pushBot = (r: AssistantReply, question?: string) => {
    setMsgs((m) => [...m, {
      who: "bot",
      text: r.text,
      options: r.options?.map((o) => ({ id: o.id, title: o.title })),
      route: r.route,
      offerRequest: r.offerRequest,
      question,
    }]);
  };

  // السؤال ما ينبلع أبداً: إذا المحرك بعده يتحمّل، ننتظره هنا بدل ما نهمل الرسالة.
  const getEngine = async (): Promise<Engine> => {
    if (engine) return engine;
    const e = await import("@/lib/assistant");
    setEngine(e);
    return e;
  };

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    playTap();
    setInput("");
    setReqDraft(null);
    setMsgs((m) => [...m, { who: "user", text: q }]);
    setThinking(true);
    // مهلة قصيرة مقصودة: «يفكر» لجزء من ثانية فيقرأ الجواب كرد، مو كارتداد.
    void (async () => {
      const [eng] = await Promise.all([getEngine(), new Promise((r) => setTimeout(r, 350))]);
      pushBot(eng.ask(q), q);
      setThinking(false);
    })().catch(() => {
      setMsgs((m) => [...m, { who: "bot", text: "صار خلل بسيط — جرب مرة ثانية." }]);
      setThinking(false);
    });
  };

  const pickOption = (id: string) => {
    playTap();
    void getEngine().then((eng) => pushBot(eng.answerFor(id)));
  };

  const submitRequest = async () => {
    if (!reqDraft || !reqDraft.text.trim() || reqBusy) return;
    setReqBusy(true);
    try {
      await repo.addFeatureRequest({
        body: reqDraft.text.trim(),
        question: reqDraft.question ?? null,
        requested_by: user?.full_name ?? null,
        clinic_name: getClinicName() || null,
        source: "assistant",
      });
      playSuccess();
      setReqDraft(null);
      setMyRequests(null); // يعاد تحميلها عند فتح «طلباتي»
      setMsgs((m) => [...m, {
        who: "bot",
        text: "تم ✅ وصل طلبك لفريق التطوير مباشرة.\nتگدر تتابع حالته من أيقونة «طلباتي» فوق — وأول ما يتنفذ رح تشوفه هناك 🚀",
      }]);
    } catch {
      setMsgs((m) => [...m, { who: "bot", text: "ما گدرت أرسل الطلب هسة — جرب بعد شوية." }]);
    } finally { setReqBusy(false); }
  };

  if (!user) return null;

  return (
    <>
      {/* الزر العائم */}
      {!open && (
        <button
          type="button"
          onClick={() => { playTap(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 150); }}
          aria-label="مساعد doctorVet"
          className="fixed bottom-20 left-4 z-40 grid h-14 w-14 place-items-center rounded-2xl bg-brand-grad text-white shadow-raised transition hover:scale-105 active:scale-95 lg:bottom-6"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* اللوحة */}
      {open && (
        <div className="fixed bottom-0 left-0 z-50 flex h-[min(640px,92dvh)] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface-1 shadow-raised sm:bottom-4 sm:left-4 sm:w-[400px] sm:rounded-3xl">
          {/* الرأس */}
          <div className="flex items-center gap-2.5 border-b border-line bg-brand-grad px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20"><Sparkles size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black">مساعد doctorVet</div>
              <div className="text-2xs font-semibold text-white/85">يعرف كل شيء بالسستم — اسأل براحتك، بأي لهجة</div>
            </div>
            <button type="button" onClick={() => { playTap(); setView(view === "chat" ? "requests" : "chat"); }}
              title={view === "chat" ? "طلباتي" : "رجوع للمحادثة"}
              className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/20">
              {view === "chat" ? <Inbox size={16} /> : <ArrowLeft size={16} className="rtl:rotate-180" />}
            </button>
            <button type="button" onClick={() => { playTap(); setOpen(false); }} aria-label="إغلاق"
              className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/20"><X size={16} /></button>
          </div>

          {view === "requests" ? (
            /* ---------------- طلباتي ---------------- */
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              <div className="text-2xs font-extrabold uppercase tracking-wide text-ink-subtle">طلبات التطوير المرفوعة من عيادتك</div>
              {myRequests === null ? (
                <div className="py-8 text-center"><Loader2 size={18} className="mx-auto animate-spin text-ink-subtle" /></div>
              ) : myRequests.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-3 text-xs text-ink-subtle">
                  بعد ما رفعتوا أي طلب. أي شيء تحس ناقص بالسستم — اسألني عنه بالمحادثة وأرفعه إلك.
                </p>
              ) : myRequests.map((r) => {
                const S = STATUS_META[r.status];
                return (
                  <div key={r.id} className="rounded-xl border border-line bg-surface-2/50 p-2.5">
                    <div className="flex items-start gap-2">
                      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold", S.cls)}><S.icon size={10} /> {S.label}</span>
                      <span className="min-w-0 flex-1 text-xs font-bold leading-relaxed text-ink">{r.body}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-subtle">
                      <span>{formatDate(r.created_at, "ar")}</span>
                      {r.requested_by && <span>· {r.requested_by}</span>}
                    </div>
                    {r.admin_note && (
                      <div className="mt-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-2xs font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
                        رد الفريق: {r.admin_note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ---------------- المحادثة ---------------- */
            <>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                {msgs.length === 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-start gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><Sparkles size={13} /></span>
                      <div className="rounded-2xl rounded-ts-md bg-surface-2 px-3 py-2 text-xs font-semibold leading-relaxed text-ink">
                        هلو دكتور 👋 آني مساعدك بالسستم.
                        {"\n"}اسألني أي شيء — وإذا سألت عن شيء مو موجود، أرفعلك طلب بيه لفريق التطوير.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ps-9">
                      {suggestions.map((s) => (
                        <button key={s.id} type="button" onClick={() => send(s.title)}
                          className="rounded-full border border-line bg-surface-1 px-2.5 py-1 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                          {s.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {msgs.map((m, i) => (
                  <div key={i} className={cn("flex items-start gap-2", m.who === "user" && "flex-row-reverse")}>
                    {m.who === "bot" && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><Sparkles size={13} /></span>}
                    <div className={cn(
                      "max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs font-semibold leading-relaxed",
                      m.who === "user" ? "rounded-te-md bg-brand-600 text-white" : "rounded-ts-md bg-surface-2 text-ink",
                    )}>
                      {m.text}
                      {m.options && m.options.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {m.options.map((o) => (
                            <button key={o.id} type="button" onClick={() => pickOption(o.id)}
                              className="rounded-full border border-brand-300 bg-surface-1 px-2.5 py-1 text-2xs font-bold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
                              {o.title}
                            </button>
                          ))}
                        </span>
                      )}
                      {m.route && (
                        <span className="mt-2 block">
                          <button type="button" onClick={() => { playTap(); setOpen(false); navigate(m.route!); }}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-2xs font-extrabold text-white shadow-soft transition hover:bg-brand-700">
                            <ArrowLeft size={12} className="rtl:rotate-180" /> افتحلي الصفحة
                          </button>
                        </span>
                      )}
                      {m.offerRequest && (
                        <span className="mt-2 block">
                          <button type="button"
                            onClick={() => { playTap(); setReqDraft({ question: m.question, text: m.question ?? "" }); }}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-400 bg-brand-50 px-3 py-1.5 text-2xs font-extrabold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
                            <MessageCircleQuestion size={12} /> ارفعلي طلب تطوير بهالشي
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {thinking && (
                  <div className="flex items-start gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><Sparkles size={13} /></span>
                    <div className="rounded-2xl rounded-ts-md bg-surface-2 px-3 py-2.5"><Loader2 size={14} className="animate-spin text-ink-subtle" /></div>
                  </div>
                )}

                {/* صياغة الطلب */}
                {reqDraft && (
                  <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-500/30 dark:bg-brand-500/5">
                    <div className="mb-1.5 text-2xs font-extrabold text-brand-700 dark:text-brand-300">📨 طلبك لفريق التطوير — اشرحه بكيفك:</div>
                    <textarea
                      autoFocus rows={3} value={reqDraft.text}
                      onChange={(e) => setReqDraft({ ...reqDraft, text: e.target.value })}
                      placeholder="مثال: أريد تقرير شهري يطلع كل حالات القطط…"
                      className="input min-h-[64px] w-full resize-y text-xs"
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => setReqDraft(null)} className="rounded-full px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:text-ink">إلغاء</button>
                      <button type="button" onClick={() => void submitRequest()} disabled={!reqDraft.text.trim() || reqBusy}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-4 py-1.5 text-2xs font-extrabold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50">
                        {reqBusy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} إرسال الطلب
                      </button>
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* الإدخال */}
              <div className="flex items-center gap-1.5 border-t border-line p-2.5">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder="اسأل أي شيء عن السستم…"
                  className="input h-10 flex-1 text-sm"
                />
                <button type="button" onClick={() => send()} disabled={!input.trim() || thinking} aria-label="إرسال"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-40">
                  <Send size={16} className="rtl:rotate-180" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
