import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import type { CatRow } from "@/lib/storeCatIndex";
import { catGlyph } from "@/lib/storeLib";
import { cn, formatNum } from "@/lib/utils";

/** «أضف للتصنيف… / شيل من التصنيف…» للمختار — اختيارُ تصنيفاتٍ عدّة ثم نداءٌ واحد. رفيقُ المتجر. */
export function CatPickerSheet({ mode, live, count, busy, onClose, onApply }: {
  mode: "add" | "remove" | null;
  live: CatRow[];
  /** عددُ المنتجات المختارة. */
  count: number;
  busy: boolean;
  onClose: () => void;
  onApply: (catIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { if (mode) setSel(new Set()); }, [mode]);
  const title = mode === "remove"
    ? t("cat.bulkRemoveTitle", "شيل {{n}} مادة من…", { n: formatNum(count) })
    : t("cat.bulkAddTitle", "أضف {{n}} مادة إلى…", { n: formatNum(count) });
  return (
    <Modal open={!!mode} onClose={onClose} title={title}>
      <div className="space-y-3" data-catpicker>
        {live.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t("cat.sheetNoCats", "ما اكو تصنيفات بعد — ابدأها من تبويب «التصنيفات».")}</p>
        ) : (
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {live.map((c) => {
              const on = sel.has(c.id);
              return (
                <label key={c.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition",
                  on ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15" : "border-line hover:bg-surface-2")}>
                  <input type="checkbox" checked={on} className="h-5 w-5 shrink-0 accent-brand-600"
                    onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })} />
                  <span className="text-lg" aria-hidden>{catGlyph(c.icon)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
                </label>
              );
            })}
          </div>
        )}
        <Button className="w-full" variant={mode === "remove" ? "danger" : "primary"} disabled={!sel.size} loading={busy}
          onClick={() => onApply([...sel])} data-catpickok>
          {mode === "remove"
            ? t("cat.bulkRemoveOk", "شيلها من {{n}} تصنيف", { n: formatNum(sel.size) })
            : t("cat.bulkAddOk", "أضفها لـ{{n}} تصنيف", { n: formatNum(sel.size) })}
        </Button>
      </div>
    </Modal>
  );
}
