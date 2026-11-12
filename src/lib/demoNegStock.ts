/* ============================================================================
 * مرآةُ البيع قبل الجرد (0266) للتجريبيّ — العقدُ والحرّاسُ نفسُها على localStorage:
 *  • الدفترُ هو الحالة (آخرُ سطر)، لا يُعدَّل ولا يُحذف إلا هنا.
 *  • التشغيلُ والإطفاءُ للمدير بدوره الأساس (demoBaseRole) — مفتاحُ المدير المؤقّت لا يكفي (neg_stock_manager، 42501)؛
 *    والمصوّرُ مسيَّج (photographer_forbidden). والعيادةُ التي تراها الشاشة شرط (neg_stock_clinic_changed).
 *  • الإقرار (neg_stock_ack)، والمدّةُ ١–٣٠ (neg_stock_days)، والملاحظةُ ٢٠٠ (neg_stock_note)؛ والنهايةُ الثالثة فجراً بعد آخر
 *    يومٍ ببغداد؛ والتمديدُ لا يقصّر؛ والبدايةُ تُحمل خلال ٣٠ يوماً؛ وسقفُ الفترة ٦٠ يوماً (neg_stock_too_long). لا مشغّلَ هنا.
 *  • حكمُ البيعة بكلفة السطر من مرآة الخادم نفسِها (productLineCostCents) والكمّيتين كما سترسلهما البيعة.
 *  • والجرد: رصيدٌ تحرّك من وقت الكتابة ⇒ count_moved (والمعرّفاتُ بـdetails) بلا أثر، وإلا مرآةُ الجرد كما هي.
 * الرموزُ وحدها (P0001/42501) — الشاشةُ تترجمها. كسولةٌ من باب repoDemo وحده (loadDemoNeg).
 * ========================================================================= */
import { loadDB } from "./demoStore";
import { demoApiGate, demoBaseRole, demoClinicId, demoUserId } from "./repoDemo";
import { productLineCostCents, roundDiv, roundScaled, stockUnitCost } from "./consumption";
import { loadCounts, demoSubmitCount } from "./demoCounts";
import { readCounted, readNegCheck, readNegReport, readNegState, type NegAction, type NegCheck, type NegReport, type NegState } from "./negStock";
import type { NegCheckLine, CountLineSeen } from "./negStockApi";
import type { CountSubmitResult, Product } from "@/types";

interface Row {
  id: string; at: string; action: NegAction; since: string | null; until: string | null;
  by_user: string | null; by_name: string | null; note: string | null;
  negatives: number; never_counted: number; zero_cost: number; pending: number;
}
const clinicOf = (): string => demoClinicId() ?? "default";
const key = () => `vp_neg_${clinicOf()}`;
function load(): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(key()) || "[]") as unknown;
    return Array.isArray(v) ? (v as Row[]) : [];
  } catch { return []; }
}
const save = (rows: Row[]) => localStorage.setItem(key(), JSON.stringify(rows));
const err = (code: string, sqlstate = "P0001", details?: string) => Object.assign(new Error(code), { code: sqlstate, ...(details ? { details } : {}) });

/** ختمٌ يكبر دائماً (سطران بنفس الملّي ثانية كانا يتساويان فيضيع «الأخير»). */
function stamp(rows: Row[]): string {
  const p = rows.length ? Date.parse(rows[rows.length - 1].at) : 0;
  return new Date(Math.max(Date.now(), p + 1)).toISOString();
}
const last = (rows: Row[]): Row | null => (rows.length ? rows[rows.length - 1] : null);
const isActive = (r: Row | null, now: number) => !!r && (r.action === "on" || r.action === "extend") && !!r.until && Date.parse(r.until) > now;
/** توقيتُ الجهاز — ما يرسله الباب السحابيّ للخادم (p_tz)؛ وغيرُ المفهوم بغداد كالخادم. */
function deviceTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad"; } catch { return "Asia/Baghdad"; }
}
/** فرقُ التوقيت عن UTC لحظةَ `at` (بالملّي ثانية) — من Intl، فالتوقيتُ الصيفيّ يُحسب. */
function tzOffset(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at / 1000) * 1000;
}
/** مرآةُ الخادم: `((اليوم + days + 1)::timestamp + 3 ساعات) at time zone tz` — الثالثة فجراً بتوقيت الجهاز بعد آخر يوم كامل.
 *  كانت ببغداد ثابتة: جهازٌ بتوقيتٍ آخر رأى «لحد ليلة ١٨» والمعاينةُ «١٩» (مقيسٌ بمتصفّحٍ بتوقيت UTC). */
