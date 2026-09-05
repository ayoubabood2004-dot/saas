import { useEffect, useRef } from "react";
import { createScanAssembler } from "@/lib/scanBuffer";

interface Options {
  /** Minimum characters for a valid barcode (default 3). */
  minLength?: number;
  /** Max ms between keystrokes to still count as "scanner-fast" (default 60). */
  interKeyMs?: number;
  /** Turn the listener off (e.g. while a modal is open). */
  disabled?: boolean;
}

/**
 * Global listener for a USB/Bluetooth barcode scanner that emulates a keyboard:
 * it types the barcode very fast and ends with Enter. Because human typing is far
 * slower than the `interKeyMs` threshold, the barcode is captured without any
 * input field needing focus. Fires `onScan(code)` once per scan.
 *
 * التجميعُ والحكمُ في `scanBuffer.ts` (مفحوصٌ بـ`scripts/scan-test.mjs`):
 * الزمنُ زمنُ الحدث لا زمنُ معالجته، والحكمُ على الدفعة كلّها — لأن انشغالَ
 * المتصفّح بالرسم بين ضغطتين كان يقطع الرمزَ ويُرسل ذيلَه (ابن الهيثم، ٥ أيلول).
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts: Options = {}) {
  const { minLength = 3, interKeyMs = 60, disabled = false } = opts;
  const cb = useRef(onScan);
  cb.current = onScan; // always call the latest handler without re-subscribing

  useEffect(() => {
    if (disabled) return;
    const asm = createScanAssembler({ minLength, interKeyMs });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // `timeStamp` يُختم لحظةَ وقوع الضغطة بالجهاز، فلا يتأثّر بانشغال الخيط.
      const code = asm.feed(e.key, e.timeStamp);
      if (code) {
        e.preventDefault(); // don't let the trailing Enter submit a form
        cb.current(code);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, minLength, interKeyMs]);
}
