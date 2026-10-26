/* جولةُ يوم العيادة بالتبويبات. كلُّ اللوحات بالـHTML (المخفيّةُ بـ`hidden`) — الزاحفُ يقرأها كلَّها،
 * والزائرُ يرى واحدةً بوقتها. الأسهمُ تتنقّل بين التبويبات كما يتوقّع قارئُ الشاشة. */
import { useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

export interface TourTabsProps {
  tabs: { key: string; label: string; title: string; body: string; bullets: string[]; href: string }[];
  more: string;
  rtl: boolean;
}

export default function TourTabs({ tabs, more, rtl }: TourTabsProps) {
  const [i, setI] = useState(0);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === (rtl ? "ArrowLeft" : "ArrowRight") ? 1 : e.key === (rtl ? "ArrowRight" : "ArrowLeft") ? -1 : 0;
    if (!next) return;
    e.preventDefault();
    const n = (i + next + tabs.length) % tabs.length;
    setI(n);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[n])?.focus();
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div role="tablist" aria-orientation="vertical" onKeyDown={onKey} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {tabs.map((t, n) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={n === i}
            aria-controls={`panel-${t.key}`}
            tabIndex={n === i ? 0 : -1}
            onClick={() => setI(n)}
            className={`shrink-0 rounded-2xl px-4 py-3 text-start text-sm font-semibold transition lg:text-[15px] ${n === i ? "bg-navy text-white" : "bg-white text-navy-2 ring-1 ring-rule hover:text-navy"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, n) => (
        <div key={t.key} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={n !== i} className="card p-6 sm:p-8">
          <h3 className="font-display text-2xl font-bold leading-snug">{t.title}</h3>
          <p className="lead mt-3">{t.body}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {t.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 rounded-2xl bg-paper px-4 py-3 text-sm leading-6 text-navy-2">
                <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-dose" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <a href={t.href} className="mt-6 inline-flex text-sm font-semibold text-brand-700 hover:underline">{more}</a>
        </div>
      ))}
    </div>
  );
}
