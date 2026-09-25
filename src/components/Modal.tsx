import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { overlayVariants, dialogVariants } from "@/lib/motion";
import { pushModal, removeModal, isTopModal } from "@/lib/modalStack";

/** Dialog width: default (max-w-lg), wide (max-w-3xl), or full (near-fullscreen workspace). */
type ModalSize = "default" | "wide" | "full";
const SIZE_CLASS: Record<ModalSize, string> = {
  default: "sm:max-w-lg sm:rounded-3xl",
  wide: "sm:max-w-3xl sm:rounded-3xl",
  full: "sm:max-w-[96vw] sm:rounded-3xl xl:max-w-[1400px]",
};

export function Modal({ open, onClose, title, children, size = "default", confirmClose, dismissible = true }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; size?: ModalSize;
  /** ترجع false فتُلغى محاولةُ الإغلاق (النافذةُ تسأل بنفسها). Esc والستارةُ وزرُّ X. */
  confirmClose?: () => boolean;
  /** false: الستارةُ وEsc لا تُغلقان — الإغلاقُ بزرٍّ صريح وحده (كشفٌ يختفي بضغطةٍ
   *  خطأ يرجّعنا للصمت). زرُّ X يبقى: هو زرٌّ صريح. */
  dismissible?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  /* كلُّ مخارج الإغلاق تمرّ من هنا: لا يُغلَق إلا الأعلى، ولا يُغلَق بلا إذن. */
  const tryClose = () => { if (!isTopModal(id)) return; if (confirmClose && !confirmClose()) return; onClose(); };

  /* أثران لا واحد: الأوّلُ يملك مكانَ النافذة بالمكدّس ويعتمد على `open` وحدَه،
   * فلا يتبدّل الترتيبُ مع كلّ رسم. والثاني يعيد ربطَ المستمع كلّما تبدّل
   * `tryClose` — وهو رخيصٌ وصحيح، ويُغني عن مرجعٍ يُكتب أثناء الرسم. */
  useEffect(() => {
    if (!open) return;
    pushModal(id);
    document.body.style.overflow = "hidden";
    return () => { removeModal(id); document.body.style.overflow = ""; };
  }, [open, id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && dismissible) tryClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 no-print sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={dismissible ? tryClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-4xl border border-line bg-surface-1 shadow-raised ${SIZE_CLASS[size]}`}
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface-1/90 p-5 backdrop-blur">
              <h2 className="font-display text-lg font-bold tracking-tighter2 text-ink">{title}</h2>
              <button
                className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
                onClick={tryClose}
                aria-label={t("common.close")}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
