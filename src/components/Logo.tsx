import { cn } from "@/lib/utils";

/**
 * doctorVet brand mark — «Pawfinder»: a paw print whose main pad is a QR
 * finder pattern (the square-in-square scan target), center pad in warm coral.
 *
 * The double reading IS the brand's moat: from across the room it's a paw
 * (the animal), at arm's length the pad is the corner of a QR code (the
 * universal passport) — the pet's identity is the scannable record that
 * travels with it to any clinic. Square toes echo QR modules, which is what
 * keeps the silhouette ownable next to every round-toed vet paw.
 *
 * Geometry notes: the pad uses real QR finder proportions (7:5:3 — outer 31,
 * wall 4.5, center 13 units) so the scan-target reading stays honest, and the
 * coral center is what keeps the mark anchored all the way down to 16 px.
 * Chosen by a 12-candidate design competition scored by a 3-lens judge panel.
 */
export function LogoMark({ size = 22, className, pulse = "#ff7a45" }: { size?: number; className?: string; pulse?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" className={className} aria-hidden="true">
      {/* toes — rounded squares, the QR-module echo */}
      <rect x="4" y="12.5" width="13" height="13" rx="4.5" />
      <rect x="25.5" y="4.5" width="13" height="13" rx="4.5" />
      <rect x="47" y="12.5" width="13" height="13" rx="4.5" />
      {/* main pad — the finder ring (outer square minus inner cutout) */}
      <path
        fillRule="evenodd"
        d="M26.5 27h11a10 10 0 0 1 10 10v11a10 10 0 0 1-10 10h-11a10 10 0 0 1-10-10V37a10 10 0 0 1 10-10zm1 4.5h9a5.5 5.5 0 0 1 5.5 5.5v9a5.5 5.5 0 0 1-5.5 5.5h-9a5.5 5.5 0 0 1-5.5-5.5v-9a5.5 5.5 0 0 1 5.5-5.5z"
      />
      {/* center pad — the warm accent that anchors the mark at 16 px */}
      <rect x="25.5" y="36" width="13" height="13" rx="4" fill={pulse} />
    </svg>
  );
}

/** Full emblem: the brand-gradient tile with the white Pawfinder mark inside. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft", className)}
      style={{ width: size, height: size }}
    >
      <LogoMark size={Math.round(size * 0.62)} />
    </span>
  );
}
