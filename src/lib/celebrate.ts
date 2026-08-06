// A dependency-free confetti burst for moments the clinic earned — saving a
// full diagnosis + treatment plan, closing a case. One canvas, ~1.4 seconds,
// brand palette, and it honors prefers-reduced-motion by simply not firing.

const COLORS = ["#1266d8", "#2f7df2", "#38bdf8", "#ff7a45", "#22c55e", "#a78bfa", "#fbbf24"];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rot: number; vr: number;
  shape: 0 | 1; // rectangle | circle
  life: number;
}

let running = false;

/**
 * Fire a confetti burst. `origin` is in viewport coordinates (defaults to
 * upper-center, where a save button's toast usually lands the eye).
 * Repeat calls while a burst is live are ignored — no confetti spam.
 */
export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || running) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);
  running = true;

  const ox = origin?.x ?? window.innerWidth / 2;
  const oy = origin?.y ?? window.innerHeight * 0.35;

  // Two fans of particles shot upward-outward, gravity brings them down.
  const parts: Particle[] = [];
  for (let i = 0; i < 110; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 7 + Math.random() * 9;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.7),
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      shape: Math.random() < 0.7 ? 0 : 1,
      life: 1,
    });
  }

  const started = performance.now();
  const DURATION = 1400;

  const frame = (now: number) => {
    const t = now - started;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.32;          // gravity
      p.vx *= 0.985;         // drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t / DURATION);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else { canvas.remove(); running = false; }
  };
  requestAnimationFrame(frame);
}
