// ============================================================================
// إدارة مكتبة الصور (0175) — تبويب بلوحة المنصّة، للمشغّل وحده.
//
// الحارس الحقيقي بالقاعدة (سياسات is_platform_admin على الجدول ومجلد
// library/ بالمخزن) — هذه الشاشة واجهته لا بديله. الحذف بلا نافذة متصفح
// (قاعدة المشروع): الضغطة الأولى تقلب الصف لشريط تأكيدٍ يعرض كم منتجاً
// بكل العيادات يستعمل الصورة، والقرار بعد رؤية الرقم. حذفُ صورةٍ مستعملة
// لا يمسّ منتجات العيادات — مسارُهم يعلّق والبطاقة تسقط لرمز الفئة.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { prepareUpload, type PreparedUpload } from "@/lib/image";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError, describeUploadError } from "@/lib/errors";
import { cn, searchable, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import type { LibraryImage } from "@/types";

export function ImageLibraryManager() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<LibraryImage[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", company: "", section: "", barcode: "" });
  const [photo, setPhoto] = useState<PreparedUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** الصف بوضع تأكيد الحذف + عدّة الاستعمال المقروءة من الخادم. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const load = () => { void repo.listImageLibrary().then(setRows).catch((e) => toast.error(describeDbError(e, t))); };
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
      await repo.createLibraryImage({ name: f.name, company: f.company, section: f.section, barcode: f.barcode }, photo);
      playSuccess();
      toast.success(t("lib.added", "انضافت للمكتبة"));
      setF({ name: "", company: "", section: "", barcode: "" });
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

  const shown = useMemo(() => {
    const ql = searchable(q);
    return rows.filter((r) => !ql || searchable(r.name).includes(ql) || searchable(r.company ?? "").includes(ql) || searchable(r.section ?? "").includes(ql));
  }, [rows, q]);

  /** التجميع شركة ← صنف — التقسيم الذي طلبه المالك حرفياً. */
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, LibraryImage[]>>();
    for (const r of shown) {
      const c = r.company || t("lib.noCompany", "بلا شركة");
      const s = r.section || t("lib.noSection", "بلا صنف");
      if (!m.has(c)) m.set(c, new Map());
      const sm = m.get(c) as Map<string, LibraryImage[]>;
      sm.set(s, [...(sm.get(s) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown, t]);

  return (
    <div className="space-y-4" data-libmanager>
      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-extrabold text-ink">{t("lib.addTitle", "أضف صورة للمكتبة")}</h3>
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }}
            className={cn("grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border transition",
              photo ? "border-brand-400" : "border-dashed border-line-strong text-ink-subtle hover:border-brand-300")}>
            {photo ? <img src={photo.dataUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} />}
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("lib.namePh", "اسم المنتج بالصورة")} />
            <input className="input" dir="ltr" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} placeholder={t("lib.barcodePh", "باركود (اختياري)")} />
            <input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder={t("lib.companyPh", "الشركة")} list="lib-companies" />
            <input className="input" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} placeholder={t("lib.sectionPh", "الصنف")} list="lib-sections" />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void pick(fl); e.target.value = ""; }} />
        </div>
        {/* الشركات والأصناف القائمة تُقترح كتابةً — تقسيمٌ متّسق بلا جدول جديد. */}
        <datalist id="lib-companies">{[...new Set(rows.map((r) => r.company).filter(Boolean))].map((c) => <option key={c as string} value={c as string} />)}</datalist>
        <datalist id="lib-sections">{[...new Set(rows.map((r) => r.section).filter(Boolean))].map((s) => <option key={s as string} value={s as string} />)}</datalist>
        <Button size="sm" loading={busy} disabled={!f.name.trim() || !photo} leftIcon={<ImagePlus size={15} />} onClick={() => void add()} data-libadd>
          {t("lib.addGo", "أضفها")}
        </Button>
      </div>

      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("lib.searchPh", "دوّر بالاسم أو الشركة أو الصنف…")} />

      {grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-subtle">
          {t("lib.emptyAdmin", "المكتبة فارغة — أول صورة ترفعها تظهر لكل العيادات بمنتقي «اختر من المكتبة».")}
        </p>
      ) : grouped.map(([companyName, sections]) => (
        <section key={companyName} className="space-y-2">
          <h3 className="text-sm font-extrabold text-ink">{companyName}</h3>
          {[...sections.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sectionName, items]) => (
            <div key={sectionName} className="card p-3">
              <p className="mb-2 text-2xs font-bold text-ink-subtle">{sectionName} · {formatNum(items.length)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {items.map((r) => (
                  <div key={r.id} className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-1">
                    <img src={productImageUrl(r.path) ?? undefined} alt="" loading="lazy"
                      className="aspect-square w-full bg-surface-2 object-cover"
                      onError={(e) => { e.currentTarget.hidden = true; }} />
                    <span className="line-clamp-2 p-1.5 text-2xs font-bold leading-snug text-ink">{r.name}</span>
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
      ))}
    </div>
  );
}
