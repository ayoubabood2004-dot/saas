/* ============================================================================
 * شاشتا الدولار بسلوكهما (react-mini): «بيع بالدولار» ونافذةُ «تسديد دَين بالدولار» — المكوّنان الحقيقيّان، والبابُ بديلٌ يسجّل.
 *
 * ما يُفحص (مراجعةٌ عدائيّة قبل النشر):
 *   أ) نتيجةٌ مجهولة (انقطاعٌ بعد الإرسال): السلّةُ تُقفل (fieldset disabled + سطرُ «ما نعرف إذا انسجلت»)، و«أعد المحاولة»
 *      ترسل **المرجعَ نفسَه والسلّةَ نفسَها** — تعديلٌ ثمّ إعادةٌ كان يرجع الفاتورةَ الأولى ويقول «انسجلت» والمضافُ بلا فاتورة.
 *   ب) رفضٌ حاسم (رمزُ الخادم) لا يُقفل: لا شيء انسجل.
 *   ج) نافذةُ التسديد كذلك، وتسأل السعرَ عند كلّ فتح (لا سعرَ أمسٍ من مخبأ الدقيقة).
 *
 *   node scripts/usd-ui-test.mjs
 * ========================================================================= */
import { loadUI } from "./react-mini.mjs";

// متصفّحٌ مصغّر: مستمعا online/offline، وتخزينٌ لسؤال «السعر نفسه اليوم؟» (السعرُ من اليوم فلا يُسأل).
const mem = new Map();
globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = globalThis.localStorage ?? { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
// navigator: Node 22 فيه navigator أصلاً (onLine غائب ⇒ لا «انقطاع»).

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got === undefined ? "" : ` — ${JSON.stringify(got)}`}`); } };

const API = `
  export const calls = { checkout: [], settle: [], state: 0 };
  export const script = { checkout: [], settle: [] };
  const RATE = { id: "fx-1", rate: "1460.0000", rate1e4: 14600000n, note: null, set_by: null, created_at: new Date().toISOString() };
  const next = (k) => { const s = script[k].shift(); if (s instanceof Error) throw s; return s; };
  export const usdApi = {
    state: async () => { calls.state++; return { enabled: true, step: 250, rate: RATE }; },
    checkout: async (items, meta) => { calls.checkout.push({ items, meta }); return next("checkout"); },
    settle: async (...a) => { calls.settle.push(a); return next("settle"); },
    settlements: async () => [], rates: async () => [], setRate: async () => RATE, setPrefs: async () => ({}), voidSettlement: async () => ({}), deleteInvoice: async () => {},
    packReady: async () => script.packReady ?? true,
  };`;
const STUBS = {
  "@/lib/usdApi": API,
  "@/lib/clinics": "export const getActiveClinicId = () => 'c1';",
  "@/components/Modal": "export const Modal = ({ open, children }) => (open ? children : null);",
  /* رصيدُ الخادم الطازج لمادّةٍ فوق رصيد القائمة (سقفُ الدولار كالدينار، ١٦/١١) — بيد الفحص. */
  "@/lib/repo": "export const fresh = {}; export const asked = []; export const repo = { getProductById: async (id) => { asked.push(id); return fresh[id] ?? null; } };",
  "@/lib/invoicePrint": "export const invoiceNo = (id) => 'INV-' + String(id).slice(-4);",
  "@/components/retail/usePrintInvoice": "export const printed = []; export const useInvoicePrinter = () => async (inv, format, o) => { printed.push([inv.id, format]); o?.onCounted?.(printed.length); return printed.length; };",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, loading, variant, size, ...p }) => createElement("x-button", p, children);
    export const toasts = [];
    export const useToast = () => ({ success: (m) => toasts.push(["ok", m]), error: (m) => toasts.push(["err", m]), toast: (x) => toasts.push(["t", x.title]) });`,
};
const UI = await loadUI(`
  export { UsdSaleSheet, UsdSettleDialog } from "./src/components/usd/Usd.tsx";
  export * as api from "@/lib/usdApi";
  export * as repoStub from "@/lib/repo";
  export * as printStub from "@/components/retail/usePrintInvoice";
  export { toasts } from "@/components/ui";`, STUBS);
const { mount, React, UsdSaleSheet, UsdSettleDialog, api, toasts, repoStub, printStub } = UI;
const h = React.createElement;
const netErr = () => Object.assign(new Error("TypeError: Failed to fetch"), {});
const srvErr = (m) => Object.assign(new Error(m), { code: "P0001" });
const fieldsetDisabled = (m) => m.all().find((n) => n.type === "fieldset")?.props?.disabled === true;

