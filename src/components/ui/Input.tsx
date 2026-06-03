import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-2xl border bg-surface-1 px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink-subtle focus:ring-4 focus:ring-brand-500/15";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leftIcon, ...rest },
  ref,
) {
  const field = (
    <input
      ref={ref}
      className={cn(
        base,
        invalid ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/15" : "border-line focus:border-brand-400",
        leftIcon && "pl-11",
        className,
      )}
      {...rest}
    />
  );
  if (!leftIcon) return field;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-ink-subtle">
        {leftIcon}
      </span>
      {field}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(base, "min-h-[96px] resize-y", invalid ? "border-danger-400" : "border-line focus:border-brand-400", className)}
        {...rest}
      />
    );
  },
);

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink-muted mb-1.5", className)} {...rest} />;
}

/** Label + control + optional error, wired with a shared id. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children(id)}
      {error ? (
        <p className="text-sm font-medium text-danger-600">{error}</p>
      ) : hint ? (
        <p className="text-sm text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
