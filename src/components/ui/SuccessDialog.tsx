import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { playSuccess } from "@/lib/sounds";
import { overlayVariants } from "@/lib/motion";
import { Button } from "./Button";

/**
 * Celebratory confirmation — the "Yay! Welcome back ✓" moment (ref img 2).
 * Animated check pop + radiating ring + tiny confetti. Plays the success chime.
 */
export function SuccessDialog({
  open,
  onClose,
  title,
  message,
  actionLabel,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  useEffect(() => {
    if (open) playSuccess();
  }, [open]);

  const confetti = Array.from({ length: 10 });

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center p-0 no-print sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 26 } }}
            exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.15 } }}
            className="relative w-full max-w-sm overflow-hidden rounded-t-4xl border border-line bg-surface-1 p-7 text-center shadow-raised sm:rounded-3xl"
          >
            {/* Check badge */}
            <div className="relative mx-auto mb-5 grid h-24 w-24 place-items-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-success-500/15"
                initial={{ scale: 0.4, opacity: 0.8 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <motion.span
                className="grid h-20 w-20 place-items-center rounded-full bg-success-500 text-white shadow-soft"
                initial={{ scale: 0 }}
                animate={{ scale: 1, transition: { type: "spring", stiffness: 360, damping: 18, delay: 0.05 } }}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
                  <motion.path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1, transition: { duration: 0.35, delay: 0.25, ease: "easeOut" } }}
                  />
                </svg>
              </motion.span>
              {/* confetti */}
              {confetti.map((_, i) => {
                const angle = (i / confetti.length) * Math.PI * 2;
                const colors = ["#1266d8", "#38bdf8", "#fb5413", "#16a34a", "#f59e0b"];
                return (
                  <motion.span
                    key={i}
                    className="absolute h-1.5 w-1.5 rounded-full"
                    style={{ background: colors[i % colors.length] }}
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{
                      x: Math.cos(angle) * 60,
                      y: Math.sin(angle) * 60,
                      opacity: [0, 1, 0],
                      transition: { duration: 0.7, delay: 0.2 + i * 0.01, ease: "easeOut" },
                    }}
                  />
                );
              })}
            </div>

            <h2 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{title}</h2>
            {message && <p className="mx-auto mt-2 max-w-xs text-sm text-ink-muted">{message}</p>}
            <Button
              className="mt-6 w-full"
              onClick={() => {
                onAction ? onAction() : onClose();
              }}
            >
              {actionLabel ?? "Great"}
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
