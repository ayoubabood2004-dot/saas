/* الأرباح والخسائر شهراً بشهر (0256): بابٌ واحدٌ للسحابة وللنسخة التجريبية، يُحمَّل كسولاً.
 *
 * خارج repo.ts كباب المستهلكات: repo بحزمة الإقلاع وفسحتُها بضعُ مئات بايت، والتقريرُ يُقرأ من تبويبه وحده
 * (التقارير › الأرباح والخسائر) — `import("@/lib/pnlApi")` وحده، لا استيرادٌ ثابت.
 *
 * العقد: القراءةُ ترمي عند أيّ فشل (rpcJson) وعند جوابٍ بغير شكله — لا تقريرَ بأصفارٍ عن خطأ: صافٍ كاذبٌ يُصدَّق.
 * وهي قراءةٌ لا كتابة، فتُسمح باشتراكٍ منتهٍ كباقي التقارير (لا حارسَ «القراءة فقط»). */
import { supabase } from "./supabase";
import { rpcJson } from "./rpcJson";
import type { PnlReport, PnlTotals } from "./pnl";
export type { PnlReport, PnlMonth, PnlTotals, PnlCategoryLine } from "./pnl";

export interface PnlApi {
  /** [from, to] مغلقةٌ بطرفيها (ISO)، والأشهرُ بتوقيت `tz` (saleTz). */
  report(from: string, to: string, tz: string): Promise<PnlReport>;
}

const NUM: (keyof PnlTotals)[] = ["invoices", "revenue", "cogs", "cogs_products", "cogs_materials", "cogs_other", "gross", "adjust",
  "stock_loss", "returns", "payroll", "payroll_loan", "uncategorized", "expenses", "net"];
const shapeError = () => Object.assign(new Error("pnl_shape"), { code: "pnl_shape" });
/** سطرٌ يُقرأ كما هو أو يرمي: رقمٌ مفقودٌ أو غيرُ رقميّ لا يصير صفراً بالشاشة. */
function totalsOf(x: unknown): PnlTotals {
  if (!x || typeof x !== "object") throw shapeError();
  const o = x as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const k of NUM) {
    const n = typeof o[k] === "string" ? Number(o[k]) : o[k];
    if (typeof n !== "number" || !Number.isFinite(n)) throw shapeError();
    out[k] = n;
  }
  if (!Array.isArray(o.categories)) throw shapeError();
  out.categories = o.categories.map((c: unknown) => {
    const r = c as Record<string, unknown> | null;
    const amount = typeof r?.amount === "string" ? Number(r.amount) : r?.amount;
    if (!r || typeof r.id !== "string" || typeof amount !== "number" || !Number.isFinite(amount)) throw shapeError();
    return { id: r.id, name: typeof r.name === "string" ? r.name : null, amount };
  });
  return out as unknown as PnlTotals;
}
/** جوابُ report_pnl ← التقرير، أو رميٌ (pnl_shape) — مصدَّرٌ ليُفحص بسلوكه (pnl-test). */
export function readPnl(raw: unknown): PnlReport {
  const r = raw as { months?: unknown; total?: unknown } | null;
  if (!r || !Array.isArray(r.months)) throw shapeError();
  const months = r.months.map((m: unknown) => {
    const month = (m as { month?: unknown } | null)?.month;
    if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) throw shapeError();
    return { month, ...totalsOf(m) };
  });
  return { months, total: totalsOf(r.total) };
}

const cloud: PnlApi = {
  report: async (from, to, tz) => readPnl(await rpcJson<unknown>("report_pnl", { p_from: from, p_to: to, p_tz: tz })),
};

/* النسخةُ التجريبية: نفسُ العقد على localStorage، كسولةٌ هي الأخرى (demoPnl.ts) — من باب repoDemo وحده كمرآة
 * المستهلكات، فلا يكبر الإقلاع. */
const local = () => import("./repoDemo").then((m) => m.loadDemoPnl());
const demo: PnlApi = {
  report: async (from, to, tz) => readPnl(await (await local()).demoReportPnl(from, to, tz)),
};

export const pnlApi: PnlApi = supabase ? cloud : demo;
