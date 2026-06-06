import { cn } from "@/lib/utils";

/**
 * VetPassport brand mark — a "vital paw": a paw print (the pet) crossed by a
 * heartbeat pulse (veterinary health record). The paw uses `currentColor` so it
 * adapts to any context; the pulse is a warm accent for a pop of life.
 */
export function LogoMark({ size = 22, className, pulse = "#ff7a45" }: { size?: number; className?: string; pulse?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <g fill="currentColor">
        {/* toe beans */}
        <ellipse cx="8.6" cy="13.6" rx="2.7" ry="3.5" transform="rotate(-20 8.6 13.6)" />
        <ellipse cx="13.4" cy="8.7" rx="2.85" ry="3.7" transform="rotate(-7 13.4 8.7)" />
        <ellipse cx="18.6" cy="8.7" rx="2.85" ry="3.7" transform="rotate(7 18.6 8.7)" />
        <ellipse cx="23.4" cy="13.6" rx="2.7" ry="3.5" transform="rotate(20 23.4 13.6)" />
        {/* main pad */}
        <path d="M16 14.4c-4.9 0-8.6 3.2-8.6 7.2 0 3.7 3.8 6.4 8.6 6.4s8.6-2.7 8.6-6.4c0-4-3.7-7.2-8.6-7.2Z" />
      </g>
      {/* heartbeat across the pad */}
      <path
        d="M9.3 22.1h3.5l1.4-3.6 2.1 6.4 1.5-3h4.9"
        fill="none"
        stroke={pulse}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full emblem: the brand-gradient tile with the white vital-paw mark inside. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft", className)}
      style={{ width: size, height: size }}
    >
      <LogoMark size={Math.round(size * 0.6)} />
    </span>
  );
}
