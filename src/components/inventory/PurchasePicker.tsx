/* ============================================================================
 * منتقي منتجات الشركة — «ما أريد أدكّ الباركودات واحداً واحداً».
 *
 * ── الطلبُ كما قيل ─────────────────────────────────────────────────────
 * بفاتورة الشراء: يختار الشركة، تنفتح قائمةُ منتجاتها المسجَّلة سابقاً، يؤشّر
 * ما وصله، فتنزل السطورُ كاملةً — باركوداً وأسعاراً وصنفاً — ولا يبقى عليه إلا
 * **عدد القطع**.
 *
 * ── وما قيس بالإنتاج قبل رسم شيء (١٦٦ فاتورة) ──────────────────────────
 *   • ٨٧٤ من ٨٧٧ سطراً (٩٩٫٧٪) مطابقٌ لمنتجٍ **قائم** — فالمنتقي ليس ميزةً
 *     جانبية، هو المسارُ الحقيقيّ لكلّ فاتورة تقريباً.
 *   • معدّلُ السطور ٥٫٣، وأكبرُ فاتورة ٣٥. فالسرعةُ تُقاس بعشرات لا بمئات.
 *   • أكبرُ شركةٍ ٢٩١ منتجاً — قائمةٌ مفلترةٌ تكفي، ولا حاجةَ لقائمةٍ افتراضية.
 *   • **٤٥٪ من المنتجات بلا شركة** (١٢٩٦ من ٢٨٦٩)، و١٠ فواتيرَ بشركتين، و٢٥
 *     فيها سطرٌ لمنتجٍ بلا شركة. ولذلك **لا يُقفل المنتقي على شركة الفاتورة**:
 *     نطاقُه يتبدّل، وفيه «كلّ المنتجات» و«بلا شركة». قائمةٌ تُخفي نصفَ المخزن
 *     تُقرأ «ماكو» — وهي أخطرُ من خطأٍ ظاهر (CLAUDE.md).
 *   • ولا منتجَ «مجمَّع» واحدٌ بالإنتاج — فتلك حالةٌ نظرية، تُعرَض ولا يُبنى لها.
 *   • ١١٫٨٪ فقط تُشترى أكثر من مرّة، والسعرُ يتغيّر بـ٨٫٨٪ منها — فـ«كرّر
 *     الطلبية» و«تنبيه تغيّر السعر» **لم يُبنيا**: قيمتُهما مقيسةٌ منخفضة.
 *   • وأعدادُ ما تحت حدّ التنبيه كبيرة (١٢٢ و٧٥ و٤١…) — فـ«الناقص» مرشّحٌ له سند.
 *
 * ── وقاعدتان من سجلّ أعطاب هذا المشروع ─────────────────────────────────
 *   ١) **البحثُ مطبَّعٌ بالطرفين** (`searchable`/`codeMatcher`)، وله طبقةُ نجدة
 *      (`codeRescue`) — بحثٌ حرفيٌّ هنا يقول «ماكو منتج» عن مادةٍ بالرفّ.
 *   ٢) **ولا يُخفى ما هو موجودٌ بالفاتورة**: يُعرض بعدده، فإعادةُ اختياره
 *      تُضيف بعلمِ صاحبها لا بصمت.
 * ==========================================================================*/
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Barcode, Building2, Check, FolderTree, Package, Search, Minus, Plus, TriangleAlert } from "lucide-react";
import type { Company, CompanySection, Product } from "@/types";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { cn, searchable, money, formatQty, formatNum, groupKey, normGroupName } from "@/lib/utils";
import { codeMatcher, codeRescue } from "@/lib/productCodes";
import { playTap } from "@/lib/sounds";

export interface PickedLine { product: Product; qty: number }

/** نطاقُ العرض: شركةُ الفاتورة، أو كلُّ المخزن، أو ما بلا شركة. */
type Scope = "company" | "all" | "none";

