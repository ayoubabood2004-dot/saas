/* ============================================================================
 * أسعارُ التطعيمات (0279) — بطاقةُ الإعدادات، وسطرُ التعبئة بنموذج البيع.
 *
 * طلبُ المالك (١٧/١١): «بالإعدادات نسوي تسعيرات للتطعيمات، والدكتور لمن يختار تطعيم بالمبيعات يكون هو سعره سابقاً» — **يتعبّى
 * ويكدر يغيّره**. السعرُ صفٌّ لكلّ تطعيمٍ باسمه بالخادم (للعيادة كلّها)، يكتبه المدير أو من عنده صلاحيةُ الإعدادات.
 *  • التطعيمُ يُختار من القائمة نفسِها التي يختار منها نموذجُ البيع (المدمجةُ وما أضافته العيادة) — لا اسمٌ يُكتب باليد فيختلف حرفاً
 *    ولا يتعبّى أبداً.
 *  • القائمةُ تُقرأ من الخادم بعد كلّ كتابة (ما انحفظ فعلاً لا ما أُرسل)، وفشلُ قراءتها «أعد المحاولة» — لا «ماكو أسعار».
 *  • جدولٌ غائب (واجهةٌ سبقت هجرتها) يُخفي البطاقة بصمت.
 * النصوصُ بنطاق vxp المملوك (hot-paths.json): القطعةُ كسولةٌ من الإعدادات ونموذج البيع بـpage(…, ["vxp"]).
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw, Syringe, Tag, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, money } from "@/lib/utils";
import { readVaxPrice, vaxKey, type VaxPriceRow } from "@/lib/vaccinePrices";
import { listVaxPrices, setVaxPrice, vaxPricesMissing } from "@/lib/vaccinePricesApi";

export function VaxPriceCard({ names }: { names: string[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { role, can } = usePermissions();
  const canEdit = role === "manager" || can("manageSettings");
  const [rows, setRows] = useState<Map<string, VaxPriceRow> | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "missing">("loading");
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState((s) => (s === "ready" ? s : "loading"));
    listVaxPrices()
      .then((m) => { if (alive) { setRows(m); setState("ready"); } })
      .catch((e) => { if (alive) setState(vaxPricesMissing(e) ? "missing" : "failed"); });
    return () => { alive = false; };
  }, [tick]);

  /* المسعَّرةُ بترتيب قائمة التطعيمات، وما سُعّر باسمٍ لم يعد بالقائمة (تطعيمٌ أضافته العيادة ثمّ حذفته) يبقى ظاهراً ويُشال — لا يختفي
   * سعرٌ بالقاعدة عن عين المدير. */
  const priced = useMemo(() => {
    if (!rows) return [];
    const seen = new Set<string>();
    const out: { name: string; price: number; gone: boolean }[] = [];
    for (const n of names) {
      const r = rows.get(vaxKey(n));
      if (r && !seen.has(vaxKey(n))) { seen.add(vaxKey(n)); out.push({ name: n, price: r.price, gone: false }); }
    }
    for (const [k, r] of rows) if (!seen.has(k)) out.push({ name: r.name, price: r.price, gone: true });
    return out;
  }, [rows, names]);

  if (state === "missing") return null;

  const val = readVaxPrice(draft);
  const bad = draft.trim() !== "" && Number.isNaN(val);
  const choose = (n: string) => {
    setPick(n);
    const cur = n ? rows?.get(vaxKey(n)) : undefined;
    setDraft(cur ? String(cur.price) : "");
  };
  const write = async (name: string, price: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setVaxPrice(name, price);
      playSuccess();
      toast.success(r.price == null ? t("vxp.cleared", { name: r.name }) : t("vxp.saved", { name: r.name, price: money(r.price) }));
      if (price != null) { setPick(""); setDraft(""); }
      setTick((n) => n + 1);
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-line pt-4" data-vxp-card>
      <div className="mb-1 flex items-center gap-2">
        <Tag size={16} className="text-brand-600" />
        <h3 className="text-sm font-bold text-ink">{t("vxp.title")}</h3>
      </div>
      <p className="mb-3 text-xs text-ink-subtle">{t("vxp.subtitle")}</p>

      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
          <select className="input py-2" value={pick} onChange={(e) => choose(e.target.value)} data-vxp-pick aria-label={t("vxp.pick")}>
            <option value="">{t("vxp.pick")}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input dir="ltr" inputMode="decimal" className={cn("input py-2 text-center tabular-nums", bad && "border-danger-400")} value={draft} disabled={!pick}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pick && val != null && !Number.isNaN(val)) void write(pick, val); }}
            placeholder={t("vxp.pricePh")} aria-label={t("vxp.pricePh")} data-vxp-price />
          <button type="button" className="btn-primary py-2" disabled={busy || !pick || val == null || Number.isNaN(val)}
            onClick={() => { if (pick && val != null && !Number.isNaN(val)) void write(pick, val); }} data-vxp-save>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Syringe size={15} />} {t("vxp.save")}
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted" data-vxp-readonly>{t("vxp.readOnly")}</p>
      )}
      {bad && <p className="mt-1.5 text-2xs font-bold text-danger-600">{t("vxp.badPrice")}</p>}
      {canEdit && pick && val != null && !Number.isNaN(val) && (
        <p className="mt-1.5 text-2xs text-ink-subtle" data-vxp-reads>{t("vxp.reads", { price: money(val) })}</p>
      )}

      {state === "loading" && <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-subtle"><Loader2 size={13} className="animate-spin" />{t("vxp.loading")}</p>}
      {state === "failed" && (
        <button type="button" onClick={() => { playTap(); setTick((n) => n + 1); }} data-vxp-failed
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-warn-50 px-2.5 py-1.5 text-xs font-semibold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
          <RotateCcw size={13} />{t("vxp.failed")}
        </button>
      )}
      {state === "ready" && (priced.length === 0
        ? <p className="mt-3 text-xs text-ink-subtle" data-vxp-empty>{t("vxp.empty")}</p>
        : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line" data-vxp-list>
            {priced.map((r) => (
              <li key={vaxKey(r.name)} className="flex items-center gap-2 px-3 py-2" data-vxp-row={r.name}>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                {r.gone && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{t("vxp.gone")}</span>}
                <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{money(r.price)}</span>
                {canEdit && (
                  <button type="button" disabled={busy} title={t("vxp.clear")} aria-label={t("vxp.clear")} data-vxp-clear={r.name}
                    onClick={() => { playTap(); void write(r.name, null); }}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** سطرٌ تحت خانة السعر بنموذج البيع: من أين جاء السعر (ويكدر يغيّره)، أو أن الأسعارَ ما وصلت فيكتبه بيده. */
export function VaxPriceHint({ state }: { state: "auto" | "failed" }) {
  const { t } = useTranslation();
  return state === "auto"
    ? <p className="mt-1.5 text-2xs font-bold text-brand-700 dark:text-brand-300" data-vxp-hint="auto">{t("vxp.autoHint")}</p>
    : <p className="mt-1.5 text-2xs font-bold text-warn-700 dark:text-warn-300" data-vxp-hint="failed">{t("vxp.failedHint")}</p>;
}
