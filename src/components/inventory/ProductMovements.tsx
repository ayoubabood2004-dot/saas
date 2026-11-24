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
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, PackagePlus, Pencil, RotateCcw, ShoppingBag } from "lucide-react";
import { Dialog, Button, Skeleton } from "@/components/ui";
import { LoadBoundary } from "@/components/LoadBoundary";
import { page } from "@/lib/lazyPage";
import { repo } from "@/lib/repo";
import { formatQty, formatDate } from "@/lib/utils";
import { invoiceNo } from "@/lib/invoiceNo";
import { ledgerPage, type LedgerRow } from "@/lib/stockSafetyApi";
import { usePermissions } from "@/hooks/usePermissions";
import type { Product, ProductMovement, ProductBatch, StockCount } from "@/types";

const KIND_ICON = {
  open: PackagePlus, purchase: ShoppingBag, purchase_edit: Pencil,
  sale: ArrowDownRight, return: RotateCcw,
  // مستهلكاتُ خدمة (0252): خروجٌ كالبيع ورجوعٌ كالإرجاع — نفسُ الأيقونتين.
  consume: ArrowDownRight, consume_return: RotateCcw, adjust: Pencil,
} as const;

/** سندُ التلف (0254) صفُّ جردٍ بـ`source = 'waste'`، و`posted` ما كتبه بالرصيد فعلاً (٣ منازل). */
type CountRow = StockCount & { source?: string | null; posted?: number | string | null };

/* ── دفترُ الرصيد (0287) ────────────────────────────────────────────────────
 * كلُّ حركةٍ مكتوبةٌ لحظةَ صارت بنوعها الحقيقيّ (الدالّةُ التي غيّرت الرصيد) ومَن سوّاها — لا مطابقةُ «فاتورة خلال ٤ ثوانٍ».
 * قاعدةٌ قبل 0287 ⇒ `ledgerPage` ترجع null والشاشةُ القديمة كما هي (`LegacyMovements`). وما قبل بداية الدفتر (نقطةُ البدء)
 * يُعرض من السجلّ القديم بطلبٍ صريح وبعلامة «تقديري»: الجديدُ لا يُخلط بالمخمَّن. */
const LEDGER_PAGE = 100;
/** نافذةُ product_movements (repo.productMovements: p_limit 200) — ما وراءها لا يصل هذه الشاشة. */
const LEGACY_WINDOW = 200;
const LEDGER_ICON: Partial<Record<LedgerRow["kind"], typeof Pencil>> = {
  open: PackagePlus, purchase: ShoppingBag, purchase_edit: Pencil, lot: PackagePlus, restore: PackagePlus,
  sale: ArrowDownRight, consume: ArrowDownRight, waste: ArrowDownRight, delete: ArrowDownRight, farm: ArrowDownRight,
  return: RotateCcw, refund: RotateCcw, consume_return: RotateCcw, invoice_delete: RotateCcw,
};

