/* لبناتٌ صغيرةٌ تتكرّر بالصفحات — بلا نصٍّ عربيّ (كلُّه من المحتوى). */
import type { ReactNode } from "react";
import { Check, Minus, ChevronDown } from "lucide-react";
import type { Cell, QA } from "./types";

export function Section({ id, eyebrow, title, sub, children, className = "", tone = "plain" }: {
  id?: string; eyebrow?: string; title?: string; sub?: string; children: ReactNode; className?: string; tone?: "plain" | "white" | "ink";
}) {
  const bg = tone === "white" ? "bg-white" : tone === "ink" ? "bg-navy text-white" : "";
  return (
    <section id={id} className={`section ${bg} ${className}`}>
      <div className="container">
        {(eyebrow || title || sub) && (
          <header className="mb-10 max-w-3xl sm:mb-14">
            {eyebrow && <p className={`eyebrow ${tone === "ink" ? "text-stamp-100" : ""}`}><StampDot />{eyebrow}</p>}
            {title && <h2 className={`h2 mt-3 ${tone === "ink" ? "text-white" : ""}`}>{title}</h2>}
            {sub && <p className={`lead mt-4 ${tone === "ink" ? "text-white/75" : ""}`}>{sub}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

/** نقطةُ الختم — علامةُ «مسجَّل» أمام كلّ عنوانٍ فرعيّ. */
export function StampDot() {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-stamp" />;
}

export function CtaPair({ primary, primaryHref, secondary, secondaryHref, at, light = false }: {
  primary: string; primaryHref: string; secondary?: string; secondaryHref?: string; at: string; light?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={primaryHref} data-cta={at} className={light ? "btn-primary bg-white text-brand-700 hover:bg-brand-50" : "btn-primary"}>{primary}</a>
      {secondary && secondaryHref && (
        <a href={secondaryHref} className={light ? "btn-ghost border-white/25 bg-white/10 text-white hover:border-white/50 hover:text-white" : "btn-ghost"}>{secondary}</a>
      )}
    </div>
  );
}

export function Reassure({ text, light = false }: { text: string; light?: boolean }) {
  return (
    <p className={`mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${light ? "text-white/80" : "text-navy-3"}`}>
      <Check size={16} className={light ? "text-white" : "text-dose"} aria-hidden />
      <span>{text}</span>
    </p>
  );
}

/** الأسئلةُ بـ<details> — تعمل بلا جافاسكربت، والجوابُ بالـHTML للزاحف. */
export function FaqList({ items }: { items: QA[] }) {
  return (
    <div className="divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-white">
      {items.map((it) => (
        <details key={it.q} className="group px-5 py-4 sm:px-7">
          <summary className="flex items-start justify-between gap-4 py-1 text-start text-base font-semibold text-navy sm:text-lg">
            <span>{it.q}</span>
            <ChevronDown size={20} aria-hidden className="mt-1 shrink-0 text-navy-3 transition group-open:rotate-180" />
          </summary>
          <p className="pb-2 pt-3 leading-8 text-navy-2">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CellMark({ v }: { v: Cell }) {
  if (v === true) return <span className="inline-flex" role="img" aria-label="✓"><Check size={18} className="text-dose" aria-hidden /></span>;
  if (v === false) return <span className="inline-flex" role="img" aria-label="—"><Minus size={18} className="text-navy-3/60" aria-hidden /></span>;
  return <span className="text-sm text-navy-2">{v}</span>;
}

/** شاشةٌ مرسومة (لا صورةَ مختلقة) — وعليها «بيانات توضيحية» دائماً. */
export function MockSheet({ title, label, rows }: { title: string; label: string; rows: { label: string; value: string; tone?: "ok" | "warn" | "bad" | "info" }[] }) {
  const tone = { ok: "bg-dose-50 text-dose-700", warn: "bg-warn-50 text-warn-700", bad: "bg-due-50 text-due", info: "bg-brand-50 text-brand-700" } as const;
  return (
    <figure className="card overflow-hidden shadow-[0_30px_60px_-30px_rgb(15_30_53/0.35)]">
      <div className="flex items-center justify-between border-b border-rule bg-paper px-5 py-3">
        <figcaption className="font-display text-sm font-semibold text-navy">{title}</figcaption>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-navy-3 ring-1 ring-rule">{label}</span>
      </div>
      <ul className="divide-y divide-rule">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm text-navy-2">{r.label}</span>
            <span className={`num rounded-full px-2.5 py-0.5 text-sm font-semibold ${r.tone ? tone[r.tone] : "text-navy"}`}>{r.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
