/* ============================================================================
 * مرآةُ ملفّ الزبون (0270) للتجريبيّ — يفرض حرّاسَ الخادم نفسَها (CLAUDE.md §٤: حارسٌ لا يوجد هنا حارسٌ لم يُفحص):
 * المفتاحُ يُحسب هنا لا يُؤخذ من الجهاز، وبلا اسمٍ ولا رقم يُرفض، ومفتاحٌ قائم لا يُداس (on conflict do nothing)،
 * والتعديلُ بشرط أنّه كما فُتح، وتعديلٌ يغيّر الهويّةَ يُرفض. وفواتيرُ المفتاح بالدالّة التي يجمع بها الدليل.
 * ========================================================================= */
import type { CustomerProfile, Invoice } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";
import { uid } from "./utils";

const fail = (c: string) => { throw Object.assign(new Error(c), { code: "P0001" }); };
const clean = (s: string | null | undefined, collapse = false): string | null => {
  const t = (collapse ? (s ?? "").replace(/[ \t\r\n]+/g, " ") : (s ?? "")).trim();
  return t === "" ? null : t;
};

export function demoProfile(key: string): CustomerProfile | null {
  return (loadDB().customerProfiles ?? []).find((c) => c.cust_key === key) ?? null;
}

type Row = { name: string | null; phone: string | null; address: string | null; notes: string | null };
export type DemoSave = { kind: "saved"; profile: CustomerProfile } | { kind: "exists"; key: string };

export function demoSaveProfile(input: Row, expect: { id: string; updated_at: string } | null): DemoSave {
  const db = loadDB();
  const list = (db.customerProfiles ??= []);
  const name = clean(input.name, true), phone = clean(input.phone);
  const dial = getDialCode();
  const key = custKey(phone, name, dial);
  if (!key) fail("customer_no_identity");
  const now = new Date().toISOString();
  if (!expect) {
    const had = list.find((c) => c.cust_key === key);
    if (had) return { kind: "exists", key: key as string };
    const p: CustomerProfile = { id: uid("cust"), cust_key: key as string, name, phone, address: clean(input.address), notes: clean(input.notes), created_at: now, updated_at: now };
    list.push(p);
    saveDB(db);
    return { kind: "saved", profile: p };
  }
  const cur = list.find((c) => c.id === expect.id);
  if (!cur || cur.updated_at !== expect.updated_at) throw Object.assign(new Error("stale"), { code: "stale" });
  if (key !== custKey(cur.phone, cur.name, dial)) fail("customer_key_frozen");
  // المليثانيةُ نفسُها مع لحظة الفتح تجعل شرطَ «كما فُتح» يمرّ لكتابتين متتاليتين — الختمُ يتقدّم دائماً.
  const stamp = now > cur.updated_at ? now : new Date(Date.parse(cur.updated_at) + 1).toISOString();
  Object.assign(cur, { name, phone, address: clean(input.address), notes: clean(input.notes), updated_at: stamp });
  saveDB(db);
  return { kind: "saved", profile: { ...cur } };
}

export function demoKeyInvoices(key: string): Invoice[] {
  const dial = getDialCode();
  return (loadDB().invoices ?? [])
    .filter((i) => ((i.customer_name ?? "").trim() !== "" || (i.customer_phone ?? "").trim() !== "") && custKey(i.customer_phone, i.customer_name, dial) === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
