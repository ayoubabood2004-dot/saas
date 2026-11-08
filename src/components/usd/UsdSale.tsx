/* ============================================================================
 * بيعُ الدولار (0264) — رفيقُ Usd.tsx بنطاق `usd`. سلّةٌ مستقلّة لموادّ الدولار وحدها (قرار ٢: لا فاتورةَ مختلطة):
 * تُفتح من شاشة البيع حين تُلمس مادّةٌ بالدولار أو تُمسح، وتبيع نقداً كاملاً أو دَيناً بالدولار.
 *
 *  • الحسابُ من usdMath.ts (cartTotals/cashAtSale — مرآةُ usd_checkout المفحوصة): المعروضُ هو المكتوب ديناراً بدينار.
 *  • يُرسَل معرّفُ السعر الذي رآه الكاشير، فسعرٌ تغيّر بعدها يُرفض (usd_rate_changed) ويُعاد بالجديد — لا بيعَ بسعرٍ لم يُرَ.
 *  • مرجعُ المحاولة ثابتٌ للسلّة كلِّها: ضغطتان أو ردٌّ ضائع = فاتورةٌ واحدة؛ ويتجدّد بعد بيعةٍ ناجحة.
 *  • بلا نتّ لا يُباع (السعرُ يُفحص بالخادم) — يقولها بدل طابورٍ يبيع بسعرٍ قديم.
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Search, ShoppingBag, Trash2, Wifi, WifiOff } from "lucide-react";
import type { Invoice, Product } from "@/types";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatNum, normalizeCode, searchable, uuid } from "@/lib/utils";
import { usdApi, type UsdMethod } from "@/lib/usdApi";
import { cartTotals, cashAtSale, centsOf, usdText } from "@/lib/usdMath";
import { refreshUsdState, StaleRateBanner, UsdChip, usdErrorText, usdIso, useStaleRate, useUsdState } from "./usdShared";

interface Line { product: Product; qty: number }
const METHODS: UsdMethod[] = ["cash", "card", "transfer"];
const cents = (n: number | null | undefined): bigint => centsOf(n == null ? "0" : String(n)) ?? 0n;
const iqd = (n: bigint) => formatNum(Number(n));
const plain = (c: bigint) => usdText(c).replace(/[$,]/g, "");

export function UsdSaleSheet({ open, products, first, firstTick = 0, wholesale = false, onClose, onSold }: {
  open: boolean; products: Product[]; first?: Product | null;
  /** يكبر بكلّ لمسة — نفسُ المادّة مرّتين تزيد سطرَها (المرجعُ نفسُه لا يحرّك أثراً). */
  firstTick?: number;
  /** شاشةُ الجملة: سعرُ القائمة `purchase_price_usd` كما تأخذ الجملةُ `purchase_price` (الخطّة §٩). */
  wholesale?: boolean;
  onClose: () => void; onSold: (inv: Invoice) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { state, failed, reload } = useUsdState();
  const rate = state?.rate ?? null;
  const { stale, ack } = useStaleRate(rate);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<UsdMethod>("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const ref = useRef(uuid());

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  // لمسةٌ جديدة لمادّةٍ بالدولار وهي مفتوحة: تُضاف للسلّة (أو تزيد سطرَها) — لا سلّةٌ ثانية.
  useEffect(() => {
    if (!open || !first) return;
    setLines((ls) => (ls.some((l) => l.product.id === first.id)
      ? ls.map((l) => (l.product.id === first.id ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { product: first, qty: 1 }]));
  }, [open, first, firstTick]);

  const usdProducts = useMemo(() => products.filter((p) => p.price_currency === "USD"), [products]);
  const matches = useMemo(() => {
    // الطرفان من الدالّة نفسِها (الاسمُ بـsearchable والباركودُ بـnormalizeCode) — تطبيعُ طرفٍ واحد يفشل بصمت.
    const s = searchable(q), normKey = normalizeCode(q);
    if (!s && !normKey) return [];
    return usdProducts.filter((p) => searchable(p.name).includes(s) || (!!normKey && normalizeCode(p.barcode) === normKey)).slice(0, 8);
  }, [q, usdProducts]);

  const add = (p: Product) => {
    playTap();
    setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { product: p, qty: 1 }]));
    setQ("");
  };
  const setQty = (id: string, qty: number) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l)));
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.product.id !== id));

  const disc = centsOf(discount) ?? 0n;
  const unitOf = (p: Product): number | null | undefined => (wholesale ? p.purchase_price_usd ?? p.sell_price_usd : p.sell_price_usd);
  const priced = lines.every((l) => unitOf(l.product) != null);
  const totals = rate && priced
    ? cartTotals(lines.map((l) => ({ qty: BigInt(l.qty), unitCents: cents(unitOf(l.product)) })), disc, rate.rate1e4)
    : null;
  const cash = totals && paid ? cashAtSale(totals.totalUsdCents, totals.totalIqd, rate!.rate1e4, state!.step) : null;
  const needCustomer = !paid && !name.trim() && !phone.trim();
  const blocked = busy || !online || !state?.enabled || !rate || !totals || lines.length === 0 || stale || needCustomer || (discount.trim() !== "" && centsOf(discount) == null);

  const reset = () => { setLines([]); setDiscount(""); setPaid(true); setMethod("cash"); setName(""); setPhone(""); setNotes(""); ref.current = uuid(); };
  const submit = async () => {
    if (blocked || !totals || !rate) return;
    setBusy(true);
    try {
      // سعرُ الوحدة يُرسَل صريحاً: هو ما رآه الكاشير (والجملةُ بسعر قائمتها) — والخادمُ يحسب دينارَه.
      const inv = await usdApi.checkout(lines.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_price_usd: plain(cents(unitOf(l.product))) })), {
        fx_rate_id: rate.id, paid_usd: paid ? plain(totals.totalUsdCents) : "0", payment_method: method,
        discount_usd: disc > 0n ? plain(disc) : null, customer_name: name.trim() || null, customer_phone: phone.trim() || null,
        notes: notes.trim() || null, client_ref: ref.current, sale_kind: wholesale ? "wholesale" : null,
      });
      playSuccess();
      toast.success(t("usd.sale.done"));
      reset();
      onSold(inv);
    } catch (e) {
      playWarning();
      toast.error(usdErrorText(e, t));
      if ((e as Error)?.message === "usd_rate_changed") void refreshUsdState();
    } finally { setBusy(false); }
  };

  return (
    // الإغلاقُ لا يرمي السلّة: المكوّنُ يبقى مركّباً والسلّةُ تنتظر حتى يُرجع إليها.
    <Modal open={open} onClose={onClose} title={t("usd.sale.title")} size="wide">
      <div className="space-y-4" data-usd-sale>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <UsdChip /> <span>{t("usd.sale.badge")}</span>
          <span className="ms-auto inline-flex items-center gap-1">{online ? <Wifi size={12} /> : <WifiOff size={12} className="text-danger-600" />}
            {rate ? t("usd.sale.rateIs", { v: formatNum(Number(rate.rate1e4) / 10_000) }) : null}</span>
        </div>
        {failed && <div className="flex items-center gap-2 text-sm text-danger-600"><span className="flex-1">{t("usd.set.loadFailed")}</span><Button size="sm" variant="secondary" onClick={reload}>{t("usd.retry")}</Button></div>}
        {state && !state.enabled && <p className="rounded-lg bg-danger-50 p-2 text-sm text-danger-700">{t("usd.err.usd_disabled")}</p>}
        {state?.enabled && !rate && <p className="rounded-lg bg-warn-50 p-2 text-sm text-warn-700">{t("usd.err.usd_no_rate")}</p>}
        {!online && <p className="rounded-lg bg-danger-50 p-2 text-sm text-danger-700">{t("usd.sale.offline")}</p>}
        {stale && rate && <StaleRateBanner rate={rate} onAck={ack} />}

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input data-usd-search className="input ps-9" placeholder={t("usd.sale.search")} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); add(matches[0]); } }} />
          {q.trim() !== "" && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface-1 shadow-raised">
              {matches.length === 0 ? <li className="px-3 py-2 text-sm text-ink-subtle">{t("usd.sale.noMatch")}</li> : matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-surface-2" onClick={() => add(p)}>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}</span>
                    <span className="text-2xs text-ink-subtle">{t("usd.sale.stock", { n: formatNum(p.stock ?? 0) })}</span>
                    <span className="font-bold tabular-nums text-success-700 dark:text-success-300" dir="ltr">{unitOf(p) == null ? "—" : usdText(cents(unitOf(p)))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-subtle"><ShoppingBag size={26} className="mb-1 opacity-40" />{t("usd.sale.empty")}</div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line" data-usd-lines>
            {lines.map((l, j) => {
              const u = unitOf(l.product);
              const unit = u == null ? null : cents(u);
              const over = !l.product.pooled && (l.product.stock ?? 0) < l.qty;
              return (
                <li key={l.product.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{l.product.name}</p>
                    <p className="text-2xs text-ink-subtle">
                      <span dir="ltr">{unit == null ? t("usd.err.usd_no_price") : usdText(unit)}</span>
                      {totals && unit != null && <> · {iqd(totals.unitIqd[j])}</>}
                      {over && <span className="ms-1 font-semibold text-warn-700 dark:text-warn-300">{t("usd.sale.overStock", { n: formatNum(l.product.stock ?? 0) })}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="−" className="grid h-8 w-8 place-items-center rounded-lg border border-line" onClick={() => setQty(l.product.id, l.qty - 1)}><Minus size={14} /></button>
                    <input className="input h-8 w-14 text-center tabular-nums" inputMode="numeric" value={l.qty} onChange={(e) => setQty(l.product.id, Number(e.target.value))} />
                    <button type="button" aria-label="+" className="grid h-8 w-8 place-items-center rounded-lg border border-line" onClick={() => setQty(l.product.id, l.qty + 1)}><Plus size={14} /></button>
                  </div>
                  <span className="w-24 text-end font-bold tabular-nums text-ink" dir="ltr">{unit == null ? "—" : usdText(unit * BigInt(l.qty))}</span>
                  <button type="button" aria-label={t("usd.sale.remove")} className="text-ink-subtle hover:text-danger-600" onClick={() => remove(l.product.id)}><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex rounded-xl border border-line p-1" role="radiogroup">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={paid === v} onClick={() => { playTap(); setPaid(v); }}
                  className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-bold transition", paid === v ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-2")}>
                  {v ? t("usd.sale.cash") : t("usd.sale.debt")}
                </button>
              ))}
            </div>
            {paid && (
              <div className="flex gap-1.5" role="radiogroup">
                {METHODS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { playTap(); setMethod(m); }}
                    className={cn("flex-1 rounded-xl border px-2 py-1.5 text-xs font-bold transition", method === m ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink-muted hover:bg-surface-2")}>
                    {t(`usd.method.${m}`)}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input className={cn("input", needCustomer && "border-warn-400")} placeholder={t("usd.sale.customer")} value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" dir="ltr" inputMode="tel" placeholder={t("usd.sale.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {needCustomer && <p className="text-xs font-semibold text-warn-700 dark:text-warn-300">{t("usd.sale.needCustomer")}</p>}
            <input className="input" placeholder={t("usd.sale.notesPh")} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="space-y-1.5 rounded-2xl bg-surface-2 p-4 text-sm" data-usd-totals>
            <div className="flex justify-between text-ink-muted"><span>{t("usd.sale.subtotal")}</span><span className="tabular-nums" dir="ltr">{totals ? usdText(totals.subUsdCents) : "—"}</span></div>
            <label className="flex items-center justify-between gap-2 text-ink-muted">
              <span>{t("usd.sale.discount")}</span>
              <input data-usd-discount className="input h-8 w-24 text-end tabular-nums" dir="ltr" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <div className="flex items-end justify-between border-t border-line pt-2">
              <span className="font-bold text-ink">{t("usd.sale.total")}</span>
              <span className="font-display text-2xl font-extrabold tabular-nums text-ink" dir="ltr">{totals ? usdText(totals.totalUsdCents) : "—"}</span>
            </div>
            {totals && rate && <p className="text-end text-2xs text-ink-subtle">{t("usd.sale.approx", { v: iqd(totals.totalIqd), r: formatNum(Number(rate.rate1e4) / 10_000) })}</p>}
            {cash && (
              <div className="mt-2 rounded-xl bg-surface-1 p-2.5 text-xs">
                <p className="font-bold text-ink">{t("usd.sale.drawer", { v: iqd(cash.received) })}</p>
                {cash.fx !== 0n && <p className="text-ink-subtle">{t("usd.sale.rounding", { v: (cash.fx > 0n ? "+" : "−") + iqd(cash.fx < 0n ? -cash.fx : cash.fx) })}</p>}
              </div>
            )}
          </div>
        </div>

        <Button className="w-full" size="lg" loading={busy} disabled={blocked} onClick={submit} data-usd-sale-go>
          {totals ? t(paid ? "usd.sale.confirmCash" : "usd.sale.confirmDebt", { v: usdIso(totals.totalUsdCents) }) : t("usd.sale.title")}
        </Button>
      </div>
    </Modal>
  );
}
