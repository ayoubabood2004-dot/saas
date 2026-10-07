import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, History, Info, Layers, Lock, Plus, Printer,
  RotateCcw, Search, TrendingUp, Undo2, X,
} from "lucide-react";
import type { Company, CompanySection, PriceChange, PriceChangeDetail, PriceChangeSummary, PriceDetailLine, Product, ServiceCatalog } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { describeDbError, withTimeout } from "@/lib/errors";
import { cn, currencySymbol, formatDate, formatDec, formatNum, searchable, uuid } from "@/lib/utils";
import { playSuccess, playWarning } from "@/lib/sounds";
import { getActiveCurrency } from "@/lib/currency";
import { getServiceCatalog, refreshServices } from "@/lib/services";
import { getPromoRules } from "@/lib/promotions";
import { getQtyPromos } from "@/lib/settings";
import { afterPriceChange } from "@/lib/priceSync";
import {
  bpText, effectivePct, fixedChoices, isFracCurrency, normalizeSpec, parsePct, raisePrice, smartMax,
  type PlanLine, type PricePreview, type PriceSpec,
} from "@/lib/priceRaise";

/* ============================================================================
 * رفعُ الأسعار بنسبة (0226) — طلبُ المالك: «ترفع كل الأسعار بنسبة ٢٥٪ أو ٥٠٪،
 * منتجات بس أو خدمات أو الاثنين أو منتجات معيّنة وتستثني منتجات … ومابي اغلاط
 * بالارقام وما يكون شي عشوائي … ويصير من تاريخ اليوم … ونكدر نرجّع السعر الأصلي».
 *
 * • الحسابُ كلُّه بالقاعدة (والتجريبيُّ بنفس priceRaise.ts — مفحوصان فلساً بفلس):
 *   الشاشةُ تعرض ما قالته المعاينة، وتحفظ ببصمتها. سعرٌ تغيّر بينهما ⇒ «المعاينة قديمة».
 * • النطاقُ اختيارٌ **واحد** (الكلّ / أصناف / شركات / موادّ معيّنة) + استثناء.
 *   المجموعةُ (منتجاتٌ بسعرٍ واحد) تدخل كاملةً وتخرج كاملة — وتُرى صفّاً واحداً.
 * • الإرجاعُ من «السجلّ»: سطراً سطراً بالمقارنة — ما عُدِّل بيدٍ بعد الرفع لا يُداس
 *   (وله «رجّعه للأصل» صريح)، ورفعٌ لاحقٌ قائمٌ يحجز سطرَه حتى يُرجَع أوّلاً.
 * • للمدير وحده، ولا تُفتح على جهازٍ مقفول (لا استثناءَ «تعديل المخزن» هنا).
 * ========================================================================= */

/** السعرُ كما هو بالقاعدة: كسرٌ قديم (1,562.5) يُعرض بكسره. `money` يقرّب الدينارَ للعرض
 *  فيصير «4.5 → 6» «5 → 6 (+33٪)» — مقارنةٌ كاذبة بشاشةٍ وظيفتُها المقارنة. */
const exactMoney = (n: number) => `${formatDec(n)} ${currencySymbol()}`;

type PMode = "all" | "category" | "company" | "chosen";
type SMode = "all" | "category" | "chosen";
const CATS = ["medicine", "food", "accessories", "consumables", "other"] as const;
const PCT_CHIPS = [5, 10, 15, 20, 25, 50];
const PAGE = 60;

export function PriceRaise() {
  const { t } = useTranslation();
  const { role } = usePermissions();
  const { restricted } = useOverride();
  if (role !== "manager" || restricted) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center" data-praise-locked>
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("praise.noAccess", "رفع الأسعار للمدير وحده — وما يفتح على جهاز مقفول. ادخل برمز المدير.")}</p>
      </div>
    );
  }
  return <PriceRaiseBody />;
}

function PriceRaiseBody() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"new" | "history">("new");
  const [historyTick, setHistoryTick] = useState(0);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-praise>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowRight size={16} className="rtl:rotate-0 ltr:rotate-180" />
          {t("praise.back", "المخزن")}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <TrendingUp size={22} className="text-brand-600" />
          {t("praise.title", "رفع الأسعار بنسبة")}
        </h1>
        <div className="ms-auto flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["new", "history"] as const).map((k) => (
            <button key={k} type="button" data-praise-tab={k} onClick={() => setTab(k)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted")}>
              {k === "new" ? t("praise.tabNew", "رفع جديد") : t("praise.tabHistory", "السجل والإرجاع")}
            </button>
          ))}
        </div>
      </div>
      {/* النموذجُ يبقى مركّباً ومخفيّاً: فكُّه بزيارة السجلّ كان يعيده لـ«كلّ المنتجات ٢٥٪» —
          فضغطتان بعد العودة ترفعان كلَّ أسعار العيادة لا ما بُني (تدقيقٌ عدائيّ). */}
      <div className={tab === "new" ? undefined : "hidden"}>
        <NewRaise onDone={() => setHistoryTick((x) => x + 1)} onHistory={() => setTab("history")} />
      </div>
      {tab === "history" && <HistoryTab key={historyTick} />}
    </div>
  );
}

