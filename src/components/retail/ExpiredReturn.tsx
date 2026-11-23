import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { CalendarX2, PackageOpen, Undo2 } from "lucide-react";
import type { Product, ProductLot } from "@/types";
import { Button, Dialog } from "@/components/ui";
import { cn, formatDate, formatQty, localISO, money } from "@/lib/utils";
import type { ExpiredResult, ExpiredUnit } from "@/lib/expiredApi";
import { listReturnLotsOf } from "@/lib/expiredApi";

/* ============================================================================
 * الراجعُ الإكسباير (0288) — مالكُ النطاق `xret` (hot-paths.json). قطعةٌ كسولة: شاشةُ البيع تستوردها بـimport() مع بابها
 * (expiredApi) وتسأل هذه الدوالَّ عن جملها، ونافذةُ الدفعات ونموذجُ المادّة يرسمان «رجعت من فلان…» من هنا.
 *
 * طلبُ المالك (٢٣/١١): «راجع اكسباير — شوكت خلص — واسم الزبون، ولو عليه دين ينسحب من دينه… وبالمخزن يكتبلي هاي رجعت من عنده
 * بهذا التاريخ على نص السعر، ولمن ابيعها يسألني من الاكسباير لو من الجديد، وأحدد قطعة لو كارتونة».
 * ========================================================================= */

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`xret.${k}`, o ?? {});

/** جملُ الشاشة بلغة الواجهة الآن. */
export const say = {
  btn: () => t("btn"),
  chip: (date: string) => t("chip", { date: formatDate(date, i18n.language, true) }),
  mixed: () => t("mixed"),
  notReady: () => t("notReady"),
  weight: (name: string) => t("weight", { name }),
  needDate: (name: string) => t("needDate", { name }),
  lotLine: (l: Pick<ProductLot, "expiry_date" | "return_from">) => t("lotLine", {
    date: l.expiry_date ? formatDate(l.expiry_date, i18n.language, true) : "—", from: l.return_from || t("walkIn"),
  }),
  lotShort: (name: string, n: number) => t("lotShort", { name, n: formatQty(n) }),
  lotPack: (name: string) => t("lotPack", { name }),
  lotUsd: (name: string) => t("lotUsd", { name }),
  pending: () => t("pending"),
  done: (r: ExpiredResult): string => {
    const n = r.lines.length;
    const parts = [t("done", { n })];
    if (r.debt > 0) parts.push(t("doneDebt", { amount: money(r.debt), who: r.customer || t("walkIn") }));
    if (r.cash > 0) parts.push(t("doneCash", { amount: money(r.cash) }));
    return parts.join(" — ");
  },
  /** رفضُ أبواب 0288 برمزه: الخادمُ يشرحه بـhint عربيّ، والتجريبيُّ الرمزُ وحده — فبالإنكليزية أو بلا شرحٍ تُقال جملتُنا. */
  err: (e: unknown, code: string | null): string | null => {
    const hint = (e as { hint?: string } | null)?.hint;
    if (hint && i18n.language.startsWith("ar")) return hint;
    if (code && i18n.exists(`xret.err.${code}`)) return t(`err.${code}`);
    return hint ?? null;
  },
};

/** الوحداتُ التي يقدر يرجّعها بها: العلبة، ومفردُها إن وُجد، وكلُّ كارتون. */
export function unitsOf(p: Pick<Product, "has_sub_unit" | "units_per_box" | "sub_unit_name" | "packs" | "unit_name">):
  { unit: ExpiredUnit; packId?: string; label: string; per: number }[] {
  const out: { unit: ExpiredUnit; packId?: string; label: string; per: number }[] = [{ unit: "box", label: (p.unit_name ?? "").trim() || t("box"), per: 1 }];
  if (p.has_sub_unit && Number(p.units_per_box) >= 2) out.push({ unit: "sub", label: (p.sub_unit_name ?? "").trim() || t("sub"), per: 1 / Number(p.units_per_box) });
  for (const k of p.packs ?? []) if (Number(k.per) >= 2) out.push({ unit: "pack", packId: k.id, label: (k.name ?? "").trim() || t("pack"), per: Number(k.per) });
  return out;
}

export interface XretValue { unit: ExpiredUnit; packId?: string; qty: number; date: string }