/* ── أ/ب) بيعُ الدولار ─────────────────────────────────────────────────────── */
console.log("▸ «بيع بالدولار»: نتيجةٌ مجهولة تُقفل السلّة، والإعادةُ بالمرجع والسلّة نفسيهما");
{
  const P = { id: "p1", name: "Kitcat", barcode: "K1", price_currency: "USD", sell_price_usd: 50, stock: 100, pooled: false };
  const sold = [];
  const m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, onClose() {}, onSold: (inv) => sold.push(inv) }));
  await m.settle();
  check("السلّةُ فيها المادّةُ الملموسة، والحسابُ «$50»", m.text().includes("$50") && m.findAll("data-usd-lines").length === 1, m.text().slice(0, 120));
  api.script.checkout.push(netErr());
  m.click(m.find("data-usd-sale-go"));
  await m.settle();
  check("انقطاعٌ بعد الإرسال ⇒ «ما نعرف إذا انسجلت» والسلّةُ مقفولة (fieldset disabled)", !!m.find("data-usd-pending") && fieldsetDisabled(m));
  check("  والزرُّ «أعد المحاولة» لا «سجّل البيع»", m.text().includes("usd.sale.retry"), m.find("data-usd-sale-go") && m.text(m.find("data-usd-sale-go")));
  api.script.checkout.push({ id: "inv-1", currency: "USD", total: 73000 });
  m.click(m.find("data-usd-sale-go"));
  await m.settle();
  const [a, b] = api.calls.checkout;
  check("  والإعادةُ بالمرجع نفسِه والسطورِ نفسِها (لا فاتورةٌ ثانية ولا فاتورةٌ أولى عن سلّةٍ غيرِها)",
    a && b && a.meta.client_ref === b.meta.client_ref && JSON.stringify(a.items) === JSON.stringify(b.items), api.calls.checkout.map((c) => c.meta.client_ref));
  check("  ونجاحُها يفكّ القفل ويقول انسجلت", !m.find("data-usd-pending") && !fieldsetDisabled(m) && sold.length === 1 && toasts.some((x) => x[0] === "ok"));
  m.unmount();
}

/* ── د) بعد البيعة: الإيصالُ والطباعة داخل السلّة (كان توستاً وحده ولا ورقةَ للزبون) ─────────────────────── */
console.log("▸ «تمّ» بالسلّة نفسِها: المبلغُ والطباعة و«سلّة جديدة»");
{
  const P = { id: "p5", name: "Kitcat", barcode: "K5", price_currency: "USD", sell_price_usd: 50, stock: 100, pooled: false };
  const m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, onClose() {}, onSold() {} }));
  await m.settle();
  api.script.checkout.push({ id: "inv-done-1", currency: "USD", total: 73000, total_usd: 50, paid_usd: 0 });
  m.click(m.find("data-usd-sale-go"));
  await m.settle();
  check("بعد البيعة: لوحةُ «تمّ» بالمبلغ بالدولار وباقي الدين ($50)", !!m.find("data-usd-done") && m.text().includes("$50") && m.text().includes("usd.sale.doneDebt"), m.text().slice(0, 160));
  m.click(m.find("data-usd-print", "thermal"));
  await m.settle();
  check("  و«إيصال 80مم» يطبع هذه الفاتورة", printStub.printed.some(([id, f]) => id === "inv-done-1" && f === "thermal"), printStub.printed);
  m.click(m.find("data-usd-new"));
  await m.settle();
  check("  و«سلّة جديدة» ترجع لسلّةٍ فارغة", !m.find("data-usd-done") && !!m.find("data-usd-sale"), m.text().slice(0, 80));
  m.unmount();
}

