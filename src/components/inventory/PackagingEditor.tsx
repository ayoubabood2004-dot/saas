/* ============================================================================
 * محرّرُ «التعبئة» بنموذج المادة (0259) — رفيقُ صفحة المخزون بنطاقها `pkg` (hot-paths.json).
 *
 * الكارتون (حتى أربعة، كلٌّ بعدده من العلب وباركوداته وسعرَيه) ← العلبة (الوحدةُ الوسطى، اسمُها هنا) ← المغلّف (باركوداتُ الوحدة
 * الصغرى القائمة وسعرُ شرائه). السعرُ الفارغ **محسوبٌ من العلبة** ويُرى حسابُه بالحقل نفسِه — اقتراحٌ يُغيَّر لا رقمٌ يُفرض.
 * المحرّرُ مسودّةٌ وحدها (`PackagingDraft`): الحكمُ (`packagingFromDraft`) وصاحبُ الرمز (`codeOwner`) بالحفظ، وهنا يُقالان
 * بجانب الحقل قبل الضغط — رمزٌ مكرّرٌ يُرى عند كتابته لا بعد رفض الخادم.
 * ========================================================================= */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Plus, Trash2 } from "lucide-react";
import type { Product } from "@/types";
import { cn, money, normalizeCode, matchCode } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { PACK_LIMITS, codeOwner, newPackId, type CodeLevel, type PackDraft, type PackagingDraft } from "@/lib/packs";

export interface PackagingEditorProps {
  value: PackagingDraft;
  onChange: (v: PackagingDraft) => void;
  /** أسعارُ العلبة كما بالنموذج الآن — منها يُحسب الفارغ. */
  boxSell: number;
  boxPurchase: number;
  hasSubUnit: boolean;
  unitsPerBox: number;
  subUnitName: string;
  byWeight: boolean;
  pooled: boolean;
  /** المخزنُ المحمَّل والمادةُ نفسُها — لصاحب الرمز قبل الحفظ. */
  products: readonly Product[];
  selfId: string | null;
  disabled?: boolean;
}

