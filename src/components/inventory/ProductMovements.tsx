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
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, PackagePlus, Pencil, RotateCcw, ShoppingBag } from "lucide-react";
import { Dialog, Button, Skeleton } from "@/components/ui";
import { LoadBoundary } from "@/components/LoadBoundary";
import { page } from "@/lib/lazyPage";
import { repo } from "@/lib/repo";
import { formatQty, formatDate } from "@/lib/utils";
import type { Product, ProductMovement, ProductBatch, StockCount } from "@/types";

const KIND_ICON = {
  open: PackagePlus, purchase: ShoppingBag, purchase_edit: Pencil,
  sale: ArrowDownRight, return: RotateCcw,
  // مستهلكاتُ خدمة (0252): خروجٌ كالبيع ورجوعٌ كالإرجاع — نفسُ الأيقونتين.
  consume: ArrowDownRight, consume_return: RotateCcw, adjust: Pencil,
} as const;

/** سندُ التلف (0254) صفُّ جردٍ بـ`source = 'waste'`، و`posted` ما كتبه بالرصيد فعلاً (٣ منازل). */
type CountRow = StockCount & { source?: string | null; posted?: number | string | null };

export function ProductMovementsDialog({ product, open, onClose }: {
  product: Product; open: boolean; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ProductMovement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** تاريخُ الوجبة لكلّ فاتورة شراء (0214) — تفصيلٌ ثانويّ: فشلُه لا يحجب الحركات، يغيب التاريخُ وحدَه. */
  const [batchOf, setBatchOf] = useState<Map<string, string>>(new Map());
  /** سطورُ الجرد المعتمدة (0216) — «تعديلٌ» بنفس لحظة الموافقة يُسمّى بسببه. ثانويٌّ كالوجبة. */
  const [counts, setCounts] = useState<StockCount[]>([]);

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
    setCounts([]);
    repo.listProductCounts(product.id)
      .then((cs) => { if (alive) setCounts(cs); })
      .catch(() => { /* ثانويّ: التعديلُ يبقى «يدوي أو جرد» بلا سببه */ });
    return () => { alive = false; };
  }, [open, product.id]);

  const label = (m: ProductMovement) => {
    if (m.kind === "open") return t("mv.open", "أول إدخال للمادة");
    if (m.kind === "purchase") return t("mv.purchase", "فاتورة شراء");
    if (m.kind === "purchase_edit") return t("mv.purchaseEdit", "تعديل فاتورة شراء");
    if (m.kind === "sale") return t("mv.sale", "بيع");
    if (m.kind === "return") return t("mv.return", "إرجاع");
    // مستهلكاتُ خدمةٍ بِيعت أو رجعت (0252) — والمرجعُ الفاتورةُ كالبيع.
    if (m.kind === "consume") return t("pos.cat.consumables", "مستهلكات");
    if (m.kind === "consume_return") return `${t("pos.cat.consumables", "مستهلكات")} — ${t("mv.return", "إرجاع")}`;
    // الموافقةُ تكتب الرصيدَ وسطرَ الجرد بمعاملةٍ واحدة: نفسُ اللحظة ونفسُ الفرق. وسندُ التلف (0254) فرقُه
    // المسجَّل −d بتسع منازل ورصيدُه تغيّر بما رحّله (posted، ٣ منازل) — فيُطابَق بهذا لا بذاك، وإلا صار
    // «١٠ مل» من مكعّب ٢٠ لتراً «تعديل يدوي». ويُسمّى بسببه (mv.cr.damaged / expired) ومن وافق كالجرد.
    const c = (counts as CountRow[]).find((x) => x.decided_at && Math.abs(new Date(x.decided_at).getTime() - new Date(m.at).getTime()) < 4000
      && Math.abs((x.source === "waste" ? -(Number(x.posted) || 0) : (x.applied_delta ?? 0)) - m.delta) < 1e-9);
    if (c?.reason) return t("mv.count", { reason: t(`mv.cr.${c.reason}`), who: c.decided_by_name || "—", defaultValue: "جرد — {{reason}} (وافق {{who}})" });
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

/* ── متوسّطُ الكلفة بنموذج المادة (0255) ─────────────────────────────────────
 * قطعةٌ كسولة بنطاقها المملوك avgc (hot-paths.json): النصفُ الباردُ ممتلئ، فالنصوصُ تصل مع النموذج
 * وحدَه. `lazy()` يخبّئ الوعدَ المرفوض، فـ«أعد المحاولة» (LoadBoundary، نمطُ 0241) تصنع قطعةً جديدة،
 * وفشلُ تحميلها يبقى سطراً بمكانه لا يُسقط النموذج. والحلقةُ هنا بجانب «حركات» المادّة لا بـInventory.tsx:
 * المسارُ يرسم مكوّناً واحداً مستورداً — وفحصُ النموذج المرسوم (inventory-cas-test ح) يبدّل كلَّ مكوّنٍ
 * مستورد ببديلٍ فارغ ويبدّل page() بلا شيء، فقطعةٌ كسولةٌ بنصّ النموذج نفسه تُسقط رسمَه هناك (مقيس: ٢٨
 * فحصاً من ١١٧ سقطت بـ«Element type is invalid»). والحلقةُ نفسُها مفحوصةٌ بـavg-cost-note-test ج. */
const loadAvgCostNote = () => page(() => import("@/components/inventory/AvgCostNote"), ["avgc"]);
let AvgCostNoteLazy = loadAvgCostNote();

/** يُرسم بجانب سعر الشراء لمادّةٍ قائمة ولمن يرى الكلفة (النموذجُ يحرسه، والقطعةُ تحرس نفسَها ثانيةً).
 *  `onChanged`: بعد تصحيح المتوسط — القائمةُ تُقرأ من جديد. */
export function AvgCostSlot({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const [, setLazyTick] = useState(0);
  return (
    <LoadBoundary scope="avg-cost" onRetry={() => { AvgCostNoteLazy = loadAvgCostNote(); setLazyTick((n) => n + 1); }}>
      <Suspense fallback={null}>
        <AvgCostNoteLazy key={product.id} product={product} onChanged={onChanged} />
      </Suspense>
    </LoadBoundary>
  );
}