function endOf(days: number, now: number): string {
  let tz = deviceTz();
  let ymd: number[];
  try { ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(now)).split("-").map(Number); }
  catch { tz = "Asia/Baghdad"; ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(now)).split("-").map(Number); }
  const [y, m, d] = ymd;
  const wall = Date.UTC(y, m - 1, d + days + 1, 3, 0, 0);
  const first = wall - tzOffset(tz, wall);
  return new Date(wall - tzOffset(tz, first)).toISOString();
}

/** مرآةُ _neg_stock_period: بدايةُ الفترة (الجاريةُ، أو التي انتهت خلال ٣٠ يوماً) وسقفُها ٦٠ يوماً. */
function period(rows: Row[], now: number): { since: string; cap: string } {
  const r = last(rows);
  let since: string;
  if (isActive(r, now)) since = r!.since!;
  else {
    const end = r ? (r.action === "off" ? r.at : r.until) : null;
    since = r && r.since && end && Date.parse(end) > now - 30 * 86_400_000 ? r.since : new Date(now).toISOString();
  }
  return { since, cap: new Date(Date.parse(since) + 60 * 86_400_000).toISOString() };
}

/** الموادُّ الحيّة (مرآةُ _neg_stock_counts): لا مجمَّعة ولا حقل ولا دولار. */
const live = (ps: readonly Product[]) => ps.filter((p) => !p.pooled && !p.farm_id && p.price_currency !== "USD");
function countedIds(): Set<string> {
  return new Set(loadCounts()
    .filter((c) => (c.source ?? "count") === "count" && (c.status === "matched" || c.status === "approved") && !!c.product_id)
    .map((c) => c.product_id as string));
}
function counts() {
  const ps = live(loadDB().products ?? []);
  const counted = countedIds();
  const zero = (p: Product) => roundDiv(stockUnitCost(p), 10_000n) <= 0n;
  const nonpos = (p: Product) => (Number(p.stock) || 0) <= 0;
  return {
    negatives: ps.filter((p) => (Number(p.stock) || 0) < 0).length,
    never_counted: ps.filter((p) => !counted.has(p.id)).length,
    uncounted_nonpos: ps.filter((p) => !counted.has(p.id) && nonpos(p)).length,
    zero_cost: ps.filter(zero).length,
    zero_cost_nonpos: ps.filter((p) => zero(p) && nonpos(p)).length,
    pending: loadCounts().filter((c) => (c.source ?? "count") === "count" && c.status === "pending").length,
  };
}
function stateJson(rows: Row[], now: number) {
  const r = last(rows);
  const active = isActive(r, now);
  return {
    clinic_id: clinicOf(), active, used: !!r,
    until: r && r.action !== "off" ? r.until : null,
    since: active ? r!.since : null,
    ended_at: !r || active ? null : r.action === "off" ? r.at : r.until,
    now: new Date(now).toISOString(),
  };
}
/** اسمُ الجلسة (كما يكتبه AuthContext) — بلا جلسةٍ لا اسم. */
function sessionName(): string | null {
  try {
    const raw = (JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { full_name?: string | null } } | null)?.raw;
    return raw?.full_name?.trim() || null;
  } catch { return null; }
}

export async function demoNegState(at: number): Promise<NegState> {
  demoApiGate();
  return readNegState(stateJson(load(), Date.now()), at);
}

export async function demoNegReport(at: number): Promise<NegReport> {
  demoApiGate();
  const rows = load();
  const log = [...rows].reverse().slice(0, 20).map((r) => ({
    at: r.at, action: r.action, since: r.since, until: r.until, by_name: r.by_name, note: r.note,
    negatives: r.negatives, never_counted: r.never_counted, pending: r.pending,
  }));
  const pd = period(rows, Date.now());
  return readNegReport({ ...stateJson(rows, Date.now()), period_since: pd.since, cap_until: pd.cap, operator: false, ...counts(), log }, at);
}

