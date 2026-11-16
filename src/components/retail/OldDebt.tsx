/* ============================================================================
 * الديونُ القديمة (0271) — «دين قديم» بسجلّ الديون وبملفّ الزبون، وشارةُ «دين سابق» أينما يظهر.
 *
 * طلبُ المالك: «من داخل الديون أضيف ديون قديمة على ناس أني أطلبهم: شنو وليش وشكد وشوكت، بالدولار أو بالعراقي». الدينُ القديم
 * فاتورةٌ معلَّمة (sale_kind = "opening") بلا موادّ — ليس بيعاً بأيّ تقرير، وتسديدُه بالأزرار الحاليّة يدخل الدرجَ بيومه.
 *
 *  • الزرُّ للمدير (أو مفتاحِه الحيّ) — والقاعدةُ ترفض غيرَه أيضاً (old_debt_manager): الإخفاءُ راحةٌ لا حارس.
 *  • الزبونُ بخانتَي الاسم والرقم نفسَيهما وبحثِهما (CustomerSearch، كالبيع و«حالة جديدة») — فلا يصير الزبونُ زبونين؛
 *    ومن ملفّ الزبون يُكتب على زبونه وحده (الخانتان مقفولتان: الرقمُ هويّة).
 *  • مرجعُ إعادةٍ واحد للنافذة: رفضٌ حاسمٌ يحرّره، والنتيجةُ المجهولة (الشبكة) تقفل النافذةَ على «أعد المحاولة» بالمرجع
 *    نفسِه — الإعادةُ تُرجع الدينَ نفسَه لا ديناً ثانياً (shouldReleaseRef).
 *  • الدولار إن كان مفعّلاً وبسعر: يُكتب المبلغُ بالدولار، والخادمُ يحسب دينارَه بسعر اليوم.
 *
 * النصوصُ بنطاقٍ مملوك `odebt` (hot-paths.json): النصفُ البارد على سقفه و`retail` حارّ. القطعةُ كسولةٌ من كلّ مستعمل
 * بـpage(…, ["odebt"]).
 * ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { History, Coins, RotateCcw, AlertTriangle, CalendarClock, NotebookPen, Package, Plus, Search, X, Undo2, Loader2 } from "lucide-react";
import type { CustomerHit, Invoice, OldDebtItem, PaymentMethod, Product } from "@/types";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { useCustomerSearch, CustomerDropdown, type CustField } from "@/components/retail/CustomerSearch";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride, capLockedFrom } from "@/lib/managerOverride";
import { addOldDebt, isOldDebtAbsent, isOldDebtItemsAbsent, listOldDebtItems, returnOldDebt, type OldDebtCurrency } from "@/lib/oldDebtApi";
import { canonDec, centsOf, decOf, decText } from "@/lib/usdMath";
import { repo } from "@/lib/repo";
import { codeMatcher } from "@/lib/productCodes";
import { getActiveClinicId } from "@/lib/clinics";
import { describeDbError, shouldReleaseRef } from "@/lib/errors";
import { cn, formatDate, formatNum, money, uid, searchable } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* محاولةٌ مجهولةُ المصير تعيش بالجلسة لا بالنافذة: إغلاقُها وفتحُها كان يولّد مرجعاً جديداً فيُكتب الدينُ مرّتين.
 * بالعيادة (مفتاحُها المحلّيّ) — مرجعٌ معلَّقٌ لعيادةٍ لا يُعاد بأخرى. */
type Pending = { ref: string; name: string; phone: string; what: string; why: string; amount: string; currency: OldDebtCurrency; date: string; items?: ItemRow[] };

/* 0273: سطرُ مادّةٍ بالنافذة — من المخزن (product_id واسمُه من الصفّ) أو بالاسم. الكميةُ والسعرُ نصّاً كما كُتبا (decOf يقرؤهما). */
type ItemRow = { k: string; product_id: string | null; name: string; qty: string; price: string; stock: number | null };
const milliOf = (v: string | number | null | undefined) => decOf(v, 3);
/** round(كمية × سعر، ٢) بالسنت — كحساب الخادم (القيمُ موجبة). */
const lineCents = (qMilli: bigint, pCents: bigint) => (2n * qMilli * pCents + 1000n) / 2000n;
/** عددٌ قانونيّ بلا أصفارٍ زائدة («85000»، «12.5») — للخانة وللنصّ. */
const plainDec = (v: bigint, scale: number) => decText(v, scale).replace(/\.?0+$/, "");
const pendKey = () => `vp_odebt_pending_${getActiveClinicId()}`;
const readPending = (): Pending | null => {
  try { const v = JSON.parse(sessionStorage.getItem(pendKey()) || "null") as Pending | null; return v && typeof v.ref === "string" ? v : null; } catch { return null; }
};
const writePending = (p: Pending | null) => {
  try { if (p) sessionStorage.setItem(pendKey(), JSON.stringify(p)); else sessionStorage.removeItem(pendKey()); } catch { /* swallow-ok: بلا تخزين تبقى النافذةُ مقفولةً ما دامت مفتوحة */ }
};

