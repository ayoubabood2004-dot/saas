import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Package, Pill, Syringe, Tag } from "lucide-react";
import type { Product, Species } from "@/types";
import { MedicationForm, VaccinationForm, type MedicalDraft } from "@/components/MedicalEntry";
import type { PickedMed } from "@/lib/medIndex";
import { medLineDecision, medProductMatches } from "@/lib/medSale";
import { hydrateVaccines } from "@/lib/vaccines";
import { cn, currencySymbol, formatNum, money } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";
import { page } from "@/lib/lazyPage";
import { LoadBoundary } from "@/components/LoadBoundary";
import { vaxKey, vaxPriceFill, type VaxPriceRow } from "@/lib/vaccinePrices";
import { armRetry, browserRetryEnv } from "@/lib/retryWhileFailed";

/* سطرُ «السعر من أسعار التطعيمات» (0279): قطعةٌ كسولةٌ بنطاقها vxp، تُصنع بأوّل سعرٍ يتعبّى لا عند التحميل. */
const loadVaxHint = () => page(() => import("@/components/vaccines/VaccinePrices").then((m) => ({ default: m.VaxPriceHint })), ["vxp"]);
let VaxHintLazy: ReturnType<typeof loadVaxHint> | null = null;

/**
 * The retail "الأدوية" tab. Reuses the EXACT same medication/vaccination entry
 * forms as the patient's medical record, then adds a sale price + quantity. On
 * "أضف إلى السلة" it hands the medical draft up to the cart; on checkout SaleBuilder
 * bills it AND (when the sale is for a known patient) writes the same record into
 * the animal's file via persistMedicalEntries.
 *
 * دواءٌ بمخزن العيادة (جوابُ المالك ٢، ٩/١٠) لا يُباع سطرَ «دواء» بلا كلفة: يُباع **منتجاً**
 * بسعره ورصيده وكلفته — نفسُ مسار المسح — ويبقى قيدُه بسجلّ الحيوان. منتجٌ واحدٌ بالاسم ⇒
 * هو بلا سؤال؛ عدّةٌ ⇒ الكاشيرُ يختار؛ ولا شيء ⇒ سعرٌ يُكتب كما كان.
 */
