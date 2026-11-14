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
export type DemoAdd = { status: "created"; key: string; profile: CustomerProfile } | { status: "exists" | "known"; key: string };

/** مرآةُ customer_profile_add: المفتاحُ يُحسب هنا، وملفٌّ قائم «exists»، وزبونٌ له فواتيرُ أو حيوان «known» بلا كتابة
 *  (إلا لمفتاحه نفسِه من ملفّه)، ومفتاحٌ محسوبٌ غيرُ المقصود يُرفض. */
export function demoAddProfile(input: Row, forKey: string | null): DemoAdd {
  const db = loadDB();
  const list = (db.customerProfiles ??= []);
  const name = clean(input.name, true), phone = clean(input.phone);
  const dial = getDialCode();
  const key = custKey(phone, name, dial);
  if (!key) fail("customer_no_identity");
  if (forKey !== null && forKey !== key) fail("customer_key_frozen");
  if (list.some((c) => c.cust_key === key)) return { status: "exists", key: key as string };
  const known = (db.invoices ?? []).some((i) => ((i.customer_name ?? "").trim() !== "" || (i.customer_phone ?? "").trim() !== "") && custKey(i.customer_phone, i.customer_name, dial) === key)
    || (db.pets ?? []).some((p) => p.shared_with_clinic !== false && custKey(p.owner_phone, p.owner_name, dial) === key);
  if (forKey === null && known) return { status: "known", key: key as string };
  const now = new Date().toISOString();
  const p: CustomerProfile = { id: uid("cust"), cust_key: key as string, name, phone, address: clean(input.address), notes: clean(input.notes), created_at: now, updated_at: now };
  list.push(p);
  saveDB(db);
  return { status: "created", key: key as string, profile: p };
}

/** مرآةُ التعديل بشرط «كما فُتح» ومحفّز الهويّة. */
export function demoUpdateProfile(input: Row, expect: { id: string; updated_at: string }): CustomerProfile {
  const db = loadDB();
  const list = (db.customerProfiles ??= []);
  const name = clean(input.name, true), phone = clean(input.phone);
  const dial = getDialCode();
  const key = custKey(phone, name, dial);
  if (!key) fail("customer_no_identity");
  const cur = list.find((c) => c.id === expect.id);
  if (!cur || cur.updated_at !== expect.updated_at) throw Object.assign(new Error("stale"), { code: "stale" });
  if (key !== custKey(cur.phone, cur.name, dial)) fail("customer_key_frozen");
  // الختمُ يتقدّم دائماً — المليثانيةُ نفسُها مع لحظة الفتح كانت تُمرّر شرطَ «كما فُتح» لكتابتين متتاليتين.
  const now = new Date().toISOString();
  const stamp = now > cur.updated_at ? now : new Date(Date.parse(cur.updated_at) + 1).toISOString();
  Object.assign(cur, { name, phone, address: clean(input.address), notes: clean(input.notes), updated_at: stamp });
  saveDB(db);
  return { ...cur };
}

export function demoKeyInvoices(key: string): Invoice[] {
  const dial = getDialCode();
  return (loadDB().invoices ?? [])
    .filter((i) => ((i.customer_name ?? "").trim() !== "" || (i.customer_phone ?? "").trim() !== "") && custKey(i.customer_phone, i.customer_name, dial) === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
