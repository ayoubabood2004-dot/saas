/* ============================================================================
 * مرآةُ الدين القديم (0271) للتجريبيّ — حرّاسُ old_debt_add نفسُها بترتيبها (CLAUDE.md §٤: حارسٌ لا يوجد هنا حارسٌ لم يُفحص):
 * المديرُ وحده (أو مفتاحُه الحيّ)، والمرجعُ يُرجع الدينَ نفسَه قبل أيّ فحص، والزبونُ بمفتاحه، و«شنو» ولا أطول من حدّه، والعملةُ،
 * والمبلغُ، والتاريخُ (لا أبعد من الغد ولا قبل ٢٠٠٠). واليومُ ⇒ الآن، وما قبله ظهراً ببغداد وختمُ الإدخال الآن. والدولار: الدينارُ
 * الكامل بسعر اليوم (iqdOf بخطوة ١، كسطر usd_checkout). والشكل: بلا أسطرٍ ولا ربحٍ ولا كلفة، مدفوعُه صفر، بلا طريقة دفع.
 * وحرّاسُ ما بعد الإدراج (لا ترجيع، لا أسطر، الحذفُ بلا تسديد، الربحُ صفرٌ بالخصم) بـrepoDemo نفسِه — كمحفّزات القاعدة.
 * كسولةٌ من باب oldDebtApi وحده.
 * ========================================================================= */
import type { Invoice } from "@/types";
import type { OldDebtInput } from "./oldDebtApi";
import { loadDB, saveDB } from "./demoStore";
import { demoAuditPush, demoBaseRole, demoClinicId, demoPinLive } from "./repoDemo";
import { demoUsdState } from "./demoUsd";
import { centsOf, iqdOf, decText } from "./usdMath";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";
import { uid } from "./utils";

const err = (c: string, sqlstate = "P0001") => Object.assign(new Error(c), { code: sqlstate });
const clean = (s: string | null | undefined, collapse = false): string | null => {
  const t = (collapse ? (s ?? "").replace(/[ \t\r\n]+/g, " ") : (s ?? "")).trim();
  return t === "" ? null : t;
};
const len = (s: string | null) => [...(s ?? "")].length;
/** اليومُ ببغداد YYYY-MM-DD — «اليوم» الذي يقارن به الخادم. */
export const baghdadToday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function demoOldDebtAdd(x: OldDebtInput): Promise<Invoice> {
  if (demoBaseRole() === "photographer") throw err("photographer_forbidden", "42501");
  if (demoBaseRole() !== "manager" && !demoPinLive()) throw err("old_debt_manager", "42501");
  const ref = clean(x.clientRef);
  const db = loadDB();
  if (ref) {
    const prior = (db.invoices ?? []).find((v) => v.client_ref === ref);
    if (prior) {
      if (prior.sale_kind !== "opening") throw err("old_debt_ref");
      return prior;
    }
  }
  const name = clean(x.name, true), phone = clean(x.phone), what = clean(x.what, true), why = clean(x.why);
  if (!custKey(phone, name, getDialCode())) throw err("old_debt_customer");
  if (!what) throw err("old_debt_what");
  if (len(what) > 200 || len(why) > 500 || len(name) > 80 || len(phone) > 40) throw err("old_debt_long");
  const cur = (clean(x.currency) ?? "IQD").toUpperCase();
  if (cur !== "IQD" && cur !== "USD") throw err("old_debt_currency");
  const cents = centsOf(x.amount);
  if (cents == null || cents <= 0n) throw err("old_debt_amount");
  const today = baghdadToday();
  const date = clean(x.date);
  if (date != null && (date > addDays(today, 1) || date < "2000-01-01")) throw err("old_debt_date");
  const now = new Date().toISOString();
  const backdated = date != null && date < today;
  const createdAt = backdated ? new Date(`${date}T12:00:00+03:00`).toISOString() : now;

  let total: number, usd: { fx_rate: number; total_usd: number } | null = null;
  if (cur === "USD") {
    const st = await demoUsdState();
    if (!st.enabled) throw err("usd_disabled");
    if (!st.rate) throw err("usd_no_rate");
    total = Number(iqdOf(cents, st.rate.rate1e4, 1));
    usd = { fx_rate: Number(st.rate.rate), total_usd: Number(decText(cents, 2)) };
  } else {
    total = Number(decText(cents, 2));
  }
  if (total <= 0 || total >= 1e10 || (usd != null && usd.total_usd >= 1e12)) throw err("old_debt_amount");

  const inv: Invoice = {
    id: uid("inv"),
    clinic_id: demoClinicId() ?? null,
    customer_name: name, customer_phone: phone, pet_name: null,
    subtotal: total, discount: 0, discount_type: null,
    payment_method: null, payment_details: [],
    total, amount_paid: 0, cost_total: 0, profit: 0, item_count: 0,
    print_count: 0, status: "paid", refunded_at: null, staff_id: null, notes: null,
    sale_kind: "opening", client_ref: ref, created_at: createdAt, recorded_at: backdated ? now : null,
    opening_what: what, opening_why: why,
    ...(usd ? { currency: "USD", fx_rate: usd.fx_rate, total_usd: usd.total_usd, paid_usd: 0 } : { currency: "IQD" }),
  } as Invoice;
  (db.invoices ??= []).push(inv);
  saveDB(db);
  // سطرُ التدقيق كمحفّزه (audit_change + فرعُ 0271): قائمةُ keep، وختمُ المؤرَّخ ويومُه، وعلامةُ الدين القديم وما هو.
  demoAuditPush({
    action: "INSERT", entity: "invoices", entity_id: inv.id,
    details: {
      total, customer_name: name, status: "paid",
      ...(backdated ? { recorded_at: now, sold_at: createdAt } : {}),
      sale_kind: "opening", opening_what: what,
    },
  });
  return inv;
}
