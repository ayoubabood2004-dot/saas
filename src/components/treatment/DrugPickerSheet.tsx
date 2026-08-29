import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { X, Search, Check, Plus, ShieldAlert } from "lucide-react";
import type { Product, Species } from "@/types";
import { MED_CATALOG, getClinicMeds, medicationExists, addClinicMed } from "@/lib/meds";
import { matchMonograph, doseFor, isBannedFor } from "@/lib/vetFormulary";
import { cn, formatNum, normalizeAr } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * DrugPickerSheet — الدواء يُختار بالتصفّح لا بالكتابة.
 *
 * كان اسم الدواء حقلَ كتابةٍ يبحث وأنت تكتب: يشتغل لمن يعرف الاسم مسبقاً،
 * ويرفع كيبورد الآيباد فوق الشاشة، ولا يُتيح **التصفّح** أبداً — والطبيب
 * كثيراً ما يعرف الصنف («مضاد حيوي») قبل أن يعرف الاسم.
 *
 * هنا أربعة أبواب كلها بالضغط: ما بالعيادة فعلاً، وأدوية الطبيب المعتادة،
 * والتصنيفات، والكل. والكتابة تبقى بابَ نجاةٍ خلف زر العدسة وبأسفل الورقة —
 * تُخفَّض ولا تُحذَف، لأن رفّ العيادة أوسع من أي دليل.
 *
 * الشارات تُقال **قبل** الضغطة: «جرعة جاهزة» يعني الدليل يعرف جرعته لهذا
 * النوع فتنحسب تلقائياً، و«بلا جرعة موثّقة» يعني ستُكتب يدوياً — فيعرف
 * الطبيب إلى أين تأخذه الضغطة قبل أن يضغط.
 *
 * ثلاث قواعد تراصُفٍ تحكم كل ورقةٍ فوق مودال:
 *  ١) Escape يُلتقط بمرحلة الالتقاط لا الفقاعة — وإلا أغلق المعالجَ كلّه.
 *  ٢) لا تُلمَس document.body.style.overflow — المودال يملكها ويعيدها.
 *  ٣) لا autoFocus — الكيبورد لا يطلع إلا بطلب.
 * ==========================================================================*/

/** صنف الكتالوج (إنكليزي) → مفتاح ترجمته. الإنكليزي نفسه هو الافتراضي، فلا
 *  يظهر نصٌّ عربيّ صلب بهذا الملف أبداً. */
const TYPE_KEY: Record<string, string> = {
  "Antibiotics": "tplan.typeAntibiotics",
  "NSAIDs & Analgesics": "tplan.typeNsaid",
  "Anesthetics & Sedatives": "tplan.typeAnesthetic",
  "Antiparasitics": "tplan.typeAntiparasitic",
  "Antifungals": "tplan.typeAntifungal",
  "Corticosteroids": "tplan.typeSteroid",
  "Gastrointestinal": "tplan.typeGi",
  "Cardiac & Diuretics": "tplan.typeCardiac",
  "Endocrine & Hormones": "tplan.typeEndocrine",
  "Allergy & Dermatology": "tplan.typeDerm",
  "Fluids & Electrolytes": "tplan.typeFluids",
  "Emergency & Antidotes": "tplan.typeEmergency",
  "Vitamins & Supplements": "tplan.typeVitamins",
  "Other": "tplan.typeOther",
};

interface Item { name: string; type: string }

const TAB_KEY = "vp_tx_picker_tab";

