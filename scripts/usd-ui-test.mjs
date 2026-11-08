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
  };`;
const STUBS = {
  "@/lib/usdApi": API,
  "@/lib/clinics": "export const getActiveClinicId = () => 'c1';",
  "@/components/Modal": "export const Modal = ({ open, children }) => (open ? children : null);",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, loading, variant, size, ...p }) => createElement("x-button", p, children);
    export const toasts = [];
    export const useToast = () => ({ success: (m) => toasts.push(["ok", m]), error: (m) => toasts.push(["err", m]), toast: (x) => toasts.push(["t", x.title]) });`,
};
const UI = await loadUI(`
  export { UsdSaleSheet, UsdSettleDialog } from "./src/components/usd/Usd.tsx";
  export * as api from "@/lib/usdApi";
  export { toasts } from "@/components/ui";`, STUBS);
const { mount, React, UsdSaleSheet, UsdSettleDialog, api, toasts } = UI;
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
