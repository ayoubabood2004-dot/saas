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
import { CheckCircle2, Minus, Plus, Printer, Search, ShoppingBag, Trash2, Wifi, WifiOff } from "lucide-react";
import type { Invoice, Product, ProductPack } from "@/types";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatNum, normalizeCode, searchable, uuid } from "@/lib/utils";
import { usdApi, type UsdMethod } from "@/lib/usdApi";
import { repo } from "@/lib/repo";
import { invoiceNo } from "@/lib/invoicePrint";
import { useInvoicePrinter } from "@/components/retail/usePrintInvoice";
import { shouldReleaseRef } from "@/lib/errors";
import { cartTotals, cashAtSale, centsOf, usdText } from "@/lib/usdMath";
import { refreshUsdState, StaleRateBanner, UsdChip, usdErrorText, usdIso, useStaleRate, useUsdState } from "./usdShared";

/** سطرٌ بالسلّة: علبةٌ، أو كارتونٌ (0272) — qty كراتين وما ينقص من الرصيد qty × per. */
interface Line { product: Product; qty: number; pack?: ProductPack | null }
const keyOf = (p: Product, pack?: ProductPack | null) => `${p.id}:${pack?.id ?? ""}`;
const lineKey = (l: Line) => keyOf(l.product, l.pack);
const METHODS: UsdMethod[] = ["cash", "card", "transfer"];
const cents = (n: number | null | undefined): bigint => centsOf(n == null ? "0" : String(n)) ?? 0n;
const iqd = (n: bigint) => formatNum(Number(n));
const plain = (c: bigint) => usdText(c).replace(/[$,]/g, "");

