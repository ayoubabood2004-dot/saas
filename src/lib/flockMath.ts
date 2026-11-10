/* ============================================================================
 * حالةُ الحقل (0265) — الحسابُ الصِّرف: مرآةُ `_flock_stats` و`_flock_age` بالقاعدة حرفاً بحرف.
 *
 * السحابةُ تأخذ الإحصاءَ من الخادم (flock_case_bundle / flock_board)؛ والتجريبيُّ يحسبه من هنا — فكلُّ
 * تعريفٍ هنا تعريفُ القاعدة نفسُه، ويطابقهما flock-test على حالاتٍ بنتائجها المقيسة بالحزمة:
 *  • العمر: يومُ الوصول = ١ (قرارُ المالك ١) — `ageOn`.
 *  • النافق: صفٌّ يغطّي `days` يوماً يتوزّع عليها بالتساوي، والنسبةُ اليومية من الحيّ ببداية اليوم بقاعته.
 *  • الإنذار: يومان متتاليان ≥ ٠٫٢٥٪ بنفس القاعة، آخرُهما خلال آخر ثلاثة أيام. يومٌ بلا تسجيل لا يُكمل سلسلة.
 *  • «لا تبيع قبل» = آخرُ يومٍ أُعطي فيه دواء + أيامُ السحب + ١ (قرارُ المالك ٥)، والسحبُ الفارغ «غير معروف».
 * والتواريخُ نصوصُ يومٍ محلّيّ (YYYY-MM-DD) تُحسب بـUTC على أرقامها — لا ساعةَ ولا منطقةَ تحرّكها.
 * ========================================================================= */
import type { FlockBundle, FlockCase, FlockHouse, FlockMortality, FlockNecropsy, FlockStats, FlockTreatment, FlockVax, FlockVisit } from "./flockTypes";

/** عتبةُ النفوق اليوميّ (٪) — نفسُ v_threshold بـ_flock_stats. */
export const FLOCK_ALERT_PCT = 0.25;

const toUtc = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** iso + n يوماً. */
export const addDays = (iso: string, n: number): string => fromUtc(toUtc(iso) + n * 86400000);
/** b − a بالأيام. */
export const diffDays = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / 86400000);
/** العمرُ بحساب الطبيب: يومُ الوصول = ١ — مرآةُ `_flock_age`. */
export const ageOn = (placedOn: string, on: string): number => diffDays(placedOn, on) + 1;
/** يومُ عمرٍ بعينه: الوصول + العمر − ١. */
export const dueOn = (placedOn: string, age: number): string => addDays(placedOn, age - 1);

/** تقريبٌ لمنزلتين نصفاً بعيداً عن الصفر — كـround(x, 2) بالقاعدة على numeric. */
export function round2(x: number): number {
  const s = Math.sign(x) || 1;
  return (s * Math.round(Number(`${Math.abs(x)}e2`))) / 100;
}

export interface DayLoss { house_id: string | null; day: string; loss: number; alive_start: number; pct: number | null }

/** النافقُ يوماً بيوم بالقاعة (صفٌّ بأيام ⇒ موزَّعٌ عليها بالتساوي)، والحيُّ ببداية اليوم ونسبتُه. */
export function dailyLosses(c: Pick<FlockCase, "placed_count">, houses: Pick<FlockHouse, "id" | "placed_count">[], rows: FlockMortality[]): DayLoss[] {
  const per = new Map<string, number>();
  for (const m of rows) {
    const each = (m.dead + m.culled) / m.days;
    for (let i = 0; i < m.days; i++) {
      const k = `${m.house_id ?? ""}|${addDays(m.on_date, -i)}`;
      per.set(k, (per.get(k) ?? 0) + each);
    }
  }
  const cap = new Map<string, number>();
  if (houses.length) for (const h of houses) cap.set(h.id, h.placed_count);
  else cap.set("", c.placed_count);
  const byHouse = new Map<string, { day: string; loss: number }[]>();
  for (const [k, loss] of per) {
    const [h, day] = k.split("|");
    if (!byHouse.has(h)) byHouse.set(h, []);
    byHouse.get(h)!.push({ day, loss });
  }
  const out: DayLoss[] = [];
  for (const [h, days] of byHouse) {
    const placed = cap.get(h);
    if (placed == null) continue;                       // صفٌّ لقاعةٍ ليست بالوجبة لا يُحسب (القاعدةُ تمنعه أصلاً)
    days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    let before = 0;
    for (const d of days) {
      const alive = placed - before;
      out.push({ house_id: h || null, day: d.day, loss: d.loss, alive_start: alive, pct: alive > 0 ? (d.loss * 100) / alive : null });
      before += d.loss;
    }
  }
  return out;
}

