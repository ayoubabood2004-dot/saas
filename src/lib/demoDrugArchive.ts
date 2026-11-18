/* ============================================================================
 * مرآةُ 0280 بالتجريبيّ: `clinic_drug_hide` و`clinic_drug_catalog_set` حرفاً على مخزن الجهاز لكلّ عيادة — البوّابة (المصوّرُ يُردّ)،
 * والختمُ (`clinic_switched` حين لا يطابق العيادةَ النشطة)، والأسماءُ (مصفوفةُ نصوص حتى ٥٠٠، كلٌّ ١–١٢٠ بعد القصّ)، والمفتاحُ
 * searchable (مرآةُ search_norm)، واسمان بمفتاحٍ واحد صفٌّ واحد (الأوّل)، والعددُ ما تغيّر فعلاً. كسولةٌ من repoDemo وحده.
 * ========================================================================= */
import { getActiveClinicId } from "./clinics";
import { demoApiGate, demoHint } from "./demoRole";
import { DRUG_HINTS, trimDrugName } from "./medIndex";
import { searchable } from "./utils";

type Store = { off: boolean; hidden: { name_key: string; name: string; hidden_at: string }[] };
const active = () => getActiveClinicId() || "default";
const key = (clinic: string) => `vp_demo_drug_archive_${clinic || "default"}`;
function load(clinic: string): Store {
  try {
    const v = JSON.parse(localStorage.getItem(key(clinic)) || "null") as Partial<Store> | null;
    return { off: v?.off === true, hidden: Array.isArray(v?.hidden) ? v!.hidden! : [] };
  } catch { return { off: false, hidden: [] }; /* swallow-ok: مخزنٌ تالف كفراغه */ }
}
const save = (clinic: string, s: Store) => localStorage.setItem(key(clinic), JSON.stringify(s));
const err = (code: keyof typeof DRUG_HINTS) => demoHint(code, DRUG_HINTS[code]);

export const demoArchiveCatalog = (): { catalog_off: boolean }[] => {
  const s = load(active());
  return [{ catalog_off: s.off }];
};
export const demoArchiveHidden = () => load(active()).hidden.slice().sort((a, b) => (a.hidden_at < b.hidden_at ? 1 : -1));

function gate(clinic: string): void {
  demoApiGate();
  if (clinic !== active()) throw err("clinic_switched");
}

export async function demoDrugHide(clinic: string, names: unknown, hide: unknown): Promise<number> {
  gate(clinic);
  if (!Array.isArray(names) || typeof hide !== "boolean" || names.some((n) => typeof n !== "string")) throw err("bad_ops");
  if (names.length > 500) throw err("too_many_ops");
  const clean = (names as string[]).map((n) => trimDrugName(n));
  const normKeys = clean.map((n) => searchable(n));
  if (clean.some((n, i) => !normKeys[i] || n.length > 120)) throw err("clinic_drugs_bad_name");
  const s = load(clinic);
  const before = s.hidden.length;
  if (hide) {
    const now = new Date().toISOString();
    for (const n of clean) {
      const k = searchable(n);
      if (!s.hidden.some((h) => h.name_key === k)) s.hidden.push({ name_key: k, name: n, hidden_at: now });
    }
  } else {
    const ks = new Set(clean.map((n) => searchable(n)));
    s.hidden = s.hidden.filter((h) => !ks.has(h.name_key));
  }
  save(clinic, s);
  return Math.abs(s.hidden.length - before);
}

export async function demoDrugCatalogSet(clinic: string, off: unknown): Promise<boolean> {
  gate(clinic);
  if (typeof off !== "boolean") throw err("bad_ops");
  const s = load(clinic);
  const changed = s.off !== off;
  s.off = off;
  save(clinic, s);
  return changed;
}
