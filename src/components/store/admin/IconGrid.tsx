import { useTranslation } from "react-i18next";
import type { StoreCatIcon } from "@/types";
import { STORE_CAT_ICON_KEYS } from "@/lib/storeCatIndex";
import { STORE_CAT_ICONS } from "@/lib/storeLib";
import { cn } from "@/lib/utils";

/** شبكةُ الأيقونات العشرين (قيدُ 0233) — رفيقةُ «المتجر الإلكتروني». */
export function IconGrid({ value, onChange }: { value: StoreCatIcon; onChange: (icon: StoreCatIcon) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="radiogroup" aria-label={t("cat.iconPick", "اختر أيقونة")} data-icongrid>
      {STORE_CAT_ICON_KEYS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={k} onClick={() => onChange(k)}
          className={cn("grid h-11 place-items-center rounded-xl border text-xl transition active:scale-95",
            value === k ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300 dark:bg-brand-500/15" : "border-line bg-surface-1 hover:bg-surface-2")}>
          {STORE_CAT_ICONS[k]}
        </button>
      ))}
    </div>
  );
}