export function DrugPickerSheet({
  open, species, stockMeds, recents, inPlan, replaceMode, onPick, onUnpick, onClose,
}: {
  open: boolean;
  species?: Species;
  stockMeds: Product[];
  /** أدوية الطبيب الأخيرة (هذا الجهاز). */
  recents: string[];
  /** هل هذا الدواء بالخطة أصلاً؟ يعيد معرّف سطره إن كان. */
  inPlan: (name: string) => string | null;
  /** وضع الاستبدال: ضغطةٌ واحدة تختار وتُغلق. */
  replaceMode?: boolean;
  onPick: (name: string) => void;
  onUnpick: (rowId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"stock" | "mine" | "class" | "all">("stock");
  const [klass, setKlass] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [confirmBanned, setConfirmBanned] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [added, setAdded] = useState(0);

  /* Escape بمرحلة الالتقاط: يغلق البحث أولاً ثم الورقة، ولا يصل للمعالج. */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (searchOn) { setSearchOn(false); setQ(""); return; }
      onClose();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, searchOn, onClose]);

  const clinicMeds = useMemo(() => getClinicMeds(), [open]);

  /** كل الأسماء المعروفة: الكتالوج (بلا لقاحات) + أدوية العيادة + مخزونها. */
  const allItems = useMemo<Item[]>(() => {
    const m = new Map<string, string>();
    for (const c of MED_CATALOG) if (c.type !== "Vaccines") for (const it of c.items) m.set(it, c.type);
    for (const cm of clinicMeds) m.set(cm.name, cm.type);
    for (const p of stockMeds) if (![...m.keys()].some((k) => k.toLowerCase() === p.name.toLowerCase())) m.set(p.name, "Other");
    return [...m].map(([name, type]) => ({ name, type }));
  }, [clinicMeds, stockMeds]);

  const stockOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of stockMeds) m.set(p.name.toLowerCase(), p.stock);
    return m;
  }, [stockMeds]);

  /** فهرس البحث — نفس كومة القشّ القديمة: الاسم والعربي والإنكليزي والتجاري. */
  const index = useMemo(() => allItems.map((it) => {
    const mono = matchMonograph(it.name);
    return {
      ...it, mono,
      hay: [it.name, mono?.ar, mono?.en, ...(mono?.brands ?? [])].filter(Boolean).map((s) => normalizeAr(s as string)).join("|"),
    };
  }), [allItems]);

  /** الترتيب الشامل: غيرُ الممنوع، ثم المتوفّر، ثم ما له جرعة موثّقة. */
  const rank = (it: typeof index[number]) => {
    const banned = it.mono && species ? !!isBannedFor(it.mono, species) : false;
    const stock = stockOf.has(it.name.toLowerCase());
    const dosed = !!(it.mono && species && doseFor(it.mono, species));
    return (banned ? 100 : 0) + (stock ? 0 : 10) + (dosed ? 0 : 1);
  };

  const shown = useMemo(() => {
    const ql = normalizeAr(q.trim());
    let list = index;
    if (ql) list = list.filter((x) => x.hay.includes(ql));
    else if (tab === "stock") list = list.filter((x) => stockOf.has(x.name.toLowerCase()));
    else if (tab === "mine") { const set = new Set(recents.map((r) => r.toLowerCase())); list = list.filter((x) => set.has(x.name.toLowerCase())); }
    else if (tab === "class") list = klass ? list.filter((x) => x.type === klass) : [];
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (a.mono?.ar ?? a.name).localeCompare(b.mono?.ar ?? b.name, "ar"));
    if (!ql && tab === "mine") {
      const order = new Map(recents.map((r, i) => [r.toLowerCase(), i]));
      sorted.sort((a, b) => rank(a) - rank(b) || ((order.get(a.name.toLowerCase()) ?? 99) - (order.get(b.name.toLowerCase()) ?? 99)));
    }
    return sorted.slice(0, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, q, tab, klass, recents, stockOf, species]);

  /** أصناف الرفّ الجانبي مع عدد كل صنف. */
  const classes = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of allItems) m.set(it.type, (m.get(it.type) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [allItems]);

  /* أول باب غير فارغ عند الفتح، أو آخر بابٍ استُعمل. */
  useEffect(() => {
    if (!open) return;
    setQ(""); setSearchOn(false); setConfirmBanned(null); setNewOpen(false); setNewName(""); setAdded(0);
    let want: typeof tab | null = null;
    try { const v = localStorage.getItem(TAB_KEY); if (v === "stock" || v === "mine" || v === "class" || v === "all") want = v; } catch { /* per-device convenience */ }
    const hasStock = stockMeds.length > 0;
    const hasMine = recents.length > 0;
    if (want === "stock" && !hasStock) want = null;
    if (want === "mine" && !hasMine) want = null;
    setTab(want ?? (hasStock ? "stock" : hasMine ? "mine" : "class"));
    if (!klass && classes.length) setKlass(classes[0][0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickTab = (v: typeof tab) => { playTap(); setTab(v); try { localStorage.setItem(TAB_KEY, v); } catch { /* ignore */ } };

  if (!open) return null;

  const canSaveNew = newName.trim().length > 1 && !medicationExists(newName.trim());

  const tabBtn = (id: typeof tab, label: string, n: number) => (
    <button key={id} type="button" onClick={() => pickTab(id)} disabled={n === 0 && id !== "all" && id !== "class"}
      className={cn("h-12 shrink-0 rounded-2xl px-4 text-sm font-extrabold transition disabled:opacity-35",
        tab === id && !q ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2")}>
      {label}{n > 0 && <span className="ms-1.5 text-2xs font-black opacity-70 tabular-nums">{formatNum(n)}</span>}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end no-print" role="dialog" aria-modal="true" aria-label={t("tplan.pickDrug", "اختر الدواء")}>
      <button type="button" aria-label={t("common.close", "إغلاق")} onClick={onClose} className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}
        data-drugpicker
        className="relative mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-4xl border border-b-0 border-line bg-surface-1 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-raised lg:max-w-5xl"
      >
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-line" />

        <div className="flex items-center gap-2 px-3 pb-2">
          <p className="text-base font-black text-ink">{t("tplan.pickDrug", "اختر الدواء")}</p>
          <button type="button" onClick={onClose} aria-label={t("common.close", "إغلاق")} className="ms-auto grid h-11 w-11 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2"><X size={19} /></button>
        </div>

        {/* أبواب الاختيار — كلها بالضغط */}
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pb-2">
          {tabBtn("stock", t("tplan.tabStock", "بالعيادة"), stockMeds.length)}
          {tabBtn("mine", t("tplan.tabMine", "أدويتي"), recents.length)}
          {tabBtn("class", t("tplan.tabClass", "حسب الصنف"), 0)}
          {tabBtn("all", t("tplan.tabAll", "الكل"), allItems.length)}
          <button type="button" onClick={() => { playTap(); setSearchOn((v) => !v); if (searchOn) setQ(""); }}
            aria-label={t("tplan.searchDrug", "دوّر بالاسم — عربي أو إنكليزي أو اسم تجاري")}
            className={cn("ms-auto grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition", searchOn ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-2")}>
            <Search size={19} />
          </button>
        </div>

        {searchOn && (
          <div className="flex items-center gap-2 px-3 py-2">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick(shown[0].name); setAdded((n) => n + 1); } }}
              placeholder={t("tplan.searchDrug", "دوّر بالاسم — عربي أو إنكليزي أو اسم تجاري")}
              className="input h-12 flex-1 text-sm font-bold" />
          </div>
        )}

        {/* الجسم: رفُّ الأصناف (بباب الصنف) + البلاطات */}
        <div className={cn("grid min-h-0 flex-1 gap-2 p-3", tab === "class" && !q ? "grid-cols-[132px_minmax(0,1fr)]" : "grid-cols-1")}>
          {tab === "class" && !q && (
            <div className="min-h-0 space-y-1 overflow-y-auto">
              {classes.map(([type, n]) => (
                <button key={type} type="button" onClick={() => { playTap(); setKlass(type); }}
                  className={cn("flex h-14 w-full items-center rounded-2xl px-3 text-start text-sm font-bold transition",
                    klass === type ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                  <span className="min-w-0 flex-1 truncate">{t(TYPE_KEY[type] ?? "tplan.typeOther", type)}</span>
                  <span className="ms-1 text-2xs font-black tabular-nums opacity-70">{formatNum(n)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid min-h-0 content-start gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {shown.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm font-bold text-ink-subtle">{t("tplan.pickerEmpty", "ماكو شي هنا — جرّب باباً ثانياً أو دوّر بالاسم")}</p>
            )}
            {shown.map((it) => {
              const rowId = inPlan(it.name);
              const banned = it.mono && species ? isBannedFor(it.mono, species) : undefined;
              const dosed = !!(it.mono && species && doseFor(it.mono, species));
              const stock = stockOf.get(it.name.toLowerCase());
              const title = it.mono?.ar ?? it.name;
              const sub = it.mono?.ar && it.mono.ar !== it.name ? it.name : null;

              if (confirmBanned === it.name && banned) {
                return (
                  <div key={it.name} className="rounded-2xl border-2 border-danger-300 bg-danger-50 p-2.5 dark:border-danger-500/40 dark:bg-danger-500/10">
                    <p className="flex items-start gap-1.5 text-2xs font-bold leading-snug text-danger-700 dark:text-danger-300"><ShieldAlert size={14} className="mt-0.5 shrink-0" />{banned}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" onClick={() => { playTap(); setConfirmBanned(null); }} className="h-11 flex-1 rounded-xl bg-surface-1 text-xs font-extrabold text-ink-muted">{t("common.back", "رجوع")}</button>
                      <button type="button" onClick={() => { playWarning(); onPick(it.name); setAdded((n) => n + 1); setConfirmBanned(null); }} className="h-11 flex-1 rounded-xl bg-danger-600 text-xs font-extrabold text-white">{t("tplan.addAnyway", "أضفه رغم التحذير")}</button>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key={it.name} type="button" data-drugtile={it.name}
                  onClick={() => {
                    if (rowId) { playTap(); onUnpick(rowId); return; }
                    if (banned) { playWarning(); setConfirmBanned(it.name); return; }
                    onPick(it.name);
                    setAdded((n) => n + 1);
                  }}
                  className={cn("relative min-h-[76px] rounded-2xl border-2 p-2.5 text-start transition active:scale-[0.98]",
                    rowId ? "border-success-500 bg-success-600 text-white"
                      : banned ? "border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-300"
                        : "border-line bg-surface-2 hover:border-brand-300")}
                >
                  <span className={cn("block truncate text-base font-black", rowId ? "text-white" : "text-ink")}>{title}</span>
                  {sub && <span className={cn("block truncate text-2xs font-semibold", rowId ? "text-white/80" : "text-ink-subtle")}>{sub}</span>}
                  <span className="mt-1 flex flex-wrap gap-1 text-[10px] font-black">
                    {rowId ? (
                      <span className="rounded-full bg-white/20 px-1.5 py-0.5">{t("tplan.added", "أُضيف ✓")}</span>
                    ) : banned ? (
                      <span className="rounded-full bg-danger-100 px-1.5 py-0.5 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">{t("tplan.badgeBanned", "ممنوع لهذا النوع")}</span>
                    ) : dosed ? (
                      <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("tplan.badgeDosed", "جرعة جاهزة")}</span>
                    ) : (
                      <span className="rounded-full bg-surface-1 px-1.5 py-0.5 text-ink-muted">{t("tplan.badgeNoDose", "بلا جرعة موثّقة")}</span>
                    )}
                    {stock != null && !rowId && <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("tplan.badgeStock", { n: formatNum(stock), defaultValue: "✓ بالمخزون · {{n}}" })}</span>}
                  </span>
                  {rowId && <span className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/20"><X size={15} /></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* بابُ النجاة: دواءٌ ما موجود بأي مكان — يُكتب مرّةً ويبقى للعيادة */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          {newOpen ? (
            <>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("tplan.newDrugPh", "اسم الدواء كما تكتبه")} className="input h-12 min-w-[160px] flex-1 text-sm font-bold" />
              <button type="button" disabled={!canSaveNew}
                onClick={() => { const n = newName.trim(); addClinicMed(n); onPick(n); setNewName(""); setNewOpen(false); setAdded((x) => x + 1); }}
                className="h-12 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white disabled:opacity-40">
                {t("tplan.saveAndAdd", "احفظ وأضف")}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { playTap(); setNewOpen(true); }} className="inline-flex items-center gap-1 text-2xs font-bold text-ink-muted underline transition hover:text-ink">
              <Plus size={13} /> {t("tplan.notFound", "ما لكيته؟ اكتب اسمه واحفظه بالكتالوج")}
            </button>
          )}
          <button type="button" onClick={onClose}
            className="ms-auto flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-base font-black text-white shadow-soft transition hover:bg-brand-700">
            <Check size={19} /> {added > 0 && !replaceMode ? t("tplan.doneN", { n: formatNum(added), defaultValue: "تم · {{n}}" }) : t("common.done", "تم")}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