/* ── الرفعُ الجديد ─────────────────────────────────────────────────────────── */
function NewRaise({ onDone, onHistory }: { onDone: () => void; onHistory: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const cur = getActiveCurrency();
  const frac = isFracCurrency(cur);

  const [products, setProducts] = useState<Product[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sections, setSections] = useState<CompanySection[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [catalog, setCatalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  /* والخدماتُ تُقرأ من الخادم مع المواد (لا لقطةَ لحظة التركيب): بعد رفعٍ يشمل الخدمات كان
   * المنتقي يعرض أسعارَ ما قبله، وخدمةٌ أُضيفت من جهازٍ آخر لا تُختار. */
  const loadData = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [p, c, s, cat] = await withTimeout(Promise.all([repo.listProducts(clinicId), repo.listCompanies(clinicId),
        repo.listCompanySections(clinicId), refreshServices()]), 20000);
      setProducts(p.filter((x) => !x.farm_id)); setCompanies(c); setSections(s); setCatalog(cat);
    } catch { setLoadFailed(true); }
  }, [clinicId]);
  useEffect(() => { void loadData(); }, [loadData]);

  // ── النموذج ──
  const [doP, setDoP] = useState(true);
  const [doS, setDoS] = useState(false);
  const [pMode, setPMode] = useState<PMode>("all");
  const [pCats, setPCats] = useState<string[]>([]);
  const [pCos, setPCos] = useState<string[]>([]);
  const [pSecs, setPSecs] = useState<string[]>([]);
  const [pIds, setPIds] = useState<string[]>([]);
  const [pEx, setPEx] = useState<string[]>([]);
  const [sMode, setSMode] = useState<SMode>("all");
  const [sCats, setSCats] = useState<string[]>([]);
  const [sIds, setSIds] = useState<string[]>([]);
  const [sEx, setSEx] = useState<string[]>([]);
  const [pctText, setPctText] = useState("25");
  const [roundSel, setRoundSel] = useState<string>("smart");
  const [skipRecent, setSkipRecent] = useState(true);
  const [note, setNote] = useState("");
  const bp = parsePct(pctText);
  const fixedStep = roundSel.startsWith("fixed:") ? Number(roundSel.slice(6)) : null;
  const unit = frac ? 0.01 : 1;

  /** نطاقٌ ناقص لا يُعاين: «أصناف» بلا صنفٍ مختار كان سيعني «كلّ المنتجات» بصمت. */
  const incomplete: string | null =
    !doP && !doS ? t("praise.needWhat", "اختر المنتجات أو الخدمات أو الاثنين.")
      : doP && pMode === "category" && !pCats.length ? t("praise.needCat", "اختر صنفاً واحداً على الأقل.")
        : doP && pMode === "company" && !pCos.length && !pSecs.length ? t("praise.needCompany", "اختر شركة أو قسماً واحداً على الأقل.")
          : doP && pMode === "chosen" && !pIds.length ? t("praise.needItems", "أضف مادة واحدة على الأقل.")
            : doS && sMode === "category" && !sCats.length ? t("praise.needSvcCat", "اختر تصنيف خدمات واحداً على الأقل.")
              : doS && sMode === "chosen" && !sIds.length ? t("praise.needSvcItems", "أضف خدمة واحدة على الأقل.")
                : bp == null ? t("praise.badPct", "اكتب نسبة بين ٠٫٠١ و١٠٠ (منزلتين على الأكثر).") : null;

  const spec: PriceSpec | null = useMemo(() => (bp == null ? null : normalizeSpec({
    pct_bp: bp, round: fixedStep == null ? "smart" : "fixed", max_step: fixedStep ?? smartMax(cur),
    products: doP, services: doS,
    p_categories: pMode === "category" ? pCats : null,
    p_companies: pMode === "company" ? pCos : null, p_sections: pMode === "company" ? pSecs : null,
    p_ids: pMode === "chosen" ? pIds : null, p_exclude: pEx,
    s_categories: sMode === "category" ? sCats : null, s_ids: sMode === "chosen" ? sIds : null, s_exclude: sEx,
    skip_recent: skipRecent,
  })), [bp, fixedStep, cur, doP, doS, pMode, pCats, pCos, pSecs, pIds, pEx, sMode, sCats, sIds, sEx, skipRecent]);
  const specKey = spec && !incomplete ? JSON.stringify(spec) : "";

  // ── المعاينة (بالقاعدة، مؤجّلةً قليلاً بعد آخر تغيير) ──
  const [pv, setPv] = useState<{ key: string; data: PricePreview } | null>(null);
  const [pvState, setPvState] = useState<"idle" | "loading" | "error">("idle");
  const [pvErr, setPvErr] = useState("");
  const [retry, setRetry] = useState(0);
  const reqRef = useRef(0);
  useEffect(() => {
    if (!specKey) { setPvState("idle"); return; }
    const my = ++reqRef.current;
    setPvState("loading");
    const id = window.setTimeout(() => {
      withTimeout(repo.previewPriceChange(JSON.parse(specKey) as PriceSpec), 20000)
        .then((d) => { if (my !== reqRef.current) return; setPv({ key: specKey, data: d }); setPvState("idle"); })
        .catch((e) => { if (my !== reqRef.current) return; setPvState("error"); setPvErr(describeDbError(e, t)); });
    }, 350);
    return () => window.clearTimeout(id);
  }, [specKey, retry, t]);
  const fresh = !!pv && pv.key === specKey && pvState === "idle";
  /** ما يُطبَّق ويُؤكَّد: المعاينةُ الطازجة لهذا الاختيار وحدها. */
  const P = fresh ? pv!.data : null;
  /** ما يُعرض: آخرُ معاينةٍ باهتةً أثناء الحساب — كانت تُفكّ بكلّ تعديل فيضيع البحثُ والتصفية. */
  const shownPv = pv && pvState !== "error" ? pv.data : null;

  // معرّفاتٌ زالت (حُذفت أو طُويت) تسقط من القوائم وتُقال — لا خطأ يحبس الشاشة.
  useEffect(() => {
    const m = P?.missing;
    if (!m) return;
    const gone = [...m.p_ids, ...m.p_exclude, ...m.s_ids, ...m.s_exclude];
    if (!gone.length) return;
    const g = new Set(gone);
    setPIds((x) => x.filter((v) => !g.has(v))); setPEx((x) => x.filter((v) => !g.has(v)));
    setSIds((x) => x.filter((v) => !g.has(v))); setSEx((x) => x.filter((v) => !g.has(v)));
    toast.warn(t("praise.droppedMissing", { n: gone.length, defaultValue: "{{n}} مادة بالاختيار ما عادت موجودة (انحذفت أو انطوت) — شلناها من القائمة." }));
  }, [P, t, toast]);

  // ── الحفظ ──
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staleMsg, setStaleMsg] = useState<string | null>(null);
  const [done, setDone] = useState<PriceChangeSummary | null>(null);
  /** مرجعُ المحاولة: يثبت عبر إعادة النداء لنفس الخطّة (جوابٌ ضاع بالشبكة لا يرفع مرّتين). */
  const refRef = useRef<{ key: string; ref: string } | null>(null);
  const apply = async () => {
    if (!P || !pv || busy) return;
    if (!refRef.current || refRef.current.key !== pv.key + P.plan_hash) refRef.current = { key: pv.key + P.plan_hash, ref: `pr-${uuid()}` };
    setBusy(true);
    try {
      // بمهلة: طلبٌ عالق كان يحبس نافذةَ التأكيد بلا خروج. والمرجعُ يبقى — إعادةُ الضغط آمنة.
      const r = await withTimeout(repo.applyPriceChange(JSON.parse(pv.key) as PriceSpec, P.plan_hash, note.trim() || null, refRef.current.ref), 30000);
      refRef.current = null;
      await afterPriceChange(clinicId, r.event_seq);
      playSuccess();
      setConfirm(false); setDone(r); setStaleMsg(null); onDone();
    } catch (e) {
      playWarning();
      const msg = describeDbError(e, t);
      const code = (e as { message?: string })?.message;
      if (code === "stale_preview" || code === "empty_plan") {
        refRef.current = null; setConfirm(false); setStaleMsg(msg); setRetry((x) => x + 1);
      } else toast.error(msg);
    } finally { setBusy(false); }
  };

  const resetAll = () => {
    setDone(null); setNote(""); setStaleMsg(null); setPv(null); setRetry((x) => x + 1);
    void loadData();
  };

  if (done) return <DoneCard summary={done} onHistory={onHistory} onNew={resetAll} />;

  const examples = bp == null ? [] : (frac ? [1, 4.5, 12] : [1000, 1666, 5000]).map((o) => ({
    o, w: raisePrice(o, bp, fixedStep == null ? "smart" : "fixed", fixedStep ?? smartMax(cur), frac).price,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ── العمود الأوّل: ماذا وكم ── */}
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold text-ink">{t("praise.what", "شنو ترفع؟")}</h2>
          <div className="flex flex-wrap gap-2">
            <Toggle on={doP} onClick={() => setDoP((v) => !v)} data="products">{t("praise.products", "المنتجات")}</Toggle>
            <Toggle on={doS} onClick={() => setDoS((v) => !v)} data="services">{t("praise.services", "الخدمات")}</Toggle>
          </div>
          {doP && (
            <p className="text-2xs text-ink-subtle">{t("praise.subFollow", "سعر المفرد (الحبّة/الشريط) يرتفع ويا علبته دائماً — حتى ما يصير المفرد أرخص من العلبة.")}</p>
          )}
        </section>

        {doP && (
          <section className="card space-y-3 p-4" data-praise-pscope>
            <h2 className="text-sm font-bold text-ink">{t("praise.pScope", "أي منتجات؟")}</h2>
            <Segmented value={pMode} onChange={(v) => setPMode(v as PMode)} items={[
              ["all", t("praise.mAll", "كلها")], ["category", t("praise.mCat", "أصناف")],
              ["company", t("praise.mCompany", "شركات")], ["chosen", t("praise.mChosen", "مواد معيّنة")],
            ]} />
            {pMode === "category" && (
              <div className="flex flex-wrap gap-2">
                {CATS.map((c) => {
                  const n = (products ?? []).filter((p) => p.category === c).length;
                  if (!n) return null;
                  return (
                    <Toggle key={c} on={pCats.includes(c)} data={`cat-${c}`} onClick={() => setPCats((x) => (x.includes(c) ? x.filter((v) => v !== c) : [...x, c]))}>
                      {t(`pos.cat.${c}`, c)} <span className="tabular-nums opacity-70">{formatNum(n)}</span>
                    </Toggle>
                  );
                })}
              </div>
            )}
            {pMode === "company" && (
              <CompanyPicker companies={companies} sections={sections} products={products ?? []}
                cos={pCos} secs={pSecs} setCos={setPCos} setSecs={setPSecs} />
            )}
            {pMode === "chosen" && (
              <>
                <ItemPicker kind="product" products={products ?? []} services={[]} taken={new Set([...pIds, ...pEx])}
                  placeholder={t("praise.addItemPh", "دوّر على مادة وأضفها…")} onPick={(id) => setPIds((x) => [...x, id])} />
                <ChipList ids={pIds} products={products ?? []} services={[]} onRemove={(id) => setPIds((x) => x.filter((v) => v !== id))}
                  label={t("praise.chosenList", "المواد المختارة")} />
              </>
            )}
            <details className="rounded-xl bg-surface-2 p-3" open={pEx.length > 0}>
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                {t("praise.exclude", "استثناء مواد")} {pEx.length > 0 && <span className="tabular-nums">({formatNum(pEx.length)})</span>}
              </summary>
              <div className="mt-2 space-y-2">
                <ItemPicker kind="product" products={products ?? []} services={[]} taken={new Set([...pEx])}
                  placeholder={t("praise.excludePh", "دوّر على مادة تبقى بسعرها…")} onPick={(id) => setPEx((x) => [...x, id])} />
                <ChipList ids={pEx} products={products ?? []} services={[]} onRemove={(id) => setPEx((x) => x.filter((v) => v !== id))}
                  label={t("praise.excludedList", "تبقى بسعرها")} />
              </div>
            </details>
            {loadFailed && (
              <button type="button" onClick={() => void loadData()} className="text-xs font-semibold text-danger-600">
                {t("praise.listFailed", "ما انحمّلت قائمة المواد للاختيار — اضغط حتى نعيد.")}
              </button>
            )}
          </section>
        )}

        {doS && (
          <section className="card space-y-3 p-4" data-praise-sscope>
            <h2 className="text-sm font-bold text-ink">{t("praise.sScope", "أي خدمات؟")}</h2>
            <Segmented value={sMode} onChange={(v) => setSMode(v as SMode)} items={[
              ["all", t("praise.mAll", "كلها")], ["category", t("praise.mSvcCat", "تصنيفات")], ["chosen", t("praise.mSvcChosen", "خدمات معيّنة")],
            ]} />
            {sMode === "category" && (
              <div className="flex flex-wrap gap-2">
                {catalog.categories.map((c) => (
                  <Toggle key={c.id} on={sCats.includes(c.id)} onClick={() => setSCats((x) => (x.includes(c.id) ? x.filter((v) => v !== c.id) : [...x, c.id]))}>
                    {c.name} <span className="tabular-nums opacity-70">{formatNum(catalog.services.filter((s) => s.category_id === c.id).length)}</span>
                  </Toggle>
                ))}
              </div>
            )}
            {sMode === "chosen" && (
              <>
                <ItemPicker kind="service" products={[]} services={catalog.services} taken={new Set([...sIds, ...sEx])}
                  placeholder={t("praise.addSvcPh", "دوّر على خدمة وأضفها…")} onPick={(id) => setSIds((x) => [...x, id])} />
                <ChipList ids={sIds} products={[]} services={catalog.services} onRemove={(id) => setSIds((x) => x.filter((v) => v !== id))}
                  label={t("praise.chosenSvcList", "الخدمات المختارة")} />
              </>
            )}
            <details className="rounded-xl bg-surface-2 p-3" open={sEx.length > 0}>
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                {t("praise.excludeSvc", "استثناء خدمات")} {sEx.length > 0 && <span className="tabular-nums">({formatNum(sEx.length)})</span>}
              </summary>
              <div className="mt-2 space-y-2">
                <ItemPicker kind="service" products={[]} services={catalog.services} taken={new Set(sEx)}
                  placeholder={t("praise.excludeSvcPh", "دوّر على خدمة تبقى بسعرها…")} onPick={(id) => setSEx((x) => [...x, id])} />
                <ChipList ids={sEx} products={[]} services={catalog.services} onRemove={(id) => setSEx((x) => x.filter((v) => v !== id))}
                  label={t("praise.excludedList", "تبقى بسعرها")} />
              </div>
            </details>
          </section>
        )}

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold text-ink">{t("praise.howMuch", "بكم بالمية؟")}</h2>
          <div className="flex items-center gap-2">
            <div className="relative w-32">
              <input dir="ltr" inputMode="decimal" className={cn("input pe-8 text-lg font-bold tabular-nums", bp == null && "border-danger-500")}
                value={pctText} onChange={(e) => setPctText(e.target.value)} data-praise-pct />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle">%</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PCT_CHIPS.map((p) => (
                <button key={p} type="button" onClick={() => setPctText(String(p))}
                  className={cn("chip text-xs font-semibold", bp === p * 100 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink")}>
                  {formatNum(p)}%
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-ink">{t("praise.rounding", "التقريب (دائماً للأعلى)")}</span>
            <select className="input" value={roundSel} onChange={(e) => setRoundSel(e.target.value)} data-praise-round>
              <option value="smart">{t("praise.rSmart", { v: formatDec(smartMax(cur)), defaultValue: "ذكي — أقرب سعر مرتّب (حتى {{v}}) — مقترح" })}</option>
              {fixedChoices(cur).map((v) => (
                <option key={v} value={`fixed:${v}`}>
                  {v === unit ? t("praise.rNone", "بدون تقريب (لأقرب وحدة)") : t("praise.rFixed", { v: formatDec(v), defaultValue: "دائماً لأقرب {{v}}" })}
                </option>
              ))}
            </select>
            <span className="block text-2xs text-ink-subtle">
              {fixedStep == null
                ? t("praise.rSmartHelp", "كل سعر يرتفع بالنسبة بالضبط، ثم يتقرّب للأعلى لأقرب رقم مرتّب — والتقريب ما يضيف أكثر من ربع الزيادة. المواد الرخيصة تتقرّب بخطوة أصغر.")
                : t("praise.rFixedHelp", "كل سعر يتقرّب للأعلى لهذا الرقم حتى لو صار الرفع أكبر من النسبة — راجع العلامات بالمعاينة.")}
            </span>
          </label>
          {examples.length > 0 && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink" data-praise-examples>
              <span className="font-semibold">{t("praise.example", "مثال:")}</span>{" "}
              {examples.map((x, i) => (
                <span key={x.o} className="tabular-nums">{i > 0 ? " · " : ""}{exactMoney(x.o)} ← {exactMoney(x.w)}</span>
              ))}
            </p>
          )}
        </section>
      </div>

      {/* ── العمود الثاني: المعاينة ── */}
      <div className="space-y-3">
        {staleMsg && (
          <div className="flex items-start gap-2 rounded-xl bg-warn-50 p-3 text-sm text-warn-800 dark:bg-warn-500/10 dark:text-warn-200" data-praise-stale>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{staleMsg}</span>
          </div>
        )}
        {incomplete ? (
          <div className="card p-6 text-center text-sm text-ink-muted" data-praise-incomplete>{incomplete}</div>
        ) : pvState === "error" && !fresh ? (
          <div className="card space-y-3 p-6 text-center">
            <p className="text-sm text-danger-600">{pvErr || t("praise.previewFailed", "تعذّرت المعاينة")}</p>
            <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={14} />} onClick={() => setRetry((x) => x + 1)}>{t("praise.retry", "أعد المحاولة")}</Button>
          </div>
        ) : !shownPv ? (
          <div className="card space-y-2 p-4"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
        ) : (
          <Preview P={shownPv} products={products ?? []} skipRecent={skipRecent} setSkipRecent={setSkipRecent}
            onExclude={(l) => (l.k === "service" ? setSEx((x) => [...new Set([...x, l.id])]) : setPEx((x) => [...new Set([...x, l.id])]))}
            onApply={() => { if (fresh) setConfirm(true); }} loading={!fresh} />
        )}
      </div>

      <Modal open={confirm && !!P} onClose={() => !busy && setConfirm(false)} title={t("praise.confirmTitle", "تأكيد رفع الأسعار")}>
        {P && (
          <div className="space-y-3 text-sm" data-praise-confirm>
            <p className="font-semibold text-ink">
              {t("praise.confirmLine", { p: formatNum(P.counts.products), s: formatNum(P.counts.services), pct: bpText(P.pct_bp), defaultValue: "راح يرتفع سعر {{p}} منتج و{{s}} خدمة بنسبة {{pct}}٪ — من هسه." })}
            </p>
            <ul className="space-y-1.5 text-ink-muted">
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success-600" />{t("praise.cInvoices", "الفواتير القديمة ما تتغيّر — كل فاتورة محفوظة بسعرها.")}</li>
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success-600" />{t("praise.cDevices", "الأجهزة الثانية تاخذ الأسعار الجديدة خلال دقيقة، والكاشير يتأكد قبل كل بيعة.")}</li>
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success-600" />{t("praise.cUndo", "تكدر ترجّعها لسعرها الأصلي من «السجل والإرجاع».")}</li>
            </ul>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-ink">{t("praise.note", "ملاحظة (اختيارية)")}</span>
              <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={t("praise.notePh", "مثلاً: رفع أسعار الموردين")} />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button className="flex-1" loading={busy} onClick={() => void apply()} data-praise-apply>
                {t("praise.confirmBtn", "نعم، ارفع الأسعار")}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>{t("praise.cancel", "رجوع")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── المعاينة ─────────────────────────────────────────────────────────────── */
interface Row {
  key: string; k: "product" | "service"; ids: string[]; names: string[];
  sell: PlanLine | null; sub: PlanLine | null;
}
function rowsOf(lines: PlanLine[]): Row[] {
  const byId = new Map<string, Row>();
  for (const l of lines) {
    const r = byId.get(l.id) ?? { key: l.id, k: l.k, ids: [l.id], names: [l.n], sell: null, sub: null };
    if (l.f === "sub_unit_price") r.sub = l; else r.sell = l;
    byId.set(l.id, r);
  }
  // مجموعةٌ بسعرٍ واحد = صفٌّ واحد (يُطوى إن تساوت أسعارُها فعلاً — وإلا تُعرض أعضاءً).
  const out: Row[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of byId.values()) {
    const g = (r.sell ?? r.sub)?.g;
    if (r.k === "product" && g) groups.set(g, [...(groups.get(g) ?? []), r]); else out.push(r);
  }
  for (const [g, rs] of groups) {
    const same = rs.every((r) => r.sell?.o === rs[0].sell?.o && r.sell?.w === rs[0].sell?.w && r.sub?.o === rs[0].sub?.o && r.sub?.w === rs[0].sub?.w);
    // والصفُّ المطويّ يحمل علاماتِ أعضائه كلِّها: عضوٌ تحت الكلفة لا يختفي خلف أوّلهم.
    const merge = (pick: (r: Row) => PlanLine | null): PlanLine | null => {
      const first = pick(rs[0]);
      return first ? { ...first, fl: [...new Set(rs.flatMap((r) => pick(r)?.fl ?? []))] } : null;
    };
    if (rs.length > 1 && same) out.push({ ...rs[0], key: `g:${g}`, ids: rs.map((r) => r.ids[0]), names: rs.map((r) => r.names[0]), sell: merge((r) => r.sell), sub: merge((r) => r.sub) });
    else out.push(...rs);
  }
  return out.sort((a, b) => a.names[0].localeCompare(b.names[0], "ar"));
}

function Preview({ P, products, skipRecent, setSkipRecent, onExclude, onApply, loading }: {
  P: PricePreview; products: Product[]; skipRecent: boolean; setSkipRecent: (v: boolean) => void;
  onExclude: (l: PlanLine) => void; onApply: () => void; loading: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "flag">("all");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => rowsOf(P.lines), [P]);
  const main = P.lines.filter((l) => l.f !== "sub_unit_price");
  const effs = main.map((l) => effectivePct(l.o, l.w));
  const avg = effs.length ? Math.round((effs.reduce((s, x) => s + x, 0) / effs.length) * 10) / 10 : 0;
  const min = effs.length ? Math.min(...effs) : 0, max = effs.length ? Math.max(...effs) : 0;
  const cnt = (f: string) => P.lines.filter((l) => l.fl.includes(f as never)).length;
  const promos = useMemo(() => affectedPromos(P.lines, products), [P, products]);
  const flagged = (r: Row) => [r.sell, r.sub].some((l) => l && l.fl.some((f) => f !== "group"));
  const needle = searchable(q);
  const list = rows.filter((r) => (only === "all" || flagged(r)) && (!needle || r.names.some((n) => searchable(n).includes(needle))));
  const recentFlagged = cnt("recent");

  return (
    <div className={cn("space-y-3", loading && "opacity-60")} data-praise-preview data-lines={P.counts.lines}>
      <section className="card space-y-2 p-4">
        <p className="text-base font-bold text-ink" data-praise-summary>
          {P.counts.lines === 0
            ? t("praise.nothing", "ماكو سعر يرتفع بهذا الاختيار.")
            : t("praise.summary", { p: formatNum(P.counts.products), s: formatNum(P.counts.services), defaultValue: "راح يتغيّر سعر {{p}} منتج و{{s}} خدمة" })}
          {P.counts.sub_units > 0 && <span className="text-sm font-medium text-ink-muted"> {t("praise.summarySub", { n: formatNum(P.counts.sub_units), defaultValue: "(ويا {{n}} سعر مفرد)" })}</span>}
        </p>
        {P.counts.via_group > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Layers size={13} />
            {t("praise.viaGroup", { d: formatNum(P.counts.products - P.counts.via_group), g: formatNum(P.counts.via_group), defaultValue: "اخترتها {{d}} + جاءت ويا مجموعاتها {{g}} (مواد بسعر واحد ترتفع سوية)" })}
          </p>
        )}
        {main.length > 0 && (
          <p className="text-xs text-ink-muted tabular-nums">
            {t("praise.effective", { avg, min, max, defaultValue: "الرفع الفعلي بعد التقريب: متوسط {{avg}}٪ (من {{min}}٪ إلى {{max}}٪)" })}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-ink-subtle"><Info size={13} />{t("praise.pastSafe", "الفواتير والتقارير القديمة ما تتأثر — كل فاتورة محفوظة بسعرها يوم انباعت.")}</p>
      </section>

      <section className="space-y-2" data-praise-warnings>
        {P.counts.recent_skipped > 0 && (
          <Warn tone="warn">
            <span>{t("praise.wRecent", { n: formatNum(P.counts.recent_skipped), defaultValue: "{{n}} سعر ما راح يرتفع: مادته (أو مجموعتها) انرفعت خلال آخر ٣٠ يوم." })}</span>
            <label className="mt-1 flex items-center gap-1.5 font-semibold">
              <input type="checkbox" checked={!skipRecent} onChange={(e) => setSkipRecent(!e.target.checked)} data-praise-onTop />
              {t("praise.wRecentOnTop", "ارفعها فوق الرفع السابق (يعني رفع على رفع)")}
            </label>
          </Warn>
        )}
        {!skipRecent && recentFlagged > 0 && (
          <Warn tone="danger">
            {t("praise.wOnTop", { n: formatNum(recentFlagged), defaultValue: "{{n}} سعر راح يرتفع فوق رفع صار خلال آخر ٣٠ يوم — تأكد إنه مقصود." })}
            <button type="button" className="ms-2 underline" onClick={() => setSkipRecent(true)}>{t("praise.wOnTopUndo", "لا، اتركها")}</button>
          </Warn>
        )}
        {P.skipped.zero_products + P.skipped.zero_services > 0 && (
          <Warn tone="info">{t("praise.wZero", { n: formatNum(P.skipped.zero_products + P.skipped.zero_services), defaultValue: "{{n}} مادة سعرها صفر — النسبة من الصفر صفر، فتبقى مثل ما هي." })}</Warn>
        )}
        {cnt("below_cost") > 0 && <Warn tone="warn">{t("praise.wBelowCost", { n: formatNum(cnt("below_cost")), defaultValue: "{{n}} سعر يبقى أقل من سعر الشراء حتى بعد الرفع." })}</Warn>}
        {cnt("jump") > 0 && <Warn tone="warn">{t("praise.wJump", { n: formatNum(cnt("jump")), defaultValue: "{{n}} سعر صغير جداً ارتفع أكثر من مرة ونص النسبة (أصغر وحدة بالعملة)." })}</Warn>}
        {cnt("sub_aligned") > 0 && <Warn tone="info">{t("praise.wSubAligned", { n: formatNum(cnt("sub_aligned")), defaultValue: "{{n}} سعر مفرد انرفع شوية زيادة حتى ما يصير مجموع الحبّات أرخص من العلبة." })}</Warn>}
        {promos.map((p) => (
          <Warn key={p.key} tone="warn">
            {t("praise.wPromo", { name: p.name, a: exactMoney(p.before), b: exactMoney(p.after), defaultValue: "عرض «{{name}}» بسعر ثابت: الخصم لكل مجموعة كان {{a}} وراح يصير {{b}} — عدّله من الإعدادات إذا تريد." })}
          </Warn>
        ))}
      </section>

      {P.lines.length > 0 && (
        <section className="card p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative min-w-[10rem] flex-1">
              <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input className="input h-9 ps-8 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
                placeholder={t("praise.searchPh", "دوّر بالقائمة…")} data-praise-search />
            </div>
            <Segmented value={only} onChange={(v) => { setOnly(v as "all" | "flag"); setShown(PAGE); }} items={[
              ["all", t("praise.fAll", { n: formatNum(rows.length), defaultValue: "الكل ({{n}})" })],
              ["flag", t("praise.fFlag", { n: formatNum(rows.filter(flagged).length), defaultValue: "فيها ملاحظة ({{n}})" })],
            ]} />
          </div>
          <ul className="divide-y divide-line" data-praise-rows>
            {list.slice(0, shown).map((r) => {
              const l = r.sell ?? r.sub!;
              const isOpen = open.has(r.key);
              return (
                <li key={r.key} className="px-3 py-2" data-praise-row={r.ids[0]}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {r.names[0]}
                        {r.ids.length > 1 && (
                          <button type="button" className="ms-1.5 chip bg-surface-2 text-2xs font-semibold text-ink-muted"
                            onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>
                            <Layers size={11} /> {t("praise.groupOf", { n: formatNum(r.ids.length), defaultValue: "{{n}} مواد بسعر واحد" })}
                            {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                        {r.k === "service" && <span className="ms-1.5 chip bg-surface-2 text-2xs text-ink-muted">{t("praise.svcChip", "خدمة")}</span>}
                      </p>
                      <Flags l={r.sell} />
                    </div>
                    <PriceCell o={l.o} w={l.w} />
                    <button type="button" title={t("praise.excludeOne", "استثنِ (يبقى بسعره)")} onClick={() => onExclude(l)}
                      className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-danger-600" data-praise-ex={r.ids[0]}>
                      <X size={15} />
                    </button>
                  </div>
                  {r.sell && r.sub && (
                    <div className="mt-1 flex items-center gap-2 ps-3 text-xs text-ink-muted">
                      <span className="flex-1">{t("praise.subLine", "سعر المفرد")}<Flags l={r.sub} inline /></span>
                      <PriceCell o={r.sub.o} w={r.sub.w} small />
                      <span className="w-[27px]" />
                    </div>
                  )}
                  {isOpen && r.ids.length > 1 && (
                    <p className="mt-1 ps-3 text-2xs text-ink-subtle">{r.names.join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
          {list.length > shown && (
            <button type="button" className="w-full border-t border-line py-2 text-sm font-semibold text-brand-600" onClick={() => setShown((x) => x + PAGE * 3)}>
              {t("praise.more", { n: formatNum(list.length - shown), defaultValue: "عرض المزيد ({{n}} باقية)" })}
            </button>
          )}
          {list.length === 0 && <p className="p-4 text-center text-sm text-ink-muted">{t("praise.noMatch", "ماكو بالقائمة شي يطابق.")}</p>}
        </section>
      )}

      <div className="sticky bottom-3 z-10">
        <Button className="w-full shadow-lift" size="lg" disabled={P.lines.length === 0 || loading} onClick={onApply} data-praise-go>
          {t("praise.go", { n: formatNum(P.counts.lines), defaultValue: "طبّق الرفع على {{n}} سعر" })}
        </Button>
      </div>
    </div>
  );
}

function PriceCell({ o, w, small }: { o: number; w: number; small?: boolean }) {
  return (
    <div className={cn("shrink-0 text-end tabular-nums", small ? "text-xs" : "text-sm")}>
      <span className="text-ink-subtle line-through decoration-1">{exactMoney(o)}</span>{" "}
      <span className="font-bold text-ink">{exactMoney(w)}</span>{" "}
      <span className="text-2xs font-semibold text-success-600">+{effectivePct(o, w)}%</span>
    </div>
  );
}

function Flags({ l, inline }: { l: PlanLine | null; inline?: boolean }) {
  const { t } = useTranslation();
  if (!l) return null;
  const fl = l.fl.filter((f) => f !== "group");
  if (!fl.length) return null;
  const label: Record<string, string> = {
    jump: t("praise.flJump", "قفزة"), recent: t("praise.flRecent", "انرفع قريباً"),
    below_cost: t("praise.flBelowCost", "تحت الكلفة"), sub_aligned: t("praise.flSubAligned", "مسوّى ويا العلبة"),
  };
  return (
    <span className={cn("flex flex-wrap gap-1", inline ? "ms-1.5 inline-flex" : "mt-0.5")}>
      {fl.map((f) => <span key={f} className="chip bg-warn-50 text-2xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">{label[f] ?? f}</span>)}
    </span>
  );
}

function Warn({ tone, children }: { tone: "warn" | "danger" | "info"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl p-2.5 text-xs",
      tone === "danger" ? "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
        : tone === "warn" ? "bg-warn-50 text-warn-800 dark:bg-warn-500/10 dark:text-warn-200"
          : "bg-surface-2 text-ink-muted")}>
      {tone === "info" ? <Info size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** عروضٌ بسعر مجموعةٍ ثابت تمسّها هذه الأسعار: الخصمُ يكبر مع الرفع (السعرُ يرتفع والمجموعةُ لا). */
function affectedPromos(lines: PlanLine[], products: Product[]): { key: string; name: string; before: number; after: number }[] {
  const out: { key: string; name: string; before: number; after: number }[] = [];
  const sell = lines.filter((l) => l.f === "sell_price" || l.k === "service");
  const sub = new Map(products.map((p) => [p.id, (p.subcategory ?? "").trim().toLowerCase()]));
  const top = (ls: PlanLine[]) => ls.reduce<PlanLine | null>((m, l) => (!m || l.o > m.o ? l : m), null);
  try {
    for (const r of getPromoRules()) {
      if (!r.active || r.qty < 1) continue;
      const key = r.subcategory.trim().toLowerCase();
      const hit = top(sell.filter((l) => l.k === "product" && sub.get(l.id) === key));
      if (hit) out.push({ key: `m:${r.id}`, name: r.name, before: Math.max(0, r.qty * hit.o - r.bundlePrice), after: Math.max(0, r.qty * hit.w - r.bundlePrice) });
    }
    for (const r of getQtyPromos()) {
      if (!r.active || r.mode !== "bundle" || r.qty < 1) continue;
      const ids = new Set(r.ids);
      const hit = top(sell.filter((l) => l.k === r.kind && (ids.size === 0 || ids.has(l.id))));
      if (hit) out.push({ key: `q:${r.id}`, name: r.name || "—", before: Math.max(0, r.qty * hit.o - r.bundlePrice), after: Math.max(0, r.qty * hit.w - r.bundlePrice) });
    }
  } catch { /* عرضٌ مكسورٌ بالإعدادات لا يوقف المعاينة */ }
  return out;
}

/* ── أدواتُ الاختيار ─────────────────────────────────────────────────────── */
function Toggle({ on, onClick, children, data }: { on: boolean; onClick: () => void; children: React.ReactNode; data?: string }) {
  return (
    <button type="button" onClick={onClick} data-praise-toggle={data} aria-pressed={on}
      className={cn("chip gap-1 px-3 py-1.5 text-sm font-semibold", on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink")}>
      {children}
    </button>
  );
}

function Segmented({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {items.map(([v, label]) => (
        <button key={v} type="button" data-seg={v} onClick={() => onChange(v)}
          className={cn("rounded-lg px-3 py-1 text-xs font-semibold", value === v ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ItemPicker({ kind, products, services, taken, placeholder, onPick }: {
  kind: "product" | "service"; products: Product[]; services: { id: string; name: string; price: number }[];
  taken: Set<string>; placeholder: string; onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const needle = searchable(q);
  const groupSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.bulk_group?.trim()) m.set(p.bulk_group, (m.get(p.bulk_group) ?? 0) + 1);
    return m;
  }, [products]);
  const pool = kind === "product"
    ? products.map((p) => ({ id: p.id, name: p.name, price: p.sell_price, extra: p.bulk_group?.trim() ? (groupSize.get(p.bulk_group) ?? 1) - 1 : 0 }))
    : services.map((s) => ({ id: s.id, name: s.name, price: s.price, extra: 0 }));
  const hits = needle ? pool.filter((x) => !taken.has(x.id) && searchable(x.name).includes(needle)).slice(0, 12) : [];
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input className="input h-9 ps-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} data-praise-picker={kind} />
      </div>
      {hits.length > 0 && (
        <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface-1">
          {hits.map((x) => (
            <li key={x.id}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-surface-2"
                onClick={() => { onPick(x.id); setQ(""); }} data-praise-pick={x.id}>
                <Plus size={14} className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                {x.extra > 0 && <span className="chip bg-surface-2 text-2xs text-ink-muted">{t("praise.withGroup", { n: formatNum(x.extra), defaultValue: "+{{n}} بنفس السعر" })}</span>}
                <span className="tabular-nums text-xs text-ink-muted">{exactMoney(x.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipList({ ids, products, services, onRemove, label }: {
  ids: string[]; products: Product[]; services: { id: string; name: string }[]; onRemove: (id: string) => void; label: string;
}) {
  const { t } = useTranslation();
  if (!ids.length) return null;
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? services.find((s) => s.id === id)?.name ?? t("praise.unknownItem", "مادة");
  return (
    <div className="space-y-1">
      <p className="text-2xs font-semibold text-ink-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <span key={id} className="chip gap-1 bg-surface-2 text-xs text-ink">
            {nameOf(id)}
            <button type="button" onClick={() => onRemove(id)} className="text-ink-subtle hover:text-danger-600" aria-label={t("praise.remove", "شيل")}><X size={12} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function CompanyPicker({ companies, sections, products, cos, secs, setCos, setSecs }: {
  companies: Company[]; sections: CompanySection[]; products: Product[];
  cos: string[]; secs: string[]; setCos: (f: (x: string[]) => string[]) => void; setSecs: (f: (x: string[]) => string[]) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) { if (p.company_id) m.set(p.company_id, (m.get(p.company_id) ?? 0) + 1); if (p.section_id) m.set(p.section_id, (m.get(p.section_id) ?? 0) + 1); }
    return m;
  }, [products]);
  const needle = searchable(q);
  const list = companies.filter((c) => (count.get(c.id) ?? 0) > 0 && (!needle || searchable(c.name).includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const toggle = (set: (f: (x: string[]) => string[]) => void, id: string) => set((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  return (
    <div className="space-y-1.5" data-praise-companies>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input className="input h-9 ps-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("praise.companyPh", "دوّر على شركة…")} />
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {list.map((c) => {
          const secList = sections.filter((s) => s.company_id === c.id && (count.get(s.id) ?? 0) > 0);
          return (
            <li key={c.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cos.includes(c.id)} onChange={() => toggle(setCos, c.id)} data-praise-company={c.id} />
                <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                <span className="tabular-nums text-xs text-ink-subtle">{formatNum(count.get(c.id) ?? 0)}</span>
                {secList.length > 0 && !cos.includes(c.id) && (
                  <button type="button" className="text-ink-subtle" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {open === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>
              {open === c.id && !cos.includes(c.id) && (
                <div className="mt-1 flex flex-wrap gap-1.5 ps-6">
                  {secList.map((s) => (
                    <label key={s.id} className="chip gap-1 bg-surface-2 text-xs">
                      <input type="checkbox" checked={secs.includes(s.id)} onChange={() => toggle(setSecs, s.id)} />
                      {s.name} <span className="tabular-nums opacity-70">{formatNum(count.get(s.id) ?? 0)}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="p-3 text-center text-xs text-ink-muted">{t("praise.noCompanies", "ماكو شركات بيها مواد.")}</li>}
      </ul>
    </div>
  );
}

/* ── بعد الحفظ ─────────────────────────────────────────────────────────────── */
function DoneCard({ summary, onHistory, onNew }: { summary: PriceChangeSummary; onHistory: () => void; onNew: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    // النافذةُ تُفتح بالضغطة نفسِها قبل أيّ انتظار — بعده يمنعها المتصفّحُ بصمت.
    const w = openPrintWindow();
    if (!w) { toast.error(t("praise.printBlocked", "المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع وجرّب مرة ثانية.")); return; }
    setPrinting(true);
    try { printDetail(await repo.priceChangeDetail(summary.id), t, i18n.language, w); }
    catch (e) { w.close(); toast.error(describeDbError(e, t)); } finally { setPrinting(false); }
  };
  return (
    <div className="mx-auto max-w-lg space-y-4 py-8 text-center" data-praise-done={summary.id}>
      <CheckCircle2 size={44} className="mx-auto text-success-600" />
      <h2 className="text-lg font-bold text-ink">
        {summary.replayed
          ? t("praise.doneReplay", "هذا الرفع انطبق من قبل (نفس الطلب وصل مرتين) — ما انرفع مرة ثانية.")
          : t("praise.done", { n: formatNum(summary.n_lines), pct: bpText(summary.pct_bp), defaultValue: "انرفعت الأسعار {{pct}}٪ — {{n}} سعر" })}
      </h2>
      <p className="text-sm text-ink-muted">{t("praise.doneHelp", "من هسه البيع بالأسعار الجديدة. الأجهزة الثانية تاخذها خلال دقيقة، والفواتير القديمة على حالها.")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" leftIcon={<Printer size={16} />} loading={printing} onClick={() => void print()}>{t("praise.printNew", "اطبع الأسعار الجديدة")}</Button>
        <Button variant="secondary" leftIcon={<History size={16} />} onClick={onHistory}>{t("praise.toHistory", "السجل والإرجاع")}</Button>
        <Button onClick={onNew}>{t("praise.newAgain", "رفع جديد")}</Button>
      </div>
    </div>
  );
}

/* ── السجلّ والإرجاع ───────────────────────────────────────────────────────── */
function HistoryTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [rows, setRows] = useState<PriceChange[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try { setRows(await withTimeout(repo.listPriceChanges(), 20000)); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (failed) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="text-sm text-danger-600">{t("praise.historyFailed", "تعذّر تحميل السجل — أعد المحاولة.")}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>{t("praise.retry", "أعد المحاولة")}</Button>
      </div>
    );
  }
  if (!rows) return <div className="card space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (!rows.length) return <div className="card p-8 text-center text-sm text-ink-muted">{t("praise.historyEmpty", "ما صار رفع أسعار بعد.")}</div>;
  return (
    <>
      <ul className="space-y-2" data-praise-history>
        {rows.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setOpenId(c.id)} className="card flex w-full flex-wrap items-center gap-3 p-3 text-start hover:bg-surface-2" data-praise-change={c.id}>
              <span className="text-lg font-bold text-brand-600 tabular-nums" dir="ltr">{c.title}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {t("praise.hLine", { p: formatNum(c.n_products), s: formatNum(c.n_services), defaultValue: "{{p}} منتج · {{s}} خدمة" })}
                  {c.note && <span className="font-normal text-ink-muted"> — {c.note}</span>}
                </p>
                <p className="text-2xs text-ink-subtle tabular-nums">
                  {formatDate(c.applied_at, lang, true)} {new Date(c.applied_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {c.created_name ? ` · ${c.created_name}` : ""}
                </p>
              </div>
              <StatusChip s={c.status} />
            </button>
          </li>
        ))}
      </ul>
      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </>
  );
}

function StatusChip({ s }: { s: PriceChange["status"] }) {
  const { t } = useTranslation();
  const map = {
    applied: ["bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200", t("praise.stApplied", "مطبَّق")],
    partially_undone: ["bg-warn-50 text-warn-800 dark:bg-warn-500/10 dark:text-warn-200", t("praise.stPartial", "مرجوع جزئياً")],
    undone: ["bg-surface-2 text-ink-muted", t("praise.stUndone", "مرجوع")],
  } as const;
  return <span className={cn("chip text-2xs font-semibold", map[s][0])} data-praise-status={s}>{map[s][1]}</span>;
}

type LineState = "restorable" | "changed" | "missing" | "blocked" | "restored" | "kept_changed" | "kept_missing";
function stateOf(l: PriceDetailLine): LineState {
  // «زالت» ليست نهاية: مادةٌ استُرجعت من السلّة تعود بسعر الرفع والخادمُ يعيد محاولتَها —
  // فتُحكم حالُها الحيّة (تُختار وتُرجَع)، ولا تُقال «محذوفة» وهي على الرفّ.
  if (l.outcome && l.outcome !== "kept_missing") return l.outcome;
  if (l.later) return "blocked";
  if (l.cur == null) return l.outcome === "kept_missing" ? "kept_missing" : "missing";
  return l.cur === l.w ? "restorable" : "changed";
}

function DetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const [d, setD] = useState<PriceChangeDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(PAGE);
  /** مرجعُ الإرجاع مربوطٌ بطلبه: جوابٌ ضاع ثمّ طلبٌ **آخر** (كلُّ الباقي بعد المحدد) كان
   *  يأخذ نفسَ المرجع فيرجع جوابَ الأوّل مُعاداً، ويُقال «رجع ٣» والباقي لم يُمسّ. */
  const refRef = useRef<{ key: string; ref: string } | null>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try { setD(await withTimeout(repo.priceChangeDetail(id), 20000)); } catch { setFailed(true); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const lines = d?.lines ?? [];
  const states = useMemo(() => new Map(lines.map((l) => [l.id, stateOf(l)])), [lines]);
  const count = (s: LineState) => lines.filter((l) => states.get(l.id) === s).length;
  const pending = lines.filter((l) => !l.outcome || l.outcome === "kept_missing");
  const forceable = lines.some((l) => states.get(l.id) === "kept_changed" && l.cur != null);
  const needle = searchable(q);
  const visible = lines.filter((l) => !needle || searchable(l.n).includes(needle));
  /** اختيارُ مادةٍ من مجموعة يختار مجموعتَها — الإرجاعُ يأخذها كلَّها (لا سعرين على رفّ). */
  const toggle = (l: PriceDetailLine) => setSel((s) => {
    const n = new Set(s);
    const members = l.g ? lines.filter((x) => x.g === l.g).map((x) => x.item) : [l.item];
    const on = !n.has(l.item);
    for (const m of members) { if (on) n.add(m); else n.delete(m); }
    return n;
  });

  const undo = async (items: string[] | null) => {
    if (!reason.trim()) { toast.error(t("praise.reasonFirst", "اكتب سبب الإرجاع أول.")); return; }
    if (busy) return;
    const key = JSON.stringify(items ? [...items].sort() : "all");
    if (!refRef.current || refRef.current.key !== key) refRef.current = { key, ref: `pu-${uuid()}` };
    setBusy(true);
    try {
      const r = await withTimeout(repo.undoPriceChange(id, items, reason.trim(), refRef.current.ref), 30000);
      refRef.current = null;
      await afterPriceChange(clinicId, r.event_seq);
      playSuccess();
      if (r.replayed) toast.toast({ tone: "info", title: t("praise.undoReplay", "هذا الإرجاع انطبق من قبل (الجواب الأول ضاع بالشبكة) — هذي نتيجته:") });
      // ما صار يُقال، وما لم يصر لا يُعدّ صفراً بالرسالة.
      const parts = [t("praise.undoRestored", { n: formatNum(r.restored ?? 0), defaultValue: "رجع {{n}} سعر لأصله" })];
      if (r.kept_changed) parts.push(t("praise.undoKept", { n: formatNum(r.kept_changed), defaultValue: "{{n}} تغيّر بيد بعد الرفع فبقي" }));
      if (r.blocked) parts.push(t("praise.undoBlocked", { n: formatNum(r.blocked), defaultValue: "{{n}} محجوز برفع لاحق" }));
      if (r.kept_missing) parts.push(t("praise.undoMissing", { n: formatNum(r.kept_missing), defaultValue: "{{n}} مادة محذوفة" }));
      toast.success(parts.join(" · "));
      setSel(new Set()); await load(); onChanged();
    } catch (e) {
      playWarning(); toast.error(describeDbError(e, t));
      // ردُّ الخادم (برمز) يُنهي المحاولة؛ انقطاعُ الشبكة يُبقي المرجعَ لإعادةٍ آمنة.
      if ((e as { code?: string })?.code) refRef.current = null;
    } finally { setBusy(false); }
  };
  const force = async (l: PriceDetailLine) => {
    if (!reason.trim()) { toast.error(t("praise.reasonFirst", "اكتب سبب الإرجاع أول.")); return; }
    if (l.cur == null || busy) return;
    setBusy(true);
    try {
      const r = await repo.forcePriceLine(l.id, l.cur, reason.trim());
      await afterPriceChange(clinicId, r.event_seq);
      playSuccess();
      toast.success((r.restored ?? 1) > 1
        ? t("praise.forceDoneGroup", { name: l.n, n: formatNum(r.restored ?? 1), v: exactMoney(l.o), defaultValue: "«{{name}}» ومجموعتها ({{n}} مواد بسعر واحد) رجعت لسعرها الأصلي {{v}}" })
        : t("praise.forceDone", { name: l.n, v: exactMoney(l.o), defaultValue: "«{{name}}» رجع لسعره الأصلي {{v}}" }));
      await load(); onChanged();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t)); } finally { setBusy(false); }
  };

  const stateLabel: Record<LineState, string> = {
    restorable: t("praise.lsRestorable", "يرجع"), changed: t("praise.lsChanged", "تغيّر بعد الرفع"), missing: t("praise.lsMissing", "المادة محذوفة"),
    blocked: t("praise.lsBlocked", "محجوز برفع لاحق"), restored: t("praise.lsRestored", "رجع لأصله"),
    kept_changed: t("praise.lsKeptChanged", "بقي (تعديل بيد)"), kept_missing: t("praise.lsKeptMissing", "بقي (محذوفة)"),
  };
  const stateCls: Record<LineState, string> = {
    restorable: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200",
    changed: "bg-warn-50 text-warn-800 dark:bg-warn-500/10 dark:text-warn-200",
    missing: "bg-surface-2 text-ink-muted", blocked: "bg-warn-50 text-warn-800 dark:bg-warn-500/10 dark:text-warn-200",
    restored: "bg-surface-2 text-ink-muted", kept_changed: "bg-surface-2 text-ink-muted", kept_missing: "bg-surface-2 text-ink-muted",
  };

  return (
    <Modal open onClose={() => !busy && onClose()} size="wide" title={d ? t("praise.detailTitle", { title: d.change.title, defaultValue: "رفع {{title}}" }) : t("praise.loading", "جاري التحميل…")}>
      {failed ? (
        <div className="space-y-3 p-2 text-center">
          <p className="text-sm text-danger-600">{t("praise.detailFailed", "تعذّر تحميل التفاصيل.")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>{t("praise.retry", "أعد المحاولة")}</Button>
        </div>
      ) : !d ? (
        <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>
      ) : (
        <div className="space-y-3" data-praise-detail={id}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <StatusChip s={d.change.status} />
            <span className="tabular-nums">{formatDate(d.change.applied_at, i18n.language, true)} {new Date(d.change.applied_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            {d.change.created_name && <span>· {d.change.created_name}</span>}
            {d.change.note && <span>· {d.change.note}</span>}
            {d.change.undo_reason && <span>· {t("praise.lastReason", { r: d.change.undo_reason, defaultValue: "آخر سبب إرجاع: {{r}}" })}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 text-2xs" data-praise-counts>
            {(["restorable", "changed", "blocked", "missing", "restored", "kept_changed", "kept_missing"] as LineState[]).map((s) => count(s) > 0 && (
              <span key={s} className={cn("chip font-semibold", stateCls[s])}>{stateLabel[s]} {formatNum(count(s))}</span>
            ))}
          </div>
          {count("blocked") > 0 && (
            <p className="rounded-lg bg-warn-50 p-2 text-xs text-warn-800 dark:bg-warn-500/10 dark:text-warn-200">
              {t("praise.blockedHelp", "بعض المواد انرفعت مرة ثانية برفع بعده — رجّع الرفع اللاحق أول، وبعدين هذا يرجعها لأصلها الأول (حتى ما يضيع السعر الأصلي).")}
            </p>
          )}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input className="input h-9 ps-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("praise.searchPh", "دوّر بالقائمة…")} />
          </div>
          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-2xs text-ink-subtle">
                <tr>
                  <th className="w-8 p-2" />
                  <th className="p-2 text-start">{t("praise.colItem", "المادة")}</th>
                  <th className="p-2 text-end">{t("praise.colOld", "قبل")}</th>
                  <th className="p-2 text-end">{t("praise.colNew", "بعد")}</th>
                  <th className="p-2 text-end">{t("praise.colNow", "الآن")}</th>
                  <th className="p-2 text-start">{t("praise.colState", "الحالة")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.slice(0, shown).map((l) => {
                  const s = states.get(l.id)!;
                  const canPick = s === "restorable" || s === "changed" || s === "missing";
                  return (
                    <tr key={l.id} data-praise-line={l.item} data-state={s}>
                      <td className="p-2 text-center">
                        {canPick && <input type="checkbox" checked={sel.has(l.item)} onChange={() => toggle(l)} />}
                      </td>
                      <td className="p-2">
                        <span className="font-semibold text-ink">{l.n}</span>
                        {l.f === "sub_unit_price" && <span className="ms-1 text-2xs text-ink-subtle">{t("praise.subShort", "(مفرد)")}</span>}
                        {l.k === "service" && <span className="ms-1 text-2xs text-ink-subtle">{t("praise.svcShort", "(خدمة)")}</span>}
                        {l.g && <Layers size={11} className="ms-1 inline text-ink-subtle" />}
                      </td>
                      <td className="p-2 text-end tabular-nums text-ink-muted">{exactMoney(l.o)}</td>
                      <td className="p-2 text-end tabular-nums">{exactMoney(l.w)}</td>
                      <td className="p-2 text-end tabular-nums font-semibold">{l.cur == null ? "—" : exactMoney(l.cur)}</td>
                      <td className="p-2">
                        <span className={cn("chip text-2xs font-semibold", stateCls[s])}>
                          {s === "blocked" && l.later ? t("praise.lsBlockedBy", { title: l.later.title, defaultValue: "محجوز برفع {{title}}" }) : stateLabel[s]}
                        </span>
                        {s === "kept_changed" && l.cur != null && (
                          <button type="button" disabled={busy} onClick={() => void force(l)} className="ms-1 text-2xs font-semibold text-brand-600 underline" data-praise-force={l.id}>
                            {t("praise.forceBtn", { v: exactMoney(l.o), defaultValue: "رجّعه للأصل {{v}}" })}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length > shown && (
              <button type="button" className="w-full border-t border-line py-2 text-sm font-semibold text-brand-600" onClick={() => setShown((x) => x + PAGE * 3)}>
                {t("praise.more", { n: formatNum(visible.length - shown), defaultValue: "عرض المزيد ({{n}} باقية)" })}
              </button>
            )}
          </div>
          {/* السببُ يظهر ما دام بالرفع ما يُرجَع — ومنه «رجّعه للأصل» لسطرٍ بقي: كان الحقلُ مع
              المعلَّق وحده، فبعد «رجّع الكل» وإعادة الفتح يقول الزرُّ «اكتب السبب» ولا مكانَ له. */}
          {(pending.length > 0 || forceable) && (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-ink">{t("praise.reason", "سبب الإرجاع (لازم)")}</span>
                <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("praise.reasonPh", "مثلاً: الرفع كان غلط")} data-praise-reason />
              </label>
              <p className="text-2xs text-ink-subtle">{t("praise.undoHelp", "الإرجاع يرجّع السعر الأصلي بالضبط للمواد اللي بعدها بسعر الرفع. اللي تغيّر سعرها بيد بعد الرفع تبقى (ولها زر «رجّعه للأصل»)، والفواتير ما تتغيّر.")}</p>
              {pending.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} disabled={!sel.size || busy} loading={busy && sel.size > 0}
                    onClick={() => void undo([...sel])} data-praise-undo-sel>
                    {t("praise.undoSel", { n: formatNum(sel.size), defaultValue: "رجّع المحدد ({{n}})" })}
                  </Button>
                  <Button size="sm" variant="danger" leftIcon={<Undo2 size={14} />} disabled={busy} onClick={() => void undo(null)} data-praise-undo-all>
                    {t("praise.undoAll", "رجّع كل الباقي لسعره الأصلي")}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" leftIcon={<Printer size={14} />} onClick={() => { if (!printDetail(d, t, i18n.language)) toast.error(t("praise.printBlocked", "المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع وجرّب مرة ثانية.")); }}>{t("praise.print", "طباعة")}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const openPrintWindow = () => window.open("", "_blank", "width=900,height=940");

/** قائمةُ الأسعار للطباعة (للرفوف): الاسم، قبل، الآن — من وثيقة التفصيل كاملةً لا قائمةٍ تُقصّ عند
 *  الألف. **ما زال مرفوعاً وحده، بسعره الحاليّ**: سطرٌ أُرجع أو عُدِّل بيدٍ كان يُطبع بسعر الرفع
 *  فيصير الرفُّ غيرَ الكاشير. */
function printDetail(d: PriceChangeDetail, t: TFunction, lang: string, win?: Window | null): boolean {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const live = d.lines.filter((l) => !l.outcome && l.cur != null);
  const rows = live.sort((a, b) => a.n.localeCompare(b.n, "ar")).map((l) =>
    `<tr><td>${esc(l.n)}${l.f === "sub_unit_price" ? ` <small>${esc(t("praise.subShort", "(مفرد)"))}</small>` : ""}</td><td>${esc(exactMoney(l.o))}</td><td><b>${esc(exactMoney(l.cur as number))}</b></td></tr>`).join("");
  const title = t("praise.printTitle", { title: d.change.title, d: formatDate(d.change.applied_at, lang, true), defaultValue: "الأسعار الجديدة — رفع {{title}} — {{d}}" });
  const html = `<!doctype html><html dir="${lang === "ar" ? "rtl" : "ltr"}" lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:start}th{background:#f2f4f7}
td:nth-child(n+2){font-variant-numeric:tabular-nums;white-space:nowrap}</style></head>
<body><h1>${esc(title)}</h1><table><thead><tr><th>${esc(t("praise.colItem", "المادة"))}</th><th>${esc(t("praise.colOld", "قبل"))}</th><th>${esc(t("praise.colNow", "الآن"))}</th></tr></thead>
<tbody>${rows}</tbody></table><p style="font-size:11px;color:#666">${esc(t("praise.printCount", { n: live.length, defaultValue: "{{n}} سطر" }))}</p>
<script>window.onload=()=>window.print()</script></body></html>`;
  const w = win ?? openPrintWindow();
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