/** آخرُ يومٍ أُعطي فيه كلُّ سطرِ دواء (أو null إن لم يُعطَ شيء)، و«لا تبيع قبل» للّحم والبيض. */
export function withdrawalOf(treatments: FlockTreatment[]): { meat: string | null; egg: string | null; unknownMeat: boolean; unknownEgg: boolean } {
  let meat: string | null = null, egg: string | null = null, unknownMeat = false, unknownEgg = false;
  for (const t of treatments) {
    for (const l of t.lines) {
      if (l.kind !== "med") continue;
      const first = addDays(t.start_on, l.day_from - 1);
      const planned = addDays(t.start_on, l.day_to - 1);
      const last = t.stopped_on && t.stopped_on < planned ? t.stopped_on : planned;
      if (last < first) continue;                         // أُوقفت طبلتُه قبل أن يبدأ: ما انعطى
      if (l.withdrawal_meat_days == null) unknownMeat = true;
      else { const s = addDays(last, l.withdrawal_meat_days + 1); if (!meat || s > meat) meat = s; }
      if (l.withdrawal_egg_days == null) unknownEgg = true;
      else { const s = addDays(last, l.withdrawal_egg_days + 1); if (!egg || s > egg) egg = s; }
    }
  }
  return { meat, egg, unknownMeat, unknownEgg };
}

type StatsInput = Pick<FlockBundle, "case" | "houses" | "mortality" | "vax" | "treatments" | "visits">;

/** مرآةُ `_flock_stats(p_case)`: نفسُ الحقول ونفسُ التقريب. `today` = يومُ بغداد المحلّيّ (localISO). */
export function flockStats(b: StatsInput, today: string): FlockStats {
  const c = b.case;
  const ref = c.closed_on ?? today;
  let dead = 0, culled = 0;
  for (const m of b.mortality) { dead += m.dead; culled += m.culled; }

  const losses = dailyLosses(c, b.houses, b.mortality);
  const at = new Map<string, DayLoss>();
  for (const d of losses) at.set(`${d.house_id ?? ""}|${d.day}`, d);
  let alert = false, peak: number | null = null;
  const alerting = new Set<string>();
  for (const d of losses) {
    if (d.pct != null && d.day >= addDays(ref, -6) && d.day <= ref && (peak == null || d.pct > peak)) peak = d.pct;
    if (d.day < addDays(ref, -2) || d.day > ref || d.pct == null || d.pct < FLOCK_ALERT_PCT) continue;
    const prev = at.get(`${d.house_id ?? ""}|${addDays(d.day, -1)}`);
    if (prev?.pct != null && prev.pct >= FLOCK_ALERT_PCT) {
      alert = true;
      if (d.house_id) alerting.add(d.house_id);
    }
  }
  // كلُّ قاعةٍ تُنذر بترتيب القاعات (position ثمّ المعرّف — ترتيبُ uuid بالقاعدة هو ترتيبُ نصّه الصغير).
  const alertHouses = b.houses.filter((h) => alerting.has(h.id))
    .sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((h) => h.id);

  const w1End = addDays(c.placed_on, 6);
  let w1 = 0, w1Rec = false;
  for (const m of b.mortality) {
    const start = addDays(m.on_date, -(m.days - 1));
    if (start <= w1End) w1Rec = true;
    const lo = start > c.placed_on ? start : c.placed_on;
    const hi = m.on_date < w1End ? m.on_date : w1End;
    const n = Math.max(0, diffDays(lo, hi) + 1);
    w1 += ((m.dead + m.culled) / m.days) * n;
  }

  const planned = b.vax.filter((v) => v.status === "planned" && v.planned_age != null) as (FlockVax & { planned_age: number })[];
  const next = [...planned].sort((x, y) => x.planned_age - y.planned_age || (x.vaccine < y.vaccine ? -1 : x.vaccine > y.vaccine ? 1 : 0))[0];
  const tomorrow = addDays(today, 1);
  let over = 0, soon = 0;
  for (const v of planned) {
    const due = dueOn(c.placed_on, v.planned_age);
    if (due < today) over++;
    else if (due <= tomorrow) soon++;
  }

  const w = withdrawalOf(b.treatments);
  const active = b.treatments.filter((t) => t.status === "active" && t.lines.some((l) => addDays(t.start_on, l.day_to - 1) >= today)).length;
  const last = [...b.visits].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))[0] as FlockVisit | undefined;
  const age = ageOn(c.placed_on, ref);

  return {
    age,
    ref_on: ref,
    placed: c.placed_count,
    dead,
    culled,
    alive: c.placed_count - dead - culled,
    cum_pct: round2(((dead + culled) * 100) / c.placed_count),
    week1_pct: round2((w1 * 100) / c.placed_count),
    week1_recorded: w1Rec,
    week1_done: age >= 7,
    mortality_alert: alert,
    alert_houses: alertHouses,
    peak_pct_7d: peak == null ? null : round2(peak),
    next_vax: next ? { id: next.id, vaccine: next.vaccine, route: next.route, age: next.planned_age, due_on: dueOn(c.placed_on, next.planned_age) } : null,
    vax_overdue: over,
    vax_soon: soon,
    safe_meat_from: w.meat,
    safe_egg_from: w.egg,
    withdrawal_unknown: w.unknownMeat,
    egg_withdrawal_unknown: w.unknownEgg,
    in_withdrawal: w.meat != null && w.meat > today,
    active_treatments: active,
    last_visit_at: last?.at ?? null,
    last_trend: last?.trend ?? null,
    next_visit_on: last?.next_visit_on ?? null,
    visit_overdue: c.status === "open" && !!last?.next_visit_on && last.next_visit_on < today,
  };
}

