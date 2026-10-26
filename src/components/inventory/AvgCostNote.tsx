import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Product } from "@/types";
import { Button } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { consumptionApi } from "@/lib/consumptionApi";
import { fromScaled, roundScaled, toMicro } from "@/lib/consumption";
import { describeDbError } from "@/lib/errors";
import { formatDec } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * متوسّطُ الكلفة بنموذج المادة (0255) — «شكد كلّفتني العلبة فعلاً؟» بجانب سعر الشراء.
 *
 * قرارُ المالك (٣١/١٠): الكلفةُ للمستهلكات والتلف وبيع المواد = المتوسّطُ المتحرّك من فواتير الشراء،
 * و«سعر الشراء» يبقى آخرَ سعر. فالنموذجُ يقول الاثنين ولا يخلطهما: المتوسّطُ للقراءة وحدَه، وتعديلُ
 * سعر الشراء لا يحرّكه (الخادمُ يرفض أيَّ كتابةٍ عليه — avg_cost_frozen — والنموذجُ لا يرسله أبداً).
 * وما دام المتوسّطُ مجهولاً (null) فالكلفةُ سعرُ الشراء كما كانت، ويُقال هذا بدل رقمٍ لا وجود له.
 *
 * والتصحيحُ للمدير وحده (`product_cost_reset`، والخادمُ يفحص الدورَ بنفسه): رقمٌ ≥ ٠ بست منازل
 * (numeric(24,6)) أو «رجّعه يتبع سعر الشراء» (null). الرفضُ يُقال بنصّ الخادم، والنجاحُ يُرى بالرقم
 * نفسِه هنا ثمّ تُقرأ القائمةُ من جديد (`onChanged`).
 *
 * الكلفةُ سرُّ العيادة: لا شيءَ هنا إلا لمن `can("viewProfits")` وجهازُه غيرُ مقفول (`restricted`).
 * النصوصُ بنطاق avgc المملوك (hot-paths.json): هذه الوحدةُ لا تُستورد ثابتاً أبداً — تُحمَّل بـ
 * page(…, ["avgc"]) من AvgCostSlot (ProductMovements.tsx) فتصل نصوصُها معها وحدَها.
 * ==========================================================================*/

export interface AvgCostNoteProps {
  /** المادّةُ كما فُتح عليها النموذج (avg_cost منها). */
  product: Product;
  /** بعد تصحيحٍ ناجح: القائمةُ تُقرأ من جديد. */
  onChanged: () => void;
}

/** ما يُرسل لـproduct_cost_reset: رقمٌ ≥ ٠ بست منازل كحدٍّ أقصى — وإلا undefined (لا تقريبَ صامتاً لما
 *  كتبه المدير: سبعُ منازل تُرفض هنا لا تُقصّ). */
export function parseAvgCost(text: string): number | undefined {
  const s = text.trim();
  if (!s) return undefined;
  try {
    const u = toMicro(s);
    return u < 0n ? undefined : fromScaled(u, 6);
  } catch {
    return undefined;
  }
}

/** المتوسّطُ للعرض بمنزلتين — كما يكلّف به الخادمُ العلبة (round(stock_unit_cost, 2)). */
const shown = (avg: number): string => {
  try { return formatDec(fromScaled(roundScaled(avg, 2), 2)); } catch { return formatDec(Number(avg)); }
};

export default function AvgCostNote({ product, onChanged }: AvgCostNoteProps) {
  const { t } = useTranslation();
  const { can, role } = usePermissions();
  const { restricted } = useOverride();
  /** جوابُ الخادم بعد تصحيح — يبقى ما دام النموذجُ على نفس المادّة (القائمةُ تتحدّث، والنموذجُ يحمل لقطتَه). */
  const [fresh, setFresh] = useState<{ of: Product; avg: number | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!can("viewProfits") || restricted) return null;
  const raw = fresh && fresh.of === product ? fresh.avg : product.avg_cost;
  const avg = raw == null ? null : Number(raw);
  const manager = role === "manager";
  const value = parseAvgCost(text);

  const open = () => { playTap(); setErr(null); setText(avg == null ? "" : String(avg)); setEditing(true); };
  /** null = «يتبع سعر الشراء». */
  const send = async (cost: number | null) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await consumptionApi.productCostReset(product.id, cost);
      playSuccess();
      setFresh({ of: product, avg: res?.avg_cost === undefined ? cost : res.avg_cost == null ? null : Number(res.avg_cost) });
      setEditing(false);
      onChanged();
    } catch (e) {
      playWarning();
      setErr(describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3" data-avgcost>
      {avg != null ? (
        <>
          <p className="text-sm font-semibold text-ink tabular-nums" data-avgline="avg">
            {t("avgc.avg", { avg: shown(avg), defaultValue: "متوسط الكلفة: {{avg}} (من فواتير الشراء)" })}
          </p>
          <p className="mt-1 text-2xs text-ink-subtle" data-avghint>{t("avgc.priceHint", "تعديل سعر الشراء ما يغيّر المتوسط")}</p>
        </>
      ) : (
        <p className="text-sm font-semibold text-ink-muted" data-avgline="none">{t("avgc.none", "الكلفة = سعر الشراء (ما بعد صار شراء بالمتوسط)")}</p>
      )}
      {manager && !editing && (
        <button type="button" className="mt-1.5 text-2xs font-bold text-brand-600 hover:underline" onClick={open} data-avgfix>
          {t("avgc.fix", "صحّح المتوسط")}
        </button>
      )}
      {manager && editing && (
        <div className="mt-2 space-y-2" data-avgedit>
          <label className="label" htmlFor={`avg-cost-${product.id}`}>{t("avgc.label", "المتوسط الصحيح لوحدة المخزون")}</label>
          <input id={`avg-cost-${product.id}`} type="number" inputMode="decimal" min="0" step="any" dir="ltr" className="input"
            value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} disabled={busy} data-avginput />
          {text.trim() !== "" && value === undefined && (
            <p className="text-2xs font-semibold text-danger-700 dark:text-danger-300" data-avgbad>
              {t("avgc.bad", "اكتب رقم ٠ أو أكثر، لحد ٦ مراتب بعد الفاصلة")}
            </p>
          )}
          {err && <p role="alert" className="text-2xs font-semibold text-danger-700 dark:text-danger-300" data-avgerr>{err}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={busy} disabled={value === undefined} onClick={() => { if (value !== undefined) void send(value); }} data-avgsave>
              {t("common.save", "حفظ")}
            </Button>
            {avg != null && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send(null)} data-avgfollow>
                {t("avgc.follow", "رجّعه يتبع سعر الشراء")}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { playTap(); setEditing(false); setErr(null); }} data-avgcancel>
              {t("common.cancel", "إلغاء")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
