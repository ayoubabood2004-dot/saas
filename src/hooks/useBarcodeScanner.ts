import { useEffect, useRef } from "react";

interface Options {
  /** Minimum characters for a valid barcode (default 3). */
  minLength?: number;
  /** Max ms between keystrokes to still count as "scanner-fast" (default 40). */
  interKeyMs?: number;
  /** Turn the listener off (e.g. while a modal is open). */
  disabled?: boolean;
}

/**
 * Global listener for a USB/Bluetooth barcode scanner that emulates a keyboard:
 * it types the barcode very fast and ends with Enter. Because human typing is far
 * slower than the `interKeyMs` threshold, the barcode is captured without any
 * input field needing focus. Fires `onScan(code)` once per scan.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts: Options = {}) {
  const { minLength = 3, interKeyMs = 40, disabled = false } = opts;
  const buffer = useRef("");
  const lastTime = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan; // always call the latest handler without re-subscribing

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      const gap = now - lastTime.current;
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault(); // don't let the trailing Enter submit a form
          cb.current(code);
        }
        return;
      }

      // Only single printable characters build a barcode.
      if (e.key.length === 1) {
        // A slow gap = a human typing → start a fresh buffer so we never
        // accidentally assemble a "barcode" from manual keystrokes.
        if (gap > interKeyMs) buffer.current = "";
        buffer.current += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, minLength, interKeyMs]);
}
