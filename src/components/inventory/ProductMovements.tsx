/* ============================================================================
 * حركاتُ المادة — «ليش رصيدها هيچي؟» بجوابٍ واحد.
 *
 * العياداتُ لم تسأل «شنو صار بالفاتورة»، سألت **«وين راحت البضاعة؟»** — وهو
 * سؤالٌ عن المادة. والأرقامُ هنا من سجلّ التدقيق كما سجّلها المحفّظ (كان ← صار)
 * لا محسوبةً بالمتصفّح، و«لماذا» من الخادم (0207) لا تخميناً.
 *
 * **وما لا تدّعيه هذه الشاشة**: السجلُّ يُكنس (٩٠ يوماً للضجيج و٣٦٥ للمخزون)،
 * فما قبل ذلك لا سجلَّ له — وتُقال صراحةً بذيل القائمة بدل أن توحي بالاكتمال.
 * ========================================================================= */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, PackagePlus, Pencil, RotateCcw, ShoppingBag } from "lucide-react";
import { Dialog, Button, Skeleton } from "@/components/ui";
import { repo } from "@/lib/repo";
import { formatQty, formatDate } from "@/lib/utils";
import type { Product, ProductMovement, ProductBatch } from "@/types";

const KIND_ICON = {
  open: PackagePlus, purchase: ShoppingBag, purchase_edit: Pencil,
  sale: ArrowDownRight, return: RotateCcw, adjust: Pencil,
} as const;

export function ProductMovementsDialog({ product, open, onClose }: {
  product: Product; open: boolean; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ProductMovement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** تاريخُ الوجبة لكلّ فاتورة شراء (0214) — تفصيلٌ ثانويّ: فشلُه لا يحجب الحركات، يغيب التاريخُ وحدَه. */
  const [batchOf, setBatchOf] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null); setErr(null);
    repo.productMovements(product.id)
      .then((r) => { if (alive) setRows(r); })
      /* **الفشلُ يُقال ولا يصير «ماكو حركات».** قائمةٌ فارغةٌ عن خطأٍ تقلب
       * المعنى: «ما صار شي» بدل «ما وصلنا» — والصمتُ يُصدَّق. */
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    setBatchOf(new Map());
    repo.productBatches(product.id)
      .then((bs: ProductBatch[]) => { if (alive) setBatchOf(new Map(bs.filter((b) => b.expiry_date).map((b) => [b.purchase_id, String(b.expiry_date).slice(0, 10)]))); })
      .catch(() => { /* ثانويّ: الحركاتُ تُعرض بلا تاريخ الوجبة */ });
    return () => { alive = false; };
  }, [open, product.id]);

  const label = (m: ProductMovement) => {
    if (m.kind === "open") return t("mv.open", "أول إدخال للمادة");
    if (m.kind === "purchase") return t("mv.purchase", "فاتورة شراء");
    if (m.kind === "purchase_edit") return t("mv.purchaseEdit", "تعديل فاتورة شراء");
    if (m.kind === "sale") return t("mv.sale", "بيع");
    if (m.kind === "return") return t("mv.return", "إرجاع");
    return t("mv.adjust", "تعديل يدوي أو جرد");
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={t("mv.title", "حركات: {{name}}", { name: product.name })}
      description={t("mv.now", "الرصيد اليوم {{n}}", { n: formatQty(Number(product.stock ?? 0)) })}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("common.close", "سكّر")}</Button></div>}
    >
      {err ? (
        <div className="rounded-2xl border border-danger-300 bg-danger-50/60 p-4 text-sm dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="font-bold text-danger-800 dark:text-danger-200">{t("mv.failed", "ما كدرنا نجيب الحركات")}</p>
          <p className="mt-1 text-2xs text-ink-subtle">{err}</p>
          <Button size="sm" className="mt-3" onClick={() => { setErr(null); setRows(null); repo.productMovements(product.id).then(setRows).catch((e) => setErr(String(e))); }}>
            {t("common.retry", "أعد المحاولة")}
          </Button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-subtle">{t("mv.none", "ماكو حركات مسجّلة لهذي المادة")}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((m, i) => {
            const Icon = KIND_ICON[m.kind] ?? Pencil;
            const up = m.delta > 0;
            return (
              <li key={`${m.at}-${i}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 px-3 py-2">
                <Icon size={15} className="shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{label(m)}</p>
                  <p className="text-2xs text-ink-subtle">
                    {formatDate(m.at, i18n.language, true)}
                    {m.actor_name ? ` · ${m.actor_name}` : ""}
                    {(m.kind === "purchase" || m.kind === "purchase_edit") && m.ref_id && batchOf.get(m.ref_id)
                      ? ` · ${t("mv.batchExpiry", { d: batchOf.get(m.ref_id)!.replace(/-/g, "/"), defaultValue: "انتهاء الوجبة {{d}}" })}`
                      : ""}
                  </p>
                </div>
                <div className="text-end tabular-nums">
                  <p className={`text-sm font-extrabold ${up ? "text-success-700 dark:text-success-300" : m.delta < 0 ? "text-danger-700 dark:text-danger-300" : "text-ink-muted"}`}>
                    {m.delta > 0 ? "+" : ""}{formatQty(m.delta)}
                  </p>
                  <p className="text-2xs text-ink-subtle">
                    {m.from_qty == null
                      ? t("mv.toOnly", "صار {{to}}", { to: formatQty(Number(m.to_qty ?? 0)) })
                      : t("mv.fromTo", "{{from}} ← {{to}}", { from: formatQty(Number(m.from_qty)), to: formatQty(Number(m.to_qty ?? 0)) })}
                  </p>
                </div>
              </li>
            );
          })}
          {/* حدُّ السجلّ يُقال، فلا تُقرأ القائمةُ على أنها كلُّ التاريخ. */}
          <li className="px-3 pt-2 text-2xs text-ink-subtle">{t("mv.retention", "السجل يحتفظ بحركات المخزون سنة — الأقدم ما عاد موجود.")}</li>
        </ul>
      )}
    </Dialog>
  );
}
