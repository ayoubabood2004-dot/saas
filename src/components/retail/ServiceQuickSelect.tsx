import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Stethoscope, Tag, Search, X } from "lucide-react";
import type { ServiceCatalog, Service } from "@/types";
import { cn, money, searchable } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/**
 * POS quick-select grid for non-barcode services, grouped by the categories the
 * clinic defined in Settings. A search box filters by service name or category
 * so long catalogs stay usable. One tap adds the service (at its default price,
 * overridable in the cart) to the active invoice.
 *
 * `compact` (0147): سطورٌ بدل مربّعات — الاسم كاملاً على سطرٍ واحد والسعر بآخره.
 * ثلاثةُ أضعاف الخدمات بنفس الارتفاع، والمساحةُ المتحرّرة تذهب للسلة.
 */
export function ServiceQuickSelect({ catalog, onPick, flashId, compact }: {
  catalog: ServiceCatalog;
  onPick: (s: Service) => void;
  flashId?: string | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  // نفس تطبيع بقية الشاشات: «ة/ه» والهمزات والأرقام العربية ما تمنع المطابقة.
  const ql = searchable(q.trim());

  // Categories that still have services after the query (a category-name match
  // keeps all of its services; otherwise only the services whose name matches).
  const groups = useMemo(() => {
    return catalog.categories
      .map((cat) => {
        const catHit = ql && searchable(cat.name).includes(ql);
        const items = catalog.services.filter(
          (s) => s.category_id === cat.id && (!ql || catHit || searchable(s.name).includes(ql)),
        );
        return { cat, items };
      })
      .filter((g) => g.items.length > 0);
  }, [catalog, ql]);

  // No services configured at all — point the user to Settings.
  if (catalog.services.length === 0) {
    return (
      <div className="card grid place-items-center p-10 text-center text-sm text-ink-subtle">
        <Stethoscope size={28} className="mb-2 opacity-40" />
        {t("retail.noServices", "No services yet — add them in Settings → Services.")}
      </div>
    );
  }

  return (
    <div className={cn(compact ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-4")}>
      {/* Search */}
      <div className={cn("relative", compact && "shrink-0")}>
        <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
        <input
          className="input ltr:pl-9 rtl:pr-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("retail.searchServices", "ابحث عن خدمة…")}
        />
        {q && (
          <button
            onClick={() => { playTap(); setQ(""); }}
            aria-label={t("common.clear", "Clear")}
            className="absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink ltr:right-2 rtl:left-2"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="grid h-32 place-items-center px-6 text-center text-sm text-ink-subtle">
          {t("retail.noServiceMatch", "لا توجد خدمة مطابقة.")}
        </div>
      ) : (
        <div className={cn(compact ? "min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-1" : "contents")}>
          {groups.map(({ cat, items }) => (
            <div key={cat.id}>
              <div className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted", compact ? "mb-1" : "mb-2")}>
                <Tag size={12} className="text-brand-600" /> {cat.name}
                <span className="text-2xs font-normal normal-case text-ink-subtle">· {items.length}</span>
              </div>
              {compact ? (
                <div className="flex flex-col gap-1">
                  {items.map((s) => (
                    <button
                      key={s.id} data-svcrow={s.id}
                      onClick={() => { playTap(); onPick(s); }}
                      className={cn(
                        "group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-start transition",
                        flashId === `s:${s.id}`
                          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15"
                          : "border-line bg-surface-1 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Stethoscope size={14} /></span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={s.name}>{s.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{money(s.price)}</span>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white opacity-60 transition group-hover:opacity-100"><Plus size={13} /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { playTap(); onPick(s); }}
                      className={cn(
                        "group relative flex flex-col rounded-2xl border p-3 text-start transition",
                        flashId === `s:${s.id}`
                          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15"
                          : "border-line bg-surface-1 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        <Stethoscope size={17} />
                      </span>
                      <span className="mt-2 line-clamp-2 min-h-[2.2rem] text-xs font-semibold leading-tight text-ink">{s.name}</span>
                      <span className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-bold text-ink tabular-nums">{money(s.price)}</span>
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white opacity-0 transition group-hover:opacity-100"><Plus size={12} /></span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
