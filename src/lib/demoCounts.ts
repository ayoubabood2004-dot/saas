import type { CountDecision, CountLineInput, CountReason, CountSubmitResult, Expense, StockCount, StockLossRow } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { uid } from "./utils";
import { GAIN_REASONS, LOSS_REASONS, WITHDRAWAL_REASONS } from "./countPick";

/* ============================================================================
 * مرآةُ الجرد الدوريّ (0216) للوضع التجريبي — تُحمَّل عند النداء لا مع الإقلاع.
 * نفسُ الحرّاس: السببُ يطابق اتجاهَ الفرق، والمطابقُ بلا موافقة، والمعلَّقُ لا
 * يمسّ الرصيد ولا يُلغيه عدٌّ جديد، والموافقةُ للمدير وتطبّق **الفرقَ** لا الرقم، والسحبُ «من المخزن»
 * لأسباب الخسارة وحدها بسعر الشراء — وخطأُ الإدخال والزيادةُ بلا سحب.
 * ========================================================================= */

const KEY = "vp_demo_counts";

export function loadCounts(): StockCount[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as StockCount[]; } catch { /* swallow-ok: جهازٌ بلا تخزين = لا جرد سابق */ }
  return [];
}
function saveCounts(list: StockCount[]) {
  // يرمي: عدٌّ لم يُحفظ ويُقال «انسجل» كذبٌ يُصدَّق.
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 2000)));
}

function session(): { id: string | null; name: string | null; role: string | null } {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string; full_name?: string; role?: string } } | null;
    return { id: s?.raw?.id ?? null, name: s?.raw?.full_name ?? null, role: s?.raw?.role ?? null };
  } catch { return { id: null, name: null, role: null }; }
}

/** رفضٌ برمز الخادم نفسه (`count_reason`…) — والشاشةُ تترجمه من نطاقها (`cnt.err.*`)،
 *  فلا نصَّ هنا: هذه الوحدةُ قد تُحمَّل قبل وصول القاموس البارد. */
function refuse(code: string): never {
  const e = new Error(`count_${code}`) as Error & { code: string };
  e.code = "P0001";
  throw e;
}

export function demoSubmitCount(lines: CountLineInput[]): CountSubmitResult {
  if (!lines.length) refuse("empty");
  if (lines.length > 200) refuse("too_many");
  const db = loadDB();
  const me = session();
  const list = loadCounts();
  let matched = 0, pending = 0;
  const now = new Date().toISOString();
  for (const l of lines) {
    const counted = Number(l.counted);
    if (!Number.isFinite(counted) || counted < 0 || counted > 1e9) refuse("bad_qty");
    const p = (db.products ?? []).find((x) => x.id === l.product_id && !x.farm_id);
    if (!p) refuse("product_missing");
    if (p.pooled) refuse("pooled");
    const system = Number(p.stock) || 0;
    const diff = counted - system;
    let reason: CountReason | null = l.reason ?? null;
    if (diff === 0) reason = null;
    else if (!reason || !(diff < 0 ? LOSS_REASONS : GAIN_REASONS).includes(reason)) refuse("reason");
    // معلَّقٌ ينتظر المدير لا يُلغيه عدٌّ جديد (مرآةُ count_already_pending).
    if (list.some((c) => c.product_id === p.id && c.status === "pending")) refuse("already_pending");
    list.unshift({
      id: uid("cnt"), product_id: p.id, product_name: p.name, system_qty: system, counted_qty: counted,
      unit_cost: Math.max(0, Number(p.purchase_price) || 0), reason, note: (l.note ?? "").trim().slice(0, 200) || null,
      status: diff === 0 ? "matched" : "pending", counted_by: me.id, counted_by_name: me.name, counted_at: now,
      decided_by: null, decided_by_name: null, decided_at: null, applied_delta: null, expense_id: null,
    });
    if (diff === 0) matched++; else pending++;
  }
  saveCounts(list);
  return { matched, pending };
}

/** نصُّ القاعدة كما تكتبه `stock_count_decide` حرفاً — بياناتٌ تُخزَّن لا واجهة (السحبُ يُقرأ كما كُتب). */
const DB_TEXT = { damaged: "\u062a\u0627\u0644\u0641", expired: "\u0645\u0646\u062a\u0647\u064a", shortage: "\u0639\u062c\u0632", head: "\u0633\u062d\u0628 \u0645\u062e\u0632\u0646" } as Record<string, string>;
const trimNum = (n: number) => String(Math.round(n * 1000) / 1000);

