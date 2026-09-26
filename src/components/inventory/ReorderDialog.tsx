import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Copy, FilePlus2, RotateCw } from "lucide-react";
import type { Company, Product } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Dialog, Skeleton, useToast } from "@/components/ui";
import { formatNum, formatQty, localISO } from "@/lib/utils";
import { getReorderLeadDays } from "@/lib/settings";
import { reorderPlan, orderText, type ReorderGroup, type ReorderItem } from "@/lib/reorder";
import { playSuccess, playTap } from "@/lib/sounds";

/**
 * اقتراحُ الطلبية (م٥) — «شنو نطلب من كلّ شركة؟» بدل الذاكرة.
 *
 * المعدّلُ من الخادم (`product_sales_rate`، آخر ٣٠ يوماً)، والحسابُ نقيٌّ (`reorder.ts`)،
 * والكمياتُ **اقتراحٌ يعدّله المستخدم**: صفرٌ يشيل المادة. ولكلّ شركةٍ فعلان: نصٌّ
 * للمندوب بلا أسعار، أو فاتورةُ شراءٍ معبّأة (تُحفظ حين تصل البضاعة لا الآن).
 *
 * وفشلُ الجلب يُقال بزرّ إعادة — «ما تحتاج تطلب» عن خطأٍ تُصدَّق فينفد الرفّ.
 */
const DAYS = 30;

export function ReorderDialog({ open, onClose, products, companies, onDraft }: {
  open: boolean; onClose: () => void; products: Product[]; companies: Company[];
  onDraft: (companyName: string, items: { product: Product; qty: number }[]) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [sold, setSold] = useState<Map<string, number> | "loading" | "error">("loading");
  const [qty, setQty] = useState<Record<string, string>>({});
  const lead = getReorderLeadDays();

  const load = useCallback(async () => {
    setSold("loading");
    try { setSold(await repo.productSalesRate(DAYS)); } catch { setSold("error"); }
  }, []);
  useEffect(() => { if (open) { setQty({}); void load(); } }, [open, load]);

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null | undefined) => (id ? m.get(id) : undefined);
  }, [companies]);
  const groups = useMemo<ReorderGroup[]>(
    () => (sold instanceof Map ? reorderPlan(products, sold, DAYS, lead, companyName, t("reorder.noCompany", "بدون شركة")) : []),
    [sold, products, lead, companyName, t]);

  const qtyOf = (it: ReorderItem) => {
    const v = qty[it.product.id];
    if (v === undefined) return it.suggest;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const copy = async (g: ReorderGroup) => {
    try {
      await navigator.clipboard.writeText(orderText(g, qtyOf, t, localISO()));
      playSuccess();
      toast.success(t("reorder.copied", { company: g.company, defaultValue: "انسخت طلبية «{{company}}» — الصقها بواتساب المندوب" }));
    } catch {
      toast.error(t("reorder.copyFail", "ما انسخت — المتصفّح منع الحافظة"));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={t("reorder.title", "اقتراح الطلبية")}
      description={t("reorder.sub", { days: DAYS, lead, defaultValue: "حسب مبيع آخر {{days}} يوم، ومهلة وصول {{lead}} أيام — المواد الي راح تخلص قبل ما توصل الطلبية" })}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("common.close", "سكّر")}</Button></div>}
    >
      {sold === "loading" ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : sold === "error" ? (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-bold text-ink">{t("reorder.failed", "ما كدرنا نجيب المبيعات — الاقتراح يحتاجها.")}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); void load(); }}><RotateCw size={14} /> {t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-subtle" data-reorder-empty>{t("reorder.none", "ماكو مادة راح تخلص قبل ما توصل طلبية — المخزن مكفّي.")}</p>
      ) : (
        <div className="space-y-4" data-reorder>
          {groups.map((g) => {
            const picked = g.items.filter((it) => qtyOf(it) > 0);
            return (
              <section key={g.company} className="rounded-2xl border border-line bg-surface-1 p-3" data-reorder-group>
                <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-extrabold text-ink">
                  <Building2 size={14} className="text-ink-subtle" /> {g.company}
                  <span className="text-2xs font-semibold text-ink-subtle">{t("reorder.count", { n: formatNum(g.items.length), defaultValue: "{{n}} مادة" })}</span>
                </h3>
                <ul className="divide-y divide-line/60">
                  {g.items.map((it) => (
                    <li key={it.product.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{it.product.name}</p>
                        <p className="text-2xs text-ink-subtle">
                          {t("reorder.line", { stock: formatQty(Number(it.product.stock) || 0), week: formatQty(Math.round(it.perDay * 7 * 10) / 10), defaultValue: "عندك {{stock}} · يطلع {{week}} بالأسبوع" })}
                        </p>
                      </div>
                      <label className="flex items-center gap-1 text-2xs text-ink-subtle">
                        {t("reorder.qty", "نطلب")}
                        <input type="number" inputMode="numeric" min={0} className="input h-9 w-20 text-center text-sm tabular-nums" data-reorder-qty
                          value={qty[it.product.id] ?? String(it.suggest)}
                          onChange={(e) => setQty((m) => ({ ...m, [it.product.id]: e.target.value }))} />
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<Copy size={14} />} disabled={!picked.length} data-reorder-copy
                    onClick={() => { playTap(); void copy(g); }}>
                    {t("reorder.copy", "انسخ الطلبية للمندوب")}
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<FilePlus2 size={14} />} disabled={!picked.length} data-reorder-draft
                    onClick={() => { playTap(); onDraft(g.companyId ? g.company : "", picked.map((it) => ({ product: it.product, qty: qtyOf(it) }))); }}>
                    {t("reorder.draft", "افتح فاتورة شراء بيها (لما توصل)")}
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
