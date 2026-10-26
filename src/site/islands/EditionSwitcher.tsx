/* محوِّلُ «الدولة · العملة» — بالرأس والتذييل. لا تحويلَ تلقائيّ: الزائرُ يختار، والاختيارُ
 * يُحفظ بجهازه (`dv_edition`) فلا يُقترح عليه غيرُه بعدها، وتفتحه البوّابةُ (`/`) مباشرةً. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Search, Check } from "lucide-react";

export interface SwitcherOption { code: string; name: string; sym: string }
export interface SwitcherProps {
  current: string;
  label: string;
  title: string;
  search: string;
  options: SwitcherOption[];
  /** ما بعد رمز النسخة بالمسار (`/pricing`) — الاختيارُ يفتح الصفحةَ نفسها بنسخةٍ أخرى. */
  rest: string;
  compact?: boolean;
  dark?: boolean;
}

export function rememberEdition(code: string) {
  try { localStorage.setItem("dv_edition", code); } catch { /* تخزينٌ ممنوع — الاختيارُ لهذه الزيارة */ }
}

export default function EditionSwitcher({ current, label, title, search, options, rest, compact, dark }: SwitcherProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.code === current);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.name.toLowerCase().includes(t) || o.code.includes(t)) : options;
  }, [q, options]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${dark ? "border-white/20 text-white hover:border-white/40" : "border-rule bg-white text-navy hover:border-brand-300"}`}
      >
        <Globe size={16} aria-hidden className={dark ? "text-white/80" : "text-brand-600"} />
        <span>{cur ? (compact ? cur.sym : `${cur.name} · ${cur.sym}`) : label}</span>
      </button>
      {open && (
        <div className={`absolute z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-rule bg-white text-navy shadow-[0_24px_48px_-20px_rgb(15_30_53/0.4)] ${dark ? "bottom-full mb-2" : ""} end-0`}>
          <div className="border-b border-rule p-3">
            <p className="mb-2 text-xs font-semibold text-navy-3">{title}</p>
            <label className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2">
              <Search size={15} aria-hidden className="text-navy-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={search} aria-label={search} className="w-full bg-transparent text-sm outline-none placeholder:text-navy-3" />
            </label>
          </div>
          <ul role="listbox" aria-label={title} className="max-h-72 overflow-y-auto py-1">
            {list.map((o) => (
              <li key={o.code} role="option" aria-selected={o.code === current}>
                <a
                  href={`/${o.code}${rest}`}
                  onClick={() => rememberEdition(o.code)}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-paper ${o.code === current ? "font-semibold text-brand-700" : "text-navy"}`}
                >
                  <span>{o.name}</span>
                  <span className="flex items-center gap-2 text-navy-3">
                    <span className="num">{o.sym}</span>
                    {o.code === current && <Check size={15} aria-hidden className="text-brand-600" />}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
