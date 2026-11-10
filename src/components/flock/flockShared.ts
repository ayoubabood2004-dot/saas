/* ============================================================================
 * حالةُ الحقل — ما تتقاسمه شاشاتُها (رفيقةُ نطاق flk: لا يستوردها إلا FlockCases ورفاقُها).
 *
 * العمرُ بقرار المالك ١: يومُ الوصول عمر ١ (flockMath.ageOn، مرآةُ _flock_age)، والأسبوعُ من العمر.
 * والخطأُ يُقال برمزه: الخادمُ يرفض بـflock_* وتلميحٍ عربيّ، والتجريبيُّ بالرمز وحده — فالقاموسُ
 * يترجم الرمز، والتلميحُ (أدقّ: يسمّي الحقلَ والحدّ) يُقدَّم بالعربية. ولا «انتهت الجلسة» عن رفضِ دور.
 * ========================================================================= */
import type { TFunction } from "i18next";
import i18next from "i18next";
import { describeDbError } from "@/lib/errors";
import { localISO, searchable } from "@/lib/utils";
import { addDays, ageOn, diffDays } from "@/lib/flockMath";
import type { FlockBoardRow, FlockCase, FlockStats } from "@/lib/flockTypes";

/** الأسبوعُ من العمر: ١–٧ الأوّل. */
export const weekOf = (age: number): number => Math.max(1, Math.ceil(age / 7));

/** «عمر ٢٣ · الأسبوع ٤» — للتاريخ `on` من وصول الوجبة. */
export function ageLabel(t: TFunction, placedOn: string, on: string): string {
  const age = ageOn(placedOn, on);
  return age < 1 ? t("flk.beforeArrival") : t("flk.ageWeek", { age, week: weekOf(age) });
}

/** يومٌ قصير «١٧/١١» (والسنةُ إن لم تكن سنةَ اليوم). */
export function dayLabel(iso: string | null | undefined, today?: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const short = `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return today && today.slice(0, 4) !== d.slice(0, 4) ? `${short}/${d.slice(0, 4)}` : short;
}

/** يومُ بغداد لختمٍ من الخادم (timestamptz بـUTC): `at.slice(0, 10)` يومُ غرينتش — زيارةٌ بعد التاسعة مساءً
 *  بتوقيت بغداد تُقرأ يومَ أمسٍ بعمرٍ أصغر بيوم. اليومُ المحلّيّ للجهاز (عياداتُ العراق ببغداد) كـlocalISO بكلّ النظام. */
export const localDay = (iso: string): string => localISO(new Date(iso));

/** «اليوم» / «باكر» / «أمس» / «بعد ٣ أيام» / «قبل ٣ أيام» — نسبةً لليوم. */
export function relDay(t: TFunction, iso: string, today: string): string {
  const n = diffDays(today, iso);
  if (n === 0) return t("flk.rel.today");
  if (n === 1) return t("flk.rel.tomorrow");
  if (n === -1) return t("flk.rel.yesterday");
  return n > 0 ? t("flk.rel.inDays", { n }) : t("flk.rel.daysAgo", { n: -n });
}

/** رسالةُ رفضٍ تُفهم: رمزُ flock_* بالقاموس (والتلميحُ العربيّ أدقّ بالعربية)، وغيرُه كما بباقي النظام. */
export function flockError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { message?: string; hint?: string };
  const code = typeof err.message === "string" && /^flock_[a-z_]+$/.test(err.message) ? err.message : null;
  if (code) {
    if (typeof err.hint === "string" && /[\u0600-\u06FF]/.test(err.hint) && i18next.language?.startsWith("ar")) return err.hint.trim();
    const said = t(`flk.err.${code}`, { defaultValue: "" });
    if (said) return said;
  }
  return describeDbError(e, t);
}

/** أهمّيةُ الوجبة بالقائمة: الإنذارُ ثمّ التحصينُ المتأخّر ثمّ الزيارةُ المتأخّرة ثمّ السحبُ ثمّ تحصينٌ قريب. */
export function urgency(s: FlockStats, today: string): number {
  const soon = s.next_vax ? diffDays(today, s.next_vax.due_on) <= 1 : false;
  return (s.mortality_alert ? 1000 : 0) + (s.vax_overdue > 0 ? 300 : 0) + (s.visit_overdue ? 100 : 0)
    + (s.withdrawal_unknown ? 60 : 0) + (s.in_withdrawal ? 30 : 0) + (soon ? 20 : 0);
}

/** بحثٌ بالحقل وصاحبه ورقمه والمنطقة — الطرفان من searchable نفسِها (CLAUDE.md §٣). */
export function matchesBoard(r: FlockBoardRow, q: string): boolean {
  const needle = searchable(q);
  if (!needle) return true;
  const hay = searchable([r.farm.name, r.farm.owner_name, r.farm.owner_phone, r.farm.area, r.farm.governorate, r.case.breed].filter(Boolean).join(" "));
  if (hay.includes(needle)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && (r.farm.owner_phone ?? "").replace(/\D/g, "").includes(digits);
}

/** الوجبةُ مغلقة؟ الكتابةُ كلُّها تُرفض بالخادم (flock_case_closed)، والشاشةُ تقولها قبل الضغط. */
export const isClosed = (c: Pick<FlockCase, "status">): boolean => c.status === "closed";

/** تاريخُ الوصول من «عمرها اليوم»: العمرُ ١ = اليوم (القرار ١). */
export const placedFromAge = (today: string, age: number): string => addDays(today, -(Math.max(1, Math.floor(age)) - 1));

/** مرجعُ عمليةٍ من الجهاز (client_ref): إعادةُ الإرسال بعد انقطاعٍ ترجع ما انحفظ لا نسخةً ثانية. */
export const newRef = (): string =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/** هروبُ HTML للمطبوعات. */
export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** رقمٌ مختصر بلا أصفارٍ زائدة: ٠٫٥ لا ٠٫٥٠٠. */
export const num = (n: number | null | undefined, max = 2): string =>
  n == null || !Number.isFinite(n) ? "—" : String(Number(n.toFixed(max)));
