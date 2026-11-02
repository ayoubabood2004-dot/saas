/* ============================================================================
 * مرآةُ report_pnl (0256) للنسخة التجريبية — الحسابُ نفسُه (computePnl، src/lib/pnl.ts) على مخزن الجهاز،
 * والحرّاسُ نفسُها بترتيبها: المصوّرُ أبداً، ثمّ viewProfits بمرآة staff_can (staffCan، demoConsumption.ts — لا
 * نسخةٌ ثانية)، ثمّ المدّة. كسولةٌ من باب repoDemo وحده (loadDemoPnl) كمرآة المستهلكات.
 *
 * ما يختلف عن الخادم عن قصد: المخزنُ عيادةٌ واحدة (فلا clinic_id يُصفّى)، ودفترُ المستهلكات قيمتُه بالفلس نصّاً
 * (value_c) لا بالدينار. والتلميحاتُ بمهارب يونيكود: بياناتٌ تطابق تلميحَ الخادم حرفاً، لا نصُّ واجهة.
 * ========================================================================= */
import { loadDB } from "./demoStore";
import { demoRepo } from "./repoDemo";
import { staffCan } from "./demoConsumption";
import { demoBaseRole } from "./demoRole";
import { computePnl, type PnlReport } from "./pnl";

const HINT = {
  forbidden: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0623\u0631\u0628\u0627\u062D \u0648\u0627\u0644\u062E\u0633\u0627\u0626\u0631 \u0644\u0645\u0646 \u064A\u0634\u0648\u0641 \u0627\u0644\u0623\u0631\u0628\u0627\u062D \u2014 \u0627\u0637\u0644\u0628\u0647 \u0645\u0646 \u0627\u0644\u0645\u062F\u064A\u0631",
  pnl_range: "\u0627\u062E\u062A\u0631 \u0645\u062F\u0651\u0629 \u0635\u062D\u064A\u062D\u0629 \u2014 \u0627\u0644\u0628\u062F\u0627\u064A\u0629 \u0642\u0628\u0644 \u0627\u0644\u0646\u0647\u0627\u064A\u0629",
  pnl_range_long: "\u0627\u0644\u0645\u062F\u0651\u0629 \u0623\u0637\u0648\u0644 \u0645\u0646 \u0633\u0646\u0629 \u0648\u0634\u0647\u0631 \u2014 \u0642\u0633\u0651\u0645\u0647\u0627 \u0644\u0641\u062A\u0631\u062A\u064A\u0646",
} as const;
const fail = (code: string, sqlstate: string, hint: string) => Object.assign(new Error(code), { code: sqlstate, hint });

/** التقرير كما يرجعه report_pnl لصاحب الجلسة التجريبية — أو رفضُه برمز الخادم وتلميحه. */
export async function demoReportPnl(from: string, to: string, tz: string): Promise<PnlReport> {
  // مرآةُ is_photographer ثمّ staff_can('viewProfits'): رفضٌ واحدٌ بالرمز نفسِه (42501 pnl_forbidden).
  if (demoBaseRole() === "photographer" || !(await staffCan("viewProfits"))) throw fail("pnl_forbidden", "42501", HINT.forbidden);
  const db = loadDB();
  const [expenses, categories] = await Promise.all([demoRepo.listExpenses(), demoRepo.listExpenseCategories()]);
  try {
    return computePnl({
      invoices: db.invoices ?? [],
      items: db.invoiceItems ?? [],
      consumption: (db.consumption ?? []).map((c) => ({ invoice_id: c.invoice_id, cents: BigInt(c.value_c) })),
      expenses, categories,
    }, from, to, tz);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "pnl_range" || m === "pnl_range_long") throw fail(m, "P0001", HINT[m]);
    throw e;
  }
}
