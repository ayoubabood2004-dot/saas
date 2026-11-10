/* ============================================================================
 * حالةُ الحقل (0265) — أنواعُ الصفوف كما ترجعها دوالُّ القاعدة (flock_case_bundle / flock_board).
 * أنواعٌ وحدها: لا شِفرة، فلا تدخل أيَّ حزمة. الحسابُ بـflockMath.ts، والبابُ بـflockApi.ts.
 * ========================================================================= */

export type FlockKind = "broiler" | "layer" | "breeder" | "other";
export type FlockRoute = "water" | "spray" | "eye" | "sc" | "im" | "wing" | "feed" | "other";
export type FlockLineRoute = "water" | "feed" | "spray" | "sc" | "im" | "eye" | "other";
export type FlockLineKind = "med" | "vitamin" | "electrolyte" | "disinfectant" | "other";
export type FlockDoseUnit = "g" | "ml" | "mg" | "tab" | "dose";
export type FlockDosePer = "liter" | "1000_birds" | "kg_bw" | "bird" | "total";
export type FlockGrade = "good" | "fair" | "poor";
export type FlockTrend = "better" | "same" | "worse";
export type FeedPhase = "prestarter" | "starter" | "grower" | "finisher" | "withdrawal" | "layer" | "other";

export interface FlockFarm {
  id: string; clinic_id: string; name: string; owner_name: string | null; owner_phone: string | null; cust_key: string | null;
  governorate: string | null; area: string | null; houses_count: number | null; note: string | null; archived: boolean;
  created_at: string; updated_at: string;
}
export interface FlockCase {
  id: string; clinic_id: string; farm_id: string; kind: FlockKind; breed: string | null; hatchery: string | null;
  placed_on: string; placed_count: number; vet_id: string | null; status: "open" | "closed"; closed_on: string | null;
  close_reason: "sold" | "depleted" | "transferred" | "other" | null; sold_count: number | null; sold_avg_kg: number | null;
  note: string | null; created_at: string; created_by: string | null; updated_at: string;
}
export interface FlockHouse { id: string; case_id: string; label: string; placed_count: number; position: number }
export interface FlockMortality {
  id: string; case_id: string; house_id: string | null; on_date: string; days: number; dead: number; culled: number;
  source: "visit" | "staff" | "farmer"; visit_id: string | null; note: string | null; created_at: string; updated_at: string;
}
export interface FlockSnapshot {
  feed_phase?: FeedPhase; feed_source?: string; feed_kg_day?: number; water_l_day?: number; avg_weight_g?: number;
  sample_n?: number; alive_est?: number; temp_c?: number; humidity_pct?: number; note?: string;
}
/** تطبيقُ الطبلة بالزيارة: {معرّفُ الطبلة: {معرّفُ السطر: نعم/جزئياً/لا}}. */
export type FlockCompliance = Record<string, Record<string, "yes" | "partial" | "no">>;
export interface FlockVisit {
  id: string; case_id: string; at: string; kind: "routine" | "complaint" | "followup"; quick: boolean; vet_id: string | null;
  flock: FlockSnapshot; signs: string[]; env: Record<string, FlockGrade>; dx: string | null; dx_codes: string[];
  dx_status: "suspected" | "confirmed" | null; notifiable: boolean; advice: string | null; notes: string | null;
  trend: FlockTrend | null; next_visit_on: string | null; compliance: FlockCompliance;
  created_at: string; created_by: string | null; updated_at: string;
}
export interface FlockNecropsy {
  id: string; case_id: string; visit_id: string; bird_no: number; source: "dead" | "cull" | "sacrificed" | null;
  weight_g: number | null; findings: string[]; scores: Record<string, number>; note: string | null;
}
export interface FlockVax {
  id: string; case_id: string; vaccine: string; disease: string | null; route: FlockRoute; planned_age: number | null;
  status: "planned" | "given" | "skipped"; given_on: string | null; given_by: "vet" | "farmer" | "hatchery" | "other" | null;
  batch_no: string | null; birds_count: number | null; take_ok: boolean | null; note: string | null; skip_reason: string | null;
  from_program: string | null; visit_id: string | null; updated_at: string;
}
export interface FlockTreatmentLine {
  id: string; treatment_id: string; position: number; day_from: number; day_to: number; product_id: string | null;
  product_name: string; kind: FlockLineKind; dose_amount: number | null; dose_unit: FlockDoseUnit | null;
  dose_per: FlockDosePer | null; strength_pct: number | null; hours: number | null; route: FlockLineRoute;
  withdrawal_meat_days: number | null; withdrawal_egg_days: number | null; note: string | null;
}
export interface FlockTreatment {
  id: string; case_id: string; visit_id: string | null; title: string | null; start_on: string;
  status: "active" | "done" | "stopped" | "replaced"; stopped_on: string | null; version: number; supersedes: string | null;
  sent_at: string | null; printed_at: string | null; note: string | null; created_at: string; updated_at: string;
  lines: FlockTreatmentLine[];
}
export interface FlockMedia {
  id: string; case_id: string; visit_id: string | null; bird_no: number | null; kind: "photo" | "lab" | "doc";
  path: string; caption: string | null; created_at: string;
}
export interface FlockProgramStep { age: number; vaccine: string; disease: string | null; route: FlockRoute; at_hatchery: boolean }
export interface FlockProgram {
  id: string; clinic_id: string; name: string; kind: FlockKind; steps: FlockProgramStep[]; archived: boolean; updated_at: string;
}
export interface FlockNextVax { id: string; vaccine: string; route: FlockRoute; age: number; due_on: string }
/** مرآةُ `_flock_stats` حرفاً بحرف (flockMath.flockStats للتجريبيّ). */
export interface FlockStats {
  age: number; ref_on: string; placed: number; dead: number; culled: number; alive: number; cum_pct: number;
  week1_pct: number; week1_recorded: boolean; week1_done: boolean;
  mortality_alert: boolean; alert_houses: string[]; peak_pct_7d: number | null;
  next_vax: FlockNextVax | null; vax_overdue: number; vax_soon: number;
  safe_meat_from: string | null; safe_egg_from: string | null; withdrawal_unknown: boolean; egg_withdrawal_unknown: boolean;
  in_withdrawal: boolean; active_treatments: number;
  last_visit_at: string | null; last_trend: FlockTrend | null; next_visit_on: string | null; visit_overdue: boolean;
}
export interface FlockBundle {
  case: FlockCase; farm: FlockFarm; houses: FlockHouse[]; mortality: FlockMortality[]; visits: FlockVisit[];
  necropsy: FlockNecropsy[]; vax: FlockVax[]; treatments: FlockTreatment[]; media: FlockMedia[]; stats: FlockStats;
}
export interface FlockBoardRow {
  case: FlockCase;
  farm: Pick<FlockFarm, "id" | "name" | "owner_name" | "owner_phone" | "area" | "governorate">;
  houses: number;
  stats: FlockStats;
}
