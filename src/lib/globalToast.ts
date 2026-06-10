// A tiny bridge so code OUTSIDE the React tree (e.g. the global unhandled-rejection
// handler in main.tsx) can raise a toast through the same ToastProvider the UI uses.
//
// Implemented with a window CustomEvent rather than a shared module variable so it
// works regardless of how the bundler dedupes module instances — `window` is the
// one true singleton both sides agree on.

type ToastTone = "success" | "error" | "warn" | "info";
export type GlobalToastInput = { tone?: ToastTone; title: string; description?: string };

const EVENT = "vp:globaltoast";

/** Raise a toast from anywhere (safe no-op if no ToastProvider is listening). */
export function emitGlobalToast(t: GlobalToastInput): void {
  try {
    window.dispatchEvent(new CustomEvent<GlobalToastInput>(EVENT, { detail: t }));
  } catch {
    /* never let toasting throw */
  }
}

/** ToastProvider subscribes to bridge events; returns an unsubscribe fn. */
export function onGlobalToast(fn: (t: GlobalToastInput) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<GlobalToastInput>).detail;
    if (detail) fn(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
