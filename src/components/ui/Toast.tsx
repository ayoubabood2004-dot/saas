import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { spring } from "@/lib/motion";
import { onGlobalToast } from "@/lib/globalToast";

type ToastTone = "success" | "error" | "warn" | "info";
/** زرُّ فعلٍ اختياريّ: رسالةٌ تقول «حدّث القائمة» تُعطي الزرَّ بمكانها — بدل أن
 *  تأمر بـF5 فيمسح الكاشيرُ السلّةَ والمسودّة ليُصلح رقماً واحداً. */
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: string; tone: ToastTone; title: string; description?: string; action?: ToastAction };

type ToastCtx = {
  toast: (t: { tone?: ToastTone; title: string; description?: string; action?: { label: string; onClick: () => void } }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  /** نجاح جزئي أو تحذير — ليس فشلاً، فلا يصح تلوينه أحمر ولا أخضر. */
  warn: (title: string, description?: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

const config: Record<ToastTone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: "border-success-200 dark:border-success-500/30", iconColor: "text-success-600" },
  error: { icon: XCircle, ring: "border-danger-200 dark:border-danger-500/30", iconColor: "text-danger-600" },
  warn: { icon: AlertTriangle, ring: "border-warn-200 dark:border-warn-500/30", iconColor: "text-warn-600" },
  info: { icon: Info, ring: "border-brand-200 dark:border-brand-500/30", iconColor: "text-brand-600" },
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    ({ tone = "info", title, description, action }: { tone?: ToastTone; title: string; description?: string; action?: ToastAction }) => {
      const id = `t${seq++}`;
      setToasts((t) => [...t, { id, tone, title, description, action }]);
      // رسالةٌ بزرّ تبقى أطول: ٤٫٢ ثانية تكفي للقراءة لا للقراءة ثم الضغط.
      setTimeout(() => remove(id), action ? 9000 : 4200);
    },
    [remove],
  );

  // Let non-React code (global error handlers) raise toasts through this provider.
  useEffect(() => onGlobalToast((t) => toast(t)), [toast]);

  /* **قيمةٌ ثابتة.** كانت كائناً جديداً بكلّ رسمٍ للمزوّد، والمزوّدُ يُعاد رسمُه
   * مع كلّ توستٍ يظهر **ومع كلّ توستٍ يختفي بعد ٤٫٢ ثانية**. فكلُّ
   * `useCallback(..., [toast])` بالتطبيق كان يُبطَل مرّتين بكلّ رسالة، وكلُّ
   * `useEffect` معلَّقٍ عليه يعيد الجلبَ من الصفر: حفظُ جولةِ حقلٍ يرفع توستاً
   * فيعيد تحميلَ الشاشة كلِّها — ومعها نداءُ مجاميعَ لكلّ دفعةٍ نشطة — ثم
   * يعيده ثانيةً حين ينطفئ التوست. و`toast` نفسُها ثابتةٌ أصلاً، فالثباتُ
   * هنا سطرٌ واحدٌ يُنهي الحلقة. */
  const value: ToastCtx = useMemo(() => ({
    toast,
    success: (title, description) => toast({ tone: "success", title, description }),
    error: (title, description) => toast({ tone: "error", title, description }),
    warn: (title, description) => toast({ tone: "warn", title, description }),
  }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2.5 no-print">
          <AnimatePresence>
            {toasts.map((t) => {
              const c = config[t.tone];
              const Icon = c.icon;
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
                  exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.18 } }}
                  className={`flex items-start gap-3 rounded-2xl border bg-surface-1 p-4 shadow-raised ${c.ring}`}
                >
                  <Icon className={`mt-0.5 shrink-0 ${c.iconColor}`} size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink leading-snug">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}
                    {t.action && (
                      <button
                        type="button"
                        data-toastaction
                        onClick={() => { remove(t.id); t.action?.onClick(); }}
                        className="mt-2 inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 active:scale-95"
                      >
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button onClick={() => remove(t.id)} className="text-ink-subtle hover:text-ink transition" aria-label="Dismiss">
                    <X size={16} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
