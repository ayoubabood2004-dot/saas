// ============================================================================
// UI font scaling (حجم الخط) — opt-in from Settings.
//
// The whole design system is sized in rem (Tailwind text + spacing), so scaling
// the ROOT font-size scales text and whitespace together, in proportion —
// nothing squeezes or overlaps, exactly like the browser's own zoom, while
// px-based media queries keep every layout breakpoint unchanged. Printed
// documents open their own windows and are untouched.
//
// The enable flag is clinic-wide (clinic_prefs.font_scale_enabled, migration
// 0068); the chosen size is a PER-DEVICE preference so a small-laptop screen
// can read comfortably without affecting the clinic's other devices.
// ============================================================================
import { getFontScaleEnabled } from "./settings";

export const FONT_SCALES = [
  { id: "compact", pct: 87.5 }, // 14px root — fit more on a big screen
  { id: "normal", pct: 100 },   // 16px root — the design default
  { id: "large", pct: 112.5 },  // 18px root — comfortable on small laptops
  { id: "xlarge", pct: 125 },   // 20px root — maximum readability
] as const;
export type FontScaleId = (typeof FONT_SCALES)[number]["id"];

const KEY = "vp_font_scale";

export function getFontScale(): FontScaleId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && FONT_SCALES.some((s) => s.id === raw)) return raw as FontScaleId;
  } catch { /* ignore */ }
  return "normal";
}

export function setFontScale(id: FontScaleId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  applyFontScale();
}

/** Stamp the effective scale on <html>. Feature off (or "normal") → the inline
 *  style is removed entirely, restoring the stock 16px root. Idempotent — safe
 *  to call at boot, after every hydrate, and on every Settings change. */
export function applyFontScale(): void {
  if (typeof document === "undefined") return;
  const pct = getFontScaleEnabled() ? (FONT_SCALES.find((s) => s.id === getFontScale())?.pct ?? 100) : 100;
  if (pct === 100) document.documentElement.style.removeProperty("font-size");
  else document.documentElement.style.fontSize = `${pct}%`;
}
