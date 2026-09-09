// ============================================================================
// منتقي مكتبة الصور (0175) — قراءةٌ فقط من جهة العيادة.
//
// المكتبة يبنيها مشغّل المنصّة من لوحته مقسّمةً شركةً وصنفاً (قرار المالك،
// docs/store-plan.md)؛ الدكتور هنا يتصفّح ويبحث ويضغط — والاختيار يرجع
// «مسار» ملف المكتبة ليُكتب بـ`image_path` للمنتج: مرجعٌ لملفٍ واحدٍ يخدم
// كلَّ العيادات، لا نسخة. لا زرَّ رفعٍ هنا عمداً.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Images } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Skeleton, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { cn, searchable } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import type { LibraryImage } from "@/types";

export function ImageLibraryPicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بالصف المختار — المستهلك يكتب `row.path` بحقل صورة المنتج. */
  onPick: (row: LibraryImage) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LibraryImage[] | null>(null);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    setRows(null);
    repo.listImageLibrary()
      .then(setRows)
      .catch((e) => { setRows([]); toast.error(describeDbError(e, t)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const companies = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.company) s.add(r.company);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const shown = useMemo(() => {
    const ql = searchable(q);
    return (rows ?? []).filter((r) =>
      (company === "all" || r.company === company) &&
      (!ql || searchable(r.name).includes(ql) || searchable(r.section ?? "").includes(ql) || searchable(r.company ?? "").includes(ql)));
  }, [rows, q, company]);

  return (
    <Modal open={open} onClose={onClose} title={t("lib.pickTitle", "اختر من مكتبة الصور")}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} data-libsearch
            placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} />
        </div>
        {companies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {["all", ...companies].map((c) => (
              <button key={c} onClick={() => { playTap(); setCompany(c); }}
                className={cn("rounded-full px-3 py-1 text-2xs font-bold transition",
                  company === c ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                {c === "all" ? t("lib.allCompanies", "كل الشركات") : c}
              </button>
            ))}
          </div>
        )}

        {rows === null ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong p-8 text-center">
            <Images size={24} className="text-ink-subtle" />
            <p className="text-sm text-ink-subtle">
              {rows.length === 0
                ? t("lib.empty", "المكتبة فارغة بعد — يعبّيها مشغّل المنصّة، وتكدر تصوّر منتجك بنفسك.")
                : t("lib.noMatch", "ماكو صورة تطابق بحثك.")}
            </p>
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-libgrid>
            {shown.map((r) => (
              <button key={r.id} onClick={() => { playTap(); onPick(r); onClose(); }}
                className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface-1 text-start transition hover:border-brand-400 hover:shadow-raised">
                <img src={productImageUrl(r.path) ?? undefined} alt="" loading="lazy"
                  className="aspect-square w-full bg-surface-2 object-cover"
                  onError={(e) => { e.currentTarget.hidden = true; }} />
                <span className="line-clamp-2 p-1.5 text-2xs font-bold leading-snug text-ink">{r.name}</span>
                {r.section && <span className="px-1.5 pb-1.5 text-2xs text-ink-subtle">{r.section}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
