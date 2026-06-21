import { useTranslation } from "react-i18next";
import { Plus, Stethoscope, Tag } from "lucide-react";
import type { ServiceCatalog, Service } from "@/types";
import { cn, money } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/**
 * POS quick-select grid for non-barcode services, grouped by the categories the
 * clinic defined in Settings. One tap adds the service (at its default price,
 * overridable in the cart) to the active invoice.
 */
export function ServiceQuickSelect({ catalog, onPick, flashId }: {
  catalog: ServiceCatalog;
  onPick: (s: Service) => void;
  flashId?: string | null;
}) {
  const { t } = useTranslation();
  const cats = catalog.categories.filter((c) => catalog.services.some((s) => s.category_id === c.id));

  if (cats.length === 0) {
    return (
      <div className="card grid place-items-center p-10 text-center text-sm text-ink-subtle">
        <Stethoscope size={28} className="mb-2 opacity-40" />
        {t("retail.noServices", "No services yet — add them in Settings → Services.")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cats.map((cat) => {
        const items = catalog.services.filter((s) => s.category_id === cat.id);
        return (
          <div key={cat.id}>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
              <Tag size={12} className="text-brand-600" /> {cat.name}
              <span className="text-2xs font-normal normal-case text-ink-subtle">· {items.length}</span>
            </div>
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
          </div>
        );
      })}
    </div>
  );
}
