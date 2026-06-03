import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Frosted-glass surface — great over gradients / hero areas. */
  glass?: boolean;
  /** Adds hover lift + pointer affordance for clickable cards. */
  interactive?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { glass, interactive, padded, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        glass
          ? "rounded-3xl border border-white/40 bg-white/70 backdrop-blur-xl shadow-soft dark:border-white/10 dark:bg-surface-1/70"
          : "rounded-3xl border border-line bg-surface-1 shadow-card",
        interactive &&
          "cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-raised hover:border-brand-200 dark:hover:border-brand-500/40",
        padded && "p-5 sm:p-6",
        className,
      )}
      {...rest}
    />
  );
});

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 mb-4", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg font-bold tracking-tighter2 text-ink", className)} {...rest} />;
}