export function ProductMovementsDialog({ product, open, onClose }: {
  product: Product; open: boolean; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  /* «ما قبل السجل» من سجلّ التدقيق، وسجلُّ التدقيق للمدير وحده (0018) — الطبيبُ يقرأ الدفترَ (إدارةُ المخزون) لا ما قبله، فكان يرى
   * «ماكو حركات مسجّلة» عن تاريخٍ موجود (مراجعة ٢٢/١١). */
  const { role } = usePermissions();
  const canOld = role === "manager";
  /** undefined = يُسأل الدفتر؛ null = لا دفترَ بهذه القاعدة (الشاشةُ القديمة)؛ مصفوفة = صفوفُه حتى الآن. */
  const [ledger, setLedger] = useState<LedgerRow[] | null | undefined>(undefined);
  const [lgErr, setLgErr] = useState<{ forbidden: boolean; msg: string } | null>(null);
  const [lgMore, setLgMore] = useState(false);
  const [lgBusy, setLgBusy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  /** جيلُ السؤال: جوابٌ وصل بعد إغلاقٍ أو إعادة فتحٍ أو سؤالٍ أحدث لا يُرسم (قائمةُ مادّةٍ تحت عنوان غيرها كذبة). */
  const lgSeq = useRef(0);
  useEffect(() => () => { lgSeq.current++; }, []);
  const loadLedger = (before: number | null) => {
    const my = ++lgSeq.current;
    setLgBusy(true);
    ledgerPage(product.id, before, LEDGER_PAGE)
      .then((r) => {
        if (my !== lgSeq.current) return;
        if (r === null) { setLedger(null); return; }
        setLedger((cur) => (before == null || !Array.isArray(cur) ? r : [...cur, ...r]));
        setLgMore(r.length === LEDGER_PAGE);
      })
      .catch((e) => { if (my === lgSeq.current) setLgErr({ forbidden: (e as { code?: string } | null)?.code === "stock_ledger_forbidden", msg: e instanceof Error ? e.message : String(e) }); })
      .finally(() => { if (my === lgSeq.current) setLgBusy(false); });
  };
  useEffect(() => {
    if (!open) return;
    setLedger(undefined); setLgErr(null); setLgMore(false); setShowLegacy(false);
    loadLedger(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product.id]);

  const kindLabel = (r: LedgerRow): string => {
    switch (r.kind) {
      case "checkpoint": return t("pkg.lgCheckpoint", { n: formatQty(Number(r.qty_after ?? 0)) });
      case "open": return t("mv.open", "أول إدخال للمادة");
      case "purchase": return t("mv.purchase", "فاتورة شراء");
      case "purchase_edit": return t("mv.purchaseEdit", "تعديل فاتورة شراء");
      case "sale": return t("mv.sale", "بيع");
      case "return": return t("mv.return", "إرجاع");
      case "consume": return t("pos.cat.consumables", "مستهلكات");
      case "consume_return": return `${t("pos.cat.consumables", "مستهلكات")} — ${t("mv.return", "إرجاع")}`;
      case "manual": return t("pkg.lgManual");
      case "delete": return t("pkg.lgDelete");
      case "count": return t("pkg.lgCount");
      case "waste": return t("pkg.lgWaste");
      case "merge": return t("pkg.lgMerge");
      case "restore": return t("pkg.lgRestore");
      case "pool": return t("pkg.lgPool");
      case "farm": return t("pkg.lgFarm");
      case "lot": return t("pkg.lgLot");
      case "refund": return t("pkg.lgRefund");
      case "invoice_delete": return t("pkg.lgInvDelete");
      case "invoice_edit": return t("pkg.lgInvEdit");
      default: return t("pkg.lgOther", { fn: r.source });
    }
  };
  const who = (r: LedgerRow): string =>
    r.actor_kind === "staff" ? r.actor_name : r.actor_kind === "owner" ? t("pkg.lgOwner") : r.actor_kind === "manager" ? t("pkg.lgManager") : "";
  const refText = (r: LedgerRow): string =>
    r.ref_id && r.ref_kind === "invoice" ? t("pkg.lgInvoice", { no: invoiceNo(r.ref_id) }) : "";

  if (ledger === null) return <LegacyMovements product={product} open={open} onClose={onClose} />;
  const start = Array.isArray(ledger) && !lgMore ? ledger[ledger.length - 1] : null;

  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={t("mv.title", "حركات: {{name}}", { name: product.name })}
      description={t("mv.now", "الرصيد اليوم {{n}}", { n: formatQty(Number(product.stock ?? 0)) })}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("common.close", "سكّر")}</Button></div>}
    >
      {lgErr ? (
        <div className="rounded-2xl border border-danger-300 bg-danger-50/60 p-4 text-sm dark:border-danger-500/30 dark:bg-danger-500/10" data-ledger-error={lgErr.forbidden ? "forbidden" : "failed"}>
          <p className="font-bold text-danger-800 dark:text-danger-200">{lgErr.forbidden ? t("pkg.lgForbidden") : t("mv.failed", "ما كدرنا نجيب الحركات")}</p>
          {!lgErr.forbidden && <p className="mt-1 text-2xs text-ink-subtle">{lgErr.msg}</p>}
          {!lgErr.forbidden && (
            <Button size="sm" className="mt-3" data-ledger-retry onClick={() => { setLgErr(null); setLedger(undefined); loadLedger(null); }}>{t("common.retry", "أعد المحاولة")}</Button>
          )}
        </div>
      ) : ledger === undefined ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <ul className="space-y-1.5" data-ledger>
          <li className="px-3 pb-1 text-2xs text-ink-subtle">{t("pkg.lgExact")}</li>
          {/* مادّةٌ وُلدت بعد بداية الدفتر برصيد صفر ولم يتحرّك: لا صفَّ أصلاً — يُقال، لا قائمةٌ فارغةٌ تحت عنوانها. */}
          {ledger.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted" data-ledger-empty>{t("pkg.lgEmpty")}</li>}
          {ledger.map((r) => {
            const Icon = LEDGER_ICON[r.kind] ?? Pencil;
            const by = who(r);
            const ref = refText(r);
            return (
              <li key={r.id} data-ledger-kind={r.kind} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-1 px-3 py-2">
                <Icon size={15} className="shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{kindLabel(r)}</p>
                  <p className="text-2xs text-ink-subtle">
                    {formatDate(r.at, i18n.language, true)}{by ? ` · ${by}` : ""}{ref ? ` · ${ref}` : ""}
                  </p>
                </div>
                {r.kind !== "checkpoint" && (
                  <div className="text-end tabular-nums">
                    <p className={`text-sm font-extrabold ${r.delta > 0 ? "text-success-700 dark:text-success-300" : r.delta < 0 ? "text-danger-700 dark:text-danger-300" : "text-ink-muted"}`}>
                      {r.delta > 0 ? "+" : ""}{formatQty(r.delta)}
                    </p>
                    <p className="text-2xs text-ink-subtle">
                      {r.qty_before == null
                        ? t("mv.toOnly", "صار {{to}}", { to: formatQty(Number(r.qty_after ?? 0)) })
                        : t("mv.fromTo", "{{from}} ← {{to}}", { from: formatQty(Number(r.qty_before)), to: formatQty(Number(r.qty_after ?? 0)) })}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
          {lgMore && (
            <li className="flex justify-center pt-1">
              <Button size="sm" variant="secondary" loading={lgBusy} data-ledger-older
                onClick={() => loadLedger(ledger.length ? ledger[ledger.length - 1].id : null)}>{t("pkg.lgOlder")}</Button>
            </li>
          )}
          {/* ما قبل بداية الدفتر: السجلُّ القديم بطلبٍ صريح، وكلُّ صفٍّ فيه «تقديري» — لا يُخلط بالمسجَّل. */}
          {!lgMore && start && (
            !canOld
              ? <li className="px-3 pt-1 text-2xs text-ink-subtle" data-ledger-legacy-manager>{t("pkg.lgLegacyManager")}</li>
              : showLegacy
              ? <li><LegacyMovementsList product={product} before={start.at} /></li>
              : <li className="flex justify-center pt-1"><Button size="sm" variant="ghost" data-ledger-legacy onClick={() => setShowLegacy(true)}>{t("pkg.lgLegacy")}</Button></li>
          )}
        </ul>
      )}
    </Dialog>
  );
}

/** الحركاتُ القديمة (0207/0252: مطابقةٌ زمنية بالفواتير) — لقاعدةٍ قبل 0287 كاملةً، أو لما قبل بداية الدفتر. */
function LegacyMovements({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={t("mv.title", "حركات: {{name}}", { name: product.name })}
      description={t("mv.now", "الرصيد اليوم {{n}}", { n: formatQty(Number(product.stock ?? 0)) })}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("common.close", "سكّر")}</Button></div>}
    >
      <LegacyMovementsList product={product} before={null} />
    </Dialog>
  );
}

function LegacyMovementsList({ product, before }: { product: Product; before: string | null }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ProductMovement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** الجلبُ بلغ نافذتَه (٢٠٠ حركة) وطُلب ما قبل الدفتر: الأقدمُ منها لا يصل — يُقال، لا «ماكو حركات» (مادّةٌ تُباع عشراً باليوم
   *  تملأ النافذةَ بما بعد بداية الدفتر خلال أسابيع). */
  const [cut, setCut] = useState(false);
  /** تاريخُ الوجبة لكلّ فاتورة شراء (0214) — تفصيلٌ ثانويّ: فشلُه لا يحجب الحركات، يغيب التاريخُ وحدَه. */
  const [batchOf, setBatchOf] = useState<Map<string, string>>(new Map());
  /** سطورُ الجرد المعتمدة (0216) — «تعديلٌ» بنفس لحظة الموافقة يُسمّى بسببه. ثانويٌّ كالوجبة. */
  const [counts, setCounts] = useState<StockCount[]>([]);

  /* ما قبل بداية الدفتر وحده (`before`) حين يُطلب من شاشة الدفتر — والقائمةُ كلُّها لقاعدةٍ بلا دفتر. */
  const older = (r: ProductMovement[]) => (before ? r.filter((m) => new Date(m.at).getTime() < new Date(before).getTime()) : r);
  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null); setCut(false);
    repo.productMovements(product.id)
      .then((r) => { if (alive) { setCut(!!before && r.length >= LEGACY_WINDOW); setRows(older(r)); } })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, before]);

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
    <div data-ledger-legacy-list={before ? "older" : "all"}>
      {before && <p className="px-3 pb-1 pt-2 text-2xs font-semibold text-ink-subtle">{t("pkg.lgLegacyNote")}</p>}
      {err ? (
        <div className="rounded-2xl border border-danger-300 bg-danger-50/60 p-4 text-sm dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="font-bold text-danger-800 dark:text-danger-200">{t("mv.failed", "ما كدرنا نجيب الحركات")}</p>
          <p className="mt-1 text-2xs text-ink-subtle">{err}</p>
          <Button size="sm" className="mt-3" onClick={() => { setErr(null); setRows(null); repo.productMovements(product.id).then((r) => { setCut(!!before && r.length >= LEGACY_WINDOW); setRows(older(r)); }).catch((e) => setErr(String(e))); }}>
            {t("common.retry", "أعد المحاولة")}
          </Button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : rows.length === 0 ? (
        cut
          ? <p className="py-6 text-center text-sm text-ink-subtle" data-ledger-legacy-cut>{t("pkg.lgLegacyCut")}</p>
          : <p className="py-6 text-center text-sm text-ink-subtle">{t("mv.none", "ماكو حركات مسجّلة لهذي المادة")}</p>
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
    </div>
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