export function demoDecideCounts(
  ids: string[], approve: boolean, addExpense: (e: Omit<Expense, "id" | "created_at">) => Expense,
): CountDecision {
  const me = session();
  // مرآةُ `auth_role() = 'manager'`: الطبيبُ والاستقبالُ لا يوافقان.
  if (me.role === "doctor" || me.role === "reception") refuse("needs_manager");
  if (!ids.length) refuse("nothing");
  const db = loadDB();
  const list = loadCounts();
  const now = new Date().toISOString();
  const want = new Set(ids);
  const out: CountDecision = { approved: 0, rejected: 0, void: 0, withdrawals: [] };
  const done: StockCount[] = [];
  for (const c of [...list].sort((a, b) => a.counted_at.localeCompare(b.counted_at) || a.id.localeCompare(b.id))) {
    if (!want.has(c.id) || c.status !== "pending") continue;
    const stamp = { decided_by: me.id, decided_by_name: me.name, decided_at: now };
    if (!approve) { Object.assign(c, { status: "rejected", ...stamp }); out.rejected++; continue; }
    const p = (db.products ?? []).find((x) => x.id === c.product_id);
    if (!p) { Object.assign(c, { status: "void", ...stamp }); out.void++; continue; }
    const old = Number(p.stock) || 0;
    const next = Math.max(0, old + (c.counted_qty - c.system_qty));
    p.stock = next;
    Object.assign(c, { status: "approved", applied_delta: next - old, ...stamp });
    done.push(c);
    out.approved++;
  }
  saveDB(db);
  for (const reason of [...WITHDRAWAL_REASONS].sort()) {
    const rows = done.filter((c) => c.reason === reason && (c.applied_delta ?? 0) < 0 && c.unit_cost > 0);
    const amount = Math.round(rows.reduce((s, c) => s + -(c.applied_delta ?? 0) * c.unit_cost, 0) * 100) / 100;
    if (amount <= 0) continue;
    const items = rows.map((c) => `${c.product_name} ×${trimNum(-(c.applied_delta ?? 0))}`).sort((a, b) => a.localeCompare(b)).join("، ");
    const e = addExpense({
      amount, description: `${DB_TEXT.head} — ${DB_TEXT[reason]}: ${items}`.slice(0, 1000), category: DB_TEXT.head,
      method: "stock", staff_id: me.id, spent_at: now,
    });
    for (const c of rows) c.expense_id = e.id;
    out.withdrawals.push({ reason, amount, expense_id: e.id });
  }
  saveCounts(list);
  return out;
}

export function demoStockLosses(from: string, to: string): StockLossRow[] {
  const lo = new Date(from).getTime(), hi = new Date(to).getTime();
  const m = new Map<CountReason, StockLossRow>();
  for (const c of loadCounts()) {
    if (c.status !== "approved" || !c.applied_delta || !c.reason || !c.decided_at) continue;
    const t = new Date(c.decided_at).getTime();
    if (!(t >= lo && t < hi)) continue;
    const r = m.get(c.reason) ?? { reason: c.reason, lines: 0, qty: 0, value: 0 };
    r.lines++; r.qty += -c.applied_delta; r.value += -c.applied_delta * c.unit_cost;
    m.set(c.reason, r);
  }
  return [...m.values()].map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 }));
}

export function demoCountState(): Map<string, { lastCountedAt: string | null; lastDiffAt: string | null }> {
  const out = new Map<string, { lastCountedAt: string | null; lastDiffAt: string | null }>();
  for (const c of loadCounts()) {
    if (!c.product_id || c.status === "void") continue;
    const cur = out.get(c.product_id) ?? { lastCountedAt: null, lastDiffAt: null };
    if (!cur.lastCountedAt || c.counted_at > cur.lastCountedAt) cur.lastCountedAt = c.counted_at;
    if (c.counted_qty !== c.system_qty && (c.status === "pending" || c.status === "approved")
      && (!cur.lastDiffAt || c.counted_at > cur.lastDiffAt)) cur.lastDiffAt = c.counted_at;
    out.set(c.product_id, cur);
  }
  return out;
}
