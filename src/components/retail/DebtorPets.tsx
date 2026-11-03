/* ============================================================================
 * «ملف حيواناته» من دفتر الزبون (سجل الديون) — زرٌّ صغير لكلّ حيوانٍ للزبون المدين يفتح سجلَّه.
 *
 * مَن هو الزبون؟ تعريفٌ واحد بالنظام: `custKey` (customerKey.ts، مرآةُ cust_key بالقاعدة) — الهاتفُ بمفتاح
 * دولة العيادة يغلب، وإلا الاسمُ المطويّ. ودليلُ الزبائن (`customer_search`، 0232) يرجع حيواناتِ كلِّ مجموعةٍ بهذا
 * المفتاح. فنسأله بهاتف الدفتر (أو اسمه) **ونأخذ المجموعةَ التي مفتاحُها مفتاحُ الدفتر حرفاً** — لا أوّلَ نتيجة:
 * بحثُ الاسم يرجع أسماءً متشابهة، وزرٌّ يفتح حيوانَ زبونٍ آخر أسوأُ من لا زرّ.
 *
 * وفشلُ البحث يُقال (سطرٌ وإعادة) — غيابُ الأزرار عن خطأٍ يقرأه الكاشير «ما عنده حيوان».
 *
 * النصوصُ بنطاق dpets المملوك (hot-paths.json): القطعةُ كسولةٌ من DebtsPanel بـpage(…, ["dpets"]) — retail
 * حارٌّ (بايتاتُ الإقلاع) والنصفُ البارد ممتلئ.
 * ========================================================================== */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PawPrint, RotateCcw } from "lucide-react";
import type { CustomerPet } from "@/types";
import { repo } from "@/lib/repo";
import { custKey, debtorQuery, petsOfKey } from "@/lib/customerKey";
import { getDialCode } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

export function DebtorPets({ phone, name }: { phone: string | null; name: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const key = custKey(phone, name, getDialCode());
  const [pets, setPets] = useState<CustomerPet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) { setPets([]); return; }
    let alive = true;
    setFailed(false);
    repo.findCustomers(debtorQuery(phone, name), { limit: 20 })
      .then(({ rows }) => { if (alive) setPets(petsOfKey(rows, key)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  if (failed) {
    return (
      <button
        type="button" data-debtorpets-failed
        onClick={() => { playTap(); setTick((n) => n + 1); }}
        className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-2xs font-semibold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
      >
        <RotateCcw size={11} /> {t("dpets.failed")}
      </button>
    );
  }
  if (!pets || pets.length === 0) return null;

  return (
    <div data-debtorpets className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {pets.map((p) => (
        <button
          key={p.id} type="button"
          onClick={() => { playTap(); navigate(`/pet/${p.id}`); }}
          title={t("dpets.openHint")}
          className={cn(
            "inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-bold transition",
            p.deceased
              ? "border-line bg-surface-2 text-ink-subtle hover:text-ink"
              : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300",
          )}
        >
          <PawPrint size={11} className="shrink-0" />
          <span className="truncate">{t("dpets.open", { name: p.name?.trim() || t("dpets.unnamed") })}</span>
          {p.deceased && <span className="shrink-0 font-normal">· {t("dpets.deceased")}</span>}
        </button>
      ))}
    </div>
  );
}
