// ============================================================================
// إدارة مكتبة الصور (0175، والمستوياتُ 0284، ومكتبةُ العيادة 0285).
//
// بمكانين بشِفرةٍ واحدة:
//   • لوحةُ المنصّة (`scope="public"`): المكتبةُ العامّة — يرتّبها المشغّل وحده ويراها الكلّ.
//   • داخلَ العيادة (`scope="clinic"`، المسار /photos/library): تبويبان — «مكتبة عيادتي» تكتبها العيادةُ بصلاحية صور
//     المنتجات وتراها وحدها، و«المكتبة العامة» قراءةٌ فقط. قرارُ المالك ٢١/١١: «كل عيادة الها مكتبتها الخاصة وايضا
//     المكتبة العامة الي اني اتحكم بيها والكل يشوفها».
//
// المكتبةُ بأربعة مستويات: **الشركات** ← شركة ← صنف ← وكالة ← قسم، فتاتَ خبزٍ ينزل مستوىً مستوى، والصورُ تُرسم حين
// يضيق المسار. والإضافةُ يدوياً أو من ملف إكسل (LibraryImport، رفيقُ النطاق)، والتعديلُ صورةً صورة، ونقلُ مجموعةٍ
// كاملة بمستواها (إعادةُ تسمية وكالةٍ أو دمجُ قسمين) من آخر حلقةٍ بالفتات.
//
// الحارسُ الحقيقيّ بالقاعدة (سياساتُ 0175/0285 والمخزن) — هذه الشاشةُ واجهتُه، وكلُّ كتابةٍ تُسمع (صفرُ صفوفٍ يُرمى).
// والحذفُ بلا نافذة متصفّح (قاعدةُ المشروع): الضغطةُ الأولى تقلب الصفَّ لشريط تأكيد، والقرارُ بعد قراءته.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ImagePlus, Trash2, Loader2, ChevronRight, Building2, Pencil, Images, Camera, Lock } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { prepareUpload, type PreparedUpload } from "@/lib/image";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError, describeUploadError } from "@/lib/errors";
import { cn, searchable, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { LEVELS, childrenOf, cleanLibName, cutAt, keyOfValue, nextLevel, under, valueOf, type Level, type LibPath } from "@/lib/libraryLevels";
import { clinicLibraryReady, idsUnder, isLibraryColumnMissing, libraryPatch, rowsOf, type LibScope } from "@/lib/libraryScope";
import { LibraryImport } from "./LibraryImport";
import type { LibraryImage } from "@/types";

const BLANK = { name: "", company: "", kind: "", agency: "", section: "", barcode: "" };
type Fields = typeof BLANK;
/** فوق هذا العدد لا تُرسم الصورُ حتى يضيق المسار — ٩٠٠ بطاقةٍ دفعةً واحدة تُثقل الشاشة بلا فائدة. */
const GRID_CAP = 240;

/** صفحةُ العيادة (/photos/library): المكتبةُ داخلَ النظام. */
export function ClinicImageLibrary() {
  return <ImageLibraryManager scope="clinic" />;
}

export function ImageLibraryManager({ scope = "public" }: { scope?: "public" | "clinic" }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinic = scope === "clinic";
  const clinicId = user?.clinic_id ?? user?.id ?? null;
  const [rows, setRows] = useState<LibraryImage[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<LibScope>(clinic ? "mine" : "public");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Fields>(BLANK);
  const [photo, setPhoto] = useState<PreparedUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<LibPath>({});
  /** الصفُّ بوضع تأكيد الحذف + عدّةُ الاستعمال المقروءة من الخادم (العامّةُ وحدها: عدٌّ بكلّ العيادات للمشغّل). */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [editing, setEditing] = useState<LibraryImage | null>(null);
  const [ef, setEf] = useState<Fields>(BLANK);
  /** نقلُ المجموعة: المستوى الذي يُعاد تسميتُه (آخرُ حلقةٍ بالفتات) والاسمُ الجديد. */
  const [renaming, setRenaming] = useState<{ level: Level; value: string } | null>(null);

  // فشلُ التحميل يُقال مع «أعد المحاولة» — قائمةٌ فارغةٌ عن خطأ تقول «المكتبة فارغة» فيُعاد الرفعُ كلُّه.
  const load = () => {
    setLoadErr(null);
    void repo.listImageLibrary().then(setRows).catch((e) => { const m = describeDbError(e, t); setLoadErr(m); toast.error(m); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const all = rows ?? [];
  const view = useMemo(() => rowsOf(all, tab), [all, tab]);
  const ready = !clinic || clinicLibraryReady(all);
  const editable = clinic ? tab === "mine" && can("manageProductPhotos") && ready && !!clinicId : true;
  const mineCount = useMemo(() => rowsOf(all, "mine").length, [all]);
  const pubCount = all.length - mineCount;

  const switchTab = (s: LibScope) => { playTap(); setTab(s); setPath({}); setQ(""); setConfirmId(null); setRenaming(null); };

  type Meta = { name: string; company?: string | null; kind?: string | null; agency?: string | null; section?: string | null; barcode?: string | null };
  const create = (meta: Meta, up: PreparedUpload) =>
    clinic ? repo.createClinicLibraryImage(clinicId, meta, up) : repo.createLibraryImage(meta, up);

  const fail = (e: unknown) => {
    playWarning();
    toast.error(isLibraryColumnMissing(e) ? (clinic ? t("libm.dbOldClinic") : t("libm.dbOld")) : describeDbError(e, t), e instanceof Error ? e.message : undefined);
  };

  const pick = async (file: File) => {
    try { setPhoto(await prepareUpload(file, { maxDim: 800, quality: 0.72 })); }
    catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
  };

  const add = async () => {
    if (!f.name.trim() || !photo || busy || !editable) return;
    setBusy(true);
    try {
      await create({ ...f }, photo);
      playSuccess();
      toast.success(t("lib.added", "انضافت للمكتبة"));
      setF({ ...BLANK, company: f.company, kind: f.kind, agency: f.agency, section: f.section });   // الدفعةُ التالية غالباً بنفس المسار
      setPhoto(null);
      load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  const askDelete = async (r: LibraryImage) => {
    playTap();
    setConfirmId(r.id); setUsage(null);
    // مكتبةُ العيادة: لا عدّ — الحذفُ يشيل الصفَّ وحده، ومنتجاتُها تبقى بصورتها (الملفُّ باقٍ، O4).
    if (clinic) { setUsage(-2); return; }
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
    } catch (e) { fail(e); load(); }
    finally { setBusy(false); }
  };

  const openEdit = (r: LibraryImage) => {
    playTap();
    setEditing(r);
    // الاسمُ منظَّفاً (cleanLibName): «&#8211;» نصّاً من ملف الموزّع يُحفظ «–» حين يُحفظ التعديل.
    setEf({ name: cleanLibName(r.name), company: r.company ?? "", kind: r.kind ?? "", agency: r.agency ?? "", section: r.section ?? "", barcode: r.barcode ?? "" });
  };
  const saveEdit = async () => {
    if (!editing || busy || !ef.name.trim()) return;
    const patch = libraryPatch(editing, ef);
    if (Object.keys(patch).length === 0) { setEditing(null); return; }
    setBusy(true);
    try {
      await repo.updateLibraryImage(editing.id, patch);
      playSuccess();
      toast.success(t("libm.saved"));
      setEditing(null);
      load();
    } catch (e) { fail(e); load(); }
    finally { setBusy(false); }
  };

  const noLabel = (level: Level) =>
    level === "company" ? t("lib.noCompany", "بلا شركة") : level === "kind" ? t("libm.noKind") : level === "agency" ? t("libm.noAgency") : t("libm.noSection");
  const labelOf = (level: Level, v: string | null) => v ?? noLabel(level);
  const levelName = (level: Level) => t(`libm.level.${level}`);

  // البحثُ يتجاوز المسار: كلُّ المكتبة (بتبويبها)، مجمّعةً بمسارها الكامل.
  const searching = q.trim().length > 0;
  const found = useMemo(() => {
    if (!searching) return [];
    const ql = searchable(q);
    return view.filter((r) => [cleanLibName(r.name), r.company, r.kind, r.agency, r.section, r.barcode].some((x) => x && searchable(x).includes(ql)));
  }, [view, q, searching]);

  const here = useMemo(() => under(view, path), [view, path]);
  const level = nextLevel(path);
  const kids = useMemo(() => (level ? childrenOf(view, path, level) : []), [view, path, level]);
  const deep = path.agency !== undefined || path.section !== undefined;
  const showGrid = searching || deep || here.length <= GRID_CAP;
  const gridRows = searching ? found : here;

  /* الشبكةُ مجمّعةً بالقسم (أو بالمسار كاملاً عند البحث). */
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
  const lastCrumb = crumbs[crumbs.length - 1] ?? null;
  const crumbValue = (l: Level) => {
    const hit = view.find((r) => keyOfValue(valueOf(r, l)) === path[l]);
    return hit ? valueOf(hit, l) : null;
  };

  /* نقلُ كلّ صور المسار إلى اسمٍ جديد بمستوى آخر حلقة — اسمٌ موجودٌ يدمج، والفارغُ «بلا». */
  const doRename = async () => {
    if (!renaming || busy || !editable) return;
    const ids = idsUnder(view, path);
    if (ids.length === 0) { setRenaming(null); return; }
    setBusy(true);
    try {
      const n = await repo.moveLibraryImages(ids, renaming.level, renaming.value);
      playSuccess();
      toast.success(t("libm.renamed", { n: formatNum(n) }));
      setPath({ ...path, [renaming.level]: keyOfValue(renaming.value.trim() || null) });
      setRenaming(null);
      load();
    } catch (e) {
      const x = e as { code?: string; moved?: number; total?: number };
      if (x?.code === "library_move_partial") { playWarning(); toast.error(t("libm.renamePartial", { n: formatNum(x.moved ?? 0), total: formatNum(x.total ?? 0) })); }
      else fail(e);
      load();
    } finally { setBusy(false); }
  };

  const field = (k: keyof Fields, ph: string, list?: string, ltr?: boolean) => (
    <input className="input" dir={ltr ? "ltr" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} list={list} data-libfield={k} />
  );
  const efield = (k: keyof Fields, label: string, list?: string, ltr?: boolean) => (
    <label className="space-y-1">
      <span className="text-2xs font-bold text-ink-muted">{label}</span>
      <input className="input" dir={ltr ? "ltr" : undefined} value={ef[k]} onChange={(e) => setEf({ ...ef, [k]: e.target.value })} list={list} data-libedit={k} />
    </label>
  );
  const uniq = (k: Level) => [...new Set(view.map((r) => valueOf(r, k)).filter(Boolean))] as string[];

  const tabBtn = (s: LibScope, label: string, n: number, Icon: typeof Images) => (
    <button onClick={() => switchTab(s)} data-libtab={s}
      className={cn("inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-sm font-bold transition",
        tab === s ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:text-ink")}>
      <Icon size={15} /> {label} <span className="opacity-75">{formatNum(n)}</span>
    </button>
  );

  const body = (
    <div className="space-y-4" data-libmanager={scope}>
      {clinic && (
        <div className="flex flex-wrap items-center gap-2" data-libtabs>
          {tabBtn("mine", t("libm.tabMine"), mineCount, Images)}
          {tabBtn("public", t("libm.tabPublic"), pubCount, Building2)}
        </div>
      )}

      {clinic && tab === "public" && (
        <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-2xs font-bold text-ink-muted" data-libreadonly>
          <Lock size={13} className="mt-0.5 shrink-0" /> {t("libm.publicReadOnly")}
        </p>
      )}
      {clinic && tab === "mine" && !ready && (
        <p className="rounded-2xl bg-warn-50 px-3 py-2 text-sm font-bold text-warn-700 dark:bg-warn-500/10" data-libnotready>{t("libm.dbOldClinic")}</p>
      )}
      {clinic && tab === "mine" && ready && !can("manageProductPhotos") && (
        <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-2xs font-bold text-ink-muted" data-libnoperm>
          <Lock size={13} className="mt-0.5 shrink-0" /> {t("libm.noPerm")}
        </p>
      )}

      {editable && rows !== null && (
        <>
          <LibraryImport library={view} onChanged={load} create={create} scope={scope} />

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
            <Button size="sm" loading={busy} disabled={!f.name.trim() || !photo} leftIcon={<ImagePlus size={15} />} onClick={() => void add()} data-libadd>
              {t("lib.addGo", "أضفها")}
            </Button>
          </div>
        </>
      )}
      {/* ما بالمكتبة يُقترح كتابةً — للإضافة والتعديل ونقل المجموعة. */}
      <datalist id="lib-companies">{uniq("company").map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="lib-kinds">{uniq("kind").map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="lib-agencies">{uniq("agency").map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="lib-sections">{uniq("section").map((c) => <option key={c} value={c} />)}</datalist>

      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} data-libsearch />

      {loadErr ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{loadErr}</p>
          <Button size="sm" variant="secondary" onClick={() => { playTap(); load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : rows === null ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-subtle"><Loader2 size={16} className="animate-spin" /></p>
      ) : view.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-subtle" data-libempty>
          {!clinic ? t("lib.emptyAdmin", "المكتبة فارغة — أول صورة ترفعها تظهر لكل العيادات بمنتقي «اختر من المكتبة».")
            : tab === "mine" ? t("libm.mineEmpty") : t("lib.empty", "المكتبة فارغة بعد — يعبّيها مشغّل المنصّة، وتكدر تصوّر منتجك بنفسك.")}
        </p>
      ) : (
        <section className="space-y-3" data-libbrowse>
          {!searching && (
            <>
              <nav className="flex flex-wrap items-center gap-1 text-sm font-extrabold" data-libcrumbs>
                <button className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition", crumbs.length ? "text-brand-600 hover:bg-surface-2" : "text-ink")}
                  onClick={() => { playTap(); setPath({}); setRenaming(null); }} data-libcrumb="root">
                  <Building2 size={16} /> {t("libm.companies")}
                </button>
                {crumbs.map((l, i) => (
                  <span key={l} className="inline-flex items-center gap-1">
                    <ChevronRight size={14} className="text-ink-subtle rtl:rotate-180" />
                    <button className={cn("rounded-lg px-2 py-1 transition", i < crumbs.length - 1 ? "text-brand-600 hover:bg-surface-2" : "text-ink")}
                      onClick={() => { playTap(); setPath(cutAt(path, l)); setRenaming(null); }} data-libcrumb={l} dir="auto">
                      {labelOf(l, crumbValue(l))}
                    </button>
                  </span>
                ))}
                {editable && lastCrumb && !renaming && (
                  <button className="ms-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-bold text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
                    onClick={() => { playTap(); setRenaming({ level: lastCrumb, value: crumbValue(lastCrumb) ?? "" }); }} data-librename>
                    <Pencil size={12} /> {t("libm.rename", { level: t(`libm.one.${lastCrumb}`) })}
                  </button>
                )}
              </nav>
              {crumbs.length === 0 && <p className="text-2xs text-ink-subtle">{t("libm.companiesHint")}</p>}

              {renaming && (
                <div className="card space-y-2 p-3" data-librename-form>
                  <p className="text-sm font-extrabold text-ink">
                    {t("libm.renameTitle", { level: t(`libm.one.${renaming.level}`), name: labelOf(renaming.level, crumbValue(renaming.level)), n: formatNum(here.length) })}
                  </p>
                  <p className="text-2xs text-ink-subtle">{t("libm.renameHint")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input min-w-[12rem] flex-1" value={renaming.value} autoFocus dir="auto"
                      list={renaming.level === "company" ? "lib-companies" : renaming.level === "kind" ? "lib-kinds" : renaming.level === "agency" ? "lib-agencies" : "lib-sections"}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void doRename(); }} data-librename-input />
                    <Button size="sm" loading={busy} onClick={() => void doRename()} data-librename-go>{t("libm.renameGo")}</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => { playTap(); setRenaming(null); }}>{t("common.cancel", "Cancel")}</Button>
                  </div>
                </div>
              )}

              {level && kids.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-2xs font-bold text-ink-subtle">{levelName(level)} · {formatNum(kids.length)}</p>
                  <div className={cn(level === "company" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-wrap gap-1.5")} data-libkids={level}>
                    {kids.map((k) => (
                      <button key={k.key} onClick={() => { playTap(); setPath({ ...path, [level]: k.key }); setRenaming(null); }} data-libkid={k.label ?? ""}
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
                    <span className="line-clamp-2 p-1.5 text-2xs font-bold leading-snug text-ink" dir="auto">{cleanLibName(r.name)}</span>
                    {!editable ? null : confirmId === r.id ? (
                      <div className="flex flex-wrap items-center justify-between gap-1 bg-warn-50 p-1.5 dark:bg-warn-500/10" data-libconfirm>
                        <span className="text-2xs font-bold text-warn-700">
                          {usage === null ? <Loader2 size={12} className="animate-spin" />
                            : usage === -2 ? t("libm.keepsOnProducts")
                            : usage === -1 ? t("lib.usageUnknown", "الاستعمال؟")
                            : t("lib.usedBy", "بـ{{n}} منتج", { n: formatNum(usage) })}
                        </span>
                        <button className="rounded-lg bg-warn-700 px-2 py-0.5 text-2xs font-bold text-white" disabled={busy} onClick={() => void doDelete(r)} data-libdelete-go>
                          {clinic ? t("libm.deleteGo") : t("lib.deleteGo", "احذف نهائياً")}
                        </button>
                        <button className="text-2xs font-bold text-ink-subtle" onClick={() => setConfirmId(null)}>{t("common.cancel", "Cancel")}</button>
                      </div>
                    ) : (
                      <div className="absolute end-1 top-1 flex gap-1">
                        <button className="grid h-6 w-6 place-items-center rounded-lg bg-ink/60 text-white transition hover:bg-brand-600"
                          aria-label={t("libm.editAria", { name: r.name })} onClick={() => openEdit(r)} data-libedit-open>
                          <Pencil size={12} />
                        </button>
                        <button className="grid h-6 w-6 place-items-center rounded-lg bg-ink/60 text-white transition hover:bg-warn-700"
                          aria-label={t("lib.deleteAria", "حذف {{name}}", { name: r.name })} onClick={() => void askDelete(r)} data-libdelete>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <Modal open={!!editing} onClose={() => { if (!busy) setEditing(null); }} title={t("libm.editTitle")}>
        {editing && (
          <div className="space-y-3" data-libedit-form>
            <div className="flex items-start gap-3">
              <img src={productImageUrl(editing.path) ?? undefined} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-line bg-surface-2 object-cover" />
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                {efield("name", t("lib.namePh", "اسم المنتج بالصورة"))}
                {efield("barcode", t("lib.barcodePh", "باركود (اختياري)"), undefined, true)}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {efield("company", t("lib.companyPh", "الشركة"), "lib-companies")}
              {efield("kind", t("libm.kindPh"), "lib-kinds")}
              {efield("agency", t("libm.agencyPh"), "lib-agencies")}
              {efield("section", t("libm.sectionPh"), "lib-sections")}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel", "Cancel")}</Button>
              <Button size="sm" loading={busy} disabled={!ef.name.trim()} onClick={() => void saveEdit()} data-libedit-save>{t("libm.save")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  if (!clinic) return body;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-cliniclibrary>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Images size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("libm.pageTitle")}</h1>
          <p className="text-sm text-ink-subtle">{t("libm.pageSub")}</p>
        </div>
        <Link to="/photos" onClick={() => playTap()} data-libback
          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink-muted transition hover:text-ink">
          <Camera size={15} /> {t("libm.backPhotos")}
        </Link>
      </div>
      {body}
    </div>
  );
}
