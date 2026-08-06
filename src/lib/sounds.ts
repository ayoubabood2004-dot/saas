// Interactive audio feedback (Web Audio API — no asset files needed).
// Soft success chime, warning beep, and a "laser scan" sweep for QR lock/unlock.

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem("vp_sound", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem("vp_sound");
    if (v !== null) enabled = v === "1";
  } catch {
    /* ignore */
  }
  return enabled;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain: number) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

/** Soft, reassuring two-note chime — booking saved, prescription saved. */
export function playSuccess() {
  if (!isSoundEnabled()) return;
  tone(587.33, 0, 0.18, "sine", 0.18); // D5
  tone(880.0, 0.12, 0.28, "sine", 0.16); // A5
}

/** Cautious warning beep — critical vital, low stock. */
export function playWarning() {
  if (!isSoundEnabled()) return;
  tone(440, 0, 0.14, "square", 0.12);
  tone(370, 0.16, 0.18, "square", 0.12);
}

/** Lively laser sweep — QR lock/unlock of a chart. */
export function playScan() {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(280, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1600, ac.currentTime + 0.22);
  g.gain.setValueAtTime(0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.32);
}

/** Crisp confirmation for copy-to-clipboard. Plays the bundled asset via the native
 *  HTML5 Audio API, falling back to the synth success chime if the file is missing,
 *  not yet loaded, or autoplay is blocked — so there's always audible feedback. */
export function playCopySuccess() {
  if (!isSoundEnabled()) return;
  if (typeof Audio === "undefined") { playSuccess(); return; }
  try {
    const audio = new Audio("/sounds/copy-success.mp3");
    audio.volume = 0.5;
    // play() returns a promise that rejects on a 404 / blocked autoplay — catch it
    // so it never surfaces as an unhandled rejection, and fall back to the chime.
    audio.play().catch(() => playSuccess());
  } catch {
    playSuccess();
  }
}

/** Light tap for general interactions. */
export function playTap() {
  if (!isSoundEnabled()) return;
  tone(660, 0, 0.06, "sine", 0.08);
}

/** A celesta-like bell: fundamental + soft octave + faint 3rd partial. The
 *  layered harmonics are what make a note feel "expensive" instead of beepy. */
function bellNote(freq: number, start: number, dur: number, gain: number) {
  tone(freq, start, dur, "sine", gain);
  tone(freq * 2, start, dur * 0.55, "sine", gain * 0.32);
  tone(freq * 3, start + 0.012, dur * 0.28, "sine", gain * 0.1);
}

/** جرعة انعطت — the dopamine hit. A quick celesta figure that climbs and
 *  BLOOMS on the octave: E5 → G5 → C6, the last note ringing with a shimmer
 *  a major-third above and a warm low C underneath. Bright attack, soft body,
 *  fully resolved — the brain reads it as «شيء طيب صار وخلص بنجاح».
 *  Still ~0.6s and consonant back-to-back, because a nurse hears it 50×/day. */
export function playDoseGiven() {
  if (!isSoundEnabled()) return;
  bellNote(659.25, 0, 0.2, 0.12);        // E5 — lift-off
  bellNote(783.99, 0.075, 0.2, 0.12);    // G5 — climbing
  bellNote(1046.5, 0.15, 0.5, 0.16);     // C6 — the bloom, rings out
  tone(1318.5, 0.21, 0.4, "sine", 0.05); // E6 shimmer floating above
  tone(261.63, 0.15, 0.45, "sine", 0.055); // C4 — warm bed under the bloom
}

/** A step of the wizard just completed — one bright pop, pitched by progress
 *  (later steps ring higher), so filling the form literally plays a scale. */
export function playStepDone(stepIndex = 0) {
  if (!isSoundEnabled()) return;
  // Pentatonic degrees — any pair of them is consonant, so quick back-to-back
  // steps never clash: C5 D5 E5 G5 A5.
  const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
  const f = scale[Math.min(scale.length - 1, Math.max(0, stepIndex))];
  tone(f, 0, 0.12, "sine", 0.14);
  tone(f * 2, 0.02, 0.16, "sine", 0.05); // airy octave sparkle
}

/** The earned fanfare — the whole plan saved. A rising major arpeggio that
 *  resolves on a full chord: short enough to never annoy (~0.9s), warm enough
 *  to feel like an achievement, not a slot machine. */
export function playAchievement() {
  if (!isSoundEnabled()) return;
  // Rise: C5 → E5 → G5 …
  tone(523.25, 0, 0.14, "sine", 0.15);
  tone(659.25, 0.1, 0.14, "sine", 0.15);
  tone(783.99, 0.2, 0.16, "sine", 0.16);
  // …resolve: the full C-major chord with a high sparkle, ringing out together.
  tone(523.25, 0.34, 0.5, "sine", 0.12);
  tone(659.25, 0.34, 0.5, "sine", 0.12);
  tone(1046.5, 0.34, 0.55, "sine", 0.14);
  tone(2093.0, 0.4, 0.35, "triangle", 0.04);
}
