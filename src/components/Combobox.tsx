import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/**
 * Premium combobox: a searchable dropdown that is ALSO a free-text input.
 * The typed text is always the live value, so a custom entry the doctor types can
 * never be lost — suggestions are pure convenience. When the text doesn't exactly
 * match a known option, a "Create …" row lets them confirm a new diagnosis (Enter
 * or click). Full keyboard nav (↑/↓/Enter/Esc), click-outside, dark-mode native.
 * Built on the app's design tokens + framer-motion (Radix/Shadcn feel, no new dep).
 */
export function Combobox({
  value,
  onChange,
  onCommit,
  options,
  placeholder,
  allowCustom = true,
  disabled = false,
  icon,
  createLabel,
  emptyLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  /**
   * Fired only on a *deliberate* selection: clicking a suggestion, clicking the
   * "Create …" row, or pressing Enter — never on plain typing. Use this to
   * persist a newly created entry (onChange fires on every keystroke).
   */
  onCommit?: (v: string) => void;
  options: string[];
  placeholder?: string;
  /** Allow committing a value that isn't in `options` (default true). */
  allowCustom?: boolean;
  /** Disable the control (e.g. a dependent field whose parent isn't set yet). */
  disabled?: boolean;
  icon?: ReactNode;
  /** Label for the "create new" row, given the current query. */
  createLabel?: (q: string) => string;
  /** Shown when there are no matches and custom entries are disabled. */
  emptyLabel?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the value is reset/changed from outside.
  useEffect(() => { setQuery((q) => (q !== value ? value : q)); }, [value]);

  const q = query.trim();
  const ql = q.toLowerCase();
  const filtered = useMemo(
    () => (ql ? options.filter((o) => o.toLowerCase().includes(ql)) : options),
    [options, ql],
  );
  const exactMatch = options.some((o) => o.toLowerCase() === ql);
  const showCreate = allowCustom && q.length > 0 && !exactMatch;

  // Unified, navigable item list: filtered options first, then the optional create row.
  const items = useMemo(
    () => [
      ...filtered.map((o) => ({ kind: "option" as const, value: o })),
      ...(showCreate ? [{ kind: "create" as const, value: q }] : []),
    ],
    [filtered, showCreate, q],
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const commit = (val: string) => {
    onChange(val);
    onCommit?.(val);
    setQuery(val);
    setOpen(false);
    playTap();
  };

  const openList = (toEnd = false) => { setOpen(true); setHighlight(toEnd ? Math.max(items.length - 1, 0) : 0); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { openList(false); return; } // open AND land on the first row
      setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { openList(true); return; } // open AND land on the last row
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = open ? items[highlight] : undefined; // only honour a highlight while open
      if (sel) commit(sel.value);
      else if (allowCustom && q) commit(q); // bare free text — never lost
      else if (q) setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        {icon && <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3", disabled && "opacity-50")}>{icon}</span>}
        <input
          className={cn("input pe-9", icon && "ltr:pl-9 rtl:pr-9", disabled && "cursor-not-allowed opacity-60")}
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => { setOpen(true); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => { setHighlight(0); setOpen((o) => !o); }}
          aria-label="Toggle suggestions"
          className="absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-ink-subtle transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ltr:right-2 rtl:left-2"
        >
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence>
        {open && !disabled && (filtered.length > 0 || showCreate || (!allowCustom && emptyLabel)) && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-raised"
          >
            <div ref={listRef} className="max-h-60 overflow-y-auto p-1 [scrollbar-width:thin]">
              {filtered.length === 0 && !showCreate && emptyLabel && (
                <p className="px-3 py-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>
              )}
              {items.map((it, i) => {
                const active = i === highlight;
                if (it.kind === "create") {
                  return (
                    <button
                      key="__create"
                      type="button"
                      data-idx={i}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(it.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold transition",
                        active ? "bg-brand-600 text-white" : "text-brand-700 hover:bg-surface-2 dark:text-brand-300",
                      )}
                    >
                      <Plus size={15} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{createLabel ? createLabel(it.value) : `Create “${it.value}”`}</span>
                    </button>
                  );
                }
                const isSel = it.value.toLowerCase() === ql;
                return (
                  <button
                    key={it.value}
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(it.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm transition",
                      active ? "bg-brand-600 text-white" : "text-ink hover:bg-surface-2",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{it.value}</span>
                    {isSel && <Check size={15} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
