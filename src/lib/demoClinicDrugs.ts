import type { ClinicDrug, ClinicDrugOp, ClinicDrugsSnapshot, MedicineStock } from "@/types";
import { applyOps, cmpMine, DrugOpError, drugKey } from "./medIndex";
import { getActiveClinicId } from "./clinics";
import { loadDB } from "./demoStore";
import { localISO, searchable } from "./utils";

/* ============================================================================
 * «أدويتي» بالنسخة التجريبية — مرآةُ 0229 بمخزن الجهاز لكلّ عيادة.
 *
 * ليست عرضاً: فحوصُ المنطق تجري عليها، فانحرافُها عن الخادم يُخفي العطلَ بدل أن يكشفه.
 * فالكتابةُ نفسُها `applyOps` (مرآةُ clinic_drugs_apply سطراً بسطر)، والرفضُ برموزه
 * وتلميحاته العربية حرفاً: `clinic_switched` حين لا يطابق الختمُ العيادةَ النشطة،
 * `drug_row_gone`، `drug_exists`، `clinic_drugs_full`. **ولا دالّةَ حذف** — كالخادم.
 * تُحمَّل كسولةً من repoDemo عند أوّل نداء.
 * ==========================================================================*/

const KEY = (clinic: string) => `vp_demo_clinic_drugs_${clinic || "default"}`;
const activeClinic = () => getActiveClinicId() || "default";

function load(clinic: string): ClinicDrug[] {
  try {
    const raw = localStorage.getItem(KEY(clinic));
    const list = raw ? (JSON.parse(raw) as ClinicDrug[]) : [];
    return Array.isArray(list) ? list : [];
  } catch { /* swallow-ok: جهازٌ بلا تخزين = بلا «أدويتي» محفوظة بالتجريبي */ return []; }
}

/** ترتيبُ الخادم: `in_mine desc, pos, created_at, id`. */
function ordered(rows: ClinicDrug[]): ClinicDrug[] {
  return rows.slice().sort((a, b) =>
    a.in_mine !== b.in_mine ? (a.in_mine ? -1 : 1)
      : a.in_mine ? cmpMine(a, b)
        : a.created_at.localeCompare(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function demoDrugsList(): ClinicDrugsSnapshot {
  const clinic = activeClinic();
  return { clinic, rows: ordered(load(clinic)) };
}

export function demoDrugsApply(clinic: string, ops: ClinicDrugOp[]): ClinicDrugsSnapshot {
  const active = activeClinic();
  if (clinic !== active) throw new DrugOpError("clinic_switched");
  const next = applyOps(load(active), ops);   // يرمي كالخادم، ولا يكتب نصفَ دفعة
  localStorage.setItem(KEY(active), JSON.stringify(next));   // حصّةٌ ممتلئة ترمي — لا «تمّ» كاذبة
  return { clinic: active, rows: ordered(next) };
}

/** «الأخيرة» من علاجات النسخة التجريبية — الأحدثُ أوّلاً، اثنا عشر اسماً مختلفاً. */
export function demoRecentMedNames(days: number): string[] {
  const since = localISO(new Date(Date.now() - days * 86400000));
  const rows = (loadDB().treatments ?? [])
    .filter((t) => (t.task_type ?? "drug") === "drug" && t.day >= since)
    .sort((a, b) => b.day.localeCompare(a.day) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 400);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of rows) {
    const name = String(t.medication ?? "").trim();
    const k = searchable(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

export function demoMedicineStock(): MedicineStock[] {
  return (loadDB().products ?? [])
    .filter((p) => !p.farm_id && p.category === "medicine" && Number(p.stock) > 0)
    .map((p) => ({ id: p.id, name: p.name, stock: Number(p.stock) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** مرآةُ clinic_drugs_suggest: علاجاتٌ وسطورُ بيعِ «دواء» آخرَ n يوماً، بلا ما بـ«أدويتي» ولا المؤرشف. */
export function demoSuggest(days: number): { name: string; n: number }[] {
  const d = Math.max(1, Math.min(days || 90, 365));
  const db = loadDB();
  const sinceDay = localISO(new Date(Date.now() - d * 86400000));
  const sinceAt = new Date(Date.now() - d * 86400000).toISOString();
  const used: { nm: string; at: string }[] = [];
  for (const t of db.treatments ?? []) {
    if ((t.task_type ?? "drug") === "drug" && t.day >= sinceDay) used.push({ nm: String(t.medication ?? "").trim(), at: t.created_at ?? t.day });
  }
  const meds = new Set((db.products ?? []).filter((p) => p.category === "medicine").map((p) => p.id));
  const invAt = new Map((db.invoices ?? []).map((i) => [i.id, i.created_at] as const));
  for (const i of db.invoiceItems ?? []) {
    const at = invAt.get(i.invoice_id) ?? "";
    if (i.product_id && meds.has(i.product_id) && i.qty > 0 && at >= sinceAt) used.push({ nm: String(i.name ?? "").trim(), at });
  }
  const groups = new Map<string, { n: number; last: string; spell: Map<string, { c: number; last: string }> }>();
  for (const u of used) {
    const k = drugKey(u.nm);
    if (!k) continue;
    const g = groups.get(k) ?? { n: 0, last: "", spell: new Map() };
    g.n++;
    if (u.at > g.last) g.last = u.at;
    const s = g.spell.get(u.nm) ?? { c: 0, last: "" };
    s.c++;
    if (u.at > s.last) s.last = u.at;
    g.spell.set(u.nm, s);
    groups.set(k, g);
  }
  const rows = load(activeClinic());
  const taken = new Set(rows.filter((r) => r.in_mine || r.archived_at != null).map((r) => drugKey(r.name)));
  return [...groups.entries()]
    .filter(([k]) => !taken.has(k))
    .map(([, g]) => {
      const nm = [...g.spell.entries()].sort((a, b) => b[1].c - a[1].c || b[1].last.localeCompare(a[1].last) || a[0].localeCompare(b[0]))[0][0];
      return { name: nm, n: g.n, last: g.last };
    })
    .sort((a, b) => b.n - a.n || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .slice(0, 40)
    .map(({ name, n }) => ({ name, n }));
}