export function PurchasePicker({
  open, products, companies, sections, companyName, onClose, onPick, inInvoice,
}: {
  open: boolean;
  products: Product[];
  companies: Company[];
  sections: CompanySection[];
  /** اسمُ الشركة المكتوب بالفاتورة — قد يكون فارغاً أو لشركةٍ لم تُنشأ بعد. */
  companyName: string;
  onClose: () => void;
  onPick: (picks: PickedLine[]) => void;
  /** ما هو الآن بالفاتورة: معرّف المنتج ⇒ الكمية. */
  inInvoice: Map<string, number>;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("company");
  const [sectionId, setSectionId] = useState<string>("");
  const [lowOnly, setLowOnly] = useState(false);
  const [picked, setPicked] = useState<Map<string, number>>(new Map());

  /* شركةُ الفاتورة بالمعرّف — بالمقارنة المطبَّعة نفسِها التي يحفظ بها الخادم
     (`groupKey`)، فاختلافُ مسافةٍ أو «ة/ه» لا يجعلها شركةً أخرى. */
  const company = useMemo(() => {
    const clean = normGroupName(companyName);
    const key = groupKey(clean);
    if (!key) return null;
    /* **المطابقةُ بالنصّ أوّلاً ثمّ بالمفتاح.** بالمفتاح وحدَه يختار `find`
     * أوّلَ صفٍّ بالترتيب المعجميّ — فبشركتين اسمُهما واحدٌ بعد التطبيع (توائمُ
     * قديمة) ينفتح المنتقي على منتجات **الأخرى**. أمسكه فحصٌ يقود المتصفّح. */
    const raw = String(companyName ?? "").trim();
    return companies.find((c) => c.name.trim() === raw)
      ?? companies.find((c) => normGroupName(c.name) === clean)
      ?? companies.find((c) => groupKey(c.name) === key)
      ?? null;
  }, [companyName, companies]);

  const mySections = useMemo(
    () => (company ? sections.filter((s) => s.company_id === company.id) : []),
    [sections, company],
  );

  useEffect(() => {
    if (!open) return;
    setQ(""); setSectionId(""); setLowOnly(false); setPicked(new Map());
    setScope(company ? "company" : "all");
  }, [open, company]);

  const qt = q.trim();
  const ql = searchable(qt);

  const shown = useMemo(() => {
    const byCode = codeMatcher(qt);
    let list = products;
    if (scope === "company" && company) list = list.filter((p) => p.company_id === company.id);
    else if (scope === "none") list = list.filter((p) => !p.company_id);
    if (sectionId) list = list.filter((p) => p.section_id === sectionId);
    if (lowOnly) list = list.filter((p) => (p.min_stock ?? 0) > 0 && (p.stock ?? 0) <= (p.min_stock ?? 0));
    if (ql) {
      const found = list.filter((p) => searchable(p.name).includes(ql) || byCode(p));
      /* طبقةُ النجدة: ماسحٌ بصيغةٍ أخرى أو رمزٌ مقصوصٌ — بلا هذا يقول المنتقي
         «ماكو» عن مادةٍ موجودة، فيُدكّ الباركودُ يدوياً ويولد توأم. */
      list = found.length === 0 ? codeRescue(list, qt) : found;
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [products, scope, company, sectionId, lowOnly, ql, qt]);

  const sectionName = useMemo(() => {
    const m = new Map(sections.map((s) => [s.id, s.name]));
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [sections]);
  const companyNameOf = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);

  const toggle = (p: Product) => {
    playTap();
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      /* يبدأ بما هو الآن بالفاتورة — فالرقمُ الذي يراه هو الذي يصير، ولا
         يحسب بذهنه «٥ زائد كم». وبلا سطرٍ سابق يبدأ بواحدة. */
      else next.set(p.id, inInvoice.get(p.id) || 1);
      return next;
    });
  };
  const setQty = (id: string, n: number) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.set(id, Math.max(1, Math.round(n) || 1));
      return next;
    });
  };

  const pickedList = useMemo(
    () => [...picked.entries()].map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
      .filter((x): x is PickedLine => !!x.product),
    [picked, products],
  );
  const totalUnits = pickedList.reduce((s, x) => s + x.qty, 0);
  const totalCost = pickedList.reduce((s, x) => s + x.qty * (x.product.purchase_price ?? 0), 0);
  const missingCost = pickedList.filter((x) => !(x.product.purchase_price ?? 0)).length;

  const confirm = () => {
    if (!pickedList.length) return;
    onPick(pickedList);
    onClose();
  };

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={() => { playTap(); onClick(); }}
      className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
        on ? "bg-brand-500 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
      {children}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} size="full" title={t("purchase.pickTitle", "اختر من منتجات الشركة")}>
      <div className="flex h-[78vh] flex-col gap-3">
        <div className="shrink-0 space-y-3">
          <p className="text-sm text-ink-subtle">
            {t("purchase.pickHint", "أشّر الي وصلك وحدّد العدد — الباركود والأسعار والصنف تنزل وياه. تكدر تبدّل أي شي بعدين من السطر.")}
          </p>

          {/* النطاق: لا يُقفل على شركة الفاتورة — ٤٥٪ من المخزن بلا شركة. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {company && <Chip on={scope === "company"} onClick={() => { setScope("company"); setSectionId(""); }}>
              <Building2 size={12} className="inline align-[-2px]" /> {company.name}
            </Chip>}
            <Chip on={scope === "all"} onClick={() => { setScope("all"); setSectionId(""); }}>{t("purchase.pickAll", "كل المنتجات")}</Chip>
            <Chip on={scope === "none"} onClick={() => { setScope("none"); setSectionId(""); }}>{t("purchase.pickNoCompany", "بدون شركة")}</Chip>
            <span className="mx-1 h-4 w-px bg-line" />
            <Chip on={lowOnly} onClick={() => setLowOnly((v) => !v)}>
              <TriangleAlert size={12} className="inline align-[-2px]" /> {t("purchase.pickLow", "الناقص بس")}
            </Chip>
          </div>

          {scope === "company" && mySections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip on={!sectionId} onClick={() => setSectionId("")}>{t("purchase.pickAllSections", "كل الأصناف")}</Chip>
              {mySections.map((s) => (
                <Chip key={s.id} on={sectionId === s.id} onClick={() => setSectionId(s.id)}>
                  <FolderTree size={12} className="inline align-[-2px]" /> {s.name}
                </Chip>
              ))}
            </div>
          )}

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder={t("purchase.pickSearch", "دوّر بالاسم أو الباركود…")} />
          </div>

          <p className="text-xs font-semibold text-ink-subtle">
            {t("purchase.pickCount", "{{n}} منتج", { n: formatNum(shown.length) })}
            {picked.size > 0 && <span className="text-brand-600"> · {t("purchase.pickedCount", "{{n}} مؤشّر", { n: formatNum(picked.size) })}</span>}
          </p>
        </div>

        {shown.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-3xl bg-surface-2 text-center text-ink-subtle">
            <div className="space-y-2 p-8">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-1 text-ink-subtle"><Package size={22} /></span>
              <p>{ql ? t("purchase.pickNoMatch", "ماكو منتج بهذا الاسم أو الباركود بهذا النطاق.") : t("purchase.pickEmpty", "ماكو منتجات بهذا النطاق.")}</p>
              {scope === "company" && <p className="text-xs">{t("purchase.pickTryAll", "جرّب «كل المنتجات» — أكو منتجات ما إلها شركة.")}</p>}
            </div>
          </div>
        ) : (
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => {
                const on = picked.has(p.id);
                const qty = picked.get(p.id) ?? 1;
                const already = inInvoice.get(p.id) ?? 0;
                const low = (p.min_stock ?? 0) > 0 && (p.stock ?? 0) <= (p.min_stock ?? 0);
                const sec = sectionName(p.section_id);
                const co = scope !== "company" ? companyNameOf(p.company_id) : undefined;
                return (
                  <div key={p.id}
                    className={cn("rounded-2xl border p-2.5 transition",
                      on ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40"
                         : "border-line bg-surface-1 hover:border-brand-200")}>
                    <button type="button" onClick={() => toggle(p)} className="flex w-full items-start gap-2.5 text-start" data-pickrow={p.id}>
                      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition",
                        on ? "border-brand-500 bg-brand-500 text-white" : "border-line text-transparent")}>
                        <Check size={14} strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-subtle">
                          {p.barcode
                            ? <span className="flex items-center gap-1 font-mono"><Barcode size={10} /> {p.barcode}</span>
                            : <span className="italic">{t("purchase.pickNoBarcode", "بلا باركود")}</span>}
                          <span className={cn(low && "font-bold text-warn-700")}>
                            {t("purchase.pickStock", "رصيد {{n}}", { n: formatQty(p.stock ?? 0) })}
                          </span>
                          {(p.purchase_price ?? 0) > 0
                            ? <span>{t("purchase.pickCost", "شراء {{v}}", { v: money(p.purchase_price ?? 0) })}</span>
                            : <span className="italic text-warn-700">{t("purchase.pickNoCost", "بلا سعر شراء")}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sec && <span className="chip shrink-0 bg-surface-2 text-2xs"><FolderTree size={10} /> {sec}</span>}
                          {co && <span className="chip shrink-0 bg-accent-50 text-2xs text-accent-700 dark:bg-accent-500/15 dark:text-accent-200"><Building2 size={10} /> {co}</span>}
                          {already > 0 && (
                            <span className="chip shrink-0 bg-brand-50 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                              {t("purchase.pickAlready", "بالفاتورة الآن: {{n}}", { n: formatQty(already) })}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* العددُ يُكتب هنا — «بس هو يضيف عدد القطع»، بلا جولةٍ ثانية. */}
                    {on && (
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-brand-200/60 pt-2 dark:border-brand-500/30">
                        <span className="text-2xs font-bold text-ink-muted">{t("purchase.pickQty", "العدد")}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setQty(p.id, qty - 1)} disabled={qty <= 1}
                            aria-label={t("purchase.pickMinus", "أنقص")}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:text-ink disabled:opacity-40">
                            <Minus size={14} />
                          </button>
                          <input type="number" min={1} inputMode="numeric" value={qty} data-pickqty={p.id}
                            onChange={(e) => setQty(p.id, Number(e.target.value))}
                            onFocus={(e) => e.currentTarget.select()}
                            className="input h-8 w-16 px-2 text-center text-sm tabular-nums" />
                          <button type="button" onClick={() => setQty(p.id, qty + 1)}
                            aria-label={t("purchase.pickPlus", "زد")}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:text-ink">
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-line pt-3">
          {/* المجموعُ يُقال قبل الضغط — ولا يُخفى أنّ بعضَها بلا سعرِ شراء. */}
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>{t("purchase.pickSumUnits", "{{n}} قطعة", { n: formatQty(totalUnits) })}</span>
            <span className="font-bold text-ink">{t("purchase.pickSumCost", "تقدير الكلفة: {{v}}", { v: money(totalCost) })}</span>
            {missingCost > 0 && (
              <span className="font-semibold text-warn-700">
                {t("purchase.pickSumNoCost", "{{n}} منها بلا سعر شراء — اكتبه بالسطر", { n: formatNum(missingCost) })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t("common.cancel", "إلغاء")}</Button>
            <Button disabled={pickedList.length === 0} leftIcon={<Plus size={16} />} onClick={confirm} data-pickgo>
              {t("purchase.pickAdd", "أضف {{n}} للفاتورة", { n: formatNum(pickedList.length) })}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