export function UsdSaleSheet({ open, products, first, firstPack = null, firstTick = 0, wholesale = false, canExceed, onClose, onSold }: {
  open: boolean; products: Product[]; first?: Product | null;
  /** كارتونٌ ممسوح (0272): اللمسةُ سطرُ كارتونٍ لا علبة. */
  firstPack?: ProductPack | null;
  /** يكبر بكلّ لمسة — نفسُ المادّة مرّتين تزيد سطرَها (المرجعُ نفسُه لا يحرّك أثراً). */
  firstTick?: number;
  /** شاشةُ الجملة: سعرُ القائمة `purchase_price_usd` كما تأخذ الجملةُ `purchase_price` (الخطّة §٩). */
  wholesale?: boolean;
  /** البيعُ قبل الجرد (0266) يرفع سقفَ هذه المادّة الآن؟ — حكمُ شاشة البيع نفسُه (قرارُ المالك ١٦/١١: «يمنعه مثل الدينار»). */
  canExceed?: (p: Product) => boolean;
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
  /** أُرسل بهذا المرجع شيء؟ ونتيجتُه مجهولة؟ (انقطاعٌ أو مهلة بعد الإرسال — ربما انسجلت). مجهولةً تُقفل السلّة: الإعادةُ بالمرجع
   *  نفسِه وحدها؛ تعديلٌ ثمّ إعادةٌ كان يرجع الفاتورةَ الأولى ويقول «انسجلت» والسطرُ المضاف لا فاتورةَ له ولا خصمَ مخزن. */
  const sentRef = useRef(false);
  const [pending, setPending] = useState(false);
  /** البيعةُ تمّت: الإيصالُ والطباعة داخل السلّة — كان توستاً وحده ولا ورقةَ للزبون (فاتورةُ الدينار لها شاشةُ «تمّ»). */
  const [done, setDone] = useState<Invoice | null>(null);
  const [prints, setPrints] = useState(0);
  const print = useInvoicePrinter();
  /** رصيدٌ طازجٌ من الخادم لمادّةٍ فوق رصيد القائمة — القائمةُ لقطةٌ قد تكون بعمر ساعات، و«فوق الرصيد» عن رصيدٍ وصل من جهازٍ
   *  آخر كان سيمنع بيعاً صحيحاً (بابُ التوائم: «زيد رصيده» عمّا هو موجود). */
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  // لمسةٌ جديدة لمادّةٍ بالدولار وهي مفتوحة: تُضاف للسلّة (أو تزيد سطرَها) — لا سلّةٌ ثانية.
  /* لمسةٌ واحدة = سطرٌ واحد: الأثرُ يُطبَّق مرّةً لكلّ رقم لمسة (StrictMode يشغّله مرّتين عند التركيب — مسحةُ كارتونٍ واحدة نزلت
   * كارتونين بالمشي بالمتصفّح، ١٦/١١). */
  const appliedTick = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !first || sentRef.current) return;   // سلّةٌ مقفولةٌ على نتيجةٍ مجهولة لا تتغيّر
    if (appliedTick.current === firstTick) return;
    appliedTick.current = firstTick;
    const k = keyOf(first, firstPack);
    setLines((ls) => (ls.some((l) => lineKey(l) === k)
      ? ls.map((l) => (lineKey(l) === k ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { product: first, qty: 1, pack: firstPack }]));
  }, [open, first, firstPack, firstTick]);

  const usdProducts = useMemo(() => products.filter((p) => p.price_currency === "USD"), [products]);
  const matches = useMemo(() => {
    // الطرفان من الدالّة نفسِها (الاسمُ بـsearchable والباركودُ بـnormalizeCode) — تطبيعُ طرفٍ واحد يفشل بصمت.
    const s = searchable(q), normKey = normalizeCode(q);
    if (!s && !normKey) return [];
    /* ورمزُ كارتونٍ (0272) يُنزل سطرَ كارتون — المسحُ بالسلّة نفسِها كالمسح بشاشة البيع. */
    const out: { p: Product; pack: ProductPack | null }[] = [];
    for (const p of usdProducts) {
      const pack = normKey ? (Array.isArray(p.packs) ? p.packs : []).find((k) => (k.codes ?? []).some((c) => normalizeCode(c) === normKey)) ?? null : null;
      if (pack) out.push({ p, pack });
      else if (searchable(p.name).includes(s) || (!!normKey && normalizeCode(p.barcode) === normKey)) out.push({ p, pack: null });
      if (out.length >= 8) break;
    }
    return out;
  }, [q, usdProducts]);

  const add = (p: Product, pack: ProductPack | null = null) => {
    playTap();
    const k = keyOf(p, pack);
    setLines((ls) => (ls.some((l) => lineKey(l) === k) ? ls.map((l) => (lineKey(l) === k ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { product: p, qty: 1, pack }]));
    setQ("");
  };
  const setQty = (key: string, qty: number) => setLines((ls) => ls.map((l) => (lineKey(l) === key ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => lineKey(l) !== key));

  const disc = centsOf(discount) ?? 0n;
  const unitOf = (p: Product): number | null | undefined => (wholesale ? p.purchase_price_usd ?? p.sell_price_usd : p.sell_price_usd);
  /** سعرُ السطر بالسنت: العلبة، والكارتونُ (0272) بسعره المكتوب بالدولار وإلا العلبةُ × العدد — كالخادم (والجملةُ بسعر الشراء). */
  const unitCentsOf = (l: Line): bigint | null => {
    const box = unitOf(l.product);
    if (!l.pack) return box == null ? null : cents(box);
    const own = wholesale ? l.pack.purchase_price : l.pack.sell_price;
    if (own != null) return cents(own);
    return box == null ? null : cents(box) * BigInt(l.pack.per);
  };
  const priced = lines.every((l) => unitCentsOf(l) != null);
  /** رصيدُ السطر: الطازجُ إن سُئل، وإلا القائمة. وفوقه لا يُباع — إلا والوضعُ يرفع المادّة (قرارُ المالك: كالدينار بالضبط). */
  const stockOf = (p: Product): number => fresh[p.id] ?? (Number(p.stock) || 0);
  /** ما تأخذه سطورُ المادّة كلُّها من رفّها (علبٌ وكراتين — 0272): كلٌّ بسقفه وحده كان يبيع الرفَّ مرّتين. */
  const usedOf = (id: string): number => lines.reduce((n, l) => (l.product.id === id ? n + l.qty * (l.pack?.per ?? 1) : n), 0);
  const overOf = (l: Line): boolean => !l.product.pooled && stockOf(l.product) < usedOf(l.product.id);
  const liftedOf = (l: Line): boolean => overOf(l) && !!canExceed?.(l.product);
  const shortLine = lines.find((l) => overOf(l) && !liftedOf(l)) ?? null;
  /* فوق رصيد القائمة ⇒ يُسأل الخادمُ مرّةً لكلّ مادّةٍ وكمّية (لا عند كلّ رسمة). */
  useEffect(() => {
    for (const l of lines) {
      if (!overOf(l)) continue;
      const k = `${l.product.id}:${usedOf(l.product.id)}`;
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      void repo.getProductById(l.product.id).then((row) => {
        if (row && Number.isFinite(Number(row.stock))) setFresh((f) => ({ ...f, [l.product.id]: Number(row.stock) }));
      }, () => { asked.current.delete(k); /* swallow-ok: بلا جواب يبقى رصيدُ القائمة حاكماً والبيعُ ممنوعاً — يُعاد السؤالُ بالتغيير التالي */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);
  const totals = rate && priced
    ? cartTotals(lines.map((l) => ({ qty: BigInt(l.qty), unitCents: unitCentsOf(l) ?? 0n })), disc, rate.rate1e4)
    : null;
  const cash = totals && paid ? cashAtSale(totals.totalUsdCents, totals.totalIqd, rate!.rate1e4, state!.step) : null;
  const needCustomer = !paid && !name.trim() && !phone.trim();
  const blocked = busy || !online || !state?.enabled || !rate || !totals || lines.length === 0 || stale || needCustomer || !!shortLine || (discount.trim() !== "" && centsOf(discount) == null);

  /* والرصيدُ الطازج يُنسى مع السلّة: بيعةٌ أنقصته، فرقمُه قبلها كان سيسمح للسلّة التالية فوق ما بقي (القائمةُ تتحدّث بعد البيعة). */
  const reset = () => { setLines([]); setDiscount(""); setPaid(true); setMethod("cash"); setName(""); setPhone(""); setNotes(""); ref.current = uuid(); sentRef.current = false; setPending(false); setFresh({}); asked.current.clear(); };
  const submit = async () => {
    if (blocked || !totals || !rate) return;
    setBusy(true);
    /* كارتونٌ والخادمُ ما يعرفه (قاعدةٌ قبل 0272): لا يُرسل — جسمُ 0264 كان سيبيعه علبةً بسعر كارتون. */
    if (lines.some((l) => l.pack) && !sentRef.current) {
      const ready = await usdApi.packReady().catch(() => null);
      if (ready !== true) { setBusy(false); playWarning(); toast.error(t(ready === false ? "usd.sale.packNotReady" : "usd.err.offline")); return; }
    }
    const fresh = !sentRef.current;
    sentRef.current = true;
    try {
      // سعرُ الوحدة يُرسَل صريحاً: هو ما رآه الكاشير (والجملةُ بسعر قائمتها) — والخادمُ يحسب دينارَه.
      const inv = await usdApi.checkout(lines.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_price_usd: plain(unitCentsOf(l) ?? 0n),
        ...(l.pack ? { pack_id: l.pack.id, pack_per: l.pack.per } : {}) })), {
        fx_rate_id: rate.id, paid_usd: paid ? plain(totals.totalUsdCents) : "0", payment_method: method,
        discount_usd: disc > 0n ? plain(disc) : null, customer_name: name.trim() || null, customer_phone: phone.trim() || null,
        notes: notes.trim() || null, client_ref: ref.current, sale_kind: wholesale ? "wholesale" : null,
      });
      playSuccess();
      toast.success(t("usd.sale.done"));
      reset();
      setDone(inv);
      setPrints(0);
      onSold(inv);
    } catch (e) {
      playWarning();
      // رفضٌ حاسم (رمزُ الخادم) بأوّل إرسال: لا شيء انسجل، فالمرجعُ يتحرّر والسلّةُ تتعدّل. وغيرُه مجهولُ المصير: تُقفل.
      if (shouldReleaseRef(fresh, e)) sentRef.current = false;
      else if (!pending) setPending(true);
      toast.error(usdErrorText(e, t));
      if ((e as Error)?.message === "usd_rate_changed") void refreshUsdState();
    } finally { setBusy(false); }
  };

  return (
    // الإغلاقُ لا يرمي السلّة: المكوّنُ يبقى مركّباً والسلّةُ تنتظر حتى يُرجع إليها.
    <Modal open={open} onClose={() => { setDone(null); onClose(); }} title={t("usd.sale.title")} size="wide">
      {done ? (
        <div className="space-y-4 text-center" data-usd-done>
          <CheckCircle2 size={40} className="mx-auto text-success-600" />
          <p className="font-display text-lg font-extrabold text-ink">{t("retail.saleComplete", "تم البيع")} · <span className="font-mono text-sm">{invoiceNo(done.id)}</span></p>
          <p className="font-display text-3xl font-extrabold tabular-nums text-ink" dir="ltr">{usdText(cents(done.total_usd))}</p>
          {cents(done.total_usd) > cents(done.paid_usd) && (
            <p className="text-sm font-semibold text-warn-700 dark:text-warn-300">{t("usd.sale.doneDebt", { v: usdIso(cents(done.total_usd) - cents(done.paid_usd)) })}</p>
          )}
          {prints > 0 && <p className="text-xs text-ink-subtle">{t("retail.printedTimes", { n: prints, defaultValue: "طُبعت {{n}}×" })}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" leftIcon={<Printer size={16} />} data-usd-print="a4" onClick={() => { playTap(); void print(done, "a4", { onCounted: setPrints }); }}>{t("retail.printA4", "طباعة A4")}</Button>
            <Button variant="secondary" leftIcon={<Printer size={16} />} data-usd-print="thermal" onClick={() => { playTap(); void print(done, "thermal", { onCounted: setPrints }); }}>{t("retail.printReceipt", "إيصال 80مم")}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => { playTap(); setDone(null); onClose(); }}>{t("common.close", "إغلاق")}</Button>
            <Button data-usd-new onClick={() => { playTap(); setDone(null); }}>{t("usd.sale.newCart")}</Button>
          </div>
        </div>
      ) : (
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

        {pending && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-usd-pending>
            <span className="min-w-0 flex-1">{t("usd.sale.pending")}</span>
            <button type="button" className="text-xs font-bold text-warn-800 underline dark:text-warn-200" onClick={() => { playTap(); reset(); }}>{t("usd.sale.newCart")}</button>
          </div>
        )}
        <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input data-usd-search className="input ps-9" placeholder={t("usd.sale.search")} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); add(matches[0].p, matches[0].pack); } }} />
          {q.trim() !== "" && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface-1 shadow-raised">
              {matches.length === 0 ? <li className="px-3 py-2 text-sm text-ink-subtle">{t("usd.sale.noMatch")}</li> : matches.map(({ p, pack }) => {
                const u = unitCentsOf({ product: p, qty: 1, pack });
                return (
                  <li key={keyOf(p, pack)}>
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-surface-2" onClick={() => add(p, pack)}>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}{pack && <span className="ms-1 text-2xs font-bold text-brand-700 dark:text-brand-300">· {pack.name} ×{pack.per}</span>}</span>
                      <span className="text-2xs text-ink-subtle">{t("usd.sale.stock", { n: formatNum(p.stock ?? 0) })}</span>
                      <span className="font-bold tabular-nums text-success-700 dark:text-success-300" dir="ltr">{u == null ? "—" : usdText(u)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-subtle"><ShoppingBag size={26} className="mb-1 opacity-40" />{t("usd.sale.empty")}</div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line" data-usd-lines>
            {lines.map((l, j) => {
              const unit = unitCentsOf(l);
              const lk = lineKey(l);
              const over = overOf(l);
              const lifted = liftedOf(l);
              return (
                <li key={lk} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-usd-line={lk}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{l.product.name}{l.pack && <span className="ms-1 text-2xs font-bold text-brand-700 dark:text-brand-300" data-usd-pack>· {l.pack.name} ×{l.pack.per}</span>}</p>
                    <p className="text-2xs text-ink-subtle">
                      <span dir="ltr">{unit == null ? t("usd.err.usd_no_price") : usdText(unit)}</span>
                      {totals && unit != null && <> · {iqd(totals.unitIqd[j])}</>}
                      {over && <span className={cn("ms-1 font-semibold", lifted ? "text-warn-700 dark:text-warn-300" : "text-danger-600 dark:text-danger-300")} data-usd-over={lifted ? "lifted" : "short"}>
                        {t(lifted ? "usd.sale.overLifted" : "usd.sale.overStock", { n: formatNum(stockOf(l.product)) })}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="−" className="grid h-8 w-8 place-items-center rounded-lg border border-line" onClick={() => setQty(lk, l.qty - 1)}><Minus size={14} /></button>
                    <input className="input h-8 w-14 text-center tabular-nums" inputMode="numeric" value={l.qty} onChange={(e) => setQty(lk, Number(e.target.value))} />
                    <button type="button" aria-label="+" className="grid h-8 w-8 place-items-center rounded-lg border border-line" onClick={() => setQty(lk, l.qty + 1)}><Plus size={14} /></button>
                  </div>
                  <span className="w-24 text-end font-bold tabular-nums text-ink" dir="ltr">{unit == null ? "—" : usdText(unit * BigInt(l.qty))}</span>
                  <button type="button" aria-label={t("usd.sale.remove")} className="text-ink-subtle hover:text-danger-600" onClick={() => remove(lk)}><Trash2 size={15} /></button>
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

        </fieldset>

        <Button className="w-full" size="lg" loading={busy} disabled={blocked} onClick={submit} data-usd-sale-go>
          {!totals ? t("usd.sale.title") : pending ? t("usd.sale.retry", { v: usdIso(totals.totalUsdCents) })
            : t(paid ? "usd.sale.confirmCash" : "usd.sale.confirmDebt", { v: usdIso(totals.totalUsdCents) })}
        </Button>
        {shortLine && <p className="text-center text-xs font-semibold text-danger-600 dark:text-danger-300" data-usd-short>{t("usd.sale.shortBlock", { name: shortLine.product.name, n: formatNum(stockOf(shortLine.product)) })}</p>}
      </div>
      )}
    </Modal>
  );
}