const localYMD = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** رموزُ الخادم (ومرآتِه التجريبية بلا تلميح) بجملها، وغيرُها كما يشرحها describeDbError. */
function errText(e: unknown, t: TFunction): string {
  const msg = String((e as { message?: string } | null)?.message ?? "");
  if (isOldDebtAbsent(e)) return t("odebt.err.absent");
  if (isOldDebtItemsAbsent(e)) return t("odebt.err.itemsAbsent");
  if (msg.includes("old_debt_return_usd")) return t("odebt.returnUsd");
  if (msg.includes("nothing to return")) return t("odebt.err.nothing");
  // الأطولُ أوّلاً: «old_debt_item» بادئةُ أخواتها.
  for (const [c, k] of [["old_debt_items_sum", "itemsSum"], ["old_debt_items", "items"], ["old_debt_item_product", "itemProduct"],
    ["old_debt_item_name", "itemName"], ["old_debt_item_qty", "itemQty"], ["old_debt_item_price", "itemPrice"], ["old_debt_item", "item"],
    ["old_debt_return_over", "returnOver"], ["old_debt_return_gone", "returnGone"], ["old_debt_return_item", "returnItem"],
    ["old_debt_not_found", "notFound"]] as const) {
    if (msg.includes(c)) return t(`odebt.err.${k}`);
  }
  for (const c of ["manager", "customer", "what", "long", "amount", "date", "currency", "ref"] as const) {
    if (msg.includes(`old_debt_${c}`)) return t(`odebt.err.${c}`);
  }
  if (msg.includes("usd_disabled") || msg.includes("usd_no_rate")) return t("odebt.err.usd");
  if (msg.includes("operator_not_allowed")) return t("odebt.err.operator");
  return describeDbError(e, t);
}

/** المديرُ (أو مفتاحُه الحيّ) وجهازٌ غيرُ مقفول — حكمُ أزرار الحذف نفسُه. */
function useCanOldDebt(): boolean {
  const { role } = usePermissions();
  const ov = useOverride();
  return !capLockedFrom(ov.deviceLocked, ov.active, role === "manager");
}

/* ─────────────────────────────── الزرّ ─────────────────────────────── */
export function OldDebtButton({ prefill, onAdded, full }: {
  prefill?: { name: string | null; phone: string | null } | null;
  onAdded?: (inv: Invoice) => void;
  full?: boolean;
}) {
  const { t } = useTranslation();
  const can = useCanOldDebt();
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <Button variant="secondary" size={full ? "md" : "sm"} className={cn(full && "w-full")} leftIcon={<History size={15} />}
        onClick={() => { playTap(); setOpen(true); }} data-odebt-open>
        {prefill ? t("odebt.addFor") : t("odebt.add")}
      </Button>
      {open && <OldDebtDialog prefill={prefill ?? null} onClose={() => setOpen(false)} onAdded={(inv) => { setOpen(false); onAdded?.(inv); }} />}
    </>
  );
}

/* ─────────────────────────────── النافذة ─────────────────────────────── */
type UsdInfo = { state: "loading" } | { state: "off" } | { state: "failed" } | { state: "on"; per100: number };

