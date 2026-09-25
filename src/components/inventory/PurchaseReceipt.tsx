import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, PackageMinus, Printer, RotateCw, Search, Sparkles, TrendingUp } from "lucide-react";
import type { Company, PurchaseEffect } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Skeleton } from "@/components/ui";
import { money, formatNum } from "@/lib/utils";
import { describeEffects, type ReceiptChange } from "@/lib/purchaseEffects";

/**
 * كشفُ الشراء — «انحفظت الفاتورة، وهذا الي صار بالمخزن» (م٢، 0211).
 *
 * كان الحفظُ يطوي النافذةَ بصوتٍ وحده، والخادمُ يطابق بالاسم ويكتب فوق سعر الرفّ
 * وتاريخ انتهاء كلِّ العلب ولا يقول. هنا يُقال — من صفوف `purchase_effects` التي
 * كتبها الخادمُ نفسُه، لا من لقطة المتصفّح.
 *
 * وضعان: `fresh` بعد الحفظ مباشرة (فشلُ الجلب يُقال **بنبرةِ معلومةٍ لا خطأ** —
 * «فشل» عن حفظٍ ناجح يخلّيه يعيد الإدخال فتصير فاتورتين)، و`view` من سجلّ الشراء.
 */
export function PurchaseReceipt({ purchaseId, companyId, companyName: purchaseCompany, companies, mode, onClose, onPrint }: {
  purchaseId: string;
  companyId?: string | null;
  /** اسمُ شركة الفاتورة — الشراءُ لا يسند مادّةً إلا لشركة فاتورته
   *  (`coalesce(company_id, v_company)`)، فالاسمُ معروفٌ بلا قائمة. */
  companyName?: string | null;
  companies?: Company[];
  mode: "fresh" | "view";
  onClose?: () => void;
  onPrint?: () => void;
}) {
  const { t } = useTranslation();
  const [effects, setEffects] = useState<PurchaseEffect[] | "loading" | "error">("loading");

  const load = useCallback(async () => {
    setEffects("loading");
    try { setEffects(await repo.listPurchaseEffects(purchaseId)); }
    catch { setEffects("error"); }
  }, [purchaseId]);
  useEffect(() => { void load(); }, [load]);

  const receipt = useMemo(() => (Array.isArray(effects) ? describeEffects(effects, companyId) : null), [effects, companyId]);
  const companyName = (id: unknown) =>
    (id && id === companyId && purchaseCompany) || companies?.find((c) => c.id === id)?.name || t("purchase.receipt.someCompany", "شركة الفاتورة");
  const n = (v: number) => formatNum(v);
  const dateOf = (v: unknown) => (v ? String(v).slice(0, 10).replace(/-/g, "/") : "—");

  const changeLine = (c: ReceiptChange): string => {
    const base = { name: c.name };
    switch (c.field) {
      case "sell_price":
        return t("purchase.receipt.f.sell_price", { ...base, from: money(Number(c.from) || 0), to: money(Number(c.to) || 0), defaultValue: "{{name}} — سعر البيع: كان {{from}} صار {{to}}." });
      case "purchase_price":
        return t("purchase.receipt.f.purchase_price", { ...base, from: money(Number(c.from) || 0), to: money(Number(c.to) || 0), defaultValue: "{{name}} — سعر الشراء: كان {{from}} صار {{to}}." });
      case "expiry_date":
        return c.from
          ? t("purchase.receipt.f.expiry_date", { ...base, from: dateOf(c.from), to: dateOf(c.to), defaultValue: "{{name}} — تاريخ الانتهاء تبدّل: كان {{from}} صار {{to}}. ودير بالك: هذا يشمل كل العلب الي بالرفّ، مو الوجبة الجديدة بس." })
          : t("purchase.receipt.f.expiry_set", { ...base, to: dateOf(c.to), defaultValue: "{{name}} — صار إلها تاريخ انتهاء {{to}} — ويشمل كل العلب الي بالرفّ." });
      case "company_id":
        return t("purchase.receipt.f.company_id", { ...base, to: companyName(c.to), defaultValue: "{{name}} — صارت تابعة لشركة «{{to}}» من هسّه وطول." });
      case "barcode":
        return t("purchase.receipt.f.barcode", { ...base, to: String(c.to ?? ""), defaultValue: "{{name}} — تعلّم الباركود {{to}}." });
      case "category":
        return t("purchase.receipt.f.category", { ...base, from: String(c.from ?? "—"), to: String(c.to ?? "—"), defaultValue: "{{name}} — التصنيف: كان {{from}} صار {{to}}." });
      case "min_stock":
        return t("purchase.receipt.f.min_stock", { ...base, from: n(Number(c.from) || 0), to: n(Number(c.to) || 0), defaultValue: "{{name}} — حدّ التنبيه: كان {{from}} صار {{to}}." });
    }
  };

  const closeBtn = onClose && (
    <Button onClick={onClose} autoFocus>{t("purchase.receipt.ok", "تمام، سكّر")}</Button>
  );
  const printBtn = onPrint && (
    <Button variant="secondary" onClick={onPrint}><Printer size={15} /> {t("purchase.receipt.print", "اطبع الفاتورة")}</Button>
  );

  if (effects === "loading") {
    return <div className="space-y-2" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>;
  }

  if (effects === "error" || !receipt) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-surface-2 p-3.5 text-sm text-ink">
          {mode === "fresh"
            ? t("purchase.receipt.failFresh", "الفاتورة انحفظت — بس ما كدرنا نجيب كشف الي صار بالمخزن.")
            : t("purchase.receipt.failView", "ما وصلنا للخادم.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()}><RotateCw size={15} /> {t("purchase.receipt.retry", "جرّب مرّة ثانية")}</Button>
          {mode === "fresh" && onClose && <Button variant="ghost" onClick={onClose}>{t("purchase.receipt.openLater", "افتحها من فواتير الشراء")}</Button>}
        </div>
      </div>
    );
  }

  if (receipt.op === null) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-surface-2 p-3.5 text-sm text-ink-muted">
          {t("purchase.receipt.none", "ماكو كشف لهاي الفاتورة — انحفظت قبل ما نبدأ نسجّل الي يصير بالمخزن.")}
        </p>
        {(closeBtn || printBtn) && <div className="flex flex-wrap gap-2">{closeBtn}{printBtn}</div>}
      </div>
    );
  }

  const head = mode === "view"
    ? t("purchase.receipt.titleView", "شنو صار بالمخزن من هاي الفاتورة")
    : receipt.op === "update"
      ? t("purchase.receipt.titleEdit", "انحفظ التعديل — وهذا الي صار بالمخزن")
      : t("purchase.receipt.title", "انحفظت الفاتورة — وهذا الي صار بالمخزن");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-success-600 dark:text-success-300" />
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-ink">{head}</h3>
          {receipt.edits > 0 && (
            <p className="mt-0.5 text-2xs text-ink-subtle">
              {t("purchase.receipt.edits", { n: receipt.edits, defaultValue: "عُدّلت {{n}} مرة — هذا كشف آخر تعديل." })}
            </p>
          )}
        </div>
      </div>

      {receipt.clean ? (
        <p className="rounded-2xl bg-success-50 p-3.5 text-sm font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
          {receipt.op !== "update"
            ? t("purchase.receipt.clean", { n: receipt.lines, defaultValue: "تمام — نزّلنا {{n}} مواد على المخزن، وماكو شي ثاني تغيّر." })
            : receipt.lines > 0
              ? t("purchase.receipt.cleanEdit", { n: receipt.lines, defaultValue: "تمام — انحفظ التعديل: تغيّر رصيد {{n}} مواد، وماكو شي ثاني تغيّر." })
              : t("purchase.receipt.cleanEditNone", "تمام — انحفظ التعديل، وما تغيّر شي بالمخزن.")}
        </p>
      ) : (
        <>
          {receipt.changed.length > 0 && (
            <Section tone="warn" icon={<AlertTriangle size={15} />}
              title={t("purchase.receipt.changedHead", "وهذي تبدّلت بعد — انتبه")}>
              {receipt.changed.map((c, i) => <li key={`${c.productId}-${c.field}-${i}`}>{changeLine(c)}</li>)}
            </Section>
          )}
          {receipt.notes.length > 0 && (
            <Section tone="warn" icon={<Search size={15} />} title={t("purchase.receipt.notesHead", "شلون لكينا المواد")}>
              {receipt.notes.map((x, i) => (
                <li key={`${x.productId}-${x.kind}-${i}`}>
                  {x.kind === "by_name"
                    ? t("purchase.receipt.byName", { name: x.name, defaultValue: "{{name}}: لكيناها بالاسم، مو بالباركود. إذا هاي مو نفس المادة، سكّر وعدّل الفاتورة." })
                    : t("purchase.receipt.otherCompany", { name: x.name, defaultValue: "{{name}}: هاي المادة مسجّلة على شركة ثانية — نزلت بضاعة هاي الفاتورة عليها." })}
                </li>
              ))}
            </Section>
          )}
          {receipt.added.length > 0 && (
            <Section tone="plain" icon={<TrendingUp size={15} />}
              title={receipt.op === "update"
                ? t("purchase.receipt.stockHead", { n: receipt.added.length, defaultValue: "تغيّر رصيد ({{n}} مواد)" })
                : t("purchase.receipt.addedHead", { n: receipt.added.length, defaultValue: "زادت بضاعة ({{n}} مواد)" })}>
              {receipt.added.map((a, i) => (
                <li key={`${a.productId}-${i}`}>
                  {/* بالتعديل الكميةُ كميةُ السطر لا الفرق — فيُقال الرصيدُ من ← إلى وحدَه. */}
                  {receipt.op === "update"
                    ? t("purchase.receipt.stockLine", { name: a.name, from: n(a.from), to: n(a.to), defaultValue: "{{name}} — الرصيد كان {{from}}، صار {{to}}." })
                    : t("purchase.receipt.addedLine", { name: a.name, qty: n(a.qty), from: n(a.from), to: n(a.to), defaultValue: "{{name}} — زدنا {{qty}}. كان عندك {{from}}، صار {{to}}." })}
                </li>
              ))}
            </Section>
          )}
          {receipt.created.length > 0 && (
            <Section tone="plain" icon={<Sparkles size={15} />}
              title={t("purchase.receipt.createdHead", { n: receipt.created.length, defaultValue: "مواد جديدة انخلقت ({{n}})" })}>
              {receipt.created.map((a, i) => (
                <li key={`${a.productId}-${i}`}>
                  {t("purchase.receipt.createdLine", { name: a.name, qty: n(a.qty), defaultValue: "{{name}} — أول مرة تنزل بالنظام ({{qty}})." })}
                </li>
              ))}
            </Section>
          )}
          {receipt.removed.length > 0 && (
            <Section tone="plain" icon={<PackageMinus size={15} />}
              title={t("purchase.receipt.removedHead", { n: receipt.removed.length, defaultValue: "شلناها من الفاتورة ({{n}})" })}>
              {receipt.removed.map((a, i) => (
                <li key={`${a.productId}-${i}`}>
                  {t("purchase.receipt.removedLine", { name: a.name, qty: n(a.qty), from: n(a.from), to: n(a.to), defaultValue: "{{name}} — شلناها من الفاتورة (كانت {{qty}}). الرصيد كان {{from}}، صار {{to}}." })}
                </li>
              ))}
            </Section>
          )}
        </>
      )}

      {(closeBtn || printBtn) && <div className="flex flex-wrap gap-2 pt-1">{closeBtn}{printBtn}</div>}
    </div>
  );
}

function Section({ tone, icon, title, children }: { tone: "warn" | "plain"; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={tone === "warn"
      ? "rounded-2xl border border-warn-200 bg-warn-50 p-3.5 dark:border-warn-500/30 dark:bg-warn-500/10"
      : "rounded-2xl border border-line bg-surface-2/60 p-3.5"}>
      <h4 className={tone === "warn"
        ? "mb-1.5 flex items-center gap-1.5 text-sm font-extrabold text-warn-700 dark:text-warn-300"
        : "mb-1.5 flex items-center gap-1.5 text-sm font-extrabold text-ink"}>
        {icon} {title}
      </h4>
      <ul className="list-disc space-y-1 ps-5 text-sm text-ink">{children}</ul>
    </section>
  );
}