/** ملخّصُ التشريح: كم طيراً بكلّ آفة من عدد الطيور — الأكثرُ أوّلاً. «طبيعي» ليس آفة. */
export function necropsySummary(birds: Pick<FlockNecropsy, "findings">[]): { code: string; n: number; of: number }[] {
  const n = new Map<string, number>();
  for (const b of birds) for (const f of new Set(b.findings)) if (!f.endsWith(".normal")) n.set(f, (n.get(f) ?? 0) + 1);
  return [...n.entries()].map(([code, k]) => ({ code, n: k, of: birds.length }))
    .sort((a, b) => b.n - a.n || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** أيامُ الطبلة كما يقرؤها المربي: لكلّ يوم تاريخُه وعمرُ القطيع وما يُعطى فيه. */
export function sheetDays(t: Pick<FlockTreatment, "start_on" | "lines">, placedOn: string): { n: number; date: string; age: number; lines: FlockTreatment["lines"] }[] {
  const last = t.lines.reduce((m, l) => Math.max(m, l.day_to), 0);
  const out: { n: number; date: string; age: number; lines: FlockTreatment["lines"] }[] = [];
  for (let n = 1; n <= last; n++) {
    const date = addDays(t.start_on, n - 1);
    out.push({ n, date, age: ageOn(placedOn, date), lines: t.lines.filter((l) => l.day_from <= n && n <= l.day_to) });
  }
  return out;
}

/** كمّيةُ المادّة لليوم الواحد (بوحدة الجرعة) — تحويلٌ لا قرار: الجرعةُ من العلبة، والماءُ والعددُ من الحقل.
 *  null حين ينقص ما يُحسب منه (لا رقمٌ مخترع). `kg_bw` يحتاج تركيزَ المنتج (٪) والوزن. */
export function dailyAmount(
  l: { dose_amount: number | null; dose_per: string | null; strength_pct: number | null },
  f: { alive: number; waterL: number | null; avgKg: number | null },
): number | null {
  if (l.dose_amount == null || !l.dose_per) return null;
  switch (l.dose_per) {
    case "liter": return f.waterL != null && f.waterL > 0 ? l.dose_amount * f.waterL : null;
    case "1000_birds": return f.alive > 0 ? (l.dose_amount * f.alive) / 1000 : null;
    case "bird": return f.alive > 0 ? l.dose_amount * f.alive : null;
    case "kg_bw": {
      if (f.avgKg == null || f.avgKg <= 0 || f.alive <= 0 || !l.strength_pct) return null;
      return (l.dose_amount * f.alive * f.avgKg) / (l.strength_pct / 100);   // ملغم من المنتج = فعّال ÷ التركيز
    }
    case "total": return l.dose_amount;
    default: return null;
  }
}

/** ماءُ اللاحم التقديريّ لليوم (لتر لكلّ ١٠٠٠ طير عند ~٢٠°م) حسب الأسبوع — **تقدير** يُكتب عليه ذلك، ويُغلَب
 *  بقراءة العدّاد متى وُجدت. الأرقامُ مرجعٌ للتصميم (docs/field-cases-plan.md، الملحق ب-٥)، لا جرعة. */
export const BROILER_WATER_L_PER_1000: readonly number[] = [65, 120, 180, 245, 290, 330];
export function estimatedWaterL(age: number, alive: number): number | null {
  if (age < 1 || alive <= 0) return null;
  const wk = Math.min(BROILER_WATER_L_PER_1000.length, Math.ceil(age / 7));
  return (BROILER_WATER_L_PER_1000[wk - 1] * alive) / 1000;
}
