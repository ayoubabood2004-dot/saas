import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Layers, Plus, RotateCw, Scissors } from "lucide-react";
import type { Product, ProductLot } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Dialog, Skeleton, useToast } from "@/components/ui";
import { cn, formatDate, formatNum, formatQty, localISO } from "@/lib/utils";
import { daysToExpiry } from "@/lib/expiry";
import { describeDbError } from "@/lib/errors";
import { ExpiryPicker } from "@/components/ExpiryPicker";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * دفعاتُ المادة (0217) — «شكد عندي من كلّ شراء، شوكت اشتريته، من يا شركة، وشوكت ينتهي؟»
 *
 * الدفعاتُ يصنعها الخادم (الشراءُ دفعتُه، والرصيدُ القديم افتتاحية، وكلُّ نقصٍ يُسحب من
 * الأقرب انتهاءً)؛ هذه الشاشةُ تعرضها وتسمح بثلاثة أفعالٍ لمن يعدّل المخزن: إضافةُ
 * دفعةٍ وصلت بلا فاتورة، وتصحيحُ تاريخ دفعة، وفصلُ جزءٍ منها بتاريخٍ آخر (الافتتاحيةُ
 * غالباً خليطُ تواريخ). والرصيدُ لا يتغيّر إلا بالإضافة.
 * ========================================================================= */

type Edit = { lot: ProductLot; date: string; split: string } | null;

