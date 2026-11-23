/* ============================================================================
 * مرآةُ company_openings_add (0288) بالتجريبيّ — نفسُ الحرّاس بترتيبها: المدير، والشركة، والمرجع، والعملة، والسطور (١..٥٠)،
 * ثمّ الإعادة (ما ثبت بالمرجع يرجع إن كان الطلبَ نفسَه كما كُتب أوّلَ مرّة، وإلا ref_mismatch)، ثمّ الدولار، ثمّ كلُّ سطرٍ برقمه —
 * وسطرٌ مرفوض لا يكتب شيئاً (معاملةٌ واحدة). كسولةٌ من باب repoDemo وحده (loadDemoCompanyOpenings).
 * ========================================================================= */
import type { CompanyEntry } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoEntry } from "./repoDemo";
import { demoApiGate, demoBaseRole, demoHint, demoPinLive } from "./demoRole";
import { demoUsdState } from "./demoUsd";
import { decOf, decText } from "./usdMath";
import { localISO } from "./utils";

const REF_RE = /^[A-Za-z0-9_-]{3,80}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const refNo = (ref: string | null | undefined): number => Number(String(ref ?? "").split(":")[1] ?? NaN);

/** الأصلُ كما كُتب أوّلَ مرّة — قبل أيّ تعديلٍ بـ0281 (`edits[0].before`). */
function original(e: CompanyEntry): { cents: bigint | null; date: string } {
  const first = Array.isArray(e.edits) && e.edits[0] && typeof e.edits[0] === "object"
    ? (e.edits[0] as { before?: { amount?: unknown; date?: unknown } }).before : undefined;
  const amount = first && first.amount != null ? first.amount : e.amount;
  return {
    cents: decOf(typeof amount === "number" || typeof amount === "string" ? amount : null, 2),
    date: typeof first?.date === "string" ? first.date.slice(0, 10) : e.entry_date,
  };
}

export async function demoCompanyOpenings(companyId: string, cur: string, rows: unknown, ref: string): Promise<{ entries: CompanyEntry[]; replayed: boolean }> {
  demoApiGate();
  const db = loadDB();
  if (demoBaseRole() !== "manager" && !demoPinLive()) throw demoHint("forbidden", "الرصيدُ السابق والتسويةُ والإلغاءُ للمدير.");
  if (!(db.companies ?? []).some((c) => c.id === companyId)) throw demoHint("no_company", "الشركةُ غيرُ موجودة بعيادتك.");
  const r = String(ref ?? "").trim();
  if (!REF_RE.test(r)) throw demoHint("bad_ref", "حدّث الصفحة وجرّب مرّة ثانية.");
  const c = String(cur ?? "").trim().toUpperCase() || "IQD";
  if (c !== "IQD" && c !== "USD") throw demoHint("bad_currency", "العملة دينار أو دولار.");
  if (!Array.isArray(rows)) throw demoHint("bad_rows", "اكتب دين واحد على الأقل.");
  const n = rows.length;
  if (n < 1 || n > 50) throw demoHint("bad_rows", "من دين واحد لخمسين دين بالمرّة.");

  const refs = new Set(Array.from({ length: 50 }, (_, i) => `${r}:${i + 1}`));
  const old = (db.companyEntries ?? []).filter((e) => !!e.client_ref && refs.has(e.client_ref));
  if (old.length) {
    const same = old.length === n && old.every((e) => {
      const i = refNo(e.client_ref);
      const req = rows[i - 1] as Record<string, unknown> | undefined;
      if (!(i >= 1 && i <= n) || !req || typeof req !== "object") return false;
      const o = original(e);
      const want = decOf(typeof req.amount === "number" || typeof req.amount === "string" ? req.amount : null, 2);
      const day = typeof req.date === "string" ? req.date.trim() : "";
      return e.company_id === companyId && (e.currency ?? "IQD") === c && want != null && o.cents === want && o.date === day;
    });
    if (!same) throw demoHint("ref_mismatch", "هالديون انسجّلت قبل بشكلٍ ثاني — حدّث الدفتر وشوفها قبل ما تضيف.");
    return { entries: old.slice().sort((a, b) => refNo(a.client_ref) - refNo(b.client_ref)), replayed: true };
  }

  if (c === "USD" && !(await demoUsdState()).enabled) throw demoHint("usd_disabled", "الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.");
  const today = localISO();
  const made: CompanyEntry[] = [];
  rows.forEach((x, idx) => {
    const i = idx + 1;
    if (!x || typeof x !== "object" || Array.isArray(x)) throw demoHint("bad_rows", `السطر ${i}: مو مقروء.`);
    const o = x as Record<string, unknown>;
    const amt = decOf(typeof o.amount === "number" || typeof o.amount === "string" ? o.amount : null, 2);
    const raw = o.date == null ? "" : typeof o.date === "string" ? o.date.trim() : null;
    if (amt == null || raw == null || (raw !== "" && !DAY_RE.test(raw))) throw demoHint("bad_rows", `السطر ${i}: المبلغ أو التاريخ مو مقروء.`);
    if (amt <= 0n) throw demoHint("bad_amount", `السطر ${i}: المبلغُ لازم أكبر من صفر.`);
    if (!raw) throw demoHint("bad_date", `السطر ${i}: اكتب تاريخ الدين.`);
    const date = raw;
    if (date > today || date < "2000-01-01") throw demoHint("bad_date", `السطر ${i}: التاريخُ لازم يكون اليوم أو قبله.`);
    const note = typeof o.note === "string" && o.note.trim() ? o.note.trim() : null;
    if (note && [...note].length > 500) throw demoHint("note_too_long", `السطر ${i}: الملاحظةُ طويلة — ٥٠٠ حرف على الأكثر.`);
    made.push({ ...demoEntry(companyId, "opening", "credit", Number(decText(amt, 2)), date, null, note), currency: c, client_ref: `${r}:${i}` });
  });
  (db.companyEntries ??= []).push(...made);
  saveDB(db);
  return { entries: made, replayed: false };
}