/** نافذةُ سطر الراجع: شوكت خلص، وشنو رجّع (علبة، قطعة، كارتون)، وكم. والنسبةُ نسبةُ السطر (شريطُ «راجع»). */
export function XretDialog({ open, onClose, product, name, value, pct, hasCustomer, onSave, onClear }: {
  open: boolean; onClose: () => void; product: Product | null; name: string; value: XretValue; pct: number; hasCustomer: boolean;
  onSave: (v: XretValue) => void; onClear?: () => void;
}) {
  const { t: tt } = useTranslation();
  const [v, setV] = useState<XretValue>(value);
  const [qtyText, setQtyText] = useState(String(value.qty));
  useEffect(() => { if (open) { setV(value); setQtyText(String(value.qty)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const units = product ? unitsOf(product) : [{ unit: "box" as const, label: tt("xret.box"), per: 1 }];
  const qty = Number(qtyText.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(",", "."));
  const okQty = Number.isFinite(qty) && qty > 0;
  const today = localISO();
  const ok = !!v.date && okQty;
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={<span className="flex items-center gap-2"><CalendarX2 size={18} className="text-danger-600" />{tt("xret.title", { name })}</span>}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {onClear ? <Button variant="ghost" size="sm" data-xretclear onClick={onClear}>{tt("xret.clear")}</Button> : <span />}
          <Button data-xretsave disabled={!ok} onClick={() => ok && onSave({ ...v, qty: Math.round(qty * 1000) / 1000 })}>{tt("xret.save")}</Button>
        </div>
      }>
      <div className="space-y-4" data-xretdialog>
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-ink">{tt("xret.when")}</p>
          {/* لا ExpiryPicker: مختارُ الشراء يعرض السنينَ القادمة ويُطفئ الأشهرَ التي فاتت — والراجعُ الإكسباير تاريخُه فات غالباً. */}
          <input type="date" data-xretdate value={v.date} onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))}
            className="h-11 w-full rounded-xl border border-line bg-surface-1 px-3 text-base font-bold tabular-nums focus:border-brand-400 focus:outline-none" />
          {v.date && v.date >= today && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300">{tt("xret.notYet")}</p>}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-ink">{tt("xret.what")}</p>
          <div className="flex flex-wrap gap-1.5" role="group">
            {units.map((u) => {
              const on = v.unit === u.unit && (u.unit !== "pack" || v.packId === u.packId);
              return (
                <button key={`${u.unit}:${u.packId ?? ""}`} type="button" data-xretunit={u.unit} aria-pressed={on}
                  onClick={() => setV((x) => ({ ...x, unit: u.unit, packId: u.packId }))}
                  className={cn("h-9 rounded-full border px-3 text-xs font-extrabold transition",
                    on ? "border-danger-500 bg-danger-500 text-white" : "border-line bg-surface-1 text-ink-muted hover:border-danger-300")}>
                  {u.unit === "pack" ? <PackageOpen size={13} className="me-1 inline" /> : null}{u.label}
                  {u.unit === "pack" ? <span className="ms-1 tabular-nums opacity-80">({formatQty(u.per)})</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-extrabold text-ink">{tt("xret.howMany")}</span>
          <input data-xretqty inputMode="decimal" value={qtyText} onChange={(e) => setQtyText(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-surface-1 px-3 text-base font-bold tabular-nums focus:border-brand-400 focus:outline-none" />
        </label>
        <div className="space-y-1 rounded-xl bg-surface-2 px-3 py-2 text-2xs font-semibold text-ink">
          <p>{tt("xret.pct", { pct })}</p>
          <p className={cn(!hasCustomer && "text-warn-800 dark:text-warn-200")}>{tt(hasCustomer ? "xret.howDebt" : "xret.noCustomer")}</p>
        </div>
      </div>
    </Dialog>
  );
}

/** تحت السلّة حين فيها راجعٌ إكسباير: أين يذهب المال. */
export function XretNote({ customer }: { customer: string | null }) {
  const { t: tt } = useTranslation();
  return (
    <div data-xretnote className="flex items-start gap-1.5 rounded-xl bg-danger-50 px-2.5 py-2 text-2xs font-semibold text-danger-800 dark:bg-danger-500/15 dark:text-danger-200">
      <Undo2 size={13} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{customer ? tt("xret.noteWho", { who: customer }) : tt("xret.noCustomer")}</span>
    </div>
  );
}

/** «تبيع من الإكسباير لو من الجديد؟» — دفعاتُ الراجع الباقية للمادّة، وزرٌّ لكلّ واحدة، و«من الجديد». */
export function LotPickDialog({ open, product, lots, newLeft, onPick, onCancel }: {
  open: boolean; product: Product | null; lots: ProductLot[]; newLeft: number; onPick: (lot: ProductLot | null) => void; onCancel: () => void;
}) {
  const { t: tt, i18n: ii } = useTranslation();
  const unit = (product?.unit_name ?? "").trim() || tt("xret.box");
  return (
    <Dialog open={open} onClose={onCancel} size="sm" title={tt("xret.pickTitle", { name: product?.name ?? "" })} description={tt("xret.pickSub")}>
      <div className="space-y-2" data-lotpick>
        {lots.map((l) => (
          <button key={l.id} type="button" data-lotpickone={l.id} onClick={() => onPick(l)}
            className="w-full rounded-2xl border-2 border-danger-200 bg-danger-50 p-3 text-start transition hover:border-danger-400 dark:border-danger-500/30 dark:bg-danger-500/10">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-danger-800 dark:text-danger-200">
              <CalendarX2 size={14} />{tt("xret.fromLot")}
              <span className="ms-auto tabular-nums">{tt("xret.left", { n: formatQty(l.qty), unit })}</span>
            </p>
            <p className="mt-1 text-2xs font-semibold text-ink">
              {tt("xret.lotDesc", {
                exp: l.expiry_date ? formatDate(l.expiry_date, ii.language, true) : "—",
                from: l.return_from || tt("xret.walkIn"),
                day: l.returned_at ? formatDate(l.returned_at.slice(0, 10), ii.language, true) : "—",
                pct: l.return_pct ?? 100,
              })}
            </p>
            {l.unit_cost != null && <p className="mt-0.5 text-2xs text-ink-subtle">{tt("xret.lotCost", { cost: money(Number(l.unit_cost)), unit })}</p>}
          </button>
        ))}
        {/* «من الجديد» حين بقي جديد — رصيدٌ كلُّه إكسباير كان يعرضه فيُباع الإكسبايرُ بكلفة المتوسّط (خسارةٌ وهميّة). */}
        {newLeft > 0.0005
          ? <Button className="w-full" variant="secondary" data-lotpicknew onClick={() => onPick(null)}>{tt("xret.fromNewLeft", { n: formatQty(newLeft), unit })}</Button>
          : <p data-lotpicknonew className="text-center text-2xs font-semibold text-ink-subtle">{tt("xret.noNew")}</p>}
      </div>
    </Dialog>
  );
}

/** «رجعت من فلان…» — نموذجُ المادّة ونافذةُ الدفعات. يرمي القراءةَ الفاشلة جملةً لا قائمةً فارغة. */
export function ReturnLotsNote({ productId, unitName, compact }: { productId: string; unitName?: string | null; compact?: boolean }) {
  const { t: tt, i18n: ii } = useTranslation();
  const [lots, setLots] = useState<ProductLot[] | "loading" | "error">("loading");
  useEffect(() => {
    let alive = true;
    setLots("loading");
    listReturnLotsOf(productId).then((l) => { if (alive) setLots(l); }, () => { if (alive) setLots("error"); });
    return () => { alive = false; };
  }, [productId]);
  if (lots === "loading") return null;
  if (lots === "error") return <p data-retlotserr className="text-2xs font-semibold text-danger-700">{tt("xret.loadFailed")}</p>;
  if (!lots.length) return null;
  const unit = (unitName ?? "").trim() || tt("xret.box");
  const live = lots.filter((l) => l.qty > 0);
  const shown = compact ? live : lots;
  if (!shown.length) return null;
  return (
    <div data-retlots className="space-y-1.5 rounded-2xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
      <p className="flex items-center gap-1.5 text-xs font-extrabold text-danger-800 dark:text-danger-200">
        <CalendarX2 size={14} />{live.length ? tt("xret.invTitle", { n: formatQty(live.reduce((s, l) => s + l.qty, 0)), unit }) : tt("xret.invTitleDone")}
      </p>
      <ul className="space-y-1">
        {shown.map((l) => (
          <li key={l.id} data-retlot className={cn("text-2xs font-semibold text-ink", l.qty <= 0 && "text-ink-subtle line-through")}>
            {tt("xret.invLine", {
              from: l.return_from || tt("xret.walkIn"), n: formatQty(l.received_qty), unit,
              day: l.returned_at ? formatDate(l.returned_at.slice(0, 10), ii.language, true) : "—",
              exp: l.expiry_date ? formatDate(l.expiry_date, ii.language, true) : "—",
              pct: l.return_pct ?? 100,
            })}
            {l.unit_cost != null && <> · {tt("xret.lotCost", { cost: money(Number(l.unit_cost)), unit })}</>}
            {l.qty > 0 && l.qty < l.received_qty ? <> · {tt("xret.left", { n: formatQty(l.qty), unit })}</> : null}
            {l.qty <= 0 ? <> · {tt("xret.soldOut")}</> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** التسخين: قطعةٌ لا ترسم شيئاً — `page(…, ["xret"])` يجلب النطاقَ معها. */
export default function ExpiredReturnWarm(): null {
  return null;
}