export function ProductLotsDialog({ product, open, onClose, canEdit, onChanged }: {
  product: Product; open: boolean; onClose: () => void; canEdit: boolean; onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [lots, setLots] = useState<ProductLot[] | "loading" | "error">("loading");
  const [edit, setEdit] = useState<Edit>(null);
  const [add, setAdd] = useState<{ qty: string; date: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const today = localISO();

  const load = useCallback(async () => {
    setLots("loading");
    try { setLots(await repo.listProductLots(product.id)); } catch { setLots("error"); }
  }, [product.id]);
  useEffect(() => { if (open) { setEdit(null); setAdd(null); void load(); } }, [open, load]);

  /** رفضُ الدفعات برمزه (`lot_forbidden`…): الخادمُ يشرحه بـhint عربيّ، والمرآةُ رمزٌ وحده. */
  const errText = (e: unknown) => {
    const code = /^(lot_\w+|count_\w+)$/.exec(e instanceof Error ? e.message : "")?.[1];
    const hint = (e as { hint?: string } | null)?.hint;
    if (code && (!hint || !i18n.language.startsWith("ar")) && i18n.exists(`lots.err.${code}`)) return t(`lots.err.${code}`);
    return describeDbError(e, t);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); playSuccess(); toast.success(ok); setEdit(null); setAdd(null); await load(); onChanged?.(); }
    catch (e) { playWarning(); toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const live = typeof lots === "object" ? lots.filter((l) => l.qty > 0).sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999")) : [];
  const empty = typeof lots === "object" ? lots.filter((l) => l.qty <= 0) : [];
  const source = (l: ProductLot) => t(`lots.src.${l.source}`);

  const row = (l: ProductLot, first: boolean) => {
    const d = daysToExpiry(l.expiry_date, today);
    const tone = d === null ? "text-ink-muted" : d < 0 ? "text-danger-700 dark:text-danger-300" : d <= 30 ? "text-warn-700 dark:text-warn-300" : "text-ink";
    return (
      <li key={l.id} className={cn("rounded-2xl border bg-surface-1 p-3", first && l.qty > 0 ? "border-brand-300 dark:border-brand-500/40" : "border-line")} data-lot>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn("flex items-center gap-1.5 text-sm font-extrabold", tone)}>
              <CalendarClock size={14} />
              {l.expiry_date
                ? <>{formatDate(l.expiry_date, i18n.language)} · {d! < 0
                    ? t("lots.expiredAgo", { n: formatNum(-d!), defaultValue: "منتهية من {{n}} يوم" })
                    : t("lots.left", { n: formatNum(d!), defaultValue: "باقي {{n}} يوم" })}</>
                : t("lots.noDate", "بلا تاريخ انتهاء")}
              {first && l.qty > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{t("lots.sellsFirst", "تنباع أول")}</span>}
            </p>
            <p className="mt-0.5 text-2xs text-ink-subtle">
              {source(l)} · {formatDate(l.received_at, i18n.language)}{l.company_name ? ` · ${l.company_name}` : ""}{l.note ? ` · ${l.note}` : ""}
            </p>
          </div>
          <div className="text-end tabular-nums">
            <p className="text-lg font-extrabold text-ink">{formatQty(l.qty)}</p>
            {l.received_qty > 0 && l.received_qty !== l.qty && (
              <p className="text-2xs text-ink-subtle">{t("lots.ofReceived", { n: formatQty(l.received_qty), defaultValue: "من {{n}}" })}</p>
            )}
          </div>
          {canEdit && l.qty > 0 && (
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle hover:bg-surface-2 hover:text-brand-600" data-lot-edit
              aria-label={t("lots.edit", "عدّل التاريخ")} title={t("lots.edit", "عدّل التاريخ")}
              onClick={() => { playTap(); setAdd(null); setEdit({ lot: l, date: l.expiry_date?.slice(0, 10) ?? "", split: "" }); }}>
              <Scissors size={15} />
            </button>
          )}
        </div>
        {edit?.lot.id === l.id && (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-2.5 text-xs">
            <label className="flex flex-col gap-1 font-semibold text-ink-muted">
              {t("lots.newDate", "التاريخ الصحيح")}
              <ExpiryPicker compact value={edit.date} onChange={(iso) => setEdit({ ...edit, date: iso })} />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-ink-muted">
              {t("lots.splitQty", { n: formatQty(l.qty), defaultValue: "لكم علبة؟ (فارغ = الكل {{n}})" })}
              <input type="number" inputMode="decimal" min={0} step="any" className="input h-9 w-28 text-sm" value={edit.split}
                onChange={(e) => setEdit({ ...edit, split: e.target.value })} data-lot-split />
            </label>
            <Button size="sm" loading={busy} data-lot-save disabled={!edit.date}
              onClick={() => {
                const n = edit.split.trim() === "" ? null : Number(edit.split);
                void run(() => repo.editLot(l.id, edit.date || null, n), n !== null && n < l.qty
                  ? t("lots.splitDone", { n: formatQty(n), defaultValue: "انفصلت {{n}} بتاريخها" })
                  : t("lots.dateDone", "انعدّل تاريخ الدفعة"));
              }}>
              {t("common.save", "حفظ")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel", "إلغاء")}</Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg"
      title={t("lots.title", { name: product.name, defaultValue: "دفعات: {{name}}" })}
      description={t("lots.sub", { n: formatQty(Number(product.stock) || 0), defaultValue: "الرصيد {{n}} — كل كمية بتاريخها ومن وين إجت" })}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("common.close", "سكّر")}</Button></div>}
    >
      {lots === "loading" ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : lots === "error" ? (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-bold text-ink">{t("lots.failed", "ما كدرنا نجيب الدفعات")}</p>
          <Button size="sm" variant="secondary" leftIcon={<RotateCw size={14} />} onClick={() => void load()}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : (
        <div className="space-y-3" data-lots>
          {live.length > 1 && (
            <p className="flex items-center gap-1.5 rounded-xl bg-brand-50/70 px-3 py-2 text-xs font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              <Layers size={14} /> {t("lots.shelfTip", "الي ينتهي أول خلّيه قدّام بالرف — البيع ينقص منه أول، والجرد يصحّح إذا انسحب غيره")}
            </p>
          )}
          {live.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-subtle">{t("lots.none", "ماكو رصيد بهاي المادة")}</p>
          ) : (
            <ul className="space-y-2">{live.map((l, i) => row(l, i === 0))}</ul>
          )}
          {empty.length > 0 && (
            <div>
              <button type="button" className="text-xs font-semibold text-ink-subtle hover:text-ink" onClick={() => setShowEmpty((v) => !v)}>
                {t("lots.finished", { n: formatNum(empty.length), defaultValue: "دفعات خلصت ({{n}})" })}
              </button>
              {showEmpty && <ul className="mt-2 space-y-2 opacity-70">{empty.map((l) => row(l, false))}</ul>}
            </div>
          )}
          {canEdit && !product.pooled && (
            add ? (
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-line p-3 text-xs" data-lot-add-form>
                <label className="flex flex-col gap-1 font-semibold text-ink-muted">
                  {t("lots.qty", "الكمية")}
                  <input type="number" inputMode="decimal" min={0} step="any" className="input h-9 w-24 text-sm" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} data-lot-add-qty />
                </label>
                <label className="flex flex-col gap-1 font-semibold text-ink-muted">
                  {t("lots.expiry", "تنتهي")}
                  <ExpiryPicker compact value={add.date} onChange={(iso) => setAdd({ ...add, date: iso })}
                    suggest={live.length ? live[live.length - 1].expiry_date : null} />
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1 font-semibold text-ink-muted">
                  {t("lots.note", "ملاحظة")}
                  <input className="input h-9 text-sm" maxLength={200} value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} placeholder={t("lots.notePh", "مثلاً: وصلت من المندوب")} />
                </label>
                <Button size="sm" loading={busy} disabled={!(Number(add.qty) > 0)} data-lot-add-save
                  onClick={() => void run(() => repo.addLot(product.id, Number(add.qty), add.date || null, add.note), t("lots.added", "انضافت الدفعة وزاد الرصيد"))}>
                  {t("common.save", "حفظ")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdd(null)}>{t("common.cancel", "إلغاء")}</Button>
                <p className="basis-full text-2xs text-ink-subtle">{t("lots.addHint", "للبضاعة الي وصلت بلا فاتورة شراء. الي تجي بفاتورة تنضاف دفعتها وحدها.")}</p>
              </div>
            ) : (
              <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} data-lot-add
                onClick={() => { playTap(); setEdit(null); setAdd({ qty: "", date: "", note: "" }); }}>
                {t("lots.add", "أضف دفعة")}
              </Button>
            )
          )}
        </div>
      )}
    </Dialog>
  );
}