export async function demoNegCounted(): Promise<Set<string>> {
  demoApiGate();
  return readCounted([...countedIds()]);
}

export async function demoNegCheck(clinic: string, lines: NegCheckLine[]): Promise<NegCheck> {
  demoApiGate();
  if (clinic !== clinicOf()) throw err("neg_stock_clinic_changed");
  if (!Array.isArray(lines) || lines.length > 500) throw err("neg_stock_bad");
  const rows = load();
  const active = isActive(last(rows), Date.now());
  const byId = new Map((loadDB().products ?? []).map((p) => [p.id, p]));
  const counted = countedIds();
  const refused = [];
  for (const l of lines) {
    const p = byId.get(l.product_id);
    let why: string | null = null;
    if (!p) why = "gone";
    else if (!active) why = "off";
    else if (p.pooled || p.farm_id || p.price_currency === "USD") why = "not_lifted";
    else if (counted.has(p.id)) why = "counted";
    else if (productLineCostCents(p, roundScaled(l.qty ?? 1, 3), l.stock_qty == null ? null : roundScaled(l.stock_qty, 3), -1n) <= 0n) why = "zero_cost";
    if (why) refused.push({ product_id: l.product_id, why, name: p?.name ?? null, stock: p?.stock ?? null });
  }
  return readNegCheck({ clinic_id: clinicOf(), active, until: stateJson(rows, Date.now()).until, refused });
}

export async function demoNegSet(clinic: string, on: boolean | null, days: number | null, ack: boolean, note: string | null, at: number): Promise<NegState> {
  demoApiGate();
  if (clinic !== clinicOf()) throw err("neg_stock_clinic_changed");
  if (demoBaseRole() !== "manager") throw err("neg_stock_manager", "42501");
  if (on == null) throw err("neg_stock_bad");
  const n = note?.trim() || null;
  if (n && n.length > 200) throw err("neg_stock_note");
  const rows = load();
  const r = last(rows);
  const now = Date.now();
  const active = isActive(r, now);
  let action: NegAction, since: string | null, until: string | null;
  if (on) {
    if (!ack) throw err("neg_stock_ack");
    if (days == null || !Number.isInteger(days) || days < 1 || days > 30) throw err("neg_stock_days");
    const fresh = endOf(days, now);
    const pd = period(rows, now);
    since = pd.since;
    if (active) {
      until = Date.parse(fresh) > Date.parse(r!.until!) ? fresh : r!.until!;
      if (until === r!.until) return demoNegState(at);
      action = "extend";
    } else {
      until = fresh;
      action = "on";
    }
    if (Date.parse(until) > Date.parse(pd.cap)) throw err("neg_stock_too_long");
  } else {
    if (!active) return demoNegState(at);
    action = "off";
    since = r!.since;
    until = null;
  }
  const c = counts();
  rows.push({
    id: `neg_${now.toString(36)}_${rows.length}`, at: stamp(rows), action, since, until,
    by_user: demoUserId(), by_name: sessionName(), note: n,
    negatives: c.negatives, never_counted: c.never_counted, zero_cost: c.zero_cost, pending: c.pending,
  });
  save(rows);
  return demoNegState(at);
}

export async function demoCountSubmitSeen(lines: CountLineSeen[]): Promise<CountSubmitResult> {
  demoApiGate();
  if (!Array.isArray(lines) || lines.length === 0) throw err("count_empty");
  if (lines.length > 200) throw err("count_too_many");
  // سطرٌ بلا seen لا يُتخطّى بصمت — مرآةُ count_seen_missing.
  if (lines.some((l) => !l || typeof l !== "object" || typeof l.seen !== "number")) throw err("count_seen_missing");
  const byId = new Map((loadDB().products ?? []).map((p) => [p.id, p]));
  const moved: string[] = [];
  for (const l of lines) {
    const p = byId.get(l.product_id);
    if (!p) continue;
    if (roundScaled(Number(p.stock) || 0, 3) !== roundScaled(l.seen as number, 3)) moved.push(p.id);
  }
  if (moved.length) throw err("count_moved", "P0001", JSON.stringify(moved));
  return demoSubmitCount(lines.map(({ seen: _s, ...l }) => l));
}
