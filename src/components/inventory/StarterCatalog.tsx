import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, FolderTree, Package, Sparkles, Check } from "lucide-react";
import type { Company, CompanySection, Product } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { describeDbError } from "@/lib/errors";
import { START_CATALOG, catalogCounts, type CatalogCompany } from "@/lib/startCatalog";

/** اسم موحَّد للمقارنة: همزات وتاء مربوطة وفراغات وأرقام عربية — مرآة inv_norm_name.
 *  الحروف بمهارب يونيكود: أ إ آ ← ا، ة ← ه، ى ← ي. */
const nameKey = (v: string): string =>
  (v ?? "")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/* ============================================================================
 * الكتلوج الجاهز — العيادة الجديدة تفعّل شركات السوق بأصنافها ومنتجاتها بضغطة.
 * التفعيل **دمجٌ لا استنساخ**: الشركة الموجودة يكمَّل ناقصها، والمنتج الموجود
 * بالاسم لا يُكرَّر. الباركودات تتعلّمها القطع من أول فاتورة شراء حقيقية.
 * ==========================================================================*/
export function StarterCatalogModal({ open, companies, sections, products, clinicId, onClose, onApplied }: {
  open: boolean;
  companies: Company[];
  sections: CompanySection[];
  products: Product[];
  clinicId?: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setExpanded(null);
    setProgress("");
  }, [open]);

  const existingCoKeys = useMemo(() => new Set(companies.map((c) => nameKey(c.name))), [companies]);

  const toggle = (name: string) => {
    playTap();
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  };

  const allPicked = picked.size === START_CATALOG.length;

  const apply = async () => {
    if (busy || picked.size === 0) return;
    setBusy(true);
    let coNew = 0, secNew = 0, prodNew = 0;
    try {
      for (const cat of START_CATALOG.filter((c) => picked.has(c.name))) {
        setProgress(cat.name);
        // ١) الشركة: الموجودة بنفس الاسم تُستكمل، وإلا تُنشأ
        let co = companies.find((c) => nameKey(c.name) === nameKey(cat.name));
        if (!co) {
          co = await repo.createCompany({ name: cat.name, note: cat.note, clinic_id: clinicId ?? null });
          coNew++;
        }
        // ٢) الأصناف داخلها
        const mySections = new Map(
          sections.filter((s) => s.company_id === co.id).map((s) => [nameKey(s.name), s]),
        );
        const sectionIds = new Map<string, string>();
        for (const sec of cat.sections) {
          const key = nameKey(sec.name);
          let row = mySections.get(key);
          if (!row) {
            row = await repo.createCompanySection({ company_id: co.id, name: sec.name, clinic_id: clinicId ?? null });
            mySections.set(key, row);
            secNew++;
          }
          sectionIds.set(sec.name, row.id);
        }
        // ٣) المنتجات: الاسم الموجود بالشركة لا يُكرَّر — دمجٌ لا استنساخ
        const haveNames = new Set(
          products.filter((p) => p.company_id === co!.id).map((p) => nameKey(p.name)),
        );
        for (const sec of cat.sections) {
          const fresh = sec.products.filter((pr) => !haveNames.has(nameKey(pr.name)));
          await Promise.all(fresh.map((pr) => repo.createProduct({
            clinic_id: clinicId ?? null,
            company_id: co!.id,
            section_id: sectionIds.get(sec.name) ?? null,
            barcode: null,
            name: pr.name,
            category: pr.category,
            subcategory: null,
            purchase_price: 0,
            sell_price: 0,
            stock: 0,
            min_stock: 0,
            expiry_date: null,
          })));
          for (const pr of fresh) haveNames.add(nameKey(pr.name));
          prodNew += fresh.length;
        }
      }
      playSuccess();
      toast.success(
        t("catalog.done", { n: prodNew, defaultValue: "انفعّل الكتلوج: {{n}} منتجاً جاهزاً بأماكنها" }),
        t("catalog.doneSub", { co: coNew, sec: secNew, defaultValue: "شركات جديدة: {{co}} · أصناف جديدة: {{sec}} — الباركودات تتعلّمها القطع من أول فاتورة شراء" }),
      );
      onApplied();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={t("catalog.title", "الكتلوج الجاهز")}>
      <div className="space-y-3">
        <p className="rounded-2xl bg-brand-50/60 p-3 text-sm text-ink-muted dark:bg-brand-500/10">
          {t("catalog.intro", "شركات السوق البيطري بأصنافها ومنتجاتها — اختر اللي تتعامل بيها وتنبني مرتّبةً بمخزونك. الأسعار تعبّيها أول فاتورة شراء، والباركود تتعلّمه كل قطعة من أول مسحة. الشركة الموجودة عندك ينكمّل ناقصها بلا تكرار.")}
        </p>

        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-subtle">
            {t("catalog.pickedCount", { n: picked.size, all: START_CATALOG.length, defaultValue: "مختار {{n}} من {{all}}" })}
          </p>
          <button
            type="button"
            data-catalogall
            onClick={() => { playTap(); setPicked(allPicked ? new Set() : new Set(START_CATALOG.map((c) => c.name))); }}
            className="text-xs font-bold text-brand-600 transition hover:text-brand-700"
          >
            {allPicked ? t("catalog.pickNone", "ألغِ الكل") : t("catalog.pickAll", "اختر الكل")}
          </button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pe-1">
          {START_CATALOG.map((cat) => (
            <CatalogRow
              key={cat.name}
              cat={cat}
              exists={existingCoKeys.has(nameKey(cat.name))}
              picked={picked.has(cat.name)}
              expanded={expanded === cat.name}
              onToggle={() => toggle(cat.name)}
              onExpand={() => { playTap(); setExpanded((x) => (x === cat.name ? null : cat.name)); }}
            />
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          data-catalogapply
          loading={busy}
          disabled={picked.size === 0}
          leftIcon={<Sparkles size={18} />}
          onClick={apply}
        >
          {busy && progress
            ? t("catalog.applying", { name: progress, defaultValue: "جاري بناء {{name}}…" })
            : t("catalog.apply", { n: picked.size, defaultValue: "فعّل المختار ({{n}})" })}
        </Button>
      </div>
    </Modal>
  );
}

function CatalogRow({ cat, exists, picked, expanded, onToggle, onExpand }: {
  cat: CatalogCompany; exists: boolean; picked: boolean; expanded: boolean;
  onToggle: () => void; onExpand: () => void;
}) {
  const { t } = useTranslation();
  const counts = catalogCounts(cat);
  return (
    <div className={cn("rounded-2xl border transition", picked ? "border-brand-300 bg-brand-50/40 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-line bg-surface-1")}>
      <div className="flex items-center gap-2.5 p-3">
        <button
          type="button"
          data-catalogpick
          onClick={onToggle}
          aria-pressed={picked}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition",
            picked ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-2 text-transparent hover:border-brand-300",
          )}
        >
          <Check size={14} />
        </button>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
            <Building2 size={13} className="shrink-0 text-ink-subtle" /> {cat.name}
            {exists && <span className="chip bg-success-100 text-2xs font-semibold text-success-700 dark:bg-success-500/20 dark:text-success-200">{t("catalog.merges", "موجودة — ينكمّل ناقصها")}</span>}
          </p>
          <p className="truncate text-xs text-ink-subtle">{cat.note}</p>
        </button>
        <div className="flex shrink-0 items-center gap-2 text-2xs text-ink-subtle">
          <span className="flex items-center gap-1"><FolderTree size={11} /> {counts.sections}</span>
          <span className="flex items-center gap-1"><Package size={11} /> {counts.products}</span>
          <button type="button" onClick={onExpand} aria-label={t("catalog.preview", "معاينة")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
            <ChevronDown size={15} className={cn("transition", expanded && "rotate-180")} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-line p-3" data-catalogpreview>
          {cat.sections.map((sec) => (
            <div key={sec.name}>
              <p className="mb-1 flex items-center gap-1 text-xs font-bold text-ink-muted"><FolderTree size={11} /> {sec.name}</p>
              <div className="flex flex-wrap gap-1">
                {sec.products.map((pr) => (
                  <span key={pr.name} className="chip bg-surface-2 text-2xs text-ink-muted">{pr.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
