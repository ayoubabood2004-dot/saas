/* ============================================================================
 * مرآةُ أسعار التطعيمات (0279) بالتجريبيّ — `vaccine_price_set` حرفاً: البوّابة (المصوّرُ يُردّ)، ثمّ المديرُ (أو مفتاحُه الحيّ)
 * أو من له صلاحيةُ الإعدادات، ثمّ الاسمُ (١–١٢٠ بعد القصّ) والسعرُ (صفرٌ فأكثر، بمنزلتين)؛ null يمسح، والاسمُ نفسُه بحالةٍ أخرى
 * يحدّث صفَّه (مفتاحُه `vaxKey`). كسولةٌ من باب repoDemo وحده (loadDemoVaccinePrices).
 * ========================================================================= */
import { demoApiGate, demoBaseRole, demoClinicId, demoHint, demoPinLive } from "./demoRole";
import { staffCan } from "./demoConsumption";
import { vaxKey, type VaxPriceRow } from "./vaccinePrices";

const key = () => `vp_vaccine_prices_${demoClinicId() ?? "default"}`;
function read(): Record<string, VaxPriceRow> {
  try { const v = JSON.parse(localStorage.getItem(key()) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; /* swallow-ok: مخزنٌ تالف كفراغه */ }
}

export function demoVaxPrices(): VaxPriceRow[] {
  return Object.values(read()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function demoSetVaxPrice(rawName: string, rawPrice: number | null): Promise<{ name: string; price: number | null }> {
  demoApiGate();
  const manager = demoBaseRole() === "manager" || demoPinLive();
  if (!manager && !(await staffCan("manageSettings"))) {
    throw Object.assign(demoHint("forbidden", "أسعار التطعيمات يكتبها المدير أو من عنده صلاحية الإعدادات."), { code: "42501" });
  }
  const name = String(rawName ?? "").replace(/^ +| +$/g, "");
  if (name.length < 1 || name.length > 120) throw demoHint("bad_name", "اختر التطعيم.");
  const all = read();
  if (rawPrice == null) {
    delete all[vaxKey(name)];
    localStorage.setItem(key(), JSON.stringify(all));
    return { name, price: null };
  }
  const price = Math.round(Number(rawPrice) * 100) / 100;
  if (!Number.isFinite(price) || price < 0 || price >= 1e10) throw demoHint("bad_price", "السعر لازم رقم صفر أو أكثر.");
  all[vaxKey(name)] = { name, price };
  localStorage.setItem(key(), JSON.stringify(all));
  return { name, price };
}
