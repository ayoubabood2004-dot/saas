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

/** Light tap for general interactions. */
export function playTap() {
  if (!isSoundEnabled()) return;
  tone(660, 0, 0.06, "sine", 0.08);
}