/** قائمةُ رموز: رقاقاتٌ تُشال، وحقلٌ يُضيف بـEnter (والماسحُ يرسل Enter) أو عند المغادرة. */
function CodesInput({ codes, onChange, level, products, selfId, disabled, testId }: {
  codes: string[]; onChange: (c: string[]) => void; level: CodeLevel;
  products: readonly Product[]; selfId: string | null; disabled?: boolean; testId: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const add = () => {
    const v = normalizeCode(text);
    setText("");
    if (!v || codes.some((c) => matchCode(c) === matchCode(v))) return;
    onChange([...codes, v]);
  };
  const full = codes.length >= PACK_LIMITS.codes;
  return (
    <div className="space-y-1.5" data-pkgcodes={testId}>
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {codes.map((c) => {
            const owner = codeOwner(products, c, level, selfId);
            return (
              <span key={c} className="inline-flex flex-col">
                <span className={cn("inline-flex items-center gap-1 rounded-full border py-0.5 pe-1 ps-2.5 font-mono text-xs", owner ? "border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-300" : "border-line bg-surface-1 text-ink")} dir="ltr">
                  {c}
                  <button type="button" disabled={disabled} data-pkgcoderm={c}
                    className="grid h-5 w-5 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-100 hover:text-danger-600 disabled:opacity-50 dark:hover:bg-danger-500/20"
                    title={t("pkg.removeCode")} aria-label={t("pkg.removeCode")}
                    onClick={() => { playTap(); onChange(codes.filter((x) => x !== c)); }}>×</button>
                </span>
                {owner && (
                  <span className="mt-0.5 text-2xs font-semibold text-danger-600 dark:text-danger-300" data-pkgowned={c}>
                    {t("pkg.ownedBy", { name: owner.product.name, level: t(`pkg.level.${owner.level}`) })}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {!full && (
        /* اتجاهُ الصفحة (لا dir=auto: الحقلُ الفارغ يصير LTR فيلتصق التلميحُ العربيّ يساراً) — كحقل باركود العلبة؛ وخطُّ الرموز للرمز
           المكتوب وحده لا للتلميح. */
        <input className={cn("input", text && "font-mono")} value={text} disabled={disabled} data-pkgcodein={testId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={t("pkg.codesPh")} />
      )}
    </div>
  );
}

export default function PackagingEditor(props: PackagingEditorProps) {
  const { t } = useTranslation();
  const { value: d, onChange, boxSell, boxPurchase, hasSubUnit, unitsPerBox, subUnitName, byWeight, pooled, products, selfId, disabled } = props;
  const unit = d.unit_name.trim() || t("pkg.level.box");
  const sub = subUnitName.trim() || t("pkg.level.sub");
  const subOn = hasSubUnit && unitsPerBox > 0 && !byWeight;
  const blocked = byWeight || pooled;
  const set = (patch: Partial<PackagingDraft>) => onChange({ ...d, ...patch });
  const setPack = (i: number, patch: Partial<PackDraft>) => set({ packs: d.packs.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const derivedPack = (per: string, box: number) => {
    const n = Number(normalizeCode(per));
    return Number.isInteger(n) && n >= PACK_LIMITS.perMin && box > 0 ? money((Math.round(box * 100) * n) / 100) : "";
  };
  const derivedSub = unitsPerBox > 0 && boxPurchase > 0 ? money(Math.round((Math.round(boxPurchase * 100)) / unitsPerBox) / 100) : "";

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3" data-pkgeditor>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Boxes size={16} className="text-brand-600" /> {t("pkg.title")}
      </span>
      <p className="mt-1 text-2xs text-ink-subtle">{t("pkg.hint")}</p>

      <div className="mt-3 space-y-3">
        <div>
          <label className="label" htmlFor="pkg-unit-name">{t("pkg.unitName")}</label>
          <input id="pkg-unit-name" className="input" value={d.unit_name} disabled={disabled} maxLength={PACK_LIMITS.unitName + 5}
            onChange={(e) => set({ unit_name: e.target.value })} placeholder={t("pkg.level.box")} data-pkgunit />
        </div>

        {(subOn || d.sub_codes.length > 0) && (
          <div className="space-y-2 rounded-lg border border-line bg-surface-1 p-2.5" data-pkgsub>
            <p className="text-xs font-bold text-ink-muted">{t("pkg.subTitle", { sub, n: unitsPerBox || "?", unit })}</p>
            {!subOn && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300" data-pkgsuboff>{t("pkg.err.sub_no_unit")}</p>}
            <div>
              <label className="label">{t("pkg.subCodes", { sub })}</label>
              <CodesInput codes={d.sub_codes} onChange={(c) => set({ sub_codes: c })} level="sub" products={products} selfId={selfId} disabled={disabled} testId="sub" />
            </div>
            {subOn && (
              <div>
                <label className="label" htmlFor="pkg-sub-buy">{t("pkg.subPurchase", { sub })}</label>
                <input id="pkg-sub-buy" type="number" inputMode="decimal" min="0" className="input" value={d.sub_purchase_price} disabled={disabled}
                  onChange={(e) => set({ sub_purchase_price: e.target.value })}
                  placeholder={derivedSub ? t("pkg.derivedPh", { v: derivedSub }) : "0"} data-pkgsubbuy />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2" data-pkgpacks>
          <p className="text-xs font-bold text-ink-muted">{t("pkg.packsTitle", { unit })}</p>
          {blocked && d.packs.length === 0 && <p className="text-2xs text-ink-subtle" data-pkgblocked>{t(byWeight ? "pkg.weightOff" : "pkg.pooledOff")}</p>}
          {blocked && d.packs.length > 0 && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300" data-pkgblocked>{t("pkg.err.packs_unit")}</p>}
          {d.packs.map((k, i) => (
            <div key={k.id} className="space-y-2 rounded-lg border border-line bg-surface-1 p-2.5" data-pkgpack={i}>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">{t("pkg.packName")}</label>
                    <input className="input" value={k.name} disabled={disabled} maxLength={PACK_LIMITS.name + 5} data-pkgname={i}
                      onChange={(e) => setPack(i, { name: e.target.value })} placeholder={t("pkg.level.pack")} />
                  </div>
                  <div>
                    <label className="label">{t("pkg.per", { unit })}</label>
                    <input type="number" inputMode="numeric" min={PACK_LIMITS.perMin} step="1" className="input" value={k.per} disabled={disabled} data-pkgper={i}
                      onChange={(e) => setPack(i, { per: e.target.value })} placeholder="12" />
                  </div>
                </div>
                <button type="button" disabled={disabled} data-pkgrm={i}
                  className="grid h-10 w-10 place-items-center rounded-xl text-ink-subtle transition hover:bg-danger-100 hover:text-danger-600 disabled:opacity-50 dark:hover:bg-danger-500/20"
                  title={t("pkg.removePack")} aria-label={t("pkg.removePack")}
                  onClick={() => { playTap(); set({ packs: d.packs.filter((_, j) => j !== i) }); }}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div>
                <label className="label">{t("pkg.packCodes", { name: k.name.trim() || t("pkg.level.pack") })}</label>
                <CodesInput codes={k.codes} onChange={(c) => setPack(i, { codes: c })} level="pack" products={products} selfId={selfId} disabled={disabled} testId={`pack${i}`} />
              </div>
              {/* عمودٌ واحد على الهاتف: «محسوب: ١٢٠٬٠٠٠ د.ع» لا يتّسع بنصف عرضه فيُقصّ رقمُه. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="label">{t("pkg.packPurchase")}</label>
                  <input type="number" inputMode="decimal" min="0" className="input" value={k.purchase_price} disabled={disabled} data-pkgbuy={i}
                    onChange={(e) => setPack(i, { purchase_price: e.target.value })}
                    placeholder={derivedPack(k.per, boxPurchase) ? t("pkg.derivedPh", { v: derivedPack(k.per, boxPurchase) }) : "0"} />
                </div>
                <div>
                  <label className="label">{t("pkg.packSell")}</label>
                  <input type="number" inputMode="decimal" min="0" className="input" value={k.sell_price} disabled={disabled} data-pkgsell={i}
                    onChange={(e) => setPack(i, { sell_price: e.target.value })}
                    placeholder={derivedPack(k.per, boxSell) ? t("pkg.derivedPh", { v: derivedPack(k.per, boxSell) }) : "0"} />
                </div>
              </div>
            </div>
          ))}
          {!blocked && d.packs.length < PACK_LIMITS.packs && (
            <button type="button" disabled={disabled} data-pkgadd
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
              onClick={() => { playTap(); set({ packs: [...d.packs, { id: newPackId(), name: "", per: "", codes: [], purchase_price: "", sell_price: "" }] }); }}>
              <Plus size={14} /> {t("pkg.addPack")}
            </button>
          )}
          {d.packs.length >= PACK_LIMITS.packs && <p className="text-2xs text-ink-subtle">{t("pkg.packsMax", { n: PACK_LIMITS.packs })}</p>}
        </div>
      </div>
    </div>
  );
}
