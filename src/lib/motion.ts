import type { Variants, Transition } from "framer-motion";

/** Signature spring — friendly, responsive, a touch playful. */
export const spring: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.7 };
export const softSpring: Transition = { type: "spring", stiffness: 220, damping: 26 };
export const ease: Transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };

/** Page-level enter for route transitions — enter-only and fast so navigation
 *  feels instant. Dropped the exit stage (it blocked the next page from mounting
 *  for ~220ms) and the blur filter (full-page repaint + GPU jank) — the two
 *  biggest sources of perceived navigation latency. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } },
};

/** Stagger container for lists / grids. */
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: spring },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

/** Overlay + panel pair for dialogs / sheets. */
export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
};