export function MedSaleForm({ species, onAddLine, onAddProduct, products, listPrice, petId, petName }: {
  /** Patient species when the sale was launched from a record — locks the vaccine filter. */
  species?: Species;
  onAddLine: (draft: MedicalDraft, price: number, qty: number) => void;
  /** دواءٌ بالمخزن ⇒ سطرُ منتجٍ بالمسار العاديّ (الرصيد والكلفة) يحمل مسودّةَ السجلّ. */
  onAddProduct: (p: Product, draft: MedicalDraft, qty: number) => void;
  /** منتجاتُ العيادة كما تراها شاشةُ البيع — منها يُعرف إن كان الدواءُ بالمخزن. */
  products: Product[];
  /** سعرُ البيع كما يضعه المسح (مفرد/جملة). */
  listPrice: (p: Product) => number;
  /** الحيوان المربوط — يُظهر سجل لقاحاته داخل تبويب اللقاحات. */
  petId?: string | null;
  petName?: string | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState<"medication" | "vaccination">("medication");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [draftSpecies, setDraftSpecies] = useState<Species>(species ?? "dog");
  const [picked, setPicked] = useState<PickedMed | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);

  /* أسعارُ التطعيمات (0279): تُجلب بأوّل فتحٍ لتبويب التطعيم، والسعرُ **يتعبّى ويُغيَّر** (vaxPriceFill): ما كتبه الطبيبُ لا يُداس،
   * وسعرُ تطعيمٍ لا يبقى على غيره ولا على دواء. فشلُ الجلب يُقال سطراً («اكتب السعر بإيدك») — لا سعرٌ يُخترع. */
  const [vaxPrices, setVaxPrices] = useState<Map<string, VaxPriceRow> | null>(null);
  const [vaxPricesFailed, setVaxPricesFailed] = useState(false);
  const [pickedVax, setPickedVax] = useState("");
  const autoPriceRef = useRef<string | null>(null);
  const [, setHintTick] = useState(0);
  const [vaxTry, setVaxTry] = useState(0);
  const vaxFailsRef = useRef(0);
  useEffect(() => {
    if (mode !== "vaccination" || vaxPrices) return;
    let alive = true;
    setVaxPricesFailed(false);
    // جدولٌ غائب (واجهةٌ سبقت 0279) = لا أسعار، بحكم الباب نفسِه (vaxPricesMissing).
    import("@/lib/vaccinePricesApi").then((m) => m.listVaxPrices().catch((e: unknown) => { if (m.vaxPricesMissing(e)) return new Map<string, VaxPriceRow>(); throw e; }))
      .then((map) => { if (alive) { vaxFailsRef.current = 0; setVaxPrices(map); } })
      .catch(() => { if (alive) setVaxPricesFailed(true); });
    return () => { alive = false; };
  }, [mode, vaxPrices, vaxTry]);
  // والفشلُ يُعاد وحده (جلسةٌ تتجدّد، نتٌّ متأخّر) — لا يبقى التعبئةُ مطفأةً يوماً كاملاً بعد عطلٍ لحظيّ.
  useEffect(() => {
    if (!vaxPricesFailed || mode !== "vaccination") return;
    return armRetry(browserRetryEnv, vaxFailsRef.current++, () => setVaxTry((n) => n + 1));
  }, [vaxPricesFailed, mode]);
  /* القرارُ حين يتبدّل التطعيمُ أو تصل الأسعار أو يتبدّل التبويب — **لا بكلّ حرف**: طبيبٌ يمسح السعرَ ليكتب غيره لا يرجع له المعبّأ. */
  const priceNowRef = useRef(price);
  priceNowRef.current = price;
  useEffect(() => {
    const want = pickedVax && vaxPrices ? vaxPrices.get(vaxKey(pickedVax))?.price : undefined;
    const d = vaxPriceFill(priceNowRef.current, autoPriceRef.current, want, mode === "vaccination");
    if (!d) return;
    autoPriceRef.current = d.auto;
    setPrice(d.price);
  }, [pickedVax, vaxPrices, mode]);
  const autoFilled = mode === "vaccination" && autoPriceRef.current != null && price === autoPriceRef.current;
  const hintState: "auto" | "failed" | null = autoFilled ? "auto" : mode === "vaccination" && vaxPricesFailed && pickedVax ? "failed" : null;
  if (hintState && !VaxHintLazy) VaxHintLazy = loadVaxHint();

  // Re-pull the clinic vaccine catalog on open so Settings-added vaccines appear instantly.
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([hydrateVaccines()]).then(() => { if (alive) setCatalogVersion((v) => v + 1); });
    return () => { alive = false; };
  }, []);

  const activeSpecies = species ?? draftSpecies;
  /** الدواءُ المختار بالمخزن؟ — قبل الإضافة، فلا يُطلب سعرٌ لما له سعر. */
  const matches = useMemo(() => (mode === "medication" && picked ? medProductMatches(products, picked) : []), [mode, picked, products]);
  const decision = medLineDecision(matches, chosenId);
  const fromStock = matches.length > 0;

  /** `false` ⇒ رُفض والنموذجُ يبقى باختياره (لا يُعاد الاختيارُ من الصفر بسبب سعرٍ ناقص). */
  const handleAdd = (draft: MedicalDraft): boolean => {
    if (draft.kind === "medication") {
      const d = medLineDecision(medProductMatches(products, { name: draft.name, productId: draft.productId }), chosenId);
      if (d.kind === "choose") { playWarning(); toast.error(t("mymeds.posChoose", "بالمخزون أكثر من منتج بهالاسم — اختار واحد")); return false; }
      if (d.kind === "product") {
        onAddProduct(d.product, draft, Math.max(1, qty));
        setQty(1); setPicked(null); setChosenId(null);
        return true;
      }
    }
    const p = Number(price);
    if (Number.isNaN(p) || p <= 0) { playWarning(); toast.error(t("retail.enterSalePrice"), t("retail.enterSalePriceDesc")); return false; }
    onAddLine(draft, p, Math.max(1, qty));
    autoPriceRef.current = null;
    setPrice(""); setQty(1); setPicked(null); setChosenId(null);
    return true;
  };

  return (
    <div className="space-y-5" data-medsaleform>
      {/* Medication | Vaccination toggle — same control as the medical record */}
      <div className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
        {([
          { v: "medication", label: t("retail.medication"), icon: <Pill size={16} /> },
          { v: "vaccination", label: t("retail.vaccine"), icon: <Syringe size={16} /> },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => { playTap(); setMode(o.v); setPickedVax(""); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
              mode === o.v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.icon}{o.label}
          </button>
        ))}
      </div>

      {/* Sale price + quantity (applied to the item added below). دواءٌ بالمخزن يأخذ سعرَ منتجه. */}
      <div className="rounded-2xl border border-line bg-surface-1 p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <Tag size={14} className="text-brand-600" /> {t("retail.priceAndQty")}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {fromStock ? (
            <div className="flex min-h-10 items-center gap-1.5 rounded-xl bg-success-50 px-3 text-xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300" data-medsale-stock>
              <Package size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {decision.kind === "product"
                  ? t("mymeds.posProduct", { name: decision.product.name, price: money(listPrice(decision.product)), n: formatNum(decision.product.stock), defaultValue: "من المخزون: {{name}} · {{price}} · الرصيد {{n}}" })
                  : t("mymeds.posChoose", "بالمخزون أكثر من منتج بهالاسم — اختار واحد")}
              </span>
            </div>
          ) : (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold text-ink-subtle ltr:left-3 rtl:right-3">{currencySymbol()}</span>
              <input
                type="number" min="0" step="1" inputMode="numeric"
                value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder={t("retail.unitPrice")} className="input ltr:pl-10 rtl:pr-10 tabular-nums" data-medsale-price
              />
            </div>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-1">
            <button onClick={() => { playTap(); setQty((q) => Math.max(1, q - 1)); }} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-3">−</button>
            <span className="w-7 text-center text-sm font-bold tabular-nums text-ink">{qty}</span>
            <button onClick={() => { playTap(); setQty((q) => q + 1); }} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-3">+</button>
          </div>
        </div>
        {/* عدّةُ منتجاتٍ بنفس الاسم: الكاشيرُ يختار — لا اختيارَ صامت. */}
        {matches.length > 1 && (
          <div className="mt-2 grid gap-1.5" role="radiogroup" data-medsale-choose>
            {matches.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={chosenId === p.id} onClick={() => { playTap(); setChosenId(p.id); }} data-medsale-choice={p.id}
                className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start text-xs font-bold transition",
                  chosenId === p.id ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200" : "border-line bg-surface-2 text-ink")}>
                <span className="min-w-0 flex-1 truncate">{p.name}{p.barcode ? ` · ${p.barcode}` : ""}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{money(listPrice(p))} · {formatNum(p.stock)}</span>
              </button>
            ))}
          </div>
        )}
        {hintState && VaxHintLazy && (
          <LoadBoundary scope="vxp-hint" onRetry={() => { VaxHintLazy = loadVaxHint(); setHintTick((n) => n + 1); }}>
            <Suspense fallback={null}><VaxHintLazy state={hintState} /></Suspense>
          </LoadBoundary>
        )}
        {fromStock && <p className="mt-1.5 text-2xs font-bold text-ink-subtle">{t("mymeds.posAsProduct", "يُباع كمنتج — ينقص من الرصيد، والعلاج ينكتب بسجلّ الحيوان")}</p>}
      </div>

      {/* The reused medical-record entry form (keyed swap for a smooth transition) */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, x: mode === "medication" ? -10 : 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {mode === "medication"
          ? <MedicationForm onAdd={handleAdd} version={catalogVersion} addLabel={t("retail.addToCart")} species={activeSpecies}
              freeText="oneOff" stock="show" onPickMed={(m) => { setPicked(m); setChosenId(null); }} />
          : <VaccinationForm species={activeSpecies} hasSpeciesProp={!!species} draftSpecies={draftSpecies} setDraftSpecies={setDraftSpecies} onAdd={handleAdd} version={catalogVersion} addLabel={t("retail.addToCart")} petId={petId} petName={petName} onVaccineChange={setPickedVax} />}
      </motion.div>
    </div>
  );
}