function OldDebtDialog({ prefill, onClose, onAdded }: {
  prefill: { name: string | null; phone: string | null } | null;
  onClose: () => void;
  onAdded: (inv: Invoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const cs = useCustomerSearch();
  /* محاولةٌ مجهولةٌ سابقة (أُغلقت النافذةُ عليها) ترجع كما أُرسلت ومقفولةً على الإعادة — أيّاً كان الزبونُ الذي فُتحت له. */
  const [pend] = useState(readPending);
  const locked = !!prefill || !!pend;
  const [name, setName] = useState(pend?.name ?? prefill?.name ?? "");
  const [phone, setPhone] = useState(pend?.phone ?? prefill?.phone ?? "");
  const [what, setWhat] = useState(pend?.what ?? "");
  const [why, setWhy] = useState(pend?.why ?? "");
  const [amount, setAmount] = useState(pend?.amount ?? "");
  const [currency, setCurrency] = useState<OldDebtCurrency>(pend?.currency ?? "IQD");
  const today = localYMD();
  const [date, setDate] = useState(pend?.date ?? today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** نتيجةُ محاولةٍ مجهولة (الشبكة): النافذةُ تُقفل على «أعد المحاولة» بالمرجع نفسِه — لا تعديلَ يرسل ديناً ثانياً. */
  const [pinned, setPinned] = useState(!!pend);
  const ref = useRef(pend?.ref ?? uid("odebt"));
  const [usd, setUsd] = useState<UsdInfo>({ state: "loading" });
  const [items, setItems] = useState<ItemRow[]>(pend?.items ?? []);
  /* المخزنُ يُحمَّل عند أوّل بحث — لا عند فتح النافذة (أغلبُ الديون بلا موادّ). والفشلُ يُقال ويُعاد، لا قائمةٌ فارغة تُصدَّق. */
  const [prods, setProds] = useState<ProductsState>({ state: "idle" });
  const loadProducts = () => {
    if (prods.state === "loading" || prods.state === "ready") return;
    setProds({ state: "loading" });
    repo.listProducts().then((r) => setProds({ state: "ready", rows: r.filter((x) => !x.farm_id) })).catch(() => setProds({ state: "failed" }));
  };
  const defPriceOf = (pid: string, cur: OldDebtCurrency): string => {
    const p = prods.state === "ready" ? prods.rows.find((x) => x.id === pid) : undefined;
    return p ? defaultPrice(p, cur) : "";
  };

  useEffect(() => {
    let live = true;
    import("@/lib/usdApi")
      .then((m) => m.usdApi.state())
      .then((s) => { if (live) setUsd(s.enabled && s.rate ? { state: "on", per100: Number(s.rate.rate) * 100 } : { state: "off" }); })
      .catch(() => { if (live) setUsd({ state: "failed" }); });
    return () => { live = false; };
  }, []);

  /* 0273: المجموعُ بحساب الخادم سطراً سطراً، والمبلغُ الفارغ = المجموع (يُرى بالخانة نفسِها — «ينزل»)، ولا يقلّ عنه. */
  const rowOk = (r: ItemRow) => (r.product_id != null || r.name.trim() !== "") && (milliOf(r.qty) ?? 0n) > 0n
    && centsOf(r.price) != null && (centsOf(r.price) ?? -1n) >= 0n;
  const sumC = items.reduce((acc, r) => acc + (rowOk(r) ? lineCents(milliOf(r.qty)!, centsOf(r.price)!) : 0n), 0n);
  const autoAmount = items.length > 0 && amount.trim() === "";
  const shownAmount = autoAmount ? plainDec(sumC, 2) : amount;
  const cents = centsOf(shownAmount);
  const over = items.length > 0 && cents != null && sumC > cents;
  const sumText = (c: bigint) => currency === "USD" ? `$${plainDec(c, 2)}` : money(Number(decText(c, 2)));
  // المعلَّقةُ تُعاد كما أُرسلت (والخادمُ يُرجع ما ثبت بمرجعها) — لا تُحجب بفحص اليوم ولا بحال الدولار الآن.
  const ok = pinned || ((name.trim() !== "" || phone.trim() !== "") && (what.trim() !== "" || items.length > 0) && cents != null && cents > 0n
    && date !== "" && date <= today && !(currency === "USD" && usd.state !== "on") && items.every(rowOk) && !over);

  const pick = (h: CustomerHit) => {
    playTap();
    cs.close();
    setName(h.name ?? "");
    setPhone(h.phone ?? "");
  };
  const keys = (field: CustField) => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (cs.open && cs.rows.length > 0) { e.preventDefault(); cs.move(e.key === "ArrowDown" ? 1 : -1); }
      return;
    }
    if (e.key === "Escape") { if (cs.open) { e.preventDefault(); cs.close(); } return; }
    if (e.key === "Enter" && cs.field === field) {
      const h = cs.highlighted();
      if (h) { e.preventDefault(); pick(h); }
    }
  };

  const save = async () => {
    if (busy || !ok) return;
    setBusy(true); setErr(null);
    const fresh = !pinned;
    try {
      const inv = await addOldDebt({
        name: name.trim() || null, phone: phone.trim() || null, what: what.trim(), why: why.trim() || null,
        amount: canonDec(shownAmount, 2), currency, date: date === today ? null : date, clientRef: ref.current,
        items: items.map((r) => ({ product_id: r.product_id, name: r.name.trim(), qty: decText(milliOf(r.qty)!, 3), price: decText(centsOf(r.price)!, 2) })),
      });
      playSuccess();
      const shown = currency === "USD" ? `$${formatNum(Number(inv.total_usd ?? 0))}` : money(inv.total);
      toast.success(t("odebt.saved", { amount: shown, client: inv.customer_name || inv.customer_phone || "—" }));
      writePending(null);
      onAdded(inv);
    } catch (e) {
      playWarning();
      if (shouldReleaseRef(fresh, e)) { ref.current = uid("odebt"); setPinned(false); writePending(null); }
      else {
        setPinned(true);
        writePending({ ref: ref.current, name, phone, what, why, amount, currency, date, items });
      }
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const field = "block text-xs font-bold text-ink-muted mb-1";
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={t("odebt.title")}>
      <div className="space-y-3.5" data-odebt-dialog>
        <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-muted">{t("odebt.intro")}</p>

        <fieldset disabled={pinned || busy} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <label className={field}>{t("odebt.name")}</label>
              <input className="input w-full" value={name} readOnly={locked} maxLength={80} data-odebt-name
                onChange={(e) => { setName(e.target.value); if (!locked) cs.type("name", e.target.value); }}
                onFocus={() => { if (!locked) cs.focus("name", name); }} onBlur={cs.blur} onKeyDown={keys("name")} />
              {!locked && cs.field === "name" && <CustomerDropdown cs={cs} onPick={pick} newLabel={t("odebt.newCustomer")} />}
            </div>
            <div className="relative">
              <label className={field}>{t("odebt.phone")}</label>
              <input className="input w-full" dir="ltr" inputMode="tel" value={phone} readOnly={locked} maxLength={40} data-odebt-phone
                onChange={(e) => { setPhone(e.target.value); if (!locked) cs.type("phone", e.target.value); }}
                onFocus={() => { if (!locked) cs.focus("phone", phone); }} onBlur={cs.blur} onKeyDown={keys("phone")} />
              {!locked && cs.field === "phone" && <CustomerDropdown cs={cs} onPick={pick} newLabel={t("odebt.newCustomer")} />}
            </div>
          </div>

          <div>
            <label className={field}>{t("odebt.what")}</label>
            <input className="input w-full" value={what} onChange={(e) => setWhat(e.target.value)} maxLength={200}
              placeholder={items.length > 0 ? t("odebt.whatAuto") : t("odebt.whatPh")} data-odebt-what />
          </div>
          <div>
            <label className={field}>{t("odebt.why")}</label>
            <textarea className="input min-h-[84px] w-full resize-y" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} data-odebt-why />
          </div>

          <ItemsEditor items={items} setItems={setItems} currency={currency} sumText={items.length > 0 ? sumText(sumC) : null}
            products={prods} loadProducts={loadProducts} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.amount")}</label>
              <input className="input w-full text-end font-bold tabular-nums" inputMode="decimal" dir="ltr" value={shownAmount}
                onChange={(e) => { const v = e.target.value; setAmount(items.length > 0 && v.trim() === plainDec(sumC, 2) ? "" : v); }}
                placeholder="0" data-odebt-amount data-auto={autoAmount ? "1" : undefined} />
            </div>
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.currency")}</label>
              <div className="flex gap-1 rounded-xl border border-line bg-surface-1 p-1">
                {(["IQD", "USD"] as const).map((c) => (
                  <button key={c} type="button" data-odebt-cur={c}
                    disabled={c === "USD" && usd.state !== "on"}
                    onClick={() => {
                      playTap();
                      // سعرُ السطر بعملة الدين: تبديلُها يعيد أسعارَ المخزن بعملتها ويمسح المكتوب (١٨٬٠٠٠ دينار لا تُقرأ دولاراً).
                      if (c !== currency) setItems((rs) => rs.map((r) => ({ ...r, price: r.product_id ? defPriceOf(r.product_id, c) : "" })));
                      setCurrency(c);
                    }}
                    className={cn("flex-1 rounded-lg px-2 py-1.5 text-sm font-bold transition disabled:opacity-40",
                      currency === c ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-2")}>
                    {c === "IQD" ? t("odebt.iqd") : t("odebt.usd")}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.date")}</label>
              <input type="date" className="input w-full" value={date} max={today} min="2000-01-01"
                onChange={(e) => setDate(e.target.value)} data-odebt-date />
            </div>
          </div>
          {currency === "USD" && usd.state === "on" && (
            <p className="text-2xs text-ink-subtle" data-odebt-usdnote>{t("odebt.usdNote", { rate: formatNum(usd.per100) })}</p>
          )}
          {usd.state === "failed" && <p className="text-2xs text-ink-subtle">{t("odebt.usdFailed")}</p>}
          {/* ما قُرئ من المبلغ يُرى بكلمة — «14.169.000» كانت تُوقف الزرَّ بصمت، و«14.169» تُقرأ ١٤ ديناراً وكسراً (بلاغُ المالك ١٦/١١). */}
          {!pinned && shownAmount.trim() !== "" && (cents == null ? (
            <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300" data-odebt-amountbad>{t("odebt.amountBad")}</p>
          ) : (
            <p className="text-2xs font-bold text-ink tabular-nums" data-odebt-amountread>
              {t("odebt.amountRead", { v: currency === "USD" ? `$${plainDec(cents, 2)}` : money(Number(decText(cents, 2))) })}
              {currency === "IQD" && cents % 100n !== 0n && <span className="ms-1.5 text-warn-700 dark:text-warn-300" data-odebt-amountfrac>{t("odebt.amountFrac")}</span>}
            </p>
          ))}
          {autoAmount && <p className="text-2xs text-ink-subtle" data-odebt-amountauto>{t("odebt.amountAuto")}</p>}
          {over && <p className="text-2xs font-bold text-danger-600 dark:text-danger-300" data-odebt-over>{t("odebt.itemsOver", { sum: sumText(sumC) })}</p>}
          {date !== "" && date < today && (
            <p className="flex items-center gap-1.5 text-2xs text-ink-subtle"><CalendarClock size={12} /> {t("odebt.dated", { day: formatDate(`${date}T12:00:00`, i18n.language, true) })}</p>
          )}
        </fieldset>

        {err && (
          <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-danger-50 p-2.5 text-sm font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-odebt-err>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span className="min-w-0 flex-1">{err}</span>
          </p>
        )}
        {pinned && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300" data-odebt-pinned>{t("odebt.unknown")}</p>}

        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={busy} disabled={!ok} onClick={save} data-odebt-save
            leftIcon={pinned ? <RotateCcw size={16} /> : <Coins size={16} />}>
            {pinned ? t("odebt.retry") : t("odebt.save")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { playTap(); onClose(); }}>{t("odebt.cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── موادُّ الدين (0273) ─────────────────────────────── */
type ProductsState = { state: "idle" } | { state: "loading" } | { state: "failed" } | { state: "ready"; rows: Product[] };

/** سعرُ المخزن بعملة الدين — مادّةُ الدولار بدين دينار (وبالعكس) بلا سعرٍ مقترح: يُكتب بيده. */
function defaultPrice(p: Product, cur: OldDebtCurrency): string {
  if (cur === "USD") return p.price_currency === "USD" && p.sell_price_usd != null ? String(Number(p.sell_price_usd)) : "";
  return p.price_currency === "USD" ? "" : String(Number(p.sell_price ?? 0) || "");
}

function ItemsEditor({ items, setItems, currency, sumText, products, loadProducts }: {
  items: ItemRow[];
  setItems: (f: (rs: ItemRow[]) => ItemRow[]) => void;
  currency: OldDebtCurrency;
  sumText: string | null;
  products: ProductsState;
  loadProducts: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    if (products.state !== "ready" || !q.trim()) return [];
    const s = searchable(q), byCode = codeMatcher(q);
    return products.rows.filter((p) => searchable(p.name).includes(s) || byCode(p)).slice(0, 8);
  }, [products, q]);
  const add = (p: Product) => {
    playTap();
    setItems((rs) => {
      const i = rs.findIndex((r) => r.product_id === p.id);
      if (i >= 0) {
        const n = (milliOf(rs[i].qty) ?? 0n) + 1000n;
        return rs.map((r, j) => (j === i ? { ...r, qty: plainDec(n, 3) } : r));
      }
      return [...rs, { k: uid("odi"), product_id: p.id, name: p.name, qty: "1", price: defaultPrice(p, currency), stock: Number(p.stock ?? 0) }];
    });
    setQ("");
  };
  const patch = (k: string, x: Partial<ItemRow>) => setItems((rs) => rs.map((r) => (r.k === k ? { ...r, ...x } : r)));
  const lbl = "block text-2xs font-bold text-ink-subtle mb-0.5";
  return (
    <div className="space-y-2 rounded-xl border border-line p-3" data-odebt-items>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-ink"><Package size={14} className="text-ink-subtle" /> {t("odebt.items")}</p>
        <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} data-odebt-free
          onClick={() => { playTap(); setItems((rs) => [...rs, { k: uid("odi"), product_id: null, name: "", qty: "1", price: "", stock: null }]); }}>
          {t("odebt.itemFree")}
        </Button>
      </div>
      <p className="text-2xs leading-relaxed text-ink-subtle">{t("odebt.itemsHint")}</p>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />
        <input className="input w-full ltr:pl-8 rtl:pr-8" value={q} onChange={(e) => { setQ(e.target.value); loadProducts(); }}
          onFocus={loadProducts} placeholder={t("odebt.itemSearch")} data-odebt-isearch />
      </div>
      {q.trim() !== "" && (
        products.state === "loading" || products.state === "idle" ? (
          <p className="flex items-center gap-1.5 text-2xs text-ink-subtle"><Loader2 size={12} className="animate-spin" /> {t("odebt.itemsLoading")}</p>
        ) : products.state === "failed" ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-2xs font-bold text-danger-600 dark:text-danger-300">
            {t("odebt.itemsLoadFailed")}
            <button type="button" className="underline" onClick={() => { playTap(); loadProducts(); }}>{t("odebt.tryAgain")}</button>
          </p>
        ) : hits.length === 0 ? (
          <p className="text-2xs text-ink-subtle" data-odebt-inone>{t("odebt.itemsNone")}</p>
        ) : (
          <div className="max-h-52 space-y-1 overflow-y-auto" data-odebt-hits>
            {hits.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} data-odebt-hit={p.id}
                className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-start text-sm transition hover:border-brand-300">
                <span className="min-w-0 flex-1 truncate font-bold text-ink">{p.name}</span>
                <span className="shrink-0 text-2xs text-ink-subtle">{t("odebt.itemStock", { n: formatNum(Number(p.stock ?? 0)) })}</span>
              </button>
            ))}
          </div>
        )
      )}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((r) => (
            <div key={r.k} className="grid grid-cols-[1fr,4.5rem,6rem,auto] items-end gap-1.5 rounded-lg bg-surface-2 p-2" data-odebt-row>
              <div className="min-w-0">
                <label className={lbl}>{t("odebt.itemName")}</label>
                {r.product_id ? (
                  <p className="truncate py-1.5 text-sm font-bold text-ink" data-odebt-rowname>{r.name}</p>
                ) : (
                  <input className="input h-9 w-full text-sm" value={r.name} maxLength={120} onChange={(e) => patch(r.k, { name: e.target.value })} data-odebt-rowname />
                )}
              </div>
              <div>
                <label className={lbl}>{t("odebt.itemQty")}</label>
                <input className="input h-9 w-full text-center text-sm tabular-nums" inputMode="decimal" dir="ltr" value={r.qty}
                  onChange={(e) => patch(r.k, { qty: e.target.value })} data-odebt-rowqty />
              </div>
              <div>
                <label className={lbl}>{t("odebt.itemPrice")}{currency === "USD" ? " $" : ""}</label>
                <input className="input h-9 w-full text-end text-sm tabular-nums" inputMode="decimal" dir="ltr" value={r.price}
                  onChange={(e) => patch(r.k, { price: e.target.value })} data-odebt-rowprice />
              </div>
              <button type="button" aria-label={t("odebt.itemRemove")} title={t("odebt.itemRemove")} data-odebt-rowdel
                onClick={() => { playTap(); setItems((rs) => rs.filter((x) => x.k !== r.k)); }}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-3 hover:text-danger-600"><X size={15} /></button>
            </div>
          ))}
          {sumText && <p className="text-end text-xs font-extrabold text-ink tabular-nums" data-odebt-sum>{t("odebt.itemsSum", { sum: sumText })}</p>}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── الشارة ─────────────────────────────── */
/** «دين سابق: شنو» — وبـ`full`: «ليش» وقاعدتا الغلط (لا ترجيع؛ حذفٌ قبل التسديد وإلا خصم). يومُ الكتابة يقوله رأسُ
 *  الفاتورة (شارةُ «سُجّلت لاحقاً»، 0242). */
export function OldDebtNote({ invoice, full, onChanged }: { invoice: Invoice; full?: boolean; onChanged?: (inv: Invoice) => void }) {
  const { t } = useTranslation();
  const what = (invoice.opening_what ?? "").trim();
  const settled = (invoice.payment_details ?? []).length > 0 || (Number(invoice.amount_paid) || 0) > 0.005;
  const chip = (
    <span className="chip inline-flex max-w-full items-center gap-1 bg-violet-50 text-2xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" data-odebt-tag>
      <History size={11} className="shrink-0" /> <span className="truncate">{what ? t("odebt.tagWhat", { what }) : t("odebt.tag")}</span>
    </span>
  );
  if (!full) return chip;
  return (
    <div className="space-y-1.5 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm dark:border-violet-500/30 dark:bg-violet-500/10" data-odebt-detail>
      <div>{chip}</div>
      {invoice.opening_why && (
        <p className="flex items-start gap-1.5 whitespace-pre-wrap text-xs text-ink [overflow-wrap:anywhere]"><NotebookPen size={13} className="mt-0.5 shrink-0 text-ink-subtle" /> {invoice.opening_why}</p>
      )}
      <p className="text-2xs leading-relaxed text-ink-muted">{settled ? t("odebt.noDelete") : t("odebt.rules")}</p>
      <OldDebtItems invoice={invoice} onChanged={onChanged} />
    </div>
  );
}

/* ─────────────────────────────── موادُّه ومرتجعُها (0273) ─────────────────────────────── */
type ItemsState = { state: "loading" } | { state: "absent" } | { state: "failed"; e: unknown } | { state: "ready"; rows: OldDebtItem[] };

/** موادُّ دينٍ قديم بما رجع منها، و«رجّع مواد»: الكميةُ لكلّ سطر (لا أكثر من الباقي)، ومعاينةُ الخادم نفسِها قبل الضغطة (الدينُ قبل ←
 *  بعد، والنقدُ الخارج وطريقتُه، وما يرجع للرفّ). الخادمُ يقرّر (old_debt_return)؛ ومرجعُ إعادةٍ واحد — المجهولُ يقفل على «أعد المحاولة».
 *  `startReturn`: من شاشة «المرتجع» — يُفتح على الإرجاع. ودينٌ بلا موادّ: بالتفاصيل لا شيء، وبالمرتجع جملتُه. */
export function OldDebtItems({ invoice, onChanged, startReturn }: { invoice: Invoice; onChanged?: (inv: Invoice) => void; startReturn?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [st, setSt] = useState<ItemsState>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState(!!startReturn);
  const [ret, setRet] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const ref = useRef(uid("odret"));
  const [inv, setInv] = useState(invoice);
  useEffect(() => { setInv(invoice); }, [invoice]);

  useEffect(() => {
    let live = true;
    setSt({ state: "loading" });
    listOldDebtItems(invoice.id)
      .then((r) => { if (live) setSt(r == null ? { state: "absent" } : { state: "ready", rows: r }); })
      .catch((e) => { if (live) setSt({ state: "failed", e }); });
    return () => { live = false; };
  }, [invoice.id, tick]);

  const usd = inv.currency === "USD";
  const rows = st.state === "ready" ? st.rows : [];
  const leftOf = (it: OldDebtItem) => (milliOf(it.qty) ?? 0n) - (milliOf(it.returned_qty) ?? 0n);
  const qOf = (it: OldDebtItem) => { const v = milliOf(ret[it.id] ?? ""); return v != null && v > 0n ? v : 0n; };
  const bad = rows.some((it) => { const raw = (ret[it.id] ?? "").trim(); if (!raw) return false; const v = milliOf(raw); return v == null || v < 0n || v > leftOf(it); });
  const picked = rows.filter((it) => qOf(it) > 0n);

  // معاينةٌ بقاعدة الخادم حرفاً (0121/0241): الدينُ أوّلاً، ثمّ الخصم، ثمّ النقد بما دُفع فوق الباقي.
  const c = (n: number | null | undefined) => centsOf(n ?? 0) ?? 0n;
  const valC = picked.reduce((acc, it) => acc + lineCents(qOf(it), c(it.unit_price)), 0n);
  const paid = c(inv.amount_paid), forg = c(inv.forgiven);
  const gross = c(inv.total) + forg - valC;
  const forgNew = forg < (gross - paid > 0n ? gross - paid : 0n) ? forg : (gross - paid > 0n ? gross - paid : 0n);
  const after = gross - forgNew;
  const back = paid - after > 0n ? paid - after : 0n;
  const dueBefore = c(inv.total) - paid > 0n ? c(inv.total) - paid : 0n;
  const dueAfter = after - (paid - back) > 0n ? after - (paid - back) : 0n;
  const m = (v: bigint) => money(Number(decText(v, 2)));
  const priceText = (it: OldDebtItem) => usd ? `$${formatNum(Number(it.unit_price_usd ?? 0))}` : money(it.unit_price);

  const save = async () => {
    if (busy || (!pinned && (picked.length === 0 || bad))) return;
    setBusy(true); setErr(null);
    const fresh = !pinned;
    try {
      const out = await returnOldDebt({
        invoiceId: inv.id, lines: picked.map((it) => ({ item_id: it.id, qty: decText(qOf(it), 3) })),
        method: back > 0n ? method : null, note: note.trim() || null, clientRef: ref.current,
      });
      playSuccess();
      toast.success(t("odebt.returnDone"));
      ref.current = uid("odret");
      setPinned(false); setRet({}); setNote(""); setMode(!!startReturn);
      setInv(out);
      setTick((n) => n + 1);
      onChanged?.(out);
    } catch (e) {
      playWarning();
      if (shouldReleaseRef(fresh, e)) { ref.current = uid("odret"); setPinned(false); } else setPinned(true);
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (st.state === "absent") return null;
  if (st.state === "loading") return startReturn ? <p className="p-4 text-center text-xs text-ink-subtle"><Loader2 size={14} className="inline animate-spin" /></p> : null;
  if (st.state === "failed") {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-2xs font-bold text-danger-600 dark:text-danger-300" data-odebt-itemsfailed>
        {t("odebt.itemsFailed")}
        <button type="button" className="underline" onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("odebt.tryAgain")}</button>
      </p>
    );
  }
  if (rows.length === 0) {
    return startReturn ? <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-muted" data-odebt-noitems>{t("odebt.returnNoItems")}</p> : null;
  }
  const anyLeft = rows.some((it) => leftOf(it) > 0n);
  const qty = (v: number | string) => formatNum(Number(v));
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-1 p-2.5" data-odebt-itemlist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-ink"><Package size={13} className="text-ink-subtle" /> {t("odebt.itemsTitle")}</p>
        {!mode && anyLeft && !usd && (
          <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} data-odebt-retopen onClick={() => { playTap(); setMode(true); }}>
            {t("odebt.returnBtn")}
          </Button>
        )}
      </div>
      <fieldset disabled={busy || pinned} className="space-y-1">
        {rows.map((it) => {
          const left = leftOf(it);
          const raw = ret[it.id] ?? "";
          const v = milliOf(raw);
          const wrong = raw.trim() !== "" && (v == null || v < 0n || v > left);
          return (
            <div key={it.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5", qOf(it) > 0n ? "bg-warn-50/70 dark:bg-warn-500/10" : "bg-surface-2")} data-odebt-item={it.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{it.name}</span>
                <span className="block text-2xs text-ink-subtle tabular-nums">
                  {qty(it.qty)} × {priceText(it)}
                  {Number(it.returned_qty) > 0 && <span className="ms-1.5 font-bold text-warn-700 dark:text-warn-300" data-odebt-returned>· {t("odebt.itemReturned", { n: qty(it.returned_qty) })}</span>}
                </span>
              </span>
              {mode && !usd && left > 0n && (
                <span className="flex items-center gap-1.5">
                  <span className="text-2xs text-ink-subtle">{t("odebt.returnLeft", { n: plainDec(left, 3) })}</span>
                  <input className={cn("input h-9 w-16 text-center text-sm tabular-nums", wrong && "border-danger-400")} inputMode="decimal" dir="ltr"
                    value={raw} placeholder="0" onChange={(e) => setRet((r) => ({ ...r, [it.id]: e.target.value }))} data-odebt-retqty={it.id} />
                </span>
              )}
            </div>
          );
        })}
      </fieldset>
      {usd && anyLeft && <p className="text-2xs leading-relaxed text-ink-subtle" data-odebt-retusd>{t("odebt.returnUsd")}</p>}
      {mode && !usd && anyLeft && (
        <div className="space-y-2 border-t border-line pt-2" data-odebt-retform>
          <p className="text-xs font-extrabold text-ink">{t("odebt.returnTitle")}</p>
          <input className="input w-full text-sm" value={note} maxLength={200} disabled={busy || pinned}
            onChange={(e) => setNote(e.target.value)} placeholder={t("odebt.returnNote")} data-odebt-retnote />
          {picked.length > 0 && !bad && (
            <div className="space-y-1 rounded-lg bg-surface-2 p-2 text-xs" data-odebt-retpreview>
              <p className="font-bold text-ink tabular-nums">{t("odebt.returnDebt", { after: m(dueAfter), before: m(dueBefore) })}</p>
              {back > 0n && <p className="font-bold text-warn-700 dark:text-warn-300 tabular-nums" data-odebt-retcash>{t("odebt.returnCash", { v: m(back) })}</p>}
              {picked.some((it) => it.product_id) && (
                <p className="text-ink-muted">{t("odebt.returnShelf", { list: picked.filter((it) => it.product_id).map((it) => `${it.name} × ${plainDec(qOf(it), 3)}`).join("، ") })}</p>
              )}
              {back > 0n && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-2xs font-bold text-ink-subtle">{t("odebt.returnMethod")}</span>
                  {(["cash", "card", "transfer"] as const).map((k) => (
                    <button key={k} type="button" disabled={busy || pinned} onClick={() => { playTap(); setMethod(k); }} data-odebt-retmethod={k}
                      className={cn("rounded-lg px-2 py-1 text-2xs font-bold", method === k ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted")}>
                      {t(`odebt.${k}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {err && <p role="alert" className="flex items-start gap-1.5 text-xs font-bold text-danger-700 dark:text-danger-300" data-odebt-reterr><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {err}</p>}
          {pinned && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300">{t("odebt.returnUnknown")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="flex-1" loading={busy} disabled={!pinned && (picked.length === 0 || bad)} onClick={save} data-odebt-retsave
              leftIcon={pinned ? <RotateCcw size={14} /> : <Undo2 size={14} />}>
              {pinned ? t("odebt.returnRetry") : t("odebt.returnConfirm")}
            </Button>
            {!startReturn && !pinned && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { playTap(); setMode(false); setRet({}); setErr(null); }}>{t("odebt.returnCancel")}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
