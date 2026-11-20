// ============================================================================
// إدارة مكتبة الصور (0175، والمستوياتُ 0284) — تبويب بلوحة المنصّة، للمشغّل وحده.
//
// المكتبةُ بأربعة مستويات (طلبُ المالك ٢٠/١١): **الشركات** ← شركة (موزّع: اليف هاوس…) ← صنف (قطط، كلاب…)
// ← وكالة (ماركة) ← قسم (طعام رطب، رمل…). التصفّحُ فتاتُ خبزٍ ينزل مستوىً مستوى، والصورُ تُرسم حين يضيق
// المسار (وكالةٌ أو أقلُّ من ٢٤٠ صورة) — ملفُّ موزّعٍ واحد ٩٠٠ صورة. والصفوفُ القديمة بلا صنفٍ ولا وكالة
// تبقى ظاهرةً تحت «بلا…». والإضافةُ يدوياً أو من ملف إكسل (LibraryImport، رفيقُ النطاق).
//
// الحارسُ الحقيقيّ بالقاعدة (سياساتُ is_platform_admin على الجدول ومجلّد library/) — هذه الشاشةُ واجهتُه.
// والحذفُ بلا نافذة متصفّح (قاعدةُ المشروع): الضغطةُ الأولى تقلب الصفَّ لشريط تأكيدٍ يعرض كم منتجاً بكلّ
// العيادات يستعمل الصورة، والقرارُ بعد رؤية الرقم.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Trash2, Loader2, ChevronRight, Building2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { prepareUpload, type PreparedUpload } from "@/lib/image";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError, describeUploadError } from "@/lib/errors";
import { cn, searchable, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { LEVELS, childrenOf, cutAt, keyOfValue, nextLevel, under, valueOf, type Level, type LibPath } from "@/lib/libraryLevels";
import { LibraryImport } from "./LibraryImport";
import type { LibraryImage } from "@/types";

const BLANK = { name: "", company: "", kind: "", agency: "", section: "", barcode: "" };
/** فوق هذا العدد لا تُرسم الصورُ حتى يضيق المسار — ٩٠٠ بطاقةٍ دفعةً واحدة تُثقل الشاشة بلا فائدة. */
const GRID_CAP = 240;

export function ImageLibraryManager() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LibraryImage[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(BLANK);
  const [photo, setPhoto] = useState<PreparedUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<LibPath>({});
  /** الصفُّ بوضع تأكيد الحذف + عدّةُ الاستعمال المقروءة من الخادم. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  // فشلُ التحميل يُقال مع «أعد المحاولة» — قائمةٌ فارغةٌ عن خطأ تقول «المكتبة فارغة» فيُعاد الرفعُ كلُّه.
  const load = () => {
    setLoadErr(null);
    void repo.listImageLibrary().then(setRows).catch((e) => { const m = describeDbError(e, t); setLoadErr(m); toast.error(m); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const pick = async (file: File) => {
    try { setPhoto(await prepareUpload(file, { maxDim: 800, quality: 0.72 })); }
    catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
  };

  const add = async () => {
    if (!f.name.trim() || !photo || busy) return;
    setBusy(true);
    try {
      await repo.createLibraryImage({ ...f }, photo);
      playSuccess();
      toast.success(t("lib.added", "انضافت للمكتبة"));
      setF({ ...BLANK, company: f.company, kind: f.kind, agency: f.agency, section: f.section });   // الدفعةُ التالية غالباً بنفس المسار
      setPhoto(null);
      load();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  const askDelete = async (r: LibraryImage) => {
    playTap();
    setConfirmId(r.id); setUsage(null);
    try { setUsage(await repo.imageLibraryUsage(r.path)); }
    catch { setUsage(-1); /* swallow-ok: العدّ إثراء للقرار — فشلُه يُعرض «؟» ولا يمنع الحذف */ }
  };

  const doDelete = async (r: LibraryImage) => {
    setBusy(true);
    try {
      await repo.deleteLibraryImage(r.id, r.path);
      playSuccess();
      toast.success(t("lib.deleted", "انحذفت من المكتبة"));
      setConfirmId(null);
      load();
    } catch (e) { playWarning(); toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  const noLabel = (level: Level) =>
    level === "company" ? t("lib.noCompany", "بلا شركة") : level === "kind" ? t("libm.noKind") : level === "agency" ? t("libm.noAgency") : t("libm.noSection");
  const labelOf = (level: Level, v: string | null) => v ?? noLabel(level);
  const levelName = (level: Level) => t(`libm.level.${level}`);

  // البحثُ يتجاوز المسار: كلُّ المكتبة، مجمّعةً بمسارها الكامل.
  const searching = q.trim().length > 0;
  const found = useMemo(() => {
    if (!searching) return [];
    const ql = searchable(q);
    return rows.filter((r) => [r.name, r.company, r.kind, r.agency, r.section, r.barcode].some((x) => x && searchable(x).includes(ql)));
  }, [rows, q, searching]);

  const here = useMemo(() => under(rows, path), [rows, path]);
  const level = nextLevel(path);
  const kids = useMemo(() => (level ? childrenOf(rows, path, level) : []), [rows, path, level]);
  const deep = path.agency !== undefined || path.section !== undefined;
  const showGrid = searching || deep || here.length <= GRID_CAP;
  const gridRows = searching ? found : here;

  /* الشبكةُ مجمّعةً بالقسم (أو بالمسار كاملاً عند البحث) — نفسُ شكل الشاشة القديمة لكلّ مجموعة. */
  const groups = useMemo(() => {
    const m = new Map<string, LibraryImage[]>();
    for (const r of gridRows) {
      const k = searching
        ? LEVELS.map((l) => labelOf(l, valueOf(r, l))).join(" › ")
        : labelOf("section", valueOf(r, "section"));
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRows, searching, t]);

  const crumbs = LEVELS.filter((l) => path[l] !== undefined);
  const crumbLabel = (l: Level) => {
    const hit = rows.find((r) => keyOfValue(valueOf(r, l)) === path[l]);
    return labelOf(l, hit ? valueOf(hit, l) : null);
  };

  const field = (k: keyof typeof BLANK, ph: string, list?: string, ltr?: boolean) => (
    <input className="input" dir={ltr ? "ltr" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} list={list} data-libfield={k} />
  );
  const uniq = (k: Level) => [...new Set(rows.map((r) => valueOf(r, k)).filter(Boolean))] as string[];

  return (
    <div className="space-y-4" data-libmanager>
      <LibraryImport library={rows} onChanged={load} />

      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-extrabold text-ink">{t("lib.addTitle", "أضف صورة للمكتبة")}</h3>
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }}
            className={cn("grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border transition",
              photo ? "border-brand-400" : "border-dashed border-line-strong text-ink-subtle hover:border-brand-300")}>
            {photo ? <img src={photo.dataUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} />}
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            {field("name", t("lib.namePh", "اسم المنتج بالصورة"))}
            {field("barcode", t("lib.barcodePh", "باركود (اختياري)"), undefined, true)}
            {field("company", t("lib.companyPh", "الشركة"), "lib-companies")}
            {field("kind", t("libm.kindPh"), "lib-kinds")}
            {field("agency", t("libm.agencyPh"), "lib-agencies")}
            {field("section", t("libm.sectionPh"), "lib-sections")}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void pick(fl); e.target.value = ""; }} />
        </div>
        {/* ما بالمكتبة يُقترح كتابةً — تقسيمٌ متّسق بلا جدولٍ جديد. */}
        <datalist id="lib-companies">{uniq("company").map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="lib-kinds">{uniq("kind").map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="lib-agencies">{uniq("agency").map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="lib-sections">{uniq("section").map((c) => <option key={c} value={c} />)}</datalist>
        <Button size="sm" loading={busy} disabled={!f.name.trim() || !photo} leftIcon={<ImagePlus size={15} />} onClick={() => void add()} data-libadd>
          {t("lib.addGo", "أضفها")}
        </Button>
      </div>

      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} data-libsearch />

      {loadErr ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{loadErr}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-subtle">
          {t("lib.emptyAdmin", "المكتبة فارغة — أول صورة ترفعها تظهر لكل العيادات بمنتقي «اختر من المكتبة».")}
        </p>
      ) : (
        <section className="space-y-3" data-libbrowse>
          {!searching && (
            <>
              <nav className="flex flex-wrap items-center gap-1 text-sm font-extrabold" data-libcrumbs>
                <button className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition", crumbs.length ? "text-brand-600 hover:bg-surface-2" : "text-ink")}
                  onClick={() => { playTap(); setPath({}); }} data-libcrumb="root">
                  <Building2 size={16} /> {t("libm.companies")}
                </button>
                {crumbs.map((l, i) => (
                  <span key={l} className="inline-flex items-center gap-1">
                    <ChevronRight size={14} className="text-ink-subtle rtl:rotate-180" />
                    <button className={cn("rounded-lg px-2 py-1 transition", i < crumbs.length - 1 ? "text-brand-600 hover:bg-surface-2" : "text-ink")}
                      onClick={() => { playTap(); setPath(cutAt(path, l)); }} data-libcrumb={l} dir="auto">
                      {crumbLabel(l)}
                    </button>
                  </span>
                ))}
              </nav>
              {crumbs.length === 0 && <p className="text-2xs text-ink-subtle">{t("libm.companiesHint")}</p>}

              {level && kids.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-2xs font-bold text-ink-subtle">{levelName(level)} · {formatNum(kids.length)}</p>
                  <div className={cn(level === "company" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-wrap gap-1.5")} data-libkids={level}>
                    {kids.map((k) => (
                      <button key={k.key} onClick={() => { playTap(); setPath({ ...path, [level]: k.key }); }} data-libkid={k.label ?? ""}
                        className={cn(level === "company"
                          ? "card flex flex-col items-start gap-1 p-3 text-start transition hover:border-brand-300"
                          : "rounded-full bg-surface-2 px-3 py-1 text-2xs font-bold text-ink-muted transition hover:bg-surface-3 hover:text-ink")}>
                        <span className={cn(level === "company" ? "text-sm font-extrabold text-ink" : "")} dir="auto">{labelOf(level, k.label)}</span>
                        <span className={cn(level === "company" ? "text-2xs font-bold text-ink-subtle" : "ms-1 opacity-70")}>{level === "company" ? t("libm.items", { n: formatNum(k.count) }) : formatNum(k.count)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!showGrid ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-subtle" data-libnarrow>
              {t("libm.narrow", { n: formatNum(here.length) })}
            </p>
          ) : searching && found.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-subtle">{t("libm.noResults")}</p>
          ) : groups.map(([g, items]) => (
            <div key={g} className="card p-3" data-libgroup={g}>
              <p className="mb-2 text-2xs font-bold text-ink-subtle" dir="auto">{g} · {formatNum(items.length)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {items.map((r) => (
                  <div key={r.id} className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-1" data-libitem>
                    <img src={productImageUrl(r.path) ?? undefined} alt="" loading="lazy"
                      className="aspect-square w-full bg-surface-2 object-cover"
                      onError={(e) => { e.currentTarget.hidden = true; }} />
                    <span className="line-clamp-2 p-1.5 text-2xs font-bold leading-snug text-ink" dir="auto">{r.name}</span>
                    {confirmId === r.id ? (
                      <div className="flex items-center justify-between gap-1 bg-warn-50 p-1.5 dark:bg-warn-500/10">
                        <span className="text-2xs font-bold text-warn-700">
                          {usage === null ? <Loader2 size={12} className="animate-spin" />
                            : usage === -1 ? t("lib.usageUnknown", "الاستعمال؟")
                            : t("lib.usedBy", "بـ{{n}} منتج", { n: formatNum(usage) })}
                        </span>
                        <button className="rounded-lg bg-warn-700 px-2 py-0.5 text-2xs font-bold text-white" disabled={busy} onClick={() => void doDelete(r)}>
                          {t("lib.deleteGo", "احذف نهائياً")}
                        </button>
                        <button className="text-2xs font-bold text-ink-subtle" onClick={() => setConfirmId(null)}>{t("common.cancel", "Cancel")}</button>
                      </div>
                    ) : (
                      <button className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-lg bg-ink/60 text-white transition hover:bg-warn-700"
                        aria-label={t("lib.deleteAria", "حذف {{name}}", { name: r.name })} onClick={() => void askDelete(r)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