/* ── و) كارتونُ الدولار (0272): سطرُه بسعره (العلبةُ × العدد أو المكتوب)، والرفُّ مشترك، والخادمُ القديم لا يُرسل له ─────────── */
console.log("▸ كارتونُ الدولار بالسلّة");
{
  const K = { id: "u12", name: "كارتون", codes: ["CTN-U12"], per: 12, purchase_price: null, sell_price: null };
  const P = { id: "pk1", name: "Royal", barcode: "R1", price_currency: "USD", sell_price_usd: 5, purchase_price_usd: 4, stock: 30, pooled: false, packs: [K] };
  api.calls.checkout.length = 0;
  const m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstPack: K, firstTick: 1, onClose() {}, onSold() {} }));
  await m.settle();
  check("لمسةُ كارتون ⇒ سطرُ كارتونٍ بسعره المحسوب ($60 = ٥ × ١٢) وباسمه", !!m.find("data-usd-pack") && m.text().includes("$60") && m.findAll("data-usd-line").length === 1, m.text().slice(0, 160));
  api.script.checkout.push({ id: "inv-k1", currency: "USD", total: 87600, total_usd: 60, paid_usd: 60 });
  m.click(m.find("data-usd-sale-go"));
  await m.settle();
  const it = api.calls.checkout[0]?.items?.[0];
  check("  والبيعةُ ترسل الكارتونَ بعدده (pack_id، pack_per ١٢) وسعرِه (60)", it?.pack_id === "u12" && it?.pack_per === 12 && it?.qty === 1 && it?.unit_price_usd === "60", it);
  m.unmount();
  // لمسةٌ واحدة = سطرٌ واحد ولو شغّل StrictMode الأثرَ مرّتين (المشيُ بالمتصفّح: مسحةُ كارتونٍ نزلت كارتونين).
  const ms = mount(h(React.StrictMode, null, h(UsdSaleSheet, { open: true, products: [P], first: P, firstPack: K, firstTick: 7, onClose() {}, onSold() {} })), { concurrent: true });
  await ms.settle();
  const qIn = ms.all().find((n) => n.type === "input" && n.props.inputMode === "numeric");
  check("  وتحت StrictMode (الأثرُ مرّتين): مسحةٌ واحدة كارتونٌ واحد ($60 لا $120)", String(qIn?.props.value) === "1", qIn?.props.value);
  ms.unmount();
  const P2 = { ...P, id: "pk2", stock: 20 };
  // الأبُ يمسك اللمسة: كارتونٌ أوّلاً ثمّ علبةٌ للمادّة نفسِها (سطران يقتسمان رفّاً).
  const Host = () => { const [f, setF] = React.useState({ pack: K, tick: 1 }); globalThis.__setFirst = setF;
    return h(UsdSaleSheet, { open: true, products: [P2], first: P2, firstPack: f.pack, firstTick: f.tick, onClose() {}, onSold() {} }); };
  const m2 = mount(h(Host));
  await m2.settle(); await m2.settle();
  check("  ورفُّ ٢٠: كارتونُ ١٢ وحده يمرّ", m2.find("data-usd-sale-go")?.props.disabled !== true && !m2.find("data-usd-short"), m2.text().slice(0, 100));
  m2.fire(() => globalThis.__setFirst({ pack: null, tick: 2 }));
  await m2.settle();
  const boxQty = m2.all().find((n) => n.type === "input" && n.props.inputMode === "numeric" && String(n.props.value) === "1"
    && m2.all().some((x) => x.props && x.props["data-usd-line"] === "pk2:"));
  m2.fire(() => m2.all().filter((n) => n.type === "input" && n.props.inputMode === "numeric")[1].props.onChange({ target: { value: "9" } }));
  await m2.settle(); await m2.settle();
  check("  وتسعُ علبٍ بجانبه تتجاوز الرفَّ المشترك (١٢ + ٩ = ٢١ > ٢٠) ⇒ يُقفل ويقول لماذا — كلٌّ بسقفه كان يبيع الرفَّ مرّتين",
    !!boxQty && m2.find("data-usd-sale-go")?.props.disabled === true && !!m2.find("data-usd-short"), m2.text().slice(0, 200));
  m2.unmount();
  api.script.packReady = false;
  api.calls.checkout.length = 0;
  const m3 = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstPack: K, firstTick: 1, onClose() {}, onSold() {} }));
  await m3.settle();
  m3.click(m3.find("data-usd-sale-go"));
  await m3.settle();
  check("قاعدةٌ قبل 0272 (لا تعرف الكارتون): لا يُرسل شيء ويقول «يحتاج تحديث القاعدة»", api.calls.checkout.length === 0 && toasts.some((x) => x[0] === "err" && x[1] === "usd.sale.packNotReady"), toasts.slice(-2));
  api.script.packReady = true;
  m3.unmount();
}

