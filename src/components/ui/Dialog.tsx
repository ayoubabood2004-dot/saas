import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlayVariants, dialogVariants } from "@/lib/motion";
import { pushModal, removeModal, isTopModal } from "@/lib/modalStack";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** max width */
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
}

// xl: شاشة اختيار فيها شبكة مربّعات — تحتاج عرضاً حقيقياً لا عمودين.
const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-5xl" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", hideClose }: DialogProps) {
  /* نفسُ مكدّس `Modal`: نافذةُ تأكيدٍ تُفتح فوق نافذةِ عملٍ لازم تبلع Esc
   * وحدَها، وإلا طوت الاثنتين — وهي بالضبط حالةُ «تطلع وتضيّع السطور؟». */
  const id = useId();
  const tryClose = () => { if (isTopModal(id)) onClose(); };

  useEffect(() => {
    if (!open) return;
    pushModal(id);
    document.body.style.overflow = "hidden";
    return () => { removeModal(id); document.body.style.overflow = ""; };
  }, [open, id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={tryClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative w-full bg-surface-1 border border-line shadow-raised",
              "rounded-t-4xl sm:rounded-3xl max-h-[92vh] overflow-y-auto",
              widths[size],
            )}
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {(title || !hideClose) && (
              <div className="flex items-start justify-between gap-4 p-6 pb-2">
                <div>
                  {title && <h2 className="font-display text-xl font-bold tracking-tighter2 text-ink">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
                </div>
                {!hideClose && (
                  <button
                    onClick={tryClose}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-surface-2 hover:text-ink transition"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="px-6 pb-6 pt-2">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
