import type { Variants, Transition } from "framer-motion";

/** Signature spring — friendly, responsive, a touch playful. */
export const spring: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.7 };
export const softSpring: Transition = { type: "spring", stiffness: 220, damping: 26 };
export const ease: Transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };

// Route content mounts with NO transition at all (see App.tsx) — the page is
// simply there on click, like a native desktop app. No pageVariants needed.

// Page content entrance is INSTANT — no fade, no stagger, no rise. On a fresh
// route mount the cards/lists are simply there at full opacity, the way a native
// clinic system feels ("click → everything's already on screen"). These stay as
// no-op variants so the many pages that reference them need no changes, and the
// polished micro-interactions (modals, popovers, hover) below are untouched.
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0, delayChildren: 0 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
};

export const fadeUp: Variants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
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