/* ── هـ) السقف: فوق الرصيد لا يُباع كالدينار، إلا والوضعُ (البيع قبل الجرد) يرفعه — قرارُ المالك ١٦/١١ ───────────── */
console.log("▸ سقفُ الرصيد: يُسأل الخادم، ويُمنع، والوضعُ يرفعه");
{
  const P = { id: "p6", name: "Royal", barcode: "R6", price_currency: "USD", sell_price_usd: 20, purchase_price_usd: 15, stock: 0, pooled: false };
  let m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, onClose() {}, onSold() {} }));
  await m.settle(); await m.settle();
  check("رصيدُ القائمة صفر ⇒ يُسأل الخادمُ عن رصيده قبل الحكم", repoStub.asked.includes("p6"), repoStub.asked);
  check("  والخادمُ يقول صفر ⇒ الزرُّ مقفول وسطرٌ يقول لماذا (لا بيعَ فوق الرصيد)", m.find("data-usd-sale-go")?.props.disabled === true && !!m.find("data-usd-short") && m.find("data-usd-over", "short") != null);
  m.unmount();
  repoStub.fresh.p6 = { ...P, stock: 4 };
  m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, onClose() {}, onSold() {} }));
  await m.settle(); await m.settle();
  check("رصيدٌ وصل من جهازٍ آخر (الخادم ٤ والقائمة صفر) ⇒ يُباع (لا «فوق الرصيد» عن رصيدٍ موجود)", m.find("data-usd-sale-go")?.props.disabled !== true && !m.find("data-usd-short"), m.text().slice(0, 140));
  m.unmount();
  delete repoStub.fresh.p6;
  m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, canExceed: () => true, onClose() {}, onSold() {} }));
  await m.settle(); await m.settle();
  check("والوضعُ يرفعها ⇒ تُباع تحت الصفر وتُعلَّم «البيع قبل الجرد مفعّل»", m.find("data-usd-sale-go")?.props.disabled !== true && m.find("data-usd-over", "lifted") != null && !m.find("data-usd-short"));
  m.unmount();
}
{
  const P = { id: "p2", name: "Treat", barcode: "T1", price_currency: "USD", sell_price_usd: 0.4, stock: 100, pooled: false };
  api.calls.checkout.length = 0;
  const m = mount(h(UsdSaleSheet, { open: true, products: [P], first: P, firstTick: 1, onClose() {}, onSold() {} }));
  await m.settle();
  api.script.checkout.push(srvErr("usd_rate_changed"));
  m.click(m.find("data-usd-sale-go"));
  await m.settle();
  check("رفضٌ حاسم من الخادم (usd_rate_changed) لا يُقفل: لا شيء انسجل والسلّةُ تتعدّل", !m.find("data-usd-pending") && !fieldsetDisabled(m));
  m.unmount();
}

/* ── ج) التسديد ─────────────────────────────────────────────────────────────── */
console.log("▸ «تسديد دَين بالدولار»: السعرُ يُسأل عند الفتح، والنتيجةُ المجهولة تُقفل");
{
  const INV = { id: "inv-a", currency: "USD", total: 1460000, amount_paid: 0, total_usd: 1000, paid_usd: 0, fx_rate: 1460, payment_details: [] };
  const before = api.calls.state;
  const m = mount(h(UsdSettleDialog, { invoice: INV, onClose() {}, onSettled() {} }));
  await m.settle();
  check("الفتحُ يسأل السعرَ من جديد (لا سعرَ مخبأ الدقيقة)", api.calls.state > before, api.calls.state - before);
  const rateIn = m.find("data-usd-rate");
  check("  وخانةُ السعر بسعر اليوم (146000)", rateIn?.props?.value === "146000", rateIn?.props?.value);
  api.script.settle.push(netErr());
  m.click(m.find("data-usd-settle-go"));
  await m.settle();
  check("انقطاعٌ بعد الإرسال ⇒ مقفولة، و«أعد المحاولة»", !!m.find("data-usd-pending") && fieldsetDisabled(m) && m.text().includes("usd.settle.retry"));
  api.script.settle.push({ invoice: INV, settlement: { id: "s1" } });
  m.click(m.find("data-usd-settle-go"));
  await m.settle();
  const [s1, s2] = api.calls.settle;
  check("  والإعادةُ بالمرجع والمبلغ والسعر أنفسها (النصُّ القانونيّ يصنعه البابُ — usd-test)",
    s1 && s2 && s1[6] === s2[6] && s1[1] === s2[1] && s1[2] === s2[2] && s1[1] === "1000" && s1[2] === "146000", api.calls.settle);
  m.unmount();
}

console.log(fail ? `\n✗ usd-ui-test: ${pass} نجح، ${fail} فشل` : `\n✓ usd-ui-test: ${pass} نجح، 0 فشل`);
process.exit(fail ? 1 : 0);
