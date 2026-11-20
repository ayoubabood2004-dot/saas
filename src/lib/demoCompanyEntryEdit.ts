/* ============================================================================
 * مرآةُ company_entry_edit (0281) بالتجريبيّ — نفسُ الحرّاس بترتيبها: المدير، والحركةُ حيّةٌ ومن نوعٍ يتعدّل، والسببُ،
 * والمبلغُ والتاريخ، وما رآه المدير، وما تغيّر، وسقفُ الخمسين، والدائنُ لا ينزل تحت ما انسدّ منه (demoPoolDue[Usd]).
 * كسولةٌ من باب repoDemo وحده (loadDemoCompanyEntryEdit).
 * ========================================================================= */
import type { CompanyEntry } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoPoolDue, demoPoolDueUsd } from "./repoDemo";
import { demoApiGate, demoBaseRole, demoHint, demoPinLive, demoUserId } from "./demoRole";
import { localISO } from "./utils";
import type { EntrySnap } from "./companyEntryEdit";

const r2 = (n: number) => Math.round(n * 100) / 100;
const trimOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function demoCompanyEntryEdit(id: string, amount: number, date: string | null, note: string | null,
  reason: string, seen: EntrySnap | null): CompanyEntry {
  demoApiGate();
  const db = loadDB();
  const e = (db.companyEntries ?? []).find((x) => x.id === id);
  if (!e) throw demoHint("no_entry", "الحركةُ غيرُ موجودة بعيادتك.");
  if (demoBaseRole() !== "manager" && !demoPinLive()) throw demoHint("forbidden", "الرصيدُ السابق والتسويةُ والإلغاءُ للمدير.");
  if (date && (date > localISO() || date < "2000-01-01")) throw demoHint("bad_date", "التاريخُ لازم يكون اليوم أو قبله.");
  if (!(db.companies ?? []).some((c) => c.id === e.company_id)) throw demoHint("no_company", "الشركةُ غيرُ موجودة بعيادتك.");
  if (e.voided_at) throw demoHint("already_void", "الحركةُ ملغاة — ما تتعدّل.");
  if (e.kind !== "opening" && e.kind !== "adjust") throw demoHint("not_editable", "التسديدُ ما يتعدّل — ألغِه وسجّله من جديد.");
  const why = trimOrNull(reason);
  if (!why) throw demoHint("reason_required", "اكتب سببَ التعديل.");
  if (why.length > 300) throw demoHint("reason_too_long", "السببُ طويل — ٣٠٠ حرف على الأكثر.");
  const amt = r2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) throw demoHint("bad_amount", "المبلغُ لازم أكبر من صفر.");
  if (!date) throw demoHint("bad_date", "التاريخُ لازم يكون اليوم أو قبله.");
  const n = trimOrNull(note);
  if (n && n.length > 500) throw demoHint("note_too_long", "الملاحظةُ طويلة — ٥٠٠ حرف على الأكثر.");
  if (e.kind === "adjust" && !n) throw demoHint("note_required", "اكتب سببَ التسوية.");
  if (!seen || r2(Number(seen.amount)) !== r2(e.amount) || seen.date !== e.entry_date || trimOrNull(seen.note) !== trimOrNull(e.note)) {
    throw demoHint("entry_changed", "الحركةُ تغيّرت من جهازٍ ثانٍ بعد ما فتحتها — راجعها وعدّل من جديد.");
  }
  if (amt === r2(e.amount) && date === e.entry_date && n === trimOrNull(e.note)) {
    throw demoHint("no_change", "ما تغيّر شي — غيّر المبلغ أو التاريخ أو الملاحظة.");
  }
  const edits = Array.isArray(e.edits) ? e.edits : [];
  if (edits.length >= 50) throw demoHint("too_many_edits", "هاي الحركة تعدّلت ٥٠ مرّة — ألغِها وسجّلها من جديد.");
  if (e.direction === "credit" && amt < e.amount) {
    const pool = e.currency === "USD" ? demoPoolDueUsd(db, e.company_id) : demoPoolDue(db, e.company_id);
    if (pool - (e.amount - amt) < -0.005) {
      const floor = r2(e.amount - Math.max(pool, 0));
      throw demoHint("has_payments", `نزل من هذا الرصيد بتسديدٍ أو خصم ${floor.toLocaleString("en-US")} — ما يصير أقلّ منه. ألغِ التسديد أو الخصم أوّلاً إن كان أقلّ فعلاً.`);
    }
  }
  const before = { amount: e.amount, date: e.entry_date, note: e.note ?? null };
  Object.assign(e, {
    amount: amt, entry_date: date, note: n,
    edits: [...edits, { at: new Date().toISOString(), by: demoUserId(), reason: why, before, after: { amount: amt, date, note: n } }],
  });
  saveDB(db);
  return e;
}
